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

Develop on the host with hot reload — **not in Docker**. The Docker image is for
deployment only, so build and smoke-test it when deployment or infrastructure
changes (the `Dockerfile`, `docker/`, or the workspace layout) — not as part of
ordinary development.

Each app is an independent process. Start only the layers you need:

| Layer | Command | Port | Needs |
|---|---|---|---|
| GraphQL API (`server`) | `pnpm --filter server run dev` | 4000 | nothing |
| Blog (`blog`) | `pnpm --filter blog run dev` | 3000 | the server, for data |
| Admin UI (`admin`) | `pnpm --filter admin run dev` | 3001 | the server, for data |

- The server runs on its own. `blog` and `admin` each need it for data and never
  need each other.
- "Needs the server" means *at request time*, not to start. Each app's own
  codegen reads the source.
- All three: `pnpm --parallel --filter server --filter blog --filter admin run dev`.

Every `dev` script already wires its own codegen and reload, so nothing else
needs running:

- `server` — `graphql-codegen`, then its watcher and `tsx watch`.
- `admin` — Relay compile and `react-router typegen`, then Vite. The Relay step
  runs `graphql:generate` (source → schema); it never contacts the server.
- `blog` — `react-router typegen`, then Vite.

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

### Bringing the stack up from a fresh clone

1. `pnpm install` — install every workspace package.
2. `cp apps/server/.env.example apps/server/.env`, then fill it in.
3. `pnpm --filter server db:migrate` — apply migrations.
4. `pnpm --filter server auth:bootstrap` — create the first administrator.
5. Media only: `pnpm --filter server storage:dev` (MinIO on 9000/9001), create
   the `media` bucket, and uncomment the storage block in `apps/server/.env`.
6. Start the layers you need. Health check: `curl http://127.0.0.1:4000/health`.

### Stopping, restarting, and checking

`Ctrl-C` in a layer's terminal stops it cleanly and releases its port; both
watchers reload on file change, so restarting is rarely needed. Leave layers
running for as long as opencode is up: nothing stops them automatically at the
end of a turn or when opencode exits, so stop them yourself when you are done.

To see what is listening, and which pid owns it:

```bash
ss -ltnp 'sport = :4000'    # no output means the port is free
```

This is the source of truth — there is no state file to go stale. On a port
collision, `ss` names the occupant; kill that pid before starting. Kill only the
process on the port, never a whole terminal.

If a layer survives a stop, the same check plus `kill <pid>` is the reset.

**Prerequisite:** these checks need `ss` (iproute2). If `ss` is missing, stop and
tell the user — do not improvise with another tool. (`lsof` is not installed.)

### Testing

`pnpm verify` needs no running layer, and the integration tests set their own
`TURSO_*` against a temporary libSQL file, so they never touch a dev layer. Only
manual browsing needs layers up.
