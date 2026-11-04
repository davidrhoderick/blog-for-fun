# Managed Local Product Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a product team member start a feature in a verified local worktree without manually configuring the repo, database, or app processes.

**Architecture:** A Node standard-library launcher creates the feature worktree, installs and verifies its base, then starts a shared managed-environment helper and `product-dev`. The feature E2E CLI uses that helper when no external loopback URL is supplied; the feature manifest identifies the app to start.

**Tech Stack:** Node.js 22, TypeScript, pnpm, Vitest, Playwright, libSQL.

**Spec:** `docs/superpowers/specs/2026-11-03-local-product-environment-design.md`

## Global Constraints

- New product feature branches start from fetched `origin/main` by default; stacking requires an explicit base ref. `--resume` is required to reuse an existing managed worktree.
- Validate IDs with the existing `^[A-Za-z0-9][A-Za-z0-9_-]*$` rule before using them in branch names, worktree paths, or database paths.
- Never rebase the invoking branch, overwrite an existing `.env`, use a non-local database, or kill processes not started by the launcher.
- Install with `pnpm install --frozen-lockfile`; do not run the trust pipeline before product handoff. Engineering runs `pnpm verify` after product acceptance.
- Keep local credentials local; leave worktrees and persistent product databases available to resume.
- Preserve accepted E2E tests; do not add accepted-file SHA comparisons or change product behavior without approval.
- Record temporary tracked local overrides at handoff; engineering decides whether to make them durable or remove them and documents the disposition.
- Tag every new Vitest test as `unit` or `integration`, per `docs/testing.md`.

## Review Focus

- Missing base or existing branch/worktree path → refuse safely without changing the invoking worktree (Task 3 integration test).
- Resume with a mismatched branch/path or with `--base-ref` → refuse; a matching resume preserves dirty tracked/untracked changes (Task 3 integration test).
- Resume without a setup marker, or with an ID/app/base mismatch → refuse so resume cannot reuse an unmanaged worktree (Task 3 integration test).
- Existing non-local database or storage endpoint in `.env` → refuse rather than connect to it; inherited Turso/AWS credentials are stripped from managed children (Task 2 integration tests).
- Resuming a local database with an existing administrator → do not bootstrap again or alter its credentials (Task 2 test).
- Occupied app port or shutdown signal → report the collision and stop only owned child processes (Task 2 test).
- Missing/invalid manifest app, no selected E2E tests, and explicit external URL → validate each path; preserve current loopback validation (Tasks 1 and 4 tests).

---

### Task 1: Version the feature manifest with its target app

**Files:**
- Modify: `trust-pipeline/feature/manifest.ts`
- Test: `trust-pipeline/feature/manifest.test.ts`
- Update later in Task 4: manifest examples in feature workflow docs

**Interface:**
- Export `FeatureApp = 'admin' | 'blog'`.
- `FeatureManifest` uses `schemaVersion: 2` and a required top-level `app: FeatureApp`; preserve the existing acceptance fields and validation.

- [x] **Step 1: Add failing manifest cases** — a v2 manifest with `app: blog` is accepted; `app: admin` is accepted; v1, missing `app`, and any other app value are rejected.
- [x] **Step 2: Run the focused test and confirm it fails on the old schema.**

Run: `pnpm --filter trust-pipeline exec vitest run feature/manifest.test.ts`

Expected: FAIL because the parser currently accepts only schema version 1 and does not validate `app`.

- [x] **Step 3: Implement schema v2 and app validation** in `manifest.ts`; keep the existing SHA, tag, and safe test-path checks intact.
- [x] **Step 4: Re-run the focused manifest tests.**

Run: `pnpm --filter trust-pipeline exec vitest run feature/manifest.test.ts`

Expected: PASS, including existing traversal and accepted-SHA cases.

### Task 2: Add the shared local environment lifecycle

