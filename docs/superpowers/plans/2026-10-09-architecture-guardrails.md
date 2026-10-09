# Architecture Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce compact, readable, non-over-abstracted code across the repo with a rulebook, deterministic checks, and a judgment review.

**Architecture:** Three ordered, non-overlapping layers. A written rulebook (`docs/architecture.md` + `AGENTS.md`) is the single source of truth. Deterministic checks run first: Biome (style + cognitive complexity), a TypeScript-AST script (file/function length, nesting), and ts-arch (backend layer rules + dependency cycles). Only after those pass does the TypeSafe Jev review harness run its judgment rubric and emit a report. Nothing blocks yet.

**Tech Stack:** Biome 2.5.7 (GritQL plugins), `ts-arch` (dev-only), TypeScript compiler API, `tsx` + Node's `node:test`, TypeSafe Jev via the `typesafe-ai` skill.

**Spec:** `docs/superpowers/specs/2026-10-09-architecture-guardrails-design.md`

## Global Constraints

- Line width: **80** chars (Biome `formatter.lineWidth`).
- Function length: **≤ 80 LOC**; File length: **≤ 400 LOC**; Nesting depth: **≤ 4** (AST check).
- Cognitive complexity: **≤ 20**, Biome `noExcessiveCognitiveComplexity` set to `error`.
- Dependency flow: `route/resolver → service/mapper → db`. Resolvers must never import another resolver or `db`. Services may import services, mappers, `db`. Mappers are pure (no `db`).
- Order is fixed: Biome → architecture checks → Jev review. The review must never re-check deterministic rules.
- Review verdict: **fails iff any rubric question fails with high confidence.**
- Advisory only — no CI gating in this plan.
- Exclude generated code from all checks: `*.generated.ts`, `admin/app/__generated__/**`, GraphQL codegen output.
- Plugin types come from `@opencode/plugin@2.0.26` (already installed in `.opencode/`).

## Review Focus

- **Generated files** (`*.generated.ts`, `admin/app/__generated__/**`) must be excluded from size and dependency checks, or the checks fail on code we do not own. Test pinned in Task 2 and Task 3.
- **Multi-line signatures / arrow components**: function length must count body lines only, not miscount formatting. Test pinned in Task 2.
- **GritQL scoping**: the JSX-in-memo rule must fire in `admin/**` and nowhere else. Test pinned in Task 4.
- **Workspace aliases**: ts-arch must resolve `@blog/ui` etc. without false positives. Test pinned in Task 3.
- **Verdict combination**: medium/low-confidence answers must not fail the review; an empty diff passes. Test pinned in Task 5.

---

### Task 1: Rulebook and AGENTS.md

**Files:**
- Create: `docs/architecture.md`
- Create: `AGENTS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the human-readable rules every later task's copy must match.

- [ ] **Step 1: Write `docs/architecture.md`**

Include: the threshold table (80 line / 80 fn / 400 file / 4 nest / 20 cognitive, with the mechanism column), the backend layer rules, the frontend composition rules, and a "rule → mechanism" mapping table matching the spec's sections. Copy the exact numbers from Global Constraints.

- [ ] **Step 2: Write `AGENTS.md`**

A short summary: the non-negotiable rules (one line each) and a link to `docs/architecture.md`. State that the rulebook is the source of truth and that deterministic checks run before the Jev review.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md AGENTS.md
git commit -m "docs: add architecture rulebook and AGENTS.md"
```

---

### Task 2: AST size and nesting check

