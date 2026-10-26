import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Plugin } from '@opencode/plugin'
import {
  matchRetryAnswer,
  type RetryOption,
  retryChoices,
} from '../../trust-pipeline/engine/retry'
import {
  decideStartup,
  type StartupStatus,
  skipsTrustPipeline,
  startupBanner,
  statusAfterDoctor,
} from '../../trust-pipeline/engine/startup'

const execFileAsync = promisify(execFile)

const AUTOMATIC_ATTEMPTS = 3

// The option list the plugin offered, stored alongside the session state so an
// answer is matched against what was actually asked, never re-derived.
type RetryState = {
  spent: number
  remaining: number
  options: RetryOption[]
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

const runCommand = async (args: string[], directory: string) => {
  try {
    const { stdout, stderr } = await execFileAsync('pnpm', args, {
      cwd: directory,
      maxBuffer: 32 * 1024 * 1024,
    })
    return { ok: true, output: `${stdout}${stderr}` }
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string }
    return { ok: false, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` }
  }
}

/** Full pipeline: after a task, and only then. */
const runVerify = (directory: string) => runCommand(['verify'], directory)

/** Fast preflight: tools and credentials this machine needs to run verify. */
const runDoctor = (directory: string) =>
  runCommand(['pipeline:doctor'], directory)

const stateKey = (sessionID: string) => `pipeline-retry:${sessionID}`
const startupKey = (sessionID: string) => `pipeline-startup:${sessionID}`

type StartupState = { status: StartupStatus; output?: string }

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

// Runs the pipeline after a task. Green resets the session; red spends one
// automatic attempt, and once none remain the agent is told to ask the user.
const gateSession = async (
  ctx: Plugin.Context,
  sessionID: string,
  previousStatus: string | null,
  currentStatus: string | null,
): Promise<void> => {
  // Product phase: no trust pipeline. Skip for the product-dev agent (and an
  // explicit opt-out env var). See docs/verification-first/.
  if (process.env.OPENCODE_PRODUCT_MODE === '1') return
  try {
    const session = await ctx.session.get({ sessionID })
    if (session?.agent === 'product-dev') return
  } catch {
    // Fall through to the normal gate if the session cannot be read.
  }

  if (
    previousStatus !== null &&
    currentStatus !== null &&
    previousStatus === currentStatus
  ) {
    return
  }

  const { ok, output } = await runVerify(ctx.location.directory)
  if (ok) {
    await ctx.storage.remove(stateKey(sessionID))
    return
  }

  const state = await loadState(ctx, sessionID)
  const remaining = Math.max(state.remaining - 1, 0)
  const options: RetryOption[] = remaining > 0 ? [] : retryChoices(state.spent)
  await saveState(ctx, sessionID, { spent: state.spent, remaining, options })
  await ctx.session.prompt({
    sessionID,
    text:
      remaining > 0
        ? `\`pnpm verify\` failed. Fix the reported failures intentionally — no suppressions, ignores, or weaker configuration. Do not run the pipeline yourself; it runs again automatically when you stop. ${remaining} automatic attempt${remaining === 1 ? '' : 's'} remain before you must ask the user.\n\n${output.slice(-2000).trim()}`
        : `\`pnpm verify\` is still failing and the automatic retry budget is exhausted. Stop working now and ask the user what to do next with the \`question\` tool, offering exactly these options in this order: ${options.map((option) => `"${option.label}"`).join(', ')}. Do not run the pipeline yourself.`,
  })
}

