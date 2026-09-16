# 0007 — Slots instead of render props

**Status:** Accepted

## Context

rdd passes UI through props, because that is React's only option: `SidebarTab.renderContent`
is a function of `(tabId, onClose, onOpen)`; `Sidebar.renderHeader` takes
`(tab, onClose, onOpen)`; `PanelDefaultOptions.renderHeaderActions` takes `(panelId)`;
`ManagedWindowConfig.content` and `ToastOptions.content` are `ReactNode`; icons everywhere
are `ReactNode`.

## Decision

Anything that is *markup* becomes a slot. Anything that is *configuration* stays data.

**Slots** — with the same parameters the render props received, as slot props:

```vue
<VddSidebar :tabs="tabs" v-model:active-tab-id="tab">
  <template #tab-layers="{ close }">   <!-- #tab-<id> -->
    <LayerList @done="close" />
  </template>
  <template #header="{ tab, close, open }">
    <MyHeader :title="tab.label" @close="close" />
  </template>
</VddSidebar>
```

**Data** — for the cases that are genuinely configuration, a `component` (+ `props`) field,
which Vue developers pass around routinely:

```ts
const tabs: SidebarTab[] = [
  { id: 'layers', label: 'Layers', icon: LayersIcon, component: LayerList },
]
workspace.registry.register('map', MapPanel, { title: 'Map', icon: MapIcon })
widgets.open('info', { title: 'Layer Info', component: LayerInfo, props: { id } })
```

Both routes are supported for tabs and widgets, because both are legitimately useful: a
slot when the content needs the parent's scope, a `component` when the tab list is built
from data. Where both are given, the slot wins, and a dev-mode warning says so.

Icons are components or VNodes, `markRaw`-ed by the registry.

## Consequences

- `ReactNode`-typed fields become `Component | VNode | (() => VNode)`. The
  `isSerializable` check that rejects React elements becomes an `isVNode` check, so a
  panel whose `props` carry a component is still correctly classified non-serialisable.
- The `#tab-<id>` dynamic slot name means a typo produces silently missing content. The
  component warns in dev when a tab has neither a matching slot nor a `component`.
- Slot content lives in the *parent's* render scope, which is more powerful than rdd's
  render props (no prop drilling for parent state) and is the main ergonomic win here.
