/** A `fail` at or above this confidence fails the review. */
export const HIGH_CONFIDENCE = 0.8

export type RubricAnswer = {
  question: string
  answer: 'pass' | 'fail'
  confidence: number
}

/**
 * A high-confidence failure fails; a low-confidence one is left for the agent
 * (and, later, a reasoning model) to escalate.
 */
export function verdict(answers: RubricAnswer[]): {
  pass: boolean
  failures: RubricAnswer[]
} {
  const failures = answers.filter(
    (a) => a.answer === 'fail' && a.confidence >= HIGH_CONFIDENCE,
  )
  return { pass: failures.length === 0, failures }
}
