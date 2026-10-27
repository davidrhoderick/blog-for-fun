# OpenCode Engineering Workflow

**Status:** Ready for a first implementation trial
**OpenCode baseline:** 2.1.4 (v2 only; routine patch and minor updates are supported)
**Writing style:** ASD-STE100-inspired controlled English; not certified against ASD-STE100.

## 1. Purpose

Turn a product-accepted feature into a verified, maintainable change. Preserve its accepted browser behavior while allowing engineering to change APIs, database contracts, abstractions, and other internal structures.

Use one OpenCode engineering agent and one **contract-test-author** subagent. Use deterministic scripts and Git for verification and recovery. Do not add mandatory review agents, feature flags, mutation testing, or blast-radius analysis in the first version.

The **accepted E2E tests define functional behavior**. Captured internal contracts and generated integration tests are provisional. Engineering can change them. A human engineer reviews the final implementation only after automatic checks pass, unless the agent becomes blocked.

## 2. Inputs and outputs

### Inputs from the product workflow

- An accepted source revision and a reproducible Git reference.
- Executable Playwright tests with product-approved assertions.
- A stable feature identifier and optional Gherkin feature file.
- The test environment profile: host-process startup, ports, migrations, fixture or seed instructions, users, secrets, and health checks.
- Product requirements and a short statement of expected behavior.

### Outputs

- Passing, inexpensive tier-level integration tests based on captured behavior.
- An implementation that passes `pnpm verify`.
- A passing replay of the feature's accepted E2E tests in a fresh environment.
- A reviewable PR with normal source diffs and the prototype-to-final diff.
- A record of engineering corrections, new rules, and verification evidence.
- A merge-ready final revision after human approval and CI checks, unless an explicit repository policy permits a fast path.

## 3. One feature manifest

Use **one versioned feature manifest** to collect the definition, identity, Gherkin reference, acceptance baseline, test selectors, and state. The manifest is stored in Git at `docs/features/<FEATURE_ID>/feature.yaml`. The feature ID does not depend on the branch name.

Example:

```yaml
schemaVersion: 1
id: INS-123
title: Add comments to posts
state: ACCEPTED
requirements:
  summary: A signed-in user can add and read comments on a post.
  gherkin: docs/features/INS-123/comments.feature # optional
  ticket: INS-123 # optional external ticket reference
acceptance:
  acceptedSha: '1111111111111111111111111111111111111111' # full Git SHA
  baselineRef: refs/tags/accepted/INS-123
  playwrightTag: '@feature-INS-123'
  tests:
    - tests/comments.spec.ts
  fixtureProfile: comments-happy-path-v1
  seedScript: null # optional path under docs/features/INS-123/
  approvedBy: product-owner
  approvedAt: '2026-10-26T12:00:00Z'
engineering:
  reviewPr: null
  rulePr: null
  latestVerifiedSha: null
  followUps: []
  corrections: []
```

`acceptedSha` identifies the **complete accepted baseline**: implementation, E2E files, and test-data references as they existed when acceptance replay passed. Use this two-commit sequence to avoid an impossible self-referencing Git SHA:

1. Commit the accepted source, approved E2E tests, and fixtures with the manifest still in `RECORDING` state. Replay the tests and record this commit's SHA.
2. Create a durable `accepted/<FEATURE_ID>` tag or protected ref pointing to that commit. Then update the manifest with `acceptedSha`, approval details, and `state: ACCEPTED` in a subsequent commit.

The engineering scripts read the **current manifest** from the feature branch, but run the immutable acceptance code and tests from `acceptedSha` in a separate worktree. Do not change the accepted SHA after engineering begins. If product changes the accepted behavior, create a **new baseline version** with a new accepted SHA and an explicit acceptance event.

The top-level `state` and `engineering` section are mutable process fields. The accepted SHA, Gherkin acceptance version, and E2E test content are locked to the baseline. Record every state transition with its revision, evidence, and reason. Do not treat a manually edited `state: APPROVED` value as evidence of successful checks. The evidence files are the proof.

