import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Plugin } from '@opencode/plugin'
import {
  retryChoices as engineRetryChoices,
  matchRetryAnswer,
  type RetryOption,
} from '../../trust-pipeline/engine/retry'
import {
  decideStartup,
  type StartupStatus,
  skipsTrustPipeline,
  statusAfterVerify,
} from '../../trust-pipeline/engine/startup'

const execFileAsync = promisify(execFile)

const AUTOMATIC_ATTEMPTS = 3

type RetryState = {
  spent: number
  remaining: number
  options: Array<{ label: string; attempts: number | null }>
}

type StartupState = {
  status: StartupStatus
  output?: string
}

const stateKey = (sessionID: string) => `pipeline-retry:${sessionID}`
const startupKey = (sessionID: string) => `pipeline-startup:${sessionID}`

const loadState = async (
  ctx: Plugin.Context,
  sessionID: string,
): Promise<RetryState> => {
  const stored = (await ctx.storage.get(stateKey(sessionID))) as
    | RetryState
    | undefined
  return stored ?? { spent: 0, remaining: AUTOMATIC_ATTEMPTS, options: [] }
}

const saveState = (ctx: Plugin.Context, sessionID: string, state: RetryState) =>
  ctx.storage.set(stateKey(sessionID), state)

const loadStartupState = async (
  ctx: Plugin.Context,
  sessionID: string,
): Promise<StartupState | undefined> =>
  (await ctx.storage.get(startupKey(sessionID))) as StartupState | undefined

const saveStartupState = (
  ctx: Plugin.Context,
  sessionID: string,
  state: StartupState,
) => ctx.storage.set(startupKey(sessionID), state)

const runVerify = async (directory: string) => {
  try {
    const { stdout, stderr } = await execFileAsync('pnpm', ['verify'], {
      cwd: directory,
      maxBuffer: 32 * 1024 * 1024,
    })
    return { ok: true, output: `${stdout}${stderr}` }
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string }
    return { ok: false, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` }
  }
}

const getWorktreeStatus = async (directory: string) => {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: directory,
    })
    return stdout
  } catch {
    return null
  }
}

const startupBanner = (output: string) =>
  '⛔ STARTUP VERIFICATION FAILED ⛔\n\n' +
  'Do NOT proceed with any development work. The local trust pipeline is red.\n' +
  'Fix the issues below, then run /pipeline-repair to recheck.\n\n' +
  output.slice(-2000).trim()

const repairInstructions = (output: string) =>
  'Repair only the startup verification failures below. Do not work on other tasks, ' +
  'suppress findings, add ignores, or weaken checks. Once fixed, stop; verification ' +
  'will run automatically.\n\n' +
  output.slice(-2000).trim()

const retryChoices = (spent: number) =>
  engineRetryChoices(spent) as RetryOption[]

// Product phase: no trust pipeline. Skip for the product-dev agent (and an
// explicit opt-out env var). See docs/verification-first/.
async function sessionSkipsPipeline(
  ctx: Plugin.Context,
  sessionID: string,
): Promise<boolean> {
  if (process.env.OPENCODE_PRODUCT_MODE === '1') return true
  try {
    const session = await ctx.session.get({ sessionID })
    return skipsTrustPipeline(process.env, session?.agent)
  } catch {
    // Fall through to the normal gate if the session cannot be read.
    return false
  }
}

async function handleIdleSession(
  ctx: Plugin.Context,
  sessionID: string,
  directory: string,
  worktreeStatusBySession: Map<string, string | null>,
  _pendingSessions: Set<string>,
): Promise<void> {
  if (await sessionSkipsPipeline(ctx, sessionID)) return

  const previousStatus = worktreeStatusBySession.get(sessionID)
  worktreeStatusBySession.delete(sessionID)
  const currentStatus = await getWorktreeStatus(directory)

  if (
    previousStatus !== null &&
    currentStatus !== null &&
    previousStatus === currentStatus
  ) {
    return
  }

  const { ok, output } = await runVerify(directory)
  if (ok) {
    await ctx.storage.remove(stateKey(sessionID))
    const startup = await loadStartupState(ctx, sessionID)
    if (startup?.status === 'blocked') {
      await saveStartupState(ctx, sessionID, { status: 'ready' })
      await ctx.session.synthetic({
        sessionID,
        text: 'Startup verification passed. Please resend the development task that was blocked.',
      })
    }
    return
  }

  const state = await loadState(ctx, sessionID)
  const remaining = Math.max(state.remaining - 1, 0)
  const options = remaining > 0 ? [] : retryChoices(state.spent)
  await saveState(ctx, sessionID, { spent: state.spent, remaining, options })

  await ctx.session.prompt({
    sessionID,
    text:
      remaining > 0
        ? `\`pnpm verify\` failed. Fix the reported failures intentionally — no suppressions, ignores, or weaker configuration. Do not run the pipeline yourself; it runs again automatically when you stop. ${remaining} automatic attempt${remaining === 1 ? '' : 's'} remain before you must ask the user.\n\n${output.slice(-2000).trim()}`
        : `\`pnpm verify\` is still failing and the automatic retry budget is exhausted. Stop working now and ask the user what to do next with the \`question\` tool, offering exactly these options in this order: ${options.map((option) => `"${option.label}"`).join(', ')}. Do not run the pipeline yourself.`,
  })
}