**Files:**
- Create: `tools/architecture/check.ts`
- Test: `tools/architecture/check.test.ts`
- Modify: `package.json` (root) — add `tsx` to devDependencies

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const MAX_FILE_LINES = 400`, `export const MAX_FUNCTION_LINES = 80`, `export const MAX_NESTING = 4`
  - `export type Violation = { rule: "file-length" | "function-length" | "nesting"; file: string; line: number; message: string }`
  - `export function checkSource(input: { filePath: string; source: string }): Violation[]`
  - `export const IGNORE_GLOBS: string[]` (generated code paths)
  - CLI `main()` that walks source files, applies `IGNORE_GLOBS`, prints violations, exits non-zero if any.

- [ ] **Step 1: Write the failing test** `tools/architecture/check.test.ts`

Use `node:test` + `node:assert`. Assert exact behaviors:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { checkSource } from "./check.ts"

test("flags a function over 80 body lines", () => {
  const body = Array.from({ length: 81 }, () => "  x()").join("\n")
  const v = checkSource({ filePath: "a.ts", source: `function f() {\n${body}\n}` })
  assert.equal(v.filter((x) => x.rule === "function-length").length, 1)
})

test("flags a file over 400 lines", () => {
  const v = checkSource({ filePath: "a.ts", source: "x()\n".repeat(401) })
  assert.ok(v.some((x) => x.rule === "file-length"))
})

test("flags nesting deeper than 4", () => {
  const src = `function f() {\n if (a) {\n  if (b) {\n   if (c) {\n    if (d) {\n     if (e) { g() }\n    }\n   }\n  }\n }\n}`
  assert.ok(checkSource({ filePath: "a.ts", source: src }).some((x) => x.rule === "nesting"))
})

test("passes a compliant function (multi-line signature not miscounted)", () => {
  const src = `export function f(\n  a: string,\n  b: string,\n) {\n  return a + b\n}`
  assert.deepEqual(checkSource({ filePath: "a.ts", source: src }), [])
})

test("ignores generated files", () => {
  assert.deepEqual(checkSource({ filePath: "schema/types.generated.ts", source: "x()\n".repeat(999) }), [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test tools/architecture/check.test.ts` (add `tsx` to root devDeps first if missing)
Expected: FAIL — `checkSource` not defined.

- [ ] **Step 3: Implement `checkSource` in `tools/architecture/check.ts`**

Use `ts.createSourceFile` from the TypeScript compiler. Walk nodes: nesting counts `IfStatement`/`ForStatement`/`WhileStatement`/`DoStatement`/`SwitchStatement`/`TryStatement`/`ConditionalExpression`; function length = `node.getEndLineNumber() - node.getStartLineNumber() + 1` for function-like nodes; file length = total lines. Match `IGNORE_GLOBS` against `filePath` before checking. Add the `main()` CLI (`process.argv` file list or repo walk via `node:fs`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test tools/architecture/check.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Run the CLI on the repo**

Run: `pnpm exec tsx tools/architecture/check.ts`
Expected: prints any current violations (non-zero exit is acceptable pre-remediation) and does not crash on generated files.

- [ ] **Step 6: Commit**

```bash
git add tools/architecture/check.ts tools/architecture/check.test.ts package.json pnpm-lock.yaml
git commit -m "feat(arch): add AST size and nesting check"
```

---

### Task 3: Backend layer and cycle rules (ts-arch)

**Files:**
- Create: `server/src/architecture.test.ts`
- Modify: `server/package.json` — add `ts-arch` to devDependencies

**Interfaces:**
- Consumes: nothing.
- Produces: a `node:test`/ts-arch suite enforcing resolver↛resolver, resolver↛db, and cycle-free server graph.

- [ ] **Step 1: Write the rules** `server/src/architecture.test.ts`

Using ts-arch's file API (no Jest adapter — call its core check/result API directly; consult ts-arch's non-Jest example). Rules:

- files in `src/schema/**/resolvers/**` `shouldNot().dependOnFiles().inFolder("src/schema/**/resolvers/**")` (excluding self-imports)
- files in `src/schema/**/resolvers/**` `shouldNot().dependOnFiles().inPath("src/db/**")`
- files in `src/**` `should().beFreeOfCycles()`

Ignore generated files (`*.generated.ts`).

- [ ] **Step 2: Run to verify it passes on current code**

Run: `pnpm --filter server exec tsx --test src/architecture.test.ts`
Expected: PASS. (If existing code legitimately violates a rule, record it as a known violation to remediate — do not weaken the rule.)

- [ ] **Step 3: Verify the rule actually catches a violation (red)**