### States

`DRAFT` → `ACCEPTED` → `PRECHECK` → `CONTRACT_TESTS` → `VERIFYING` → `E2E_RECHECK` → `ENGINEERING_REVIEW` → `APPROVED` → `MERGED`.

A stage can move to `BLOCKED`, with a reason and an operator action. Engineering feedback returns to `VERIFYING`, followed by `E2E_RECHECK` and renewed review. A correction that changes approved product behavior requires a new product acceptance baseline.

## 4. Repository integration

The existing repository layout is documented in [AGENTS.md](../../AGENTS.md). Do not duplicate it here. This workflow adds only the following files:

```text
.opencode/
  agents/engineering.md            # Primary agent
  agents/contract-test-author.md   # Subagent
  commands/engineer.md             # /engineer <FEATURE_ID>
  commands/respond-review.md       # /respond-review <FEATURE_ID>
docs/features/<FEATURE_ID>/
  feature.yaml
  <name>.feature                  # Optional Gherkin
tests/
  <feature>.spec.ts               # Playwright acceptance test
  fixtures/recorded/<FEATURE_ID>/ # Small, redacted recordings
trust-pipeline/feature/           # Manifest, selection, capture, cleanup CLIs
.artifacts/features/<FEATURE_ID>/<runId>/ # Gitignored raw output
```

- `tests/` is the Playwright `testDir`. Do not add `tests/e2e` or `tests/integration`.
- Generated Vitest tests are colocated with the code they exercise, as required by [docs/testing.md](../testing.md). Do not create a root integration tree.
- Feature workflow CLIs live in `trust-pipeline/feature/` so the existing typecheck, test, and coverage commands cover them. Root `pnpm feature:*` scripts are thin aliases.
- Store large HAR files, full traces, screenshots, and videos in `.artifacts/` or restricted CI artifact storage. Commit only small, redacted recordings in `tests/fixtures/recorded/`.
- Keep `.artifacts/` in `.gitignore`.

## 5. Test ownership and selection

### E2E tags

Use the stable feature ID for all new acceptance scenarios. Product-authored acceptance scenarios start in the **smoke** category. QA can later recategorize tests as smoke or regression and add regression scenarios.

```ts
import { test, expect } from '@playwright/test'

test.describe('Post comments', {
  tag: ['@feature-INS-123', '@smoke'],
}, () => {
  test('persists a submitted comment after refresh', async ({ page }) => {
    // Accepted browser interactions and observable assertions.
  })
})
```

Acceptance tests live in `tests/<feature>.spec.ts`. The feature-specific runner reads `acceptance.playwrightTag` from the manifest. It discovers tests before execution. **Zero selected tests is a hard failure**. Also fail on a missing file, ambiguous identifier, or a selector that matches a different feature.

For example, a feature runner can call Playwright with `--grep '@feature-INS-123'`. It must verify the exact feature tag from structured test metadata, not trust a substring match. Never use the current branch name to find tests.

### Test execution policy

| Event | E2E selection | Other checks |
| --- | --- | --- |
| Product accepts the feature | Accepted feature tag | Fresh environment and replay |
| Engineering precheck | Accepted feature tag only | Capture enabled |
| Agent correction loop | None per ordinary iteration | `pnpm verify` |
| Post-refactor checkpoint | Accepted feature tag only | `pnpm verify` must be green |
| PR review correction | Accepted feature tag only | `pnpm verify` again |
| Scheduled suite | All smoke, regression, or both | Per CI schedule |
| Later blast-radius support | Affected old scenarios plus feature tests | Future scope |

A daily scheduled run can execute the full smoke suite and the broader regression suite. Keep their results separate for prioritization. A failed scheduled regression does not automatically block an unrelated interactive product session. Normal CI merge policy still applies.

## 6. Tier-level capture and test design