**Files:**
- Create: `trust-pipeline/feature/environment.ts`
- Test: `trust-pipeline/feature/environment.test.ts`
- Modify: `apps/server/src/auth/account.ts`
- Modify: `apps/server/src/scripts/bootstrap-auth.ts`
- Test: `apps/server/src/auth/auth.integration.test.ts`

**Interface:**
- Export `withManagedEnvironment<T>(options, run)`: options contain the worktree root, `app`, absolute local `databasePath`, whether to remove that DB after the callback, and optional server/app port overrides for isolated tests; `run` receives `{ baseURL, env }`.
- It passes explicit file-DB credentials to migrations/server children, bootstraps the local admin only when no authentication user exists, starts the server plus selected app, waits for both health endpoints, calls `run`, and cleans up owned processes in `finally`. Product uses a persistent ignored DB; E2E uses a temporary DB.
- Product database path is `apps/server/.local/product-<ID>.db`; E2E creates a temporary OS temp directory and removes only that directory after the run.
- Extend `bootstrapAdministrator(input, { ifInitialized: true })` to return `null` without changing an existing account; preserve the current throwing behavior when the option is omitted. `bootstrap-auth.ts` enables that option only when `BOOTSTRAP_IF_INITIALIZED=true`.
- Provide a small `environment.ts run --app ... --database ... -- <command>` CLI mode so the JavaScript worktree launcher can run `pnpm product` inside the same lifecycle.

- [x] **Step 1: Add failing tests**: in the server integration test, bootstrap once then assert `ifInitialized` returns `null` and preserves the account; in the environment test, use a temporary root and stub `pnpm` to verify local DB env reaches migration/bootstrap even when the parent has remote credentials, inherited cloud credentials are not forwarded, non-local database/storage endpoints are refused, the right UI is selected (`admin` → 3001, `blog` → 3000), health readiness is awaited, and `finally` terminates only spawned children.
- [x] **Step 2: Run the focused tests and confirm the new behavior is missing.**

Run: `pnpm --filter server exec vitest run src/auth/auth.integration.test.ts` and `pnpm --filter trust-pipeline exec vitest run feature/environment.test.ts`

Expected: FAIL because the idempotent bootstrap option and `environment.ts` do not exist.

- [x] **Step 3: Implement the helper** with Node child processes, loopback health checks, local file DB values, an idempotent first-admin bootstrap check, and signal-safe cleanup. Strip inherited Turso/AWS credentials, refuse non-local database/storage endpoints in `.env`, and do not overwrite `.env` or kill an occupied port's owner.
- [x] **Step 4: Extend tests for resuming an initialized DB and port collision.** Assert an existing administrator is not bootstrapped again and a port collision leaves the unrelated process running.
- [x] **Step 5: Run both focused test files.**

Run: `pnpm --filter server exec vitest run src/auth/auth.integration.test.ts` and `pnpm --filter trust-pipeline exec vitest run feature/environment.test.ts`

Expected: PASS; an existing account remains unchanged, and children started by the helper stop on normal completion and Ctrl-C while unrelated processes remain untouched.

### Task 3: Add the one-command product worktree launcher

