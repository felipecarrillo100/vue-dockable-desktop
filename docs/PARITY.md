# Parity with react-dockable-desktop

vdd targets rdd **6.2.0**. The goal stated by the project owner: *feature parity is not a
must, but a vdd user should be able to do as much as an rdd user can.*

This file is the audit trail for that claim. Three sections: what the API maps to, what the
tests map to, and where vdd deliberately differs.

---

## 1. API map

### Creation and access

| rdd | vdd | Note |
|---|---|---|
| `new WorkspaceClient(config)` | `createWorkspace(config)` | Returns a Vue plugin — `app.use(workspace)`. Same `create*` + `app.use()` shape as `createPinia()` / `createRouter()` |
| `<DockableDesktopProvider>` (5 nested providers) | `app.use(workspace)` | No provider nesting |
| `<WindowManagerProvider client={c}>` | — | Folded into the plugin |
| `<WindowManager />` | `<VddDesktop />` | |
| `client._connect(actions)` + pending-call queue | — | **Deleted.** The store is live before any component mounts ([0004](decisions/0004-store-outside-components.md)) |
| `useWindowManagerState()` / `(selector)` | `useWorkspace()` | Returns refs; destructuring keeps reactivity. No selector overload needed ([0003](decisions/0003-reactive-store.md)) |
| `useWindowManagerActions()` | `useWorkspace()` | State and actions in one composable |
| `useRegistry()` | `useWorkspace().registry` | |

### Actions — unchanged in name and signature

`openPanel` · `closePanel` · `requestClosePanel` · `minimizePanel` · `restorePanel` ·
`floatPanel` · `dockPanel` · `dockPanelToGroup` · `dockPanelToWorkspaceEdge` ·
`maximizePanel` · `focusPanel` · `movePanelOrder` · `closeLeafGroup` · `updateSplitSizes` ·
`updateFloatingPosition` · `isOpen` · `getOpenPanelIds` · `findPanelId` · `saveLayout` ·
`loadLayout` · `publish` · `subscribe` · `setPanelDirty` · `updatePanelTitle` ·
`setDirection` · `showContextMenu`

### Panel-side contract

| rdd `FormContainerContract` | vdd `usePanel()` | Note |
|---|---|---|
| `instanceId` | `id` | |
| `containerType` (mount-time snapshot) | `containerType` | Now a live ref, so `onContainerTypeChange` is unnecessary |
| `onActivate(cb)` / `onDeactivate(cb)` | `isActive` | `watch(isActive, …)` ([0006](decisions/0006-refs-over-subscriptions.md)) |
| `onMinimize(cb)` / `onRestore(cb)` | `isMinimized` | ditto |
| `onResize(cb)` / `getDimensions()` / `usePanelSize()` | `size` | one ref replaces three APIs |
| `onContainerTypeChange(cb)` | `containerType` | |
| `requestClose(opts)` | `close(opts)` | |
| `requestMinimize()` | `minimize()` | |
| `setDirty(v, opts)` | `setDirty(v, opts)` | |
| `setTitle(t)` / `setIcon(i)` | `setTitle(t)` / `setIcon(i)` | |
| `onCloseRequested(guard)` → unsubscribe fn | `onBeforeClose(guard)` | Auto-disposed with the scope; no unsubscribe returned |
| `registerStateProvider(fn)` → unsubscribe fn | `onSaveState(fn)` | ditto |

### Components

| rdd | vdd |
|---|---|
| `<Sidebar>` / `<SecondarySidebar>` | `<VddSidebar>` / `<VddSecondarySidebar>` |
| `<Toolbar>` | `<VddToolbar>` |
| `<SidePanelRenderer>` / `<Left…>` / `<Right…>` | `<VddSidePanels>` (`side` prop) |
| `<ModalStackRenderer>` | `<VddModals>` |
| `<ToastContainer>` | `<VddToasts>` |
| `<ContextMenu>` / `<ContextMenuProvider>` | `<VddContextMenu>` |
| `<PanelOverlayRoot>` | `<VddPanelOverlay>` |
| `<PanelToolbar>` | `<VddPanelToolbar>` |
| `<ToolbarButton>` / `<ToolbarToggle>` / `<ToolbarSearchInput>` | `<VddToolbarButton>` / `<VddToolbarToggle>` / `<VddToolbarSearch>` |
| `<PanelFloatingWindow>` | `<VddFloatingWidget>` |
| `<ConfirmationForm>` | `<VddConfirm>` |

