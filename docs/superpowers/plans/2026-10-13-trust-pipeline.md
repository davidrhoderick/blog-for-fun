# Trust Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, fail-fast trust pipeline that gates agent-generated code, plus the development method that keeps it meaningful.

**Architecture:** A generic engine (`trust-pipeline/engine/`) orchestrates deterministic stages in a fixed order (audit → lint+structure → test → scans) and a Jev judgment review, driven by project-specific config (`trust-pipeline/project/`). The `biome-after-task` plugin becomes the local runner and enforces bounded retries. Nothing is tangled into app code. Each phase below is one self-contained session with a single goal.

**Tech Stack:** Vitest (+ `@vitest/coverage-v8`), Biome 2.5.7 (GritQL), `ts-arch`, `osv-scanner`, `opengrep`, `jscpd`, OpenSSF Scorecard, TypeScript compiler API, TypeSafe Jev via the `typesafe-ai` skill, OpenCode V2 plugin API.

**Spec:** `docs/superpowers/specs/2026-10-13-trust-pipeline-and-development-method-design.md`

## Global Constraints

- Pipeline order: `audit → lint+structure → test → scans → review`. Fail fast.
- Local only. No CI/CD gating.
- Thresholds: line 80; function ≤ 80 LOC; file ≤ 400 LOC; nesting ≤ 4; cognitive complexity ≤ 20.
- Coverage floor: **80% lines and branches**; per-file excludes; inline ignores require a reason.
- One runner: **Vitest** (node project for `server`/`packages`, jsdom for `admin`).
- Bounded retry: initial 3 attempts → then ask via the `question` tool; "Try again" grants **3 → 2 → 1 → 1 …** forever; "Give other instructions" always present.
- Deterministic stages block the agent; the Jev review is a report.
- Jev verdict: fails iff any rubric question fails with high confidence.
- Exclude generated code: `*.generated.ts`, `admin/app/__generated__/**`.
- Skip Socket.dev. Keep both `pnpm audit` (instant) and `osv-scanner` (precise).
- The engine must import nothing from `server/`, `admin/`, or `packages/`.

## Review Focus

- **Coverage threshold must not be gamed by lowering the global floor** — excludes are per-file only. Pinned in Phase 2.
- **Fail-fast order**: a later stage must not run when an earlier one fails. Pinned in Phase 3.
- **Structure check must ignore generated files** and not miscount multi-line signatures. Pinned in Phase 4.
- **ts-arch must resolve workspace aliases** (`@blog/ui`) without false positives. Pinned in Phase 5.
- **Retry must terminate the turn**: after exhaustion it asks the user via the `question` tool and never silently loops. Pinned in Phase 7.
- **Verdict**: medium/low-confidence failures must not fail; empty diff passes. Pinned in Phase 6.

---

## Phase 0 — Restructure the workspace (session goal: "moved apps into apps/ and renamed public to blog")

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `Dockerfile` (root)
- Modify: `docker/ecosystem.config.cjs`
- Modify: `public/package.json` (then move to `apps/blog/`)
- Move: `admin/` → `apps/admin/`, `server/` → `apps/server/`, `public/` → `apps/blog/`
- Delete: `admin/Dockerfile`, `public/Dockerfile` (unused; Fly uses the root `Dockerfile`)

**Interfaces:**
- Consumes: nothing.
- Produces: the final paths every later phase assumes. Package names stay the same except `public` → `blog`.

