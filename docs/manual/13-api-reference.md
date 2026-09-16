# 13. API reference

Every public export, with the chapter that explains it. The package has **48 runtime exports**
and **82 exported types**; `api-surface.json` is the machine-readable list, and a standing gate
fails if the two disagree.

This chapter is a map, not a substitute for the chapters — it says what each export *is* and
where to read about it. Full signatures live in the `.d.ts`, which your editor already has.

## Entry point

| Export | |
|---|---|
| `createWorkspace(config?)` | Creates the store **and** a Vue plugin: `app.use(workspace)`. The one thing you always call. [Ch. 1](01-getting-started.md) |
| `WORKSPACE_KEY` | The injection key, for advanced composition — providing a workspace to a subtree yourself. |
| `version` | The package version, as a string. |

`createWorkspace` returns a `Workspace`: the imperative API *and* the plugin. It works before
any component mounts, which is why none of the composables below need a provider.
[Ch. 2](02-concepts.md)

### `WorkspaceConfig`

| Field | |
|---|---|
| `panels` | The panel catalogue: the keys `openPanel` and saved layouts use. [Ch. 3](03-panels.md) |
| `initialState` | A layout from a previous `saveLayout()`. [Ch. 5](05-persistence.md) |
| `dir` | `'ltr'` (default) or `'rtl'`. [Ch. 11](11-i18n.md) |
| `formatMessage` | Resolves the library's message descriptors. The whole i18n surface. [Ch. 11](11-i18n.md) |
| `messages` | Overrides any subset of the built-in strings. [Ch. 11](11-i18n.md) |
| `defaultSplitRatio`, `defaultEdgeSplitRatio` | Split fractions, clamped 0.1–0.9. [Ch. 4](04-layout.md) |
| `zIndexBase` | Base stacking level, mirrored as `--vdd-z-base`. [Ch. 10](10-theming.md) |
| `classes` | Your own classes for the library's chrome (`HostClasses`). [Ch. 11](11-i18n.md) |

## Components

| Component | |
|---|---|
| `VddDesktop` | The workspace: grid, floating windows, taskbar. Mount one. [Ch. 1](01-getting-started.md) |
| `VddContextMenu` | Renders whatever menu is pending. Mount one. [Ch. 8](08-overlays.md) |
| `VddSidebar`, `VddSecondarySidebar` | Activity bar and drawer, on either edge. [Ch. 6](06-sidebar-toolbar.md) |
| `VddToolbar` | A strip of tool buttons on any edge. [Ch. 6](06-sidebar-toolbar.md) |
| `VddSidePanels` | The two side drawers. Mount one. [Ch. 8](08-overlays.md) |
| `VddModals` | The modal stack. Mount one — the unsaved-changes dialog needs it. [Ch. 8](08-overlays.md) |
| `VddToasts` | The notification host. Mount one. [Ch. 8](08-overlays.md) |
| `VddConfirm` | A confirm/cancel dialog body, reusable as a modal. [Ch. 8](08-overlays.md) |
| `VddPanelOverlay` | The root for one panel's own toolbars and widgets. [Ch. 7](07-panel-overlay.md) |
| `VddPanelToolbar` | A toolbar on one edge of a panel. [Ch. 7](07-panel-overlay.md) |
| `VddFloatingWidget` | A floating widget inside a panel. [Ch. 7](07-panel-overlay.md) |
| `VddToolbarButton`, `VddToolbarToggle`, `VddToolbarSearch`, `VddToolbarSeparator`, `VddToolbarSpacer`, `VddToolbarItem`, `VddToolbarCenter` | Panel-toolbar contents. [Ch. 7](07-panel-overlay.md) |

Four of these are hosts you mount once and then forget: `VddContextMenu`, `VddSidePanels`,
`VddModals`, `VddToasts`. Each renders state that lives on the workspace, so where they sit in
the tree does not matter.

## Composables

| Composable | |
|---|---|
| `useWorkspace()` | The workspace, anywhere inside the app. Destructuring keeps reactivity. [Ch. 2](02-concepts.md) |
| `usePanel()` | A panel's view of itself: `isActive`, `isMinimized`, `size`, `close`, `setDirty`, `onBeforeClose`, `onSaveState`. Returns `UsePanelReturn`. [Ch. 3](03-panels.md) |
| `useModals()`, `useSidePanels()` | Open and close overlays. [Ch. 8](08-overlays.md) |
| `useContextMenu()` | Open a menu from anywhere. [Ch. 8](08-overlays.md) |
| `usePanelContextMenu(getter)` | Contribute items to *this panel's* own menu. [Ch. 3](03-panels.md) |
| `useSidebar()`, `useSidebarTab()` | Control the sidebar, or the tab you are inside. [Ch. 6](06-sidebar-toolbar.md) |
| `useToolbar()` | Toolbar radio/toggle state for uncontrolled items. [Ch. 6](06-sidebar-toolbar.md) |
| `useFloatingWidgets()` | Open widgets by id, from data. [Ch. 7](07-panel-overlay.md) |
| `usePanelContribution(getter)` | Publish this panel's toolbar items and sidebar sections. [Ch. 9](09-contributions.md) |
| `useActiveContribution()` | What the active panel published. [Ch. 9](09-contributions.md) |
| `useMergedToolbarItems(items)`, `useMergedSidebarTabs(tabs, icon?)` | Static lists plus the active panel's. [Ch. 9](09-contributions.md) |
| `useColorScheme()` | The current scheme, as a ref that follows it. [Ch. 10](10-theming.md) |

Every one of these throws with a message naming what is missing if used without a workspace.
`usePanel()` is the exception: outside a container it reports a `'standalone'` panel and its
actions warn instead of throwing, so a panel component renders on its own in a test or a
storybook.

