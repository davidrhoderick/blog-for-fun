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
command, supplying only a feature ID and target app. Scripts own repeatable Git
and environment operations; `product-dev` remains responsible for interactive
product behavior, not infrastructure guesswork. Technical failures and setup
workarounds go to engineering, not back to product as implementation questions.

## Branch and base policy

- This automation branch is intentionally stacked on
  `verification-first-engineering-agent`, because that branch contains the
  feature workflow being extended.
- For product features, the default base is the latest fetched `origin/main`.
  The workflow tooling must be merged to `main` before the normal launcher is
  used. It must not silently substitute the current branch if `main` lacks the
  launcher.
- Stacking a product feature on another branch is an explicit choice. The
  launcher reports the exact base SHA before creating the worktree. It never
  rebases an existing branch.

## Proposed interface

```sh
pnpm product:feature --id BLOG-123 --app blog
# Resume that managed feature worktree later:
pnpm product:feature --id BLOG-123 --app blog --resume
```

The root command is a Node.js standard-library script so it can run before
workspace dependencies are installed. It fetches the selected base and creates
branch `product/<id>` at `.worktrees/<id>`, then provisions the local app
environment, starts the server and selected UI, checks readiness, and launches
the existing `pnpm product` session in that worktree. `--app` accepts `admin`
or `blog`. An optional `--base-ref` is for explicit stacking; the normal default
is the latest fetched `origin/main`. While developing this helper before it is
merged, test it with `--base-ref HEAD` so the new worktree contains the helper.

Without `--resume`, the launcher fails clearly if its target branch/worktree
already exists or the requested base cannot be resolved. `--resume` is explicit:
it accepts only the `product/<id>` branch registered at the exact
`.worktrees/<id>` path, reuses its local database, and preserves all tracked and
untracked changes. Resume cannot be combined with `--base-ref`; it does not
fetch, rebase, reset, or rerun baseline verification against a branch that may
contain product edits. It reruns `pnpm install --frozen-lockfile` to match the
worktree's current lockfile.

The launcher never rebases or modifies the invoking worktree. It never
force-removes a worktree, deletes product data, or kills a process it did not
start. On exit it stops only its own app processes and keeps the feature
worktree and local database for resuming work.

## Environment behavior

- In order: create the worktree, run `pnpm install --frozen-lockfile`, run
  `VERIFY_BASE_REF=<selected-base> pnpm verify`, provision and migrate the local
  database, start the server and selected UI, verify readiness, then launch the
  product agent. If baseline verification fails, stop before product work and
  report the failure to engineering; product should not have to diagnose it.
- On `--resume`, validate the exact managed branch/path, preserve the worktree,
  rerun frozen dependency installation, and skip baseline verification; then
  migrate/reuse the persistent local DB and run app health checks.
- Check `git status` before and after baseline verification. Never clean or reset
  generated/user changes automatically. If verification requires the pipeline's
  `JEV_API_KEY` and it is unavailable, report that as an engineering setup
  prerequisite rather than asking product to troubleshoot it.
- Create `apps/server/.env` in the new worktree only when absent. Use a local
  file-backed database and local-only credentials; never copy or overwrite the
  user's existing environment. Refuse any setup that would target a non-local
  database. Add `.worktrees/` to the root ignore rules.
- Run `pnpm install --frozen-lockfile` and database migrations. On a fresh local
  database, bootstrap one local administrator; detect an existing account and
  skip bootstrap when resuming. Use the repository's existing package scripts;
  their dev commands already run the relevant codegen.
- Keep the persistent product database at
  `apps/server/.local/product-<id>.db`; this directory is already ignored.
  Managed E2E uses and removes a separate temporary directory under the OS temp
  directory.
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
- At product handoff, list any temporary tracked local-override changes and
  their purpose. The engineering agent classifies each one: make a necessary
  change durable with tests, or remove it with a targeted change and verify the
  app still works. Include the decision in the handoff/PR comments; never
  discard such changes silently or ask product to solve the technical issue.
- Preserve accepted E2E files; do not add runtime SHA comparisons.

## Acceptance checks

1. From a fresh checkout, the launcher fetches `origin/main`, creates
   `product/<id>` in `.worktrees/<id>`, installs dependencies, and runs baseline
   verification before product changes. It does not edit the invoking worktree
   or require the user to configure `.env`.
2. Migrations run against that local database; bootstrap credentials are
   local-only and bootstrap runs once for each fresh database.
3. The server and selected app start only after migrations. Health checks pass
   before the product agent launches. An occupied port, existing branch/path,
   invalid ID/app, or non-local database fails safely without deleting or
   rewriting user state.
4. A fresh invocation that collides with an existing branch/path fails without
   changing it. `--resume` accepts only the matching managed branch/path,
   preserves all changes, reuses its database, and does not change existing
   administrator credentials. Ctrl-C stops only launcher-owned processes and
   leaves the worktree/database available.
5. `feature:precheck` and `feature:e2e` run without `FEATURE_BASE_URL` by using
   the manifest app and a disposable migrated database; an explicit loopback
   URL continues to work.
6. Existing tests pass, new setup behavior has focused tests, accepted E2E
   files are unchanged, and `pnpm verify` passes.
7. Every temporary tracked override is listed at handoff and has an explicit
   engineering disposition in the eventual PR/comments.

## Not in scope

- Rebasing a user's active branch or resolving Git conflicts automatically.
- Production/shared database access, Docker setup, or arbitrary seed shell
  commands from feature manifests.
- Silent stacking on a non-main branch or automatic rebasing.
- Changing product-approved browser behavior or adding speculative E2E cases.
- Capturing GraphQL or Drizzle traffic; the current capture remains Playwright
  trace/video/screenshot output.
