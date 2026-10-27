const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function validateFeatureBaseURL(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Feature base URL must use HTTP or HTTPS')
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname))
    throw new Error('Feature base URL must point to a loopback host')
  return url.toString()
}

export function assertAcceptedTestsUnchanged(
  files: { accepted: string; current: string }[],
): void {
  if (files.some(({ accepted, current }) => accepted !== current)) {
    throw new Error(
      'Accepted E2E tests are immutable; restore the accepted files',
    )
  }
}

export const featureGrep = (tag: string): string =>
  `(^|\\s)${escapeRegex(tag)}(\\s|$)`

export function selectFeatureTests(
  listOutput: string,
  id: string,
  tag: string,
): string[] {
  if (tag !== `@feature-${id}`)
    throw new Error(`Feature ${id} tag must be exactly @feature-${id}`)

  const tests = listOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\[[^\]]+\]\s+›\s+/.test(line))
  if (tests.length === 0) throw new Error(`No tests selected for feature ${id}`)
  return tests
}
