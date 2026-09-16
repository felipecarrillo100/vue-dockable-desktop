/**
 * The drag-and-dock state machine.
 *
 * One source of truth for a gesture in progress: what is being dragged, where the pointer
 * is, and which drop target is currently armed. Provided by `<VddDesktop>` and consumed by
 * the tab bars, the drop-zone overlays and the ghost.
 *
 * Two input paths, deliberately different:
 *
 *   - **mouse and pen** — listeners on `window`, with **no** `setPointerCapture`. Capture
 *     would suppress `pointerenter`/`pointerleave` on the drop zones, which is how hover is
 *     tracked. A 5px threshold distinguishes a drag from a click.
 *   - **touch** — a 300ms long press *with* capture, because a touch drag must not be
 *     confused with a scroll. Moving more than 8px before the press completes cancels it.
 *     Since capture suppresses hover events, the armed target is resolved by hit-testing the
 *     pointer position instead.
 *
 * Drop resolution order is fixed: workspace edge, then a tab (a precise intent), then a
 * leaf's cross target, then a corner anchor, then a free float. It matters — a leaf's cross
 * commonly overlaps the edge zones beneath it, and the more specific target must win.
 */
import { computed, inject, provide, ref, shallowRef } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { DropPosition, FloatAnchor, SplitDirection } from '../types'
import { flipZoneHorizontal } from '../core/anchorGeometry'
import { findLeaf } from '../core/layoutTree'
import type { Workspace } from '../core/workspace'

/** How far a mouse must move before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 5
/** How long a touch must rest before it becomes a drag. */
export const LONG_PRESS_MS = 300
/** How far a touch may wander before the long press is abandoned. */
export const CANCEL_MOVE_PX = 8

/** Which tab a dragged panel would be inserted next to. */
export interface TabTarget {
  leafId: string
  panelId: string
  index: number
  side: 'left' | 'right'
}

export interface DragDock {
  /** The panel being dragged, or `null`. */
  draggedId: Ref<string | null>
  /** Pointer position, for the ghost. */
  pointer: Ref<{ x: number; y: number }>
  /** The armed leaf cross target. */
  zone: Ref<{ leafId: string; position: DropPosition } | null>
  /** The armed workspace edge. */
  edge: Ref<SplitDirection | null>
  /** The armed corner anchor. */
  corner: Ref<FloatAnchor | null>
  /** The armed tab insertion point. */
  tab: Ref<TabTarget | null>
  /** True while a gesture is in progress. */
  dragging: ComputedRef<boolean>

  startTabDrag: (panelId: string, event: PointerEvent, onLongPressWithoutDrag?: (e: PointerEvent) => void) => void
  /** Begin a gesture that another component drives (a floating window's title bar). */
  beginDrag: (panelId: string) => void
  /**
   * Update the pointer and re-resolve the armed target by hit-testing.
   *
   * Needed whenever the gesture holds pointer capture — a captured pointer routes every
   * event to the capturing element, so the drop zones never receive `pointerenter`. The
   * dragged window sets `pointer-events: none` on itself, so the zones beneath it are what
   * the hit test finds.
   */
  trackPointer: (x: number, y: number) => void
  hoverZone: (leafId: string, position: DropPosition | null) => void
  hoverEdge: (edge: SplitDirection | null) => void
  hoverCorner: (corner: FloatAnchor | null) => void
  hoverTab: (target: TabTarget | null) => void
  /** Finish a gesture started elsewhere (a floating window's title bar). */
  finishDrag: (panelId: string, event: PointerEvent) => void
  cancel: () => void
}

const DRAG_DOCK_KEY = Symbol('vdd-drag-dock') as InjectionKey<DragDock>

