# Review rubric

Judgment questions the `review` stage asks Jev. These are the rules the
deterministic stages cannot see (see
[docs/architecture.md](../../docs/architecture.md) and
[docs/testing.md](../../docs/testing.md)).

Each `## <id>` section is one **Choice** question with two options, `pass` and
`fail`, so every answer carries a confidence. A `fail` at or above
`HIGH_CONFIDENCE` (0.8) fails the pipeline; a lower-confidence `fail` is listed
as uncertain for the agent to escalate.

Sections have a `question` line (the Choice instructions), `pass` and `fail`
(the option descriptions), and an optional `scope: diff` line. Without a scope a
question is asked of every changed symbol; with `scope: diff` it is asked once
against the whole collected diff.

TDD *order* — whether the test was written before the implementation — is not
observable in a diff, so it is not a question here; it stays a process rule in
[docs/testing.md](../../docs/testing.md). The diff-level question below judges
the observable half: that the change ships a test pinning its new behavior.

## structure-one-thing

question: Does this symbol do one thing, with no unrelated work mixed into it?
pass: The symbol has one clear responsibility; every statement serves it.
fail: The symbol mixes responsibilities, or carries unrelated work that belongs in another symbol.

## structure-abstraction

question: Is any abstraction this symbol adds justified by more than one caller, without single-use indirection or a chain of micro-helpers?
pass: Abstractions have multiple callers, or the symbol adds no abstraction.
fail: The symbol adds an abstraction, wrapper, or helper chain with a single caller, or splits one behavior into several trivial helpers.

## frontend-composition

question: If this symbol is frontend code, does it follow the composition rules: components extracted when a piece is more than three things, hooks reused, no JSX produced inside useMemo or useCallback, and server state kept separate from local or context state?
pass: The symbol is not frontend code, or it follows the composition rules.
fail: The symbol is frontend code that breaks a composition rule, such as growing one component into a whole page or producing JSX inside a memo hook.

## methodology-happy-path-unit

question: Does this change add a happy-path unit test that should instead be an integration test?
pass: No new happy-path unit test; unit tests added here pin an edge case only, or the symbol is not a test.
fail: A happy-path unit test was added where the behavior could be exercised through a system as an integration test.

## methodology-diff-test

scope: diff
question: Does this change come with a test that pins the new behavior it introduces?
pass: The diff adds or updates a test that exercises the new behavior, or the change introduces no new behavior to test.
fail: The diff adds new behavior that no test in the diff exercises.

## methodology-meaningful-assertions

question: Do this symbol's assertions check an outcome a reader can name, rather than merely executing lines or asserting that something is defined?
pass: Assertions pin a named behavior or boundary, or the symbol contains no assertions.
fail: Assertions are vacuous, such as asserting a call happened, a value is truthy, or a snapshot nobody reviews.

## architecture-new-pattern

question: Does this change introduce an architectural pattern, layer, or cross-module dependency that no existing architecture rule or tsarch pattern covers?
pass: No new uncovered pattern is introduced, or the pattern is already covered by an architecture rule.
fail: A new architectural pattern or cross-module dependency is introduced with no rule that would catch a later violation of it.
