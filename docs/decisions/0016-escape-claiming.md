# 0016 — One Escape, one answer: whoever acts claims the event

**Status:** Accepted

## Context

Modals, drawers, the context menu, the toolbar flyout and the toolbar search all listen for
Escape. All but the search listen on `document`. The original routing (M10) relied on the
answering modal calling `event.stopPropagation()` so "the drawers below do not close as well".

That never worked as intended. `stopPropagation()` stops an event reaching *other nodes*; it
does not stop other listeners on the node it is already at. Every `document` listener ran on
every Escape, and the outcome depended on the order they had registered in:

- A drawer opened after a modal registered after it. The modal closed synchronously, so the
  drawer then saw an empty stack and closed too. Opening the drawer first — the order the
  existing test used — was the only one that worked. A close guard made the modal's close
  asynchronous and so, by accident, protected the drawer.
- A context menu or toolbar flyout registers when it opens, so it is always later than the
  overlay it was opened over, and the overlay acted first.
- An Escape in the toolbar search bubbled on to `document`.
- With a drawer on each side and no modal, both closed.

Reported by users against 1.1.1 (items 3 and 10 of the report).

## Decision

**Whoever acts on an Escape claims it; every listener checks for a claim before acting**
(`src/core/escape.ts`).

- A claim is `preventDefault()` plus a `WeakSet` entry. `preventDefault()` is the browser's
  own signal, and it lets an application widget inside a modal keep the modal open by calling
  it. The `WeakSet` covers synthetic events, which are not cancelable unless their creator
  asked.
- Transient UI answers first. The context menu and toolbar flyout listen on `document` in the
  **capture** phase, which runs before every bubble-phase listener there whatever the
  registration order. The toolbar search handles the key on its own input, which runs before
  `document`.
- Overlays then apply the existing M10 rule, now enforced by the claim: the topmost modal
  answers; a drawer answers only with no modal open; with two drawers, the one opened last.

## Alternatives considered

- **A single central Escape dispatcher** in the overlays core, choosing the target from a
  stack. It is the more robust shape, but the M10 gate asserts the per-host `onKeydown` and
  its exact rule, and the plan's integrity rules forbid editing a gate to make it pass.
  Claiming fixes every observed failure inside the shape M10 pins, so the gate stays as
  written. Revisit if a future change needs the dispatcher anyway.
- **`stopImmediatePropagation()`** stops later listeners on the same node, but only those
  registered *after* the caller. It would fix the modal-then-drawer order and none of the
  others.

## Consequences

- One Escape closes exactly one thing. Divergence D17 in [PARITY.md](../PARITY.md) §4.
- An application widget that calls `preventDefault()` on Escape keeps its modal or drawer
  open. That is the platform convention, and it is documented in `08-overlays.md`.
- Any new listener in the library that acts on Escape must check `isEscapeClaimed` and call
  `claimEscape`. Transient UI must listen in the capture phase or on its own element.
