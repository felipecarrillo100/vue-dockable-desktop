/**
 * The workspace: reactive state plus every action that mutates it.
 *
 * Created outside the component tree and live from that moment, so an application can drive
 * it from a service, a router guard or a plain module — no queueing, no "connected" state
 * (docs/decisions/0004-store-outside-components.md).
 */
import { computed, markRaw, reactive, readonly, ref, shallowRef, toRaw } from 'vue'
import type { AllowedComponentProps, App, Component, ComputedRef, InjectionKey, VNodeProps } from 'vue'
import type {
  DirtyStateOptions, DropPosition, FloatAnchor, PanelDrop, FloatingWindow, HostedPanelPlacement, Label, LayoutNode,
  MessageDescriptor, MessageFormatter, PanelInfo, PanelOwner, SerializedLayout, SplitDirection,
} from '../types'
import type { LayoutLeafNode, PopOutResult } from '../types'
import {
  addPanelToLeaf, deriveActivePanelId, dockToEdge, emptyRoot, findFirstLeafId, findLeafForPanel,
  insertPanelInLeaf, isLoneOccupant, isVisibleActiveTarget, leafExists, removeLeafFromTree,
  removePanelFromTree, selectPanelInTree, splitLeafInTree, updateSizesAtPath,
} from './layoutTree'
import {
  findLeaf, groupOf, insertPanelAmongMates, placesBeside, resolveActivePanelId, returnBeside,
} from './layoutTree'
import type { ActiveTargetScope } from './layoutTree'
import type { PlaceBeside } from './layoutTree'
import { DEFAULT_FLOAT_RECT, LAYOUT_VERSION, parseInitialState, parseLayoutPayload, withoutHostedPanels } from './serialize'
import { HOSTED_COMPONENT, optionsFor } from './panelOptions'
import type { ParsedLayout } from './serialize'
import { isSerializable } from './serializable'
import { PanelRegistry } from './registry'
import type { PanelDefaultOptions } from './registry'
import { EventBus } from './eventBus'
import { menuInitialFocus, menuPosition } from './contextMenu'
import { docOf, isNode } from './domContext'
import type { ContextMenuItem, ContextMenuRequest, ShowContextMenuOptions } from './contextMenu'
import type { BuiltInEvents } from './eventBus'
import { defaultMessages, formatLabel } from './messages'
import { createToolbarState } from './toolbarState'
import type { ToolbarState } from './toolbarState'
import { createOverlays } from './overlays'
import type { Overlays } from './overlays'
import { activeContributionRef, createContributions } from './contributions'
import type { Contributions, PanelContribution } from './contributions'

/** One entry in the panel catalogue passed to {@link createWorkspace}. */
export interface PanelDefinition {
  component: Component
  defaultOptions?: PanelDefaultOptions
}

/** Configuration for {@link createWorkspace}. */
export interface WorkspaceConfig {
  /** The panel catalogue: keys used by `openPanel` and in saved layouts. */
  panels?: Record<string, PanelDefinition>
  /** A layout from a previous `saveLayout()`. `null`/omitted starts from an empty workspace. */
  initialState?: string | null
  /** Reading direction. `'rtl'` mirrors drop zones, tab order and corner anchors. @default 'ltr' */
  dir?: 'ltr' | 'rtl'
  /** Resolves the library's own message descriptors. The whole i18n surface. */
  formatMessage?: MessageFormatter
  /** Override any subset of the built-in UI strings. */
  messages?: Partial<Record<keyof typeof defaultMessages, MessageDescriptor>>
  /** Fraction taken by a panel dropped on a leaf's edge. Clamped to 0.1–0.9. @default 0.5 */
  defaultSplitRatio?: number
  /** Fraction taken by a panel dropped on a workspace edge. Clamped to 0.1–0.9. @default 0.2 */
  defaultEdgeSplitRatio?: number
  /** Base z-index for floating windows and all library chrome, mirrored as `--vdd-z-base`. @default 1000 */
  zIndexBase?: number
  /**
   * Your own classes, added to the library's own chrome.
   *
   * For attaching a styling framework's utilities — Tailwind, MUI, Bootstrap — to elements
   * you otherwise cannot reach, since they are inside the library's markup. The library's
   * own `vdd-` classes stay, so this adds rather than replaces.
   *
   * rdd exposed the same thing through a `useStyleClasses()` hook whose only test was that
   * the hook returned the config; here the gate and a test assert the classes reach the
   * rendered elements, which is the part that can actually break.
   */
  classes?: HostClasses
  /**
   * Veto where users can move panels (1.10.0). Called for each place a dragged panel could go, and
   * for the built-in "Float" and "Maximize" menu items: return `false` and that target isn't offered
   * and the move doesn't happen. It runs after the kind's own `canFloat` / `canDock`, and only for
   * what the user does: the app's own calls always work. Keep it fast and pure; it runs while the
   * pointer moves.
   */
  canDrop?: (drop: PanelDrop) => boolean
  /**
   * Lets panels move into their own browser window, for a second monitor (1.14.0, rdd 7.12.0): a
   * panel type opts in with `defaultOptions.canPopOut`, and the user opens it with "Open in new
   * window" or the app with `workspace.popOutPanel(id)`. Set once, here; it is not kept on
   * `workspace.config`. With `false`, nothing of it runs: no menu item, and `popOutPanel` returns
   * `{ ok: false, reason: 'disabled' }`. @default false
   *
   * @example
   * ```ts
   * const workspace = createWorkspace({
   *   popOut: true,
   *   panels: { chart: { component: ChartPanel, defaultOptions: { canPopOut: true } } },
   * })
   * ```
   */
  popOut?: boolean
}

/**
 * @internal What the pop-out windows registry lends the workspace (1.14.0): the windows
 * themselves live outside the store, because `window.open` must run inside the user's click.
 * Bound with {@link Workspace.bindPopOutWindows}.
 */
export interface PopOutWindowsBinding {
  /** `popOutPanel(id)`, once the workspace has checked `popOut` itself. */
  popOut(id: string): PopOutResult
  /** `returnPanel(id)`. */
  returnPanel(id: string): { ok: boolean }
  /** Brings a panel's window forward, best effort; `false` when it has none. */
  focusWindow(id: string): boolean
}

/** Consumer classes added to the library's chrome. Every field is optional. */
export interface HostClasses {
  /** The modal's window box. */
  modal?: string
  /** The modal's scrolling body. */
  modalBody?: string
  /** A side panel's window box. */
  sidePanel?: string
  /** A side panel's scrolling body. */
  sidePanelBody?: string
  /** A floating window's outer box. */
  window?: string
  /** A floating window's body, which holds the panel. */
  windowBody?: string
}

/** Options for {@link Workspace.openPanel}. */
export interface OpenPanelOptions<P extends object = Record<string, unknown>> {
  /** Override the tab/window title. */
  title?: Label
  /** Where it goes. @default the registry's `initialTarget`, else `'docked'` */
  initialTarget?: 'floating' | 'docked' | 'tabbed'
  /** Corner to pin to, for a floating panel. */
  anchor?: FloatAnchor | null
  /** Make it the active panel. @default true */
  focus?: boolean
  /** Per-instance data handed to the component. Whether it survives `saveLayout()` is a
   *  runtime fact — see {@link PanelInfo.serializable}. */
  props?: P
  /** If another open panel of the same `component` has this key, focus that one instead. */
  dedupeKey?: string
  /**
   * Dock the new panel beside an open, docked panel: in that panel's group (`position: 'center'`,
   * as a tab) or in a new group split off on one side of it. `size` is the new group's share of
   * that split, from 0.1 to 0.9 (the workspace's split ratio when omitted). Wins over
   * `initialTarget`. If `panel` is not docked (not open, floating or minimised), the new panel is
   * placed as usual and a warning says why. Applies only to a newly opened panel. (1.9.0)
   */
  dockTo?: { panel: string; position: DropPosition; size?: number }
}

/** The live workspace state. */
export interface WorkspaceState {
  gridRoot: LayoutNode
  floating: FloatingWindow[]
  minimized: { id: string; title: Label; component: string }[]
  panels: Record<string, PanelInfo>
  /** The panel the user is looking at. Always visible, never minimised. */
  activePanelId: string | null
  /** The panel being dragged, or `null`. */
  draggedPanelId: string | null
  dir: 'ltr' | 'rtl'
  isRtl: boolean
  splitRatio: number
  edgeSplitRatio: number
}

const clampRatio = (n: number | undefined, fallback: number): number =>
  Math.min(0.9, Math.max(0.1, n ?? fallback))

const DEFAULT_RECT = DEFAULT_FLOAT_RECT

/** A workspace instance: reactive state, actions, registry, and a Vue plugin. */
export interface Workspace<TEvents extends object = Record<string, unknown>> {
  /** The whole state, read-only. Reactive — use it in templates and `computed`. */
  readonly state: Readonly<WorkspaceState>
  /** The panel catalogue. */
  readonly registry: PanelRegistry

  // Destructurable reactive views of the state.
  readonly gridRoot: ComputedRef<LayoutNode>
  readonly floating: ComputedRef<FloatingWindow[]>
  readonly minimized: ComputedRef<WorkspaceState['minimized']>
  readonly panels: ComputedRef<Record<string, PanelInfo>>
  readonly activePanelId: ComputedRef<string | null>
  readonly draggedPanelId: ComputedRef<string | null>
  readonly dir: ComputedRef<'ltr' | 'rtl'>
  readonly isRtl: ComputedRef<boolean>