**Files:**
- Create: `scripts/product-feature.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `trust-pipeline/feature/product-launcher.test.ts`

**Interface:**
- `pnpm product:feature --id <ID> --app <admin|blog> [--base-ref <ref>] [--resume]`.
- Default base: fetched `origin/main`; explicit `--base-ref` is required to stack. Create branch `product/<ID>` in `.worktrees/<ID>` and print the chosen base SHA.
- `--resume` cannot be combined with `--base-ref`; accept only branch `product/<ID>` registered at `.worktrees/<ID>` with a matching `apps/server/.local/product-<ID>.json` setup marker. Preserve dirty files, reuse `apps/server/.local/product-<ID>.db`, and rerun frozen dependency installation.

- [x] **Step 1: Add failing launcher integration tests** with a temporary Git repository and stub `pnpm`: assert default/base-ref branch creation, frozen dependency install without invoking `pnpm verify`, invalid ID/app and non-local `.env` refusal, collision refusal without `--resume`, exact branch/path and setup-marker validation with `--resume`, and preservation of dirty files.
- [x] **Step 2: Run the focused test and confirm it fails.**

Run: `pnpm --filter trust-pipeline exec vitest run feature/product-launcher.test.ts`

Expected: FAIL because the launcher and root script do not exist.

- [x] **Step 3: Implement the standard-library launcher**: fetch and resolve the base; refuse existing branch/path; create the worktree; install frozen dependencies; verify the worktree remains clean; write `apps/server/.local/product-<ID>.json` with the feature ID, app, and base SHA as the setup marker. Do not run the trust pipeline before product handoff. For `--resume`, require the matching marker and exact managed branch/path, preserve existing changes, and rerun frozen dependency installation. Both paths validate/create a local `.env` without overwriting and refuse a non-file DB URL, then invoke the managed local environment and `pnpm product` inside the worktree.
- [x] **Step 4: Keep engineering credentials out of product setup.** The launcher does not load or forward `JEV_API_KEY`; do not pass engineering review credentials to the app or product-agent processes.
- [x] **Step 5: Run launcher tests.**

Run: `pnpm --filter trust-pipeline exec vitest run feature/product-launcher.test.ts`

Expected: PASS; base and collision cases leave the invoking checkout untouched, and product setup proceeds without running the trust pipeline.

### Task 4: Use managed environments for feature E2E and update handoff guidance

**Files:**
- Modify: `trust-pipeline/feature/cli.ts`
- Create: `trust-pipeline/feature/cli.test.ts`
- Modify: `.opencode/agents/product-dev.md`
- Modify: `.opencode/agents/engineering.md`
- Modify: `FEATURE-PILOT.md`
- Modify: `docs/verification-first/product-agent-and-e2e-acceptance.md`
- Modify: `docs/verification-first/engineering-agent-and-trust-pipeline-acceptance.md`

**Behavior:**
- With `FEATURE_BASE_URL` set, retain the current loopback-only external environment behavior.
- Without it, read `manifest.app`, create a fresh temporary local DB, run migrations/bootstrap, run only selected tests, then stop owned processes and delete only that run's DB.
- Product handoff lists temporary tracked overrides; engineering owns their disposition. Accepted Playwright files remain unchanged.

- [x] **Step 1: Add failing CLI tests** asserting: no `FEATURE_BASE_URL` starts the manifest-selected app and runs selected tagged tests; a supplied loopback URL bypasses managed startup; invalid app or zero selected tests fails before launching tests; cleanup runs on both pass and failure.
- [x] **Step 2: Run the focused test and confirm the managed path is absent.**

Run: `pnpm --filter trust-pipeline exec vitest run feature/cli.test.ts`

Expected: FAIL because feature tests currently require `FEATURE_BASE_URL`.

- [x] **Step 3: Integrate `withManagedEnvironment` into precheck/E2E** only when the external URL is absent. Keep capture artifacts and feature test selection unchanged.
- [x] **Step 4: Run the focused CLI and manifest tests.**

Run: `pnpm --filter trust-pipeline exec vitest run feature/cli.test.ts feature/manifest.test.ts`

Expected: PASS for managed and explicit external-loopback paths.

- [x] **Step 5: Replace setup instructions with the launcher command** and document the base policy, product-phase pipeline deferral, local migration/health readiness, and engineering-owned local-override handoff in the listed agent/docs files.
- [x] **Step 6: Run the full trust pipeline and inspect the accepted E2E diff.**

Run: `pnpm verify` (default review base is `HEAD`, the Task 4 base for this uncommitted diff).

Expected: all stages pass; existing accepted Playwright files have no diff; only the documented CSS specificity warning remains. Do not set `VERIFY_BASE_REF=main` on this branch: it includes the stacked parent branch and exceeds Jev's request limit.
