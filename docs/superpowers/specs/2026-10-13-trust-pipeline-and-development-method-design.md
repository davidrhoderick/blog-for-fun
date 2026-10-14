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
untangling it from app code. The engine is its own workspace package, so its
dependencies and tests travel with it. That split is a general development
principle we adopt everywhere, not just for this pipeline.

### Success criteria

- `pnpm verify` runs the entire pipeline locally, in a fixed order, failing fast.
- The agent cannot complete a task while the pipeline is red, with **bounded**
  retries so it cannot burn unlimited tokens.
- One test runner (Vitest), coverage floor enforced, test *meaning* judged.
- A new architectural pattern is detected and the user is asked whether to
  define it.
- No pipeline logic is tangled into `server/`, `admin/`, or `packages/` code.
- The engine is its own workspace package with its own dependencies and tests,
  so it can be extracted later without untangling it from app code.

### Non-goals

- CI/CD gating. This is local; git tracks work, CI/CD deploys.
- Offline operation. The pipeline is local-only (no CI/CD gate) but may use the
  network: dependency audit, osv-scanner, and the Jev review all call out.
- Behavioral malicious-package detection (Socket.dev) and OpenSSF Scorecard.
  Skipped.
- LLM-written function paraphrases or dependency/behavior graphs. Jev returns
  typed judgments, not prose or graphs; that needs a generative model and is
  left to a later "escalate" step.
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
3. typecheck             tsc --noEmit per package
4. pnpm test             Vitest: unit (edge cases) + integration (system)
5. scans                 osv-scanner, opengrep, jscpd; tsarch suite
6. review                Jev judgment
```

Runs locally. `pnpm verify` runs a dependency check (`doctor`) first and fails
fast with install hints if a required tool is missing. Stages 1–5 are
deterministic and **block the agent**; stage 6 is a
judgment review that **also blocks when its verdict fails**, so the bounded retry
applies to it too (its answers are labeled judgment-based). Stages run in
**serial** — a stronger signal beats a faster one, and the cheap checks already
run first. Enforcement is via the `biome-after-task` plugin (renamed to the
pipeline runner), with the bounded-retry policy below.

## Test runner: Vitest everywhere

Migrate `server`, `admin`, and `blog` (renamed from `public`) from `tsx --test`
to **Vitest**. One runner, one config per package: `node` for `server`,
`packages`, and `trust-pipeline`; `jsdom` (+ React Testing Library) for `admin`
and `blog`. Coverage via `@vitest/coverage-v8`.

Each workspace package declares its own dependencies (no root dependencies), and
root scripts delegate with `pnpm -r run …`. This keeps every package deployable
standalone in a container.

Rationale: admin already runs on Vite; one runner removes a second mental model;
coverage thresholds are built in and more mature than Node's experimental
`--experimental-test-coverage`.

## Coverage

- **Floor: 80% lines and branches, per package**, enforced by Vitest.
- The floor is set **before** tests exist, so the pipeline is red at first;
  coverage is then raised (per the development method) until every package is
  green. Never lower a floor to silence one hard file.
- The same applies to every gate: it is brought green **before** the pipeline
  enforces it, so from then on it only gates new work. Duplication is cleaned up
  until it is under 3% before `scans` is wired.
- Exclude genuinely untestable code per-file in config (I/O boundaries,
  generated code, migrations). Excludes are per-file only.
- `trust-pipeline` has its own tests and an 80% coverage config, but the pipeline
  does not gate on its own coverage.
- Inline ignores are allowed **with a reason** (e.g. `/* v8 ignore next -- network boundary */`).
- Coverage is a **floor, not a goal**. It proves code ran, not that tests assert
  behavior. **Jev judges test meaning**; coverage does not.

## Deterministic checks

| Stage | Tool | License | Rule |
|---|---|---|---|
| audit | `pnpm audit --audit-level high` | — | high/critical advisories, instant |
| lint + format | Biome | MIT | format: lineWidth 80; lint: `noExcessiveCognitiveComplexity` = 20, `noExcessiveNestedCallbacks` |
| typecheck | `tsc` | — | per-package `tsc --noEmit`; cross-module type errors Biome and Vitest miss |
| structure | AST check | in-repo | file ≤ 400 LOC; function ≤ 80 LOC; nesting ≤ 4 |
| structure | GritQL plugin | in-repo | no JSX produced inside `useMemo`/`useCallback` (admin, blog) |
| test | Vitest | MIT | coverage floor 80% |
| scans | osv-scanner | Apache-2.0 | lockfile CVEs + known-malicious feed |
| scans | Opengrep | LGPL-2.1 | SAST (fully-OSS rules, unlike Semgrep CE's registry rules) |
| scans | jscpd | MIT | duplication ≤ 3%; block ≥100 tokens / ≥10 lines (SonarQube defaults); SARIF |
| scans | tsarch | MIT | architectural pattern conformance + cycle-free |

`osv-scanner` and `opengrep` are external binaries, installed separately.
`jscpd` and `tsarch` are package dependencies of `trust-pipeline`. OpenSSF
Scorecard is dropped: it targets hosted repositories, not a local pre-merge gate.

Generated code (`*.generated.ts`, `apps/admin/app/__generated__/**`), `.serena/`
(indexer config), and documentation markdown are not code and are excluded from
the checks.

## Codegen and the dev server

Codegen (GraphQL schema, Relay artifacts, React Router types) must be fresh
before typechecking. The dev server watches it: `pnpm --filter server run dev`
runs the codegen watcher alongside the API. While that is up, codegen is already
current, so the pipeline **detects the running dev server** (a listening port
from `project/config.ts`) and runs codegen **only when it is not up**.

The engine reads that state live (a port check) rather than persisting a flag, so
stale state can never make it skip codegen wrongly. `AGENTS.md` documents how to
start, stop, and restart the apps and which ports they use.

Each package's `typecheck` is plain `tsc --noEmit`; codegen is the pipeline's
job, not the typecheck script's.

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
- **No `node:test` parity.** Migrating to Vitest is not a one-for-one port:
  convert happy-path unit tests to integration tests where applicable, and keep
  edge-case unit tests as units.
- **Tag every test `unit` or `integration`** (Vitest `tags`, defined in each
  package's config) so the migration — and any reversal of it — stays trackable.
  The `integration` tag can carry a longer timeout.
- **Meaningful tests, not many** — YAGNI applies to tests.
- **Coverage floor** as above.

### tsarch as a living pattern suite

tsarch rules encode architectural **patterns** (resolver→service→db is pattern
#1). At feature start, the agent checks the intent/diff for a **new** pattern:
if one appears with no tsarch coverage, it **asks the user** whether to define a
new pattern. POCs/throwaways are arch-less; anything moving forward gets suite
coverage. The suite runs once as a regression gate in the pipeline's `scans`
stage — not in the normal test run.

## Review layer (Jev)

A local script that turns the diff into typed judgments (TypeSafe Jev, via the
`typesafe-ai` skill). Requires an API key and network access: read `JEV_API_KEY`
from the repo-root `.env`, which is git-ignored. The diff is taken against the
**task base** — the commit the task started from. Nothing is committed until the
pipeline is green, so that base is `HEAD`.

**Decompose by symbol, not by file.** Walk the changed code with the TypeScript
compiler API (the same extraction the structure check uses) and review each
changed symbol — function, component, hook, resolver — as its own unit. For each
symbol build a JSON `state` (`{ file, symbol, kind, before, after }`) and ask the
rubric's independent questions against it; code owns the loop and combines the
answers. (AST-derived dependency context is a later enhancement.) This is what makes the review context-cheap: our lint
rules cap a function at 80 LOC and a file at 400 LOC, so many symbols fit in one
request, and Jev ingests the state once and answers every question in parallel.
The line-by-line-search and hierarchical-classification cookbooks are the same
shape — score many items in one call, walk a source hierarchy.

Jev facts that shape the design (Jev 1.13):

- Context: 64k tokens/request; 32k for `state` plus the longest question. Batch
  symbols to fit that budget; a `Choice` question takes at most 255 options.
- Text only. State is a string, JSON object, or array of text.
- Returns typed answers and probabilities, never generated text or explanations.
- Rate limits: 100k tokens/s and 80 requests/s; the SDK retries with backoff.
- Pin the model id (`jev-1.13.0`) rather than `jev-latest` once confidence
  thresholds are tuned.

Each rubric item is a **Choice** question with an explicit pass/fail option set,
so every answer carries a confidence (Noul returns only a probability, with no
separate confidence).

Rubric covers:

- **Structure:** function does one thing; abstraction with a single caller;
  micro-helper chains.
- **Frontend:** compose components; no JSX in memo; hook reuse; >3-things
  extraction; server-state vs local/context.
- **Methodology:** does this diff add a happy-path *unit* test (should be
  integration)? is a new behavior tested before implementation? are assertions
  meaningful or merely executing lines?
- **Architecture:** does this introduce a pattern with no tsarch coverage?

Output: `symbol — question: answer (confidence)` lines + verdict. **Verdict
fails if any question fails with high confidence**, and a failed verdict fails
`pnpm verify`, so the bounded retry applies. The review is judgment-based, not
deterministic, and says so in its output. Symbols Jev is unsure about are listed
so the agent — and, later, a reasoning model — can escalate.

**Out of scope for v1:** paraphrasing a function's behavior, or building a
dependency/behavior graph and judging the code that way. Jev returns typed
judgments, not prose or graphs, so that needs a generative LLM. The intended
path is TypeSafe's "verify and escalate" pattern: Jev flags the uncertain
symbols and a later version hands those to an LLM.

## Bounded-retry enforcement

- The pipeline runs after a task. On red, the agent fixes and re-runs.
- **Initial budget: 3 automatic attempts**, with no prompt.
- When a budget is exhausted, the agent stops and asks the user via the native
  **`question` tool** (multiple choice). The set of "Try again" grants shrinks as
  budgets are spent:

  | Budgets already spent | Options |
  |---|---|
  | 0 (right after the initial 3) | **Try again (3)**, **Try again (2)**, **Try again (1)**, **Give other instructions** |
  | 1 | **Try again (2)**, **Try again (1)**, **Give other instructions** |
  | 2 or more | **Try again (1)**, **Give other instructions** |

- The grant never reaches 0.
- A grant of N is N more automatic attempts; when it is exhausted, the next ask
  drops the top option. **Give other instructions** applies the guidance and
  re-runs, and does **not** spend a budget — so the same option set is offered
  again if it still fails. (A dev can therefore take 3 more, then 1, then 1; or
  give other instructions and still be offered 3 next time; or take 1 forever.)
- The count is per-session (keyed by session id) and is just the number of failed
  `pnpm verify` runs; a green run **resets it to 0**, so a later task in the same
  session starts fresh. The option set is derived from that count, so the plugin
  never has to observe the user's choice. No infinite loop.
- This ladder is deliberately simple and may be refined; document any change in
  both this spec and the plugin.

## Repo structure

Conventional monorepo split, adopted before the pipeline so all paths are final:

```
apps/         # deployable applications
  admin/
  blog/       # renamed from public/ (the public blog site)
  server/     # GraphQL API
packages/     # shared libraries (existing: ui, graphql-runtime)
trust-pipeline/   # its own workspace package: engine + project config
```

`packages/ui` (`@blog/ui`) is currently a placeholder — a single `cn()` helper
that admin declares but does not import. Keep it for now. It may become a
**design-tokens** library (shared colors/spacing, useful once a non-UI consumer
like an email package exists) or be removed; it is **not** meant to become a
shared component/form library, so admin and blog stay visually independent.

The rename/move is mechanical: `pnpm-workspace.yaml`, the root `Dockerfile`
(three `COPY` lines + one `--filter public`), `docker/ecosystem.config.cjs` (pm2
name + `cwd`), the `.gitignore` paths, and `public/package.json`'s name.
`docker/Caddyfile` routes by port and workspace imports use package names, so
neither changes. The standalone `admin/Dockerfile` and `public/Dockerfile` are
unused (Fly uses the root `Dockerfile`) and are deleted.

## Layout (as-if-portable, not tangled in app code)

```
trust-pipeline/            # its own workspace package (own package.json, deps, tests)
  engine/     # generic: orchestration, check wrappers, retry, Jev harness, verdict, templates
  project/    # this repo only: config (thresholds/globs/commands), tsarch patterns, Jev rubric
```

Moving the directory later is trivial, so a top-level `trust-pipeline/` keeps it
visually separate from app code without a `tools/` grab-bag.

- `pnpm verify` (root) delegates to `pnpm --filter trust-pipeline run verify`.
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

The extracted skill is **self-provisioning**: it runs a dependency check for the
external tools the pipeline needs (`osv-scanner`, `opengrep` + `cosign`, `jscpd`,
`tsarch`, `node`/`pnpm`, `biome`) and **installs the missing ones** before running.
The engine exposes that check as a `doctor` command, so the skill — and a fresh
machine — can verify and provision in one step.

## Testing the pipeline itself

Each check gets a passing and a failing fixture (Vitest). The engine is its own
workspace package with its own Vitest project, so its tests run under `pnpm test`
like every other package. The retry/back-off logic and the Jev verdict logic are
unit-tested directly.

## Resolved decisions

- Vitest for the whole project; one config per package, root scripts delegate
  with `pnpm -r` (no root dependencies).
- Coverage floor 80% lines+branches **per package**; set first, raised next;
  per-file excludes; meaning judged by Jev.
- Retry: 3 automatic attempts, then the user chooses from a shrinking set of
  grants (3/2/1 → 2/1 → 1, forever).
- Local-only means no CI/CD gate; the pipeline itself uses the network.
- Skip Socket.dev and OpenSSF Scorecard; keep both `audit` (instant) and
  `osv-scanner` (precise).
- GraphQL client layer is Relay.
- Cognitive complexity (Biome) = 20; line 80 / function 80 / file 400 / nesting 4.
- `trust-pipeline/` is its own workspace package (own deps + tests) for
  portability.
- Test migration drops `node:test` parity: happy-path units become integration
  tests, edge-case units stay units; every test carries a `unit` or `integration`
  tag.
- The arch package is `tsarch`.
- Jev review is symbol-by-symbol (AST decomposition), batches symbols to the 32k
  state budget, and pins `jev-1.13.0`; the key is `JEV_API_KEY` in the repo-root
  `.env`.
- Typecheck (`tsc --noEmit`, per package, run **serially**) is a stage between
  lint+structure and test; `server`, `packages/ui`, and `packages/graphql-runtime`
  gain a `typecheck` script and a `typescript` dependency. Codegen runs once
  before the packages are typechecked, **unless the dev server is detected** (see
  Codegen and the dev server); each package's `typecheck` is plain `tsc`.
- `trust-pipeline` has its own `tsconfig.json` and `typecheck`, and is linted,
  typechecked, and tested like any other package (the pipeline runs on itself),
  while staying wholly separate — the engine imports no app code.
- A Jev verdict failure fails `pnpm verify`: the review blocks like the other
  stages, labeled judgment-based.
- The Jev review diffs against the **task base** (the commit the task started
  from; nothing is committed until the pipeline is green, so that is `HEAD`).
- The tsarch suite runs once, in the `scans` stage.
- Build here first, extract to a skill later.
