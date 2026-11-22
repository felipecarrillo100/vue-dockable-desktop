# Parity with react-dockable-desktop

vdd targets rdd **6.2.0**. The goal stated by the project owner: *feature parity is not a
must, but a vdd user should be able to do as much as an rdd user can.*

This file is the audit trail for that claim. Three sections: what the API maps to, what the
tests map to, and where vdd deliberately differs.

**1.14.0** adds rdd **7.12.0** and **7.12.1**'s pop-out windows (§1, *Pop-out windows*; §3, *rdd
7.12.0 and 7.12.1 pop-out windows, traced*; §4, *Pop-out windows (1.14.0)*;
[0022](decisions/0022-popout-windows.md)).

**1.3.0** adds one feature from a later rdd: **7.2.0**'s skin branding (§1, *Branding*, and §3,
*rdd 7.2.0 branding, traced*), with the same variables under the `vdd-` prefix and the same
tests ([0017](decisions/0017-brand-variables.md)). angular-dockable-desktop 1.1.0 made the same
port; the stylesheets agree on it, prefix aside.

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
`setPanelIcon` (1.12.0) · `updatePanelProps` (1.13.0) · `setDirection` · `showContextMenu`.
`focusPanel(id, { restore })` is a second overload since 1.13.0, as in rdd 7.11.0

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
| `setTitle(t)` / `setIcon(i)` | `setTitle(t)` / `setIcon(i)` | In a docked or floating panel, `setIcon` changes its tab, title bar and taskbar icon (1.12.0, as rdd 7.1.0) |
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
| `RddAlert` (7.7.0) | `<VddAlert>` (1.8.0) |

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
| `PanelDefaultOptions.renderHeaderActions(panelId)` | not ported — no header-actions slot; a panel's actions go in an overlay toolbar, a contribution or its context menu ([03-panels](manual/03-panels.md#panel-actions)) |
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

### Branding (1.3.0, from rdd 7.2.0)

| rdd 7.2.0 | vdd 1.3.0 |
|---|---|
| `--rdd-brand-accent` on `:root` | `--vdd-brand-accent` on `:root` |
| `--rdd-brand-on-accent` | `--vdd-brand-on-accent` |
| `--rdd-skin-font-family` (set by a skin) | `--vdd-skin-font-family` |
| `--rdd-font-family: var(--rdd-skin-font-family, …)` on `:root` | `--vdd-font-family: var(--vdd-skin-font-family, …)` on `:root` |
| every skin's `--rdd-accent-color: var(--rdd-brand-accent, …)`, tints as `color-mix()` | the same, `vdd-`: 14 accent declarations, 142 tints and 2 on-accent rules |
| `:where(button, input, select, textarea)[class*="rdd-"] { font-family: inherit }` (rdd 6.4.0) | the same, `vdd-` — without it the rail and toolbar buttons kept the browser's font |
| `WindowManager` sets `data-rdd-skin` on `<html>` | `<VddDesktop>` sets `data-vdd-skin` on `<html>` (1.0.0 already did), so the skin font resolves there |

**1.4.0, from rdd 7.3.0:**

| rdd 7.3.0 | vdd 1.4.0 |
|---|---|
| `--rdd-brand-surface`, `--rdd-brand-text` | `--vdd-brand-surface`, `--vdd-brand-text` |
| `--rdd-radius-scale` | `--vdd-radius-scale` |
| `--rdd--b-*` derived values on `:root`, built on `--rdd--b-base` | `--vdd--b-*`, built on `--vdd--b-base` — the same transform, prefix aside; placed after the main `:root` block, which the M14 token check reads |
| `--rdd-placeholder-bg` (a token since rdd 7.1.2) | none: the taskbar preview letter's background reads `--vdd--b-placeholder-bg` in its own rule |
| `--rdd-danger-color` on the unregistered-panel message | the literal danger red, left as it is |

