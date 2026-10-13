# Trust Pipeline & Development Method — Design

- **Date:** 2026-10-13
- **Status:** Draft for review
- **Supersedes:** `2026-10-09-architecture-guardrails-design.md`
- **Scope:** Repo-wide, **local only** (not CI/CD)

## Context and goal

We want agent-generated code to be safe to **read and merge** without
re-reviewing every mechanical detail. This is achieved by a **local pipeline**
that gates the agent: fast, deterministic checks run in a fixed fail-fast order,
and the agent cannot finish a task while the pipeline is red. Judgment calls a
machine cannot make (is this test meaningful? does this introduce a new
architectural pattern?) are handled by a final review layer.

The whole thing is structured **as-if-portable**: a generic engine plus a
project-specific config, so it can be lifted into a reusable skill later without
untangling it from app code. That split is a general development principle we
adopt everywhere, not just for this pipeline.

### Success criteria

- `pnpm verify` runs the entire pipeline locally, in a fixed order, failing fast.
- The agent cannot complete a task while the pipeline is red, with **bounded**
  retries so it cannot burn unlimited tokens.
- One test runner (Vitest), coverage floor enforced, test *meaning* judged.
- A new architectural pattern is detected and the user is asked whether to
  define it.
- No pipeline logic is tangled into `server/`, `admin/`, or `packages/` code.

### Non-goals

- CI/CD gating. This is local; git tracks work, CI/CD deploys.
- Behavioral malicious-package detection (Socket.dev). Skipped.
- 100% coverage.

## General principle: structure as-if-portable

Every feature separates a **generic engine/method** from **project-specific
rules/config**, with app code free of infrastructure concerns. The trust
pipeline is the first deliberate instance. Applying this consistently makes
later extraction mechanical rather than a refactor.

## Pipeline order (fail-fast)

```
1. pnpm audit            instant dependency CVE gate (keep; cheapest)
2. lint + structure      Biome + AST size/nesting
3. pnpm test             Vitest: unit (edge cases) + integration (system)
4. scans                 osv-scanner, opengrep, jscpd, scorecard; ts-arch suite
5. review                Jev judgment
```

Runs locally. Stages 1–4 are deterministic and **block the agent**; stage 5 is a
report that informs fixes. Enforcement is via the `biome-after-task` plugin
(renamed to the pipeline runner), with the bounded-retry policy below.

## Test runner: Vitest everywhere

Migrate `server`, `admin`, and `blog` (renamed from `public`) from `tsx --test`
to **Vitest**. One runner, two environments via Vitest projects: `node` for
`server`/`packages`, `jsdom` (+ React Testing Library) for `admin` and `blog`.
Coverage via `@vitest/coverage-v8`.

Rationale: admin already runs on Vite; one runner removes a second mental model;
coverage thresholds are built in and more mature than Node's experimental
`--experimental-test-coverage`.

## Coverage

- **Floor: 80% lines and branches**, enforced by Vitest.
- Exclude genuinely untestable code per-file in config (I/O boundaries,
  generated code, migrations, the pipeline engine itself). Never lower the global
  floor to silence one hard file.
- Inline ignores are allowed **with a reason** (e.g. `/* v8 ignore next -- network boundary */`).
- Coverage is a **floor, not a goal**. It proves code ran, not that tests assert
  behavior. **Jev judges test meaning**; coverage does not.

## Deterministic checks

