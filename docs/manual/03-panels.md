# 3. Panels

## A panel is just a component

```vue
<!-- panels/NotesPanel.vue -->
<script setup lang="ts">
import { ref } from 'vue'
const text = ref('')
</script>

<template>
  <textarea v-model="text" class="notes" />
</template>
```

Register it, open it, done. It needs to know nothing about the library.

```ts
const workspace = createWorkspace({
  panels: { notes: { component: NotesPanel } },
})
```

## Registration options

```ts
panels: {
  notes: {
    component: NotesPanel,
    defaultOptions: {
      title: 'Notes',                 // string, or an i18n descriptor
      icon: NotesIcon,                // a component or VNode
      initialTarget: 'docked',        // 'docked' | 'floating' | 'tabbed'
      favoritePosition: { x: 40, y: 40, width: 480, height: 320 },
      defaultAnchor: 'top-right',     // corner to pin to when floated
      canClose: true,
      canMinimize: true,
      canDrag: true,                  // false also prevents floating by drag
      canFloat: true,                 // false: the user can't float it (1.10.0)
      canDock: true,                  // false: the user can't dock it (1.10.0)
      disableLivePreview: false,      // taskbar hover shows a letter tile instead
      className: 'app-notes',         // on each panel's own content element (1.9.0)
      tabClassName: 'app-notes-tab',  // on its tab (1.9.0)
      keepAlive: true,                // false: unmount while hidden, see below (1.9.0)
    },
  },
}
```

`className` goes on the panel's own content element (`.vdd-panel-content`), which moves with
the panel, so it applies docked, floating and in the taskbar preview.

### Freeing a hidden panel (`keepAlive: false`)

