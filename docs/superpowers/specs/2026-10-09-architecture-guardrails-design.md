# Architecture Guardrails — Design

- **Date:** 2026-10-09
- **Status:** Draft for review
- **Scope:** Repo-wide (server, admin, packages, local tools)

## Context and goal

Agents working in this repo tend to produce code that is correct but hard to
read: functions that do too many things, premature indirection (a helper used by
one caller, chained through several files), and — in React — JSX hidden behind
memo hooks and state scattered into ad-hoc React context.

The goal is to keep code **compact, shallow, and readable end-to-end** — you
should be able to read one resolver or one component without chasing through ten
files — while still allowing genuine reuse.

We enforce this with three layers that run **in order and never overlap**:

1. **Prevention** — a written rulebook agents read before writing code.
2. **Deterministic checks** — mechanical rules that a machine can decide.
3. **Judgment review** — a semantic reviewer for what a machine cannot decide.

Deterministic checks always run before the judgment review, and the judgment
review never re-checks anything a deterministic rule already covers.

### Success criteria

- A structural problem is either blocked by a deterministic rule or flagged by
  the review with a specific, named reason — never "vibes".
- Adding a new abstraction, helper, or file carries a visible cost.
- The three layers share one source of truth and do not duplicate each other.

### Non-goals

- CI/CD setup. There is none today; these checks start advisory and become
  blocking later.
- Rewriting existing code to comply. The guardrails will flag pre-existing
  violations; remediation is a separate, incremental effort.
- Replacing human review.

## Design overview

```
                docs/architecture.md   ← single source of truth
                        │  (AGENTS.md points here; agents read first)
        ┌───────────────┼────────────────────────────┐
        ▼               ▼                             ▼
  1. Biome        2. Architecture checks        3. Review harness (Jev)
  (style +        (ts-arch deps/cycles +        (judgment questions →
   complexity)     AST size/nesting)             typed answers + verdict)
  deterministic   deterministic                 semantic, report-only
        └───────────────┴────────────► run first ─┘  runs only after 1 & 2
```

Each mechanism implements a named subset of the rulebook. The rulebook contains
a rule → mechanism mapping so the subsets stay in sync (see below).

## The rulebook (single source of truth)

**`docs/architecture.md`** holds the human-readable rules and the threshold
table. **`AGENTS.md`** at the repo root is a short pointer that agents load
automatically; it summarizes the non-negotiables and links to the rulebook. Every
other layer cites the rulebook rather than restating rules.

### Thresholds (apply to every app, package, and local tool)

| Rule                | Value          | Mechanism                                |
| ------------------- | -------------- | ---------------------------------------- |
| Line width          | 80 chars       | Biome formatter `lineWidth`              |
| Function length     | 80 LOC         | AST check                                |
| File length         | 400 LOC        | AST check                                |
| Nesting depth       | 4              | AST check                                |
| Cognitive complexity| 20             | Biome `noExcessiveCognitiveComplexity`   |

Rationale: 80-char lines and small functions match Google's published JS limits
and the industry clean-code baselines (arXiv 2507.19721). Biome has no
function/file length or general nesting rule, and its complexity rule is
*cognitive* complexity, not cyclomatic — see Open Questions.

### Backend layer rules (`server/`)

Dependency flow is one-directional:

```
route / resolver  →  service / mapper  →  db
```

- **Resolvers** may call any service, and occasionally a mapper. They must never
  import another resolver and must never import `db` directly.
- **Services** are the reusable, interchangeable unit. They may call other
  services, mappers, and `db`.
- **Mappers** are pure transforms (input or output shaping), live inside their
  feature's service folder (e.g. `services/posts/toPost.ts`), and never touch
  `db` themselves.

### Frontend composition rules (`admin/`)

The React app has no resolver/service/db triad, so it has its own rules:

- **Compose components.** Implement behavior as other components. Never assign
  JSX to `useMemo`/`useCallback`/a variable — extract a component instead.
- **Hooks over plumbing.** Call a hook where its value is used; do not call a
  hook and pass its result into another hook.
- **Hooks stay reusable.** Invoking a hook must not duplicate browser work
  unless that is genuinely the intent (e.g. a network-only request).
- **Three things, then extract.** If a component does more than three things
  before it renders, extract private hooks.
- **Utility escape hatch.** When a hook accumulates advanced logic, extract
  utilities.
- **Server state is the default.** Keep server state in the GraphQL client layer
  (Relay in this repo). Use reactive vars, client queries, or a new React context
  sparingly, and only when truly necessary.
- **Local state is the exception.** Most state is server state or
  react-hook-form state; local state is for occasional interactivity only.

## Layer 1 — Biome (deterministic)

Config in the root `biome.json`:

- `formatter.lineWidth: 80` (explicit, currently default).
- `linter.rules.complexity.noExcessiveCognitiveComplexity` → **error**, max 20.
- `linter.rules.nursery.noExcessiveNestedCallbacks` → catch nested callbacks.
- Recommended preset stays as the baseline.

Pattern rules Biome can express but that aren't built-ins go in **GritQL
plugins** under `biome/plugins/*.grit`, wired via `plugins` in `biome.json`:

- **`no-jsx-in-memo.grit`** — flag JSX produced inside `useMemo`/`useCallback`
  (scoped to `admin/**` via the plugin `includes` option).

GritQL plugins are per-file; they cannot see other files, so cross-file rules
belong to Layer 2.

## Layer 2 — Architecture checks (deterministic)

### 2a. Dependency and cycle rules (ts-arch)

`ts-arch` (ArchUnit for TypeScript, dev-only) enforces the backend layer rules
and dependency cycles, which no per-file linter can. Runs against the server's
`tsconfig.json`.

Rules:

- Files in `resolvers/` must not depend on files in `resolvers/`.
- Files in `resolvers/` must not depend on `db/`.
- The server dependency graph must be **cycle-free** (this is the mechanical
  form of "don't chase through ten files").

Location: `server/src/architecture.test.ts`, executed by the existing
`tsx --test` runner (`pnpm --filter server test`). ts-arch's core result API is
used directly (no Jest adapter); verify the exact assertion call during
implementation.

### 2b. Size and nesting rules (TypeScript AST check)

Biome cannot count function/file lines or general nesting depth, so one small
script fills this gap using the TypeScript compiler already installed:

- File ≤ 400 LOC, excluding generated code and tests (define ignore globs).
- Function ≤ 80 LOC.
- Nesting depth ≤ 4 (general control-flow nesting, not just callbacks).

Location: `tools/architecture/check.ts`, runnable via `pnpm arch` and by the
existing test runner. Ignores generated files (`*.generated.ts`,
`admin/app/__generated__/**`, GraphQL codegen output).

## Layer 3 — Review harness (judgment, TypeSafe Jev)

A script that turns a diff into **typed judgments**, not prose. It uses
TypeSafe's **Jev** System One model via the installed `typesafe-ai` skill
(live docs are the source of truth for state, primitives, confidence, and SDK
usage).

Flow:

1. Collect the diff (working tree, or a branch/range).
2. Set the diff as TypeSafe **state**.
3. Ask a fixed rubric of **judgment questions** (below); each returns a typed
   answer and a confidence.
4. Print `question: answer (confidence)` lines plus an overall verdict.

**Verdict:** the review fails if any rubric question fails with high confidence.

The rubric (initial):

**Backend**

- Does any changed function carry more than one distinct responsibility?
- Does the change add an abstraction (helper/module/interface) with a single
  caller where inlining would read more directly?
- Is there a chain of tiny (<10 LOC) functions that only call one another, where
  one honest function would be clearer?

**Frontend**

- Does a component do more than three things before rendering without extracting
  private hooks?
- Is server state duplicated into local state or a new React context without
  necessity?
- Does a hook perform browser work that is not stably reusable?

It must **not** re-ask anything Layer 1 or Layer 2 decides (line/function/file
length, nesting, complexity, JSX-in-memo, layer imports, cycles).

Location: `tools/architecture-review/`. Output is **report-only**; nothing
blocks yet.

## File and script layout

| Path                                   | Purpose                                   |
| -------------------------------------- | ----------------------------------------- |
| `docs/architecture.md`                 | Rulebook (source of truth)                |
| `AGENTS.md`                            | Agent-facing summary + pointer            |
| `biome.json`                           | Thresholds + lint config                  |
| `biome/plugins/no-jsx-in-memo.grit`    | GritQL pattern rule                       |
| `server/src/architecture.test.ts`      | ts-arch layer + cycle rules               |
| `tools/architecture/check.ts`          | AST size/nesting check                    |
| `tools/architecture-review/`           | Jev review harness + rubric               |

Root `package.json` scripts:

- `lint` — `biome check .`
- `arch` — AST check + ts-arch rules
- `review` — run the Jev harness (non-blocking report)
- `check` — `lint` then `arch` (deterministic first, in order)

## Enforcement posture

- **Now:** advisory. The existing `biome-after-task` OpenCode plugin already
  re-runs `biome check` after a task; a follow-up can extend it to `pnpm check`
  so agents fix violations automatically.
- **Later:** wire `pnpm check` into CI as blocking; keep `review` advisory.

## Phasing

- **Phase 1:** rulebook, AGENTS.md, Biome config + GritQL plugin, ts-arch rules,
  AST check, Jev harness (report-only).
- **Phase 2:** a separate reviewer that inspects the *deterministic* results and
  summarizes them for the agent/human.
- **Phase 3:** CI gating.

## Testing the guardrails themselves

Each deterministic rule gets a passing and a failing fixture so the guardrails
are themselves tested (ts-arch rule fixtures; a self-check in the AST script).
The Jev harness gets a smoke run against a known diff.

## Resolved decisions

1. **GraphQL client layer: Relay.** Confirmed — this repo uses Relay; the
   frontend server-state rule targets the Relay client layer, not Apollo.
2. **Complexity metric: cognitive.** "Cyclomatic complexity 20" is implemented
   as Biome *cognitive* complexity = 20.
3. **Verdict semantics.** The review fails if any rubric question fails with
   high confidence.

## Notes

- **Bug-fix (unrelated).** The `.opencode/plugin/biome-after-task.ts` plugin was
  broken by the OpenCode V1→V2 upgrade (not by superpowers) and has been ported
  to the V2 API.
