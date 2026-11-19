/**
 * The state one `<VddPanelOverlay>` shares with its toolbars and widgets.
 *
 * rdd split this across **three** React contexts — `PanelToolbarCtx`, `PanelManagerCtx` and
 * `PanelOverlayCtx` — not because they were three concerns but to stop a toolbar re-rendering
 * every time a widget gained focus: a React context value is one object, so any change to it
 * re-renders every consumer. Vue tracks each ref separately, so a toolbar that reads only the
 * insets is untouched when `topId` changes. One store, and the isolation is a property of the
 * reactivity rather than of how the state was carved up.
 */
import { markRaw, reactive, ref, shallowRef } from 'vue'
import type { Component, InjectionKey, Ref } from 'vue'
import type { FloatAnchor, Label } from '../types'
import type { ContextMenuItem } from './contextMenu'
import type { Stretch, PanelFloatPlacement } from './stretch'
import { bucketsFor } from './stretch'
import { ANCHORS } from './panelOverlay'
import type { ToolbarInsets, ToolbarPosition } from './panelOverlay'
import { WidgetContentCache } from './widgetContent'
import { fromPanelForm, parsePlacement, toPanelForm } from './widgetPlacement'
import type { OutTarget, PanelBox, PanelForm } from './widgetPlacement'
import { setPreserveEmbeds } from './domMove'

/**
 * Everything about where a managed widget sits (7.11): its corner and stretch, whether it is
 * docked to that corner or dragged free, its free position and its own size.
 *
 * All of it lives in the overlay rather than in the widget's frame, so the frame can unmount
 * and mount again (a widget moved out of its panel has no frame) and come back exactly where it
 * was. rdd's `ManagedPlacement` and ndd's overlay store keep the same record. Internal.
 */
export interface ManagedPlacement extends PanelFloatPlacement {
  mode: 'docked' | 'free'
  freePos: { x: number; y: number } | null
  size: { w: number; h: number }
}

/** A widget opened through `useFloatingWidgets()` rather than placed in the template. */
export interface ManagedWidget {
  /**
   * The widget's header text: plain, or a localisable descriptor.
   *
   * A descriptor matters most here of all the title surfaces, because this object is *stored*:
   * a resolved string handed to `openManaged` is frozen at the language that was current when
   * the widget opened, while a descriptor is resolved on every render and so follows a locale
   * change with no reopen.
   */
  title: Label
  icon?: Component
  /** Rendered as the widget's content. */
  component: Component
  props?: Record<string, unknown>
  /**
   * The corner to dock to **on first open**, not live state.
   *
   * Seeded into the overlay's own placement record and owned there afterwards, so a gesture
   * that moves the widget is not undone the next time the caller's state re-renders — and
   * `open()` on a widget that is already open refreshes its content without yanking it back
   * to this corner. `close()` then `open()` is what re-seeds it. rdd draws the same line,
   * with `defaultAnchor` feeding a `useState`.
   *
   * @default 'top-right'
   */
  anchor?: FloatAnchor
  /** Initial width in pixels. @default 320 */
  width?: number
  /** Initial height in pixels. @default 240 */
  height?: number
  /** Which axes span the panel **on first open**. As `anchor`, a seed rather than live state. */
  stretch?: Stretch | null
  /**
   * Whether **the user** may dock the widget's panel (drag it into the grid, make it a tab) once
   * it is out of its panel (7.11). Your own `move()` calls always work. A re-open with a new value
   * changes it while the widget is out. @default false
   */
  canDock?: boolean
  /** Whether the user may float the widget's panel once it is out of its panel (7.11). @default false */
  canFloat?: boolean
  /**
   * The widget's own menu (7.11). In the panel, its title icon becomes a button that opens these
   * items (a menu glyph when there is no icon); out of it, they lead its panel's menus (the tab's,
   * the floating title bar's). Called each time a menu opens, so `w.location` is current.
   */
  titleMenu?: (w: WidgetMenuContext) => ContextMenuItem[]
  /**
   * Open **at** a placement saved earlier with `useFloatingWidgets().placement(id)` (7.11): where
   * it was in the panel, and whether it was docked, tabbed or floating out of it. Used only on the
   * first open of an id, like `anchor`; a re-open of a live id leaves it where it is.
   *
   * A value this version can't read (another `v`, or broken fields) falls back to the config's own
   * `anchor` / `width` / `height` / `stretch`. A valid one is clamped into the panel as it is now; in
   * a panel that has no size yet (a background tab) a free position waits until it has one. If
   * moving out of the panel is refused (the owner isn't docked), the widget stays in the panel.
   */
  placement?: WidgetPlacement
  /**
   * Keep embedded documents and media alive when the widget moves (7.11): an `<iframe>` in it
   * doesn't reload when it moves out of its panel, back, or between docked, tabbed and floating.
   * Uses `moveBefore()` where the browser has it (Chrome and Edge 133+, Firefox 144+); in the others
   * an iframe reloads as before. As `preserveEmbeds` on a panel type's `defaultOptions`, which is
   * for the whole panel; this is for the widget alone. @default false
   */
  preserveEmbeds?: boolean
}