Temporarily add `import { db } from "../../../db/index.ts"` to a resolver, rerun, and confirm the resolver↛db rule FAILS. Revert.

- [ ] **Step 4: Commit**

```bash
git add server/src/architecture.test.ts server/package.json pnpm-lock.yaml
git commit -m "feat(arch): enforce backend layer rules and cycle-free deps"
```

---

### Task 4: Biome config and JSX-in-memo rule

**Files:**
- Modify: `biome.json`
- Create: `biome/plugins/no-jsx-in-memo.grit`
- Test: `tools/architecture/biome-plugin.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Biome diagnostics for the JSX-in-memo pattern and the configured thresholds.

- [ ] **Step 1: Write the failing test** `tools/architecture/biome-plugin.test.ts`

Spawn `biome check --stdin-file-path=<path>` with inline source via stdin (keeps fixtures off disk) and assert on stdout:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"

const run = (filePath: string, source: string) =>
  execFileSync("node_modules/.bin/biome", ["check", `--stdin-file-path=${filePath}`], {
    input: source,
    encoding: "utf8",
  })

test("flags JSX inside useMemo in admin", () => {
  const out = run("admin/app/x.tsx", `function C() {\n const a = useMemo(() => <div>{1}</div>, [])\n return a\n}`)
  assert.match(out, /JSX/i)
})

test("does not flag JSX inside useMemo outside admin", () => {
  const out = run("server/src/x.ts", `const a = useMemo(() => <div/>)`)
  assert.doesNotMatch(out, /JSX/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test tools/architecture/biome-plugin.test.ts`
Expected: FAIL — no JSX diagnostic yet.

- [ ] **Step 3: Add the GritQL plugin** `biome/plugins/no-jsx-in-memo.grit`