### Capture during the successful precheck

Start the accepted revision in a disposable host environment. Run migrations and the manifest's fixture or seed instructions. Enable capture. Execute **only** the feature's E2E tests. If any fail, stop before generating integration tests.

Enable durable capture with:

```sh
pnpm feature:precheck --id INS-123 --capture
```

Without `--capture`, the precheck still runs the feature tests but does not keep durable Playwright output. With `--capture`, Playwright writes trace, video, and screenshots to a new run directory. It never overwrites a previous run. `pnpm feature:generate-tests --id INS-123 --run latest` reads the newest successful recording.

Instrumentation records:

- **Browser/frontend:** GraphQL operation name, variables, response data and errors, status, and necessary headers. A Playwright trace can capture the browser view; HTTP capture is optional.
- **Server/API:** the received GraphQL operation, variables, normalized result, relevant downstream requests, and correlation IDs.
- **Service/database boundary:** Drizzle SQL, parameters, returned rows or errors, and relevant persistence effects. Attach capture hooks to the server or database client. A Playwright browser fixture cannot observe these calls.

This repository has no named database-client methods. Capture the Drizzle query and its parameters, not an invented `comment.create` method.

Associate each capture with a `featureId`, `scenarioId`, `runId`, and trace/correlation ID. Carry these values from browser to server in headers such as `x-feature-id`, `x-scenario-id`, and `x-run-id`. The admin GraphQL proxy must forward those headers. Record missing associations as gaps; do not invent a causal connection.

Redact secrets and personal data **before** writing artifacts. Normalize timestamps, generated IDs, and other unstable values with typed placeholders. Record original ordering for diagnosis, but do not assert incidental call order unless the contract requires it.

Example recording envelope:

```json
{
  "schemaVersion": 1,
  "featureId": "INS-123",
  "scenarioId": "persist-comment",
  "runId": "capture-001",
  "events": [
    {
      "tier": "client",
      "operation": "PostComment",
      "input": { "postId": "post-1", "text": "Hello" },
      "output": { "data": { "postComment": { "id": "$commentId", "text": "Hello" } } }
    },
    {
      "tier": "server",
      "operation": "PostComment",
      "input": { "postId": "post-1", "text": "Hello" },
      "output": { "id": "$commentId", "text": "Hello" }
    },
    {
      "tier": "db",
      "operation": "insert comments",
      "input": { "postId": "post-1", "text": "Hello" },
      "output": { "id": "$commentId", "text": "Hello" }
    }
  ]
}
```

This is an observation record. It is **not** the permanent architectural contract.

### Contract-test-author subagent

The subagent reads recordings, accepted browser scenarios, and the current implementation. It creates **fast tier-level integration tests** with Vitest and reusable fixtures. Use the following boundaries:

| Tier | Real code under test | Test boundary |
| --- | --- | --- |
| Frontend | Actual route, component, Relay environment, and client state | Inject or stub the Relay fetch function. MSW is optional and is not currently a dependency. |
| Server | Actual Yoga schema, resolvers, validation, and auth context | Invoke `createApp().fetch('http://localhost/graphql', ...)`. Mock the service or database boundary. |
| Service | Actual domain/service behavior and orchestration | Replay recorded Drizzle results and assert database calls where a seam exists. Optional if the service has no mockable boundary. |
| E2E | Whole deployed application and real test database | Real migrations, fixture data, browser, and server. |

The server tests **simulate GraphQL requests that the frontend would send**. They do not need a real browser or real frontend instance. The frontend tests do not need the server process.

Generated tier tests must not require Docker, database migrations, real outbound calls, real waits, or intentional mock latency. Use controlled clocks and deterministic fixtures. Existing database-backed `integration` tests in the repository remain; they are not generated contract tests and must not be deleted.

Favor direct function invocation or an in-process request harness. The server tier can use the existing `app.fetch()` pattern. The frontend tier can use the existing injectable Relay fetch function.

