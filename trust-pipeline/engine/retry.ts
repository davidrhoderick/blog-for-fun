// The shrinking ladder of "Try again" grants offered once budgets are spent.
// 0 spent → [3, 2, 1]; 1 → [2, 1]; 2+ → [1]. Never empty, never below 1.
const GRANTS = [3, 2, 1]

export function retryOptions(spent: number): number[] {
  const index = Math.min(Math.max(spent, 0), GRANTS.length - 1)
  return GRANTS.slice(index)
}

// The escape hatch offered alongside the grants. `attempts: null` marks it.
export const OTHER_INSTRUCTIONS = 'Give other instructions'

export type RetryOption = { label: string; attempts: number | null }

// The canonical option list offered when the automatic budget is exhausted: a
// grant per remaining rung, then the escape hatch.
export function retryChoices(spent: number): RetryOption[] {
  return [
    ...retryOptions(spent).map((attempts) => ({
      label: `Try again (${attempts})`,
      attempts,
    })),
    { label: OTHER_INSTRUCTIONS, attempts: null },
  ]
}

// Maps an answer back to the choice it names, by exact trimmed label. An answer
// that matches nothing is a no-op, so free-form text cannot grant a budget.
export function matchRetryAnswer(
  choices: RetryOption[],
  answer: string,
): RetryOption | undefined {
  return choices.find((choice) => choice.label === answer.trim())
}