  openPanel<P extends object = Record<string, unknown>>(id: string, component: string, options?: OpenPanelOptions<P>): void
  closePanel(id: string): void
  requestClosePanel(id: string, options?: { force?: boolean; onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }): Promise<void>
  minimizePanel(id: string): void
  restorePanel(id: string, options?: { focus?: boolean }): void
  floatPanel(id: string, rect?: { x: number; y: number; width: number; height: number }, anchor?: FloatAnchor | null): void
  dockPanel(id: string, targetLeafId?: string): void
  dockPanelToGroup(id: string, targetLeafId: string, position: DropPosition): void
  dockPanelToWorkspaceEdge(id: string, position: SplitDirection): void
  /** Toggle a panel between filling the workspace and its previous size. A minimised panel
   *  is restored first — rdd's equivalent silently did nothing (divergence D1). */
  maximizePanel(id: string): void
  /**
   * Makes a panel the active one: a floating window comes to the front, a docked tab is selected.
   * On a panel in its own window (1.14.0, rdd 7.12.0) that window comes forward too, best effort.
   */
  focusPanel(id: string): void
  /**
   * As `focusPanel(id)`; with `restore: true` a minimised panel is restored first (through
   * `restorePanel`, events included), then focused. Without it a minimised panel stays minimised,
   * as before. rdd 7.11.0.
   */
  focusPanel(id: string, options: { restore?: boolean }): void
  /**
   * Brings forward the window that holds a panel, and makes it the active panel (1.14.0, rdd
   * 7.12.0): its pop-out for a panel in its own window (a widget's panel too), the main window for
   * one in the page. Best effort: a browser may keep another window in front. `ok` is false for an
   * id that isn't open.
   * @example
   * ```ts
   * // From a widget in its own window: bring its owner panel's window forward.
   * workspace.focusPanelWindow(useWidget()!.ownerPanelId!)
   * ```
   */
  focusPanelWindow(id: string): { ok: boolean }
  /**
   * Moves a panel into its own browser window (1.14.0, rdd 7.12.0), for a second monitor. Nothing
   * remounts: the panel's state, scroll offsets and a canvas's WebGL context go with it. A docked
   * panel remembers its group and goes back into it on return.
   *
   * Call it inside the user's click or key press: browsers only open a window then. A click in
   * one of the app's pop-out windows counts too. It is synchronous, and says what happened (see
   * {@link PopOutResult}); on a refusal the panel stays where it is and nothing is shown to the
   * user, so the app decides what to say. Calling it for a panel that is already out brings its
   * window forward.
   *
   * Needs `createWorkspace({ popOut: true })` and the panel type's `defaultOptions.canPopOut`.
   * The window opens `<VddDesktop popoutUrl>`, or a blank window. When that page can't be used
   * after all (another origin, or it doesn't load within 10 s), the panel comes back and the
   * window closes, after this has returned `{ ok: true }`.
   *
   * On `{ ok: true }`, `panel:popping-out` was sent during the call, with the panel still in the
   * page; `panel:popped-out` follows once it is laid out in the window, or `panel:returned` when the
   * window fails first.
   *
   * @example
   * ```ts
   * function onPopOut() {
   *   const result = workspace.popOutPanel('chart-1')
   *   if (!result.ok && result.reason === 'blocked') alert('Allow pop-ups for this site.')
   * }
   * ```
   */
  popOutPanel(id: string): PopOutResult
  /**
   * Brings a panel back from its own window (1.14.0, rdd 7.12.0), where it was. A panel that was
   * floating floats at its rect. One that was docked goes, in this order:
   * - into the group of its tab-mates, among their tabs, when one of them is docked;
   * - into its own group, when that group was kept and waits empty;
   * - beside the panels it was next to, on the same side at the same size (the nearest part of its
   *   old layout still docked);
   * - into the grid, when no panel is docked there;
   * - otherwise floating, or into the first group for a type that can't float.
   *
   * Panels out at the same time come back, in any order, to the layout they left. The window
   * closes. Closing the window, or its "Return to desktop" button, does the same. `ok` is false
   * when the panel wasn't in a window.
   */
  returnPanel(id: string): { ok: boolean }
  /**
   * Replaces an open panel's props, or derives them from the current ones (rdd 7.11.0). The panel
   * re-renders with them, `serializable` is re-checked (so the next `saveLayout()` saves or
   * excludes it accordingly), and `layout:changed` is emitted. Nothing for a panel that isn't
   * open, or for a managed widget's own panel, which has no props of its own.
   */
  updatePanelProps(
    id: string,
    props: Record<string, unknown> | ((prev: Record<string, unknown> | undefined) => Record<string, unknown>),
  ): void
  movePanelOrder(panelId: string, targetLeafId: string, targetIndex: number): void
  closeLeafGroup(leafId: string): void
  updateSplitSizes(path: number[], sizes: number[]): void
  updateFloatingPosition(id: string, updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'anchor'>>): void
  setPanelDirty(id: string, dirty: boolean, options?: DirtyStateOptions): void
  updatePanelTitle(id: string, title: Label): void
  /**
   * Sets the icon shown on an open panel's tab, floating title bar and taskbar button, in place
   * of its registration's `defaultOptions.icon`. `null` restores the registration's icon. The
   * icon lives only in memory: `saveLayout()` never writes it, and `loadLayout()` keeps it for a
   * panel that is still open. An unknown id does nothing (1.12.0).
   */
  setPanelIcon(id: string, icon: Component | null): void
  setDirection(dir: 'ltr' | 'rtl'): void
  /** @internal drives drag visuals */
  setDraggedPanelId(id: string | null): void
  /**
   * @internal Opens a hosted panel: one showing a managed widget moved out of its owner panel.
   * Docked beside `dockTo.panel`, or floating exactly at `rect` (not cascaded). Returns `false`,
   * changing nothing, when the id is taken or the panel to dock beside isn't docked.
   */
  openHostedPanel(id: string, owner: PanelOwner, title: Label, at: HostedPanelPlacement): boolean
  /** @internal Removes a hosted panel without its close handler: the widget is going back. */
  removeHostedPanel(id: string): void
  /** @internal Updates a hosted panel's own capabilities (the widget re-opened). */
  setHostedOptions(id: string, options: NonNullable<PanelOwner['options']>): void
  /**
   * @internal `onClose` is called when a hosted panel is closed (×, menu, `closePanel`): the widget
   * closes. `onDrop`, just before a `loadLayout` drops it: the widget is about to go home.
   */
  registerHostedCloseHandler(id: string, onClose: () => void, onDrop?: () => void): () => void
  /**
   * @internal Marks an open panel as shown in its own window (1.14.0): a docked or minimised panel
   * becomes floating first, remembering its group. Returns `false`, changing nothing, when the
   * workspace has no `popOut` or there is no such panel.
   */
  setPoppedOut(id: string): boolean
  /**
   * @internal Clears a panel's pop-out flag (1.14.0). With `restorePlace`, a panel that was docked
   * goes back where it was: its tab-mates' group, its own kept empty group, beside the panels it was
   * next to, the grid when no panel is docked, else floating (or the first group for a type that
   * can't float). See {@link Workspace.returnPanel}.
   */
  clearPoppedOut(id: string, restorePlace: boolean): void
  /**
   * @internal `cb(id)` runs, synchronously, each time a panel stops being popped out in the store:
   * `clearPoppedOut`, an action from code that brings it back first (minimise, dock, a dock to a
   * group or an edge, a tab move), `closePanel`, `loadLayout`. The windows registry closes that
   * panel's window. Returns the function that removes it. (1.14.0)
   */
  onPopOutEnded(cb: (id: string) => void): () => void
  /**
   * @internal The windows registry lends `popOutPanel` / `returnPanel` / `focusPanelWindow` their
   * windows. Returns the function that takes them back. Until one is bound, `popOutPanel` returns
   * `'no-window'`. (1.14.0)
   */
  bindPopOutWindows(windows: PopOutWindowsBinding): () => void
  /** @internal Whether the workspace was created with `popOut: true` (1.14.0); not on `config`. */
  readonly popOutEnabled: boolean
  /**
   * @internal `focusPanel` without bringing a pop-out's window forward (1.14.0): click-to-activate
   * inside that window, which is already in front (rdd's `setActivePanel`).
   */
  activatePanel(id: string): void

  isOpen(id: string): boolean
  getOpenPanelIds(): string[]
  findPanelId(component: string, dedupeKey: string): string | null

  saveLayout(): string
  loadLayout(json: string): boolean

  publish<K extends keyof (TEvents & BuiltInEvents) & string>(event: K, data: (TEvents & BuiltInEvents)[K]): void
  subscribe<K extends keyof (TEvents & BuiltInEvents) & string>(event: K, cb: (data: (TEvents & BuiltInEvents)[K]) => void): () => void

  registerCloseGuard(id: string, guard: () => boolean | Promise<boolean>): () => void
  registerStateProvider(id: string, provider: () => unknown): () => void
  /**
   * Contribute extra items to a panel's own context menu. The getter is read each time the
   * menu opens, so state-driven changes (enabled, checked, present at all) just work.
   */
  registerPanelMenu(id: string, getItems: () => ContextMenuItem[]): () => void
  /** The items a panel has contributed, or an empty list. */
  panelMenuItems(id: string): ContextMenuItem[]

