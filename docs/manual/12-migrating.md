# 12. Coming from react-dockable-desktop

vdd is a Vue-native rewrite, not a transliteration. The feature set, the vocabulary and the
saved layout format are the same; the API is designed from the Vue side, so call sites
change.

**Your users' saved layouts do not.** The format is byte-compatible with rdd 6.2.0 in both
directions ([chapter 5](05-persistence.md)), so a migration does not discard the workspaces
people arranged.

## The shape of the change

| rdd | vdd |
|---|---|
| `new WorkspaceClient(config)` + `<DockableDesktopProvider client=…>` | `createWorkspace(config)` + `app.use(workspace)` |
| `<WindowManager />` | `<VddDesktop />` |
| `useWindowManagerState()` / `useWindowManagerActions()` | `useWorkspace()` — one composable, returns refs and actions |
| `useWindowManagerState(selector)` | `computed(() => …)` |
| `useFormContainer()` / `usePanelId()` / `usePanelSize()` | `usePanel()` |
| `SidebarHandle` / `ToolbarHandle` methods | `v-model:visible`, `v-model:active-tab-id`, `v-model:width` |
| `renderContent` / `renderHeader` / `renderHeaderActions` | slots |
| `onActivate` / `onDeactivate` / `onMinimize` / `onRestore` / `onResize` | `watch()` on `isActive` / `isMinimized` / `size` |

Full table in [PARITY.md](../PARITY.md#1-api-map). Every action name (`openPanel`,
`floatPanel`, `saveLayout`, …) and every type name (`LayoutNode`, `PanelInfo`,
`SerializedLayout`, `ToolbarItem`, …) is unchanged.

## Worked examples

**Setup.** No provider nesting, and the workspace works before the app mounts:

```ts
// rdd
const client = new WorkspaceClient({ panels, initialState })
<DockableDesktopProvider client={client}><WindowManager /></DockableDesktopProvider>

// vdd
const workspace = createWorkspace({ panels, initialState })
createApp(App).use(workspace).mount('#app')
// <VddDesktop /> in the template
```

**Lifecycle.** Five subscriptions become watchers, and there is nothing to unsubscribe:

```ts
// rdd
const { onActivate, onResize } = useFormContainer()
useEffect(() => onActivate(() => editor.focus()), [onActivate])
useEffect(() => onResize((w, h) => chart.resize(w, h)), [onResize])

// vdd
const { isActive, size } = usePanel()
watch(isActive, a => a && editor.focus())
watch(size, ({ width, height }) => chart.resize(width, height))
```

**Two-way state.** The imperative handles are gone because the state is a model:

```ts
// rdd
const ref = useRef<SidebarHandle>(null)
ref.current?.openTab('layers'); ref.current?.setWidth(320)

// vdd
const tab = ref('layers'); const width = ref(320)
// <VddSidebar v-model:active-tab-id="tab" v-model:width="width" :tabs="tabs" />
```

**Content.** Render props become slots:

```tsx
// rdd
<Sidebar tabs={[{ id: 'layers', label: 'Layers', icon: <Icon/>,
                  renderContent: (id, onClose) => <LayerList onDone={onClose} /> }]} />
```

```vue
<!-- vdd -->
<VddSidebar :tabs="[{ id: 'layers', label: 'Layers', icon: LayersIcon }]">
  <template #tab-layers="{ close }"><LayerList @done="close" /></template>
</VddSidebar>
```

**Inner floating widgets.** `open`/`onClose` collapse into one model, and the hook that held
the boolean disappears:

```tsx
// rdd
const info = usePanelFloatingWindow()
<PanelFloatingWindow id="info" open={info.isOpen} onClose={info.close} … />
```

```vue
<!-- vdd -->
<VddFloatingWidget id="info" v-model:open="showInfo" … />
```

## Things that no longer exist

- **The pending-call queue.** rdd's client queued calls made before the provider mounted and
  replayed them on connect. vdd's workspace owns its state, so calls take effect
  immediately. `isConnected` and the never-connected warning are gone with it.
- **`usePanelFloatingWindow()`** — it wrapped a boolean; use `v-model:open`.
- **`SidebarHandle`, `ToolbarHandle`** — every method was a getter or setter for state that
  is now a model.
- **Unsubscribe functions** from `onBeforeClose` / `onSaveState` / `subscribe` when called in
  `setup` — cleanup is automatic.
- **`getDimensions()`** — `size` is a ref.

## Behaviour that intentionally differs

vdd fixes five defects present in rdd 6.2.0. If your code worked around any of them, the
workaround is now unnecessary — and in the case of D2, possibly harmful.

| | rdd 6.2.0 | vdd |
|---|---|---|
| D1 | "Maximize" on a taskbar icon does nothing | restores, then maximises |
| D2 | `activePanelId` goes stale after `dockPanelToGroup` / `floatPanel` / `dockPanel` / `movePanelOrder` / `dockPanelToWorkspaceEdge`, so the visible tab can render unfocused and contributed controls bind to the wrong panel | every placement action resolves the active panel |
| D3 | `openPanel` on a minimised panel returns it to the *first* leaf; `restorePanel` returns it to its original one | both honour the original leaf |
| D4 | re-opening a minimised panel via `openPanel` publishes no `layout:changed`, so autosave misses it | publishes `panel:restored` and `layout:changed` |
| D5 | inner-widget edge resize handles have about half their intended grab area | full grab area |

Specifically: if you call `focusPanel()` after a dock or float to work around D2, you can
drop it.

## Suggested order

1. Set up `createWorkspace` + `app.use`, and confirm a saved rdd layout loads.
2. Port panel components. Most need no change beyond Vue syntax; those using
   `useFormContainer` move to `usePanel()` and watchers.
3. Port the shell — sidebar, toolbar, modals — converting handles to `v-model` and render
   props to slots.
4. Remove your D2 workarounds.
