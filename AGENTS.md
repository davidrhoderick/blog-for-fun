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

## Environment

Each package owns its own `.env`; nothing is shared at the repo root, so no app
can pick up another's credentials by accident.

| File | Holds | Committed? |
|---|---|---|
| `apps/server/.env` | `TURSO_*` (required), S3/media vars, bootstrap vars | no — `.env.example` is |
| `trust-pipeline/.env` | `JEV_API_KEY` for the `review` stage | no |

The server reads `apps/server/.env` relative to its own package, so it works
from any cwd and stays contained to that app. Only `TURSO_CONNECTION_URL` and
`TURSO_AUTH_TOKEN` are required to boot; the rest have defaults or are media
only. `pnpm verify` fails fast when `JEV_API_KEY` is missing and the `review`
stage is enabled.

## Running the apps

| App | Command | Port |
|---|---|---|
| GraphQL API (`server`) | `pnpm --filter server run dev` | 4000 |
| Admin UI (`admin`) | `pnpm --filter admin run dev` | 3001 |
| Blog (`blog`) | `pnpm --filter blog run dev` | 3000 |

Bringing the stack up from a fresh clone:

1. `cp apps/server/.env.example apps/server/.env`, then fill it in.
2. `pnpm --filter server db:migrate` — apply migrations.
3. `pnpm --filter server auth:bootstrap` — create the first administrator.
4. Media only: `pnpm --filter server storage:dev` (MinIO on 9000/9001), create
   the `media` bucket, and uncomment the storage block in `apps/server/.env`.
5. Start the apps above. Health check: `curl http://127.0.0.1:4000/health`.

The server's `dev` watches **only the GraphQL schema** — not the admin's Relay
artifacts or the apps' React Router types. So the pipeline always runs the full
`pnpm codegen` (schema → admin → blog) before typechecking.

Codegen on demand:

- Everything: `pnpm codegen` (GraphQL schema → admin → blog)
- GraphQL schema: `pnpm --filter server run dev:codegen`
- Admin: Relay artifacts + `react-router typegen`
- Blog: `react-router typegen`

The GraphQL client layer for the admin app is **Relay**. `blog` is
server-rendered and fetches directly through its server helper.
