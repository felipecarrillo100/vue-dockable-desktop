# 4. Layout, docking and floating

Most of this chapter is things your users do with the mouse. The API exists so you can do
them programmatically too — for a "reset layout" button, a workspace preset, or a test.

## What the user can do

- **Drag a tab** onto another leaf's top/bottom/left/right target to split it, or its centre
  to join that tab group. Drag within a tab bar to reorder.
- **Drag to a workspace edge** to create a full-width or full-height row/column.
- **Drag to a workspace corner** to float the panel anchored to that corner.
- **Drag anywhere else** to float it freely.
- **Resize** splits by dragging the divider; floating windows from any of eight edges.
- **Double-click a window title bar** to maximise it.
- **Minimise** to the taskbar; click the icon or its hover preview to restore.
- On **touch**: long-press (300ms) a tab or title bar to start a drag; long-press a taskbar
  icon for its context menu. Moving more than 8px cancels the press.

Dropping a panel where it already is does nothing. A panel that is alone in its group,
dropped back onto that same group — any side, or the centre — asks for the layout it already
has, and the sole docked panel dropped on a workspace edge likewise already fills the
workspace. Both are no-ops rather than moves, in the drag and through the actions below.

RTL is handled throughout: drop zones, tab order and corner anchors mirror, and anchors are
stored logically so a layout saved in one direction restores correctly in the other.

## Programmatic equivalents

```ts
const {
  floatPanel, dockPanel, dockPanelToGroup, dockPanelToWorkspaceEdge,
  maximizePanel, minimizePanel, restorePanel, focusPanel,
  movePanelOrder, closeLeafGroup, updateSplitSizes, updateFloatingPosition,
} = useWorkspace()

floatPanel('map-1', { x: 100, y: 80, width: 520, height: 360 })
floatPanel('map-1', undefined, 'bottom-right')     // float, pinned to a corner
dockPanel('map-1')                                 // back to its last leaf
dockPanelToGroup('map-1', 'group-left-top', 'right')   // split that leaf
dockPanelToWorkspaceEdge('map-1', 'bottom')            // full-width row
minimizePanel('map-1')
restorePanel('map-1')                              // focuses it
restorePanel('map-1', { focus: false })            // restores without stealing focus
```

## Split ratios

Set the defaults once:

```ts
createWorkspace({
  defaultSplitRatio: 0.5,      // dropping on a leaf's edge
  defaultEdgeSplitRatio: 0.2,  // dropping on a workspace edge
})
```

Both are clamped to 0.1–0.9. Adjust an existing split by index path:

```ts
updateSplitSizes([], [0.7, 0.3])    // the root branch's two children
updateSplitSizes([1], [0.5, 0.5])   // the branch that is the root's second child
```

## Starting from a defined layout

The grid is data, so you can hand the workspace a shape to start from — typically with empty
leaves that panels then open into:

```ts
createWorkspace({
  initialState: JSON.stringify({
    version: 2,
    gridRoot: {
      type: 'branch', orientation: 'vertical', sizes: [0.75, 0.25],
      children: [
        { type: 'leaf', id: 'main',    panels: [], activePanelId: null },
        { type: 'leaf', id: 'console', panels: [], activePanelId: null, keepOnEmpty: true },
      ],
    },
    floating: [], minimized: [], panels: {},
  }),
})
```

`keepOnEmpty: true` keeps a leaf in the layout after its last tab closes — use it for a slot
that should stay reserved, like a console pane.

## Locking a panel down

Registration options restrict what the user may do:

```ts
defaultOptions: { canDrag: false, canMinimize: false, canClose: false }
```

`canDrag: false` also prevents floating by drag, and keeps the tab in place. A leaf can
refuse to be closed with `canClose: false` on the leaf node itself.

## Reacting to layout changes

```ts
const { subscribe } = useWorkspace()

subscribe('layout:changed', () => localStorage.setItem('layout', saveLayout()))
subscribe('panel:opened',  ({ id, component }) => track('open', component))
subscribe('panel:closed',  ({ id }) => {})
subscribe('panel:minimized', ({ id }) => {})
subscribe('panel:restored',  ({ id }) => {})
```

Subscriptions made inside `setup` are disposed with the component.

`layout:changed` is the coalesced signal for autosave: it covers open, close, minimise,
restore, dedupe redirects and every placement change. It does **not** fire when an
`onSaveState` provider's return value changes on its own — that is a pull, and nothing can
observe it changing. If your panel's state matters for autosave, save on your own trigger
too.

## The event bus, for your own messages

The same channel carries application events between panels, so two panels can talk without
knowing about each other:

```ts
const { publish, subscribe } = useWorkspace()
publish('map:zoom', { level: 12 })
subscribe('map:zoom', ({ level }) => {})
```

Type them by parameterising the workspace:

```ts
interface MyEvents { 'map:zoom': { level: number } }
const workspace = createWorkspace<MyEvents>({ … })
```
