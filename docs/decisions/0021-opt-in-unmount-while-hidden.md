# 0021 — Opt-in unmount while hidden (`keepAlive: false`)

**Status:** Accepted (2026-10-06, owner's decision, for all three editions: rdd 7.8.0, vdd 1.9.0,
ndd 1.7.0). Amends [0002](0002-zero-unmount-via-teleport.md) for panel kinds that opt in; the
default is unchanged.

## Context

[0002](0002-zero-unmount-via-teleport.md) makes zero unmount the library's defining feature: a
panel is mounted once and never unmounted while it is open. That stays right for almost every
panel. A map, an editor or a video keeps its state across every move, which is the reason to use
the library.

The cost is that a panel holds whatever it holds for as long as it is open, visible or not. An app
with many heavy panels that are rarely shown (a report, a large table, a 3D preview) asked for a
way to free that while they are hidden. It was chosen on value and cost as one of the Release A
items, with the same name in all three editions.

## Decision

A panel kind can set `defaultOptions.keepAlive: false`. Its component is then mounted only while
the panel is on screen: floating, or the selected tab of its group. It unmounts while the panel is
an unselected tab or minimised, and mounts afresh when it is shown again.

The structure of 0002 is untouched. `<VddPanelMount>`, its Teleport, its context and the cache
element all stay for the panel's whole life; only the panel's own component is conditional
(`v-if`), inside the teleported content. So the panel's tab, title, dirty flag, container and
`usePanel()` context carry on, and the teleport target still never disappears.

Without the option, nothing changes: `keepAlive` defaults to `true`.

## Consequences

- In a `keepAlive: false` panel, `onUnmounted` means *hidden*, not *closed*. The manual says so,
  next to the option ([Chapter 3](../manual/03-panels.md)), and [Chapter 2](../manual/02-concepts.md)
  notes the exception beside the zero-unmount guarantee.
- A guard the panel registered with `onBeforeClose` is disposed with the component, so it is not
  active while the panel is hidden. The panel's dirty flag lives in the store and still is. The
  same holds in rdd (`useBeforeClose`).
- The taskbar shows a letter tile instead of a live preview for such a panel, since there is
  nothing to preview while it is minimised.
- `test/components/releaseA.test.ts` pins it: unmount and fresh remount, the default unchanged,
  and no leaked instances or DOM over 50 hide/show cycles.