**One test, one behavioral assertion** is the preferred unit of organization. A test may use multiple technical `expect` statements to establish that single behavior. Do not split a coherent user-visible invariant into artificial microtests. Use separate tests for separate behavior such as loading comments and posting a comment.

Generated tests are colocated with the code they exercise and tagged `integration`. Follow [docs/testing.md](../testing.md).

### Example: comments

**E2E:** A user opens a post, submits a comment, sees it, refreshes, and still sees it.

**Frontend integration:** The recorded GraphQL response returns post and comments; the real Relay route renders them. A second test submits text; the injected fetch accepts it; the UI shows the comment and clears the form.

**Server integration:** An in-process `PostComment` GraphQL request validates input, calls the mocked service or database boundary, and returns the expected result. An in-process query returns comments from a recorded response.

**Service integration:** Supply recorded Drizzle results to the real comment service. Assert the intended database call and service response when the service has a mockable seam.

**E2E:** A whole application with a real temp-file libSQL database.

The generated tests must run quickly with no real database, no uncontrolled network, and no artificial delays. Tests are provisional: an engineer may change API routes, database queries, payloads, or service boundaries during refactoring.

## 7. Engineering process

### Stage 1 — Baseline precheck

1. Read and validate the feature manifest.
2. Verify the accepted SHA exists and the accepted E2E files have not changed without a new baseline.
3. Create a disposable worktree and host environment at the accepted SHA.
4. Run database migrations. Run the manifest's seed script when present. Bootstrap the administrator with non-interactive `BOOTSTRAP_*` variables.
5. Discover the accepted feature tests; **abort if none match**.
6. Run only those tests, with browser, server, and database capture enabled.
7. Stop on failure and report the cause to the engineer. Do not generate contract tests from a failed run.
8. On success, store the redacted capture artifacts and destroy the worktree and host processes.

The environment uses host processes and a temporary libSQL file. Do not use Docker for the application. MinIO is the only container-based helper, and only when the feature uses media.

### Stage 2 — Generate integration tests

1. Run `pnpm feature:generate-tests --id <FEATURE_ID> --run latest`. The script validates the recordings and writes a generation brief.
2. Invoke the `contract-test-author` subagent with the brief, capture paths, test identifiers, and source tree.
3. Generate colocated Vitest fixtures, Relay fetch handlers, in-process server tests, and service tests where a seam exists.
4. Run the new tests without containers or live databases.
5. Correct generation errors. Do not add invented business requirements.
6. Commit the generated tests as a recoverable checkpoint.

### Stage 3 — Trust pipeline refactor

1. Run `pnpm verify` (the existing **single** trust pipeline).
2. Read failures and improve the implementation. The pipeline includes deterministic stages and a blocking judgment review. The review needs `JEV_API_KEY` and network access.
3. Change generated boundary tests when internal contracts change.
4. Repeat until green, or until progress stops.
5. Commit meaningful checkpoints and preserve the baseline reference.
6. Prompt the engineer when rules conflict, failures repeat without progress, or a design choice requires product input.

`pnpm verify` includes type checks, lint rules, unit and integration tests, duplication checks, static analysis, architecture checks, and the review stage. It does **not** include E2E or mutation testing in the first version. Keep the same command for local and CI use.

### Stage 4 — Recheck accepted behavior

1. Start a **new** host environment from the latest implementation revision.
2. Run migrations and the manifest's fixture or seed instructions.
3. Run only the feature's accepted E2E tests, without modifying them. Run the accepted test code from `acceptedSha`, not from the feature branch. Point it at the latest application URL.
4. If E2E fails, compare the latest revision with the accepted SHA. Use an accepted-SHA worktree to reproduce the working behavior when useful.
5. Correct the regression. Rerun `pnpm verify` after code or internal-test changes, then rerun the affected E2E tests.
6. Stop and ask the engineer for help if progress stalls.
7. Save a successful `verify` result and E2E result bound to the **same current SHA**.