By default a panel is never unmounted while it is open (see
[Zero unmount](02-concepts.md#zero-unmount)). For a heavy kind that is rarely shown,
`keepAlive: false` trades that for memory: the component unmounts while the panel is **an
unselected tab or minimised**, and mounts afresh when it is shown again.

- **Its own state is lost each time it is hidden**, and its `onUnmounted` runs: in such a
  panel, unmounting means *hidden*, not *closed*. Keep what must survive outside it.
- **A guard it registered with `onBeforeClose` is not active while it is unmounted.** Its dirty
  flag still is, so closing a hidden dirty panel still asks first.
- **Its tab, title, dirty flag and container carry on**, and the taskbar shows a letter tile
  instead of a live preview while it is minimised.
- A floating window is always shown, so a floating panel stays mounted.

## Per-instance data

```ts
openPanel('doc-42', 'document', {
  props: { path: '/notes/todo.md' },
  title: 'todo.md',
  dedupeKey: '/notes/todo.md',
})
```

`props` are passed to your component alongside `panelId`. `dedupeKey` means *"if a
`document` panel for this path is already open, focus it instead of opening a second"* —
useful when several call sites cannot agree on the same literal id.

> Whether `props` survive `saveLayout()` depends on whether they are JSON-serialisable. See
> [chapter 5](05-persistence.md); it is a runtime fact, not a type-level guarantee.

### A typed registry: `definePanels`

Wrap the map in `definePanels()` and the workspace's `openPanel` is typed from it: only registered
names are accepted, and `props` is checked against that panel's props (without `panelId`, which the
library passes). Opt-in: a plain map keeps working exactly as before (1.11.0).

```ts
import { createWorkspace, definePanels } from 'vue-dockable-desktop'

const panels = definePanels({
  map:   { component: MapPanel },
  chart: { component: ChartPanel },   // ChartPanel: defineProps<{ panelId: string; series: number }>()
})
export const workspace = createWorkspace({ panels })

workspace.openPanel('c1', 'chart', { props: { series: 3 } })    // ✓
workspace.openPanel('m1', 'mpa')                                // ✗ not a registered panel
workspace.openPanel('c2', 'chart', { props: { series: '3' } })  // ✗ series is a number
```

`definePanels` returns its argument unchanged; the typing is all at compile time. With a typed event
bus as well, pass both type arguments: `createWorkspace<typeof panels, AppEvents>({ panels })`.

The typing comes from the workspace `createWorkspace` returns. `useWorkspace()` returns the untyped
`Workspace`, so for typed calls inside components, import that same `workspace` (the one you
installed with `app.use`). The typed workspace is still a `Workspace` and goes anywhere one does.
Kinds registered later with `registry.register()` aren't in the type; open them through
`useWorkspace()`.

### Objects that cross into Vue's reactivity

The workspace's state is `reactive`, and so is anything you store in a `ref()` of your own. An
object that goes in — a panel prop, a widget's data, an `onSaveState` payload, or something the
library hands back to you — comes out as a **proxy**, not the object you put in. That matters
for objects that are compared by identity, or owned by another library: a map, a WebGL
context, an editor instance. A third-party library holding the original no longer recognises the
proxy (`proxy !== original`), and deep reactivity on a large graphics object is also slow.

- Mark such objects `markRaw(obj)` before handing them over, so Vue never wraps them.
- Keep your own reference in `shallowRef()`, not `ref()`, so only the reference is reactive.
- Or pass a getter (`() => editor`) instead of the object, and call it where you need it.

`toRaw(proxy)` gets the original back when you already have a proxy.

## Talking to the container: `usePanel()`

```vue
<script setup lang="ts">
import { watch } from 'vue'
import { usePanel } from 'vue-dockable-desktop'

const {
  id, title, isActive, isMinimized, isFloating, containerType, size, dirty,
  setTitle, setIcon, setDirty, close, minimize, onBeforeClose, onSaveState,
} = usePanel()
</script>
```

Everything in the first group is a **ref**, so you react to it with the tools you already
use:

```ts
watch(isActive,    active => active && editor.focus())
watch(isMinimized, min => min ? stopPolling() : startPolling())
watch(size,        ({ width, height }) => chart.resize(width, height))
watch(isFloating,  floating => console.log(floating ? 'window' : 'docked'))
```

`containerType` tells you where the panel is rendered: `'dockable-panel'`,
`'floating-window'`, `'modal'`, `'left-panel'`, `'right-panel'` or `'standalone'`. The same
component can be opened as a panel *and* as a modal; this is how it adapts.

Inside a modal or a side panel, `usePanel()` works the same way: `title` and `dirty` follow
the overlay, and `setTitle`, `setDirty`, `close` and `onBeforeClose` act on it. Two things
have no meaning there and warn in development instead: `minimize()` (an overlay has nowhere to
minimise to) and `onSaveState()` (overlays are not part of a saved layout).

### Unsaved changes

```ts
const { setDirty } = usePanel()
watch(text, () => setDirty(true))
```

A dirty panel shows `*` after its title, and closing it raises the built-in unsaved-changes
confirmation. Customise that dialog:

```ts
setDirty(true, {
  title: 'Discard notes?',
  message: 'Your notes have not been saved.',
  alert: '2 fields still required',
  alertType: 'warning',            // 'info' | 'warning' | 'success' | 'danger'
})
```

### Vetoing a close

```ts
onBeforeClose(async () => {
  const { confirmed } = await myOwnDialog()
  return confirmed          // false blocks the close
})
```

Registered in `setup`, disposed automatically with the component. There is no unsubscribe to
remember. It works the same in a docked panel, a floating window, a modal and a side panel.

The guard runs first. If it allows the close and the panel is dirty, the unsaved-changes
question is still asked.

### Contributing live state to a saved layout

`props` are captured when the panel opens. For state that accumulates afterwards — a scroll
position, a view mode, an in-progress edit — register a provider, and it is pulled fresh on
every `saveLayout()`:

```ts
onSaveState(() => ({ path: props.path, scrollTop: list.value?.scrollTop ?? 0 }))
```

Return `undefined` to fall back to the panel's static `props`. The value must be synchronous
and JSON-serialisable.

## Keyboard

Each tab group is one stop in the Tab order: the selected tab. From there, ArrowLeft and
ArrowRight move to the previous or next tab and show it (mirrored under RTL), and Delete
closes the focused tab — asking first if it has unsaved changes, as any close does.

## Closing and minimising from inside

```ts
const { close, minimize } = usePanel()
close()                  // honours dirty state and any onBeforeClose guard
close({ force: true })   // skips both
minimize()
```

## Panel actions

There is no slot for adding controls to a panel's tab or title bar. Put a panel's own actions
where the panel already renders:

- in an overlay toolbar on the panel's edge — see
  [Inside a panel](07-panel-overlay.md);
- in the application toolbar, contributed only while the panel is active — see
  [Panel contributions](09-contributions.md);
- in the panel's context menu, below.

## Panel context menu

```ts
import { usePanelContextMenu } from 'vue-dockable-desktop'

usePanelContextMenu(() => [
  { label: 'Save', action: save },
  { label: 'Revert', action: revert, disabled: !dirty.value },
])
```

Your items are appended to the standard Float / Minimize / Close menu. Pass a getter and the
list is re-read each time the menu opens, so `disabled` and friends track state.
