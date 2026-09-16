/**
 * M0 spike — the zero-unmount mechanism, two candidate strategies.
 *
 * S1 "cache"    — Teleport to a stable per-panel cache element; move that element imperatively.
 *                 (Direct analogue of what react-dockable-desktop does with createPortal.)
 * S2 "teleport" — Teleport straight to the host element and change `to` reactively, letting
 *                 Vue move the nodes. If this preserves state it is strictly better: no
 *                 imperative DOM work at all.
 *
 * Also implements ADR 0014: scroll offsets and focus are browser state that detaching
 * discards, so they are captured before a move and restored after.
 */

export type Strategy = 'cache' | 'teleport'

const HIDDEN_ID = 'vdd-spike-hidden'

export function hiddenContainer(): HTMLElement {
  let el = document.getElementById(HIDDEN_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = HIDDEN_ID
    el.style.display = 'none'
    document.body.appendChild(el)
  }
  return el
}

const cache = new Map<string, HTMLDivElement>()

/** A stable element per panel, in the document from creation so Teleport can target it. */
export function cacheEl(id: string): HTMLDivElement {
  let el = cache.get(id)
  if (!el) {
    el = document.createElement('div')
    el.dataset.vddCache = id
    el.style.width = '100%'
    el.style.height = '100%'
    hiddenContainer().appendChild(el)
    cache.set(id, el)
  }
  return el
}

// ── ADR 0014: preserve scroll + focus across a re-parent ─────────────────────

interface Preserved {
  scrolls: Array<{ el: Element; top: number; left: number }>
  focus: { el: HTMLElement; start: number | null; end: number | null } | null
}

function scrollables(root: Element): Element[] {
  const out: Element[] = []
  const walk = (el: Element) => {
    if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) out.push(el)
    for (const c of Array.from(el.children)) walk(c)
  }
  walk(root)
  return out
}

/**
 * Preserved state is owned per panel and outlives the hidden period.
 *
 * Capturing at each move is not enough: while a panel sits in the `display:none` container
 * it has no layout, so every scroller reports `scrollHeight === clientHeight === 0` and
 * there is nothing to capture. Restoring on the way back out would then restore nothing.
 * So the record is only *refreshed* while the panel is visible, and always *applied* when
 * it becomes visible again — which makes minimise → restore work, the case that matters most.
 */
const preserved = new Map<string, Preserved>()

/** Does this element currently participate in layout? */
function isLaidOut(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0
}

/** Refresh the stored record, but only while there is real state to read. */
export function rememberIfVisible(id: string, el: HTMLElement): void {
  if (isLaidOut(el)) preserved.set(id, capture(el))
}

/** Apply the stored record, once the element is laid out again. */
export function applyRemembered(id: string, el: HTMLElement, refocus: boolean): void {
  const p = preserved.get(id)
  if (!p) return
  if (isLaidOut(el)) restore(p, { refocus })
  else requestAnimationFrame(() => { if (isLaidOut(el)) restore(p, { refocus }) })
}

export function capture(root: Element | null): Preserved {
  if (!root) return { scrolls: [], focus: null }
  const scrolls = scrollables(root).map(el => ({ el, top: el.scrollTop, left: el.scrollLeft }))
  let focus: Preserved['focus'] = null
  const active = document.activeElement as HTMLElement | null
  if (active && root.contains(active)) {
    const f = active as HTMLInputElement
    const supportsSelection = 'selectionStart' in f && f.selectionStart !== null
    focus = {
      el: active,
      start: supportsSelection ? f.selectionStart : null,
      end: supportsSelection ? f.selectionEnd : null,
    }
  }
  return { scrolls, focus }
}

/** Restore after the browser has laid the subtree out again. */
export function restore(p: Preserved, opts: { refocus: boolean }): void {
  const apply = () => {
    for (const s of p.scrolls) { s.el.scrollTop = s.top; s.el.scrollLeft = s.left }
    if (opts.refocus && p.focus) {
      p.focus.el.focus({ preventScroll: true })
      if (p.focus.start !== null) {
        try { (p.focus.el as HTMLInputElement).setSelectionRange(p.focus.start, p.focus.end ?? p.focus.start) } catch { /* unsupported */ }
      }
    }
  }
  apply()                              // synchronous attempt
  requestAnimationFrame(apply)         // and again once layout has settled
}

/** S1: move the panel's cache element into `host`, preserving scroll + focus. */
export function moveCacheEl(id: string, host: HTMLElement | null, refocus: boolean): void {
  const el = cacheEl(id)
  rememberIfVisible(id, el)
  ;(host ?? hiddenContainer()).appendChild(el)
  applyRemembered(id, el, refocus)
}