/**
 * Where a managed widget is, as plain JSON (7.11): from `useFloatingWidgets().placement(id)`, back
 * to `open(id, { placement })`. Opaque: store it as it is (JSON-serialisable) and don't read its
 * fields; they may change between versions, and `v` says which. The same in the React and Angular
 * editions (react-dockable-desktop, angular-dockable-desktop), so a saved value moves between them.
 */
export type WidgetPlacement = { readonly v: 1 } & Record<string, unknown>

/** What a managed widget's `titleMenu` receives (7.11). */
export interface WidgetMenuContext {
  /** The widget's id. */
  id: string
  /** Where the widget is as the menu opens. */
  location: WidgetLocation
  /** The widget's `canDock`, `false` when unset. */
  canDock: boolean
  /** The widget's `canFloat`, `false` when unset. */
  canFloat: boolean
  /** `useFloatingWidgets().move()` for this widget. */
  move(to: WidgetTarget): MoveResult
  /** Closes the widget for real, wherever it is. */
  close(): void
}

/**
 * Where `useFloatingWidgets().move()` takes a widget (7.11). The owner panel is always the
 * reference: `docked` splits a new group off the owner's group on that side (`size` its share,
 * 0.1–0.9, by default the workspace's split ratio), `tabbed` is a tab in the owner's group,
 * `floating` a window at `rect` (workspace pixels; without one, where the widget is on screen, at
 * its size), and `panel` back where it last was inside the panel.
 */
export type WidgetTarget =
  | { to: 'panel' }
  | { to: 'docked'; position: 'top' | 'bottom' | 'left' | 'right'; size?: number }
  | { to: 'tabbed' }
  | { to: 'floating'; rect?: { x: number; y: number; width: number; height: number } }

/** Where a managed widget is now (7.11). */
export type WidgetLocation = 'panel' | 'docked' | 'tabbed' | 'floating' | 'minimized'

/**
 * What `move()` did. It never throws, and a refusal changes nothing:
 * - `not-open`: no widget with that id is open in this overlay;
 * - `owner-not-docked`: `docked` and `tabbed` need the owner panel in the grid;
 * - `owner-not-kept-alive`: the owner's panel type has `keepAlive: false`;
 * - `no-workspace`: the overlay isn't in a workspace panel (a modal, a drawer, no workspace).
 */
export type MoveResult =
  | { ok: true }
  | { ok: false; reason: 'not-open' | 'owner-not-docked' | 'owner-not-kept-alive' | 'no-workspace' }

/**
 * What the overlay's hosting (`useWidgetHosting`) gives the store: moving widgets out of the
 * panel and back. Internal; `null` until `<VddPanelOverlay>` sets it up.
 */
export interface WidgetHostingPort {
  /** Widget id → its hosted panel's id, for the widgets that are out of the panel. Reactive. */
  readonly hostedIds: Readonly<Record<string, string>>
  move(id: string, to: WidgetTarget): MoveResult
  location(id: string): WidgetLocation | null
  /** Removes a widget's hosted panel, if it has one, without closing anything: for close(). */
  release(id: string): void
  /** Re-applies a re-opened widget's title, icon and capabilities to its hosted panel. */
  refresh(id: string, widget: ManagedWidget): void
  /** The widget's `titleMenu` items for where it is now; empty without one. Tracks re-opens. */
  menuItems(id: string): ContextMenuItem[]
  /** The owner panel's id, or `null` when the overlay isn't in a workspace panel. */
  readonly ownerPanelId: string | null
  /** Which container a widget is in now (see `containerKey`). Reactive. */
  keyOf(id: string): string
  /** Subscribes to a widget's `onWillMove` / `onMoved`. */
  listen(id: string, kind: 'will' | 'moved', cb: () => void): () => void
  /** The widget is in its new container: calls `onMoved` once it has a size. */
  settled(id: string): void
  /** Where a widget out of its panel is, as a saved placement's target; `null` in the panel. */
  outTarget(id: string): OutTarget | null
  /**
   * A widget that keeps its embeds is inside its owner panel's element, which moves whenever the
   * grid changes around it (as it does when a hosted panel docks beside it): that element must
   * move with moveBefore() too, so this marks it, for the rest of its life.
   */
  preserveOwner(): void
}

