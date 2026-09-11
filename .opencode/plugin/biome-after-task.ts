import type { Plugin } from '@opencode-ai/plugin'

const followUp = `Run the repository's Biome validation now. First run \`pnpm exec biome check .\` and inspect every diagnostic. Address each issue intentionally: understand whether it is caused by this task or is pre-existing, make the smallest correct fix for actionable issues, and explain any issue that should deliberately remain unresolved. Do not bypass diagnostics with suppressions, ignores, or weaker configuration unless that is the intended fix.

Once the check is clean, run \`pnpm exec biome format --write .\`, then rerun \`pnpm exec biome check .\` to verify the final result. Report the commands, changes, and outcome.`

export default (async ({ client, directory }) => {
  const pendingSessions = new Set<string>()

  return {
    'chat.message': async (input, output) => {
      const isFollowUp = output.parts.some(
        (part) => part.type === 'text' && part.text === followUp,
      )

      if (!isFollowUp) {
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

      await client.session.promptAsync({
        path: { id: event.properties.sessionID },
        query: { directory },
        body: { parts: [{ type: 'text', text: followUp }] },
      })
    },
  }
}) satisfies Plugin
