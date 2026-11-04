# First Feature Pilot: Product → E2E → Engineering

Use this runbook to take one real feature through the product workflow, establish
browser acceptance tests, then exercise the engineering agent and trust pipeline.
Keep the pilot small; the goal is to prove the workflow, not build more workflow
infrastructure.

## Resume here

- The workflow tooling is developed on
  `feature/automate-product-environment`, stacked on
  `verification-first-engineering-agent`. While testing this unmerged launcher,
  use `--base-ref HEAD`. After the tooling reaches `main`, omit `--base-ref` so
  product branches start from fetched `origin/main`.
- There are no feature manifests under `docs/features/` or Playwright specs
  under `tests/` yet.

## Current handoff

- The launcher resumes an exact managed worktree by default; `--reset` is
  destructive and only for an intentional restart.
- Local admin bootstrap prompts for a password when needed. The parent shell's
  `BOOTSTRAP_PASSWORD` is not forwarded.
- `pnpm verify` passes on this branch. Next, rerun
  `pnpm product:feature --id blog-comments --app blog --base-ref HEAD` from the
  repository root and enter a valid password if prompted. This resumes the
  existing worktree and database; do not pass `--reset`.

## 1. Start an isolated product session

Choose a stable feature ID, for example `BLOG-123`, and target app. From the
repository root run:

```sh
pnpm product:feature --id BLOG-123 --app blog --base-ref HEAD
```

The launcher creates `.worktrees/BLOG-123` on `product/BLOG-123` and installs
frozen dependencies. It does not run `pnpm verify`; engineering runs the trust
pipeline after handoff. The launcher creates a local file DB, migrates it,
bootstraps a local admin if needed, starts the server and blog app, checks
health, and launches `product-dev`. It preserves existing `.env` files, rejects
remote database or storage endpoints, and never kills unrelated processes.
Setup failures should be reported to engineering.

After Ctrl-C, rerun the same command to resume without resetting product
changes (`--resume` is optional):

```sh
pnpm product:feature --id BLOG-123 --app blog --resume
```

To intentionally start over, pass `--reset`. This deletes the managed
worktree, local branch, database, `.env`, and all other local worktree data:

```sh
pnpm product:feature --id BLOG-123 --app blog --base-ref HEAD --reset
```

**Check:** the launcher prints the selected loopback URL after the server and
app health checks pass. The app is available for interactive use with local
data. Prepare any feature-specific fixtures through supported app flows.

## 2. Implement and accept the product behavior

The launcher starts `product-dev` inside the isolated worktree. Iterate with the
agent in the running app; the managed processes remain available for the
session. This phase is not the engineering gate. Only the product owner
declares acceptance.

At acceptance, record the accepted implementation commit and write
`docs/features/<FEATURE_ID>/feature.yaml` with the requirements, user scope,
environment/fixture notes, and Gherkin acceptance scenarios. The manifest's
required fields are:

```yaml
schemaVersion: 2
id: BLOG-123
app: blog
acceptance:
  acceptedSha: <full 40-character accepted product commit SHA>
  playwrightTag: "@feature-BLOG-123"
  tests:
    - tests/blog-123.spec.ts
```

The E2E test path may be filled in after the next step. `feature:validate`
requires at least one real test path, so it is expected not to pass until the
tests have been authored. Keep `acceptedSha` as the product-approved revision;
adding tests later does not change what product accepted.

In the product handoff, list temporary tracked local overrides by path and
purpose, or state that there are none. Engineering decides whether to keep each
with tests or remove it with a targeted change, and records that disposition in
the PR. Do not remove overrides silently before handoff.

**Check:** product can demonstrate each Gherkin scenario in the browser, the
accepted commit is recorded, and the manifest documents the approved behavior.

## 3. Author and approve the browser acceptance tests

While the accepted app is running, ask the `e2e-author` subagent to map each
Gherkin scenario to Playwright tests under `tests/`. Have it propose observable
assertions for product review, then approve them before proceeding.

Tests should use stable semantic locators, reproducible authentication/fixtures,
and browser-visible assertions. Avoid fixed waits, unstable data, and assertions
about internal APIs or database state. Add the `@feature-BLOG-123` tag and update
the manifest's `acceptance.tests` list to the exact test file paths.

Run the selected feature tests in a fresh managed local environment:

```sh
pnpm feature:precheck --id BLOG-123
```

The manifest selects the app. Use `FEATURE_BASE_URL=http://127.0.0.1:<port>`
only when intentionally testing against an already-running loopback app.

**Check:** the accepted feature tests are selected, at least one test runs, all
pass from a clean test state, and product approves the expected results. Commit
the tests and manifest. From this point on, preserve accepted E2E files; if
expected behavior changes, get product to re-accept it rather than weakening
assertions to get a pass.

## 4. Validate the manifest and capture a passing precheck

Validate the manifest, then run precheck. It starts the manifest-selected app
and a fresh disposable local database by default:

```sh
pnpm feature:validate --id BLOG-123
pnpm feature:precheck --id BLOG-123 --capture
```

To use an already-running external test app, set `FEATURE_BASE_URL` to its
loopback URL (port 3001 for admin or 3000 for blog). Non-loopback URLs are
rejected.

**Check:** validation succeeds; precheck selects the feature's tagged tests (not
zero tests); every test passes; the result reports `failed: 0`; and a successful
run is recorded under `.artifacts/features/BLOG-123/` as the latest capture.
The capture is Playwright evidence (trace/video/screenshots), not GraphQL or
Drizzle/database instrumentation.

The feature CLI runs against the current checkout. Managed runs migrate a
disposable local DB, start only the app in the manifest, run the selected tagged
tests, and remove that run's temp directory on pass or failure. The optional
`FEATURE_BASE_URL` override retains the existing external-loopback path. The CLI
does not verify accepted test files against a stored file hash; protecting
approved tests remains a process/review responsibility.

## 5. Run the engineering agent and trust pipeline

The trust pipeline's review stage needs `JEV_API_KEY` in
`trust-pipeline/.env`. Start the engineering session:

```bash
pnpm engineer
```

Then run this command in the OpenCode session:

```text
/engineer BLOG-123
```

The engineering workflow validates and prechecks the feature in its managed
local environment, stops if accepted E2E tests fail, creates a generation brief
from the latest successful capture, invokes `contract-test-author`, runs
`pnpm verify`, and rechecks the accepted E2E tests in another managed
environment. The `generate-tests` CLI command creates the brief; it does not
invoke the subagent by itself. Use the loopback `FEATURE_BASE_URL` override only
when intentionally testing against an externally started app.

**Check:**

- The brief references the correct feature, accepted SHA, tests, and latest
  successful capture.
- Contract/integration tests are based on observed behavior and pass without
  requiring browser E2E setup, migrations, or real external services.
- `pnpm verify` completes successfully, including its final review stage.
- The final feature E2E run passes in a fresh managed local environment, or
  against an explicitly selected loopback override and disposable data.
- The accepted Playwright tests have not been modified; inspect `git diff` to
  confirm.

If a check fails, determine whether the cause is the app, environment, fixture,
or test. Fix the cause and rerun. Do not change accepted assertions merely to
make the pipeline green.

## Known limits of this pilot

- The managed feature runner starts the manifest-selected app by default;
  `FEATURE_BASE_URL` remains an explicit loopback-only override.
- Capture currently provides Playwright artifacts, not client/server/Drizzle
  boundary recordings.
- Accepted E2E immutability is enforced by workflow and review, not a runtime
  SHA comparison.
