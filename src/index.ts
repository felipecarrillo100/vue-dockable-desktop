/**
 * vue-dockable-desktop — public entry point.
 *
 * Every runtime export here is mirrored in `api-surface.json`; the gate fails if the two
 * disagree, so the public surface cannot grow by accident.
 */

/** The library version, mirroring `package.json`. */
export const version = '0.1.0'

// ─── The workspace ───────────────────────────────────────────────────────────
// `createWorkspace()` returns both the imperative API and a Vue plugin, the shape
// `createPinia()` / `createRouter()` already established.
export { createWorkspace, WORKSPACE_KEY } from './core/workspace'
export type { Workspace, WorkspaceConfig, WorkspaceState, PanelDefinition, OpenPanelOptions, HostClasses } from './core/workspace'
export type { BuiltInEvents } from './core/eventBus'

// ─── Components ──────────────────────────────────────────────────────────────
export { default as VddDesktop } from './components/VddDesktop.vue'
export { default as VddContextMenu } from './components/VddContextMenu.vue'
export { default as VddSidebar } from './components/VddSidebar.vue'
export { default as VddSecondarySidebar } from './components/VddSecondarySidebar.vue'
export { default as VddToolbar } from './components/VddToolbar.vue'
export { default as VddSidePanels } from './components/VddSidePanels.vue'
export { default as VddModals } from './components/VddModals.vue'
export { default as VddToasts } from './components/VddToasts.vue'
export { default as VddConfirm } from './components/VddConfirm.vue'

// ─── Panel overlay — toolbars and floating widgets inside one panel ──────────
export { default as VddPanelOverlay } from './components/VddPanelOverlay.vue'
export { default as VddPanelToolbar } from './components/VddPanelToolbar.vue'
export { default as VddToolbarButton } from './components/VddToolbarButton.vue'
export { default as VddToolbarToggle } from './components/VddToolbarToggle.vue'
export { default as VddToolbarSeparator } from './components/VddToolbarSeparator.vue'
export { default as VddToolbarSpacer } from './components/VddToolbarSpacer.vue'
export { default as VddToolbarItem } from './components/VddToolbarItem.vue'
export { default as VddToolbarCenter } from './components/VddToolbarCenter.vue'
export { default as VddToolbarSearch } from './components/VddToolbarSearch.vue'
export { default as VddFloatingWidget } from './components/VddFloatingWidget.vue'

// ─── Composables ─────────────────────────────────────────────────────────────
export { useWorkspace } from './composables/useWorkspace'
export { useContextMenu, usePanelContextMenu } from './composables/useContextMenu'
export { useSidebar, useSidebarTab } from './composables/useSidebar'
export { useToolbar } from './composables/useToolbar'
export { usePanel } from './composables/usePanel'
export type { UsePanelReturn } from './composables/usePanel'
export { useModals, useSidePanels } from './composables/useOverlays'
export { useFloatingWidgets } from './composables/usePanelOverlay'
export {
  usePanelContribution,
  useActiveContribution,
  useMergedToolbarItems,
  useMergedSidebarTabs,
} from './composables/useContributions'
export { useColorScheme } from './composables/useColorScheme'
export type { ColorScheme } from './composables/useColorScheme'

// ─── Drag and resize primitives ──────────────────────────────────────────────
// Public so an application can build its own resizable UI inside a panel with exactly the
// behaviour the library uses for its own windows.
export { startPointerDrag, computeResizedRect } from './core/dragResize'
export { clampFloatingRect } from './core/anchorGeometry'
export type { FloatingRect } from './core/anchorGeometry'
export type { PointerDragConfig, ResizeDir, ResizeRect, ResizeConstraints } from './core/dragResize'

// ─── Serialisability ─────────────────────────────────────────────────────────
// Exported so an application can apply the same check the library will apply at save time,
// and warn early rather than discovering a panel was pruned after the fact.
export { isSerializable } from './core/serializable'

// ─── Messages and i18n ───────────────────────────────────────────────────────
export { defaultMessages, formatLabel } from './core/messages'
export type { MessageKey } from './core/messages'

// ─── Panel registry ──────────────────────────────────────────────────────────
export { PanelRegistry } from './core/registry'
export type { PanelRegistryEntry, PanelDefaultOptions } from './core/registry'

// ─── Context menus ───────────────────────────────────────────────────────────
export type {
  ContextMenuItem,
  ContextMenuSimpleItem,
  ContextMenuSeparator,
  ContextMenuSubMenu,
  ContextMenuCheckbox,
  ShowContextMenuOptions,
} from './core/contextMenu'

// ─── Sidebar and toolbar ─────────────────────────────────────────────────────
export type {
  SidebarProps,
  SidebarTab,
  SidebarActionButton,
  SidebarCustomEntry,
  SidebarRailEntry,
  SidebarContext,
  SidebarTabContext,
} from './core/sidebarTypes'
export type {
  ToolbarItem,
  ToolbarActionItem,
  ToolbarRadioItem,
  ToolbarToggleItem,
  ToolbarGroupItem,
  ToolbarGroupSubItem,
  ToolbarGroupEntry,
  ToolbarSeparator,
} from './core/toolbarTypes'
export type { ToolbarState } from './core/toolbarState'

// ─── Side panels, modals and toasts ──────────────────────────────────────────
export type {
  Overlays,
  OverlayInstance,
  OverlayKind,
  OverlayState,
  SidePanelOptions,
  ModalOptions,
  ConfirmDiscard,
} from './core/overlays'
export { toast, resetToasts } from './core/toast'
export type {
  ToastFunction,
  ToastOptions,
  ResolvedToastOptions,
  ToastType,
  ToastPosition,
  ToastAdapter,
  ToastRecord,
  ToastPromiseMessages,
} from './core/toast'

// ─── Inner-widget placement ──────────────────────────────────────────────────
export type { Stretch, PanelFloatPlacement } from './core/stretch'
export type { ToolbarPosition, ToolbarVariant, ButtonVariant, ToolbarInsets } from './core/panelOverlay'
export type { ManagedWidget } from './core/overlayState'

// ─── Panel contributions ─────────────────────────────────────────────────────
export { sectionToTab, mergeToolbarItems, mergeSidebarTabs } from './core/contributions'
export type { PanelContribution, PanelSidebarSection, Contributions } from './core/contributions'

export type { SearchResult } from './components/VddToolbarSearch.vue'

// ─── Domain types ────────────────────────────────────────────────────────────
export type {
  AlertType,
  ContainerType,
  DirtyStateOptions,
  DropPosition,
  DropTarget,
  FloatAnchor,
  FloatingWindow,
  Label,
  LayoutGridNode,
  LayoutLeafNode,
  LayoutNode,
  MessageDescriptor,
  MessageFormatter,
  PanelInfo,
  PanelState,
  SerializedLayout,
  SplitDirection,
  SplitOrientation,
} from './types'