### Two-way state → `v-model` ([0005](decisions/0005-vmodel.md))

| rdd | vdd |
|---|---|
| `Sidebar` `activeTabId` + `onActiveTabChange` | `v-model:active-tab-id` |
| `Sidebar` `visible` + `onVisibilityChange` + handle `show/hide/toggle` | `v-model:visible` |
| `Sidebar` `stripVisible` + `onStripVisibilityChange` | `v-model:strip-visible` |
| `Sidebar` handle `setWidth`/`getWidth` + `onWidthChange` | `v-model:width` |
| `Toolbar` `visible` + `onVisibilityChange` + handle | `v-model:visible` |
| `ToolbarToggleItem.active` + `onToggle` | `v-model` on `<VddToolbarToggle>` |
| `ToolbarGroupItem.activeItemId` + `onActiveItemChange` | `v-model:active-item-id` |
| `PanelFloatingWindow` `open` + `onClose` | `v-model:open` |
| `PanelFloatingWindow` `defaultAnchor` + `defaultStretch` + `stretch` + `onPlacementChange` | one `v-model:placement` — anchor and stretch travel together, because one gesture changes both |

Consequence: `SidebarHandle`, `ToolbarHandle` and `usePanelFloatingWindow()` cease to
exist. The last one held a single boolean.

### Render props → slots ([0007](decisions/0007-slots-over-render-props.md))

| rdd | vdd |
|---|---|
| `SidebarTab.renderContent(id, onClose, onOpen)` | `#tab-<id>` slot, or `tab.component` |
| `Sidebar.renderHeader(tab, onClose, onOpen)` | `#header="{ tab, close, open }"` |
| `PanelDefaultOptions.renderHeaderActions(panelId)` | `#panel-actions="{ panelId }"` on `<VddDesktop>` |
| `ManagedWindowConfig.content: ReactNode` | `component` + `props` |
| `ToastOptions.content: ReactNode` | `component` + `props`, or a render function |

### Types — unchanged names

`LayoutNode` · `LayoutGridNode` · `LayoutLeafNode` · `PanelInfo` · `FloatingWindow` ·
`SerializedLayout` · `FloatAnchor` · `Stretch` · `PanelFloatPlacement` · `ToolbarItem` (and
its union members) · `SidebarTab` · `ContextMenuItem` (and members) · `DirtyStateOptions` ·
`OpenPanelOptions` · `SplitOrientation` · `SplitDirection` · `DropPosition` · `DropTarget` ·
`ToastOptions` / `ToastType` / `ToastPosition` · `PanelContribution` · `ResizeDir`

These are domain vocabulary, not React artefacts. Keeping them means rdd documentation and
mental models transfer, and it is what makes section 3 possible.

---

## 2. Layout compatibility *(hard requirement)*

`SerializedLayout` is **byte-compatible** in both directions, `version: 2`. Verified by
fixture, not by inspection:

- Layout JSON captured from rdd 6.2.0 is committed under `test/fixtures/rdd-6.2.0/`.
- vdd's serialisation tests load each fixture, assert the resulting state, re-save, and
  assert the output is deep-equal to the input.
- The same fixtures are contributed back to rdd's own suite, so neither side can drift the
  format without a red test on both.

Covers: `gridRoot` tree shape and leaf ids, `floating` rects/z/anchor/maximized,
`minimized`, `panels` metadata including `props`/`dedupeKey`/`serializable`,
`activePanelId`, and the pre-`anchor` `stickyRight`/`stickyBottom` migration.

See [0009](decisions/0009-layout-json-compatibility.md).

---

## 3. Test map

All **26** rdd test files are accounted for below, by name, with a disposition. The port is a
**specification** rather than a transliteration: assertions and test names are preserved and
the driving code is rewritten ([0011](decisions/0011-tests-as-specification.md)).

rdd's suite is 445 `it()` declarations, 468 tests once its `it.each` blocks expand. vdd's is
**687**. The surplus is not padding: it is the Vue-specific cases rdd could not have (a `ref`
passed as a prop, a `markRaw` component, watcher scheduling), the divergences vdd fixes and
must keep fixed, and the assertions rdd's own tests were too weak to make — two of which were
found by mutation-testing this suite against itself (PO25, and `useStyleClasses`).

The M13 gate checks this table against the list of 26 suite names, so a suite cannot be
quietly dropped from it.

