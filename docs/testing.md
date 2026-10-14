# Testing method

One runner: **Vitest**, one config per package. Tests prove behavior, not that
lines ran. The pipeline runs them in the `test` stage; the rules it cannot see —
order, intent — live here and are judged by the review layer.

## TDD for new functions

Write the failing test first, then the function, then make it pass. Reuse the
`test-driven-development` skill; do not rebuild it.

## Two kinds of test

Tag **every** test `unit` or `integration` (Vitest `tags`, defined in each
package's config). The `integration` tag may carry a longer timeout.

- **Integration — "happy path-ish".** Added once a feature is confirmed working,
  these exercise a whole system: a resolver through its service and db, a
  component through its data. Normal behavior is asserted here.
- **Unit — edge cases only.** A unit test exists to pin a boundary the
  integration tests cannot reach: malformed input, empty case, permission
  boundary, expiry. Nothing else.

### Happy-path units are promoted, not kept

A happy-path unit that a TDD pass produced is **promoted to an integration test
and removed from the units**. TDD drives the function; whether the test ends up a
unit or an integration depends on what it exercises, not on when it was written.

### No `node:test` parity

Migrating to Vitest is **not** a one-for-one port. Convert happy-path unit tests
to integration tests where they apply; keep edge-case units as units. Do not
recreate a test 1:1 just because it existed.

## Meaningful tests, not many

YAGNI applies to tests. Every test should assert a behavior a reader can name; a
test that only executes lines without asserting the outcome is noise.

## Coverage

- **Floor: 80% lines and branches, per package**, enforced by Vitest.
- Set the floor **before** the tests exist, then raise coverage until the
  package is green. **Never lower a floor** to silence one hard file.
- **Exclude** genuinely untestable code per-file in config: I/O boundaries,
  generated code, migrations. Excludes are per-file only.
- **Inline ignores require a reason**, e.g.
  `/* v8 ignore next -- network boundary */`.
- Coverage is a floor, not a goal. It proves code ran, not that it asserts
  behavior. Meaning is judged in the review stage, not by the number.
