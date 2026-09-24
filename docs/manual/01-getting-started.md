# 1. Getting started

## Install

```bash
npm install vue-dockable-desktop
```

Requires **Vue 3.4+**. The library has no other runtime dependencies.

## Set up

Two things: import the stylesheet, and create a workspace.

```ts
// main.ts
import { createApp } from 'vue'
import { createWorkspace } from 'vue-dockable-desktop'
import 'vue-dockable-desktop/styles.css'          // required
import App from './App.vue'
import MapPanel from './panels/MapPanel.vue'
import EditorPanel from './panels/EditorPanel.vue'

const workspace = createWorkspace({
  panels: {
    map:    { component: MapPanel, defaultOptions: { title: 'Map' } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor' } },
  },
})

createApp(App).use(workspace).mount('#app')
```

> Forgetting `styles.css` renders a black screen with no errors, so the library checks for
> it at startup and logs an explicit message in development.

`createWorkspace()` returns a Vue plugin, the same shape as `createPinia()` or
`createRouter()`. `app.use()` makes `useWorkspace()` available everywhere — in components,
and through the `workspace` object itself outside them.

It does **not** register the components globally: you import the ones you use, so a build
that never mentions `<VddToasts>` does not carry it. That is the one place vdd asks for a
line the React version did not need.

## Render it

```vue
<!-- App.vue -->
<script setup lang="ts">
import { VddDesktop, VddModals, VddSidePanels, VddToasts } from 'vue-dockable-desktop'
</script>

<template>
  <div class="app">
    <VddDesktop />
    <VddModals />
    <VddSidePanels />
    <VddToasts />
  </div>
</template>

<style>
.app { height: 100vh; overflow: hidden; }
</style>
```

`<VddDesktop>` is the workspace. The other three are hosts for overlays that must sit above
it; add them when you use those features.

## Height matters

`<VddDesktop>` fills its parent. In CSS, `height: 100%` only resolves if every ancestor has
a real height — if any one of them is `height: auto` (the default for a `<div>`), the chain
breaks and the workspace collapses to zero pixels and appears invisible.

Give the wrapper a real height (`100vh`, or `flex: 1; min-height: 0` inside a flex column).
The library detects a zero-height workspace in development and tells you which ancestor
broke the chain.

For the simplest case — a workspace that fills the window — add the `vdd-fill-viewport`
class, to `<VddDesktop>` itself or to its wrapper:

```vue
<VddDesktop class="vdd-fill-viewport" />
```

## Open a panel

From a component:

```vue
<script setup lang="ts">
import { useWorkspace } from 'vue-dockable-desktop'
const { openPanel } = useWorkspace()
</script>

<template>
  <button @click="openPanel('map-1', 'map')">Open map</button>
</template>
```

Or from anywhere at all — the workspace exists before your app mounts, so services, router
guards and plain modules can drive it:

```ts
// anywhere
workspace.openPanel('map-1', 'map')
```

`'map-1'` is the *instance* id — unique per open panel. `'map'` is the *component* key from
the registry. Opening an id that is already open focuses it instead of duplicating it.

## Next

- [Core concepts](02-concepts.md) — the vocabulary: panels, leaves, the grid, active panel
- [Panels](03-panels.md) — writing a panel that talks back to its container
