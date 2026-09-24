# 6. Sidebar and toolbar

Two pieces of application chrome that surround the workspace rather than living inside it: an
activity bar with a resizable drawer, and a strip of tool buttons on any edge. Both are
optional, and both are ordinary components — you place them yourself, so they sit wherever
your layout needs them.

## The sidebar

`<VddSidebar>` renders three things in a row: the activity strip of tab icons, the drawer that
opens beside it, and whatever you put in its default slot — usually the workspace.

```vue
<script setup lang="ts">
import { VddSidebar, VddDesktop } from 'vue-dockable-desktop'
import { Layers, Search, Settings } from './icons'

const tabs = [
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'search', label: 'Search', icon: Search },
]
const openTab = ref<string | null>('layers')
</script>

<template>
  <VddSidebar v-model:active-tab-id="openTab" position="left" :tabs="tabs">
    <template #tab-layers><LayerTree /></template>
    <template #tab-search><SearchPanel /></template>

    <VddDesktop />
  </VddSidebar>
</template>
```

Clicking a tab opens its drawer; clicking the open tab again closes it. `position` is `left`
or `right` and decides which edge the whole assembly sits on — you never place the strip and
the drawer separately.

### Four models

| Model | Meaning | Default |
|---|---|---|
| `v-model:active-tab-id` | the open tab, or `null` | `null` |
| `v-model:visible` | show the whole sidebar | `true` |
| `v-model:strip-visible` | show the activity strip; the drawer is unaffected | `true` |
| `v-model:width` | drawer width in pixels | `280` |

Bind one and you own it: the sidebar reads your value and reports changes, and nothing happens
until you write back. Leave it off and the sidebar keeps its own. That single choice is what
React libraries have to spell out as "controlled" and "uncontrolled" modes.

So `v-model:visible` is also how you hide and show the sidebar — there is no `show()` or
`hide()` to call:

```vue
<VddSidebar v-model:visible="sidebarShown" :tabs="tabs">
```

`strip-visible` exists for the pattern where a hamburger button drives everything and the icon
rail should not be on screen at all: hide the strip, keep the drawer, open tabs yourself.

Width is clamped to `minWidth`/`maxWidth` (150–600 by default) while the user drags, and the
drawer will not *render* outside those bounds even if you set a value beyond them.

### Tab content, two ways

A `#tab-<id>` slot, as above — or a `component` on the tab itself, when the tabs come from
data:

```ts
const tabs = [
  { id: 'layers', label: 'Layers', icon: Layers, component: LayerTree },
  { id: 'props', label: 'Properties', icon: Info, component: Inspector, props: { compact: true } },
]
```

A slot wins over `component` for the same id. In development you get a warning if a tab that
opens has neither.

### When content mounts

By default a tab's content mounts on first open and unmounts when the drawer closes. Two flags
change that:

- `eagerMount: true` — mount as soon as the sidebar renders. Implies `preserveState`.
- `preserveState: true` — keep the content alive behind `display: none` when closed.

Use `preserveState` for anything expensive or stateful: a half-filled form, a loaded tree, a
scrolled list. Use `eagerMount` when the content needs to start work before anyone looks at
it — a subscription, a first fetch.

### Hidden tabs

A tab with `hidden: true` renders no button on the rail but is otherwise a normal tab: fully
openable through `v-model:active-tab-id` or `useSidebar().openTab()`. This is how you get a
panel that only a menu item or a keyboard shortcut can reach. Every tab can be hidden at once,
leaving a rail with nothing on it but your own header button.

### The drawer header

By default the drawer shows the open tab's label. Three ways to change that:

- `showCloseButton` adds an "×" beside the title.
- `hideDefaultHeader` removes the header entirely.
- a `#header` slot replaces it, and receives `{ tab, close, open }`.

```vue
<template #header="{ tab, close }">
  <MyHeader :title="tab.label" @dismiss="close" />
</template>
```

Providing `#header` suppresses the default header on its own — `hideDefaultHeader` is not
needed alongside it. `showCloseButton` has no effect once the header is gone, since the button
is part of it; in development you are told so rather than left wondering.

### Pinned rail entries

`headerAction` and `footerAction` add entries above and below the tab list. Each takes one
entry or an array, and an entry can be three things:

```ts
// a button that does not toggle the drawer
{ id: 'menu', icon: Menu, label: 'Menu', onClick: () => (navOpen = !navOpen) }

// a real tab, behaving exactly like one from the main list
{ id: 'settings', label: 'Settings', icon: Settings, component: SettingsPane }

// something you render yourself, unwrapped
{ id: 'avatar', custom: true, component: UserAvatar }
```

The footer is pinned to the bottom of the rail regardless of how many tabs there are — the
usual home for Settings and an account avatar.

### A second sidebar

`<VddSecondarySidebar>` is the same component on the opposite edge. It takes whichever side
the primary is not using, so you never give it a `position`:

```vue
<VddSidebar position="left" :tabs="navTabs">
  <VddSecondarySidebar :tabs="inspectorTabs" v-model:active-tab-id="inspector">
    <VddDesktop />
  </VddSecondarySidebar>
</VddSidebar>
```

