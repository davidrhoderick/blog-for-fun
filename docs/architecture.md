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
| Nesting depth | ≤ 4 | structure AST check |
| Cognitive complexity | ≤ 20 | Biome `noExcessiveCognitiveComplexity` |
| Nested callbacks | none excessive | Biome `noExcessiveNestedCallbacks` |
| JSX inside `useMemo`/`useCallback` | forbidden (admin, blog) | Biome GritQL plugin |
| Duplication | ≤ 3% | `jscpd` (scans stage) |

Generated code (`*.generated.ts`, `apps/admin/app/__generated__/**`), `.serena/`
(indexer config), and documentation markdown are not code and are exempt from
these checks.

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
- **`db/`** holds the Drizzle schema and client; it knows nothing above it.

This is architecture pattern #1 in the architecture suite (`tsarch`), which runs
in the pipeline's `scans` stage.

## Frontend composition (`apps/admin`, `apps/blog`)

- **Relay is the GraphQL client layer.** Components request data with Relay
  queries/fragments; do not hand-roll fetch calls.
- **Compose components.** Extract a new component when a piece is more than
  three things; do not grow one component into a whole page.
- **No JSX produced inside `useMemo`/`useCallback`** — those return values, not
  markup. Checked by the GritQL plugin above.
- **Reuse hooks**; a behavior that belongs in a hook lives in a hook.
- Split **server state** (Relay/route data) from **local or context state**; do
  not duplicate one into the other.
- React Router route modules stay thin and lazy-load client-only work; admin
  keeps `*.client.tsx` components behind `Suspense`.
