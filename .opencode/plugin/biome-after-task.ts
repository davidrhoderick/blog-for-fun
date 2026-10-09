import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Plugin } from '@opencode/plugin'

const execFileAsync = promisify(execFile)

const followUp = `Run \`pnpm exec biome check .\`. Fix every diagnostic intentionally, then run \`pnpm exec biome format --write .\` and rerun \`pnpm exec biome check .\`. Do not use suppressions, ignores, or weaker configuration to bypass diagnostics. Reply with exactly one concise sentence stating the final outcome; do not include headings, command lists, progress updates, or explanations.`

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

export default {
  id: 'biome-after-task',
  async setup(ctx: Plugin.Context) {
    const directory = ctx.location.directory
    const pendingSessions = new Set<string>()
    const worktreeStatusBySession = new Map<string, string | null>()
    const controller = new AbortController()

    await ctx.session.hook('prompt', async (event) => {
      if (event.prompt.text === followUp) {
        return
      }

      worktreeStatusBySession.set(
        event.sessionID,
        await getWorktreeStatus(directory),
      )
      pendingSessions.add(event.sessionID)
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

        const previousStatus = worktreeStatusBySession.get(event.data.sessionID)
        worktreeStatusBySession.delete(event.data.sessionID)
        const currentStatus = await getWorktreeStatus(directory)

        if (
          previousStatus !== null &&
          currentStatus !== null &&
          previousStatus === currentStatus
        ) {
          continue
        }

        await ctx.session.prompt({
          sessionID: event.data.sessionID,
          text: followUp,
        })
      }
    })()

    return () => controller.abort()
  },
} satisfies Plugin.Plugin
