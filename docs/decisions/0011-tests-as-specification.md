# 0011 — The rdd test suite is the specification

**Status:** Accepted

## Context

rdd has 468 tests across 26 files. They are not routine coverage: several encode defects
that were expensive to find and are invisible to inspection. Examples —

- the `activePanelId` invariant block, guarding a family of bugs where a *hidden* panel
  stayed globally active while a visible one rendered unfocused, so contributed toolbar
  controls silently acted on a panel the user could not see;
- `StyleHookups`, which exists because three CSS rules shipped dead in 6.0.0 — the
  component emitted a class no selector matched, undetectable under jsdom because the
  stylesheet is never loaded;
- `DomStability`, which guards the zero-unmount guarantee;
- `LayoutSerialization`'s derivation-order cases, which distinguish depth-first from
  breadth-first tree walks — a breadth-first walk picks the wrong tab in a nested grid.

The owner asked for a full port of all 26 files. But [0001](0001-vue-native-rewrite.md)
reshapes the API, so a mechanical translation is impossible: tests that drive
`SidebarHandle.setWidth()` have no such method to call.

## Decision

Treat the suite as **the specification**: port every *assertion*, keep every test *name*,
rewrite the *driving code* against the vdd API. Same coverage, same invariants, different
harness (`vitest` + `@vue/test-utils`).

Each ported file carries a header comment recording its rdd origin and any deviation. Three
dispositions are allowed, and every non-`Port` one must justify itself in that header:

- **Port** — same assertions, vdd API.
- **Substitute** — the guarantee is real but the mechanism changed, so the test is rewritten
  to prove the same guarantee (`DomStability` → Teleport stability; `FormContainer`'s
  subscription tests → watcher tests).
- **Moot** — the test covers machinery vdd deleted (`V2Features`' pending-call-queue tests,
  per [0004](0004-store-outside-components.md)). Recorded in
  [PARITY.md](../PARITY.md) §3 with the reason, never silently dropped.

Additions beyond the rdd suite:

- the cross-implementation layout fixtures ([0009](0009-layout-json-compatibility.md));
- a regression test per fixed defect ([0012](0012-fix-known-defects.md));
- browser-level tests for what jsdom cannot see — real layout, real pointer gestures, real
  WebGL context survival, and the handle hit-areas of D5.

## Consequences

- Test work is a large share of total effort. Accepted, because it is the only thing that
  makes the parity claim checkable rather than asserted.
- **A test may not be weakened to make it pass.** If vdd cannot satisfy a ported assertion,
  that is either a bug to fix or a divergence to record in
  [PARITY.md](../PARITY.md) §4 — never an edited expectation.
- Non-vacuity is verified the way rdd's own `6de3381` did it: revert the implementation,
  confirm the new tests fail, restore. A test that passes against a reverted implementation
  is proving nothing.
