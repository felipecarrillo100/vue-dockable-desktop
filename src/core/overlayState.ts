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
import type { Stretch, PanelFloatPlacement } from './stretch'
import { bucketsFor } from './stretch'
import { ANCHORS } from './panelOverlay'
import type { ToolbarInsets, ToolbarPosition } from './panelOverlay'

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
  managedPlacements: Record<string, PanelFloatPlacement>

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
  /** Record what a gesture did to a managed widget's placement. */
  setManagedPlacement(id: string, placement: PanelFloatPlacement): void
}

export const PANEL_OVERLAY_KEY = Symbol('vdd-panel-overlay') as InjectionKey<PanelOverlayStore>

export function createPanelOverlayStore(): PanelOverlayStore {
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
  const managedPlacements = reactive<Record<string, PanelFloatPlacement>>({})

  let zCounter = 100

  /** Which inset field an edge claims. `left`/`right` are logical, matching how a toolbar positions itself. */
  const field = (position: ToolbarPosition): keyof ToolbarInsets =>
    position === 'top' ? 'top' : position === 'bottom' ? 'bottom'
      : position === 'left' ? 'inlineStart' : 'inlineEnd'

  return {
    container, insets, topId, zOrders, stacks, dockedSizes, draggingId, hovered,
    managed, managedVersion, managedPlacements,

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
      managed.set(id, { ...widget, component: markRaw(widget.component) })
      // Seeded once per open, then owned here. Re-opening a live id therefore updates its
      // content and leaves it where the user dragged it; `closeManaged` drops the record, so
      // close-then-open is the reset. rdd's `defaultAnchor` behaves identically, because a
      // `useState` initialiser is ignored on every render after the first.
      if (!(id in managedPlacements)) {
        managedPlacements[id] = { anchor: widget.anchor ?? 'top-right', stretch: widget.stretch ?? null }
      }
      managedVersion.value++
    },
    closeManaged: (id) => {
      if (!managed.delete(id)) return
      delete managedPlacements[id]
      managedVersion.value++
    },
    closeAllManaged: () => {
      if (managed.size === 0) return
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
    setManagedPlacement: (id, placement) => {
      if (id in managedPlacements) managedPlacements[id] = placement
    },
  }
}

export type { PanelFloatPlacement }