A failing E2E test does not automatically mean the product contract is wrong. Investigate implementation, fixture, and environment differences. Product alone can approve a change to accepted behavior.

### Stage 5 — Human engineering review

Open **one PR** against the target branch after Stage 4 succeeds. Do not create a separate mergeable PR for the unsafe product prototype.

Show the engineer:

- `main → final` implementation diff.
- `accepted SHA → final` engineering diff.
- `pnpm verify` result and feature-scoped E2E result.
- API/database boundary changes and generated test changes.
- Relevant commits and a working ephemeral environment, when useful.

Future versions can add a deterministic, navigable symbol/dependency graph. Do not block this first version on that graph.

**Type A — Implementation correction:** The engineer identifies an incorrect contract, abstraction, responsibility, security boundary, or extension point. The engineering agent changes the code and provisional tests. Run `pnpm verify`, then E2E, then return the updated PR to the engineer.

**Type B — New engineering rule:** The engineer identifies a missing lint, architecture, or convention check.

- If the rule and its cleanup are **bounded to the feature**, add the deterministic rule, a test proving that the rule detects a violation, and the cleanup in the **same PR**.
- If the rule requires **large or unrelated cleanup**, use a separate rule PR. Do not mix the broad migration into the feature PR.

#### Separate rule PR

Use this process when a new rule would fail on unrelated code:

1. Create `chore/rule-<name>` from `main`.
2. Add the deterministic rule and a test proving it detects a violation.
3. Apply the cleanup to `main`.
4. Run `pnpm verify` until green.
5. Review and merge the rule PR separately.
6. Rebase the feature branch on the updated `main`.
7. Rerun codegen, `pnpm verify`, and the feature E2E replay.
8. Record the rule PR in `engineering.rulePr` and any deferred cleanup in `engineering.followUps`.

Do not enable the broad rule only on the feature branch. That creates a branch-only failure and hides the cleanup review.

A PR review comment can trigger the engineering agent explicitly. Do not enable automatic review agents or infinite comment-response loops.

### Stage 6 — Merge

A PR is ready when the latest reviewed head SHA has a passing `pnpm verify`, a passing accepted feature E2E replay, the required human review or authorized fast-path policy, and no unresolved blockers. Invalidate stale checks and approvals after relevant changes. Merge the final implementation as **one PR**; preserve the accepted baseline in its protected Git ref.

## 8. CI policy

Run `pnpm verify`:

- On pushes to feature branches.
- On pull-request updates.
- On pushes to `main`.

The product agent does **not** need to run `pnpm verify` before starting or accepting the feature. A failing repository baseline is a delivery problem, not a reason to block exploratory product work. CI reports it and blocks an affected merge until it is fixed.

### Verify workflow prerequisites

The `.github/workflows/verify.yml` workflow must provide:

- Node.js 22 and pnpm 11.20.0.
- A frozen-lockfile install.
- `osv-scanner` and `opengrep` for the scans stage.
- `cosign` for the tool checks and signature verification.
- `JEV_API_KEY` as a repository secret for the review stage.
- Registry and `api.typesafe.ai` network access.

The review stage diffs the working tree against `HEAD` by default. On a clean CI checkout that is empty. CI must set `VERIFY_BASE_REF` to the pull-request base SHA or the push's previous SHA so the review reads the committed diff. Checkout must fetch enough history to resolve that base.

Pull requests from forks do not receive repository secrets by default. Run those through a maintainer-controlled workflow or accept that the review stage cannot run. Do not use `pull_request_target` with untrusted code.

The first CI increment runs `pnpm verify`. Add the feature manifest validation and selected feature E2E gate after `pnpm feature:e2e` is implemented. Missing or unselected E2E tests must fail that gate. CI must execute against the same commit that is being reviewed or merged.

