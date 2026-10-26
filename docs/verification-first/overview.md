# Behavior-First Agentic Development

**Technical Proposal — Draft 1**

## 1\. Purpose

Build software quickly without removing engineering control.

Product defines and accepts the required behavior. Agents implement the behavior and complete automated checks. Engineering controls technical quality. QA identifies defects, regression risks, and missing behavior.

**The accepted browser behavior is the primary functional contract.** Internal contracts can change during engineering review.

Use automated checks to reduce human review work. Do not add review steps without a clear purpose.

## 2\. Development Process

### Step 1 — Prepare the feature

Create a ticket in the feature tracking system.

Check that the ticket identifies:

- The product capability and expected result.
- The affected pages, components, and users.
- The applicable products, tenants, and permissions.
- The required behavior and feature flag.

An agent checks for missing information. Product answers questions that prevent development.

### Step 2 — Build the behavior

Product uses an interactive coding agent to build the feature.

Keep the application running during development. Use a disposable environment.

Focus on working behavior and fast feedback. Do not require complete architecture during this step.

Product accepts the result when the required behavior works.

### Step 3 — Record acceptance tests

Start a fresh test environment.

Use Playwright to record the accepted browser behavior. Product can record multiple scenarios.

Create executable tests with browser-level assertions. Do not depend on internal implementation details.

Destroy the environment. Recreate it and replay the tests.

Protect the accepted tests from automatic changes. Product must approve changes to accepted behavior.

### Step 4 — Capture internal contracts

Run the accepted tests with instrumentation enabled.

Record these interactions:

- Client actions and HTTP requests.
- API inputs, outputs, and error responses.
- Server interactions and relevant events.
- Database client calls, results, and state changes.

Use these records to generate unit, boundary, and integration tests.

Select instrumentation for each application's architecture. These internal tests are provisional. Engineering can change them.

### Step 5 — Run the trust pipeline

Run the existing trust pipeline:

- Type checking and linting.
- Unit and integration tests.
- Duplication and complexity checks.
- Static analysis and architectural rules.
- Incremental mutation testing.
- Optional architectural classification.

The agent corrects failures and repeats the checks until they pass or the work needs human input.

Run the accepted E2E tests again before engineering review.

### Step 6 — Complete engineering review

Show the engineer:

- The source diff.
- A deterministic dependency and symbol graph.
- Changes to APIs, data models, and dependencies.
- Test results and mutation results.
- An optional working test environment.

The engineer checks maintainability, security, architecture, and extensibility.

The engineer can approve the implementation or request changes.

For corrections, the agent can rebuild the disposable environment, change internal contracts, and run the trust pipeline again.

Replay the accepted E2E tests after the corrections. Send material implementation changes back to engineering if E2E fails and the agent repairs them.

Ask product to review changes that affect accepted behavior.

Optional review agents remain under user control.

### Step 7 — Release to selected users

Deploy the approved feature behind a feature flag.

Enable the flag for selected clients, product, and QA.

Give each group the feature description and relevant test instructions.

Client UAT and QA can run in parallel.

If the client rejects the behavior, inform QA. Pause QA work that depends on the rejected behavior.

### Step 8 — Complete QA hardening

Give QA the following evidence:

- Existing smoke and regression test results.
- A technical blast radius for entities, services, and dependencies.
- A behavioral blast radius for pages, components, and workflows.
- Relevant E2E coverage and feature-flag comparisons.

QA can inspect any part of the application. The evidence does not limit QA's investigation.

QA looks for regressions, invalid states, missing behavior, and security risks.

QA does not have to add tests when existing verification is sufficient.

For each finding, QA assigns a priority. Critical issues and blockers must receive immediate attention.

Create correction tickets for the required work. Use the same trust pipeline and engineering review process.

A defect with a known expected result can start directly with the correction agent. It does not need a new prototype.

QA verifies the required corrections before general release.  Engineering approves the technical implementation changes, even in a cursory fashion (the trust pipeline should maintain quality and architecture).

### Step 9 — Complete the rollout

Enable the feature for all intended users after release-blocking issues are resolved.

Monitor failures, performance, and user behavior.

Keep non-blocking issues in the backlog.

After a stable period, remove the feature flag. Use seven days as an initial policy, based on usage and risk.

