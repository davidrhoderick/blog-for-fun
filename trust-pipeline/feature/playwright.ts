const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
