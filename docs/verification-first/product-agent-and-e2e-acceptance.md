# Product Agent and E2E Acceptance
**Technical Specification — Tailored to this repository (OpenCode)**

## 1. Purpose

Let product create and accept software features with an OpenCode agent.

Keep the development process interactive. Let product inspect and change the running application.

After product accepts the feature, record its behavior as executable E2E tests.

Verify the tests in a fresh environment. Preserve the tests as the functional contract for the engineering phase.

**This process must prioritize functional delivery. It must not require engineering review or the trust pipeline before product acceptance.** Launch it with `pnpm product`, which opens OpenCode with the `product-dev` agent as the default; the pipeline plugin skips the trust pipeline for that agent automatically. `OPENCODE_PRODUCT_MODE=1` remains an optional override.

## 2. Scope

This specification covers:

1. Feature preparation and requirement validation.
2. Interactive feature development.
3. Product acceptance.
4. E2E test recording and authorship.
5. Test replay in a clean environment.
6. Handoff to internal contract capture.

It does not cover integration-test generation, architectural refactoring, engineering review, QA hardening, or release.

## 3. Dependencies

| Component | Tool in this repo | Purpose |
| --- | --- | --- |
| Runtime | Node.js, TypeScript, pnpm | Application services and orchestration |
| Coding agent | OpenCode with `.opencode/agents/product-dev.md` | Read, write, and execute application code |
| Ticket system | GitHub Issues (or a local markdown ticket) | Store feature requirements |
| Source control | Git, OpenCode worktrees | Isolate feature changes |
| Browser interaction | Playwright MCP (`@playwright/mcp`, devtools) | Let agents inspect and operate the application |
| E2E recording | Playwright MCP or Playwright codegen | Record user interactions |
| Test runner | Playwright Test | Run executable acceptance tests |
| Workflow state | OpenCode session + feature manifest in Git | Preserve workflow state |
| Artifact storage | Git and `docs/verification-first/artifacts/` | Preserve tests and execution evidence |

Use the existing application framework, database, and migration tools.

Do not introduce a new coding agent or test framework when an existing tool meets the requirements. Playwright Test is already installed at the repository root (`@playwright/test`); acceptance tests live under `tests/`.

### Initial setup

1. Copy `apps/server/.env.example` to `apps/server/.env`. Use a local database (`TURSO_CONNECTION_URL=file:local.db`, `TURSO_AUTH_TOKEN=local-token`); never point product work at a live/shared database.
2. The Playwright MCP server is configured in `.opencode/opencode.json` (see below).
3. Configure the Playwright MCP server in `.opencode/opencode.json`:

```jsonc
{
  "mcp": {
    "servers": {
      "playwright": {
        "type": "local",
        "command": ["pnpm", "dlx", "@playwright/mcp", "--devtools"]
      }
    }
  }
}
```

## 4. Application Setup

Each feature uses the repository's existing application profile.

Commands:

| Layer | Command | Port | Health check |
| --- | --- | --- | --- |
| GraphQL API | `pnpm --filter server run dev` | 4000 | `GET http://127.0.0.1:4000/health` |
| Admin UI | `pnpm --filter admin run dev` | 3001 | Vite dev server |
| Public blog | `pnpm --filter blog run dev` | 3000 | Vite dev server |

Database and bootstrap:

- Migrations: `pnpm --filter server db:migrate`
- First administrator: `pnpm --filter server auth:bootstrap`
- Media storage (optional): `pnpm --filter server storage:dev` (MinIO on 9000/9001) plus the storage block in `apps/server/.env`
- Codegen (if schema changes): `pnpm codegen`
- Seeding: there is no general seed script. Only the administrator account is bootstrapped; create any test posts/content manually or during QA.

Environment requirements:

- Start a disposable development environment for each feature using an OpenCode worktree.
- Run the server against a local libSQL file (`TURSO_CONNECTION_URL=file:local.db`) so no production data is touched.
- Reset a disposable database by deleting the local DB file and rerunning `pnpm --filter server db:migrate` (and `auth:bootstrap` if needed).
- For a shared/remote Turso database, create a separate database or branch per feature instead of reusing production data.
- Provide a browser-accessible URL for admin (3001) and/or blog (3000).
- Preserve development state during interactive work.
- Prevent access to production data and irreversible external operations.
- Use a separate, clean environment for final acceptance-test recording and replay: fresh database file, migrations, and deterministic test data.

Feature flags: this repository has no feature-flag provider yet. For this phase, either keep the change small enough to ship directly or gate it with a simple server-side flag (environment variable or database row). Flag retirement and broader rollout remain engineering work.

Product structure for requirement validation:

