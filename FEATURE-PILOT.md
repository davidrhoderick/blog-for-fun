# First Feature Pilot: Product → E2E → Engineering

Use this runbook to take one real feature through the product workflow, establish
browser acceptance tests, then exercise the engineering agent and trust pipeline.
Keep the pilot small; the goal is to prove the workflow, not build more workflow
infrastructure.

## Resume here

- The workflow tooling is on branch `verification-first-engineering-agent` at
  `96485b0` (snapshot from 2026-10-30); there was no PR open then. Check the
  branch and remote before continuing.
- To use `pnpm feature:*` now, either stack the pilot on that branch or merge
  the tooling branch first and branch the feature from updated `main`. The
  product acceptance instructions prefer a branch off `main` unless stacking
  is explicitly intended.
- There are no feature manifests under `docs/features/` or Playwright specs
  under `tests/` yet.

## 1. Pick the feature and prepare a disposable environment

Choose a stable feature ID, for example `BLOG-123`. Never use production or a
shared database for product iteration or E2E tests.

If `apps/server/.env` does not exist, copy `apps/server/.env.example` and set a
local database, for example:

```dotenv
TURSO_CONNECTION_URL=file:local.db
TURSO_AUTH_TOKEN=local-token
```

Apply migrations and create a local admin account if the feature needs one:

```bash
pnpm --filter server db:migrate
pnpm --filter server auth:bootstrap
```

Run the server and only the app being changed, each in its own terminal:

```bash
pnpm --filter server run dev
pnpm --filter admin run dev  # admin on 3001; use blog on 3000 for blog work
```

**Check:** `curl -fsS http://127.0.0.1:4000/health` succeeds, the app opens in
the browser, and the feature can be exercised using only disposable local data.
Prepare any required fixtures yourself. Feature commands do not start the app,
run migrations, seed data, or clean up the environment.

## 2. Implement and accept the product behavior

From the repository root, run:

```bash
pnpm product
```

Iterate with `product-dev` in the running app. Keep the app operational and focus
on user-visible behavior; this phase is not the engineering gate. Only the
product owner declares acceptance.

At acceptance, record the accepted implementation commit and write
`docs/features/<FEATURE_ID>/feature.yaml` with the requirements, user scope,
environment/fixture notes, and Gherkin acceptance scenarios. The manifest's
required fields are:

```yaml
schemaVersion: 1
id: BLOG-123
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

Run the tests against the app you started:

```bash
FEATURE_BASE_URL=http://127.0.0.1:3001 pnpm e2e
```

Use port `3000` for the blog instead. Recreate/reset the disposable database and
fixtures as needed to confirm the tests are reproducible.

**Check:** the accepted feature tests are selected, at least one test runs, all
pass from a clean test state, and product approves the expected results. Commit
the tests and manifest. From this point on, preserve accepted E2E files; if
expected behavior changes, get product to re-accept it rather than weakening
assertions to get a pass.

## 4. Validate the manifest and capture a passing precheck

Start the app with a fresh, disposable database/fixture state. In the terminal
where you run feature commands, set the URL to the app under test:

```bash
export FEATURE_BASE_URL=http://127.0.0.1:3001
pnpm feature:validate --id BLOG-123
pnpm feature:precheck --id BLOG-123 --capture
```

**Check:** validation succeeds; precheck selects the feature's tagged tests (not
zero tests); every test passes; the result reports `failed: 0`; and a successful
run is recorded under `.artifacts/features/BLOG-123/` as the latest capture.
The capture is Playwright evidence (trace/video/screenshots), not GraphQL or
Drizzle/database instrumentation.

The feature CLI runs against the current checkout and the externally supplied
`FEATURE_BASE_URL`. It does not verify accepted test files against a stored file
hash; protecting approved tests is a process/review responsibility.

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

The engineering workflow validates and prechecks the feature, stops if accepted
E2E tests fail, creates a generation brief from the latest successful capture,
invokes `contract-test-author`, runs `pnpm verify`, and rechecks the accepted
E2E tests. The `generate-tests` CLI command creates the brief; it does not invoke
the subagent by itself.

**Check:**

- The brief references the correct feature, accepted SHA, tests, and latest
  successful capture.
- Contract/integration tests are based on observed behavior and pass without
  requiring browser E2E setup, migrations, or real external services.
- `pnpm verify` completes successfully, including its final review stage.
- The final feature E2E run passes against the externally started app and
  disposable data.
- The accepted Playwright tests have not been modified; inspect `git diff` to
  confirm.

If a check fails, determine whether the cause is the app, environment, fixture,
or test. Fix the cause and rerun. Do not change accepted assertions merely to
make the pipeline green.

## Known limits of this pilot

- You provision and operate the local app/database; the feature runner only
  selects and runs tests against `FEATURE_BASE_URL`.
- Capture currently provides Playwright artifacts, not client/server/Drizzle
  boundary recordings.
- Accepted E2E immutability is enforced by workflow and review, not a runtime
  SHA comparison.
