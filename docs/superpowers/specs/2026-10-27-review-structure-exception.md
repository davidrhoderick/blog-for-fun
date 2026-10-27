# Review rubric: structural helper exception

## Goal

Keep the deterministic 80-line function limit without making the judgment rubric
reject a cohesive helper split that is necessary to meet it.

## Scope

- Update only the structure-abstraction question in
  `trust-pipeline/project/rubric.md` and the matching human-readable rule in
  `docs/architecture.md`.
- Permit a single-caller helper only when it is needed to meet a deterministic
  structure limit and names a cohesive operation or phase boundary.
- Continue rejecting mechanical splits, wrappers, and helper chains that do not
  improve responsibility or satisfy a deterministic limit.
- Add a regression assertion to the shipped-rubric test so the exception remains
  present in the parsed rule.

## Non-goals

- Do not raise or remove function-length/nesting thresholds.
- Do not allow single-use abstractions generally.
- Do not change the feature CLI or other production code in this rule PR.

## Verification

Run the trust pipeline and trust-pipeline Vitest suite. Then rebase the separate
feature branch and rerun `pnpm verify` against its implementation diff.