  /**
   * Open a context menu.
   *
   * Callable from anywhere, including outside the component tree — the request is state, and
   * `<VddContextMenu>` renders whatever is pending. rdd needed a provider, an adapter ref and
   * a registration handshake to make this reachable from components on either side of the
   * workspace in the tree.
   */
  showContextMenu(options: ShowContextMenuOptions): void
  /** Dismiss the open menu, if any. */
  closeContextMenu(): void
  /** The pending menu request, or `null`. @internal */
  readonly contextMenu: ComputedRef<ContextMenuRequest | null>

  /**
   * Toolbar selection state, for items that are not controlled by the caller.
   *
   * On the workspace rather than behind its own provider, so `useToolbar()` works anywhere —
   * including from a service. rdd needed a `<ToolbarProvider>` in the tree for this.
   */
  readonly toolbar: ToolbarState

  /**
   * Toolbar items and sidebar sections panels publish while they are active.
   *
   * Read through {@link Workspace.activeContribution}, which is driven by `activePanelId` —
   * and therefore by the invariant that `activePanelId` never names a panel the user cannot
   * see. rdd's could (divergence D2), which made the shell's toolbar show controls belonging
   * to a panel hidden behind another tab.
   */
  readonly contributions: Contributions
  /** What the active panel has published, or `null`. Reactive. */
  readonly activeContribution: ComputedRef<PanelContribution | null>

  /**
   * Side panels and the modal stack.
   *
   * Here for the same reason as `toolbar`: a modal is very often opened from something that
   * is not a component — a save handler, a router guard, an error interceptor. rdd needed a
   * `<PanelProvider>` in the tree, so those callers had to be handed an action object.
   */
  readonly overlays: Overlays

  /** Your own classes for the library's chrome, with every field present. */
  readonly classes: Required<HostClasses>

  /** Resolve a label through the configured formatter. */
  format(label: Label | undefined): string
  /** The merged message table. */
  readonly messages: Record<keyof typeof defaultMessages, MessageDescriptor>
  readonly config: Readonly<Required<Pick<WorkspaceConfig, 'zIndexBase'>> & WorkspaceConfig>

  /** Vue plugin entry point: `app.use(workspace)`. */
  install(app: App): void
  /** Drop every listener and guard. Only needed when workspaces are created dynamically. */
  dispose(): void
}

/** Injection key for {@link useWorkspace}. */
export const WORKSPACE_KEY = Symbol('vdd-workspace') as InjectionKey<Workspace<never>>

/** The type-only mark {@link definePanels} puts on a map. No such value exists at runtime. */
declare const panelsBrand: unique symbol

/** A panel map marked by {@link definePanels}, so `createWorkspace` types `openPanel` from it (1.11.0). */
export type PanelMap<TPanels extends Record<string, PanelDefinition> = Record<string, PanelDefinition>> =
  TPanels & { readonly [panelsBrand]: true }

/** A component's props: from `$props` for a component object, from the first argument for a functional one. */
type PropsOfComponent<C> =
  C extends new (...args: never[]) => { $props: infer P } ? P
    : C extends (props: infer P, ...rest: never[]) => unknown ? P
      : Record<string, unknown>

/**
 * The props `openPanel` passes to a registered panel: its component's props, without `panelId`
 * (the library passes it) or Vue's own attributes (`key`, `ref`, `class`, `style`).
 */
export type PanelPropsOf<TDefinition> = TDefinition extends { component: infer C }
  ? Omit<PropsOfComponent<C>, 'panelId' | keyof VNodeProps | keyof AllowedComponentProps>
  : never

/**
 * Marks a panel map for typing (1.11.0). Returns it unchanged; a workspace created from it gets a
 * typed `openPanel`: only registered names, and `props` checked against that panel's component.
 *
 * @example
 * ```ts
 * const panels = definePanels({ map: { component: MapPanel }, chart: { component: ChartPanel } })
 * const workspace = createWorkspace({ panels })
 * workspace.openPanel('c1', 'chart', { props: { series: 3 } })   // checked against ChartPanel's props
 * ```
 */
export function definePanels<const TPanels extends Record<string, PanelDefinition>>(panels: TPanels): PanelMap<TPanels> {
  return panels as PanelMap<TPanels>
}

/**
 * A workspace created from {@link definePanels}: the same object, with `openPanel` typed from the
 * registry. It goes anywhere a {@link Workspace} goes. `useWorkspace()` stays untyped; keep this
 * one for typed calls.
 */
export interface TypedWorkspace<TPanels extends Record<string, PanelDefinition>, TEvents extends object = Record<string, unknown>>
  extends Workspace<TEvents> {
  /** `openPanel`, typed: a registered name, and that panel's props. */
  openPanel<K extends keyof TPanels & string>(id: string, component: K, options?: OpenPanelOptions<PanelPropsOf<TPanels[K]>>): void
}

/**
 * Create a workspace from a map marked by {@link definePanels} (1.11.0): `openPanel` takes only the
 * registered names, with `props` checked against each panel's component. To name the events as
 * well, pass both type arguments: `createWorkspace<typeof panels, AppEvents>({ panels })`.
 */
export function createWorkspace<TPanels extends Record<string, PanelDefinition>, TEvents extends object = Record<string, unknown>>(
  config: WorkspaceConfig & { panels: PanelMap<TPanels> },
): TypedWorkspace<TPanels, TEvents>
/**
 * Create a workspace.
 *
 * The returned object is both the imperative API and a Vue plugin, matching the
 * `createPinia()` / `createRouter()` shape a Vue developer already knows.
 */
