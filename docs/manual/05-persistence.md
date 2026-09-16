# 5. Saving and restoring layouts

## The basics

```ts
const { saveLayout, loadLayout } = useWorkspace()

localStorage.setItem('layout', saveLayout())     // a JSON string
loadLayout(localStorage.getItem('layout')!)      // true on success, false if unusable
```

Restore on startup instead, before anything renders:

```ts
const workspace = createWorkspace({
  panels: { … },
  initialState: localStorage.getItem('layout'),   // null is fine
})
```

`loadLayout` replaces the entire workspace: panels not in the snapshot are closed. A
malformed or unparseable string is rejected and returns `false`, leaving the current layout
untouched — it never throws or half-applies.

## Autosave

```ts
const { subscribe, saveLayout } = useWorkspace()
subscribe('layout:changed', () => localStorage.setItem('layout', saveLayout()))
```

## What is saved

The grid tree, floating window rects and z-order and anchors, the minimised list, per-panel
metadata (component key, title, state, the leaf/rect it came from, dirty flag, `props`), and
which panel was active.

## What cannot be saved: non-serialisable props

`openPanel`'s `props` accept anything, but only JSON-serialisable values survive a save. A
function, a class instance, a `Map`, a `Set`, a `RegExp` or a Vue component cannot be
restored from JSON, so a panel carrying one is **excluded from that snapshot** — pruned from
the grid, floating and minimised lists too, so a restore never references a panel it cannot
recreate.

The panel keeps working on screen. It simply will not come back after the next
`loadLayout()`.

This is deliberately not silent:

```ts
subscribe('layout:panels-excluded', ({ panels }) => {
  console.warn('Not saved:', panels.map(p => p.id))
})
```

Check ahead of time if you prefer:

```ts
import { isSerializable } from 'vue-dockable-desktop'
if (!isSerializable(myProps)) { /* pass an id instead of the object */ }
```

The usual fix is to pass an identifier in `props` and look the live object up inside the
panel.

> `Date` is accepted, matching `JSON.stringify` — note it restores as an ISO string, not a
> `Date`.

## Capturing state that changes after opening

```ts
const { onSaveState } = usePanel()
onSaveState(() => ({ path: props.path, scrollTop: el.value?.scrollTop ?? 0 }))
```

Pulled fresh on every `saveLayout()`, and re-checked for serialisability each time — a
panel's serialisability can change over its lifetime.

## Which panel is active after a restore

Resolved in this order:

1. the snapshot's own `activePanelId`, if that panel is still visible in the restored layout;
2. otherwise the selected tab of the first leaf in the grid, depth-first;
3. otherwise the frontmost floating window, so a float-only layout does not restore with
   nothing active;
4. otherwise `null`.

A minimised panel is never chosen — it is not on screen, even though it is still running.
The same rule holds during normal use: closing or minimising the active panel moves
`activePanelId` to whatever became visible in its place.

## Compatibility with react-dockable-desktop

The format is **byte-compatible with `react-dockable-desktop` 6.2.0**, in both directions,
at `version: 2`.

A layout saved by the React library loads here, and one saved here loads there. If you are
migrating an application from React to Vue, your users keep the workspaces they arranged.
This is a supported guarantee, verified by tests that load layout fixtures captured from the
React library and assert an exact round-trip — not a coincidence of shared ancestry.

The one thing to know: **vdd does not persist inner floating-widget placement** (chapter 7),
because rdd does not, and adding a required field would break the guarantee. Widgets are
persisted by your own code via `v-model:placement` (see [chapter 7](07-panel-overlay.md)).