| rdd suite | vdd disposition |
|---|---|
| `PanelOverlay` (1,349) | **Ported — 60/60** (M11). rdd's nine stale-closure refs, its `key`-remount trick and its controlled/uncontrolled `stretch` branch have no equivalent; the four placement props are one `v-model:placement`, and `usePanelFloatingWindow()` is `v-model:open` — each noted in the file header and below. One test was **strengthened**: rdd's PO25 could not distinguish "clears both buckets of its edge" from "clears only its own corner". One was **added**: a sub-threshold header move must not undock |
| `Sidebar` (1,678) | **Ported — 91/91** (M9). Every handle-based test (`openTab`, `closeDrawer`, `getActiveTab`, `show`/`hide`/`toggle`, `showStrip`/`hideStrip`, `setWidth`/`getWidth`) is mapped one-to-one to a `v-model` or `useSidebar()` counterpart, with the mapping tabulated in the file header. Two assertions changed shape and say so at the test: SB22 (rdd clamped inside `setWidth`; vdd clamps where the value is produced and bounds the render) and SB26 (an inline `flex-basis` that moved to the stylesheet — D12) |
| `Toast` (327) | **Ported — 16/16** (M10). The event emitter is deleted: the queue is module-level reactive state, so `toast()` works outside components without one |
| `Toolbar` (725) | **Ported — 42/42** (M9). `<ToolbarProvider>` is gone: the state is on the workspace, so TB1 asserts the missing-workspace error instead. `getActiveInGroup`/`isModifierActive`/`setModifierActive`/`toggleModifier` are renamed `activeInGroup`/`isToggled`/`setToggled`/`toggle`; TB20's handle becomes `v-model:visible` |
| `PanelContribution` (425) | **Ported — 19/19** (M12, 14 ported + 5 added). No `<PanelContributionProvider>`: the store is on the workspace. `usePanelContribution` takes a **getter**, so republishing follows the panel's own state instead of asking the caller to memoise. The merge helpers are plain functions with composable wrappers, since reading the store needs no subscription. Three added tests state the invariant directly: a minimised panel and a background tab both keep publishing and are both **not** surfaced |
| `Internationalization` (253) | **Ported — 23/23** (M12, 21 ported + 2 added). `useFormatMessage`, `usePredefinedMessages` and `useStyleClasses` are three fields on the workspace, usable outside a component. The `classes` tests are **stronger than rdd's**: rdd asserted only that its hook returned the config, which cannot fail; these assert the classes reach the rendered elements and are added alongside the library's own |
| `useColorScheme` (106) | **Ported — 5/5** (M12) as a ref that follows the attribute, with the observer disconnected on scope dispose |
| `V3Diagnostics` (252) | **Ported — 9/9** (M12, 7 ported + 2 added). Both diagnostics are development-only, and a test proves it for each — rdd had no such test |
| `PanelSystem` (6) | **Ported — 6/6** (M10). No `<PanelProvider>`: side panels and modals are workspace state, so the test opens them with no component mounted |
| `SpawnLifecycle` (5) | **Ported** (M3) into `test/store/workspace.test.ts`, names preserved |
| `EventBus` (9) | **Ported — 11/11** (M3, 9 ported + 2 added). `publish` is public and `emit` internal and typed, so an application's own event cannot be mistaken for a built-in one |
| `CoreLayout` (7) · `TabOperations` (4) | **Ported** (M4) into `test/components/desktop.test.ts` and `test/core/layoutTree.test.ts`, names preserved |
| `FloatingWindows` (18) | **Ported — 25/25** (M5, 18 ported + 7 added). The added cases cover D5's handle clipping and the clamping that keeps a window reachable when the workspace shrinks |
| `TouchSupport` (15) | **Ported — 27/27** (M6, 15 ported + 12 added) into `test/components/dragDock.test.ts`, adapted to `vdd-` class names |
| `StateTransitions` (19) | **Ported — 45/45** (M3, 19 ported + 26 added). The additions are the `activePanelId` invariant block: every placement action resolves it, which is divergence **D2** |
| `LayoutSerialization` (29) | **Ported — 53/53** (M3) across `test/compat/round-trip.test.ts` (23) and `test/compat/rdd-fixtures.test.ts` (30), the latter against fixtures produced by rdd 6.2.0 itself |
| `DomStability` (3) | **Substituted** (M4) in `test/components/desktop.test.ts`: rdd's version asserts React-portal internals, which have no counterpart, so the same zero-unmount guarantee is asserted through Teleport — mount counts, a live WebGL context, and scroll offsets surviving every transition |
| `FormContainer` (24) | **Rewritten — 25/25** (M10) as `test/components/panelLifecycle.test.ts`. Nine subscription and query members become four refs and two hooks; the one scheduling difference this exposes is divergence **D14** |
| `StyleHookups` (199) | **Ported — 14/14** (M13, 12 ported + 2 added), with `vdd-` class names and the same purpose: catch a class the CSS expects but the component never emits. One case changed shape: rdd asserted that a caller's inline `z-index` still won, which is the very thing that had made `zIndexBase` do nothing, so vdd asserts the replacement — that `zIndexBase` reaches `--vdd-z-base` and the chrome follows. Two added tests cover the variable being written and removed |
| `PanelRegistry` (7) | **Ported — 9/9** (M2) as `core/registry.ts`. The global singleton is gone: a registry belongs to its workspace, so two workspaces on one page cannot see each other's panels |
| `anchorGeometry` (5) | **Ported — 5/5** (M2), unchanged. Pure geometry, so the port is a transliteration |
| `dragResize` (10) | **Ported — 10/10** (M2). Exported publicly in vdd as well, so an application can build resizable UI inside a panel with the library's own mechanics |
| `serializable` (8) | **Ported — 12/12** (M2, 8 ported + 4 added). The added cases cover Vue-specific shapes rdd could not produce: a `ref`, a `reactive` proxy, a `markRaw` component, and a VNode |
| `sidePanelPositioning` (1) | **Ported — 1/1** (M2), folded into `test/core/stylesheet.test.ts` because it is a stylesheet assertion rather than a component one. Name preserved (SP1) |
| `V2Features` (363) | **Partly moot.** The `WorkspaceClient` pending-call-queue tests test machinery vdd deletes ([0004](decisions/0004-store-outside-components.md)). The rest (unregistered-component warning, `isOpen`/`getOpenPanelIds`) ports |

