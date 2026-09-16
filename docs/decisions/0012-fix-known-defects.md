# 0012 — Fix rdd's known defects in vdd, log the divergence

**Status:** Accepted

## Context

A source audit of rdd 6.2.0 found five defects, four confirmed by probe and one in a real
browser. A port could reproduce them faithfully (maximal fidelity) or fix them (maximal
correctness).

## Decision

Fix them in vdd from the start, and record each in [PARITY.md](../PARITY.md) §4 so the
divergence is deliberate, auditable, and back-portable to rdd.

| # | Defect in rdd 6.2.0 | Fix in vdd |
|---|---|---|
| D1 | *"Maximize"* on a minimized panel's taskbar context menu does nothing: `maximizePanel` only maps over `state.floating`, and a minimized panel is not in that array. Probed — state byte-identical before and after | Restore, then maximise |
| D2 | `activePanelId` left stale by `dockPanelToGroup`, `floatPanel`, `dockPanel`, `movePanelOrder`, `dockPanelToWorkspaceEdge`. These set the *leaf's* `activePanelId` via `addPanelToLeaf`/`splitLeafInTree` but never the global one. Probed — after a dock, one tab renders focused and a *different* one renders unfocused simultaneously; after a float, the new window lacks focused chrome entirely. Masked in real drags only because the drag handlers happen to call `focusPanel` first | Every placement action resolves `activePanelId`, as `restorePanel` does since 6.2.0 |
| D3 | `openPanel` on a minimized panel returns it to the *first* leaf; `restorePanel` returns it to `lastLeafId`. Probed with two live leaves: `restorePanel` → `R`, `openPanel` → `L` | Both honour `lastLeafId`, with the same fallback chain |
| D4 | Re-opening a minimized panel via `openPanel` publishes neither `panel:restored` nor `layout:changed`, because events are gated on `isNew \|\| isRedirect` and both are false. Probed — empty event list. Breaks autosave consumers relying on the documented coalesced signal | Publishes both |
| D5 | `.rdd-panel-float`'s `overflow: hidden` clips the outer 4px of every edge resize handle positioned at `-4px`, leaving ~4px of an 8px target, and `elementFromPoint` at the border sometimes returns the window instead of the handle. Verified in a browser | Handles not clipped; hit area is the full intended size, asserted in a browser test |

D2 deserves emphasis: it is the same defect family as rdd's `6de3381` and the 6.2.0 fix,
generalised. vdd should resolve `activePanelId` in **one** place that every placement action
routes through, so the bug cannot be reintroduced action by action — which is how rdd
accumulated five instances of it.

Also adopted: the naming and hygiene problems found alongside them — `wasActive` in
`minimizePanel` that does not check `activePanelId`, `maximizePanel` that toggles rather
than maximises, the duplicated `options?.title || options?.title`, ref mutation inside a
state updater, and rdd's module-level `closeHandlers`/`idCounter` singletons (which
[0004](0004-store-outside-components.md) moves onto the workspace instance).

## Consequences

- vdd is not observably identical to rdd. Intentional; §4 of PARITY.md is the contract for
  what differs.
- Ported tests that *encode* a defect must be inverted, and each such inversion is called
  out in the test file header ([0011](0011-tests-as-specification.md) forbids silent
  weakening — an inversion is the opposite, an explicit strengthening).
- Each fix carries a regression test that fails against the rdd behaviour, so these cannot
  silently regress back to parity.
