# Architecture rules

The rules every change is held to. They are enforced by the trust pipeline (see
[AGENTS.md](../AGENTS.md) and [testing.md](./testing.md)); this document is the
human-readable version so a reader — or the review layer — knows the standard.

## Structure as-if-portable

Every feature separates a **generic engine/method** from **project-specific
rules/config**, and app code stays free of infrastructure concerns. The trust
pipeline is the first deliberate instance of this: a generic `engine/` plus this
repo's `project/` config. Apply the same split everywhere — reusable parts keep
their own dependencies and must not import app code. This is what makes later
extraction mechanical instead of a refactor.

## Size and complexity thresholds

| Rule | Threshold | Mechanism |
|---|---|---|
| Line width | 80 | Biome formatter (`formatter.lineWidth`) |
| Function length | ≤ 80 LOC | structure AST check |
| File length | ≤ 400 LOC | structure AST check |
| Route module length | ≤ 150 LOC | structure AST check (a route holds a loader, action, meta, and page) |
| Nesting depth | ≤ 4 | structure AST check |
| Cognitive complexity | ≤ 20 | Biome `noExcessiveCognitiveComplexity` |
| Nested callbacks | none excessive | Biome `noExcessiveNestedCallbacks` |
| JSX inside `useMemo`/`useCallback` | forbidden (admin, blog) | Biome GritQL plugin |
| Duplication | ≤ 3% | `jscpd` (scans stage) |

A single-caller helper may be extracted to satisfy a deterministic structure
limit only when it names a cohesive operation or phase boundary. Do not split
mechanically or add wrappers/helper chains to evade a limit.

Generated code (`*.generated.ts`, `apps/admin/app/__generated__/**`), `.serena/`
(indexer config), documentation markdown, and test files (`*.test.ts`,
`*.test.tsx`) are not shipped source and are exempt from these checks. The size
and nesting thresholds apply to source code, not tests.

## Backend layering (`apps/server`)

```text
resolver → service → db
```

- **Resolvers** (`src/schema/**/resolvers/**`) translate one GraphQL field into
  a call. They may use the `auth/` helpers (`requirePermission`,
  `hasPermission`) to authorize. A resolver **must not call another resolver**,
  and **must not touch the database** directly.
- **Services** (`src/services/<domain>/`) own all database access and business
  rules, and are the only layer in the schema path that imports `db/`.
- **`auth/`** is a peer subsystem and may use `db/` directly. It is not in the
  schema path, and wrapping it in a service would only add indirection.
- **Mappers** (`services/**/to*.ts`) may import `db/schema` for row types but
  never the `db` client: they map, and nothing else. A mapper that queries is a
  service in disguise.
- **`db/`** holds the Drizzle schema and client and imports no layer above it.
  `lib/env` is a permitted leaf — it imports nothing from the app.

This is architecture pattern #1 in the architecture suite (`tsarch`), which runs
in the pipeline's `scans` stage.

## Frontend composition (`apps/admin`, `apps/blog`)

- **Both apps use Relay as their GraphQL client layer.** Components request
  data with Relay queries/fragments; do not hand-roll fetch calls there.
- **`apps/admin` is client-only.** Editorial data is never loaded in SSR route
  loaders; routes render placeholders and lazy-load `*.client.tsx` components
  behind `Suspense`.
- **`apps/blog` preloads on the server.** Route loaders run a Relay
  `fetchQuery`, then serialize the store (`getStore().getSource().toJSON()`)
  into `loaderData`. The root route seeds a `RelayEnvironmentProvider` from the
  active match's records, so route components read `store-or-network` during
  SSR and hydration and the content stays in the server-rendered HTML.
- **Compose components.** Extract a new component when a piece is more than
  three things; do not grow one component into a whole page.
- **Route modules define what they export.** `loader`, `action`, `meta`,
  `handle`, and the default component are defined in the route file, never
  re-exported or aliased from another module, so opening one file shows what
  the page does. Local helpers that name a step the route performs are welcome.
- **Lazy client work gets a boundary.** A module that lazily imports a
  `*.client` component renders it inside `Suspense`.
- **No JSX produced inside `useMemo`/`useCallback`** — those return values, not
  markup. Checked by the GritQL plugin above.
- **Reuse hooks**; a behavior that belongs in a hook lives in a hook.
- Split **server state** (Relay query or route data) from **local or context
  state**; do not duplicate one into the other.
- React Router route modules stay thin and lazy-load client-only work; admin
  keeps `*.client.tsx` components behind `Suspense`.