Every "substitute", "rewrite" and "moot" above must be justified in its test file's header
comment, so a reviewer can see the trade rather than discover a silent gap.

---

## 4. Deliberate divergences

Behaviour where vdd knowingly differs from rdd 6.2.0. Kept short on purpose — each entry is
a promise to explain itself.

### Defects fixed in vdd ([0012](decisions/0012-fix-known-defects.md))

| # | rdd behaviour | vdd behaviour |
|---|---|---|
| D1 | "Maximize" in a taskbar icon's context menu does nothing — `maximizePanel` only maps over `floating`, and a minimized panel is not there | Restores the panel, then maximises it |
| D2 | `activePanelId` is left stale by `dockPanelToGroup`, `floatPanel`, `dockPanel`, `movePanelOrder`, `dockPanelToWorkspaceEdge`; the visibly selected tab can render unfocused while a different panel is globally active | All placement actions resolve `activePanelId`, as `restorePanel` now does in 6.2.0 |
| D3 | `openPanel` on a minimized panel returns it to the *first* leaf; `restorePanel` returns it to `lastLeafId`. The two disagree | Both honour `lastLeafId` |
| D4 | Re-opening a minimized panel via `openPanel` publishes neither `panel:restored` nor `layout:changed`, though the layout changed | Publishes both |
| D5 | **`overflow: hidden` clips half of every resize handle**, on floating windows *and* inner widgets: handles sit at `-4px`, so an 8px edge handle leaves ~4px hittable. Measured in Chrome — and at a window's rounded corner **nothing** is hit, so the click falls through to the grid behind and a corner drag does nothing at all. The touch rules are worse: they enlarge handles to 12px but position them at `-6px`, so the enlargement is half-clipped on exactly the devices that need a bigger target | Handles are inset to 0, fully inside their box. The whole nominal area is grabbable; the trade is that you cannot grab from outside the window edge. Verified per-direction in the browser: each of the eight handles moves the edge under the cursor by the exact pointer delta |
| D6 | **Inner scroll position is lost on every transition.** Detaching a subtree resets the `scrollTop`/`scrollLeft` of its scrollable descendants, and every minimise, tab-switch and re-dock routes the panel through a `display:none` container. Measured in Chrome: an offset of 300 becomes 0. Invisible to rdd's suite because jsdom does no layout | Offsets are recorded before detach and restored after attach ([0014](decisions/0014-preserve-scroll-and-focus.md)) |
| D7 | **Focus is lost on every transition**, for the same reason | Focus and selection are restored — but only when the panel becomes the active one, so a background restore never steals the caret |
| D8 | **rdd styles the host page.** `html, body, #root { height: 100%; overflow: hidden }` reaches outside the library's own DOM, so embedding a workspace in part of a view silently restyles the whole page | The library styles nothing it does not render. A development-mode warning diagnoses a zero-height workspace, and `.vdd-fill-viewport` is offered as an opt-in helper |
| D9 | **A fourth dead CSS hookup.** The component renders `rdd-maximized`; the stylesheet targets `.rdd-floating-window.maximized`. The rule never matches, so a maximized floating window keeps its rounded corners, 1px border and drop shadow while filling the workspace. `StyleHookups.test.tsx` — added in 6.0.1 for precisely this bug class — has no `maximized` case | `.vdd-floating-window.vdd-maximized`, guarded by a test asserting the emitted class and the selector agree |
| D10 | **A third-party vendor class is hard-coded** in the published stylesheet: `.vdd-taskbar-item-preview-host .luciad canvas` targets one specific mapping library from a framework-agnostic sheet | Dropped. An application styles its own content inside the preview host |