It accepts everything the primary does and must be nested inside one. Two is the limit; a
third throws with an explanation. The two resize independently.

### Reaching the sidebar from anywhere

```ts
const { openTab, closeDrawer, activeTabId, position, isSecondary } = useSidebar()
```

`activeTabId` is a ref, so you can watch it. Inside a tab's own content there is also:

```ts
const { tabId, open, close, openTab } = useSidebarTab()
```

which is scoped to the tab you are in — a "done" button can `close()` without knowing which
tab it lives in. `useSidebar()` also works from a panel rendered in the workspace, since the
workspace is the sidebar's own content. `useSidebarTab()` does not: it needs a drawer tab
around it. Each throws, with a message saying what is missing, where it cannot work.

## The toolbar

`<VddToolbar>` takes a `position` and an array of items. Items are data, not markup:

```vue
<script setup lang="ts">
import { VddToolbar, type ToolbarItem } from 'vue-dockable-desktop'

const items: ToolbarItem[] = [
  { type: 'action', id: 'zoom-all', label: 'Zoom to fit', icon: Fit, onClick: fitAll },
  { type: 'separator' },
  { type: 'radio', id: 'pan', group: 'mode', label: 'Pan', icon: Hand },
  { type: 'radio', id: 'select', group: 'mode', label: 'Select', icon: Cursor },
  { type: 'toggle', id: 'snap', label: 'Snap to grid', icon: Grid },
  {
    type: 'group',
    id: 'draw',
    label: 'Draw',
    defaultIcon: Pencil,
    items: [
      { id: 'line', label: 'Line', icon: Line, shortcut: 'L' },
      { type: 'separator' },
      { id: 'polygon', label: 'Polygon', icon: Polygon },
    ],
  },
]
</script>

<template>
  <VddToolbar position="left" :items="items" v-model:visible="toolbarShown" />
</template>
```

- **action** — a one-shot button.
- **radio** — one of a set; items sharing a `group` are mutually exclusive.
- **toggle** — an independent on/off modifier.
- **group** — a collapsed family: one button that opens a flyout with radio semantics inside.
  The button wears the selected sub-tool's icon, so the strip shows the state while collapsed.
- **separator** — a rule.

`position` is `left`, `right`, `top` or `bottom`, and decides the orientation. `v-model:visible`
collapses the strip without unmounting anything, so state survives being hidden.

### Where the selection lives

Radio and toggle state is on the workspace, so nothing needs a provider and anything can read
or set it:

```ts
const toolbar = useToolbar()

toolbar.activeInGroup('mode')            // 'pan' | null
toolbar.setActiveInGroup('mode', 'select')
toolbar.isToggled('snap')                // boolean
toolbar.setToggled('snap', true)
toolbar.toggle('snap')
```

That includes from inside a panel — a map panel can read the active tool without the toolbar
passing anything down to it.

### Taking control of an item

Supply `active` on a toggle, or `activeItemId` on a group, and that item stops consulting the
workspace: your value is the truth and the item reports changes instead of applying them.

```ts
{ type: 'toggle', id: 'snap', label: 'Snap', icon: Grid,
  active: panel.snapEnabled, onToggle: v => (panel.snapEnabled = v) }
```

The prop counts as supplied when it is *present*, including `active: false` and
`activeItemId: null`. That distinction is the point: workspace state is keyed by item id, so
two instances of the same panel type would otherwise share one "snap" setting. Control the
item and each panel keeps its own.

Use the workspace state for genuinely global modes, and control the item when it belongs to a
particular panel.

## Coming from react-dockable-desktop

rdd exposed eleven methods across two imperative handles. Every one of them was a getter or a
setter for state, so each is a model here:

| rdd | vdd |
|---|---|
| `sidebarRef.current.openTab(id)` | `useSidebar().openTab(id)`, or write `v-model:active-tab-id` |
| `closeDrawer()` | `useSidebar().closeDrawer()`, or write `null` |
| `getActiveTab()` | read `v-model:active-tab-id` (or `useSidebar().activeTabId`, a ref) |
| `show()` / `hide()` / `toggle()` | write `v-model:visible` |
| `showStrip()` / `hideStrip()` | write `v-model:strip-visible` |
| `setWidth(px)` / `getWidth()` | write / read `v-model:width` |
| `onActiveTabChange`, `onWidthChange`, … | the models' own `update:` events |
| `tab.renderContent(id)` | a `#tab-<id>` slot, or `tab.component` |
| `renderHeader(tab, onClose, onOpen)` | the `#header` slot, same values as slot props |
| `<ToolbarProvider>` | nothing — the state is on the workspace |
| `getActiveInGroup` / `isModifierActive` | `activeInGroup` / `isToggled` |
| `setModifierActive` / `toggleModifier` | `setToggled` / `toggle` |

One behavioural difference worth knowing: rdd's `setWidth` clamped inside the component, so
calling it out of range silently changed your value. A model belongs to you, so vdd clamps
where the value is produced — the resize drag — and bounds the rendered drawer with
`min-width`/`max-width`. Set `width` to 9999 and your ref still says 9999; the drawer draws at
`maxWidth`.
