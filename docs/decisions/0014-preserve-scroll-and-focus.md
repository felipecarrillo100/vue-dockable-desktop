# 0014 — Preserve scroll position and focus across re-parenting

**Status:** Accepted

## Context

The library's headline guarantee is that a panel is never unmounted, so its state survives
every layout change ([0002](0002-zero-unmount-via-teleport.md)). That is true of component
state, WebGL contexts, media elements and open connections — but **not** of everything.

Measured in real Chrome, moving a subtree through a `display:none` container and back (the
exact path every minimise, tab-switch and re-dock takes):

| State | Survives? |
|---|---|
| WebGL context (`isContextLost()`) | **yes** |
| DOM node identity | **yes** |
| `<input>` value | **yes** |
| `<input>` selection range | **yes** |
| `<details open>` | **yes** |
| **`scrollTop` / `scrollLeft`** | **no — reset to 0** |
| **`document.activeElement`** | **no — focus lost** |
| `<iframe>` content | **no — the document re-loads.** Not preventable |

Detaching an element from the document resets the scroll offsets of its scrollable
descendants; this is browser behaviour, not a framework artefact. rdd re-parents the same
way through the same kind of hidden container, so rdd loses inner scroll position on every
transition despite advertising "zero-unmount state preservation". The gap was never visible
in its test suite because jsdom does no layout — nothing can scroll there, so nothing can be
seen to lose a scroll offset.

## Decision

vdd preserves both, rather than documenting the gap as a limitation.

The preserved record is **owned per panel and outlives the hidden period**. It is
*refreshed* only while the panel is laid out, and *applied* whenever it becomes laid out
again:

1. **Before a move** — if the panel currently participates in layout (`offsetParent !== null
   || getClientRects().length > 0`), walk its subtree for elements with
   `scrollHeight > clientHeight || scrollWidth > clientWidth`, recording `{ el, top, left }`,
   plus `document.activeElement` and its selection range if focus is inside the subtree.
   If the panel is *not* laid out, keep the record already stored — there is nothing
   meaningful to read.
2. **After the move** — if the panel is now laid out, apply the stored record; otherwise
   apply it on the next frame once it is.

**Storing per panel rather than capturing per move is the whole point**, and M0 proved it:
capture-at-each-move works for visible-to-visible transitions but fails for minimise →
restore, the case that matters most. While a panel sits in the `display:none` container it
has no layout, so every scroller reports `scrollHeight === clientHeight === 0`, the capture
on the way *out* finds nothing, and the restore restores nothing. Verified failing, then
verified fixed, in [the M0 record](../evidence/M0.md).

Opt-out per panel via `defaultOptions.preserveScroll: false`, for panels that manage their
own virtualised scrolling and would rather be told about the transition (`isMinimized` is
already a ref they can watch).

Focus restoration is deliberately narrower than scroll: it applies **only** when the panel
being restored becomes the active panel. Restoring focus into a background panel would steal
the caret from wherever the user is actually typing.

## Consequences

- A user's scroll position inside a panel now survives minimise/restore and tab switching —
  which is what the library's own documentation has always implied.
- A divergence from rdd, recorded as **D6** (scroll) and **D7** (focus) in
  [PARITY.md](../PARITY.md) §4, and back-portable.
- New cost on every transition: one `querySelectorAll` over the panel subtree plus a
  geometry read per candidate. Bounded by panel content, and it only runs on transitions,
  not on render.
- This must be verified in a **browser** gate. A jsdom test cannot see it — which is exactly
  why the defect survived in rdd.
- Two more things are worth testing rather than assumed, and are added to M0's gate: an
  `<iframe>` (expected to reload on re-parent — a genuine, documentable limitation) and a
  CSS animation mid-flight.