export interface OverlayStacks {
  'top-left': string[]
  'top-right': string[]
  'bottom-left': string[]
  'bottom-right': string[]
}

export interface PanelOverlayStore {
  /** The overlay root element, for measuring drop zones. */
  container: Ref<HTMLElement | null>
  /** Space each toolbar edge claims. */
  insets: ToolbarInsets
  /** The widget on top, or `null`. */
  topId: Ref<string | null>
  zOrders: Record<string, number>
  /** Which widgets are stacked in each corner bucket. */
  stacks: OverlayStacks
  /** Each docked widget's block size, so its stack peers can offset past it. */
  dockedSizes: Record<string, number>
  /** The widget being dragged, or `null`. */
  draggingId: Ref<string | null>
  /** The corner the drag is currently over, or `null`. */
  hovered: Ref<FloatAnchor | null>
  /** Widgets opened through `useFloatingWidgets()`. */
  managed: Map<string, ManagedWidget>
  /** Bumped whenever `managed` changes, since a `Map` is not reactive by itself. */
  managedVersion: Ref<number>
  /**
   * Live placement of each managed widget, seeded by {@link PanelOverlayStore.openManaged}
   * from the widget's own `anchor`/`stretch` and owned here from then on.
   *
   * Here rather than inside `<VddFloatingWidget>` because a managed widget's `placement` model
   * has to be *bound* by the overlay — and a bound model is authoritative on every render, so
   * whatever the overlay binds has to be the live value rather than a re-derived seed.
   */
  managedPlacements: Record<string, ManagedPlacement>
  /**
   * Each managed widget's content element, `div.vdd-panel-float__content`, created by
   * {@link PanelOverlayStore.openManaged} and dropped on close. The overlay teleports the
   * widget's component into it for the widget's whole life; a frame only shows it.
   */
  content: WidgetContentCache
  /**
   * Moving widgets out of the panel and back (7.11), set by `<VddPanelOverlay>`; `null` for a
   * store used on its own. `closeManaged` / `closeAllManaged` remove a widget's hosted panel
   * through it, and a re-open refreshes it.
   */
  hosting: WidgetHostingPort | null

  registerToolbar(position: ToolbarPosition, size: number): void
  unregisterToolbar(position: ToolbarPosition): void
  focus(id: string): void
  dock(id: string, anchor: FloatAnchor, stretch: Stretch | null): void
  undock(id: string): void
  reportSize(id: string, size: number): void
  openManaged(id: string, widget: ManagedWidget): void
  closeManaged(id: string): void
  closeAllManaged(): void
  managedIds(): string[]
  /**
   * Record what a gesture did to a managed widget's placement: the frame's `update:placement`,
   * echoed. Merged into the record, so a write that carries only `{ anchor, stretch }` keeps the
   * rest.
   */
  setManagedPlacement(id: string, placement: Partial<ManagedPlacement>): void
  /** Where a managed widget is, as JSON to save (7.11); `null` when it isn't open. */
  placementOf(id: string): WidgetPlacement | null
  /**
   * How many restored free positions wait for the panel to have a size (7.11). Reactive: the
   * overlay observes its root while it is above zero, and calls {@link applyPending}.
   */
  pendingCount: Ref<number>
  /** Places the waiting free positions, once the overlay root has a size. */
  applyPending(): void
}

/** What the store reads from where it is mounted. */
export interface PanelOverlayStoreOptions {
  /** Whether the workspace is right-to-left: a saved free position is measured from inline-start. */
  rtl?: () => boolean
}