// The plugin cannot call the `question` tool, so it watches the answer the
// agent collects and matches it (trimmed, exact) against the option list it
// stored when it asked: a granted budget advances the ladder, other
// instructions do not, and an unmatched answer is a no-op.
// shortcut: assumes the question tool's result metadata carries `answers` as
// string[][]; if that shape changes the ladder stops shrinking (the gate still
// blocks). Upgrade by subscribing to the question.replied event instead.
const applyAnswer = async (
  ctx: Plugin.Context,
  sessionID: string,
  metadata: unknown,
): Promise<void> => {
  const state = await loadState(ctx, sessionID)
  if (state.remaining > 0) return

  const answers = (metadata as { answers?: unknown } | undefined)?.answers
  const [first] = Array.isArray(answers) ? answers : []
  const answer =
    Array.isArray(first) && typeof first[0] === 'string' ? first[0] : undefined
  if (answer === undefined) return

  const option = matchRetryAnswer(state.options, answer)
  if (option === undefined) return

  if (option.attempts === null) {
    await saveState(ctx, sessionID, { ...state, remaining: 1, options: [] })
    return
  }
  await saveState(ctx, sessionID, {
    spent: state.spent + 1,
    remaining: option.attempts,
    options: [],
  })
}

/**
 * Startup admission: the doctor runs once per session. A green result admits
 * every later prompt without rechecking; a red one splices a banner onto each
 * prompt until `/pipeline-repair` fixes it. Never re-runs the doctor per prompt.
 */
async function handlePrompt(
  ctx: Plugin.Context,
  event: { sessionID: string; prompt: { text: string } },
  directory: string,
): Promise<void> {
  if (await sessionSkipsPipeline(ctx, event.sessionID)) return

  const startup = await loadStartupState(ctx, event.sessionID)
  const decision = decideStartup(startup?.status)

  if (decision.kind === 'blocked') {
    event.prompt.text = `${startupBanner(startup?.output ?? '')}\n\n${event.prompt.text}`
    return
  }
  if (decision.kind === 'doctor') {
    const result = await runDoctor(directory)
    const next = statusAfterDoctor(result.ok, result.output)
    await saveStartupState(ctx, event.sessionID, next)
    if (next.status === 'blocked') {
      event.prompt.text = `${startupBanner(result.output)}\n\n${event.prompt.text}`
    }
  }
}

/** Runs the doctor and reports back, so a fixed machine unlocks the session. */
async function repairStartup(
  ctx: Plugin.Context,
  sessionID: string,
  directory: string,
): Promise<void> {
  const result = await runDoctor(directory)
  const next = statusAfterDoctor(result.ok, result.output)
  await saveStartupState(ctx, sessionID, next)
  await ctx.session.synthetic({
    sessionID,
    text: result.ok
      ? 'Startup check passed. Please resend the development task that was blocked.'
      : `Startup check still failing:\n\n${result.output.slice(-2000).trim()}`,
  })
}

export default {
  id: 'pipeline-after-task',
  async setup(ctx: Plugin.Context) {
    const directory = ctx.location.directory
    const pendingSessions = new Set<string>()
    const worktreeStatusBySession = new Map<string, string | null>()
    const controller = new AbortController()

    await ctx.command.transform((editor) => {
      editor.add({
        name: 'pipeline-repair',
        description: 'Recheck this machine with doctor and unlock development',
        execute: async ({ sessionID }) =>
          repairStartup(ctx, sessionID, directory),
      })
    })

    await ctx.session.hook('prompt', async (event) => {
      await handlePrompt(ctx, event, directory)
      worktreeStatusBySession.set(
        event.sessionID,
        await getWorktreeStatus(directory),
      )
      pendingSessions.add(event.sessionID)
    })

    await ctx.tool.hook('execute.after', async (event) => {
      if (event.tool !== 'question' || event.status !== 'completed') return
      await applyAnswer(ctx, event.sessionID, event.result.metadata)
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

        const sessionID = event.data.sessionID
        const previousStatus = worktreeStatusBySession.get(sessionID)
        worktreeStatusBySession.delete(sessionID)
        await gateSession(
          ctx,
          sessionID,
          previousStatus ?? null,
          await getWorktreeStatus(directory),
        )
      }
    })()

    return () => controller.abort()
  },
} satisfies Plugin.Plugin
