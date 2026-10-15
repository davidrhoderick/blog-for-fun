# AGENTS.md

Orientation for agents working in this repo. Read the two rulebooks before
changing code:

- [docs/architecture.md](docs/architecture.md) — layering, composition, thresholds.
- [docs/testing.md](docs/testing.md) — TDD, unit vs integration, coverage.

## Trust pipeline

Every task ends by running the local pipeline (`pnpm verify`):

```text
audit → lint+structure → typecheck → test → scans → review
```

It is **fail-fast**: a later stage does not run when an earlier one fails. The
deterministic stages **block the agent** — you cannot finish a task while the
pipeline is red. The final `review` stage is a judgment call and also blocks when
its verdict fails. Fix the cause and re-run; retries are bounded.

## Running the apps

| App | Command | Port |
|---|---|---|
| GraphQL API (`server`) | `pnpm --filter server run dev` | 4000 |
| Admin UI (`admin`) | `pnpm --filter admin run dev` | 3001 |
| Blog (`blog`) | `pnpm --filter blog run dev` | 3000 |

The server's `dev` watches **only the GraphQL schema** — not the admin's Relay
artifacts or the apps' React Router types. So when the pipeline sees port 4000
listening it still runs the app codegen (`pnpm codegen:apps`); with the server
down it runs the full `pnpm codegen` (schema → admin → blog).

Codegen on demand:

- Everything: `pnpm codegen` (GraphQL schema → admin → blog)
- Apps only: `pnpm codegen:apps` (admin + blog; use when the server watcher is up)
- GraphQL schema: `pnpm --filter server run dev:codegen`
- Admin: Relay artifacts + `react-router typegen`
- Blog: `react-router typegen`

The GraphQL client layer for the admin app is **Relay**. `blog` is
server-rendered and fetches directly through its server helper.
