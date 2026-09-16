# vue-dockable-desktop — user manual

> Every chapter is drafted and was written against the **shipped** API rather than the plan —
> which is how three gaps were found (a missing `ContextMenuAdapter` equivalent, an undocumented
> divergence, and two documents describing a replaced model). Two standing gates keep it that
> way: `docs-api` rejects any chapter naming an export that does not exist, and `api-surface`
> rejects any export added or removed without being recorded.

A window manager and dockable layout engine for Vue 3. Fluid grid splits, tabbed groups,
floating resizable windows, a taskbar, side drawers, modals, toasts — and panels that keep
their state through all of it.

## Contents

| | Chapter | Status |
|---|---|---|
| 1 | [Getting started](01-getting-started.md) | drafted |
| 2 | [Core concepts](02-concepts.md) | drafted |
| 3 | [Panels](03-panels.md) | drafted |
| 4 | [Layout, docking and floating](04-layout.md) | drafted |
| 5 | [Saving and restoring layouts](05-persistence.md) | drafted |
| 6 | [Sidebar and toolbar](06-sidebar-toolbar.md) | drafted — **verified against the shipped API** (M9) |
| 7 | [Inside a panel: overlay toolbars and floating widgets](07-panel-overlay.md) | drafted — **verified against the shipped API** (M11) |
| 8 | [Modals, side panels and toasts](08-overlays.md) | drafted — **verified against the shipped API** (M10) |
| 9 | [Panel contributions](09-contributions.md) | drafted — **verified against the shipped API** (M12) |
| 10 | [Theming and skins](10-theming.md) | drafted |
| 11 | [Internationalisation](11-i18n.md) | drafted — **verified against the shipped API** (M12) |
| 12 | [Coming from react-dockable-desktop](12-migrating.md) | drafted |
| 13 | [API reference](13-api-reference.md) | drafted — **generated against the shipped surface** (M13) |

## The one thing to know first

Panels are **mounted once and never unmounted** while open. Dragging a panel from a tab into
a floating window, minimising it to the taskbar and restoring it does not re-create it: its
DOM is moved. A map keeps its WebGL context, an editor keeps its undo history, a video keeps
playing.

Two things the browser resets when a subtree is detached — scroll offsets and focus — the
library saves and restores explicitly, so a scrolled list comes back where you left it. See
[chapter 2](02-concepts.md#what-survives-and-what-the-library-restores) for the exact list.

Everything else in this manual follows from that.