| Stage | Tool | License | Rule |
|---|---|---|---|
| audit | `pnpm audit` | — | known CVEs, instant |
| lint | Biome | MIT | lineWidth 80; `noExcessiveCognitiveComplexity` = 20; `noExcessiveNestedCallbacks` |
| structure | AST check | in-repo | file ≤ 400 LOC; function ≤ 80 LOC; nesting ≤ 4 |
| structure | GritQL plugin | in-repo | no JSX produced inside `useMemo`/`useCallback` (admin, blog) |
| test | Vitest | MIT | coverage floor 80% |
| scans | osv-scanner | Apache-2.0 | lockfile CVEs + known-malicious feed |
| scans | Opengrep | LGPL-2.1 | SAST (fully-OSS rules, unlike Semgrep CE's registry rules) |
| scans | jscpd | MIT | duplication `--threshold`; SARIF |
| scans | OpenSSF Scorecard | Apache-2.0 | dependency/project health |
| scans | ts-arch | MIT | architectural pattern conformance + cycle-free |

Generated code (`*.generated.ts`, `admin/app/__generated__/**`) is excluded from
structure and dependency checks.

## Development method (process)

These are process rules — a linter cannot see test ordering or intent. They live
in the rulebook/`AGENTS.md`, are reinforced by the existing superpowers skills,
and are judged by Jev.

- **TDD for new functions** (reuse the `test-driven-development` skill; do not
  rebuild it).
- After a feature is confirmed working, add **integration ("happy path-ish")**
  tests that exercise a whole system.
- **Units keep edge cases only.** A happy-path unit is promoted to an integration
  test and removed from units. (This reconciles TDD-first with "no happy-path
  units": the TDD test drives the function; if it is a happy path, it moves up.)
- **Meaningful tests, not many** — YAGNI applies to tests.
- **Coverage floor** as above.

### ts-arch as a living pattern suite

ts-arch rules encode architectural **patterns** (resolver→service→db is pattern
#1). At feature start, the agent checks the intent/diff for a **new** pattern:
if one appears with no ts-arch coverage, it **asks the user** whether to define a
new pattern. POCs/throwaways are arch-less; anything moving forward gets suite
coverage. The suite also runs as a regression gate in the pipeline.

## Review layer (Jev)

A local script that turns the diff into typed judgments (TypeSafe Jev, via the
`typesafe-ai` skill). Rubric covers:

- **Structure:** function does one thing; abstraction with a single caller;
  micro-helper chains.
- **Frontend:** compose components; no JSX in memo; hook reuse; >3-things
  extraction; server-state vs local/context.
- **Methodology:** does this diff add a happy-path *unit* test (should be
  integration)? is a new behavior tested before implementation? are assertions
  meaningful or merely executing lines?
- **Architecture:** does this introduce a pattern with no ts-arch coverage?

Output: `question: answer (confidence)` lines + verdict. **Verdict fails if any
question fails with high confidence.** Report-only in effect; the agent uses it
to fix, and the bounded retry still applies.

## Bounded-retry enforcement

- The pipeline runs after a task. On red, the agent fixes and re-runs.
- **Initial budget: 3 automatic attempts.** On exhaustion, the agent stops and
  asks the user via the native **`question` tool** (multiple choice):

  > Pipeline still failing. How do you want to proceed?
  > - **Try again (3 attempts)** — decrements to **(2 attempts)**, then **(1 attempt)**, then stays at **(1 attempt)** forever
  > - **Give other instructions** — always present; the user types guidance the agent applies before the next run

- The "Try again" grant is the ladder **3 → 2 → 1 → 1 → 1 …** (never reaches 0).
- Attempt count is per-session, held by the pipeline runner. No infinite loop.
- "Give other instructions" does not reset the ladder; the agent applies the
  guidance and runs again within the current grant.

## Repo structure

Conventional monorepo split, adopted before the pipeline so all paths are final:

```
apps/         # deployable applications
  admin/
  blog/       # renamed from public/ (the public blog site)
  server/     # GraphQL API
packages/     # shared libraries (existing: ui, graphql-runtime)
trust-pipeline/   # the engine (below)
```

The rename/move is mechanical: `pnpm-workspace.yaml`, the root `Dockerfile`
(two `COPY` lines + one `--filter public`), `docker/ecosystem.config.cjs` (pm2
name + `cwd`), and `public/package.json`'s name. `docker/Caddyfile` routes by
port and workspace imports use package names, so neither changes. The standalone
`admin/Dockerfile` and `public/Dockerfile` are unused (Fly uses the root
`Dockerfile`) and are deleted.

## Layout (as-if-portable, not tangled in app code)

```
trust-pipeline/            # top-level (not under tools/), so it is free-standing
  engine/     # generic: orchestration, check wrappers, retry, Jev harness, verdict, templates
  project/    # this repo only: config (thresholds/globs/commands), ts-arch patterns, Jev rubric
```

Moving the directory later is trivial, so a top-level `trust-pipeline/` keeps it
visually separate from app code without a `tools/` grab-bag.

- `pnpm verify` invokes the engine with `project/` config.
- The engine imports nothing from `server/`, `admin/`, or `packages/`.
- `AGENTS.md` and `docs/architecture.md` are thin project files pointing at the
  method; templates for them live under `engine/templates/`.
- The `biome-after-task` plugin becomes the local pipeline runner.

## Portability / extraction (later phase)

Once proven here: extract `engine/` + templates into a `trust-pipeline` OpenCode
**skill** (installable via `npx skills add`), with an **`upgrade`** command that
pulls the latest engine and re-prompts project-specific decisions, plus a library
of migration prompts from other projects. Build concretely here first; do not
build the framework speculatively.

## Testing the pipeline itself

Each check gets a passing and a failing fixture (Vitest). The retry/back-off
logic and the Jev verdict logic are unit-tested directly.

## Resolved decisions

- Vitest for the whole project.
- Coverage floor 80% lines+branches, per-file excludes, meaning judged by Jev.
- Back-off 3 → +2 → +1, then ask each time.
- Local-only; no CI/CD gating.
- Skip Socket.dev; keep both `audit` (instant) and `osv-scanner` (precise).
- GraphQL client layer is Relay.
- Cognitive complexity (Biome) = 20; line 80 / function 80 / file 400 / nesting 4.
- Build here first, extract to a skill later.
