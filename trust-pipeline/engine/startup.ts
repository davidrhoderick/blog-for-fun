// Pure startup-gate decisions, unit-tested. The plugin wires these to storage,
// `pnpm verify`, and the OpenCode prompt hook; the logic itself is host-free.

export type StartupStatus = 'ready' | 'blocked'

export type StartupDecision =
  | { kind: 'block' }
  | { kind: 'verify' }
  | { kind: 'admit' }

/**
 * Decide what a prompt admission should do given the session's startup status.
 * - `ready` sessions are admitted and re-verified only on idle.
 * - `blocked`/`repairing` sessions stay blocked: `/pipeline-repair` is the only
 *   way back to `ready`.
 * - an undefined status means the session has never been checked → verify.
 */
export function decideStartup(
  status: StartupStatus | undefined,
): StartupDecision {
  if (status === 'ready') return { kind: 'admit' }
  if (status === undefined) return { kind: 'verify' }
  return { kind: 'block' }
}

/**
 * After a startup verification run, determine the next status. A passing run
 * unlocks the session; a failing run blocks it and remembers the output.
 */
export function statusAfterVerify(
  ok: boolean,
  output: string,
): { status: StartupStatus; output?: string } {
  return ok ? { status: 'ready' } : { status: 'blocked', output }
}

/**
 * The product phase runs without the trust pipeline: the `product-dev` agent
 * and an explicit `OPENCODE_PRODUCT_MODE=1` opt-out both skip it. See
 * docs/verification-first/.
 */
export function skipsTrustPipeline(
  env: Record<string, string | undefined>,
  agent: string | undefined,
): boolean {
  return env.OPENCODE_PRODUCT_MODE === '1' || agent === 'product-dev'
}
