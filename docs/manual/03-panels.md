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
      disableLivePreview: false,      // taskbar hover shows a letter tile instead
    },
  },
}
```

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
remember.

### Contributing live state to a saved layout

`props` are captured when the panel opens. For state that accumulates afterwards — a scroll
position, a view mode, an in-progress edit — register a provider, and it is pulled fresh on
every `saveLayout()`:

```ts
onSaveState(() => ({ path: props.path, scrollTop: list.value?.scrollTop ?? 0 }))
```

Return `undefined` to fall back to the panel's static `props`. The value must be synchronous
and JSON-serialisable.

## Closing and minimising from inside

```ts
const { close, minimize } = usePanel()
close()                  // honours dirty state and any onBeforeClose guard
close({ force: true })   // skips both
minimize()
```

## Header actions

To put your own controls in a panel's tab or title bar:

```vue
<VddDesktop>
  <template #panel-actions="{ panelId }">
    <button v-if="panelId.startsWith('doc-')" @click="save(panelId)">Save</button>
  </template>
</VddDesktop>
```

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
