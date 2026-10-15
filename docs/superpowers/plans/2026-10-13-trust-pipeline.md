# Trust Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, fail-fast trust pipeline that gates agent-generated code, plus the development method that keeps it meaningful.

**Architecture:** A generic engine (`trust-pipeline/engine/`) orchestrates deterministic stages in a fixed order (audit → lint+structure → typecheck → test → scans) and a Jev judgment review, driven by project-specific config (`trust-pipeline/project/`). `trust-pipeline/` is its own workspace package with its own dependencies and tests, so the engine can be extracted later without untangling it from app code. The `biome-after-task` plugin becomes the local runner and enforces bounded retries. Each phase below is one self-contained session with a single goal.

**Tech Stack:** Vitest (+ `@vitest/coverage-v8`), Biome 2.5.15 (GritQL), `tsarch`, `osv-scanner`, `opengrep`, `jscpd`, TypeScript compiler API, TypeSafe Jev via the `typesafe-ai` skill, OpenCode V2 plugin API.

**Spec:** `docs/superpowers/specs/2026-10-13-trust-pipeline-and-development-method-design.md`

## Global Constraints

- Pipeline order: `audit → lint+structure → typecheck → test → scans → review`. Fail fast.
- Stages run in **serial**. Prefer a stronger signal over a faster one — the cheap checks already run first, so wall-clock is not the concern.
- Local only means **no CI/CD gate**; the pipeline itself may use the network (audit, osv-scanner, Jev).
- Thresholds: line 80; function ≤ 80 LOC; file ≤ 400 LOC; nesting ≤ 4; cognitive complexity ≤ 20.
- Coverage floor: **80% lines and branches per package**; per-file excludes; inline ignores require a reason. Set the floor first (pipeline is red), then raise coverage in Phase 3.
- One runner: **Vitest**, one config per package (node for `server`, `packages`, `trust-pipeline`; jsdom for `admin`, `blog`). **No root dependencies**: each package declares its own, and root scripts delegate with `pnpm -r`.
- Every test carries a `unit` or `integration` tag (Vitest `tags`, defined per package).
- Bounded retry: **3 automatic attempts** (no prompt). Then the agent asks via the `question` tool, offering `Try again (3|2|1)` + `Give other instructions`, dropping the top option as budgets are spent (`2|1`, then `1`). "Give other instructions" spends no budget. The grant never reaches 0. The per-session count is just the number of failed `pnpm verify` runs, and a green run **resets it to 0**.
- Deterministic stages block the agent; the Jev review also blocks when its verdict fails (its answers are labeled judgment-based).
- Jev reviews the diff **symbol-by-symbol** (AST decomposition), batched under the 32k `state` budget; verdict fails if any rubric question fails with high confidence, and a failed verdict fails `pnpm verify`. Diffs against the **task base** (`HEAD` — nothing is committed until the pipeline is green). Needs `JEV_API_KEY` from the repo-root `.env` and the network.
- The pipeline runs on itself: `trust-pipeline/` is linted, typechecked, and tested like any package, while staying wholly separate from app code.
- Exclude generated code: `*.generated.ts`, `apps/admin/app/__generated__/**`.
- Skip Socket.dev and OpenSSF Scorecard. Keep both `pnpm audit --audit-level high` (instant) and `osv-scanner` (precise).
- The engine must import nothing from `server/`, `admin/`, or `packages/`.

## Review Focus

- **Coverage floor must not be gamed by lowering a package floor** — excludes are per-file only. Pinned in Phase 2 (set) and Phase 3 (raised).
- **Fail-fast order**: a later stage must not run when an earlier one fails. Pinned in Phase 4.
- **Typecheck sees the whole program, not just edited files**, and is not fooled by stale generated types (codegen runs first). Pinned in Phase 4.
- **Structure check must ignore generated and test files** and not miscount multi-line signatures. Pinned in Phase 5.
- **tsarch must resolve workspace aliases** (`@blog/ui`) without false positives. Pinned in Phase 6.
- **Verdict**: medium/low-confidence failures must not fail; empty diff passes. Pinned in Phase 7.
- **Retry must terminate the turn**: after exhaustion it asks the user via the `question` tool and never silently loops. Pinned in Phase 8.

