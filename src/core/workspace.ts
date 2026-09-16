/**
 * The workspace: reactive state plus every action that mutates it.
 *
 * Created outside the component tree and live from that moment, so an application can drive
 * it from a service, a router guard or a plain module — no queueing, no "connected" state
 * (docs/decisions/0004-store-outside-components.md).
 */
import { computed, markRaw, reactive, readonly, ref, shallowRef, toRaw } from 'vue'
import type { App, Component, ComputedRef, InjectionKey } from 'vue'
import type {
  DirtyStateOptions, DropPosition, FloatAnchor, FloatingWindow, Label, LayoutNode,
  MessageDescriptor, MessageFormatter, PanelInfo, SerializedLayout, SplitDirection,
} from '../types'
import {
  addPanelToLeaf, deriveActivePanelId, dockToEdge, emptyRoot, findFirstLeafId, findLeafForPanel,
  insertPanelInLeaf, isVisibleActiveTarget, leafExists, removeLeafFromTree, removePanelFromTree,
  selectPanelInTree, splitLeafInTree, updateSizesAtPath,
} from './layoutTree'
import type { ActiveTargetScope } from './layoutTree'
import { LAYOUT_VERSION, parseInitialState } from './serialize'
import { isSerializable } from './serializable'
import { PanelRegistry } from './registry'
import type { PanelDefaultOptions } from './registry'
import { EventBus } from './eventBus'
import { menuPosition } from './contextMenu'
import type { ContextMenuItem, ShowContextMenuOptions } from './contextMenu'
import type { BuiltInEvents } from './eventBus'
import { defaultMessages } from './messages'
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

const DEFAULT_RECT = { x: 300, y: 150, width: 450, height: 350 }

/** A workspace instance: reactive state, actions, registry, and a Vue plugin. */
export interface Workspace<TEvents extends Record<string, unknown> = Record<string, unknown>> {
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
  focusPanel(id: string): void
  movePanelOrder(panelId: string, targetLeafId: string, targetIndex: number): void
  closeLeafGroup(leafId: string): void
  updateSplitSizes(path: number[], sizes: number[]): void
  updateFloatingPosition(id: string, updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'anchor'>>): void
  setPanelDirty(id: string, dirty: boolean, options?: DirtyStateOptions): void
  updatePanelTitle(id: string, title: Label): void
  setDirection(dir: 'ltr' | 'rtl'): void
  /** @internal drives drag visuals */
  setDraggedPanelId(id: string | null): void

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
  readonly contextMenu: ComputedRef<{ x: number; y: number; items: ContextMenuItem[] } | null>

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

/**
 * Create a workspace.
 *
 * The returned object is both the imperative API and a Vue plugin, matching the
 * `createPinia()` / `createRouter()` shape a Vue developer already knows.
 */
export function createWorkspace<TEvents extends Record<string, unknown> = Record<string, unknown>>(
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
  /**
   * Bumped whenever a panel registers or withdraws menu items.
   *
   * The map itself is deliberately plain — the *items* are pulled fresh on every open, so
   * nothing about them needs to be reactive. But a `computed` that asks "does this panel
   * contribute anything?" (the window's more-actions button does) has to have something to
   * track, or it caches the answer from before the panel ever registered.
   */
  const panelMenuVersion = ref(0)
  const menu = shallowRef<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const messages = { ...defaultMessages, ...(config.messages ?? {}) } as Record<keyof typeof defaultMessages, MessageDescriptor>
  const zIndexBase = config.zIndexBase ?? 1000
  let maxZ = zIndexBase

  const initial = parseInitialState(config.initialState, warn)

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

  const entryFor = (id: string) => {
    const panel = state.panels[id]
    return panel ? registry.get(panel.component) : undefined
  }
  const optionsFor = (id: string): PanelDefaultOptions => entryFor(id)?.defaultOptions ?? {}

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
    state.gridRoot = removePanelFromTree(toRaw(state).gridRoot, id) ?? emptyRoot()
    state.floating = state.floating.filter(w => w.id !== id)
    state.minimized = state.minimized.filter(m => m.id !== id)
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
      if (shouldFocus) focusPanel(resolvedId)
      return
    }

    const propsProvided = options?.props !== undefined
    const info: PanelInfo = {
      id: resolvedId,
      title: options?.title ?? entry?.defaultOptions?.title ?? resolvedId,
      component,
      state: target === 'floating' ? 'floating' : 'docked',
      serializable: propsProvided ? isSerializable(toRaw(options!.props)) : true,
      ...(propsProvided ? { props: markRaw(options!.props as Record<string, unknown>) } : {}),
      ...(options?.dedupeKey !== undefined ? { dedupeKey: options.dedupeKey } : {}),
    }
    state.panels = { ...state.panels, [resolvedId]: info }