/** A saved out-of-panel target as a move; a floating rect is clamped into the workspace as it is now. */
function targetOf(out: OutTarget, root: HTMLElement | null): WidgetTarget {
  if (out.at === 'tabbed') return { to: 'tabbed' }
  if (out.at === 'docked') return { to: 'docked', position: out.position, ...(out.size !== undefined ? { size: out.size } : {}) }
  const viewport = root?.closest('.vdd-workspace-viewport') as HTMLElement | null | undefined
  const vw = viewport?.clientWidth ?? 0
  const vh = viewport?.clientHeight ?? 0
  const r = out.rect
  if (vw <= 0 || vh <= 0) return { to: 'floating', rect: r }
  const width = Math.min(r.width, vw)
  const height = Math.min(r.height, vh)
  return { to: 'floating', rect: { x: Math.min(r.x, vw - width), y: Math.min(r.y, vh - height), width, height } }
}

/** Where a managed widget starts: its config's corner, stretch and size, docked. */
const seedPlacement = (widget: ManagedWidget): ManagedPlacement => ({
  anchor: widget.anchor ?? 'top-right',
  stretch: widget.stretch ?? null,
  mode: 'docked',
  freePos: null,
  size: { w: widget.width ?? 320, h: widget.height ?? 240 },
})

export const PANEL_OVERLAY_KEY = Symbol('vdd-panel-overlay') as InjectionKey<PanelOverlayStore>