---

## Phase 0 — Restructure the workspace (session goal: "moved apps into apps/ and renamed public to blog")

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `Dockerfile` (root)
- Modify: `docker/ecosystem.config.cjs`
- Modify: `.gitignore`, `.dockerignore`
- Modify: `public/package.json` (then move to `apps/blog/`)
- Modify: `apps/admin/package.json` (relay script paths)
- Move: `admin/` → `apps/admin/`, `server/` → `apps/server/`, `public/` → `apps/blog/`
- Delete: `admin/Dockerfile`, `public/Dockerfile` (unused; Fly uses the root `Dockerfile`)

**Interfaces:**
- Consumes: nothing.
- Produces: the final paths every later phase assumes. Package names stay the same except `public` → `blog`.

- [ ] **Step 1: Move directories and delete unused Dockerfiles** — `git mv admin apps/admin`, `git mv server apps/server`, `git mv public apps/blog` (create `apps/` first), then `git rm apps/admin/Dockerfile apps/blog/Dockerfile` (unused; Fly builds the root `Dockerfile`).
- [ ] **Step 2: Rename the package and fix app-local scripts** — `apps/blog/package.json` `"name": "public"` → `"name": "blog"`; in `apps/admin/package.json`, change the `relay` and `relay:watch` scripts from `pnpm --dir .. run graphql:generate` to `pnpm --dir ../.. run graphql:generate` (they reach the repo root, now two levels up — otherwise `relay`, `typecheck`, and `build` all break).
- [ ] **Step 3: Update `pnpm-workspace.yaml`** — replace the `public`/`admin`/`server` entries with `apps/*`, keep `packages/*`, and preserve the existing `allowBuilds` and `minimumReleaseAgeExclude` keys.
- [ ] **Step 4: Update the root `Dockerfile`** — all **three** app `COPY` lines (`admin/package.json`, `public/package.json`, `server/package.json` → `apps/…`), and `pnpm --filter public run build` → `--filter blog`. (`--filter server` and `--filter admin` use package names, so they are unchanged.)
- [ ] **Step 5: Update `docker/ecosystem.config.cjs`** — pm2 name `'public'` → `'blog'`, `cwd: '/app/public'` → `'/app/apps/blog'`, and the other `cwd` paths to `/app/apps/{admin,server}`.
- [ ] **Step 6: Update ignore files** — `.gitignore`: the four `server/…` paths become `apps/server/…`; add `coverage/`, `report/` (jscpd's default output dir), and `.serena/`. `.dockerignore`: confirm no `public/`/`admin/`/`server/` path remains (it currently uses globs). Doc markdown (e.g. `NEXT_STEPS.md`) is not shipped code — leave its path references alone.
- [ ] **Step 7: Reinstall and verify** — `pnpm install`, then `pnpm --filter blog build`, `pnpm --filter admin build`, `pnpm --filter server run dev:codegen` all succeed.
- [ ] **Step 8: Verify deploy wiring** — every `admin/`, `server/`, `public/` path in these files is `apps/`-prefixed: `grep -rnE "(admin|server|public)/" Dockerfile docker/ .gitignore | grep -v "apps/"` returns nothing. Optionally `docker build` the root `Dockerfile`.
- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: move apps into apps/ and rename public to blog"
```

---

## Phase 1 — Rulebook and method docs (session goal: "documented the rules and the method")

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/testing.md`
- Create: `AGENTS.md`
- Create: `trust-pipeline/engine/templates/AGENTS.md.tmpl`, `trust-pipeline/engine/templates/architecture.md.tmpl`

**Interfaces:**
- Consumes: nothing.
- Produces: the human-readable rules and method every later phase's copy must match; the generic templates live under `engine/`, the concrete files at repo root.

- [ ] **Step 1: Write `docs/architecture.md`** — threshold table (with mechanism column), backend layer rules (resolver→service→db; resolvers ↛ resolvers/db), frontend composition rules, and the "structure as-if-portable" principle.
- [ ] **Step 2: Write `docs/testing.md`** — TDD for new functions; integration ("happy path-ish") after a feature works; units keep edge cases only; happy-path units are promoted to integration and removed; no `node:test` parity when migrating; meaningful tests, YAGNI; coverage floor + excludes.
- [ ] **Step 3: Write `AGENTS.md`** — short, points to both docs, states the pipeline order and that deterministic stages block the agent. Include how to run the apps (the `dev` commands and ports for server/admin/blog, and that the server's `dev` runs the codegen watcher) so the agent knows the dev-server state the pipeline detects.
- [ ] **Step 4: Add generic templates** in `trust-pipeline/engine/templates/` (parameterized versions of the two docs' stable structure, with project specifics as placeholders).
- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/testing.md AGENTS.md trust-pipeline/engine/templates/
git commit -m "docs: add rulebook, testing method, and AGENTS.md"
```

---

## Phase 2 — Migrate tests to Vitest and set the coverage floor (session goal: "migrated tests to vitest")

**Files:**
- Create: `trust-pipeline/package.json`, `trust-pipeline/vitest.config.ts`
- Create: `apps/server/vitest.config.ts`, `apps/admin/vitest.config.ts`, `apps/blog/vitest.config.ts`, `packages/ui/vitest.config.ts`, `packages/graphql-runtime/vitest.config.ts`
- Modify: `pnpm-workspace.yaml` (add `trust-pipeline`), `package.json`, `apps/server/package.json`, `apps/admin/package.json`, `apps/blog/package.json`
- Modify: existing `*.test.ts` imports

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm test` → `pnpm -r run test`; `pnpm test:coverage` → `pnpm -r run test:coverage` with a per-package 80% floor. Environments: node for `server`, `packages/*`, and `trust-pipeline`; jsdom for `admin` and `blog`.

- [ ] **Step 1: Create the engine package** — `trust-pipeline/package.json` (private, name `trust-pipeline`) with `vitest`, `@vitest/coverage-v8`, `tsx`, `typescript`, `dotenv`, `jscpd`, plus a `tsconfig.json` and `typecheck`/`test`/`test:coverage` scripts; add `trust-pipeline` to `pnpm-workspace.yaml`. It gets the 80% coverage config but the pipeline does not gate on it.
- [ ] **Step 2: Add per-package deps** — `vitest`, `@vitest/coverage-v8` to `server`/`admin`/`blog`; `jsdom`, `@testing-library/react` to `admin`/`blog`. Add a `typecheck` script (`tsc --noEmit`) and a `typescript` devDep to `server`, `packages/ui`, and `packages/graphql-runtime` (each needs a `tsconfig.json` first), and change `admin`/`blog` `typecheck` to plain `tsc --noEmit` — codegen moves to the pipeline's conditional codegen step.
- [ ] **Step 3: Per-package configs** — one `vitest.config.ts` per package with `coverage.thresholds = { lines: 80, branches: 80 }` and the `unit`/`integration` tags; environment node for `server`, `packages/ui`, `packages/graphql-runtime`, and `trust-pipeline`; jsdom for `admin`/`blog`.
- [ ] **Step 4: Wire the scripts** — each package gets `"test": "vitest run"` and `"test:coverage": "vitest run --coverage"`; root gets `"test": "pnpm -r --workspace-concurrency=1 run test"` and `"test:coverage": "pnpm -r --workspace-concurrency=1 run test:coverage"` (**serial** across packages — parallel Vitest runs race on a shared `node_modules/.vitest-cache`). Add per-package `codegen` scripts — `admin`: `relay-compiler relay.config.json && react-router typegen`; `blog`: `react-router typegen` — and a root `"codegen": "pnpm --filter server run dev:codegen && pnpm --filter admin run codegen && pnpm --filter blog run codegen"` (**server first**: Relay reads the generated schema).
- [ ] **Step 5: Port existing tests** — the four `server` tests and the `admin` test move off `node:test` to Vitest (`test`/`expect`) and are tagged `unit` or `integration`. Where a test is a happy-path unit, mark it for conversion to an integration test in Phase 3; edge-case units stay as units.
- [ ] **Step 6: Verify** — `pnpm test` passes; `pnpm test:coverage` runs and reports. The floor is expected to be **red** at this point; Phase 3 raises it.
- [ ] **Step 7: Commit**

```bash
git add trust-pipeline apps package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "test: migrate to vitest and set the per-package coverage floor"
```

---

## Phase 3 — Reach the coverage floor (session goal: "coverage floor met")

**Files:**
- Create/Modify: tests across `apps/server`, `apps/admin`, `apps/blog`, `packages/ui`, `packages/graphql-runtime`, and `trust-pipeline`
- Modify: `docs/testing.md` if the method needs refining

**Interfaces:**
- Consumes: the per-package floor from Phase 2.
- Produces: every package with a Vitest config meets 80% lines+branches.

- [ ] **Step 1: Run `pnpm test:coverage`** and list the packages/files below the floor.
- [ ] **Step 2: For each gap, add integration ("happy path-ish") tests** tagged `integration` per `docs/testing.md`; promote existing happy-path units to integration and remove the unit.
- [ ] **Step 3: Add edge-case unit tests** only where the integration tests don't cover the boundary.
- [ ] **Step 4: Re-run `pnpm test:coverage`** until every configured package is green. Never lower a floor; exclude only genuinely untestable files, per-file.
- [ ] **Step 5: Commit**

```bash
git add apps packages
git commit -m "test: raise coverage to the per-package floor"
```

---

## Phase 4 — Engine skeleton, config, and fail-fast orchestration (session goal: "a pipeline that runs audit → lint → typecheck → test")

**Files:**
- Create: `trust-pipeline/engine/run.ts`
- Create: `trust-pipeline/engine/config.ts`
- Create: `trust-pipeline/engine/doctor.ts`
- Create: `trust-pipeline/engine/stages/audit.ts`, `stages/lint.ts`, `stages/typecheck.ts`, `stages/test.ts`
- Create: `trust-pipeline/engine/stages/types.ts`
- Create: `trust-pipeline/project/config.ts`
- Test: `trust-pipeline/engine/run.test.ts`
- Modify: `biome.json`, `package.json` (root, add `verify`)

**Interfaces:**
- Consumes: `pnpm test` from Phase 2.
- Produces:
  - `export type StageResult = { name: string; ok: boolean; output: string }`
  - `export type Stage = { name: string; run(cfg: ProjectConfig): Promise<StageResult> }`
  - `export interface ProjectConfig { stages: { audit: boolean; lint: boolean; typecheck: boolean; structure: boolean; test: boolean; scans: boolean; review: boolean }; commands: {...}; thresholds: {...}; ignore: string[] }` — `ignore` defaults to `['*.generated.ts', 'apps/admin/app/__generated__/**', '.serena/**', '**/*.md', '**/*.test.ts', '**/*.test.tsx']`
  - `export async function runPipeline(stages: Stage[], cfg: ProjectConfig): Promise<{ ok: boolean; results: StageResult[] }>` — stops at the first failure.
  - `pnpm verify` (root) → `pnpm --filter trust-pipeline run verify` → `tsx engine/run.ts`.
  - `export async function doctor(cfg: ProjectConfig): Promise<{ ok: boolean; missing: string[] }>` — verifies every tool the pipeline uses: external binaries (`osv-scanner`, `opengrep`, `cosign`) and project-callable tools (`node`, `pnpm`, `tsx`, `biome`, `vitest`, `jscpd`, `tsarch`). `runPipeline` runs it before any stage and fails fast with install hints.
  - a `typecheck` stage that runs `pnpm codegen` (unless the dev server is detected) then each package's `typecheck` script in serial.

- [ ] **Step 1: Write the failing tests** `engine/run.test.ts` — (a) a fake failing stage followed by a fake stage that records whether it ran; assert `runPipeline` returns `ok:false` and the second stage did **not** run; (b) a missing required tool fails the preflight before any stage runs.
- [ ] **Step 2: Run to verify it fails** — `pnpm --filter trust-pipeline exec vitest run engine/run.test.ts`.
- [ ] **Step 3: Implement `run.ts` + stage types** with fail-fast ordering, plus `doctor` (the dependency check `runPipeline` runs before any stage).
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Implement the four stages** — `audit` (`pnpm audit --audit-level high`), `lint` (`pnpm exec biome check .`), `typecheck` (`pnpm codegen` unless the dev server is detected, then each package's `typecheck` script in serial), `test` (`pnpm test`). Configure `biome.json`: `formatter.lineWidth: 80`; `linter.rules.complexity.noExcessiveCognitiveComplexity` = `{ level: "error", options: { maxAllowedComplexity: 20 } }`; `noExcessiveNestedCallbacks` promoted to `level: "error"` (its default `warn` would not fail the stage).
- [ ] **Step 6: Add the `verify` scripts** (root delegates to the package) and run `pnpm verify` on the repo.
- [ ] **Step 7: Commit**

```bash
git add trust-pipeline/engine trust-pipeline/project trust-pipeline/package.json biome.json package.json
git commit -m "feat(trust-pipeline): engine skeleton and fail-fast audit/lint/typecheck/test"
```

---

## Phase 5 — Structure checks (session goal: "enforce size and nesting rules")

**Files:**
- Create: `trust-pipeline/engine/checks/ast.ts`
- Create: `trust-pipeline/engine/stages/structure.ts`
- Create: `biome/plugins/no-jsx-in-memo.grit`
- Test: `trust-pipeline/engine/checks/ast.test.ts`, `trust-pipeline/engine/stages/structure.test.ts`
- Modify: `biome.json`, `trust-pipeline/project/config.ts`

**Interfaces:**
- Consumes: `ProjectConfig` (Phase 4).
- Produces:
  - `export const MAX_FILE_LINES = 400`, `MAX_FUNCTION_LINES = 80`, `MAX_NESTING = 4`
  - `export type Violation = { rule: "file-length" | "function-length" | "nesting"; file: string; line: number; message: string }`
  - `export function checkSource(input: { filePath: string; source: string }): Violation[]`
  - a `structure` stage that runs the AST check over the repo (honoring `cfg.ignore`) and Biome's GritQL plugin.

- [ ] **Step 1: Write failing AST tests** — over 80-line function flagged; over 400-line file flagged; nesting > 4 flagged; compliant multi-line-signature function passes; generated file ignored.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement `checkSource`** with the TypeScript compiler API (function length = `getEndLineNumber - getStartLineNumber + 1`; nesting counts control-flow nodes; `IGNORE_GLOBS` short-circuit). `typescript` is a dep of `trust-pipeline` (Phase 2).
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Write the GritQL plugin** `no-jsx-in-memo.grit` (flag JSX produced inside `useMemo`/`useCallback`), wired in `biome.json` as `"plugins": [{ "path": "./biome/plugins/no-jsx-in-memo.grit", "includes": ["apps/admin/**", "apps/blog/**"] }]` (Biome 2 plugin shape: `path` + `includes`).
- [ ] **Step 6: Add `structure` stage tests** — a violating fixture makes the stage fail; a clean fixture passes; generated files ignored.
- [ ] **Step 7: Wire the stage** into `run.ts` between `lint` and `test` (structure is part of the lint/structure step per the spec order).
- [ ] **Step 8: Commit**

```bash
git add trust-pipeline/engine/checks trust-pipeline/engine/stages biome/plugins biome.json trust-pipeline/project/config.ts
git commit -m "feat(trust-pipeline): AST size/nesting and JSX-in-memo checks"
```

---

## Phase 6 — Scans and architecture patterns (session goal: "security, duplication, and arch checks")

**Files:**
- Create: `trust-pipeline/engine/stages/scans.ts`
- Create: `trust-pipeline/project/patterns/resolvers.test.ts`
- Test: `trust-pipeline/engine/stages/scans.test.ts`
- Modify: `trust-pipeline/project/config.ts`, `trust-pipeline/package.json` (add `tsarch`)

**Interfaces:**
- Requires: `osv-scanner`, `opengrep` (v1.30.2, cosign-verified), `jscpd`, and `tsarch` installed (done).
- Consumes: `ProjectConfig`; the `Stage` type.
- Produces: a `scans` stage running the configured commands (`osv-scanner`, `opengrep`, `jscpd --threshold`) and the tsarch pattern suite (via Vitest), each reporting pass/fail.

- [ ] **Step 1: Add the package dep** — `tsarch` to `trust-pipeline/package.json` (`jscpd` was added in Phase 2).
- [ ] **Step 2: Write the failing scans-stage test** — a stubbed failing command makes the stage fail; a passing command passes.
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement `scans.ts`** — run commands from `cfg`, aggregate results, fail on any non-zero.
- [ ] **Step 5: Run to verify it passes.**
- [ ] **Step 6: Write tsarch patterns** `project/patterns/resolvers.test.ts` — resolvers ↛ resolvers; resolvers ↛ `db`; server graph cycle-free. Use `tsarch`'s core API under Vitest; ignore generated files. Confirm the `@blog/ui` alias resolves. Exclude `project/patterns/**` from the package's default Vitest glob so the suite runs **once**, in `scans`.
- [ ] **Step 7: Verify red-green** — temporarily add a resolver→db import, confirm the pattern fails, revert.
- [ ] **Step 8: Configure the scan commands** in `project/config.ts` and wire `scans` after `test`:
  - Write the initial Opengrep rules in `trust-pipeline/project/rules/` — a small hand-written Semgrep-compatible YAML set (e.g. `eval`, `child_process.exec` on untrusted input, hardcoded secrets).
  - First, run jscpd and refactor until aggregate duplication is ≤ 3% — the gate starts green and only gates new work from then on.
  - `osv-scanner scan -L pnpm-lock.yaml --format json` (v2 CLI: `scan` subcommand, `-L` lockfile).
  - `opengrep scan --config trust-pipeline/project/rules --severity ERROR --error --disable-version-check --sarif-output <artifact> apps packages trust-pipeline`. Rules are local, Semgrep-compatible YAML under `trust-pipeline/project/rules/`; **never** `--config auto` (registry/network). Verified against opengrep v1.30.2: `--error` exits 1 on findings, `--severity` takes `INFO|WARNING|ERROR`, and there is **no `--metrics` flag** (the fork dropped telemetry).
  - `jscpd --threshold 3 --min-tokens 100 --min-lines 10` (SonarQube's gate: duplicated lines ≤ 3%, block = ≥100 tokens across ≥10 lines).
- [ ] **Step 9: Commit**

```bash
git add trust-pipeline/engine/stages/scans.ts trust-pipeline/project trust-pipeline/package.json pnpm-lock.yaml
git commit -m "feat(trust-pipeline): security/duplication scans and arch patterns"
```

---

## Phase 7 — Jev review (session goal: "the judgment review layer")

**Files:**
- Create: `trust-pipeline/engine/review/verdict.ts`
- Create: `trust-pipeline/engine/review/review.ts`
- Create: `trust-pipeline/project/rubric.md`
- Test: `trust-pipeline/engine/review/verdict.test.ts`
- Modify: `trust-pipeline/engine/run.ts`, `trust-pipeline/project/config.ts`

**Interfaces:**
- Consumes: the diff; the Phase 5 AST extraction; `ProjectConfig`.
- Produces:
  - `export const HIGH_CONFIDENCE = 0.8`
  - `export type RubricAnswer = { question: string; answer: 'pass' | 'fail'; confidence: number }` — one Choice question per rubric item.
  - `export function verdict(answers: RubricAnswer[]): { pass: boolean; failures: RubricAnswer[] }` — pass if no `answer === 'fail' && confidence >= HIGH_CONFIDENCE`.
  - `export async function collectDiff(ref = 'HEAD'): Promise<string>` — the task base; includes untracked files (via `git ls-files --others --exclude-standard`, read-only — no index mutation).
  - `export type Symbol = { file: string; name: string; kind: string; before: string; after: string }`
  - `export function collectSymbols(diff: string): Symbol[]` — reuses the Phase 5 AST walk to split the diff into changed symbols.
  - `export type Rubric = { items: { id: string; question: string; options: [string, string] }[] }` — the pass/fail Choice questions read from `project/rubric.md`.
  - `export async function reviewSymbols(symbols: Symbol[], rubric: Rubric): Promise<Map<Symbol, RubricAnswer[]>>` — batches symbols into Jev requests (each symbol a JSON `state`, questions asked in parallel).
  - a `review` stage that reads `project/rubric.md`, reviews symbol-by-symbol, prints `symbol — question: answer (confidence)` + verdict, and **fails the pipeline** when the verdict fails.

- [ ] **Step 1: Write failing verdict tests** — high-confidence failure fails; low-confidence failure passes; all-true passes; empty passes.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement `verdict.ts`.**
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Write `project/rubric.md`** — structure, frontend, methodology (happy-path units, TDD order, meaningful assertions), and architecture (new pattern with no tsarch coverage) questions. Each is a Choice with a pass/fail option set.
- [ ] **Step 6: Implement `collectSymbols`** — reuse the Phase 5 AST extraction to turn the diff into per-symbol `{ file, name, kind, before, after }`; batch symbols into requests under the 32k `state` + longest-question budget.
- [ ] **Step 7: Implement `review.ts`** — read the `typesafe-ai` skill and its live docs first. Load the key from `JEV_API_KEY` via the repo-root `.env` (`dotenv`, added in Phase 2). Pin `jev-1.13.0`. Empty diff → "no changes", pass, no model call.
- [ ] **Step 8: Wire the `review` stage** last in `run.ts`, failing `pnpm verify` on a failed verdict.
- [ ] **Step 9: Smoke run** on the current working tree; confirm a batch fits the budget.
- [ ] **Step 10: Commit**

```bash
git add trust-pipeline/engine/review trust-pipeline/project/rubric.md trust-pipeline/engine/run.ts
git commit -m "feat(trust-pipeline): Jev judgment review"
```

> Out of scope for v1: paraphrasing functions or building a behavior graph to judge
> against (Jev returns typed judgments, not prose/graphs — that needs an LLM). The
> future path is Jev "verify and escalate": flag uncertain symbols, hand those to a model.

---

## Phase 8 — Bounded-retry runner (session goal: "the agent is gated with bounded retries")

**Files:**
- Modify: `.opencode/plugin/biome-after-task.ts` (becomes the pipeline runner)
- Test: `trust-pipeline/engine/retry.test.ts`
- Create: `trust-pipeline/engine/retry.ts`

**Interfaces:**
- Consumes: `pnpm verify` (Phases 4–7).
- Produces:
  - `export function retryOptions(spent: number): number[]` — the grants offered once `spent` budgets have been used: `[3, 2, 1]`, `[2, 1]`, `[1]`, `[1]`, … (never empty, never below 1).
  - plugin behavior: on task idle, if the worktree changed, send the pipeline follow-up; run **3 automatic attempts**; count failed attempts **per session** in `ctx.storage` (keyed by `sessionID`); when a budget is exhausted, instruct the agent to stop and ask the user via the native **`question` tool** with `retryOptions(spent)` plus `Give other instructions` (always present). A granted budget increments `spent`; "Give other instructions" does not.

- [ ] **Step 1: Write failing retry tests** — `retryOptions(0)` = `[3, 2, 1]`; `retryOptions(1)` = `[2, 1]`; `retryOptions(2)` = `[1]`; `retryOptions(5)` = `[1]`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement `retry.ts`.**
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Rewrite the plugin** to run `pnpm verify` and apply `retry.ts`, keeping the existing worktree-change detection and V2 API. On exhaustion, its follow-up instructs the agent to ask the `question`-tool prompt; a granted budget advances the ladder, "Give other instructions" does not.
- [ ] **Step 6: Verify the plugin loads** — `tsc -p .opencode`, touch the file, confirm the log shows no `failed to load plugin`.
- [ ] **Step 7: Commit**

```bash
git add trust-pipeline/engine/retry.ts trust-pipeline/engine/retry.test.ts .opencode/plugin/biome-after-task.ts
git commit -m "feat(trust-pipeline): bounded-retry agent gate"
```

---

## Phase 9 — Portability scaffolding (session goal: "engine/project split ready to extract")

**Files:**
- Create: `trust-pipeline/engine/README.md`, `trust-pipeline/project/README.md`
- Create: `docs/trust-pipeline.md` — the broad-strokes method for reuse.

**Interfaces:**
- Consumes: everything above.
- Produces: a documented engine/project boundary (no engine import of app code, verified) and a `docs/trust-pipeline.md` describing the method so it can be lifted into a skill later. The extracted skill calls the engine's `doctor` to self-provision.

- [ ] **Step 1: Write `docs/trust-pipeline.md`** — the portable method in broad strokes, with a "project specifics" section.
- [ ] **Step 2: Add `README.md` files** to `engine/` and `project/` describing their contract.
- [ ] **Step 3: Verify the boundary** — a check/test asserting no file under `engine/` imports from `server/`, `admin/`, or `packages/`.
- [ ] **Step 4: Commit**

```bash
git add trust-pipeline/engine/README.md trust-pipeline/project/README.md docs/trust-pipeline.md
git commit -m "docs(trust-pipeline): portability boundary and method"
```

---

## Self-Review

- **Spec coverage:** repo structure — apps/packages + public→blog (Phase 0); pipeline order (4 + 5 + 6 + 7); Vitest migration incl. blog (2); coverage floor set (2) and raised (3); deterministic tools — audit/lint/typecheck/test/scans (4–6); development method (1, judged in 7); tsarch pattern suite (6); Jev rubric incl. methodology + new-pattern (7); bounded retry (8); layout / as-if-portable + extraction path (1, 4, 9); local-only + network (global constraints).
- **Type consistency:** `Stage`/`StageResult`/`ProjectConfig` (4) are consumed unchanged in 5–7; `checkSource`/`Violation` (5); `Symbol`/`collectSymbols` (7, reusing 5); `verdict`/`RubricAnswer`/`HIGH_CONFIDENCE` (7); `retryOptions` (8).
- **Review Focus:** each of the seven lines has a test pinned to its owning phase.
- **Proportion:** signatures, tests, and pinned values; bodies left to the implementer except where a pattern must be chosen.
- **One goal per phase:** each phase is a self-contained, one-sentence session (restructure; docs; vitest + floor; coverage; engine; structure; scans; review; retry; portability).