One difference, older than 1.3.0: vdd's default stack has no `'Segoe UI'` (`'Outfit', 'Inter',
system-ui, -apple-system, sans-serif`, kept as it was), and vdd has no `--vdd-font-family-mono`
token; its monospaced labels keep `monospace`.

---

### Widgets out of the panel (1.13.0, from rdd 7.11.0)

Same names as rdd; the shapes differ only where a Vue rule applies (content is a component,
state is a ref). Traced in §3, *rdd 7.11.0 widgets out of the panel, traced*; divergences in §4.

| rdd 7.11.0 | vdd 1.13.0 | Note |
|---|---|---|
| `useFloatingWidgets().move(id, to)` → `MoveResult` | the same | `core/overlayState.ts` (types), `composables/useWidgetHosting.ts` (the moves) |
| `useFloatingWidgets().location(id)` → `WidgetLocation \| null` | the same | a lookup; the reactive value is `useWidget().location` |
| `useFloatingWidgets().placement(id)` → `WidgetPlacement \| null` | the same | the same JSON in all three editions (`core/widgetPlacement.ts`, values kept from rdd's tests) |
| `ManagedWidget.canDock`, `.canFloat` | the same | the hosted panel's options, through `core/panelOptions.ts` `optionsFor` |
| `ManagedWidget.titleMenu(w)`, `WidgetMenuContext` | the same | |
| `ManagedWidget.placement` | the same | |
| `ManagedWidget.preserveEmbeds`, `defaultOptions.preserveEmbeds` | the same | `core/domMove.ts` |
| `ManagedWidget.content: ReactNode` | `component` + `props` | as for every managed widget since 1.0 |
| `useWidget()`, `WidgetHandle` | the same | `id`, `ownerPanelId` plain; `panelId`, `location` `ComputedRef`s; `onWillMove` / `onMoved` return the unsubscribe and are also disposed with the scope |
| `WidgetTarget`, `WidgetLocation`, `MoveResult`, `WidgetPlacement` | the same | |
| `PanelInfo.owner`, `PanelOwner` | the same | |
| `'rdd:widget'` (reserved component key) | `'vdd:widget'` | `core/panelOptions.ts` `HOSTED_COMPONENT` |
| `workspace.focusPanel(id, { restore })` | the same | a second overload on `Workspace` |
| `workspace.updatePanelProps(id, props \| fn)` | the same | |
| `.rdd-panel-float__content`, `.rdd-hosted-widget` | `.vdd-panel-float__content`, `.vdd-hosted-widget` | |
| `.rdd-workspace-tab-icon--menu`, `.rdd-window-title-icon--menu` | `.vdd-workspace-tab-icon--menu`, `.vdd-window-title-icon--menu` | plus `.vdd-panel-float__menu` on the in-panel title button |
| `HostedPanels` actions (`openHostedPanel`, …) | the same, `@internal` on `Workspace` | not in `api-surface.json` |

### Pop-out windows (1.14.0, from rdd 7.12.0 and 7.12.1)

Same names as rdd; the shapes differ only where a Vue rule applies (the desktop owns the windows,
the wrapper renders a slot, state is a ref or a live getter). Traced in §3, *rdd 7.12.0 and 7.12.1
pop-out windows, traced*; divergences in §4, *Pop-out windows (1.14.0)*; the reasons in
[0022](decisions/0022-popout-windows.md). Guide: [chapter 15](manual/15-popout-windows.md).

| rdd 7.12.1 | vdd 1.14.0 | Note |
|---|---|---|
| `createWorkspace({ popOut: true })` | the same | `WorkspaceConfig.popOut`; not kept on `workspace.config` |
| `defaultOptions.canPopOut` | the same | `core/registry.ts` `PanelDefaultOptions` |
| `workspace.popOutPanel(id)` → `PopOutResult` | the same | `core/workspace.ts` checks `disabled`, then hands off to the registry (`core/popOutWindows.ts`) |
| `workspace.returnPanel(id)`, `workspace.focusPanelWindow(id)` → `{ ok }` | the same | |
| `focusPanel(id)` on a popped-out panel brings its window forward | the same | the old body is the internal `activatePanel` |
| `PanelInfo.poppedOut` | the same | runtime only; stripped on load (`core/serialize.ts`) |
| `PopOutResult` | the same union | `src/types.ts` |
| `<DockableDesktopProvider popoutUrl>` | `<VddDesktop popout-url>` | resolved against the main page's `document.baseURI` |
| `<DockableDesktopProvider popoutWrapper>` (`ComponentType<PopoutWrapperProps>`) | `<VddDesktop :popout-wrapper>` (a `Component` given `window`, `document`, rendering its default slot) | `PopoutWrapperProps` is `{ window, document }`, without `children` |
| `usePanelWindow()` → `PanelWindow` | the same | an object whose `window` / `document` are live getters (`composables/usePanelWindow.ts`) |
| `usePanel().isPoppedOut` | the same | a `ComputedRef<boolean>` |
| `useFloatingWidgets().popOut(id)`, `ManagedWidget.canPopOut` | the same | `composables/useWidgetHosting.ts` |
| `useWidget().isPoppedOut` | the same | a `ComputedRef<boolean>` |
| `WidgetMenuContext.canPopOut`, `.isPoppedOut`, `.popOut()` | the same | |
| events `panel:popping-out`, `panel:popped-out` (`{ id, window }`), `panel:returning`, `panel:returned` | the same | in `BuiltInEvents` |
| messages `popOutWindow`, `returnToDesktop`, `backIntoPanel`, `popOutBlocked`, `inOwnWindow` | the same keys | ids `vdd.popOutWindow`, … (rdd: `dockable-desktop-popOutWindow`, …) |
| `.rdd-popout-frame` and `__header`, `__icon`, `__icon--menu`, `__title`, `__return`, `__body` | `.vdd-popout-frame` and the same parts | `src/styles/26a-popout.css`; the frame is also `.vdd-workspace` |
| `data-rdd-popout`, `data-rdd-popout-kind`, `data-rdd-focused` on the frame | `data-vdd-popout`, `data-vdd-popout-kind`, `data-vdd-focused` | |
| `.rdd-taskbar-item--popout`, `data-rdd-taskbar-popout`, `.rdd-taskbar-item-popout-marker` | `.vdd-taskbar-item--popout`, `data-vdd-taskbar-popout`, `.vdd-taskbar-item-popout-marker` | `src/styles/06-taskbar.css` |
| `utils/domContext.ts`, `utils/documentRegistry.ts` (internal) | `core/domContext.ts`, `core/documentRegistry.ts` (internal) | plus `eventDocument(event)` |
| `core/popOutWindows.ts`, `core/popOutStyles.ts` (internal) | the same files (internal) | ported line for line, prefixes changed |
| `PopOutWindows.tsx`, the frame | `VddPopOutWindows.vue`, `VddPopOutFrame.vue` (internal, not exported) | a Teleport into the child's `<body>` holding the panel's ordinary slot |

### rdd's source layout (since rdd 7.6.1)

rdd's source now mirrors this port's: `src/types.ts` (vdd `src/types.ts`); `src/core/` with
`workspaceCore.ts` (vdd `core/workspace.ts`), `layoutTree.ts`, `serialize.ts`, `eventBus.ts`,
`messages.ts`, `stretch.ts`, `panelOverlayGeometry.ts` (vdd `core/panelOverlay.ts`); the workspace
view in `components/workspace/` (`LeafGroup`, `WorkspaceGrid`, `FloatingWindows`, `Taskbar`,
`WorkspaceZones`, `panelMount` ≈ vdd's `VddLeafGroup`, `VddWorkspaceGrid`, `VddFloatingWindow`,
`VddTaskbar`, `VddEdgeZones`, `VddPanelMount`/`panelDom.ts`; the drag code ≈ `useDragDock.ts`);
and the panel overlay in `components/panelOverlay/`. Function names were kept as they were in rdd,
so they can differ from vdd's (`hasLeaf` here is vdd's `leafExists`). Both stylesheets are built
from `src/styles/NN-area.css` with the same area names.

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
**730** as of 1.0.1. The surplus is not padding: it is the Vue-specific cases rdd could not have (a `ref`
passed as a prop, a `markRaw` component, watcher scheduling), the divergences vdd fixes and
must keep fixed, and the assertions rdd's own tests were too weak to make — two of which were
found by mutation-testing this suite against itself (PO25, and `useStyleClasses`).

The M13 gate checks this table against the list of 26 suite names, so a suite cannot be
quietly dropped from it.

| rdd suite | vdd disposition |
|---|---|
| `PanelOverlay` (1,349) | **Ported — 60/60** (M11). rdd's nine stale-closure refs, its `key`-remount trick and its controlled/uncontrolled `stretch` branch have no equivalent; the four placement props are one `v-model:placement`, and `usePanelFloatingWindow()` is `v-model:open` — each noted in the file header and below. One test was **strengthened**: rdd's PO25 could not distinguish "clears both buckets of its edge" from "clears only its own corner". One was **added**: a sub-threshold header move must not undock. **1.0.1 adds five** (PO31–PO35) for R1 below, the one part of this surface neither suite covered |
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

### rdd 7.12.0 and 7.12.1 pop-out windows, traced

rdd 7.12.0 is pop-out windows (stages S1–S7 and next.1, with 7.12.0's event timing); 7.12.1 lets a
click inside a pop-out open another one (a panel from a button in another panel's window, a widget
from its owner's window). vdd 1.14.0 ports the final 7.12.1 behaviour at once, not the history:
no synchronous events, no main-window-only gesture check, no text return button, no toasts that
stay in the main window. Every ported test keeps rdd's number behind an `X`, because `PO` and
`PF` were already vdd test ids.

| rdd 7.12.1 | vdd 1.14.0 |
|---|---|
| `DocumentAware.test.tsx` (DA1–DA18) | `test/components/documentAware.test.ts` XDA1–XDA20 (36 tests): DA1–DA18, plus XDA19 (a modal's Escape) and XDA20 (the toast observer and frame) |
| `PopOut.test.tsx`, the store cases (PO1, 2, 4, 6, 8, 9, 16, 17, 20–22, 27, 27b, 28–31, 33, 33b, 34, 35, 35b, 36–39, 40, 40b, 41–43) | `test/store/popOutStore.test.ts` (113 tests). XPO37 is the full matrix (rdd's 13 layouts, 1,332 cases, the count asserted). vdd additions: XPO28b, XPO35c, XPO38b, XPO40c, XPOS1–XPOS4, and XPO44 (8 tests: neighbours out beside an empty group, both return orders, checked against rdd's own core) |
| `PopOut.test.tsx`, the window cases (PO1 menu, 3, 4 name/title/lang/dir, 5, 6 element back, 7, 8 `close()`, 10–15, 18, 19, 23–26, 32) | `test/components/popOutWindows.test.ts` (45 tests), plus XPOE1 ×2, XPOE2, XPOM1 and XPOR1 |
| `PopOutStyles.test.tsx` (PS1–PS9) | `test/components/popOutStyles.test.ts` XPS1–XPS9 (14 tests), all ported |
| `PopoutWrapper.test.tsx` (PW1–PW6) | `test/components/popoutWrapper.test.ts` XPW1–XPW6 (17 tests; XPW6 ×10) |
| `PopOutChrome.test.tsx` (PC1–PC5, and WG14's frame kind) | `test/components/popOutChrome.test.ts` XPC1–XPC5 (18 tests), plus the vdd case "maxVisible across windows, a queued toast promoted into the page"; WG14 is XWG14 |
| `PopOutWidgets.test.tsx` (WG1–WG14, WG2b, WG9b) | `test/components/popOutWidgets.test.ts` XWG1–XWG14 (36 tests), the `b` variants kept; XWG4 adds "from docked and back", XWG10 the click and press not reaching the window and the keyboard open |
| `PopOutFocus.test.tsx` (PF1–PF5, PF4b) | `test/components/popOutFocus.test.ts` XPF1–XPF5, XPF4b (19 tests), plus openPanel (XPF2), compact mode (XPF5) and XPF6 ×2 (a widget's in-panel title menu opened from the keyboard while its owner is out) |
| `PopOutFromPopOut.test.tsx` (its PF1–PF7) | `test/components/popOutFromPopOut.test.ts` XFP1–XFP7 (8 tests), plus XFP6b (the widget-level case: its owner's window opens it at `left=150,top=290`) |
| `tests/browser/popout.browser.ts` (18 `it` declarations, some per skin, scheme or order) | `scripts/gates/browser/m18.mjs` (15 cases): out and back, closed, popoutUrl, neighbours in both orders, blocked, from a pop-out, events (blank and with popoutUrl), styles (dark and light under `nord`), wrapper, return button (default and `nord`, dark and light), widget, widget menu, widget from owner, focus across, focusPanelWindow |
| `tests/browser/harness/main.tsx` | the playground's `?po=1`, `po2=1`, `pourl=1`, `rc=1`, `wo=1`, `opo=1` (`playground/src/PopPanel.vue`, `RcWrapper.vue`, `runtimeCss.ts`, `public/popout.html`) |

**rdd cases not ported, each with its reason:**

| rdd case | Why |
|---|---|
| DA6, the keyboard open at its target, with the target's `dir` | vdd's context menu opens where the caller says, with the workspace's `dir`; it has no target-placed keyboard open to port |
| DA13, "focus goes back to the button" | vdd's toolbar flyout never takes focus, so there is nothing to give back |
| DA14, `isElementRtl`'s document fallback | vdd has no such helper (`isRtlElement` reads the element's own window) |
| PO10's StrictMode case | React's StrictMode double effect has no Vue equivalent; PO10's other cases are ported |
| browser "alone in its group (an edge dock): the grid comes back exactly" | covered by the store matrix XPO37 (1,332 return cases, an edge dock among them) and by the browser's two-neighbours case, which pops out panels alone in their groups at the edge |
| browser "an Emotion-styled element looks the same in the pop-out" | vdd's playground has no Emotion: the `wrapper` case uses a small runtime-inserting stand-in (`runtimeCss.ts`, rules added with `insertRule` per document), which shows the same production failure |
| browser "a widget's frame icon is styled and clickable in the window; its titleMenu's icons too" | the wrapper around a widget's frame and content is unit-tested (XWG12, XPC1); the browser's `widget menu` case clicks the widget frame's icon and its item in the window; the playground's widget has no runtime-styled icon |
| browser "the frame's icon and a menu item's icon look as in the page; a toast raised in the window shows there" | ported inside the `wrapper` case, not as a case of its own |

### rdd 7.11.0 widgets out of the panel, traced

rdd 7.11.0 is 7.11.0-next.0 (the feature), 7.11.0-next.1 (feedback fixes) and two fixes; vdd 1.13.0
ports all three at once.

| rdd 7.11.0 | vdd 1.13.0 |
|---|---|
| a managed widget's content rendered once into `div.rdd-panel-float__content` (next.0, Changed) | teleported once into `div.vdd-panel-float__content` (`core/widgetContent.ts`, `VddWidgetContentSlot.vue`); `<Teleport>` keeps the logical parent, so `usePanel()` and every injection are the owner's |
| the whole placement in the overlay (next.0, Changed) | `ManagedPlacement` in the overlay store: mode, free position and size join anchor and stretch |
| a pointerdown anywhere in the content brings the widget to the front, even when the content stops propagation | the same: a capture-phase listener on the frame's body (PO39) |
| hosted panels: `'rdd:widget'`, `PanelInfo.owner`, never saved, never reported as excluded, dropped from a hand-made layout | `'vdd:widget'`, the same rules (`core/workspace.ts`, `serialize.ts` `withoutHostedPanels`) |
| `move()` / `location()`, the four refusals | the same (`useWidgetHosting.ts`) |
| `canDock` / `canFloat`, `titleMenu`; hosted tab menu: items, then Minimize and Close, no Float; ⋮ menu: items, then Close | the same (`core/panelMenu.ts` `buildPanelMenu`, `buildMoreActionsMenu`) |
| `useWidget()`, `onWillMove` / `onMoved` | the same; `VddWidgetScope.vue` provides it and settles `onMoved` |
| `placement()` / `open({ placement })` | the same JSON (`core/widgetPlacement.ts`); a free position waits for a size through the overlay's `ResizeObserver` |
| `focusPanel(id, { restore })`, `updatePanelProps`, `preserveEmbeds` | the same; each cache parks in its own hidden store (see §4) |
| next.1: `useWidget().panelId` | a `ComputedRef` |
| next.1: the tab / title-bar icon opens the widget's menu | the same, with the differences in §4 |
| next.1: a widget's panel brings its owner's contribution | the same (`activeContribution` maps the hosted id to its owner) |
| next.1: a title set with `updatePanelTitle` kept across moves out of the panel | the same |
| 7.11.0: `onMoved` after floating → floating and tab → tab in the same group | the same (`settled()` when the container key didn't change) |
| 7.11.0: `move({ to: 'floating' })` without a rect, out of the panel, opens where its panel is | the same (`frameRect`) |
| `HostedPanels.test.tsx` (HP1–HP7) | `test/store/hostedPanels.test.ts` (19 tests), names kept |
| `WidgetsOut.test.tsx` (WO1–WO8, WO17–WO19, WO21) | `test/components/widgetsOut.test.ts` (40 tests), names kept |
| `WidgetsOut.test.tsx` (WO9–WO16, WO20, WO22, WO23) | `test/components/widgetsOutMenus.test.ts` (33 tests), names kept |
| `WidgetPlacement.test.ts` (WP1–WP6) | `test/core/widgetPlacement.test.ts` (11 tests), names and values kept |
| `FocusPropsEmbeds.test.tsx` (FE1–FE4) | `test/components/focusPropsEmbeds.test.ts` (17 tests), names kept |
| `PanelOverlay.test.tsx` PO36–PO39 | `test/components/panelOverlay.test.ts` PO36–PO39 |
| `tests/browser/widgetsOut.browser.ts` | `scripts/gates/browser/m11.mjs`, the five "7.11" sections (content fill, out and back, menus and callbacks, placement, `preserveEmbeds`) |

### vdd 1.11.1 tab icon centring, traced

A vdd-only patch: rdd already centres its tab icon.

| rdd 7.10.0 | vdd 1.11.1 |
|---|---|
| `.rdd-workspace-tab-title { display: flex; align-items: center; max-width: 120px }` on the title wrapper (7.1.2) | `.vdd-workspace-tab-title`, flex and centred, without the `max-width`: vdd's tabs have never had one. Only on the built-in content, not on the `#tab-content` wrapper |
| the ellipsis stays on the wrapper | moved to the title span, `.vdd-workspace-tab-label`: in a flex row the wrapper's `text-overflow` no longer reaches the text, so a long title would be cut with no "…". rdd's long titles were not checked for this |

