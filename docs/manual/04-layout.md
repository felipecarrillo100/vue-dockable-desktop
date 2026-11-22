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
focusPanel('map-1')                                // bring to front / select its tab; a minimised one stays minimised
focusPanel('map-1', { restore: true })             // ...and restore a minimised one first (1.13.0)
```

`focusPanel(id, { restore: true })` restores a minimised panel through `restorePanel`, with its
events, then focuses it. Without the option a minimised panel becomes the active one but stays in
the taskbar, as before.

`getOpenPanelIds()` lists every open panel. While a managed widget is out of its panel, its own
panel is listed too: `'map-1/results'` ([Chapter 14](14-widgets-out-of-the-panel.md)).

**Into its own browser window** (1.14.0, rdd 7.12.0): `popOutPanel('map-1')`, called inside the
user's click, moves a panel of a type with `canPopOut` into a window of its own, on a workspace
created with `popOut: true`; `returnPanel('map-1')` brings it back where it was, and
`focusPanelWindow('map-1')` brings its window forward. While it is out, `floatPanel` and
`maximizePanel` are ignored, `focusPanel` also brings its window forward, and `minimizePanel` and
the three dock actions bring it back first, then apply. See [Chapter 15](15-popout-windows.md).

### Opening beside another panel

`dockTo` places a *new* panel next to one that is already docked (1.9.0):

```ts
// A legend in a new group on the right of the chart, taking a quarter of the width:
openPanel('legend-1', 'legend', { dockTo: { panel: 'chart-1', position: 'right', size: 0.25 } })
// A second document as a tab in the same group as the first:
openPanel('doc-2', 'editor', { dockTo: { panel: 'doc-1', position: 'center' } })
```

`position` is `'left'`, `'right'`, `'top'`, `'bottom'` (a new group on that side) or `'center'`
(a tab in the same group). `size` is the new group's share of the split, 0.1–0.9, and defaults
to the workspace's split ratio. `dockTo` wins over `initialTarget` and applies only to a panel
that isn't open yet. If the target isn't docked (not open, floating or minimised), the panel is
placed as usual and a warning says why.

## Controlling where users can move panels

Two opt-in controls decide where the **user** can move a panel (1.10.0). Neither restricts your
own calls: `floatPanel`, `dockPanelToGroup`, `openPanel` and the others always do what they say.

**Per kind**, in its registration options:

```ts
createWorkspace({
  panels: {
    main: { component: MainView, defaultOptions: { canFloat: false } },                          // stays in the grid
    palette: { component: Palette, defaultOptions: { canDock: false, initialTarget: 'floating' } }, // stays floating
  },
})
```

- `canFloat: false`: a tab drag can't end in a floating window (dropped on nothing or on a corner,
  it stays where it was), and "Float Window" and the taskbar's "Maximize" are hidden. A window the
  app floated itself can still be moved to another corner.
- `canDock: false`: dragging the panel offers no group, tab or edge targets, only corners.

**Across the workspace**, `canDrop` vetoes any move:

```ts
createWorkspace({
  panels,
  // Only tool panels in the "tools" group, and nothing along the top edge.
  canDrop: ({ panelId, component, to }) =>
    !(to.kind === 'group' && to.leafId === 'tools' && component !== 'tool') &&
    !(to.kind === 'edge' && to.side === 'top'),
})
```

`to` is `{ kind: 'group', leafId, position }` (a side for a new split, or `'center'` as a tab, which
also covers dropping between tabs), `{ kind: 'edge', side }`, or `{ kind: 'float', anchor }` (a corner,
or `null` for a tab dropped on nothing).

A forbidden target **isn't offered**: its drop zone, edge or corner doesn't appear while the panel is
dragged, and releasing there does nothing. The rule is asked again at release, so a rule that changes
mid-drag still holds. Positions are the ones the move applies: under RTL, the zone drawn on the
screen's right splits to the left, and `canDrop` sees `'left'`; a corner is mirrored the same way.
It runs while the pointer moves, so keep it fast and pure; if it throws, the move is allowed and the
error is logged. It runs after the kind's own `canFloat` / `canDock` and can't allow what they forbid.

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

A panel moving into its own browser window and back (1.14.0) sends `panel:popping-out` and
`panel:popped-out`, then `panel:returning` and `panel:returned`, each pair around the move and
the second once the panel is laid out in its new place
([Chapter 15](15-popout-windows.md#events)). Popping out publishes `layout:changed`, and so does
coming back into the grid.

`panel:opened` also fires when a managed widget moves out of its panel, with
`component: 'vdd:widget'`, and `panel:closed` when it goes back or closes (1.13.0). A `move()`
from one place out of the panel to another is a `panel:closed` then a `panel:opened` for the same
id. A `loadLayout()` that sends a widget home publishes no `panel:closed` for its panel.

`layout:changed` is the coalesced signal for autosave: it covers open, close, minimise,
restore, dedupe redirects, every placement change, `updatePanelProps()`, and a managed widget
moving out of its panel or back (1.13.0). It does **not** fire when an
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