Use the normal engineering review gate by default. A **fast path** may skip human engineering review when repository policy explicitly permits it and the relevant checks pass. A green `pnpm verify` alone cannot prove the architecture is appropriate; treat fast-path eligibility as an explicit policy, not an agent assertion.

Run all retained E2E tests on a schedule, separated into **smoke** and **regression** categories. Product-authored tests start as smoke; QA owns later categorization and additional regression scenarios. Risk-based selection and blast-radius test routing are deferred.

## 9. OpenCode configuration and prompts

This workflow targets **OpenCode v2**, tested against 2.1.4. Do not pin an exact OpenCode patch version. Support routine v2 patch and minor updates; review compatibility before adopting a release that changes v2 agent, command, permission, or plugin behavior. V1 formats are not supported. Use the project-local `.opencode/agents/` and `.opencode/commands/` directories. The file name becomes the agent or command ID. The local pipeline gate plugin uses the v2 plugin API.

Use v2 frontmatter. Do not use legacy top-level fields such as `prompt`, `permission`, `tools`, `disable`, or `maxSteps`.

The examples below give portable Markdown instruction bodies. Keep the frontmatter fields consistent with OpenCode v2 and verify against the installed release.

### Primary agent — `.opencode/agents/engineering.md`

```md
---
description: Turns an accepted feature into an engineering-approved implementation
mode: primary
permissions:
  - action: edit
    resource: "tests/*.spec.ts"
    effect: deny
---
You are the engineering implementation agent.

Read docs/features/<FEATURE_ID>/feature.yaml first.
Treat the accepted SHA and Playwright acceptance tests as immutable.
Do not alter product-approved expected browser behavior.

Follow these stages in order:
1. Run pnpm feature:validate --id <FEATURE_ID>.
2. Run pnpm feature:precheck --id <FEATURE_ID> --capture in a new host environment.
3. Stop if no matching E2E tests exist or if any accepted test fails.
4. Run pnpm feature:generate-tests --id <FEATURE_ID> --run latest.
5. Invoke the contract-test-author subagent with the generation brief.
6. Run pnpm verify and correct failures until green or blocked.
7. Create Git commits for useful recovery points.
8. Run pnpm feature:e2e --id <FEATURE_ID> in a new host environment.
9. If E2E fails, compare the implementation with the accepted SHA, repair, and verify again.
10. Prepare one PR for human engineering review after all required checks pass.

You may change API contracts, data structures, abstractions, and provisional integration tests.
You may not change the accepted E2E assertions without product approval.

When an engineer requests an implementation correction, update code and provisional tests.
When an engineer requests a new rule, implement a deterministic rule with a failing-case test when practical. Keep bounded rule changes in the same PR. If the rule needs broad cleanup, create a separate rule PR and record it in the manifest.

After each correction, rerun pnpm verify and feature E2E before renewed review.

Do not claim success from agent judgment. Use actual test results tied to the current SHA.
Do not make direct production changes. Ask for engineering help if failures repeat or progress stops.
Do not invoke optional review agents without a user's explicit request.
```

### Subagent — `.opencode/agents/contract-test-author.md`

```md
---
description: Creates Vitest tier integration tests from Playwright contract recordings
mode: subagent
permissions:
  - action: edit
    resource: "tests/*.spec.ts"
    effect: deny
---
You are the contract-test-author subagent.

Read the accepted feature manifest, the passing E2E scenario, and its recorded interactions.
Read the current source to identify real frontend, server, and service boundaries.

Write fast, colocated Vitest integration tests and reusable fixtures.
Frontend: use the real route, component, Relay environment, and client state. Inject or stub the Relay fetch function. Do not run the live server.
Server: invoke the real Yoga schema and resolvers in process with createApp().fetch('http://localhost/graphql', ...). Mock the service or database boundary.
Service: use real service code with recorded Drizzle results and database-call assertions where a seam exists.

Do not use a live database, Docker, real external services, fixed waits, or artificial latency.
Do not require migrations.
Normalize volatile values. Keep test data redacted.
Create one test per behavioral invariant when practical. Multiple technical assertions may support one invariant.
Tag generated tests as integration. Colocate them with the code they exercise.
Use recordings as evidence. Do not invent edge-case requirements.
Label the generated tests as provisional internal contracts. They can change during engineering review.
Run the tests and report exact failures. Do not hide failures or weaken assertions to obtain green.
```