### rdd 7.1.0 per-panel icons, traced

| rdd 7.1.0 | vdd 1.12.0 |
|---|---|
| `workspace.setPanelIcon(id, icon \| null)`: unknown id does nothing, the same icon changes no state, `null` restores the registered icon, no event | same, on `Workspace`; the icon is stored `markRaw` so Vue never proxies a component |
| `usePanel().setIcon(icon)` in a docked or floating panel calls `setPanelIcon(id, icon ?? null)` | same, under the same condition as `setTitle` (the panel is in the workspace); it no longer warns "standalone" there |
| `PanelInfo.icon`, shown as runtime ?? registered ?? default on the tab, floating title bar and taskbar, and given to `renderTabContent` | same order; the defaults stay vdd's own: the taskbar falls back to `defaultPanelIcon`, tabs and title bars show none |
| never written by `saveLayout`; `loadLayout` keeps it for a panel still open with the same component | same; an `icon` in a hand-made layout is dropped on load |

### rdd 7.10.0 Release C, traced

| rdd 7.10.0 | vdd 1.11.0 |
|---|---|
| `renderTabContent` prop on `RddDesktop`, `TabContentProps` | the `#tab-content` slot on `<VddDesktop>`, same fields as slot props (ADR 0007: slots over render props); forwarded to every group |
| `icon`: runtime icon, else the registration's, else `defaultPanelIcon` or the built-in default | the registration's icon or `undefined`: vdd's grid tabs have never shown a fallback icon, and the slot shows what the built-in content shows. Since 1.12.0 the runtime icon comes first, as in rdd |
| `definePanels`, a `createWorkspace` overload, `TypedWorkspace`, `PanelMap`, `PanelPropsOf` | same names; props from a component object's `$props` or a functional component's first argument, minus `panelId` and Vue's `key`/`ref`/`class`/`style` |
| type tests: a fixture compiled with the TypeScript API | in the test file itself, which `vue-tsc` checks |

