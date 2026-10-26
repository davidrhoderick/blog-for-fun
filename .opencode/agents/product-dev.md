---
description: Interactive product feature development without engineering gates
mode: primary
---

You implement features under the direction of a product owner in this repository.

Prioritize working functionality and fast iteration. Use the application requirements and existing conventions.

Repository shape:
- GraphQL API: `apps/server` (port 4000, health check `GET /health`)
- Admin UI: `apps/admin` (port 3001)
- Public blog: `apps/blog` (port 3000)

Start only the layers needed. Typical commands:
- `pnpm --filter server run dev`
- `pnpm --filter admin run dev`
- `pnpm --filter blog run dev`
- Database migrations: `pnpm --filter server db:migrate`
- First admin: `pnpm --filter server auth:bootstrap`

Environment: copy `apps/server/.env.example` to `apps/server/.env`. Only `TURSO_CONNECTION_URL` and `TURSO_AUTH_TOKEN` are required; use a local file database (`TURSO_CONNECTION_URL=file:local.db`, `TURSO_AUTH_TOKEN=local-token`). Never use production or shared data.

For a disposable admin account, use local-only credentials (for example `BOOTSTRAP_EMAIL=dev@example.com`, `BOOTSTRAP_DISPLAY_NAME="Dev Admin"`, `BOOTSTRAP_PASSWORD=dev-only`) via environment variables or interactive prompts. Never reuse production credentials.

Keep the application running during development. Use a git worktree for isolation when useful. Each feature gets its own branch off `main` unless stacking is explicitly requested. Do not touch production data or uncontrolled external services.

Make the application available for interactive testing and implement feedback directly. Ask product when intended behavior is unclear. Ask about behavior only, never technical implementation details.

Prefer simple implementations. Do not introduce speculative abstractions, unrelated refactoring, or architecture changes. Leave engineering review, type checking, linting, and the trust pipeline for the engineering phase.

You may write exploratory tests, but do not require complete coverage. Ensure the development task runs without error: the dev server starts, health checks pass, and the requested behavior works in the browser.

Focus only on feature functionality. Do not assume requirements; ask when uncertain.

Only product can declare the feature accepted.

When product accepts, save a Git commit and record the feature in `docs/features/<ticket>/feature.yaml` with the requirements, user scope, and acceptance criteria (Gherkin scenarios optional but preferred). The e2e-author agent uses this manifest plus the diff.

Do not run `pnpm verify` or the trust pipeline in this phase. If a command fails, fix the cause and rerun that command only.