/** @internal */
export function provideDragDock(ws: Workspace<never>): DragDock {
  const draggedId = ref<string | null>(null)
  const pointer = ref({ x: 0, y: 0 })
  const zone = ref<{ leafId: string; position: DropPosition } | null>(null)
  const edge = ref<SplitDirection | null>(null)
  const corner = ref<FloatAnchor | null>(null)
  const tab = shallowRef<TabTarget | null>(null)

  const dragging = computed(() => draggedId.value !== null)

  /** Mirror a physical drop side to a logical one under RTL. */
  const flip = (position: DropPosition): DropPosition => {
    if (!ws.state.isRtl) return position
    if (position === 'left') return 'right'
    if (position === 'right') return 'left'
    return position
  }

  function reset(): void {
    draggedId.value = null
    zone.value = null
    edge.value = null
    corner.value = null
    tab.value = null
    ws.setDraggedPanelId(null)
    document.body.classList.remove('vdd-dragging-active')
  }

  function begin(panelId: string): void {
    draggedId.value = panelId
    ws.setDraggedPanelId(panelId)
    document.body.classList.add('vdd-dragging-active')
  }

  function hoverZone(leafId: string, position: DropPosition | null): void {
    zone.value = position ? { leafId, position } : null
    // A leaf's cross overlaps the edge and corner zones beneath it; the more specific target
    // wins, so arming one disarms the coarser ones.
    if (position) { edge.value = null; corner.value = null }
  }
  const hoverEdge = (value: SplitDirection | null) => { edge.value = value }
  const hoverCorner = (value: FloatAnchor | null) => {
    corner.value = value
    if (value) edge.value = null
  }
  const hoverTab = (value: TabTarget | null) => { tab.value = value }

  /**
   * Resolve the armed target by hit-testing, for touch.
   *
   * `setPointerCapture` routes every event to the captured element, so the drop zones never
   * see `pointerenter`. Reading the elements under the pointer is the only way to know what
   * is being hovered. Tabs are checked before edges: a precise intent beats a coarse zone.
   */
  function resolveFromPoint(x: number, y: number): void {
    const elements = document.elementsFromPoint(x, y)
    let foundZone = false
    let foundEdge = false
    let foundTab = false

    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue

      if (!foundZone && el.dataset.vddDropZone && el.dataset.vddLeaf) {
        zone.value = { leafId: el.dataset.vddLeaf, position: el.dataset.vddDropZone as DropPosition }
        foundZone = true
      }
      if (!foundTab && el.dataset.vddTab && el.dataset.vddTabLeaf) {
        const rect = el.getBoundingClientRect()
        tab.value = {
          leafId: el.dataset.vddTabLeaf,
          panelId: el.dataset.vddTab,
          index: Number.parseInt(el.dataset.vddTabIndex ?? '0', 10),
          side: x - rect.left < rect.width / 2 ? 'left' : 'right',
        }
        foundTab = true
      }
      if (!foundEdge && el.dataset.vddEdge) {
        edge.value = el.dataset.vddEdge as SplitDirection
        foundEdge = true
      }
      if (!foundZone && el.dataset.vddCorner) {
        corner.value = el.dataset.vddCorner as FloatAnchor
      }
      if (foundZone && foundEdge && foundTab) break
    }

    if (!foundZone) zone.value = null
    if (!foundEdge) edge.value = null
    if (!foundTab) tab.value = null
  }

  /** Apply the armed target. */
  function finishDrag(panelId: string, event: PointerEvent): void {
    const armedEdge = edge.value
    const armedTab = tab.value
    const armedZone = zone.value
    const armedCorner = corner.value

    if (armedEdge) {
      ws.dockPanelToWorkspaceEdge(panelId, flip(armedEdge) as SplitDirection)
    } else if (armedTab) {
      let index = armedTab.index
      if (armedTab.side === 'right') index += 1
      // Tab indices come from the DOM, which is pre-removal. `movePanelOrder` removes the
      // panel before inserting it, shifting later positions down by one within the same leaf.
      const leaf = findLeaf(ws.state.gridRoot, armedTab.leafId)
      if (leaf) {
        const current = leaf.panels.indexOf(panelId)
        if (current !== -1 && current < index) index -= 1
      }
      ws.movePanelOrder(panelId, armedTab.leafId, index)
    } else if (armedZone) {
      ws.dockPanelToGroup(panelId, armedZone.leafId, flip(armedZone.position))
    } else if (armedCorner) {
      ws.floatPanel(panelId, undefined, ws.state.isRtl ? flipZoneHorizontal(armedCorner) : armedCorner)
    } else {
      // Nothing armed: float it where the pointer let go, with the title bar under the cursor.
      ws.floatPanel(panelId, { x: event.clientX - 150, y: event.clientY - 15, width: 450, height: 350 })
    }
    reset()
  }

  function startTabDrag(
    panelId: string,
    event: PointerEvent,
    onLongPressWithoutDrag?: (e: PointerEvent) => void,
  ): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const el = event.currentTarget as HTMLElement
    const startX = event.clientX
    const startY = event.clientY

    if (event.pointerType === 'touch') {
      const pointerId = event.pointerId
      let cancelled = false
      let dragStarted = false

      const cleanupPre = () => {
        clearTimeout(timer)
        el.removeEventListener('pointermove', onPreMove)
        el.removeEventListener('pointerup', onPreUp)
        el.removeEventListener('pointercancel', onPreCancel)
      }
      const onPreMove = (e: PointerEvent) => {
        // A finger that travels before the press completes is scrolling, not dragging.
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > CANCEL_MOVE_PX) {
          cancelled = true
          cleanupPre()
        }
      }
      const onPreUp = () => { cancelled = true; cleanupPre() }
      const onPreCancel = onPreUp

      const timer = setTimeout(() => {
        if (cancelled) return
        cleanupPre()
        try { el.setPointerCapture(pointerId) } catch { return }
        el.classList.add('vdd-long-press-active')
        document.body.classList.add('vdd-dragging-active')
        navigator.vibrate?.(10)

        const onMove = (e: PointerEvent) => {
          if (!dragStarted) { dragStarted = true; begin(panelId) }
          pointer.value = { x: e.clientX, y: e.clientY }
          resolveFromPoint(e.clientX, e.clientY)
        }
        const onEnd = (e: PointerEvent) => {
          el.classList.remove('vdd-long-press-active')
          el.removeEventListener('pointermove', onMove)
          el.removeEventListener('pointerup', onEnd)
          el.removeEventListener('pointercancel', onCancel)
          if (dragStarted) finishDrag(panelId, e)
          else { document.body.classList.remove('vdd-dragging-active'); onLongPressWithoutDrag?.(e) }
        }
        const onCancel = () => {
          el.classList.remove('vdd-long-press-active')
          el.removeEventListener('pointermove', onMove)
          el.removeEventListener('pointerup', onEnd)
          el.removeEventListener('pointercancel', onCancel)
          reset()
        }
        el.addEventListener('pointermove', onMove)
        el.addEventListener('pointerup', onEnd)
        el.addEventListener('pointercancel', onCancel)
      }, LONG_PRESS_MS)

      el.addEventListener('pointermove', onPreMove)
      el.addEventListener('pointerup', onPreUp)
      el.addEventListener('pointercancel', onPreCancel)
      return
    }

    // Mouse and pen: no pointer capture, so the drop zones keep receiving enter/leave.
    let dragStarted = false
    const onMove = (e: PointerEvent) => {
      if (!dragStarted) {
        if (Math.abs(e.clientX - startX) <= DRAG_THRESHOLD_PX && Math.abs(e.clientY - startY) <= DRAG_THRESHOLD_PX) return
        dragStarted = true
        begin(panelId)
      }
      pointer.value = { x: e.clientX, y: e.clientY }
    }
    const teardown = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onUp = (e: PointerEvent) => {
      teardown()
      if (dragStarted) finishDrag(panelId, e)
      else document.body.classList.remove('vdd-dragging-active')
    }
    const onCancel = () => { teardown(); reset() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const trackPointer = (x: number, y: number): void => {
    pointer.value = { x, y }
    resolveFromPoint(x, y)
  }

  const api: DragDock = {
    draggedId, pointer, zone, edge, corner, tab, dragging,
    startTabDrag, beginDrag: begin, trackPointer,
    hoverZone, hoverEdge, hoverCorner, hoverTab, finishDrag, cancel: reset,
  }
  provide(DRAG_DOCK_KEY, api)
  return api
}

/** @internal */
export function useDragDock(): DragDock | null {
  return inject(DRAG_DOCK_KEY, null)
}
