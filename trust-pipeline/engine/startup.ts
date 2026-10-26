// Pure startup-gate decisions, unit-tested. The plugin wires these to storage,
// the `doctor` preflight, and the OpenCode prompt hook; the logic itself is
// host-free. Full `pnpm verify` stays after a task (and in CI); startup only
// checks that this machine can run the pipeline at all.

export type StartupStatus = 'ready' | 'blocked'

export type StartupDecision =
  | { kind: 'admit' }
  | { kind: 'doctor' }
  | { kind: 'blocked' }

/**
 * What prompt admission should do given the session's startup status.
 * - `ready` — already checked this session: admit, never recheck.
 * - `undefined` — first prompt of the session: run the doctor once.
 * - `blocked` — already know it is broken: show the banner, do not recheck.
 *   `/pipeline-repair` is the only way back to `ready`.
 */
export function decideStartup(
  status: StartupStatus | undefined,
): StartupDecision {
  if (status === 'ready') return { kind: 'admit' }
  if (status === undefined) return { kind: 'doctor' }
  return { kind: 'blocked' }
}

/** A passing doctor unlocks the session; a failing one blocks and remembers why. */
export function statusAfterDoctor(
  ok: boolean,
  output: string,
): { status: StartupStatus; output?: string } {
  return ok ? { status: 'ready' } : { status: 'blocked', output }
}

/** The banner spliced onto a blocked prompt: loud, specific, actionable. */
export function startupBanner(output: string): string {
  return [
    '⛔ STARTUP CHECK FAILED ⛔',
    '',
    'This machine cannot run the trust pipeline, so no development work was started.',
    'Fix the problems below, then run /pipeline-repair to recheck.',
    '',
    output.slice(-2000).trim(),
  ].join('\n')
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
