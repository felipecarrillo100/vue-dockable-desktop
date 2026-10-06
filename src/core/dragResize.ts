/**
 * Pointer-drag and resize primitives.
 *
 * Framework-agnostic on purpose: there is no Vue in this file, so the grid split resizer,
 * the sidebar drawer resizer and both floating-window resize implementations share one
 * mechanic that cannot drift apart. In react-dockable-desktop these had already drifted
 * four ways, differing in exactly the kind of detail (an inline style present in one and
 * missing in another) that caused a real user-visible bug.
 *
 * Exported publicly so applications can build their own resizable UI inside a panel with
 * the same behaviour as the library's own.
 */

// ── Pointer-capture drag mechanics ──────────────────────────────────────────

export interface PointerDragConfig<TStart> {
  /** The element to capture the pointer on — normally the handle the user grabbed. */
  element: HTMLElement;
  pointerId: number;
  /** The pointerdown event's clientX/clientY, used as the delta origin. */
  startClientX: number;
  startClientY: number;
  /** Snapshot whatever state the caller needs at drag start (sizes, positions, ...). */
  captureStart: () => TStart;
  /** Called on every pointermove with the delta from the drag's start position. */
  onMove: (dx: number, dy: number, start: TStart) => void;
  /** Called once when the drag ends (pointerup, or pointercancel and window blur when `onCancel` is absent). */
  onEnd?: (start: TStart) => void;
  /**
   * Called instead of `onEnd` when the drag is cancelled — a pointercancel, or the window losing
   * focus (1.5.1) — for a drag whose release does something a cancel must not.
   */
  onCancel?: (start: TStart) => void;
  /** Classes toggled on the given elements for the duration of the drag. */
  activeClasses?: Array<{ el: HTMLElement; classes: string[] }>;
}

/**
 * Starts a pointer-capture-based drag: captures the pointer on `element`, tracks
 * movement via listeners scoped to that element's own lifetime (not `window`), and
 * cleans up automatically on release or cancel.
 */
export function startPointerDrag<TStart>(config: PointerDragConfig<TStart>): void {
  const { element, pointerId, startClientX, startClientY, captureStart, onMove, onEnd, onCancel, activeClasses } = config;

  element.setPointerCapture(pointerId);
  activeClasses?.forEach(({ el, classes }) => el.classList.add(...classes));
  const start = captureStart();

  const handleMove = (e: PointerEvent) => {
    onMove(e.clientX - startClientX, e.clientY - startClientY, start);
  };

  const teardown = () => {
    activeClasses?.forEach(({ el, classes }) => el.classList.remove(...classes));
    element.removeEventListener('pointermove', handleMove);
    element.removeEventListener('pointerup', handleEnd);
    element.removeEventListener('pointercancel', handleCancel);
    window.removeEventListener('blur', handleCancel);
    document.removeEventListener('lostpointercapture', handleLostCapture, true);
  };
  const handleEnd = () => {
    teardown();
    onEnd?.(start);
  };
  const handleCancel = () => {
    teardown();
    (onCancel ?? onEnd)?.(start);
  };
  // Removing a capturing element fires lostpointercapture at the document, not the element (1.10.0),
  // so a drag whose element was removed mid-drag ends there. A normal release ends it first.
  const handleLostCapture = (e: PointerEvent) => { if (e.pointerId === pointerId) handleCancel(); };

  element.addEventListener('pointermove', handleMove);
  element.addEventListener('pointerup', handleEnd);
  element.addEventListener('pointercancel', handleCancel);
  // The window losing focus ends the drag, as a pointercancel does (1.5.1): after an alt-tab the
  // listeners and the active classes would otherwise outlive the gesture.
  window.addEventListener('blur', handleCancel);
  document.addEventListener('lostpointercapture', handleLostCapture, true);
}

// ── Reading direction ────────────────────────────────────────────────────────

/**
 * Whether `el` lays out right to left, as the browser computed it.
 *
 * A pointer delta is physical, but a flex row reverses under RTL, so a gesture that changes a
 * logical size or index has to know which way its own element runs. The element's computed
 * direction is the only source that is right everywhere: the sidebar and toolbar sit
 * *outside* the workspace, and take their direction from the host page, not from the
 * workspace's `dir`. Read it once, when the gesture starts.
 */
export function isRtlElement(el: Element | null | undefined): boolean {
  return !!el && getComputedStyle(el).direction === 'rtl'
}

/**
 * Which logical side of a tab the pointer is over: `'left'` means before it in tab order,
 * `'right'` after it — the meaning the insertion index and the RTL indicator CSS both use.
 * Under RTL the physical left half is the logical end.
 */
export function tabSide(clientX: number, rect: { left: number; width: number }, rtl: boolean): 'left' | 'right' {
  const physicalLeft = clientX - rect.left < rect.width / 2
  return physicalLeft !== rtl ? 'left' : 'right'
}

// ── 8-directional resize math ────────────────────────────────────────────────

export type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface ResizeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResizeConstraints {
  minW: number;
  minH: number;
  /** Upper bound on width — only applies to eastward growth (dir includes 'e'). */
  maxW?: number;
  /** Upper bound on height — only applies to southward growth (dir includes 's'). */
  maxH?: number;
  /** Lower bound on the resulting x — only applies to westward growth (dir includes 'w'). */
  minX?: number;
  /** Lower bound on the resulting y — only applies to northward growth (dir includes 'n'). */
  minY?: number;
}

/**
 * Pure function computing the new rect for an 8-directional resize handle drag.
 *
 * `maxW`/`maxH` and `minX`/`minY` are independent, direction-scoped constraints
 * rather than one "container bound" — a resize toward the fixed edge (e/s) is
 * naturally bounded by a maximum dimension, while a resize toward the moving edge
 * (w/n) is naturally bounded by a minimum position, and the two calling sites this
 * was extracted from need different subsets of these (a workspace floating window omits all four, so it may grow unbounded and be dragged
 * off-screen; a docked inner widget supplies all four to stay within its panel).
 */
export function computeResizedRect(dir: ResizeDir, dx: number, dy: number, start: ResizeRect, constraints: ResizeConstraints): ResizeRect {
  const { minW, minH, maxW, maxH, minX, minY } = constraints;
  let { x, y, w, h } = start;

  if (dir.includes('e')) {
    w = Math.max(minW, Math.min(start.w + dx, maxW ?? Infinity));
  }
  if (dir.includes('w')) {
    const maxDx = start.w - minW; // largest rightward (shrinking) delta before hitting minW
    const minDx = minX != null ? -(start.x - minX) : -Infinity; // most negative (growing) delta before x hits minX
    const clampedDx = Math.max(minDx, Math.min(dx, maxDx));
    w = start.w - clampedDx;
    x = start.x + clampedDx;
  }
  if (dir.includes('s')) {
    h = Math.max(minH, Math.min(start.h + dy, maxH ?? Infinity));
  }
  if (dir.includes('n')) {
    const maxDy = start.h - minH;
    const minDy = minY != null ? -(start.y - minY) : -Infinity;
    const clampedDy = Math.max(minDy, Math.min(dy, maxDy));
    h = start.h - clampedDy;
    y = start.y + clampedDy;
  }

  return { x, y, w, h };
}