| D11 | **A taskbar preview's thumbnail is dead to the pointer.** rdd marks the whole preview frame `pointer-events: none`, so a click anywhere over the thumbnail — most of the preview — passes through the tooltip entirely and does nothing; only its small header row responds | The frame accepts the click and restores the panel, while its *contents* stay inert, so the live panel inside can never be interacted with by accident |
| D12 | **Load-bearing layout lives in inline JSX styles rather than CSS**, so any port of the stylesheet alone silently drops it: the structural flex/height chain on the workspace, grid and panels; `zIndex: 100` on the taskbar footer; `zIndex: 999999` on the hover preview; and the sidebar's *entire* layout — the row, the strip's collapse wrapper, the content wrapper's `flex-basis: 0`, the drawer's flex behaviour and each pane's box, none of which appear in rdd's stylesheet at all. Every one is invisible in jsdom and several break something outright — a 0px-tall split divider, an unhoverable autohide peek strip, and a preview a split divider paints over | All of it is CSS, asserted property by property in the M4, M7 and M9 gates. Only genuinely per-render values stay inline — the animating sizes and each pane's `display` — and the M9 gate rejects any other inline declaration in the sidebar |
| D13 | **Six of nine `@keyframes` are unprefixed**: `fadeIn`, `scaleUp`, `slideInLeft`, `slideInRight`, `tooltipFadeIn`, `toolbar-flyout-in`. Keyframe names are global to the document exactly like class names, so a host stylesheet defining its own `fadeIn` — Bootstrap, Animate.css and a great many app stylesheets do — silently replaces the library's animation with no error anywhere. The `rdd-` convention covers classes and custom properties but was never extended to keyframes | All nine are `vdd-`-prefixed. The M9 gate rejects an unprefixed `@keyframes` name *and* an `animation:` naming one, so the two cannot drift apart |
| D14 | **A closing panel cannot observe its own deactivation with an ordinary watcher.** rdd fired `onDeactivate` synchronously before `onClose`, and its suite asserted that order. Vue queues watcher callbacks, and a closing panel's component is unmounted in the same flush — so a default-flush `watch(isActive)` is disposed before it would have run. This is a scheduling difference, not a missing feature | The rdd ordering is still available and is asserted: `watch(isActive, fn, { flush: 'sync' })` sees the deactivation before `panel:closed` is published. For "before I go" work the Vue answer is `onBeforeUnmount`/`onScopeDispose`, which runs deterministically and is asserted alongside it. Both halves are pinned by a test and by the M10 gate, so neither can drift |
| D15 | **A tab bar that overflows has no scroll affordance.** rdd renders a chevron button at each end of a tab bar whose tabs do not fit (`.rdd-tab-scroll-btn`), because a horizontal scroll container is awkward to reach with a mouse that has no horizontal wheel. vdd's tab bar is a plain scroll container with no buttons | **Not ported, deliberately and recorded rather than discovered.** The container scrolls — by wheel, trackpad, touch, and by the tab drag itself — and the taskbar *does* have overflow buttons (`.vdd-taskbar-nav-btn`), so the pattern exists in the library. This is a known gap rather than a decision against the feature: it belongs in its own change, not in the milestone that closes the port. The three dead CSS rules rdd's buttons left behind were removed, so nothing in the stylesheet claims to style something that does not render |