### Commands

Create `/engineer <FEATURE_ID>` as a short wrapper that selects the engineering agent, validates the feature ID, and begins Stage 1. Create `/respond-review <FEATURE_ID>` as a wrapper that loads unresolved engineer comments and begins the appropriate correction loop. Do not use a separate mandatory PR-response agent.

Example `.opencode/commands/engineer.md`:

```md
---
description: Start the engineering workflow for an accepted feature
agent: engineering
---
Run the engineering workflow for $ARGUMENTS. Start with feature validation and the baseline precheck.
```

Implement workflow transitions through deterministic scripts, not by trusting the agent to mark its own work green.

## 10. Script contracts

These are proposed script interfaces to implement, **not commands that already exist**:

```sh
pnpm feature:validate --id INS-123
pnpm feature:precheck --id INS-123 --capture # new host env + migrate + seed + tagged E2E + capture
pnpm feature:generate-tests --id INS-123 --run latest
pnpm feature:e2e --id INS-123                 # new host env + migrate + seed + tagged E2E
pnpm feature:clean --id INS-123 --keep 3      # remove old raw artifact runs
pnpm feature:status --id INS-123
pnpm verify
```

`feature:generate-tests` validates the recordings and writes a generation brief. It does not invent tests. The engineering agent invokes the `contract-test-author` subagent with that brief.

Each script must exit non-zero on failure and write machine-readable evidence. Minimum result fields: `featureId`, `stage`, `sourceSha`, `baselineSha`, `testCount`, `passed`, `failed`, `environmentProfile`, `artifactPaths`, `startedAt`, `finishedAt`, and `errorCategory` when blocked.

Use a temporary libSQL file and unique ports per run. Always clean up host processes, temporary worktrees, and temporary databases on success or error. Check ports with `ss` before starting and kill only the process that owns the port. Do not use containers for the application; MinIO is the only container-based helper.

Keep raw test artifacts long enough for debugging. `feature:clean` removes old run directories and never removes the manifest or committed fixtures. CI uploads raw artifacts with a retention period instead of committing them. Prevent commands from reaching production systems or secrets.

## 11. Recovery and branching

Use one feature branch and one eventual mergeable PR. Preserve the accepted product revision with a durable tag or protected reference. Commit after contract-test generation, successful refactors, important corrections, and final verification. Git commits are the primary recovery mechanism.

If E2E stops passing, compare the accepted SHA with the latest SHA. When necessary, run both commits in separate disposable worktrees to confirm the changed behavior. Use `git bisect` when intermediate commits are independently testable. Do not assume a failing commit is necessarily an implementation regression until environment and seed differences are ruled out.

If a broad rule PR merges while the feature is in progress, rebase the feature branch on the updated `main`. Rerun codegen, `pnpm verify`, and the feature E2E replay. Do not carry a branch-only copy of the rule.

Store the current workflow state in the feature manifest and the actual check results in CI artifacts. A state value is not a substitute for verification evidence. In CI, set `VERIFY_BASE_REF` so the review stage reads the committed diff.

## 12. Safeguards and limits

