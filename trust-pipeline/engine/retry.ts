// The shrinking ladder of "Try again" grants offered once budgets are spent.
// 0 spent → [3, 2, 1]; 1 → [2, 1]; 2+ → [1]. Never empty, never below 1.
const GRANTS = [3, 2, 1]

export function retryOptions(spent: number): number[] {
  const index = Math.min(Math.max(spent, 0), GRANTS.length - 1)
  return GRANTS.slice(index)
}
