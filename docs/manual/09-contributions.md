# 9. Panel contributions

An application toolbar whose contents depend on which panel the user is working in. A map
panel wants pan/draw/measure; a document panel wants bold/italic/heading; a chart panel wants
neither. The shell cannot know about all of them, and each panel should not have to reach into
the shell.

A panel *publishes*, the shell *merges*, and the library surfaces the publication only while
that panel is the active one.

## From inside a panel

```ts
import { usePanelContribution } from 'vue-dockable-desktop'

const tool = ref<'pan' | 'draw' | 'measure'>('pan')

usePanelContribution(() => ({
  toolbarItems: [
    { type: 'radio', id: 'pan', group: 'tool', label: 'Pan', icon: Hand,
      onActivate: () => (tool.value = 'pan') },
    { type: 'radio', id: 'draw', group: 'tool', label: 'Draw', icon: Pencil,
      onActivate: () => (tool.value = 'draw') },
  ],
  sidebarSections: [
    { id: 'layers', label: 'Layers', icon: Layers, component: LayerList },
  ],
}))
```

Both fields are optional and independent — publish only items, only sections, both, or
nothing. The library assigns **no meaning** to either: what a "toolbar item" is for is your
application's decision, and neither `<VddToolbar>` nor `<VddSidebar>` reads this on its own.

**Pass a getter, not an object.** The contribution is re-published whenever the getter's
result changes, so items that enable, check or disappear with the panel's own state need no
extra wiring:

```ts
usePanelContribution(() => ({
  toolbarItems: [
    { type: 'action', id: 'save', label: 'Save', icon: Save,
      onClick: save, disabled: !dirty.value },
  ],
}))
```

It is registered in `setup` and withdrawn with the component. There is nothing to clean up.

## In the shell

```vue
<script setup lang="ts">
import { useMergedToolbarItems, useMergedSidebarTabs } from 'vue-dockable-desktop'

const items = useMergedToolbarItems(APP_TOOLS)          // yours, plus the active panel's
const tabs = useMergedSidebarTabs(APP_TABS, FallbackIcon)
</script>

<template>
  <VddSidebar :tabs="tabs" v-model:active-tab-id="openTab">
    <VddToolbar :items="items" position="left" />
    <VddDesktop />
  </VddSidebar>
</template>
```

`useMergedToolbarItems` appends the contributed items behind a separator;
`useMergedSidebarTabs` appends contributed sections as tabs. Both return the original array
unchanged when there is nothing to add, and both are `computed`, so the toolbar follows the
active panel with no further wiring.

For a different merge — items first, no separator, a specific slot in the middle — read the
contribution yourself:

```ts
const contribution = useActiveContribution()
const items = computed(() => [
  ...(contribution.value?.toolbarItems ?? []),
  { type: 'separator' as const },
  ...APP_TOOLS,
])
```

`mergeToolbarItems(items, contribution)` and `mergeSidebarTabs(tabs, contribution, icon)` are
the plain functions the composables wrap, if you want the same shape at a different position.

## Why "only while active" is trustworthy

A contribution is read from the workspace's `activePanelId`. The thing that makes the feature
safe is a guarantee made elsewhere: **`activePanelId` never names a panel the user cannot
see.** Every action that could invalidate it — closing, minimising, docking, floating,
reordering, restoring a saved layout — resolves it through one code path.

That guarantee is worth stating because the failure it prevents is subtle rather than loud. If
`activePanelId` could name a hidden panel, the shell's toolbar would show controls belonging
to a panel behind another tab: controls that look functional and act on something the user
cannot see. react-dockable-desktop had exactly that after a layout restore, because it seeded
the active panel from insertion order rather than from what was visible.

So:

- Minimise a panel and its contribution disappears from the shell. It is still mounted and
  still publishing; restore it and the same contribution comes back.
- Put a panel behind another tab and the same applies.
- A panel that publishes nothing yields `null` while active — not the previous panel's items.

## Two instances of the same panel

Two map panels open at once both publish, independently, keyed by their own panel ids. But
contributed *toolbar item state* needs a moment's thought, because the workspace's own toolbar
state is keyed by item **id**:

```ts
// Both instances contribute an item with id "snap", so both read one shared value.
{ type: 'toggle', id: 'snap', label: 'Snap', icon: Grid }

// Controlled: each panel owns its own value, and they cannot collide.
{ type: 'toggle', id: 'snap', label: 'Snap', icon: Grid,
  active: snapping.value, onToggle: v => (snapping.value = v) }
```

Prefer the controlled form for anything contributed. A contributed control almost always
belongs to its panel rather than to the application, which is the same distinction chapter 6
draws for the toolbar generally.

## Sections and sidebar tabs

A `PanelSidebarSection` is `{ id, label, icon?, component, props? }`. `sectionToTab()`
converts one, using a fallback icon for sections that omit theirs.

A contributed section deliberately has no `eagerMount` or `preserveState`: it exists only
while its panel is mounted *and* active, so neither flag has anything to mean. If a panel's
sidebar content must survive being switched away from, keep the state in the panel and let the
section render it.

## Coming from react-dockable-desktop

| rdd | vdd |
|---|---|
| `<PanelContributionProvider>` | nothing — the store is on the workspace |
| `usePanelContribution(object)` | `usePanelContribution(getter)` — no memoising needed |
| `useActivePanelContribution()` | `useActiveContribution()`, a `computed` |
| `useMergedToolbarItems(items)` | same name; also `mergeToolbarItems(items, contribution)` |
| `useMergedSidebarTabs(tabs, icon)` | same name; also `mergeSidebarTabs(tabs, contribution, icon)` |
| `sidebarSectionToTab(section, icon)` | `sectionToTab(section, icon)` |
| `PanelSidebarSection.content` (a node) | `component` (+ optional `props`) |

The behavioural difference: **after a layout restore, the contribution surfaced is the visible
panel's.** rdd's was whichever panel came first in its `panels` object.