export function createWorkspace<TEvents extends object = Record<string, unknown>>(config?: WorkspaceConfig): Workspace<TEvents>
export function createWorkspace<TEvents extends object = Record<string, unknown>>(
  config: WorkspaceConfig = {},
): Workspace<TEvents> {
  const registry = new PanelRegistry()
  for (const [id, def] of Object.entries(config.panels ?? {})) {
    registry.register(id, def.component, def.defaultOptions)
  }

  const bus = new EventBus<TEvents>()
  const closeGuards = new Map<string, () => boolean | Promise<boolean>>()
  const stateProviders = new Map<string, () => unknown>()
  const panelMenus = new Map<string, () => ContextMenuItem[]>()
  /** Hosted panels' close handlers, by panel id: the widget's overlay registers them. */
  const hostedCloseHandlers = new Map<string, () => void>()
  /** ...and what to call just before a layout load drops one (a load never keeps a hosted panel). */
  const hostedDropHandlers = new Map<string, () => void>()
  /**
   * Bumped whenever a panel registers or withdraws menu items.
   *
   * The map itself is deliberately plain — the *items* are pulled fresh on every open, so
   * nothing about them needs to be reactive. But a `computed` that asks "does this panel
   * contribute anything?" (the window's more-actions button does) has to have something to
   * track, or it caches the answer from before the panel ever registered.
   */
  const panelMenuVersion = ref(0)
  const menu = shallowRef<ContextMenuRequest | null>(null)
  const messages = { ...defaultMessages, ...(config.messages ?? {}) } as Record<keyof typeof defaultMessages, MessageDescriptor>
  const zIndexBase = config.zIndexBase ?? 1000
  let maxZ = zIndexBase

  /**
   * A panel saved without a title — it had a function title, which a layout can't hold — takes
   * its registered default title, as a newly opened one would, or its id.
   */
  function withTitles(parsed: ParsedLayout): ParsedLayout {
    const panels: Record<string, PanelInfo> = {}
    for (const [id, loaded] of Object.entries(parsed.panels)) {
      // A runtime icon is a component, so a layout can't hold one: whatever a hand-made JSON put
      // there is dropped rather than rendered.
      const { icon: _icon, ...info } = loaded
      panels[id] = info.title ? info : { ...info, title: optionsFor(registry, info)?.title || id }
    }
    const minimized = parsed.minimized.map(m => (m.title ? m : { ...m, title: panels[m.id]?.title || m.id }))
    return { ...parsed, panels, minimized }
  }

  const initial = withTitles(parseInitialState(config.initialState, warn))

  const popOutEnabled = config.popOut === true
  if (!popOutEnabled && config.panels) {
    const types = Object.entries(config.panels).filter(([, def]) => def.defaultOptions?.canPopOut).map(([key]) => key)
    if (types.length > 0) {
      warn(
        `Panel type${types.length > 1 ? 's' : ''} ${types.map(t => `"${t}"`).join(', ')} set canPopOut, but ` +
        `this workspace was created without popOut, so no panel can open in its own window. Pass ` +
        `createWorkspace({ popOut: true }) to enable it.`,
      )
    }
  }

  const state = reactive<WorkspaceState>({
    gridRoot: initial.gridRoot,
    floating: initial.floating,
    minimized: initial.minimized,
    panels: initial.panels,
    activePanelId: initial.activePanelId,
    draggedPanelId: null,
    dir: config.dir ?? 'ltr',
    isRtl: config.dir === 'rtl',
    splitRatio: clampRatio(config.defaultSplitRatio, 0.5),
    edgeSplitRatio: clampRatio(config.defaultEdgeSplitRatio, 0.2),
  })

  // Keep maxZ above anything a restored layout already used.
  for (const w of state.floating) maxZ = Math.max(maxZ, w.z)

  function warn(message: string): void {
    if (process.env.NODE_ENV !== 'production') console.warn(`[vue-dockable-desktop] ${message}`)
  }

  const scope = (): ActiveTargetScope => ({
    gridRoot: toRaw(state).gridRoot,
    floating: toRaw(state).floating,
    panels: toRaw(state).panels,
  })

  /**
   * The single place `activePanelId` is decided. **Every** action that changes where a panel
   * lives must end by calling this.
   *
   * react-dockable-desktop resolved it action by action, and accumulated five places that
   * forgot to: a layout restore, a close, a minimise, an un-minimise, and every dock/float
   * (divergence D2). The result was a panel the user could not see being globally active,
   * so contributed toolbar controls acted on the wrong panel while looking functional.
   * Funnelling it through one function is what makes that bug unrepeatable rather than
   * merely fixed.
   *
   * @param prefer a panel that should become active if it is visible — the one just opened,
   *               restored or docked. Omit to keep the current one if still valid.
   */
  function resolveActive(prefer?: string | null): void {
    const previous = state.activePanelId
    let next: string | null

    if (prefer && isVisibleActiveTarget(prefer, scope())) {
      next = prefer
    } else if (state.activePanelId && isVisibleActiveTarget(state.activePanelId, scope())) {
      next = state.activePanelId
    } else {
      next = deriveActivePanelId(scope())
    }

    if (next !== previous) {
      state.activePanelId = next
      bus.emit('panel:activated', { id: next, previous })
    }
  }

  const layoutChanged = () => bus.emit('layout:changed', {})

  /** An open panel's options (its kind's, or a hosted panel's own), or `{}`. */
  const optionsOf = (id: string): PanelDefaultOptions => optionsFor(registry, state.panels[id]) ?? {}

  /** Free a spot for a new floating window, cascading away from anything at the same place. */
  function cascade(
    fav: { x: number | string; y: number | string; width: number | string; height: number | string },
  ): { x: number; y: number; width: number; height: number } {
    const num = (v: number | string, fallback: number) => {
      const n = typeof v === 'string' ? Number.parseFloat(v) : v
      return Number.isNaN(n) ? fallback : n
    }
    let x = num(fav.x, DEFAULT_RECT.x)
    let y = num(fav.y, DEFAULT_RECT.y)
    const width = num(fav.width, DEFAULT_RECT.width)
    const height = num(fav.height, DEFAULT_RECT.height)

    const overlaps = (px: number, py: number) => state.floating.some(w => {
      if (w.maximized) return false
      // A panel in its own window (1.14.0) keeps an entry here that nothing draws: not in the way.
      if (state.panels[w.id]?.poppedOut) return false
      const wx = typeof w.x === 'string' ? Number.parseFloat(w.x) : w.x
      const wy = typeof w.y === 'string' ? Number.parseFloat(w.y) : w.y
      return Math.abs(wx - px) < 20 && Math.abs(wy - py) < 20
    })

    let attempts = 0
    while (overlaps(x, y) && attempts < 10) { x += 30; y += 30; attempts++ }

    // A workspace can be driven with no window at all (a service, a test), so guard both.
    const viewW = Math.max(100, (typeof window !== 'undefined' && window.innerWidth) || 1024)
    const viewH = Math.max(100, (typeof window !== 'undefined' && window.innerHeight) || 768)
    if (x + width > viewW || y + height > viewH) {
      x = 100 + (attempts % 5) * 30
      y = 100 + (attempts % 5) * 30
    }
    return {
      x: Math.max(0, Math.min(x, viewW - 100)),   // keep the title bar reachable
      y: Math.max(0, Math.min(y, viewH - 40)),
      width,
      height,
    }
  }

  function addFloating(id: string, rect: ReturnType<typeof cascade>, anchor: FloatAnchor | null): void {
    maxZ += 1
    state.floating = [...state.floating, { ...rect, id, z: maxZ, anchor }]
  }

  /** Detach a panel from wherever it currently is, without deciding where it goes next. */
  function detach(id: string): void {
    const before = toRaw(state).gridRoot
    // `null` means the tree emptied. When the root was a leaf, keep *that* leaf — emptied —
    // rather than substituting a fresh `group-default`: its id is what a saved layout and any
    // application holding it refer to, and `keepOnEmpty`/`canClose` are its own settings.
    state.gridRoot = removePanelFromTree(before, id)
      ?? (before.type === 'leaf' ? { ...before, panels: [], activePanelId: null } : emptyRoot())
    state.floating = state.floating.filter(w => w.id !== id)
    state.minimized = state.minimized.filter(m => m.id !== id)
  }

  /**
   * Would this placement destroy its own target?
   *
   * Detaching the dragged panel deletes its leaf when it was the only panel there, so a drop
   * onto that same leaf asks for a target that will not exist by the time the placement runs.
   * The result the user asked for is the layout they already have, so the whole action is a
   * no-op. A target that is *already* gone — an id held across a layout change — is refused
   * for the same reason, with a warning, rather than leaving the panel in no group at all.
   */
  function placementIsPointless(panelId: string, targetLeafId: string, action: string): boolean {
    const root = toRaw(state).gridRoot
    if (isLoneOccupant(root, targetLeafId, panelId)) return true
    if (!leafExists(root, targetLeafId)) {
      warn(
        `${action}("${panelId}", "${targetLeafId}") was ignored: no group with that id is in ` +
        `the layout. Emptying a group removes it, so an id kept across a layout change can ` +
        `name a group that no longer exists.`,
      )
      return true
    }
    return false
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function openPanel<P extends object = Record<string, unknown>>(
    id: string, component: string, options?: OpenPanelOptions<P>,
  ): void {
    if (!registry.has(component)) {
      warn(
        `Panel "${id}" references component key "${component}", which is not registered. ` +
        `Add it to createWorkspace({ panels: { "${component}": { component: YourComponent } } }).`,
      )
    }

    // Dedupe redirect first: the caller's id and props are ignored when an equivalent panel
    // is already open, exactly as re-opening an open id focuses it rather than duplicating.
    let resolvedId = id
    if (options?.dedupeKey !== undefined) {
      const match = Object.values(state.panels).find(
        p => p.component === component && p.dedupeKey === options.dedupeKey,
      )
      if (match) resolvedId = match.id
    }

    const existing = state.panels[resolvedId]
    const shouldFocus = options?.focus !== false
    const entry = registry.get(component)
    const target = options?.initialTarget ?? entry?.defaultOptions?.initialTarget ?? 'docked'
    const favourite = entry?.defaultOptions?.favoritePosition ?? DEFAULT_RECT

    if (existing) {
      if (existing.state === 'minimized') {
        // Honour where it came from, like `restorePanel` does. rdd sent it to the *first*
        // leaf instead, so the two paths disagreed (divergence D3).
        restorePanel(resolvedId, { focus: shouldFocus })
        return
      }
      // A docked panel that no leaf holds is open and unreachable: it renders nowhere, and
      // focusing it changes nothing a user can see. Re-opening it is the natural thing to
      // try, so it docks the panel again rather than quietly doing nothing. The guards in the
      // dock actions mean nothing should reach this state; this is the way back if it does.
      if (existing.state === 'docked' && findLeafForPanel(toRaw(state).gridRoot, resolvedId) === null) {
        warn(`Panel "${resolvedId}" was open but in no group; docking it again.`)
        dockPanel(resolvedId)
        if (shouldFocus) activatePanel(resolvedId)
        return
      }
      if (shouldFocus) activatePanel(resolvedId)
      return
    }

    // dockTo beside a docked panel wins over the target (1.9.0).
    const dockTo = options?.dockTo
    const dockLeaf = dockTo ? findLeafForPanel(toRaw(state).gridRoot, dockTo.panel) : null
    if (dockTo && dockLeaf === null) {
      warn(`openPanel("${resolvedId}") could not dock beside "${dockTo.panel}": that panel is not docked ` +
        `(not open, floating or minimised), so the new panel was placed as usual.`)
    }

    const propsProvided = options?.props !== undefined
    const info: PanelInfo = {
      id: resolvedId,
      title: options?.title ?? entry?.defaultOptions?.title ?? resolvedId,
      component,
      state: dockLeaf === null && target === 'floating' ? 'floating' : 'docked',
      serializable: propsProvided ? isSerializable(toRaw(options!.props)) : true,
      ...(propsProvided ? { props: markRaw(options!.props as Record<string, unknown>) } : {}),
      ...(options?.dedupeKey !== undefined ? { dedupeKey: options.dedupeKey } : {}),
    }
    state.panels = { ...state.panels, [resolvedId]: info }

    if (dockTo && dockLeaf !== null) {
      const share = Math.min(0.9, Math.max(0.1, dockTo.size ?? state.splitRatio))
      state.gridRoot = dockTo.position === 'center'
        ? addPanelToLeaf(toRaw(state).gridRoot, dockLeaf, resolvedId, { select: shouldFocus })
        : splitLeafInTree(toRaw(state).gridRoot, dockLeaf, resolvedId, dockTo.position, share)
    } else if (target === 'floating') {
      addFloating(resolvedId, cascade(favourite), options?.anchor ?? entry?.defaultOptions?.defaultAnchor ?? null)
    } else {
      const leaf = findFirstLeafId(toRaw(state).gridRoot) ?? emptyRoot().id
      state.gridRoot = addPanelToLeaf(toRaw(state).gridRoot, leaf, resolvedId, { select: shouldFocus })
    }

    resolveActive(shouldFocus ? resolvedId : null)
    bus.emit('panel:opened', { id: resolvedId, component })
    layoutChanged()
  }

  function closePanel(id: string): void {
    const panel = state.panels[id]
    if (!panel) return
    if (optionsOf(id).canClose === false) return

    closeGuards.delete(id)
    stateProviders.delete(id)
    detach(id)
    const next = { ...state.panels }
    delete next[id]
    state.panels = next

    resolveActive()
    bus.emit('panel:closed', { id })
    layoutChanged()
    if (panel.poppedOut) forgetPopOut(id)
    // A hosted panel closed from the page (×, menu, the app's closePanel): its widget closes too.
    // A hosted panel can always close. The handler belongs to the widget's overlay.
    if (panel.owner) hostedCloseHandlers.get(id)?.()
  }

  // ── Hosted panels: a managed widget moved out of its owner panel (rdd 7.11.0) ──
  // They exist only at runtime: saveLayout skips them and loadLayout never creates one.

  function openHostedPanel(id: string, owner: PanelOwner, title: Label, at: HostedPanelPlacement): boolean {
    if (id in state.panels) return false
    const leaf = at.kind === 'dock' ? findLeafForPanel(toRaw(state).gridRoot, at.dockTo.panel) : null
    if (at.kind === 'dock' && leaf === null) return false

    const info: PanelInfo = {
      id, title, component: HOSTED_COMPONENT, state: at.kind === 'dock' ? 'docked' : 'floating',
      serializable: false, owner,
    }
    state.panels = { ...state.panels, [id]: info }
    if (at.kind === 'float') {
      addFloating(id, { ...at.rect }, null)          // exactly where asked: never cascaded
    } else {
      const share = Math.min(0.9, Math.max(0.1, at.dockTo.size ?? state.splitRatio))
      state.gridRoot = at.dockTo.position === 'center'
        ? addPanelToLeaf(toRaw(state).gridRoot, leaf!, id)
        : splitLeafInTree(toRaw(state).gridRoot, leaf!, id, at.dockTo.position, share)
    }

    resolveActive(id)
    bus.emit('panel:opened', { id, component: HOSTED_COMPONENT })
    layoutChanged()
    return true
  }

  function removeHostedPanel(id: string): void {
    const panel = state.panels[id]
    if (!panel?.owner) return
    detach(id)
    const next = { ...state.panels }
    delete next[id]
    state.panels = next

    resolveActive()
    bus.emit('panel:closed', { id })
    layoutChanged()
    if (panel.poppedOut) forgetPopOut(id)
  }

  function setHostedOptions(id: string, options: NonNullable<PanelOwner['options']>): void {
    const panel = state.panels[id]
    if (!panel?.owner) return
    const was = panel.owner.options
    if (was?.canFloat === options.canFloat && was?.canDock === options.canDock) return
    state.panels = { ...state.panels, [id]: { ...panel, owner: { ...panel.owner, options } } }
  }

  function registerHostedCloseHandler(id: string, onClose: () => void, onDrop?: () => void): () => void {
    hostedCloseHandlers.set(id, onClose)
    if (onDrop) hostedDropHandlers.set(id, onDrop)
    return () => {
      if (hostedCloseHandlers.get(id) === onClose) hostedCloseHandlers.delete(id)
      if (onDrop && hostedDropHandlers.get(id) === onDrop) hostedDropHandlers.delete(id)
    }
  }

  async function requestClosePanel(
    id: string,
    options?: { force?: boolean; onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> },
  ): Promise<void> {
    if (options?.force) { closePanel(id); return }

    const guard = closeGuards.get(id)
    if (guard && !(await guard())) return

    const panel = state.panels[id]
    if (panel?.dirty) {
      // The built-in question is the default, so no call site has to know about it — a tab's
      // ×, a window's ×, a taskbar menu and `usePanel().close()` all get it for free. rdd
      // wired this separately into each container and never wired it into the docked path at
      // all, so closing a dirty tab discarded the edits without asking.
      const confirm = options?.onConfirm
        ?? ((dirtyOptions?: DirtyStateOptions) =>
          overlays.confirmDiscard({ title: format(panel.title), dirtyOptions }))
      if (!(await confirm(panel.dirtyOptions))) return
    }
    closePanel(id)
  }

  function minimizePanel(id: string): void {
    // Minimised from its window: it remembers its group, not the hidden floating entry.
    endPopOut(id)
    const panel = state.panels[id]
    if (!panel || panel.state === 'minimized') return
    if (optionsOf(id).canMinimize === false) return

    let lastFloatingRect: PanelInfo['lastFloatingRect']
    let lastLeafId: string | undefined

    if (panel.state === 'floating') {
      const win = state.floating.find(w => w.id === id)
      if (win) {
        lastFloatingRect = {
          x: Number(win.x), y: Number(win.y),
          width: Number(win.width), height: Number(win.height),
          anchor: win.anchor ?? null,
        }
      }
    } else {
      lastLeafId = findLeafForPanel(toRaw(state).gridRoot, id) ?? undefined
    }

    detach(id)
    state.panels = {
      ...state.panels,
      [id]: { ...panel, state: 'minimized', previousState: panel.state, lastFloatingRect, lastLeafId },
    }
    state.minimized = [...state.minimized, { id, title: panel.title, component: panel.component }]

    resolveActive()
    bus.emit('panel:minimized', { id })
    layoutChanged()
  }

  function restorePanel(id: string, options?: { focus?: boolean }): void {
    const panel = state.panels[id]
    if (!panel || panel.state !== 'minimized') return
    const shouldFocus = options?.focus !== false

    state.minimized = state.minimized.filter(m => m.id !== id)
    const previous = panel.previousState ?? 'docked'
    const favourite = panel.lastFloatingRect ?? optionsOf(id).favoritePosition ?? DEFAULT_RECT

    const toFloating = () => {
      state.panels = { ...state.panels, [id]: { ...panel, state: 'floating' } }
      addFloating(id, cascade(favourite), panel.lastFloatingRect?.anchor ?? null)
    }
    const toLeaf = (leafId: string) => {
      state.panels = { ...state.panels, [id]: { ...panel, state: 'docked' } }
      state.gridRoot = addPanelToLeaf(toRaw(state).gridRoot, leafId, id, { select: shouldFocus })
    }

    if (previous === 'floating') {
      toFloating()
    } else if (panel.lastLeafId && leafExists(toRaw(state).gridRoot, panel.lastLeafId)) {
      toLeaf(panel.lastLeafId)
    } else if (optionsOf(id).canDrag !== false) {
      toFloating()                              // its leaf is gone; float it if it may float
    } else {
      toLeaf(findFirstLeafId(toRaw(state).gridRoot) ?? emptyRoot().id)
    }

    resolveActive(shouldFocus ? id : null)
    bus.emit('panel:restored', { id })
    layoutChanged()
  }

  function floatPanel(
    id: string,
    rect?: { x: number; y: number; width: number; height: number },
    anchor?: FloatAnchor | null,
  ): void {
    const panel = state.panels[id]
    if (!panel) return
    // A panel in its own window (1.14.0) has no window here to place: ignored until it returns.
    if (panel.poppedOut) return
    if (optionsOf(id).canDrag === false) return

    const favourite = rect ?? optionsOf(id).favoritePosition ?? DEFAULT_RECT
    detach(id)
    state.panels = { ...state.panels, [id]: { ...panel, state: 'floating' } }
    addFloating(id, cascade(favourite), anchor ?? null)

    resolveActive(id)
    layoutChanged()
  }

  function dockPanel(id: string, targetLeafId?: string): void {
    endPopOut(id)
    const panel = state.panels[id]
    if (!panel) return
    detach(id)
    // `lastLeafId` can name a leaf that has since been removed — emptying a leaf deletes it.
    // Docking into a leaf that does not exist silently puts the panel nowhere: it stays in
    // `panels`, so it is "open", but no slot ever shows it. Caught by the M4 browser gate.
    const remembered = panel.lastLeafId && leafExists(toRaw(state).gridRoot, panel.lastLeafId)
      ? panel.lastLeafId
      : undefined
    const leafId = targetLeafId ?? remembered ?? findFirstLeafId(toRaw(state).gridRoot) ?? emptyRoot().id
    state.panels = { ...state.panels, [id]: { ...panel, state: 'docked' } }
    state.gridRoot = addPanelToLeaf(toRaw(state).gridRoot, leafId, id)

    resolveActive(id)
    layoutChanged()
  }

  function dockPanelToGroup(id: string, targetLeafId: string, position: DropPosition): void {
    endPopOut(id)
    const panel = state.panels[id]
    if (!panel) return
    if (placementIsPointless(id, targetLeafId, 'dockPanelToGroup')) return
    detach(id)
    state.panels = { ...state.panels, [id]: { ...panel, state: 'docked' } }
    state.gridRoot = position === 'center'
      ? addPanelToLeaf(toRaw(state).gridRoot, targetLeafId, id)
      : splitLeafInTree(toRaw(state).gridRoot, targetLeafId, id, position, state.splitRatio)
    state.draggedPanelId = null

    resolveActive(id)
    layoutChanged()
  }

  function dockPanelToWorkspaceEdge(id: string, position: SplitDirection): void {
    endPopOut(id)
    const panel = state.panels[id]
    if (!panel) return
    // The only docked panel already fills the workspace, so docking it to an edge asks for the
    // layout it has. Acting on it left an empty group beside it, holding half the width.
    if (removePanelFromTree(toRaw(state).gridRoot, id) === null) return
    detach(id)
    state.panels = { ...state.panels, [id]: { ...panel, state: 'docked' } }
    state.gridRoot = dockToEdge(toRaw(state).gridRoot, id, position, state.edgeSplitRatio)
    state.draggedPanelId = null

    resolveActive(id)
    layoutChanged()
  }

  function movePanelOrder(panelId: string, targetLeafId: string, targetIndex: number): void {
    const panel = state.panels[panelId]
    if (!panel) return
    if (placementIsPointless(panelId, targetLeafId, 'movePanelOrder')) return
    // Out of its window and into the group, as rdd's windows registry ends it: no stop on the way.
    if (panel.poppedOut) clearPoppedOut(panelId, false)
    const cleaned = removePanelFromTree(toRaw(state).gridRoot, panelId) ?? emptyRoot()
    state.floating = state.floating.filter(w => w.id !== panelId)
    state.minimized = state.minimized.filter(m => m.id !== panelId)
    state.panels = { ...state.panels, [panelId]: { ...state.panels[panelId]!, state: 'docked' } }
    state.gridRoot = insertPanelInLeaf(cleaned, targetLeafId, panelId, targetIndex)
    state.draggedPanelId = null

    resolveActive(panelId)
    layoutChanged()
  }

  function maximizePanel(id: string): void {
    // Nor one to maximise (1.14.0).
    if (state.panels[id]?.poppedOut) return
    // A minimised panel is not in `floating`, so rdd's version silently did nothing here —
    // its taskbar context menu offered a "Maximize" item that never worked (divergence D1).
    if (state.panels[id]?.state === 'minimized') restorePanel(id)

    const panel = state.panels[id]
    if (!panel) return
    if (panel.state === 'docked') floatPanel(id)

    state.floating = state.floating.map(w => (w.id === id ? { ...w, maximized: !w.maximized } : w))
    resolveActive(id)
    layoutChanged()
  }

  function focusPanel(id: string, options?: { restore?: boolean }): void {
    activatePanel(id, options)
    // In its own window (1.14.0, rdd 7.12.0): that window comes forward too, best effort.
    if (state.panels[id]?.poppedOut) popOutWindows?.focusWindow(id)
  }

  function activatePanel(id: string, options?: { restore?: boolean }): void {
    // Restoring brings it back and focuses it, with restorePanel's events (rdd 7.11.0).
    if (options?.restore && state.panels[id]?.state === 'minimized') {
      restorePanel(id)
      return
    }
    const panel = state.panels[id]
    if (!panel) return

    if (panel.state === 'floating') {
      const win = state.floating.find(w => w.id === id)
      if (win) {
        const alreadyTop = !state.floating.some(w => w.z > win.z)
        if (!alreadyTop) {
          maxZ += 1
          const z = maxZ
          state.floating = state.floating.map(w => (w.id === id ? { ...w, z } : w))
        }
      }
    } else if (panel.state === 'docked') {
      state.gridRoot = selectPanelInTree(toRaw(state).gridRoot, id)
    }

    // An explicit focus on a minimised panel is honoured as a deliberate caller decision,
    // matching rdd. `resolveActive` would refuse it, so set it directly.
    if (panel.state === 'minimized') {
      const previous = state.activePanelId
      if (previous !== id) {
        state.activePanelId = id
        bus.emit('panel:activated', { id, previous })
      }
      return
    }
    resolveActive(id)
  }

  function closeLeafGroup(leafId: string): void {
    state.gridRoot = removeLeafFromTree(toRaw(state).gridRoot, leafId) ?? emptyRoot()
    resolveActive()
    layoutChanged()
  }

  function updateSplitSizes(path: number[], sizes: number[]): void {
    state.gridRoot = updateSizesAtPath(toRaw(state).gridRoot, path, sizes)
    layoutChanged()
  }

  function updateFloatingPosition(
    id: string,
    updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'anchor'>>,
  ): void {
    state.floating = state.floating.map(w => (w.id === id ? { ...w, ...updates } : w))
  }

  function setPanelDirty(id: string, dirty: boolean, options?: DirtyStateOptions): void {
    const panel = state.panels[id]
    if (!panel) return
    state.panels = { ...state.panels, [id]: { ...panel, dirty, dirtyOptions: options } }
  }

  function updatePanelTitle(id: string, title: Label): void {
    const panel = state.panels[id]
    if (!panel) return
    state.panels = { ...state.panels, [id]: { ...panel, title } }
    const idx = state.minimized.findIndex(m => m.id === id)
    if (idx !== -1) {
      state.minimized = state.minimized.map(m => (m.id === id ? { ...m, title } : m))
    }
  }

  function updatePanelProps(
    id: string,
    props: Record<string, unknown> | ((prev: Record<string, unknown> | undefined) => Record<string, unknown>),
  ): void {
    const panel = state.panels[id]
    if (!panel || panel.owner) return   // a hosted panel has no props of its own
    const next = typeof props === 'function' ? props(panel.props) : props
    state.panels = {
      ...state.panels,
      [id]: { ...panel, props: markRaw(next), serializable: isSerializable(toRaw(next)) },
    }
    layoutChanged()
  }

  function setPanelIcon(id: string, icon: Component | null): void {
    const panel = state.panels[id]
    if (!panel) return
    const next = icon ? markRaw(icon) : undefined
    if (panel.icon === next) return
    const { icon: _old, ...rest } = panel
    state.panels = { ...state.panels, [id]: next ? { ...rest, icon: next } : rest }
  }

  function setDirection(dir: 'ltr' | 'rtl'): void {
    if (state.dir === dir) return
    state.dir = dir
    state.isRtl = dir === 'rtl'
  }

  // ── Pop-out windows (1.14.0, rdd 7.12.0): a panel shown in its own browser window ──
  // A popped-out panel is a floating panel with a flag; the workspace draws no frame for it, and
  // the window itself belongs to the windows registry bound with `bindPopOutWindows`. Everything
  // below that works out a place does it on a copy (`Snapshot`), as rdd's reducers do, and the
  // result is written to the live state in one go.

  /** The layout part of the state, as plain values: what a return place is worked out on. */
  type Snapshot = Pick<WorkspaceState, 'gridRoot' | 'floating' | 'minimized' | 'panels' | 'activePanelId'>
  const snapshot = (): Snapshot => {
    const raw = toRaw(state)
    return { gridRoot: raw.gridRoot, floating: raw.floating, minimized: raw.minimized, panels: raw.panels, activePanelId: raw.activePanelId }
  }

  /**
   * Where a popped-out panel was beside its neighbour in the grid, for a panel alone in its group:
   * that group goes when the panel leaves, so `lastLeafId` alone can't bring it back. Runtime only.
   */
  const popOutOrigins = new Map<string, { places: PlaceBeside[]; mates: string[]; seq: number }>()
  /** Counts pop-outs, so returns can be replayed last out first. */
  let popOutSeq = 0
  /** Numbers the groups a return creates. */
  let popOutLeafSeq = 0
  const popOutEndListeners = new Set<(id: string) => void>()
  let popOutWindows: PopOutWindowsBinding | null = null
  let warnedPopOutDisabled = false

  /** The panel is no longer popped out in the store: its record goes, and the windows hear of it. */
  function forgetPopOut(id: string): void {
    popOutOrigins.delete(id)
    for (const cb of [...popOutEndListeners]) cb(id)
  }

  /** `s` with `id` restored from the taskbar, on the copy only (its floating list is not used). */
  function restoredCopy(s: Snapshot, id: string): Snapshot {
    const panel = s.panels[id]
    if (!panel || panel.state !== 'minimized') return s
    const minimized = s.minimized.filter(m => m.id !== id)
    const toLeaf = (leafId: string): Snapshot => ({
      ...s, minimized,
      gridRoot: addPanelToLeaf(s.gridRoot, leafId, id),
      panels: { ...s.panels, [id]: { ...panel, state: 'docked' } },
    })
    const toFloating = (): Snapshot => ({ ...s, minimized, panels: { ...s.panels, [id]: { ...panel, state: 'floating' } } })
    if ((panel.previousState ?? 'docked') === 'floating') return toFloating()
    if (panel.lastLeafId && leafExists(s.gridRoot, panel.lastLeafId)) return toLeaf(panel.lastLeafId)
    if (optionsFor(registry, panel)?.canDrag !== false) return toFloating()
    return toLeaf(findFirstLeafId(s.gridRoot) ?? emptyRoot().id)
  }

  /** `s` with `id` docked into the first group (rdd's `applyDock` with no target). */
  function dockedCopy(s: Snapshot, id: string, activate: boolean): Snapshot {
    const panel = s.panels[id]
    if (!panel) return s
    const cleanRoot = removePanelFromTree(s.gridRoot, id) ?? emptyRoot()
    const leafId = findFirstLeafId(cleanRoot) ?? emptyRoot().id
    const next: Snapshot = {
      ...s,
      gridRoot: addPanelToLeaf(cleanRoot, leafId, id),
      floating: s.floating.filter(w => w.id !== id),
      panels: { ...s.panels, [id]: { ...panel, state: 'docked' } },
    }
    return { ...next, activePanelId: resolveActivePanelId(next, activate ? id : null) }
  }

  /**
   * `s` with every popped-out panel at its return place, the last one out first: the layout from
   * before they left. Pure; the live state is untouched.
   */
  function withReturnPlaces(s: Snapshot): Snapshot {
    const out = Object.values(s.panels).filter(p => p.poppedOut)
      .sort((x, y) => (popOutOrigins.get(y.id)?.seq ?? 0) - (popOutOrigins.get(x.id)?.seq ?? 0))
    return out.reduce((acc, p) => returnPlace(acc, p.id, false), s)
  }

  const hasDockedPanel = (n: LayoutNode): boolean => (n.type === 'leaf' ? n.panels.length > 0 : n.children.some(hasDockedPanel))
  const leavesOf = (n: LayoutNode): LayoutLeafNode[] => (n.type === 'leaf' ? [n] : n.children.flatMap(leavesOf))

  /**
   * Where a popped-out panel goes back, as a state: the flag cleared, and a panel that was docked
   * into its tab-mates' group; else its own group while it waits empty (kept); else beside the
   * panels it was next to, on the same side at the same share; else into the grid when no panel is
   * docked; else floating where it is, or into the first group when its type can't float. A panel
   * that was floating stays at its rect. Pure: the return and `saveLayout()` both use it, so a saved
   * layout is the one the panel would come back to.
   */
  function returnPlace(s: Snapshot, id: string, activate: boolean): Snapshot {
    const p = s.panels[id]
    if (!p?.poppedOut) return s
    const { poppedOut: _flag, ...panel } = p
    const cleared: Snapshot = { ...s, panels: { ...s.panels, [id]: panel } }
    if (panel.state !== 'floating' || panel.previousState !== 'docked') return cleared
    const origin = popOutOrigins.get(id)
    const docked = (gridRoot: LayoutNode): Snapshot => {
      const next: Snapshot = {
        ...cleared,
        gridRoot,
        floating: cleared.floating.filter(w => w.id !== id),
        panels: { ...cleared.panels, [id]: { ...panel, state: 'docked' } },
      }
      return { ...next, activePanelId: resolveActivePanelId(next, activate ? id : null) }
    }
    const mates = origin?.mates ?? [id]
    // Its group is where its group-mates are: the group of the nearest one docked, among their tabs.
    const k = mates.indexOf(id)
    const byDistance = mates.filter(m => m !== id).sort((x, y) => Math.abs(mates.indexOf(x) - k) - Math.abs(mates.indexOf(y) - k))
    for (const mate of byDistance) {
      const group = groupOf(cleared.gridRoot, mate)
      if (group) return docked(insertPanelAmongMates(cleared.gridRoot, group.id, id, mates, activate))
    }
    // With none docked, its old group counts only while it is empty (a kept group): a group with that
    // id holding other panels is a new one (the empty grid's id is reused).
    const own = panel.lastLeafId ? findLeaf(cleared.gridRoot, panel.lastLeafId) : null
    if (own && own.panels.length === 0) return docked(insertPanelAmongMates(cleared.gridRoot, own.id, id, mates, activate))
    // Beside the nearest part of its old layout still docked (innermost split first).
    // Unique: several returns can run in one millisecond (a save puts every panel back on a copy).
    const leafId = `group-popout-${Date.now()}-${++popOutLeafSeq}`
    // Panels still out don't count against a split's old sizes: they are on their way back. One
    // whose own group was kept and waits empty is there, in its group's place (it stands in).
    const outPanels = Object.values(cleared.panels).filter(q => q.poppedOut)
    const out = new Set(outPanels.map(q => q.id))
    const standIn = new Map<string, string>()
    for (const q of outPanels) {
      const kept = q.previousState === 'docked' && q.lastLeafId ? findLeaf(cleared.gridRoot, q.lastLeafId) : null
      if (kept && kept.panels.length === 0) standIn.set(q.id, kept.id)
    }
    for (const place of origin?.places ?? []) {
      const gridRoot = returnBeside(cleared.gridRoot, id, place, leafId, out, standIn)
      if (gridRoot) return docked(gridRoot)
    }
    // Nothing of its old layout is docked and no panel is in the grid (they are all out, or it was
    // the whole grid; kept-empty groups may remain): into its first group that waits for no other
    // panel. The next one back finds it.
    const waiting = new Set(standIn.values())
    const first = leavesOf(cleared.gridRoot).find(l => !waiting.has(l.id))
    if (origin && first && !hasDockedPanel(cleared.gridRoot)) {
      return docked(insertPanelAmongMates(cleared.gridRoot, first.id, id, mates, activate))
    }
    const options = optionsFor(registry, panel)
    if (options?.canDrag === false || options?.canFloat === false) return dockedCopy(cleared, id, activate)
    return cleared
  }

  /**
   * Writes a copy worked out above to the live state. The copy's active panel is only a
   * preference: `resolveActive`, the one resolution point (D2), decides on the live state and
   * sends `panel:activated` when that changed.
   */
  function applySnapshot(next: Snapshot): void {
    const raw = toRaw(state)
    if (next.gridRoot !== raw.gridRoot) state.gridRoot = next.gridRoot
    if (next.floating !== raw.floating) state.floating = next.floating
    if (next.minimized !== raw.minimized) state.minimized = next.minimized
    if (next.panels !== raw.panels) state.panels = next.panels
    resolveActive(next.activePanelId)
  }

  function setPoppedOut(id: string): boolean {
    if (!popOutEnabled || !(id in state.panels)) return false
    const was = state.panels[id]!
    if (was.poppedOut && was.state === 'floating') return true
    const prev = snapshot()
    // Where it is in its layout: worked out on a copy with the panels already out put back. A
    // minimised panel is restored on that copy only, never into the live grid, whose groups may
    // be waiting for those panels.
    const base = withReturnPlaces(prev)
    const whole = was.state === 'minimized' ? restoredCopy(base, id) : base
    if (whole.panels[id]?.state === 'docked') {
      // Remembered as minimising does, so returning puts it back in its group.
      const lastLeafId = findLeafForPanel(whole.gridRoot, id) ?? undefined
      // Its group-mates and neighbours, and those of every panel already out, from that copy:
      // whoever comes back first finds the others where they belong.
      const record = (q: string, seq: number) => popOutOrigins.set(q, {
        places: placesBeside(whole.gridRoot, q), mates: [...(groupOf(whole.gridRoot, q)?.panels ?? [q])], seq,
      })
      for (const q of Object.values(prev.panels)) {
        const o = popOutOrigins.get(q.id)
        if (q.poppedOut && q.previousState === 'docked' && o && findLeafForPanel(whole.gridRoot, q.id)) record(q.id, o.seq)
      }
      record(id, ++popOutSeq)
      const rect = cascade(optionsOf(id).favoritePosition ?? DEFAULT_RECT)
      detach(id)
      state.panels = { ...state.panels, [id]: { ...was, state: 'floating', previousState: 'docked', lastLeafId, poppedOut: true } }
      addFloating(id, rect, null)
    } else {
      // A floating one (a minimised floating one comes back first, where it was).
      if (was.state === 'minimized') {
        state.minimized = state.minimized.filter(m => m.id !== id)
        addFloating(id, cascade(was.lastFloatingRect ?? optionsOf(id).favoritePosition ?? DEFAULT_RECT), was.lastFloatingRect?.anchor ?? null)
      }
      popOutOrigins.set(id, { places: [], mates: [id], seq: ++popOutSeq })
      state.panels = {
        ...state.panels,
        [id]: { ...was, state: 'floating', previousState: 'floating', lastLeafId: undefined, poppedOut: true },
      }
    }
    resolveActive(id)
    layoutChanged()
    return true
  }

  function clearPoppedOut(id: string, restorePlace: boolean): void {
    const panel = state.panels[id]
    if (!panel?.poppedOut) { popOutOrigins.delete(id); return }
    let moved = false
    if (restorePlace) {
      const next = returnPlace(snapshot(), id, true)
      moved = next.panels[id]?.state !== panel.state
      applySnapshot(next)
    } else {
      const { poppedOut: _flag, ...rest } = panel
      state.panels = { ...state.panels, [id]: rest }
    }
    forgetPopOut(id)
    if (moved) layoutChanged()
  }

  /** An action that moves a popped-out panel from code brings it back where it was first. */
  function endPopOut(id: string): void {
    if (state.panels[id]?.poppedOut) clearPoppedOut(id, true)
  }

  function popOutPanel(id: string): PopOutResult {
    if (!popOutEnabled) {
      if (!warnedPopOutDisabled) {
        warnedPopOutDisabled = true
        warn(`popOutPanel("${id}") was refused: this workspace was created without popOut. Pass ` +
          `createWorkspace({ popOut: true }) to let panels open in their own window.`)
      }
      return { ok: false, reason: 'disabled' }
    }
    // No windows registry bound (no <VddDesktop> to show it): nothing would show the panel there.
    return popOutWindows ? popOutWindows.popOut(id) : { ok: false, reason: 'no-window' }
  }

  function returnPanel(id: string): { ok: boolean } {
    if (popOutWindows) return popOutWindows.returnPanel(id)
    if (!state.panels[id]?.poppedOut) return { ok: false }
    clearPoppedOut(id, true)
    return { ok: true }
  }

  function focusPanelWindow(id: string): { ok: boolean } {
    const panel = state.panels[id]
    if (!panel) return { ok: false }
    activatePanel(id)
    if (!(panel.poppedOut && popOutWindows?.focusWindow(id)) && typeof window !== 'undefined') {
      try { window.focus() } catch { /* best effort */ }
    }
    return { ok: true }
  }

  function onPopOutEnded(cb: (id: string) => void): () => void {
    popOutEndListeners.add(cb)
    return () => { popOutEndListeners.delete(cb) }
  }

  function bindPopOutWindows(windows: PopOutWindowsBinding): () => void {
    popOutWindows = windows
    return () => { if (popOutWindows === windows) popOutWindows = null }
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  function saveLayout(): string {
    // A panel in its own window is saved where it would come back to (1.14.0): the layout is the
    // one it would have had, had it never left. The live state is not touched.
    const raw = withReturnPlaces(snapshot())
    const excluded: string[] = []
    // Hosted panels are never saved and never reported as excluded: the owner panel saves its
    // widgets itself.
    const hosted: string[] = []
    const included: Record<string, PanelInfo> = {}

    // A registered provider is pulled fresh on every save: a panel's serialisability can
    // change over its lifetime, so it is never cached from open time for provider-backed panels.
    for (const [id, info] of Object.entries(raw.panels)) {
      if (info.owner || info.component === HOSTED_COMPONENT) { hosted.push(id); continue }
      const provider = stateProviders.get(id)
      const dynamic = provider?.()
      const hasDynamic = provider !== undefined && dynamic !== undefined
      const props = hasDynamic ? (dynamic as Record<string, unknown>) : info.props
      const ok = hasDynamic ? isSerializable(toRaw(dynamic)) : info.serializable
      // A function title (1.5.0) can't be saved; the restored panel takes its registered default.
      // The runtime icon (1.12.0) is a component: never part of a saved layout.
      const { icon: _icon, ...noIcon } = info
      const saved = typeof noIcon.title === 'function' ? (({ title: _t, ...rest }) => rest)(noIcon) as PanelInfo : noIcon
      if (ok) included[id] = hasDynamic ? { ...saved, props, serializable: true } : saved
      else excluded.push(id)
    }

    // Excluded panels are pruned from the snapshot's tree/floating/minimized too, so a
    // restore never references a panel it has no data to recreate. None of this touches the
    // live state: an excluded panel keeps working on screen.
    let gridRoot: LayoutNode = raw.gridRoot
    let floating = raw.floating
    let minimized = raw.minimized
    for (const id of [...excluded, ...hosted]) {
      gridRoot = removePanelFromTree(gridRoot, id) ?? emptyRoot()
      floating = floating.filter(w => w.id !== id)
      minimized = minimized.filter(m => m.id !== id)
    }

    if (excluded.length) {
      bus.emit('layout:panels-excluded', {
        panels: excluded.map(id => ({ id, component: raw.panels[id]!.component })),
      })
    }

    // Validated against the *pruned* snapshot: if the active panel was itself excluded, the
    // field is omitted rather than naming a panel this payload does not contain.
    const live = raw.activePanelId
    const activePanelId = live !== null && isVisibleActiveTarget(live, { gridRoot, floating, panels: included })
      ? live
      : null

    const payload: SerializedLayout = {
      version: LAYOUT_VERSION,
      ...(activePanelId !== null ? { activePanelId } : {}),
      gridRoot,
      floating,
      minimized: minimized.map(m => (typeof m.title === 'function' ? { id: m.id, component: m.component } : m)) as SerializedLayout['minimized'],
      panels: included,
    }
    return JSON.stringify(payload)
  }

  function loadLayout(json: string): boolean {
    let payload: unknown
    try {
      payload = JSON.parse(json)
    } catch {
      warn('loadLayout received invalid JSON; the current layout is unchanged.')
      return false
    }
    // Straight to the validator: `parseInitialState` falls back to an *empty* workspace, which
    // is right for a first start and wrong here — applying it would close every panel.
    const valid = parseLayoutPayload(payload, warn)
    const parsed = valid && withTitles(withoutHostedPanels(valid))
    if (!parsed) {
      warn('loadLayout received something that is not a layout (it needs gridRoot, floating, ' +
        'minimized and panels); the current layout is unchanged.')
      return false
    }
    // A panel that stays open keeps its runtime icon: the component that set it isn't
    // re-mounted, so it wouldn't set it again.
    const panels: Record<string, PanelInfo> = {}
    for (const [id, info] of Object.entries(parsed.panels)) {
      const was = state.panels[id]
      panels[id] = was?.icon && was.component === info.component ? { ...info, icon: was.icon } : info
    }
    // The live hosted panels are about to go: tell their owners first, while their content is
    // still in place.
    for (const [id, panel] of Object.entries(state.panels)) {
      if (panel.owner) hostedDropHandlers.get(id)?.()
    }
    // No panel of a loaded layout is in a window: each one out now loses its window.
    const wereOut = Object.values(state.panels).filter(p => p.poppedOut).map(p => p.id)
    state.gridRoot = parsed.gridRoot
    state.floating = parsed.floating
    state.minimized = parsed.minimized
    state.panels = panels
    state.draggedPanelId = null
    maxZ = Math.max(zIndexBase, ...parsed.floating.map(w => w.z), 0)

    const previous = state.activePanelId
    state.activePanelId = parsed.activePanelId
    if (previous !== parsed.activePanelId) {
      bus.emit('panel:activated', { id: parsed.activePanelId, previous })
    }
    popOutOrigins.clear()
    for (const id of wereOut) forgetPopOut(id)
    layoutChanged()
    return true
  }

  // ── Registrations ──────────────────────────────────────────────────────────

  function registerCloseGuard(id: string, guard: () => boolean | Promise<boolean>): () => void {
    closeGuards.set(id, guard)
    return () => { if (closeGuards.get(id) === guard) closeGuards.delete(id) }
  }

  function registerStateProvider(id: string, provider: () => unknown): () => void {
    stateProviders.set(id, provider)
    return () => { if (stateProviders.get(id) === provider) stateProviders.delete(id) }
  }

  function registerPanelMenu(id: string, getItems: () => ContextMenuItem[]): () => void {
    panelMenus.set(id, getItems)
    panelMenuVersion.value++
    return () => {
      if (panelMenus.get(id) === getItems) {
        panelMenus.delete(id)
        panelMenuVersion.value++
      }
    }
  }

  // The shared resolver (1.5.1): this had its own copy, which replaced only the first `{key}`.
  const format = (label: Label | undefined): string => formatLabel(label, config.formatMessage)

  const overlays = createOverlays()
  const contributions = createContributions()

  const workspace: Workspace<TEvents> = {
    state: readonly(state) as Readonly<WorkspaceState>,
    registry,
    gridRoot: computed(() => state.gridRoot),
    floating: computed(() => state.floating),
    minimized: computed(() => state.minimized),
    panels: computed(() => state.panels),
    activePanelId: computed(() => state.activePanelId),
    draggedPanelId: computed(() => state.draggedPanelId),
    dir: computed(() => state.dir),
    isRtl: computed(() => state.isRtl),

    openPanel, closePanel, requestClosePanel, minimizePanel, restorePanel, floatPanel,
    dockPanel, dockPanelToGroup, dockPanelToWorkspaceEdge, maximizePanel, focusPanel,
    focusPanelWindow, popOutPanel, returnPanel,
    movePanelOrder, closeLeafGroup, updateSplitSizes, updateFloatingPosition,
    setPanelDirty, updatePanelTitle, updatePanelProps, setPanelIcon, setDirection,
    setDraggedPanelId: (id) => { state.draggedPanelId = id },
    openHostedPanel, removeHostedPanel, setHostedOptions, registerHostedCloseHandler,
    setPoppedOut, clearPoppedOut, onPopOutEnded, bindPopOutWindows,
    activatePanel: (id) => activatePanel(id),

    isOpen: (id) => id in state.panels,
    getOpenPanelIds: () => Object.keys(state.panels),
    findPanelId: (component, dedupeKey) =>
      Object.values(state.panels).find(p => p.component === component && p.dedupeKey === dedupeKey)?.id ?? null,

    saveLayout, loadLayout,
    publish: (event, data) => bus.publish(event, data),
    subscribe: (event, cb) => bus.subscribe(event, cb),
    toolbar: createToolbarState(),
    overlays,
    contributions,
    // A widget's panel (7.11) brings its owner's contribution: its content can't publish one of
    // its own (its panel injection is the owner's), and the owner's tools stay while the user
    // works in the widget.
    activeContribution: activeContributionRef(contributions, () => state.activePanelId, id => state.panels[id]?.owner?.panelId),
    registerCloseGuard, registerStateProvider, registerPanelMenu,
    panelMenuItems: (id) => {
      void panelMenuVersion.value        // tracked, so a computed sees registrations
      return panelMenus.get(id)?.() ?? []
    },
    showContextMenu: (options) => {
      options.event?.preventDefault?.()
      // The document the menu is opened from: its event's target's, else the main one (1.14.0).
      const from = options.event?.target
      menu.value = {
        ...menuPosition(options), items: options.items, initialFocus: menuInitialFocus(options),
        container: isNode(from) ? docOf(from).body : null,
      }
    },
    closeContextMenu: () => { menu.value = null },
    contextMenu: computed(() => menu.value),
    // Normalised to all-present-and-empty, so a template can bind every one without a guard.
    classes: {
      modal: config.classes?.modal ?? '',
      modalBody: config.classes?.modalBody ?? '',
      sidePanel: config.classes?.sidePanel ?? '',
      sidePanelBody: config.classes?.sidePanelBody ?? '',
      window: config.classes?.window ?? '',
      windowBody: config.classes?.windowBody ?? '',
    },
    format,
    messages,
    popOutEnabled,
    // `popOut` is set once, at creation, and not kept here (rdd 7.12.0 S2.1).
    config: (({ popOut: _popOut, ...rest }) => ({ ...rest, zIndexBase }))(config),

    install(app: App) {
      app.provide(WORKSPACE_KEY, workspace as unknown as Workspace<never>)
    },
    dispose() {
      bus.clear()
      overlays.dispose()
      closeGuards.clear()
      stateProviders.clear()
      panelMenus.clear()
      hostedCloseHandlers.clear()
      hostedDropHandlers.clear()
      popOutEndListeners.clear()
      popOutOrigins.clear()
      popOutWindows = null
      menu.value = null
    },
  }

  return workspace
}