- Products: public blog and admin CMS.
- Users: administrators (auth-managed) and anonymous readers.
- Major capabilities: posts, publication, media library, authentication.

## 5. Workflow Stages

| Stage | Owner | Completion condition |
| --- | --- | --- |
| DRAFT | Product | Ticket created |
| REQUIREMENTS_READY | Product agent | Required context present |
| DEVELOPING | Product + OpenCode agent | Feature works as requested |
| ACCEPTED | Product | Explicit acceptance |
| RECORDING | Product + test agent | E2E scenarios recorded |
| VERIFYING | OpenCode / scripts | Clean-environment replay succeeds |
| BASELINED | OpenCode / scripts | Tests and evidence saved |

Allow a feature to return to an earlier stage when the behavior or tests need changes.

### Stage A — Requirement validation

Read the ticket and the application profile above.

Check that the ticket identifies the intended capability, location, user scope, and expected result.

Ask product to supply information that is necessary to start development.

Do not block development because of optional details or speculative edge cases.

Store the validated requirements with the ticket.

### Stage B — Interactive development

Start the disposable development environment (worktree, local database, migrations).

Start an OpenCode session with the `product-dev` agent and access to source files, terminal, application logs, and browser tools.

Product gives instructions through the interactive chat.

The agent changes the application and keeps it operational. Product uses the running application and requests changes.

The agent can use exploratory tests to support its work. Do not require complete test coverage or an architectural review.

Keep the same session and workspace until product accepts the feature.

When product selects **Accept Feature**:

- Save the current implementation to a Git commit on a new branch off `main` (stacking only if explicitly requested).
- Record the accepted revision (commit SHA).
- Write a feature manifest (for example `docs/features/<ticket>.md`) with requirements, user scope, and acceptance criteria (Gherkin scenarios preferred).
- Record the feature requirements and environment configuration.
- Prevent later changes to the accepted implementation without a new revision.

### Stage C — Record accepted behavior

Create a fresh environment from the accepted revision.

Run migrations and load the required fixtures.

Use Playwright MCP and/or Playwright codegen to record user interactions, then refine the recorded output into stable, reviewed tests.

Product performs each accepted workflow in the browser.

The test-authoring agent converts recorded actions into Playwright Test cases and proposes observable assertions.

Product reviews the expected results and can add or change assertions.

Tests must:

- Assert browser-visible behavior.
- Use stable semantic locators.
- Avoid internal API and database assertions.
- Avoid fixed delays and unstable data.
- Use reproducible authentication and fixtures.
- Support independent execution.

Product can record multiple happy-path scenarios.

Do not automatically add speculative edge cases.

### Stage D — Verify acceptance tests

Save the completed tests.

Destroy the recording environment.

Create another environment from the same accepted revision.

Run migrations, load fixtures, and execute the recorded E2E tests.

If a test fails:

1. Identify whether the problem is the application, environment, or test.
2. Correct the applicable problem.
3. Ask product to approve changes to expected behavior.
4. Recreate the environment and run the tests again.

Do not change assertions merely to obtain a passing result.

When all accepted tests pass, mark the feature BASELINED.

Preserve the accepted E2E tests for the next development phase.

## 6. Agent Instructions

Use three instruction sets. In this repository they can be the same OpenCode session or separate agents.

### Prompt A — Product Requirements Agent

**Purpose:** Prepare the ticket.

**System instructions:**

You help product prepare software feature requirements for this repository.

Read the application profile and feature request.

Determine the relevant pages, products, tenants, roles, permissions, and capabilities.

Identify information that is necessary to implement the feature.

Ask short, specific questions only when required information is missing.

Do not invent product requirements.

Do not propose architecture or implementation details unless product asks.

Return the validated requirements, unresolved assumptions, and readiness status.

### Prompt B — Interactive Coding Agent

**Purpose:** Develop functional behavior.

This is implemented by `.opencode/agents/product-dev.md`.

**System instructions:**

You implement features under the direction of a product owner in this repository.

Prioritize working functionality and fast iteration.

Use the application requirements and existing conventions.

Make the application available for interactive testing.

Implement product feedback directly. Ask questions when intended behavior is unclear.

Prefer simple implementations. Do not introduce speculative abstractions or unnecessary infrastructure.

Do not perform unrelated refactoring.

Do not modify production data or use uncontrolled external services.

You may write exploratory tests, but complete engineering verification happens in a later phase.

Report what changed and how product can test it.

Only product can declare the feature accepted.

Do not run `pnpm verify` or the trust pipeline in this phase.

### Prompt C — E2E Test Authoring Agent

**Purpose:** Convert accepted interactions into executable tests.

This is implemented by `.opencode/agents/e2e-author.md` (subagent). It uses the Playwright MCP server and writes tests under `tests/`.

