import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Plugin } from '@opencode-ai/plugin'

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

export default (async ({ client, directory }) => {
  const pendingSessions = new Set<string>()
  const worktreeStatusBySession = new Map<string, string | null>()

  return {
    'chat.message': async (input, output) => {
      const isFollowUp = output.parts.some(
        (part) => part.type === 'text' && part.text === followUp,
      )

      if (!isFollowUp) {
        worktreeStatusBySession.set(
          input.sessionID,
          await getWorktreeStatus(directory),
        )
        pendingSessions.add(input.sessionID)
      }
    },
    event: async ({ event }) => {
      if (
        event.type !== 'session.idle' ||
        !pendingSessions.delete(event.properties.sessionID)
      ) {
        return
      }

      const previousStatus = worktreeStatusBySession.get(
        event.properties.sessionID,
      )
      worktreeStatusBySession.delete(event.properties.sessionID)
      const currentStatus = await getWorktreeStatus(directory)

      if (
        previousStatus !== null &&
        currentStatus !== null &&
        previousStatus === currentStatus
      ) {
        return
      }

      await client.session.promptAsync({
        path: { id: event.properties.sessionID },
        query: { directory },
        body: { parts: [{ type: 'text', text: followUp }] },
      })
    },
  }
}) satisfies Plugin
