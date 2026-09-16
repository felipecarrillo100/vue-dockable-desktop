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