| Risk | Control |
| --- | --- |
| No new E2E tests match | Abort before capture and test generation |
| Incorrect or unstable accepted tests | Require prior product-approved, clean-environment replay |
| Internal capture freezes poor architecture | Mark generated contracts provisional; allow engineering to replace them |
| Database capture misses async writes | Use correlation IDs; report missing traces and background jobs |
| Sensitive data enters fixtures | Redact before storage; restrict artifact access |
| Large artifacts enter Git | Keep raw output in `.artifacts/` or CI artifacts; commit only small recordings |
| Local artifact storage grows without bound | `feature:clean` keeps a bounded number of runs; CI uses retention |
| Mock tests pass despite real database bugs | E2E is the real-database functional gate; add specialized database tests later if needed |
| Tier tests become slow | No database containers, external requests, sleeps, or artificial latency |
| Generated tests drift from the baseline | Use the accepted manifest and accepted E2E files as the source of truth |
| Agent loops without progress | Detect repeated failure signatures; stop and involve engineer |
| Engineer requests a global rule on a local PR | Bounded rule in the same PR; broad rule in a separate `chore/rule-*` PR |
| Accepted baseline is lost | Preserve immutable ref, SHA, test content, and fixture profile |
| CI is green on an outdated revision | Bind checks and reviews to the latest head SHA; invalidate stale status |
| CI review sees an empty diff | Set `VERIFY_BASE_REF` to the pull-request base or previous push SHA |
| Fork PR cannot read secrets | Use a maintainer-controlled workflow; never run untrusted code with `pull_request_target` |
| Broad regression escapes targeted E2E | Run scheduled smoke and regression suites; add impact selection later |
| Product's exploratory work is blocked by CI | Allow local product iteration; restrict merging, not experimentation |

## 13. MVP acceptance criteria

The first implementation passes when all of the following are demonstrated on a real feature:

1. A single manifest identifies the feature, optional Gherkin file, accepted SHA, test selector, and current state.
2. The agent runs the E2E tests for **only that feature**. Zero matches cause a hard failure.
3. A passing precheck creates redacted GraphQL and Drizzle recordings in a disposable host environment.
4. The contract-test-author generates colocated frontend, server, and/or service Vitest integration tests from relevant recordings.
5. The generated integration tests run without a real database, application container, external network, or intentional latency.
6. The engineering agent runs `pnpm verify`, fixes failures, and saves useful Git commits.
7. The agent replays the accepted E2E tests after refactoring. A failure is compared with the immutable accepted revision.
8. An engineer can request either an implementation correction or a new deterministic rule. A broad rule uses a separate rule PR.
9. Any implementation or rule correction causes the full `pnpm verify` and feature E2E gates to run again.
10. CI runs `pnpm verify` on feature pushes, PR updates, and `main` pushes, without requiring a local product-stage precheck.
11. The PR is mergeable only under the repository's verified merge policy.
12. Scheduled runs can distinguish product smoke tests from QA regression tests.

## 14. Deferred work

Do not include these in the first implementation: mutation testing; automated symbol/dependency visualization; behavioral and technical blast-radius selection; feature flags; production rollout and flag retirement; continuous full E2E runs per PR; mandatory AI review agents; a custom ticketing UI; Mastra; and enterprise-grade orchestration.

The first experiment should answer one question: **Can an OpenCode engineering agent preserve product-accepted browser behavior while it creates inexpensive tier integration tests and brings the implementation to a green trust pipeline, before human engineering review?**

## 15. Source documentation

- [OpenCode v2 agents](https://opencode.ai/v2/docs/agents)
- [OpenCode v2 commands](https://opencode.ai/v2/docs/commands)
- [OpenCode v2 skills](https://opencode.ai/v2/docs/skills)
- [OpenCode v2 plugins](https://opencode.ai/v2/docs/plugins)
- [OpenCode GitHub integration](https://opencode.ai/docs/github/)
- [Playwright network recording and HAR](https://playwright.dev/docs/mock)
- [Playwright test annotations](https://playwright.dev/docs/test-annotations)
- [Playwright fixtures](https://playwright.dev/docs/test-fixtures)
- [Vitest test fixtures](https://vitest.dev/guide/test-context)
- [Vitest and MSW](https://vitest.dev/guide/mocking/requests)

**End of specification.**
