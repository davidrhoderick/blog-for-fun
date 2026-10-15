# engine — the portable half

The generic trust pipeline. It orchestrates stages in a fixed, fail-fast order,
runs a preflight `doctor`, drives a bounded retry ladder, and hosts the Jev
review harness, verdict, and doc templates. Nothing here knows about a specific
project: every value arrives through `ProjectConfig` (see `config.ts`).

## Contract

- **Belongs here:** orchestration (`run.ts`), stage wrappers (`stages/`), the
  dependency check (`doctor.ts`), the retry ladder (`retry.ts`), the port probe
  (`port.ts`), the AST helpers (`checks/`), the Jev harness and verdict
  (`review/`), and `templates/`.
- **Does not belong here:** thresholds, commands, ignore globs, architecture
  patterns, scanner rules, or the rubric. Those live in `../project/`.
- **Never imports app code** — nothing from `apps/`, `packages/`, or the app
  workspace packages (`server`, `admin`, `blog`, `@blog/*`). `boundary.test.ts`
  enforces this by scanning every file here for such imports.

## Entry point

`run.ts` builds the enabled stages from a `ProjectConfig`, runs `doctor` first,
then each stage in order, stopping at the first failure. It is the one place the
engine reads `../project/config`; that import is the seam extraction replaces
with the new project's config.

## Self-provisioning

`doctor.ts` exports `doctor(cfg)`: it checks every tool the enabled stages call
and returns an install hint for each missing one. The extracted skill calls this
same command to verify and provision a fresh machine.