### rdd 7.9.0 Release B, traced

| rdd 7.9.0 | vdd 1.10.0 |
|---|---|
| `defaultOptions.canFloat` / `canDock` | same, same meaning |
| `createWorkspace({ canDrop })`, `PanelDrop` / `PanelDropTarget` | same; one helper (`core/dockRules.ts`) used by the drag composable, the zones and the menus |
| forbidden targets not offered, asked again at release | same; under RTL a corner float is mirrored before `canDrop` sees it, as vdd already mirrored it when floating |
| `startPointerDrag` ends on blur and lost capture, `onCancel` | blur and `onCancel` since 1.5.1; lost capture added in 1.10.0 |
| `dockZones.browser.ts`: every zone and edge, LTR and RTL | already covered by the M6 browser gate |
| API check sees unexported referenced types (rdd's API Extractor report) | n/a: vdd's `api-surface.json` pins export names, not signatures |

### rdd 7.8.0 Release A, traced

| rdd 7.8.0 | vdd 1.9.0 |
|---|---|
| `<RddDesktop emptyWorkspace={…}>` | `<VddDesktop>` slot `#empty-workspace` (ADR 0007: markup is a slot), forwarded to the root group only |
| `data-rdd-selected` / `-focused` / `-dirty` on tabs, `-focused` / `-maximized` on windows | `data-vdd-*`, same names and meaning |
| `openPanel(…, { dockTo: { panel, position, size } })` | same option, same behaviour; the not-docked case warns outside production, as vdd's other warnings do |
| `defaultOptions.className` / `tabClassName` | same, on `.vdd-panel-content` and the tab |
| `defaultOptions.keepAlive: false` | same; recorded as [ADR 0021](decisions/0021-opt-in-unmount-while-hidden.md), amending 0002 |
| layered stylesheet | not in A: moved to a later phase in all three editions (the stylesheet's `!important`: 266 in rdd, 265 in vdd) |

### rdd 7.7.2 and 7.7.3, traced

| rdd | vdd 1.8.2 |
|---|---|
| 7.7.2: panels no longer re-render on every workspace change | not affected: each `VddPanelMount` reads only its own entry, and Vue tracks per property |
| 7.7.2: `useWorkspaceState(selector)` re-rendered on every change | not applicable: no selector hook; `useWorkspace()` state is reactive per property |
| 7.7.3: a real lint gate (types, ESLint at zero warnings, knip) | the gate already ran types and lint; 1.8.2 adds `--max-warnings 0` and clears the 721 warnings |

### rdd 7.7.1 two workspaces on one page, traced

| rdd 7.7.1 | vdd 1.8.1 |
|---|---|
| per-workspace panel host (DOM, sizes, lifecycle) | already: `PanelDomCache` per desktop since 1.0 |
| scroll/focus records keyed by element | already: kept on the desktop's own `PanelDomCache` |
| taskbar preview tooltip found by ref | already: no document-wide query |
| `<html>` mirror as an owner stack (`utils/documentMirror.ts`) | `core/documentMirror.ts`, used by `VddDesktop.vue` |
| `TwoWorkspaces.test.tsx` (mirror cases) | `test/components/desktop.test.ts`, "skin and animations" |

### rdd 7.7.0 dialogs, traced

| rdd 7.7.0 | vdd 1.8.0 |
|---|---|
| `RddConfirm` `icon` prop, question icon beside the message | `<VddConfirm>` `icon` prop, via the internal `VddDialogIcon.vue` |
| `RddAlert` | `<VddAlert>` |
| `useModals().confirm()` / `.alert()`, `ConfirmOptions` / `AlertOptions` | the same, on `useModals()` |
| `rdd-dialog-icon-{type}` from the `--rdd-toast-*-color` tokens | `vdd-dialog-icon-{type}` from `--vdd-toast-*-color` |
| `data-rdd-alert-ok`; `data-rdd-confirm-ok` / `-cancel` (new in rdd) | `data-vdd-alert-ok`; the confirm hooks already existed |
| `alertTitle` message; confirm title from `modalTitle` | `alertTitle` and `confirmTitle` (vdd had no default modal title) |
| `RddConfirm` `onSettled`; fix: dismissal never settled | already: `<VddConfirm>` settled on unmount since 1.0 |
| fix: `RddConfirm` overwrote the header icon | already: `<VddConfirm>` cleared it rather than setting one |
| `onClose` now fires in modals and drawers | already: vdd's panel lifecycle covered overlays |
| `Dialogs.test.tsx` | `test/components/dialogs.test.ts` |

### rdd 7.6.2 icon-button padding, traced

| rdd 7.6.2 | vdd 1.7.2 |
|---|---|
| `.rdd-tooltip-close-x` padding | already: vdd's × is a `<span role="button">` |
| `.rdd-toolbar-btn` padding | `.vdd-toolbar-btn` padding |
| `.rdd-sidebar-tab-btn` padding | `.vdd-sidebar-tab-btn` padding |
| `hostPage.browser.ts` | `test/core/stylesheet.test.ts` |

### rdd 7.6.0 context-menu focus, traced

| rdd 7.6.0 | vdd 1.7.0 |
|---|---|
| menu opens with the menu element focused (`tabIndex={-1}`), nothing highlighted | `VddContextMenu.vue` open watcher; `tabindex="-1"` on the menu and submenu |
| `initialFocus?: 'menu' \| 'first-item'`; a keyboard `contextmenu` event (0,0) defaults to `'first-item'` | same option; `menuInitialFocus()` in `core/contextMenu.ts` |
| ArrowUp from the menu goes to the last item | `onMenuKey`; Home/End added (vdd had none) |
| the library's keyboard openers (Menu key, Shift+F10, ⋮ button) pass `'first-item'` | vdd has no keyboard openers of its own; a native keyboard `contextmenu` event is covered by the 0,0 rule |
| hover-opened submenu never takes focus | already: vdd moves no focus into submenus |
| `--rdd-context-menu-focus-ring` | `--vdd-context-menu-focus-ring` |
| `KeyboardAccess.test.tsx` | `test/components/contextMenu.test.ts` |

### rdd 7.5.0 toolbar buttons, traced

| rdd 7.5.0 | vdd 1.6.0 |
|---|---|
| `--rdd-panel-toolbar-icon-size`, `--rdd-chrome-icon-size` | `--vdd-panel-toolbar-icon-size`, `--vdd-chrome-icon-size`, same defaults and selectors |
| panel "on": accent 65% + black (dark) / accent (light), on-accent icon | same tokens, same values |
| `soft` chip tokens; `filled` on ≠ off | same |
| workspace toggle: 22% / 16% tint, accent edge and icon | same |
| global `:focus-visible` ring | vdd had none on toolbar/rail buttons: added on the three button classes |
| "Styling toolbar buttons" (panel overlay guide) | same section in `docs/manual/07-panel-overlay.md` |
| demo Toolbar Buttons panel | `demo/src/panels/ToolbarButtonsPanel.vue` |

### rdd 7.4.1 review fixes, traced

| rdd 7.4.1 | vdd 1.5.1 |
|---|---|
| default formatter replaces every `{key}`; one shared copy | `formatLabel`; `workspace.format` calls it |
| blur ends a tab drag and a floating-window drag | `useDragDock` (mouse and touch), `startPointerDrag` (+ `onCancel`) |
| repair drops unknown leaf ids, evens bad split sizes | `repairLayoutTree` |
| a throwing subscriber is logged, delivery goes on | `EventBus` |
| restored windows keep their stacking order | already: the z counter is seeded from the restored windows |
| `RddToolbarSearch` aborts on unmount | already: `<VddToolbarSearch>` resets on unmount |
| `Patch741.test.ts`, `DragBlur.test.tsx` | `test/store/reviewFixes.test.ts`, `test/components/dragBlur.test.ts` |

### rdd 7.4.0 field-report fixes, traced

| rdd 7.4.0 | vdd 1.5.0 |
|---|---|
| frost (and its background) on a `::before` of the 5 content containers | the same — one transform, byte-identical to rdd's after the prefix; vdd's drawer is frosted too |
| `prefers-reduced-motion` stops the library's motion | the same |
| `setDirection('rtl')` reaches `RddSidebar` and toasts | `<VddSidebar>` (and so `<VddSecondarySidebar>`) and `<VddToasts>` |
| title `() => string` (`PanelTitle`) | `Label` gains `() => string` |
| non-finite saved geometry repaired on load | `core/serialize.ts` |
| `data-rdd-*` identity attributes | already had `data-vdd-*` |
| CHANGELOG in the package | already shipped |
| `frost.browser.ts`, `motion.browser.ts`, `direction.browser.ts`, `TitleThunk.test.tsx`, `FiniteGeometry.test.tsx` | `scripts/gates/browser/m17.mjs`, `test/components/fieldReport.test.ts` |

### rdd 7.2.0 branding, traced

| rdd 7.2.0 test | vdd |
|---|---|
| `tests/browser/branding.browser.ts` — 14-scene baseline, red brand, on-accent | `scripts/gates/browser/m15.mjs` (baseline in `scripts/gates/browser/fixtures/m15-branding-baseline.json`, captured from 1.2.0), plus a `--control` run that must fail |
| `tests/browser/fonts.browser.ts` — skin fonts, brand font in every skin | `scripts/gates/browser/m15.mjs` (fonts) |
| `StylesheetContract.test.ts` — "branding contract" (5) | `test/core/stylesheet.test.ts` — "branding contract (index.css)" (5, names kept) |
| `tests/browser/radius.browser.ts` (7.3.0) — corner baseline, scale 0 and 1.5 | `scripts/gates/browser/m16.mjs` (corners; baseline `fixtures/m16-radius-baseline.json`, captured from 1.3.0) |
| `branding.browser.ts` brand-surface cases (7.3.0) — leftovers, layers, contrast, one input | `scripts/gates/browser/m16.mjs` (surfaces) |
| `StylesheetContract.test.ts` — "corner contract" (2), "surface contract" (3) | `test/core/stylesheet.test.ts` — the same, names kept |

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
| D16 | **A floating widget's title cannot be localised.** `ManagedWindowConfig.title` and `PanelFloatingWindowProps.title` are typed `string`, while every other title surface takes `PanelTitle` and re-resolves it — so a widget opened through the manager keeps the language it opened in until it is closed and reopened, and passing a descriptor anyway throws (`Objects are not valid as a React child`). The overlay *stores* the config, which is why a resolved string can never be corrected | `ManagedWidget.title` and `<VddFloatingWidget title>` are `Label`, resolved through `ws.format` on every render, so a descriptor follows a locale change with no reopen. Pinned by PO28–PO30 and by two M12 gate rules. **Reported against rdd 6.2.0 and fixed there in 6.3.0**, so this row is a divergence from 6.2.0 only |
| D17 | **One Escape can close several things.** rdd's drawers and modals each listen for Escape on `document`, and the answering modal's `stopPropagation()` does not stop the other listeners there. So a drawer whose listener registered after the modal's finds the stack already emptied and closes too, and with a drawer on each side one press closes both | Whoever acts on Escape claims the event, and every other listener checks for a claim first ([0016](decisions/0016-escape-claiming.md)). One press closes the topmost modal, else the drawer opened last. A context menu, toolbar flyout or toolbar search inside an overlay takes the press first and the overlay stays open. Pinned by `test/components/escapeRouting.test.ts` |

D1–D4 were verified by probe against rdd 6.2.0; D5–D7 and D11–D12 in real Chrome; D8–D10 and
D13 by reading rdd's shipped `index.css` against what its components actually render; D14 by
measuring vdd's own watcher ordering before writing the test that pins it; D16 by running both
libraries' own components under a formatter change (rdd threw; vdd rendered the descriptor's
JSON); D15 by M13's
class/rule correspondence sweep, which is what surfaced the gap at all.

D6 is worth singling out: it contradicts rdd's own headline claim of "zero-unmount state
preservation". The guarantee holds for component state, WebGL contexts and media, but scroll
offsets are browser state that detaching discards, and nothing in rdd puts them back.

### Widgets out of the panel (1.13.0)

Where vdd 1.13.0 differs from rdd 7.11.0. None changes what an app can do.

| rdd 7.11.0 | vdd 1.13.0 |
|---|---|
| a widget's content is a `ReactNode` (`content`) | `component` + `props`, as every managed widget since 1.0 |
| `useWidget()` re-renders its component on a change of `location` | `location` and `panelId` are `ComputedRef`s (the `usePanel()` rule, [0006](decisions/0006-refs-over-subscriptions.md)); `onWillMove` / `onMoved` return the unsubscribe and, called during `setup`, are also disposed with the component |
| `location` read in `onWillMove` is where the widget was | the same for the app's own `move()`; during a user's move (a drag, the taskbar) it already shows the new location: the callback runs in a sync watcher on the workspace's state, which has changed, before the DOM has |
| a re-open that adds a `titleMenu` to a floating widget's panel shows its ⋮ menu on the next re-render | at once: the menu items are reactive |
| a widget's tab icon opens its menu; rdd's tabs always have an icon (the default grid icon at worst) | the same, but vdd's tabs have no fallback icon, so a widget's tab with none shows the menu glyph. The floating title bar's icon opens the menu only with a `titleMenu`, as in rdd; with no icon it shows the glyph then, and nothing without a `titleMenu` |
| `placement()` of a minimised widget | read from what the workspace recorded as it minimised the panel (`previousState`, `lastFloatingRect`, `lastLeafId`) |
| one hidden store for parked elements | each cache (`PanelDomCache`, `WidgetContentCache`) parks in its own hidden store, on its own document |
| an overlay outside a `DockableDesktopProvider`: `move()` refuses with `no-workspace` | no such case: `<VddFloatingWidget>` needs the installed workspace; `no-workspace` is a modal, a side panel or an overlay outside any panel |

### Pop-out windows (1.14.0)

Where vdd 1.14.0 differs from rdd 7.12.1. None changes what an app can do; the reasons are in
[0022](decisions/0022-popout-windows.md).

| rdd 7.12.1 | vdd 1.14.0 |
|---|---|
| the windows registry belongs to the workspace client, and `<DockableDesktopProvider>` renders it | it belongs to `<VddDesktop>`, which creates it and binds it to the workspace on mount (`bindPopOutWindows`); so `popOutPanel` with no desktop mounted returns `'no-window'` right after `'disabled'`, before `'not-open'`, and a widget's `popOut()` without one returns `'no-window'` |
| a widget's `popOut()` outside a `DockableDesktopProvider`: `'disabled'` | `'disabled'` for an overlay outside any workspace; `'no-window'` without a desktop |
| the frame is a React portal into the child's body | a `<Teleport>` into the child's body, holding the panel's ordinary preserved slot, so the cached element moves in with no remount ([0002](decisions/0002-zero-unmount-via-teleport.md) unchanged); it is parked back synchronously in the child's `pagehide` |
| `popoutWrapper` gets `{ window, document, children }` | a component with the props `window` and `document` and a default slot; the SFC compiler can't resolve an imported props type in every setup, so the manual spells them out |
| `<RddContextMenu>` and the toasts sit inside the provider, so its wrapper context reaches them | `<VddContextMenu>` and `<VddToasts>` are the desktop's siblings, so no `provide` reaches them: the desktop records its wrapper per open pop-out document, and they look it up by the document they show in |
| the wrapper is committed before the panel's element moves | the frame's patch moves the element and the wrapper re-renders with the pop-out's document in the same flush, before any app watcher (XPW2 checks the flush) |
| `usePanelWindow()` re-renders its component | an object whose `window` and `document` are live getters; destructuring in `setup` reads once |
| `usePanel().isPoppedOut`, `useWidget().isPoppedOut` are booleans | `ComputedRef<boolean>`s ([0006](decisions/0006-refs-over-subscriptions.md)) |
| React creates a popped-out panel's new nodes in the pop-out's document | Vue's renderer creates them with the main `document`; the pop-out's adopts them on insertion |
| one Escape stack, scoped per document (S6) | ADR 0016's claims kept; every listener goes through the document registry and acts only on the document the key fired in. Modals and drawers stay main-document only |
| one document listener for click-to-activate | in the main document the group's and the floating window's own `@pointerdown` answer as before; the registry's `pointerdown` and `focusin` listeners act only in a pop-out |
| `setActivePanel` (rdd's client forwards `focusPanel` calls to its core, which never focuses a window) | an internal `activatePanel`, used where vdd's components would otherwise call the public `focusPanel` |
| the keyboard open of the widget frame's title menu | the frame (and the in-panel widget title icon) passes a stand-in `MouseEvent` of the child window at the icon's corner, whose `target` is the icon, since vdd's menu places a 0,0 event by its `x`/`y` (internal `menuEventBelow`) |
| a widget's return sets its last container key to `'floating'` | the hosted entry is marked `returning`, and the sync watcher ignores its panel's steps until `returned`: a docked widget panel restored docked first would otherwise fire a second `onWillMove` |
| `popOut` is not in the config's declared type | `WorkspaceConfig.popOut`, so `workspace.config`'s type lists it (its line can't be rewritten); the value never has it |
| the development warnings, in development | outside production builds, as every vdd warning |
| a lone panel popped out of the root group leaves a new `group-default` | the group stays with its id (vdd's `detach` rule) and the panel comes back into it by the own-kept-group rule; the same shapes, and the JSON format is unchanged |
| the windows follow the store through `subscribeToState` | through `onPopOutEnded(id)`, a synchronous callback on every ending (internal) |
| `<html>`'s document mirror for the child | `documentMirror.ts` is not run for the child: it writes `data-vdd-skin`, `vdd-no-animations` and `--vdd-z-base` onto the main `<html>`, and the `<html>` mirror copies all three, rdd's observable result |
| the built-in menu items have an icon | none: vdd's built-in menu items have none |
| the taskbar's entries are `<button>`s | the same for a popped-out panel's; vdd's minimised items are `div`s, so its rule adds `position: relative; padding: 0; font: inherit` |
| the Playwright `hasFocus` recipe stubs the window that shouldn't have focus | the same on the pop-out; a stub on the page is never read, since vdd's `focusedDocument` asks the pop-outs first |
| a toolbar flyout or search dropdown in a closing pop-out | not closed with the window (only the context menu is); it goes with the window's document. Recorded as open |

### Port regressions found after 1.0.0

Not divergences — vdd matched rdd before the port broke it, and matches it again now. Kept here
because the *reason* rdd is immune is a design fact worth not losing.

| # | What broke | rdd's design, and why it cannot happen there |
|---|---|---|
| R1 | **A widget opened through `useFloatingWidgets()` discarded every placement gesture** (1.0.0; fixed 1.0.1). `<VddPanelOverlay>` bound `placement` — a `defineModel` — as a fresh `{ anchor, stretch }` literal with no `@update:placement`, and Vue re-syncs a model from its prop whenever the prop's *identity* changes. So a drop reverted on the render the drop itself triggered (`draggingId` is cleared in the same function that applies the placement), and a stretched widget reverted whenever any other widget opened or closed (`managedVersion`). Template-declared widgets and plain resizes were unaffected | `PanelFloatingWindow` splits the surface four ways: `defaultAnchor` and `defaultStretch` (seeds, consumed by `useState`), `stretch` (opt-in controlled) and `onPlacementChange` (report), and the managed path passes seeds only. Two properties make the defect unreachable there: the **anchor is never controllable** (`applyPlacement` always calls `setCurrentAnchor` — "Anchor is always internal"), and the one controllable placement value is a **primitive**, so identity churn cannot occur. Collapsing all four into one `v-model:placement` ([0005](decisions/0005-vmodel.md)) removed the seed position and made the two-way value an object; the overlay owns the record and echoes gestures now, and ADR 0005 carries the amendment |

Neither suite covered it: rdd's own PO7/PO8 test `openManaged`/`closeManaged`/`openIds`/`closeAll`
and nothing about placement, and every gesture test in both libraries drives a declaratively
rendered widget. vdd's browser gate set placement through a handle by design — "the rendered
result of a placement rather than the gesture that produced it" — so the gesture path into an
overlay-owned widget was untested everywhere. PO31–PO35 and a real pointer drag in the M14
browser walkthrough close that.

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

- **The skin attribute is `data-vdd-skin`, not `data-workspace-skin`.** Same seven skins, same
  tokens, same values — the stylesheets are identical after prefix normalisation — but the hook a
  consumer writes their own skin against carries the library's own prefix, as
  [0008](decisions/0008-css-prefix.md) requires of everything else it owns. An app sharing one
  stylesheet with the React library needs both selectors. Nothing else about skinning differs:
  the prop, the names, and the dark/light pairing all behave as rdd's do, including the mirroring
  of the colour scheme onto the workspace element that makes a skin's light variant win there
  (vdd 1.0.x omitted that mirror, which is what made the skins unusable in light mode).

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
