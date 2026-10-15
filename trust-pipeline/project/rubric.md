# Review rubric

Judgment questions the `review` stage asks Jev about each changed symbol. These
are the rules the deterministic stages cannot see (see
[docs/architecture.md](../../docs/architecture.md) and
[docs/testing.md](../../docs/testing.md)).

Each `## <id>` section is one **Choice** question with two options, `pass` and
`fail`, so every answer carries a confidence. A `fail` at or above
`HIGH_CONFIDENCE` (0.8) fails the pipeline; a lower-confidence `fail` is listed
as uncertain for the agent to escalate.

Sections have three `field: text` lines: `question` (the Choice instructions),
`pass` and `fail` (the option descriptions).

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

## methodology-tdd-order

question: If this symbol is test code, does it pin the behavior of the code under test so it would fail if that behavior regressed, rather than testing implementation details or merely running the code?
pass: This symbol is not test code, or it is a test that pins observable behavior and would fail if that behavior regressed.
fail: This symbol is test code that would still pass if the behavior under test regressed, or that tests implementation details instead of behavior.

## methodology-meaningful-assertions

question: Do this symbol's assertions check an outcome a reader can name, rather than merely executing lines or asserting that something is defined?
pass: Assertions pin a named behavior or boundary, or the symbol contains no assertions.
fail: Assertions are vacuous, such as asserting a call happened, a value is truthy, or a snapshot nobody reviews.

## architecture-new-pattern

question: Does this change introduce an architectural pattern, layer, or cross-module dependency that no existing architecture rule or tsarch pattern covers?
pass: No new uncovered pattern is introduced, or the pattern is already covered by an architecture rule.
fail: A new architectural pattern or cross-module dependency is introduced with no rule that would catch a later violation of it.