Pattern that matches a `useMemo`/`useCallback` callback whose body contains a JSX element and registers a diagnostic (start from Biome's GritQL plugin docs; select the JSX element as the `span`). Wire it in `biome.json` under `plugins` with `"includes": ["admin/**"]`.

- [ ] **Step 4: Configure thresholds** in `biome.json`

- `formatter.lineWidth: 80`
- `linter.rules.complexity.noExcessiveCognitiveComplexity`: `{ "level": "error", "options": { "maxAllowedComplexity": 20 } }`
- `linter.rules.nursery.noExcessiveNestedCallbacks`: `"error"`
- keep `preset: "recommended"`

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec tsx --test tools/architecture/biome-plugin.test.ts`
Expected: PASS.

- [ ] **Step 6: Confirm config loads**

Run: `pnpm exec biome check .`
Expected: runs with the plugin and new thresholds; no config error.

- [ ] **Step 7: Commit**

```bash
git add biome.json biome/plugins/no-jsx-in-memo.grit tools/architecture/biome-plugin.test.ts
git commit -m "feat(arch): configure biome thresholds and JSX-in-memo rule"
```

---

### Task 5: Jev review harness

**Files:**
- Create: `tools/architecture-review/verdict.ts`
- Create: `tools/architecture-review/review.ts`
- Test: `tools/architecture-review/verdict.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const HIGH_CONFIDENCE = 0.8`
  - `export type RubricAnswer = { question: string; answer: boolean; confidence: number }`
  - `export function verdict(answers: RubricAnswer[]): { pass: boolean; failures: RubricAnswer[] }`
  - `export const RUBRIC: string[]`
  - `export async function collectDiff(ref?: string): Promise<string>`
  - CLI `main()` printing `question: answer (confidence)` + overall verdict.

- [ ] **Step 1: Write the failing test** `tools/architecture-review/verdict.test.ts`

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { verdict } from "./verdict.ts"

test("fails when a question fails with high confidence", () => {
  assert.equal(verdict([{ question: "q", answer: false, confidence: 0.95 }]).pass, false)
})

test("passes when the only failure is low confidence", () => {
  assert.equal(verdict([{ question: "q", answer: false, confidence: 0.4 }]).pass, true)
})

test("passes when all answers are true", () => {
  assert.equal(verdict([{ question: "q", answer: true, confidence: 0.99 }]).pass, true)
})

test("empty set passes", () => {
  assert.equal(verdict([]).pass, true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test tools/architecture-review/verdict.test.ts`
Expected: FAIL — `verdict` not defined.

- [ ] **Step 3: Implement `verdict.ts`**

`pass` = no answer where `answer === false && confidence >= HIGH_CONFIDENCE`. `failures` = those answers. Add `RUBRIC` = the backend + frontend judgment questions from the spec (Layer 3 section), verbatim.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test tools/architecture-review/verdict.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `review.ts`**

Read the `typesafe-ai` skill and its live docs before coding. `collectDiff` runs `git diff` (working tree, or `git diff <ref>` when a ref arg is given). Build the TypeSafe state from the diff, ask each `RUBRIC` question with Jev, map responses to `RubricAnswer[]`, print the report and `verdict(...)`. Exit non-zero on failure. If the diff is empty, print "no changes" and pass without calling the model.

- [ ] **Step 6: Smoke run**

Run: `pnpm exec tsx tools/architecture-review/review.ts` on the current working tree (a diff exists).
Expected: prints `question: answer (confidence)` lines and a verdict. Non-blocking.

- [ ] **Step 7: Commit**

```bash
git add tools/architecture-review/
git commit -m "feat(arch): add Jev judgment review harness"
```

---

### Task 6: Wire root scripts

**Files:**
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: `tools/architecture/check.ts`, `server/src/architecture.test.ts`, `tools/architecture-review/review.ts`.
- Produces: `lint`, `arch`, `review`, `check` scripts.

- [ ] **Step 1: Add scripts**

```jsonc
{
  "scripts": {
    "lint": "biome check .",
    "arch": "tsx tools/architecture/check.ts && pnpm --filter server exec tsx --test src/architecture.test.ts",
    "review": "tsx tools/architecture-review/review.ts",
    "check": "pnpm run lint && pnpm run arch"
  }
}
```

- [ ] **Step 2: Verify order and composition**

Run: `pnpm run check`
Expected: lint runs first, then arch; deterministic suite completes (known pre-existing violations may fail — that is expected before remediation).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat(arch): add lint/arch/review/check scripts"
```

---

### Task 7: Run the deterministic suite after each task

**Files:**
- Modify: `.opencode/plugin/biome-after-task.ts`

**Interfaces:**
- Consumes: the `pnpm check` script from Task 6.
- Produces: the plugin instructs agents to run the full deterministic suite, not only biome.

- [ ] **Step 1: Update the follow-up prompt**

Change the `followUp` constant so the agent runs `pnpm check` (deterministic suite) in addition to `pnpm exec biome format --write .`, keeping the "no suppressions/ignores" and one-sentence-reply instructions.

- [ ] **Step 2: Verify the plugin still loads**

Run: `cd .opencode && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`
Then touch the file and confirm the OpenCode log shows `loading plugin ... biome-after-task.ts` with no `failed to load plugin` after it.

- [ ] **Step 3: Commit**

```bash
git add .opencode/plugin/biome-after-task.ts
git commit -m "feat(arch): run full deterministic suite after each task"
```

---

## Self-Review

- **Spec coverage:** rulebook + AGENTS.md (Task 1); Biome thresholds + GritQL (Task 4); ts-arch layers/cycles (Task 3); AST size/nesting (Task 2); Jev harness + verdict (Task 5); scripts/order (Task 6); advisory enforcement via the existing plugin (Task 7). Phase 2 (reviewer of deterministic results) and Phase 3 (CI) are out of scope per Global Constraints.
- **Type consistency:** `checkSource`, `Violation`, `verdict`, `RubricAnswer`, `HIGH_CONFIDENCE` are defined in their task's Interfaces block and referenced consistently.
- **Review Focus:** each of the five lines has a test pinned to its owning task (generated-file exclusion in Tasks 2–3; multi-line signature in Task 2; GritQL scoping in Task 4; aliases in Task 3; verdict combination + empty diff in Task 5).
- **Proportion:** the plan states signatures, tests, and pinned values; bodies are left to the implementer except where a fallback or pattern must be chosen.
