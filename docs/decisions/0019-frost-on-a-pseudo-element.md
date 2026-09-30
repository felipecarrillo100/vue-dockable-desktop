# 0019 — Frost on a pseudo-element; the sidebar and toasts follow the workspace into RTL

**Status:** Accepted (2026-09-30, M17, release 1.5.0). Ported from react-dockable-desktop 7.4.0,
which made the same decisions after a consumer's field report.

## Context

- **Frost.** A `backdrop-filter` on an element makes that element the containing block for its
  `position: fixed` descendants. Five containers that host consumer content carried one — the
  floating window, the drawer, the overlay widget, the frosted panel toolbar and, in `macos`, the
  docked panel — so a consumer's fixed dropdown inside them was positioned against the container,
  and which containers did that depended on the skin. The consumer found it with a console probe.
- **Direction.** `<VddSidebar>` is usually an ancestor of `<VddDesktop>`, and toasts are teleported
  to `<body>`, so the workspace's `dir` never reached them: `setDirection('rtl')` mirrored the
  desktop beside an unmirrored rail.

## Decision

1. **A container that hosts consumer content never carries a filter itself.** Its frost goes on its
   `::before` (`position: absolute; inset: 0; z-index: -1`, the container `isolation: isolate`),
   which is not an ancestor of the content. Where the frost saturates, the container's background
   moves to the same pseudo, after the filter, as it was on the element, because `saturate()` does
   not commute with the tint; the overlay widget's plain `blur()` does, so it keeps its own. The
   pseudo extends 1px under a 1px border (`inset: -1px`), and not on a maximized window.
2. **The sidebar and the toasts follow the workspace into RTL**: `dir="rtl"` on their root while
   `workspace.state.dir` is `'rtl'`; nothing otherwise, so a page-level `dir` still reaches them
   exactly as before. Everything inside the sidebar follows with it, a toolbar placed there
   included.
3. **Reduced motion** stops the library's own transitions and animations, with the same scope as
   `:animations="false"`.

## Consequences

- Pinned by `test/core/stylesheet.test.ts` ("consumer content contract") and the M17 browser gate,
  which also compares screenshots before and after (the frost moved back onto the element) within
  a small tolerance.
- The M15/M16 baselines see a new `::before` on those containers; their comparators fold it back
  onto the element, the one explicit equivalence they allow.
- A custom skin that frosts a container of its own should do the same; the theming chapter says so.
- Where a container clips its overflow (vdd's floating window), the pseudo can't reach under the
  1px border, so that band shows the page through the translucent border untinted — the one known
  difference; the pixel comparison covers the padding box.
- The `dir` goes on the sidebar's root, which wraps the application's own content, so the toolbar
  and any chrome placed inside a sidebar follow too: `setDirection('rtl')` makes the whole app RTL,
  which is the field report's ask. A toolbar outside any sidebar still follows the page. Chosen by
  the owner over mirroring only the rail and drawer.
- M14's contrast and skin-surface probes read a frosted container's `::before` background where
  the element's own is transparent — the one gate change, recorded here.