- [ ] **Step 1: Move directories** — `git mv admin apps/admin`, `git mv server apps/server`, `git mv public apps/blog` (create `apps/` first).
- [ ] **Step 2: Rename the package** — `apps/blog/package.json` `"name": "public"` → `"name": "blog"`.
- [ ] **Step 3: Update `pnpm-workspace.yaml`** — `apps/*` and `packages/*`.
- [ ] **Step 4: Update the root `Dockerfile`** — the two `COPY` lines (`admin/…`, `public/…`) and `pnpm --filter public run build` → `--filter blog`.
- [ ] **Step 5: Update `docker/ecosystem.config.cjs`** — pm2 name `'public'` → `'blog'`, `cwd: '/app/public'` → `'/app/apps/blog'`, and the other `cwd` paths to `/app/apps/{admin,server}`.
- [ ] **Step 6: Reinstall and verify** — `pnpm install`, then `pnpm --filter blog build`, `pnpm --filter admin build`, `pnpm --filter server run dev:codegen` all succeed.
- [ ] **Step 7: Verify deploy wiring** — `docker build` the root `Dockerfile` (or dry-run the COPY paths) to confirm no stale `public/` path remains. `grep -rn "public/" Dockerfile docker/` returns nothing.
- [ ] **Step 8: Commit**

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
- [ ] **Step 2: Write `docs/testing.md`** — TDD for new functions; integration ("happy path-ish") after a feature works; units keep edge cases only; happy-path units are promoted to integration and removed; meaningful tests, YAGNI; coverage floor + excludes.
- [ ] **Step 3: Write `AGENTS.md`** — short, points to both docs, states the pipeline order and that deterministic stages block the agent.
- [ ] **Step 4: Add generic templates** in `trust-pipeline/engine/templates/` (parameterized versions of the two docs' stable structure, with project specifics as placeholders).
- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/testing.md AGENTS.md trust-pipeline/engine/templates/
git commit -m "docs: add rulebook, testing method, and AGENTS.md"
```

---

## Phase 2 — Migrate tests to Vitest (session goal: "migrated tests to vitest")

**Files:**
- Create: `vitest.config.ts` (root, with `test.projects`)
- Create: `apps/server/vitest.config.ts`, `apps/admin/vitest.config.ts`, `apps/blog/vitest.config.ts`
- Modify: `package.json`, `apps/server/package.json`, `apps/admin/package.json`, `apps/blog/package.json`
- Modify: existing `*.test.ts` imports if needed

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm test` → `vitest run`; `pnpm test:coverage` → coverage with the 80% floor. Projects: `server` (node), `admin` and `blog` (jsdom).

- [ ] **Step 1: Add deps** — `vitest`, `@vitest/coverage-v8` (root or per package); `jsdom`, `@testing-library/react` (admin, blog).
- [ ] **Step 2: Root config** `vitest.config.ts` with `test.projects` pointing at the three package configs and `coverage.thresholds = { lines: 80, branches: 80 }`.
- [ ] **Step 3: Per-package configs** — `server` environment `node`; `admin` and `blog` environment `jsdom`.
- [ ] **Step 4: Port existing tests** — the four `server` tests and the `admin` test run under Vitest unchanged (Node `node:test` imports replaced with Vitest `test`/`expect`). `blog` currently has no tests; add its config so new tests land there.
- [ ] **Step 5: Verify** — `pnpm test` passes for all projects; `pnpm test:coverage` produces a report and enforces the floor.
- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts apps package.json pnpm-lock.yaml
git commit -m "test: migrate to vitest across the workspace"
```

---

## Phase 3 — Engine skeleton, config, and fail-fast orchestration (session goal: "a pipeline that runs audit → lint → test")

**Files:**
- Create: `trust-pipeline/engine/run.ts`
- Create: `trust-pipeline/engine/config.ts`
- Create: `trust-pipeline/engine/stages/audit.ts`, `stages/lint.ts`, `stages/test.ts`
- Create: `trust-pipeline/engine/stages/types.ts`
- Create: `trust-pipeline/project/config.ts`
- Test: `trust-pipeline/engine/run.test.ts`
- Modify: `biome.json`, `package.json`

**Interfaces:**
- Consumes: `pnpm test` from Phase 2.
- Produces:
  - `export type StageResult = { name: string; ok: boolean; output: string }`
  - `export type Stage = { name: string; run(cfg: ProjectConfig): Promise<StageResult> }`
  - `export interface ProjectConfig { stages: { audit: boolean; lint: boolean; test: boolean; ... }; commands: {...}; thresholds: {...}; ignore: string[] }`
  - `export async function runPipeline(stages: Stage[], cfg: ProjectConfig): Promise<{ ok: boolean; results: StageResult[] }>` — stops at the first failure.
  - `pnpm verify` → `tsx trust-pipeline/engine/run.ts`

- [ ] **Step 1: Write the failing test** `run.test.ts` — a fake failing stage followed by a fake stage that records whether it ran; assert `runPipeline` returns `ok:false` and the second stage did **not** run.
- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run trust-pipeline/engine/run.test.ts`.
- [ ] **Step 3: Implement `run.ts` + stage types** with fail-fast ordering.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Implement the three stages** — `audit` (`pnpm audit`), `lint` (`pnpm exec biome check .`), `test` (`pnpm test`). Add `biome.json` thresholds: `lineWidth 80`, `noExcessiveCognitiveComplexity` = 20, `noExcessiveNestedCallbacks`.
- [ ] **Step 6: Add `pnpm verify`** and run it on the repo.
- [ ] **Step 7: Commit**

```bash
git add trust-pipeline/engine trust-pipeline/project biome.json package.json
git commit -m "feat(trust-pipeline): engine skeleton and fail-fast audit/lint/test"
```

---

## Phase 4 — Structure checks (session goal: "enforce size and nesting rules")

**Files:**
- Create: `trust-pipeline/engine/checks/ast.ts`
- Create: `trust-pipeline/engine/stages/structure.ts`
- Create: `biome/plugins/no-jsx-in-memo.grit`
- Test: `trust-pipeline/engine/checks/ast.test.ts`, `trust-pipeline/engine/stages/structure.test.ts`
- Modify: `biome.json`, `trust-pipeline/project/config.ts`

**Interfaces:**
- Consumes: `ProjectConfig` (Phase 3).
- Produces:
  - `export const MAX_FILE_LINES = 400`, `MAX_FUNCTION_LINES = 80`, `MAX_NESTING = 4`
  - `export type Violation = { rule: "file-length" | "function-length" | "nesting"; file: string; line: number; message: string }`
  - `export function checkSource(input: { filePath: string; source: string }): Violation[]`
  - a `structure` stage that runs the AST check over the repo (honoring `cfg.ignore`) and Biome's GritQL plugin.

- [ ] **Step 1: Write failing AST tests** — over 80-line function flagged; over 400-line file flagged; nesting > 4 flagged; compliant multi-line-signature function passes; generated file ignored.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement `checkSource`** with the TypeScript compiler API (function length = `getEndLineNumber - getStartLineNumber + 1`; nesting counts control-flow nodes; `IGNORE_GLOBS` short-circuit).
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Write the GritQL plugin** `no-jsx-in-memo.grit` (flag JSX produced inside `useMemo`/`useCallback`), wired in `biome.json` with `"includes": ["apps/admin/**", "apps/blog/**"]`.
- [ ] **Step 6: Add `structure` stage tests** — a violating fixture makes the stage fail; a clean fixture passes; generated files ignored.
- [ ] **Step 7: Wire the stage** into `run.ts` between `lint` and `test` (structure is part of the lint/structure step per the spec order).
- [ ] **Step 8: Commit**

```bash
git add trust-pipeline/engine/checks trust-pipeline/engine/stages biome/plugins biome.json trust-pipeline/project/config.ts
git commit -m "feat(trust-pipeline): AST size/nesting and JSX-in-memo checks"
```

---

## Phase 5 — Scans and architecture patterns (session goal: "security, duplication, and arch checks")

**Files:**
- Create: `trust-pipeline/engine/stages/scans.ts`
- Create: `trust-pipeline/project/patterns/resolvers.test.ts`
- Test: `trust-pipeline/engine/stages/scans.test.ts`
- Modify: `trust-pipeline/project/config.ts`, `apps/server/package.json` (add `ts-arch`), root `package.json`

**Interfaces:**
- Consumes: `ProjectConfig`; the `Stage` type.
- Produces: a `scans` stage running the configured commands (`osv-scanner`, `opengrep`, `jscpd --threshold`, `scorecard`) and the ts-arch pattern suite (via Vitest), each reporting pass/fail.

- [ ] **Step 1: Write the failing scans-stage test** — a stubbed failing command makes the stage fail; a passing command passes.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `scans.ts`** — run commands from `cfg`, aggregate results, fail on any non-zero.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Write ts-arch patterns** `project/patterns/resolvers.test.ts` — resolvers ↛ resolvers; resolvers ↛ `db`; server graph cycle-free. Use ts-arch's core API under Vitest; ignore generated files.
- [ ] **Step 6: Verify red-green** — temporarily add a resolver→db import, confirm the pattern fails, revert.
- [ ] **Step 7: Configure the scan commands** in `project/config.ts` (thresholds, paths) and wire `scans` after `test`.
- [ ] **Step 8: Commit**

```bash
git add trust-pipeline/engine/stages/scans.ts trust-pipeline/project apps/server/package.json package.json pnpm-lock.yaml
git commit -m "feat(trust-pipeline): security/duplication scans and arch patterns"
```

---

## Phase 6 — Jev review (session goal: "the judgment review layer")

**Files:**
- Create: `trust-pipeline/engine/review/verdict.ts`
- Create: `trust-pipeline/engine/review/review.ts`
- Create: `trust-pipeline/project/rubric.md`
- Test: `trust-pipeline/engine/review/verdict.test.ts`
- Modify: `trust-pipeline/engine/run.ts`, `trust-pipeline/project/config.ts`

**Interfaces:**
- Consumes: the diff.
- Produces:
  - `export const HIGH_CONFIDENCE = 0.8`
  - `export type RubricAnswer = { question: string; answer: boolean; confidence: number }`
  - `export function verdict(answers: RubricAnswer[]): { pass: boolean; failures: RubricAnswer[] }` — pass iff no `answer === false && confidence >= HIGH_CONFIDENCE`.
  - `export async function collectDiff(ref?: string): Promise<string>`
  - a `review` stage (report) that reads `project/rubric.md`, asks Jev, prints `question: answer (confidence)` + verdict.

- [ ] **Step 1: Write failing verdict tests** — high-confidence failure fails; low-confidence failure passes; all-true passes; empty passes.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement `verdict.ts`.**
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Write `project/rubric.md`** — structure, frontend, methodology (happy-path units, TDD order, meaningful assertions), and architecture (new pattern with no ts-arch coverage) questions.
- [ ] **Step 6: Implement `review.ts`** (read the `typesafe-ai` skill and its live docs first). Empty diff → "no changes", pass, no model call.
- [ ] **Step 7: Wire the `review` stage** last in `run.ts`.
- [ ] **Step 8: Smoke run** on the current working tree.
- [ ] **Step 9: Commit**

```bash
git add trust-pipeline/engine/review trust-pipeline/project/rubric.md trust-pipeline/engine/run.ts
git commit -m "feat(trust-pipeline): Jev judgment review"
```

---

## Phase 7 — Bounded-retry runner (session goal: "the agent is gated with bounded retries")

**Files:**
- Modify: `.opencode/plugin/biome-after-task.ts` (becomes the pipeline runner)
- Test: `trust-pipeline/engine/retry.test.ts`
- Create: `trust-pipeline/engine/retry.ts`

**Interfaces:**
- Consumes: `pnpm verify` (Phases 3–6).
- Produces:
  - `export function nextGrant(step: number): number` implementing the ladder **3 → 2 → 1 → 1 → 1 …** (never below 1).
  - plugin behavior: on task idle, if the worktree changed, send the pipeline follow-up; count failed attempts in `ctx.storage`; after the initial 3, instruct the agent to stop and ask the user via the native **`question` tool** with two options — `Try again (N attempts)` where N = `nextGrant(step)`, and `Give other instructions` (always present).

- [ ] **Step 1: Write failing retry tests** — `nextGrant` returns 3, 2, 1, 1, 1 for successive steps; never below 1.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement `retry.ts`.**
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Rewrite the plugin** to run `pnpm verify` and apply `retry.ts`, keeping the existing worktree-change detection and V2 API. On exhaustion, its follow-up instructs the agent to ask the `question`-tool prompt above; "Give other instructions" does not reset the ladder.
- [ ] **Step 6: Verify the plugin loads** — `tsc -p .opencode`, touch the file, confirm the log shows no `failed to load plugin`.
- [ ] **Step 7: Commit**

```bash
git add trust-pipeline/engine/retry.ts trust-pipeline/engine/retry.test.ts .opencode/plugin/biome-after-task.ts
git commit -m "feat(trust-pipeline): bounded-retry agent gate"
```

---

## Phase 8 — Portability scaffolding (session goal: "engine/project split ready to extract")

**Files:**
- Create: `trust-pipeline/engine/README.md`, `trust-pipeline/project/README.md`
- Modify: `docs/trust-pipeline.md` (create) — the broad-strokes method for reuse.

**Interfaces:**
- Consumes: everything above.
- Produces: a documented engine/project boundary (no engine import of app code, verified) and a `docs/trust-pipeline.md` describing the method so it can be lifted into a skill later.

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

- **Spec coverage:** repo structure — apps/packages + public→blog (Phase 0); pipeline order (3 + 4 + 5 + 6); Vitest migration incl. blog (2); coverage floor (2); deterministic tools (3–5); development method (1, judged in 6); ts-arch pattern suite (5); Jev rubric incl. methodology + new-pattern (6); bounded retry (7); layout / as-if-portable + extraction path (1, 3, 8); local-only (global constraints).
- **Type consistency:** `Stage`/`StageResult`/`ProjectConfig` (3) are consumed unchanged in 4–6; `checkSource`/`Violation` (4); `verdict`/`RubricAnswer`/`HIGH_CONFIDENCE` (6); `nextGrant` (7).
- **Review Focus:** each of the six lines has a test pinned to its owning phase.
- **Proportion:** signatures, tests, and pinned values; bodies left to the implementer except where a pattern must be chosen.
- **One goal per phase:** each phase is a self-contained, one-sentence session (restructure; docs; vitest; engine; structure; scans; review; retry; portability).
