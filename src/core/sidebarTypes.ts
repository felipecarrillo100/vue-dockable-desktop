/**
 * Sidebar configuration shapes.
 *
 * `renderContent` is gone: content comes from a `#tab-<id>` slot or a `component` field
 * (docs/decisions/0007-slots-over-render-props.md). Everything else keeps rdd's names.
 */
import type { Component, InjectionKey, Ref } from 'vue'

/** One tab in the activity bar. */
export interface SidebarTab {
  id: string
  label: string
  /** Required unless `hidden` — a hidden tab renders no rail button, so it has no icon to show. */
  icon?: Component
  /**
   * Render no rail button, while the tab stays fully openable through `v-model:active-tab-id`
   * or `useSidebar().openTab()`. For menu-driven panels with no permanent icon.
   * @default false
   */
  hidden?: boolean
  /** Mount as soon as the sidebar renders, not on first open. Implies `preserveState`. @default false */
  eagerMount?: boolean
  /** Keep the content alive behind `display: none` when closed, instead of unmounting it. @default false */
  preserveState?: boolean
  /** Content, when it comes from data rather than a slot. A `#tab-<id>` slot wins over this. */
  component?: Component
  /** Props for `component`. */
  props?: Record<string, unknown>
}

/** A rail button that does not toggle the drawer — a hamburger, say. */
export interface SidebarActionButton {
  /** Needed only inside an array, for the key. */
  id?: string
  icon: Component
  /** Tooltip and accessible name. */
  label: string
  onClick: () => void
  disabled?: boolean
}

/** A rail entry the caller renders entirely themselves. */
export interface SidebarCustomEntry {
  id?: string
  /** Rendered as-is, unwrapped, so the caller's own styling and behaviour are untouched. */
  component: Component
  props?: Record<string, unknown>
  /** Marks this as a custom entry rather than a tab, since both carry `component`. */
  custom: true
}

/**
 * An entry in the header or footer area of the rail: a plain button, a caller-rendered
 * component, or a real tab that behaves exactly like one from the main list.
 */
export type SidebarRailEntry = SidebarTab | SidebarActionButton | SidebarCustomEntry

export const isCustomEntry = (entry: SidebarRailEntry): entry is SidebarCustomEntry =>
  'custom' in entry && entry.custom === true

export const isTabEntry = (entry: SidebarRailEntry): entry is SidebarTab =>
  !isCustomEntry(entry) && !('onClick' in entry)

export const isActionButton = (entry: SidebarRailEntry): entry is SidebarActionButton =>
  !isCustomEntry(entry) && 'onClick' in entry

/** Normalise the single-or-array shape both areas accept. */
export const toRailArray = (value: SidebarRailEntry | SidebarRailEntry[] | undefined): SidebarRailEntry[] =>
  value == null ? [] : Array.isArray(value) ? value : [value]

/**
 * `<VddSidebar>`'s props, declared here so `<VddSecondarySidebar>` can forward them with
 * their types intact. Forwarding through `$attrs` alone works at runtime but throws the
 * types away, which is most of the point of declaring them.
 *
 * The four two-way values — the open tab, visibility, strip visibility and width — are
 * models rather than props, so they are not listed here.
 */
export interface SidebarProps {
  /** Which edge the bar and drawer sit on. @default 'right' */
  position?: 'left' | 'right'
  tabs: SidebarTab[]
  /** Entries above the tabs, in their own area. A single entry or an array. */
  headerAction?: SidebarRailEntry | SidebarRailEntry[]
  /** Entries pinned below the tabs. */
  footerAction?: SidebarRailEntry | SidebarRailEntry[]
  minWidth?: number
  maxWidth?: number
  /** Show an "X" in the drawer header. No effect once the default header is suppressed. @default false */
  showCloseButton?: boolean
  /** Suppress the library's own drawer header for every tab. @default false */
  hideDefaultHeader?: boolean
  /** @internal set by `<VddSecondarySidebar>`. */
  isSecondary?: boolean
}

// ── context shared with descendants ─────────────────────────────────────────

/** What `useSidebar()` returns: control of the drawer from anywhere inside it. */
export interface SidebarContext {
  openTab: (id: string) => void
  closeDrawer: () => void
  /** The open tab, or `null`. Reactive. */
  activeTabId: Ref<string | null>
  position: 'left' | 'right'
  /** True for a `<VddSecondarySidebar>`. */
  isSecondary: boolean
}

/** What `useSidebarTab()` returns: control scoped to the tab you are inside. */
export interface SidebarTabContext {
  tabId: string
  open: () => void
  close: () => void
  /** Switch to another tab. */
  openTab: (id: string) => void
}

export const SIDEBAR_KEY = Symbol('vdd-sidebar') as InjectionKey<SidebarContext>
export const SIDEBAR_TAB_KEY = Symbol('vdd-sidebar-tab') as InjectionKey<SidebarTabContext>