**System instructions:**

You create Playwright acceptance tests from recorded product interactions.

Use the accepted implementation and approved behavioral requirements.

Generate tests with stable locators and explicit, observable assertions.

Do not infer product requirements from unrelated implementation details.

Do not assert internal database structures or API contracts.

Use the supplied fixtures and authentication state.

Show proposed assertions to product for approval.

Do not change approved expected behavior.

Run the tests against a fresh environment with `pnpm e2e` and report failures accurately.

Do not hide failed tests or weaken assertions to obtain a passing result.

## 7. OpenCode Integration

OpenCode manages the interactive work. **It does not need to control every coding-agent interaction.**

Use OpenCode for:

- Starting a feature workflow in a worktree.
- Running requirement validation.
- Tracking the accepted implementation revision.
- Suspending the workflow for product acceptance.
- Starting the recording stage.
- Running deterministic E2E verification via scripts.
- Storing stage results and resuming failed workflows.
- Sending the verified feature to the next workflow.

Use OpenCode sessions for interactive development and scripts (shell commands) for deterministic environment creation, migrations, and test replay.

Use workflow suspension and resumption for product-controlled stages.

Store workflow state persistently so a feature survives application restarts.

### Workflow boundaries

**Interactive work:** The coding agent manages its normal conversation and tool use. Product controls the iteration.

**Deterministic work:** Scripts create environments, run tests, save artifacts, and check results.

**Human decisions:** Product explicitly accepts the feature and its behavioral assertions.

Do not introduce supervisor agents, mandatory review agents, or automatic multi-agent debates.

For the initial prototype, OpenCode can orchestrate existing scripts and coding-agent sessions. A custom development interface is not required.

## 8. Handoff Artifacts

Each accepted feature must produce:

| Artifact | Content |
| --- | --- |
| Feature manifest | Ticket ID, requirements, user scope, flag ID |
| Accepted revision | Git commit SHA |
| E2E test files | Approved Playwright Test cases (e.g. `e2e/<feature>.spec.ts`) |
| Fixture reference | Seed version and test-user configuration |
| Environment manifest | Application configuration and container/image versions |
| Verification report | Test results, failures, execution time |
| Acceptance record | Product approval and test-baseline version |

Store executable tests in Git.

Store large traces, screenshots, and videos as referenced artifacts.

The next phase receives the accepted revision and test baseline. It must not change the accepted assertions without product approval.

## 9. Risks and Controls

| Risk | Control |
| --- | --- |
| Requirements lack basic context | Validate against the application profile |
| Product has too many approval steps | Require approval only for acceptance and behavioral changes |
| Agent makes unnecessary architectural changes | Limit scope; leave architecture review for engineering |
| Interactive environment becomes unstable | Keep workspace state; provide restart commands |
| Recording captures actions but not results | Require approved assertions |
| E2E tests depend on incidental UI details | Prefer semantic locators and observable outcomes |
| Tests depend on development data | Replay with known fixtures in a fresh environment |
| Agent modifies accepted behavior | Protect accepted revision and test baseline |
| External services cause inconsistent tests | Use approved test doubles and isolated credentials |
| Test replay becomes expensive | Limit this phase to accepted scenarios |
| No feature-flag provider yet | Keep changes small or add a minimal server-side flag; defer full rollout control to engineering |
| Playwright not yet installed | Add `@playwright/test` and `@playwright/mcp` before the recording stage |

## 10. Minimum Viable Implementation

Build the first version in four increments.

**Increment 1 — Interactive development**

Use `pnpm product`, a Git worktree, a local Turso database file, and the running application (`pnpm --filter server run dev`, plus admin/blog as needed).

**Increment 2 — Product acceptance**

Add feature manifests, requirement checks, acceptance control, and revision capture.

**Increment 3 — E2E authorship**

Add Playwright recording, an assertion-generation prompt, and product approval. Install Playwright packages and configure the Playwright MCP server.

**Increment 4 — Workflow orchestration**

Use OpenCode sessions plus scripts to provision fresh environments, replay tests, store results, and control stage transitions.

Do not build a custom coding agent, browser, ticket system, or test runner.

## 11. Acceptance Criteria

This implementation is complete when:

- Product can create a feature from a ticket.
- An agent can modify a running application interactively.
- Product can explicitly accept the implementation.
- Product can record one or more E2E scenarios.
- The recorded tests contain approved observable assertions.
- The application and database can be recreated from a clean state.
- All accepted tests run successfully in the recreated environment.
- Tests and the accepted implementation are stored with matching revision identifiers.
- The system can hand the verified artifacts to the internal contract-capture phase.

**Success criterion:** Product can move from a feature request to verified, executable acceptance tests without mandatory engineering involvement.
