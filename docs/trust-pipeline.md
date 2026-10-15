# The trust pipeline

A local, fail-fast gate that runs before a task is called done. It is built
**as-if-portable**: a generic engine plus this repo's config, so the engine can
be lifted into a reusable OpenCode skill later without a refactor. This document
is the method in broad strokes; the two READMEs pin the contracts:

- [`trust-pipeline/engine/README.md`](../trust-pipeline/engine/README.md) — the
  reusable half.
- [`trust-pipeline/project/README.md`](../trust-pipeline/project/README.md) —
  this repo's half.

## The method

1. **One command, one verdict.** `pnpm verify` runs every stage and exits
   non-zero on the first failure. There is no CI gate — the pipeline runs
   locally, on the task, before the agent finishes.
2. **Fail fast, in a fixed order.** A later stage never runs when an earlier one
   fails, and the cheap, certain checks run first:
   `audit → lint + structure → typecheck → test → scans → review`.
3. **Deterministic stages block; judgment is labeled.** The first six stages are
   deterministic and must be green. The last, `review`, is a judgment call; its
   failure also blocks, but it is reported as judgment-based, not certain.
4. **Preflight, don't assume.** Before any stage, `doctor` checks every tool the
   enabled stages will call and fails with copy-pasteable install hints.
5. **Bound the retries.** A red pipeline triggers a bounded retry loop: a few
   automatic attempts, then the agent stops and asks the human. A green run
   resets the count.

## The engine/project split

| | `engine/` | `project/` |
|---|---|---|
| Holds | orchestration, stage wrappers, `doctor`, retry ladder, Jev harness and verdict, templates | thresholds, commands, ignore globs, tsarch patterns, Opengrep rules, rubric |
| Changes | rarely; generic across projects | every project, on purpose |
| Imports | Node, its own package's deps, and `project/` config | may import `engine/` |
| Never imports | app code (`apps/`, `packages/`, workspace package names) | — |

The rule is one-way: **`engine/` never imports app code.** A test
(`trust-pipeline/engine/boundary.test.ts`) scans every file under `engine/` for
such imports and fails if one appears, so extraction stays mechanical. `project/`
supplies the values through `ProjectConfig`; the engine supplies the behaviour.

## Self-provisioning (the extraction path)

The extracted skill is **self-provisioning**: it calls the engine's `doctor`
command to check the external tools (`osv-scanner`, `opengrep` + `cosign`,
`jscpd`, `tsarch`, `node`/`pnpm`, `biome`) and installs the missing ones before
running. `doctor` is already the pipeline's preflight, so one check serves both a
fresh machine and the skill. Extraction moves `engine/` and its templates out
as-is; `project/` is re-created per project.

## Project specifics (this repo)

- **Config** — `trust-pipeline/project/config.ts` sets the stage commands, the
  size/nesting thresholds, ignore globs, the repo root, and the dev-server port.
- **Architecture patterns** — `project/patterns/resolvers.test.ts` (tsarch):
  resolvers ↛ resolvers, resolvers ↛ `db`, and a cycle-free server graph.
- **Security rules** — `project/rules/security.yaml` (Opengrep).
- **Judgment rubric** — `project/rubric.md`, the pass/fail questions Jev answers
  per changed symbol plus one diff-level question.
- **Scanner configs** — `project/jscpd.json`, `project/osv-scanner.toml`.
- **Rulebooks** — `docs/architecture.md` and `docs/testing.md` are this repo's;
  the generic templates live under `engine/templates/`.