## Functions

| Function | |
|---|---|
| `toast(message, options?)` | Plus `.info`, `.success`, `.warning`, `.error`, `.dismiss`, `.promise`. A plain import — no hook. [Ch. 8](08-overlays.md) |
| `resetToasts()` | Empties the queue with no animation. For tests and teardown. |
| `formatLabel(label, formatter?)` | Resolve a string-or-descriptor without a workspace. [Ch. 11](11-i18n.md) |
| `defaultMessages` | The built-in string table, as data. [Ch. 11](11-i18n.md) |
| `isSerializable(value)` | Whether a value can round-trip through JSON — the check `saveLayout()` applies to panel props. [Ch. 5](05-persistence.md) |
| `sectionToTab(section, icon?)` | A contributed section as a sidebar tab. [Ch. 9](09-contributions.md) |
| `mergeToolbarItems(items, contribution)`, `mergeSidebarTabs(tabs, contribution, icon?)` | The merge helpers, without the composable. [Ch. 9](09-contributions.md) |
| `startPointerDrag(config)`, `computeResizedRect(dir, dx, dy, start, constraints)` | The drag and resize primitives the library uses for its own windows, exported so you can build resizable UI inside a panel with identical behaviour. [Ch. 7](07-panel-overlay.md) |
| `PanelRegistry` | The registry class, for constructing one outside a workspace. Rarely needed. [Ch. 3](03-panels.md) |

## Types

Grouped by what they describe. All are type-only exports.

**Layout and panels** — `LayoutNode`, `LayoutGridNode`, `LayoutLeafNode`, `SplitOrientation`,
`SplitDirection`, `DropPosition`, `DropTarget`, `FloatAnchor`, `FloatingWindow`, `PanelInfo`,
`PanelState`, `ContainerType`, `PanelDefinition`, `PanelDefaultOptions`, `PanelRegistryEntry`,
`OpenPanelOptions`, `SerializedLayout`.

**The workspace** — `Workspace`, `WorkspaceConfig`, `WorkspaceState`, `HostClasses`,
`BuiltInEvents`, `UsePanelReturn`, `DirtyStateOptions`, `AlertType`.

**Messages** — `Label`, `MessageDescriptor`, `MessageFormatter`, `MessageKey`.

**Sidebar** — `SidebarProps`, `SidebarTab`, `SidebarActionButton`, `SidebarCustomEntry`,
`SidebarRailEntry`, `SidebarContext`, `SidebarTabContext`.

**Toolbar** — `ToolbarItem`, `ToolbarActionItem`, `ToolbarRadioItem`, `ToolbarToggleItem`,
`ToolbarGroupItem`, `ToolbarGroupSubItem`, `ToolbarGroupEntry`, `ToolbarSeparator`,
`ToolbarState`.

**Context menu** — `ContextMenuItem`, `ContextMenuSimpleItem`, `ContextMenuSeparator`,
`ContextMenuSubMenu`, `ContextMenuCheckbox`, `ShowContextMenuOptions`.

**Overlays** — `Overlays`, `OverlayInstance`, `OverlayKind`, `OverlayState`,
`SidePanelOptions`, `ModalOptions`, `ConfirmDiscard`.

**Toasts** — `ToastFunction`, `ToastOptions`, `ResolvedToastOptions`, `ToastType`,
`ToastPosition`, `ToastAdapter`, `ToastRecord`, `ToastPromiseMessages`.

**Panel overlay** — `ToolbarPosition`, `ToolbarVariant`, `ButtonVariant`, `ToolbarInsets`,
`ManagedWidget`, `Stretch`, `PanelFloatPlacement`, `SearchResult`.

**Contributions** — `PanelContribution`, `PanelSidebarSection`, `Contributions`.

**Drag and resize** — `PointerDragConfig`, `ResizeDir`, `ResizeRect`, `ResizeConstraints`.

**Theming** — `ColorScheme`.

## What is deliberately absent

Coming from react-dockable-desktop you may look for these. Each is gone because Vue makes it
unnecessary, not because the capability is missing — [chapter 12](12-migrating.md) maps every
one, and `docs/PARITY.md` records the reasoning.

| Absent | Because |
|---|---|
| `WorkspaceClient` and its pending-call queue | `createWorkspace()` is live before any component, so there is nothing to queue |
| `DockableDesktopProvider`, `WindowManagerProvider`, `PanelProvider`, `PanelContributionProvider`, `ToolbarProvider`, `ContextMenuProvider` | One `app.use(workspace)` |
| `SidebarHandle`, `ToolbarHandle`, `usePanelFloatingWindow` | `v-model` |
| `useWindowManagerState`, `useWindowManagerActions`, `useFormatMessage`, `usePredefinedMessages`, `useStyleClasses`, `useRegistry`, `usePanelId` | Fields on the workspace |
| `usePanelSize` | `usePanel().size` is already a ref |
| `ContextMenuAdapter` | `<VddContextMenu>`'s default slot |
| `renderContent`, `renderHeader`, `ManagedWindowConfig.content` | Slots, or a `component` field |

## The surface is gated

Two standing gates keep this chapter honest:

- **`api-surface`** compares the built `dist` against `api-surface.json` and fails on any
  export added or removed without recording it. It reads the built output, not the source,
  because that is what a consumer actually imports — and it refuses to run against a stale
  build, after an earlier version cheerfully reported a surface nobody shipped.
- **`docs-api`** fails if any drafted chapter names a `Vdd…` identifier that is not a real
  export, or mentions a retired name outside a migration table.

So a name in this chapter is a name in the package.