export function createPanelOverlayStore(options: PanelOverlayStoreOptions = {}): PanelOverlayStore {
  const container = shallowRef<HTMLElement | null>(null)
  const insets = reactive<ToolbarInsets>({ top: 0, bottom: 0, inlineStart: 0, inlineEnd: 0 })
  const topId = ref<string | null>(null)
  const zOrders = reactive<Record<string, number>>({})
  const stacks = reactive<OverlayStacks>({
    'top-left': [], 'top-right': [], 'bottom-left': [], 'bottom-right': [],
  })
  const dockedSizes = reactive<Record<string, number>>({})
  const draggingId = ref<string | null>(null)
  const hovered = ref<FloatAnchor | null>(null)
  const managed = new Map<string, ManagedWidget>()
  const managedVersion = ref(0)
  const managedPlacements = reactive<Record<string, ManagedPlacement>>({})
  const content = new WidgetContentCache(() => container.value?.ownerDocument ?? document)

  let zCounter = 100
  /** Restored free positions waiting for the panel to have a size (a hidden panel measures 0×0). */
  const pending = new Map<string, PanelForm>()
  const pendingCount = ref(0)
  /** The panel's size and direction now, or `null` while it has none. */
  const boxNow = (): PanelBox | null => {
    const el = container.value
    return el && el.clientWidth > 0 && el.clientHeight > 0
      ? { width: el.clientWidth, height: el.clientHeight, rtl: options.rtl?.() ?? false } : null
  }

  /** Which inset field an edge claims. `left`/`right` are logical, matching how a toolbar positions itself. */
  const field = (position: ToolbarPosition): keyof ToolbarInsets =>
    position === 'top' ? 'top' : position === 'bottom' ? 'bottom'
      : position === 'left' ? 'inlineStart' : 'inlineEnd'

  const store: PanelOverlayStore = {
    container, insets, topId, zOrders, stacks, dockedSizes, draggingId, hovered,
    managed, managedVersion, managedPlacements, content, pendingCount,
    hosting: null,

    registerToolbar: (position, size) => { insets[field(position)] = size },
    unregisterToolbar: (position) => { insets[field(position)] = 0 },

    focus: (id) => {
      zCounter += 1
      zOrders[id] = zCounter
      topId.value = id
    },

    /**
     * Put a widget in the buckets its placement occupies, removing it from the others.
     *
     * Bucket membership depends on the *whole* placement, not just the anchor — a full-width
     * strip belongs to both buckets of its edge — so this runs whenever either changes.
     */
    dock: (id, anchor, stretch) => {
      const buckets = bucketsFor(anchor, stretch)
      for (const a of ANCHORS) {
        const without = stacks[a].filter(x => x !== id)
        const next = buckets.includes(a) ? [...without, id] : without
        // Replacing an identical list churns every consumer of `stacks`, so bail when
        // nothing actually moved.
        const same = next.length === stacks[a].length && next.every((x, i) => x === stacks[a][i])
        if (!same) stacks[a] = next
      }
    },

    undock: (id) => {
      for (const a of ANCHORS) {
        if (stacks[a].includes(id)) stacks[a] = stacks[a].filter(x => x !== id)
      }
    },

    reportSize: (id, size) => { if (dockedSizes[id] !== size) dockedSizes[id] = size },

    openManaged: (id, widget) => {
      const reopened = managed.has(id)
      managed.set(id, { ...widget, component: markRaw(widget.component) })
      // Out of the panel, a re-open carries its new title and icon to the hosted panel.
      if (reopened) store.hosting?.refresh(id, widget)
      // Before the bump below: the overlay's next render teleports the content into it.
      const el = content.elementFor(id)
      // Its element moves with moveBefore(), and so do the containers it moves with (7.11).
      setPreserveEmbeds(el, widget.preserveEmbeds === true)
      if (widget.preserveEmbeds) store.hosting?.preserveOwner()
      // Seeded once per open, then owned here. Re-opening a live id therefore updates its
      // content and leaves it where the user dragged it; `closeManaged` drops the record, so
      // close-then-open is the reset. rdd's `defaultAnchor` behaves identically, because a
      // `useState` initialiser is ignored on every render after the first. A saved placement
      // (7.11) is read here too, only on the first open of an id.
      let saved: ReturnType<typeof parsePlacement> | null = null
      if (!(id in managedPlacements)) {
        saved = widget.placement !== undefined ? parsePlacement(widget.placement) : null
        let seed = seedPlacement(widget)
        if (saved?.home) {
          const { state, deferred } = fromPanelForm(saved.home, boxNow())
          seed = state
          if (deferred) { pending.set(id, saved.home); pendingCount.value++ }
        }
        managedPlacements[id] = seed
      }
      managedVersion.value++
      // Out of the panel, as saved. A refusal leaves it in the panel.
      if (!reopened && saved?.out) store.hosting?.move(id, targetOf(saved.out, container.value))
    },
    closeManaged: (id) => {
      if (!managed.has(id)) return
      // Its hosted panel goes first, while the widget still exists.
      store.hosting?.release(id)
      if (pending.delete(id)) pendingCount.value = pending.size
      managed.delete(id)
      delete managedPlacements[id]
      content.release(id)
      managedVersion.value++
    },
    closeAllManaged: () => {
      if (managed.size === 0) return
      for (const id of managed.keys()) store.hosting?.release(id)
      for (const id of managed.keys()) content.release(id)
      pending.clear()
      pendingCount.value = 0
      managed.clear()
      for (const id of Object.keys(managedPlacements)) delete managedPlacements[id]
      managedVersion.value++
    },
    managedIds: () => {
      void managedVersion.value        // tracked, so a computed sees opens and closes
      return Array.from(managed.keys())
    },

    /**
     * Two things here are load-bearing.
     *
     * The guard: a gesture can land after the widget was closed — a drop resolves on
     * `pointerup`, and nothing stops a close in between — and writing then would put back a
     * key that `managedIds()` no longer lists, leaving a placement for a widget that does not
     * exist.
     *
     * The *absence* of a `managedVersion` bump: that ref is what re-renders the widget list,
     * and a re-render of the list is what used to destroy the gesture this function exists to
     * record. Bumping it here would restore the original defect in a new place.
     */
    setManagedPlacement: (id, patch) => {
      const placement = { ...managedPlacements[id]!, ...patch }
      if (id in managedPlacements) managedPlacements[id] = placement
    },

    /**
     * A free position still waiting for a size is returned as it was saved, never re-measured
     * against a 0×0 panel. Out of the panel: where, plus `home`, the panel form.
     */
    placementOf: (id) => {
      if (!managed.has(id)) return null
      const current = managedPlacements[id]
      const home = pending.get(id) ?? (current ? toPanelForm(current, boxNow()) : null)
      if (!home) return null
      const out = store.hosting?.outTarget(id) ?? null
      return (out ? { v: 1, home, ...out } : home) as unknown as WidgetPlacement
    },

    applyPending: () => {
      const box = boxNow()
      if (!box || pending.size === 0) return
      for (const [id, form] of pending) store.setManagedPlacement(id, fromPanelForm(form, box).state)
      pending.clear()
      pendingCount.value = 0
    },
  }
  return store
}

export type { PanelFloatPlacement }