D1–D4 were verified by probe against rdd 6.2.0; D5–D7 and D11–D12 in real Chrome; D8–D10 and
D13 by reading rdd's shipped `index.css` against what its components actually render; D14 by
measuring vdd's own watcher ordering before writing the test that pins it; D15 by M13's
class/rule correspondence sweep, which is what surfaced the gap at all.

D6 is worth singling out: it contradicts rdd's own headline claim of "zero-unmount state
preservation". The guarantee holds for component state, WebGL contexts and media, but scroll
offsets are browser state that detaching discards, and nothing in rdd puts them back.

### The demo

rdd's `/demo` is 4,197 lines across four files. vdd's is **24 files**, and ports every
capability with the dependencies ADR [0013](decisions/0013-demo-scope.md) decided on.

| rdd demo dependency | vdd demo | |
|---|---|---|
| `monaco-editor` via `@monaco-editor/react` | `monaco-editor` directly | The React wrapper bridges React's lifecycle; a 90-line composable does the same in Vue, and Monaco was always framework-agnostic |
| `leaflet` | `leaflet` | Already imperative — hand it a div |
| `react-markdown` | a `unified` processor | Same plugin set (`remark-gfm`, `remark-math`, `rehype-katex`, `rehype-highlight`, `rehype-raw`, `rehype-slug`); only the renderer changed, because those are plugins rather than components |
| `react-bootstrap` + `react-bootstrap-submenu` | the demo's own `dd-` markup | Avoids a Vue UI-kit dependency for what is mostly buttons |
| `react-intl` | a twelve-line formatter | The library needs only `(descriptor) => string`; the message tables port as data, in all six locales |

The demo's styles are `dd-`-prefixed and stay in the demo. rdd published its demo's `sb-*`
utility classes in the *library's* stylesheet, so every consumer downloaded styling for an
application they never saw; ADR [0008](decisions/0008-css-prefix.md) closes that, and the M14
gate keeps it closed — it fails if a `dd-` class appears in `src/index.css`, or if the demo
restyles a `vdd-` class globally.

Two things the demo is for beyond showing the library off:

- **It is the integration test.** It is the only place the library meets Monaco, Leaflet, a
  markdown pipeline, six locales and every one of its own components at once — and a
  library's integration failures surface as a console error in an application long before
  they surface in a unit test. The M14 browser gate walks the whole demo and treats any
  console error as a failure.
- **It is where the manual's examples run.** ADR 0013 asks for that so the documentation
  cannot drift from reality.

### Closed during the port

- **`ContextMenuAdapter` / `DefaultContextMenuAdapter`** had no vdd equivalent and was
  recorded in no section — found while drafting the manual chapter that had promised it.
  rdd's adapter was an object with a single field: a component to swap in for the menu. That
  is what a slot is ([0007](decisions/0007-slots-over-render-props.md)), so
  `<VddContextMenu>`'s default slot now receives `{ items, x, y, close }` and replaces the
  built-in markup — no adapter object, no provider, no ref handshake. Two tests cover it.

### Shape changes with no behavioural equivalent

- `usePanelFloatingWindow()`, `SidebarHandle`, `ToolbarHandle`, `WorkspaceClient._connect`
  and the pending-call queue do not exist. Replaced as per section 1.
- **`usePanelFloatingWindow()`** in particular was `useState(false)` plus `open`, `close` and
  `toggle` callbacks — bundled into a hook because that is how React shares such a thing. In
  Vue it is a `ref` the caller already has, so `<VddFloatingWidget v-model:open>` covers it
  and the hook would be more code than it saves. Asserted in the ported PO6.
- **`defaultAnchor` + `defaultStretch` + `stretch` + `onPlacementChange`** — four props for
  two values — are one `v-model:placement`. rdd's own comment explains why the callback
  reported them together: one gesture can change both, since releasing a stretched axis
  re-pins the anchor. A single model is that taken to its conclusion, and it makes
  controlled and uncontrolled the same code path rather than a branch.
- **`PanelToolbarCtx` / `PanelManagerCtx` / `PanelOverlayCtx`** are one store. The three-way
  split existed to stop a toolbar re-rendering whenever a widget gained focus, because a
  React context value is a single object; Vue tracks each ref separately, so the isolation is
  a property of the reactivity. rdd's own isolation tests (PO10, PO11) are ported and pass.
- `useWindowManagerState(selector)`'s selector argument has no counterpart; use `computed`.
- Lifecycle subscription methods return nothing to unsubscribe; cleanup is automatic.
