# Local Product Environment Design

**Status:** Proposed; implementation waits for product-owner review.

## Problem

The product workflow asks a team member to understand this repository's worktree,
environment, database, migration, bootstrap, and app-start commands. The feature
test CLI also requires a manually started app through `FEATURE_BASE_URL`. An
agent can run shell commands, but these steps are not a safe, repeatable setup
interface.

## Goal

Let a product team member start an isolated local feature session with one
command. Scripts own repeatable Git and environment operations; `product-dev`
remains responsible for interactive product behavior, not infrastructure
guesswork.

## Proposed interface

```sh
pnpm product:feature --id BLOG-123 --app blog
```

The root command is a Node.js standard-library script so it can run before
workspace dependencies are installed. It fetches `origin/main` and creates
branch `product/<id>` at
`.worktrees/<id>`, then provisions the local app environment, starts the server
and selected UI, checks readiness, and launches the existing `pnpm product`
session in that worktree. `--app` accepts `admin` or `blog`. An optional
`--base-ref` supports deliberate stacking and local testing; the default is the
latest fetched `origin/main`. While developing this helper before it is merged,
test it with `--base-ref HEAD` so the new worktree contains the helper.

The launcher must not rebase or modify the invoking worktree. It fails clearly
if its target branch/worktree already exists or the requested base cannot be
resolved. It never force-removes a worktree, deletes user data, or kills a
process it did not start. On exit it stops only its own app processes and keeps
the feature worktree and local database for resuming work.

## Environment behavior

- Create `apps/server/.env` in the new worktree only when absent. Use a local
  file-backed database and local-only credentials; never copy or overwrite the
  user's existing environment. Refuse any setup that would target a non-local
  database. Add `.worktrees/` to the root ignore rules.
- Run `pnpm install --frozen-lockfile` and database migrations. On a fresh local
  database, bootstrap one local administrator; detect an existing account and
  skip bootstrap when resuming. Use the repository's existing package scripts;
  their dev commands already run the relevant codegen.
- Use the existing local-only bootstrap defaults (`dev@example.com`,
  `Dev Admin`, `dev-only`) for the local file database. Keep these credentials
  out of remote environments and source-controlled files.
- Start the server and only the selected app. Wait for `/health` and the app
  endpoint before launching `product-dev`; pass and display the selected
  loopback URL. If a required port is occupied, stop with a useful message; do
  not kill its owner.
- Handle process shutdown on normal exit, Ctrl-C, and termination. Do not run
  the trust pipeline during product iteration.

## Feature E2E integration

Add a required top-level `app` field (`admin` or `blog`) and bump the feature
manifest to `schemaVersion: 2`. Reuse the environment-starting code for
`feature:precheck` and `feature:e2e`; they can start the right UI without a
manually exported `FEATURE_BASE_URL`. Keep an explicitly supplied
`FEATURE_BASE_URL` as a loopback-only external-environment override for existing
use cases. Managed E2E runs use a separate disposable local database, run
migrations and local admin bootstrap, start the server/UI, execute the selected
tests, then stop only the processes and remove the database they created. Pass
the local DB URL/token in child-process environments so an existing `.env`
cannot redirect managed tests to another database.

This does not add a generic arbitrary seed-command field to the manifest.
Feature-specific fixtures remain explicit and safe; accepted browser tests
should create the data they need through supported user flows where practical.
Any remaining fixture requirement must be recorded for the pilot rather than
silently inferred by the launcher.

## Runbook and agent changes

- Replace manual environment instructions in `FEATURE-PILOT.md` with the single
  product launcher command and its observable readiness checks.
- Update `product-dev` instructions to use the prepared local environment and
  avoid asking product to configure the repository.
- Update engineering instructions so precheck/E2E use the managed environment
  by default and retain the explicit external URL override.
- Preserve accepted E2E files; do not add runtime SHA comparisons.

## Acceptance checks

1. From a fresh checkout, the launcher fetches `origin/main`, creates
   `product/<id>` in `.worktrees/<id>`, and starts the selected app against a
   local file database without editing the invoking worktree or requiring the
   user to configure `.env`.
2. Migrations run against that local database; bootstrap credentials are
   local-only and bootstrap runs once for each fresh database.
3. Health checks pass before the product agent launches. An occupied port,
   existing branch/path, invalid ID/app, or non-local database fails safely
   without deleting or rewriting user state.
4. Ctrl-C stops only launcher-owned processes and leaves the worktree/database
   available to resume. A repeated launch reuses the database and does not run
   first-admin bootstrap again.
5. `feature:precheck` and `feature:e2e` run without `FEATURE_BASE_URL` by using
   the manifest app and a disposable migrated database; an explicit loopback
   URL continues to work.
6. Existing tests pass, new setup behavior has focused tests, accepted E2E
   files are unchanged, and `pnpm verify` passes.

## Not in scope

- Rebasing a user's active branch or resolving Git conflicts automatically.
- Production/shared database access, Docker setup, or arbitrary seed shell
  commands from feature manifests.
- Changing product-approved browser behavior or adding speculative E2E cases.
- Capturing GraphQL or Drizzle traffic; the current capture remains Playwright
  trace/video/screenshot output.
