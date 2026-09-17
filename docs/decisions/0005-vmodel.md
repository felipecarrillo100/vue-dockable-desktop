# 0005 — `v-model` for every two-way prop

**Status:** Accepted

## Context

rdd has a consistent, carefully documented pattern for state that the library can own or
the caller can own: *controlled if the prop is present at all, uncontrolled if it is
`undefined`* — with `null` a meaningful value. It appears on `ToolbarToggleItem.active`,
`ToolbarGroupItem.activeItemId`, `Sidebar.activeTabId`, and
`PanelFloatingWindow.stretch`. Where React could not express it as a prop pair at all,
rdd resorts to an imperative handle: `SidebarHandle.show/hide/toggle/setWidth/getWidth`,
`ToolbarHandle.show/hide/toggle`.

This is precisely what `v-model` is.

## Decision

Every two-way piece of state is a `defineModel`, named for what it holds:

```vue
<VddSidebar
  v-model:active-tab-id="tab"
  v-model:visible="sidebarOpen"
  v-model:strip-visible="stripOpen"
  v-model:width="sidebarWidth"
  :tabs="tabs"
/>

<VddFloatingWidget v-model:open="showInfo" v-model:stretch="stretch" v-model:anchor="anchor" … />

<VddToolbarToggle v-model="snapEnabled" :icon="SnapIcon" title="Snap to grid" />
```

The controlled/uncontrolled distinction survives unchanged, and becomes self-evident:
binding `v-model` makes the caller the source of truth; omitting it lets the component keep
its own state. `null` remains meaningful (`v-model:stretch="null"` means *not stretched*,
and is still "controlled").

## Consequences

- `SidebarHandle` and `ToolbarHandle` cease to exist — every method was a getter or setter
  for state that is now a model.
- `usePanelFloatingWindow()` ceases to exist. It was a `useState<boolean>` wrapper.
- `onPlacementChange` splits into `v-model:anchor` + `v-model:stretch`. rdd deliberately
  reported these together, because one gesture can change both and reporting them
  separately would surface an invalid intermediate state. **Vue's batched updates preserve
  that**: both models are written in the same tick, so a watcher never observes a
  half-applied placement. A combined `@placement-change` event is still emitted for callers
  who want the pair atomically.
- `defineModel` requires Vue 3.4+. That sets the floor for the peer dependency.
- `defineExpose` is kept only where the action is genuinely imperative and has no state to
  model: `<VddContextMenu>.show()`, the toast singleton, and `useFloatingWidgets()`.

## Amendment (1.0.1) — a model cannot also be a seed

Appended rather than rewritten: the decision stands, but one thing it says about the
controlled/uncontrolled distinction turned out to be true only from the caller's side.

`defineModel` has **two** positions, not three. Bind the prop and the binder is authoritative —
Vue re-syncs the child's local value whenever the prop's *identity* changes. Leave it off and
the component owns the value. There is no way to say *"start here, then let the component own
it"*, which is exactly what rdd's `defaultAnchor` / `defaultStretch` say, and what any caller
inside the library that renders widgets from data needs.

`<VddPanelOverlay>` needed that third position for `useFloatingWidgets()` widgets and had no
spelling for it, so 1.0.0 bound `:placement` to a freshly-built `{ anchor, stretch }` literal —
which reset the widget on every render of the overlay, discarding every placement gesture a
user made. (Reported by a user; recorded as R1 in [PARITY.md](../PARITY.md).)

Two things follow for anything added later:

1. **An object-valued model must never be bound to a literal.** Vue compares by identity, so a
   new object each render is a reset each render. rdd could not hit this: the only placement
   value it let a caller control was a primitive (`stretch`), and the anchor was always
   internal. Ours is a pair, so the hazard is ours to police — the M14 gate now rejects
   `:placement="{`, and the manual states the rule where the model is introduced.
2. **Where the library itself needs a seed, the library owns the state.** The overlay keeps a
   placement record per widget id and echoes gestures back into it. That is the honest shape:
   if something must be bound, the bound value has to be the live one.