    if (target === 'floating') {
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
    if (optionsFor(id).canClose === false) return

    closeGuards.delete(id)
    stateProviders.delete(id)
    detach(id)
    const next = { ...state.panels }
    delete next[id]
    state.panels = next

    resolveActive()
    bus.emit('panel:closed', { id })
    layoutChanged()
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
    const panel = state.panels[id]
    if (!panel || panel.state === 'minimized') return
    if (optionsFor(id).canMinimize === false) return

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
    const entry = registry.get(panel.component)
    const favourite = panel.lastFloatingRect ?? entry?.defaultOptions?.favoritePosition ?? DEFAULT_RECT

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
    } else if (optionsFor(id).canDrag !== false) {
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
    if (optionsFor(id).canDrag === false) return

    const favourite = rect ?? registry.get(panel.component)?.defaultOptions?.favoritePosition ?? DEFAULT_RECT
    detach(id)
    state.panels = { ...state.panels, [id]: { ...panel, state: 'floating' } }
    addFloating(id, cascade(favourite), anchor ?? null)

    resolveActive(id)
    layoutChanged()
  }

  function dockPanel(id: string, targetLeafId?: string): void {
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
    const panel = state.panels[id]
    if (!panel) return
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
    const panel = state.panels[id]
    if (!panel) return
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
    const cleaned = removePanelFromTree(toRaw(state).gridRoot, panelId) ?? emptyRoot()
    state.floating = state.floating.filter(w => w.id !== panelId)
    state.minimized = state.minimized.filter(m => m.id !== panelId)
    state.panels = { ...state.panels, [panelId]: { ...panel, state: 'docked' } }
    state.gridRoot = insertPanelInLeaf(cleaned, targetLeafId, panelId, targetIndex)
    state.draggedPanelId = null

    resolveActive(panelId)
    layoutChanged()
  }

  function maximizePanel(id: string): void {
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

  function focusPanel(id: string): void {
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

  function setDirection(dir: 'ltr' | 'rtl'): void {
    if (state.dir === dir) return
    state.dir = dir
    state.isRtl = dir === 'rtl'
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  function saveLayout(): string {
    const raw = toRaw(state)
    const excluded: string[] = []
    const included: Record<string, PanelInfo> = {}

    // A registered provider is pulled fresh on every save: a panel's serialisability can
    // change over its lifetime, so it is never cached from open time for provider-backed panels.
    for (const [id, info] of Object.entries(raw.panels)) {
      const provider = stateProviders.get(id)
      const dynamic = provider?.()
      const hasDynamic = provider !== undefined && dynamic !== undefined
      const props = hasDynamic ? (dynamic as Record<string, unknown>) : info.props
      const ok = hasDynamic ? isSerializable(toRaw(dynamic)) : info.serializable
      if (ok) included[id] = hasDynamic ? { ...info, props, serializable: true } : info
      else excluded.push(id)
    }

    // Excluded panels are pruned from the snapshot's tree/floating/minimized too, so a
    // restore never references a panel it has no data to recreate. None of this touches the
    // live state: an excluded panel keeps working on screen.
    let gridRoot: LayoutNode = raw.gridRoot
    let floating = raw.floating
    let minimized = raw.minimized
    for (const id of excluded) {
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
      minimized,
      panels: included,
    }
    return JSON.stringify(payload)
  }

  function loadLayout(json: string): boolean {
    let parsed: ReturnType<typeof parseInitialState>
    try {
      const payload = JSON.parse(json)
      const result = parseInitialState(JSON.stringify(payload), warn)
      if (!payload || typeof payload !== 'object' || !payload.gridRoot) return false
      parsed = result
    } catch {
      warn('loadLayout received invalid JSON; the current layout is unchanged.')
      return false
    }
    state.gridRoot = parsed.gridRoot
    state.floating = parsed.floating
    state.minimized = parsed.minimized
    state.panels = parsed.panels
    state.draggedPanelId = null
    maxZ = Math.max(zIndexBase, ...parsed.floating.map(w => w.z), 0)

    const previous = state.activePanelId
    state.activePanelId = parsed.activePanelId
    if (previous !== parsed.activePanelId) {
      bus.emit('panel:activated', { id: parsed.activePanelId, previous })
    }
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

  const format = (label: Label | undefined): string => {
    if (label === undefined || label === null) return ''
    if (typeof label === 'string') return label
    if (config.formatMessage) return config.formatMessage(label)
    let text = label.defaultMessage ?? label.id
    for (const [k, v] of Object.entries(label.values ?? {})) text = text.replace(`{${k}}`, String(v))
    return text
  }

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
    movePanelOrder, closeLeafGroup, updateSplitSizes, updateFloatingPosition,
    setPanelDirty, updatePanelTitle, setDirection,
    setDraggedPanelId: (id) => { state.draggedPanelId = id },

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
    activeContribution: activeContributionRef(contributions, () => state.activePanelId),
    registerCloseGuard, registerStateProvider, registerPanelMenu,
    panelMenuItems: (id) => {
      void panelMenuVersion.value        // tracked, so a computed sees registrations
      return panelMenus.get(id)?.() ?? []
    },
    showContextMenu: (options) => {
      options.event?.preventDefault?.()
      menu.value = { ...menuPosition(options), items: options.items }
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
    config: { ...config, zIndexBase },

    install(app: App) {
      app.provide(WORKSPACE_KEY, workspace as unknown as Workspace<never>)
    },
    dispose() {
      bus.clear()
      overlays.dispose()
      closeGuards.clear()
      stateProviders.clear()
      panelMenus.clear()
      menu.value = null
    },
  }

  return workspace
}