Run the relevant verification tests after flag removal.

## 3\. Test and Environment Strategy

### Test authority

**E2E tests:** Verify accepted product behavior. These are the final functional authority.

**Integration tests:** Verify internal interactions. These tests can change when engineering changes internal contracts.  Mutation testing helps measure test sensitivity.

**Unit tests:** Edge cases (happy paths are covered by integration tests). Mutation testing helps measure test sensitivity.

Run inexpensive tests during each agent iteration. Run E2E tests at important checkpoints and after engineering changes.

### Disposable environments

Use containers for applications, services, and databases.

Run migrations and load test data before acceptance tests.

Use a small, anonymized production-derived dataset where permitted. Preserve important relationships, tenant boundaries, and edge cases.

Add synthetic data for cases that the production sample does not contain.

Test migrations against both empty databases and representative existing schemas.

Use lightweight mocks for fast boundary tests. Use real databases when a test must verify database, persistence, and entire system behavior.

### Regression selection

Keep useful E2E tests from previous features.

Use dependency analysis and runtime traces to select tests for each change.

Run broader regression tests asynchronously when the risk permits. Require essential safety checks before deployment.

Compare feature-enabled and feature-disabled behavior when shared code changes.

## 4\. Possible Tools

| Capability | Candidate tools |
| --- | --- |
| Feature tracking | Jira, Linear |
| Workflow orchestration | Mastra |
| Agent interaction | Existing coding agent or SDK |
| Browser recording and E2E | Playwright MCP, Playwright Test |
| HTTP capture | HAR, HTTP middleware |
| Server tracing | OpenTelemetry |
| Database capture | Database client or ORM instrumentation |
| Disposable environments | Docker Compose, Testcontainers |
| Unit and integration tests | Existing framework (Jest or Vitest) or Node.js test runner |
| Mutation testing | StrykerJS |
| Code visualization | TypeScript Compiler API, ts-morph, Git diffs |
| Feature flags | Existing provider (like Split.io or Harness), optionally through OpenFeature |

Use Mastra for workflow state, execution steps, and human approval points if it reduces custom orchestration code.

Keep the trust pipeline independent of the agent framework.

## 5\. Risks and Controls

| Risk | Control |
| --- | --- |
| Product accepts incorrect behavior | Product owns acceptance tests and approves changes |
| Recorded tests contain weak assertions | Replay tests; inspect important assertions |
| Generated tests preserve unwanted internals | Permit internal contract changes during engineering review |
| Agents repeat failed corrections | Detect repeated failures and request human input |
| Test data misses important cases | Use representative data and synthetic edge cases |
| Captured data exposes sensitive information | Remove sensitive data; control artifact access |
| Database migrations affect existing users | Test upgrades and backward compatibility |
| Feature flags hide only part of a change | Test shared behavior with flags enabled and disabled |
| Dependency graphs miss runtime behavior | Separate static relationships from observed traces |
| Regression selection misses affected features | Run periodic full suites and broader checks for high-risk changes |
| QA becomes a delivery bottleneck | Prioritize by risk; do not require unnecessary tests |
| Old flags remain in the code | Create automatic retirement tasks with verification |

## 6\. Success Measures

Measure:

- Time from product request to accepted behavior.
- Time from acceptance to engineering approval.
- Number of agent correction cycles.
- Number of engineering review cycles.
- E2E failures after refactoring.
- QA defects and production regressions.
- Time spent on QA hardening.
- Agent execution and test costs.
- Age of active feature flags.

Compare delivery speed with regression rates and maintenance effort.

**Success means faster delivery with controlled technical risk.**

## 7\. Initial Experiment

Use one existing application feature.

Start with product implementation, Playwright acceptance tests, and HTTP/database instrumentation.

Generate provisional tests. Run the trust pipeline with mutation testing.

Let engineering refactor the implementation. Verify the result with the original E2E tests.

Measure the cost, time, and number of correction cycles.

Add workflow automation, code visualization, and QA impact analysis after the core process works.

---

**Core principle:** Product owns behavior. Engineering owns implementation. QA owns quality assessment. Agents perform the repeatable work. Automated tests connect these responsibilities without requiring repeated manual verification.