async function handlePrompt(
  ctx: Plugin.Context,
  event: { sessionID: string; prompt: { text: string } },
  directory: string,
  worktreeStatusBySession: Map<string, string | null>,
  pendingSessions: Set<string>,
): Promise<void> {
  if (await sessionSkipsPipeline(ctx, event.sessionID)) {
    worktreeStatusBySession.set(
      event.sessionID,
      await getWorktreeStatus(directory),
    )
    pendingSessions.add(event.sessionID)
    return
  }

  const startup = await loadStartupState(ctx, event.sessionID)
  const decision = decideStartup(startup?.status)

  if (decision.kind === 'admit') {
    worktreeStatusBySession.set(
      event.sessionID,
      await getWorktreeStatus(directory),
    )
    pendingSessions.add(event.sessionID)
    return
  }

  // decision.kind is 'verify' (unchecked) or 'block' (already blocked): run
  // verify again so a fixed `.env` or lockfile unlocks without a manual reset.
  const result = await runVerify(directory)
  const next = statusAfterVerify(result.ok, result.output)
  await saveStartupState(ctx, event.sessionID, next)

  if (next.status === 'ready') {
    worktreeStatusBySession.set(
      event.sessionID,
      await getWorktreeStatus(directory),
    )
    pendingSessions.add(event.sessionID)
    return
  }

  event.prompt.text = `${startupBanner(result.output)}\n\n${event.prompt.text}`
}

async function registerRepairCommand(
  ctx: Plugin.Context,
  directory: string,
): Promise<void> {
  await ctx.command.transform((editor) => {
    editor.add({
      name: 'pipeline-repair',
      description: 'Repair startup verification blockers before development',
      execute: async ({ sessionID }) => {
        const { ok, output } = await runVerify(directory)
        const next = statusAfterVerify(ok, output)
        await saveStartupState(ctx, sessionID, next)
        if (next.status === 'ready') {
          await ctx.session.synthetic({
            sessionID,
            text: 'Startup verification passed. Please resend your development task.',
          })
          return
        }
        await ctx.session.prompt({
          sessionID,
          text: repairInstructions(output),
        })
      },
    })
  })
}

export default {
  id: 'pipeline-after-task',
  async setup(ctx: Plugin.Context) {
    const directory = ctx.location.directory
    const pendingSessions = new Set<string>()
    const worktreeStatusBySession = new Map<string, string | null>()
    const controller = new AbortController()

    await registerRepairCommand(ctx, directory)

    await ctx.session.hook('prompt', async (event) => {
      await handlePrompt(
        ctx,
        event,
        directory,
        worktreeStatusBySession,
        pendingSessions,
      )
    })

    await ctx.tool.hook('execute.after', async (event) => {
      if (event.tool !== 'question' || event.status !== 'completed') return
      const state = await loadState(ctx, event.sessionID)
      if (state.remaining > 0) return

      const result = event.result as
        | { metadata?: { answers?: unknown } }
        | undefined
      const answers = result?.metadata?.answers
      const [first] = Array.isArray(answers) ? answers : []
      const answer =
        Array.isArray(first) && typeof first[0] === 'string'
          ? first[0]
          : undefined
      if (answer === undefined) return

      const choices = state.options
      const option = matchRetryAnswer(choices, answer)
      if (option === undefined) return

      if (option.attempts === null) {
        await saveState(ctx, event.sessionID, {
          ...state,
          remaining: 1,
          options: [],
        })
        return
      }
      await saveState(ctx, event.sessionID, {
        spent: state.spent + 1,
        remaining: option.attempts,
        options: [],
      })
    })

    void (async () => {
      for await (const event of ctx.event.subscribe({
        signal: controller.signal,
      })) {
        if (
          event.type !== 'session.idle' ||
          !pendingSessions.delete(event.data.sessionID)
        ) {
          continue
        }
        await handleIdleSession(
          ctx,
          event.data.sessionID,
          directory,
          worktreeStatusBySession,
          pendingSessions,
        )
      }
    })()

    return () => controller.abort()
  },
} satisfies Plugin.Plugin
