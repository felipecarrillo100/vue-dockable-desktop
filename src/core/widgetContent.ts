/**
 * The content elements of one overlay's managed widgets (7.11, widgets out of the panel).
 *
 * Each widget opened through `useFloatingWidgets()` gets **one** element,
 * `div.vdd-panel-float__content`, for its whole life. `<VddPanelOverlay>` teleports the
 * widget's component into it once; whatever shows the widget (its frame's body today, a hosted
 * panel's slot later) only moves the element in and out. So the frame can unmount and mount
 * again without the content noticing, exactly as a workspace panel survives its hosts
 * ([0002](../../docs/decisions/0002-zero-unmount-via-teleport.md)): the Teleport target is the
 * element, which exists from `open` to `close`, never a host that can disappear.
 *
 * The same rule as `PanelDomCache` (`./panelDom.ts`): an element is created **already in the document**,
 * in a hidden store, because a Teleport target must be connected when the teleport mounts, and
 * an element no slot is showing goes back there. One instance per overlay, never a module
 * singleton.
 */
import { moveInto } from './domMove'

export class WidgetContentCache {
  private elements = new Map<string, HTMLDivElement>()
  /**
   * The last on-screen scroll offset of each scrolled element inside a widget's content (7.11).
   * Moving the element between slots detaches it, which resets every offset inside it, so
   * offsets are recorded as they change and put back on attach, as rdd's `domPreservation` does
   * for the same element. Recorded continuously, because by the time a slot unmounts the
   * element may already be off screen and read 0.
   */
  private scrolls = new WeakMap<HTMLElement, Map<Element, { top: number; left: number }>>()
  private hidden: HTMLElement | null = null

  /** The document is resolved on first use, so constructing the cache touches nothing (SSR). */
  constructor(private readonly ownerDocument: () => Document = () => document) {}

  /** The off-screen store an element waits in while no slot shows it. */
  hiddenStore(): HTMLElement {
    if (!this.hidden || !this.hidden.isConnected) {
      const doc = this.ownerDocument()
      const el = doc.createElement('div')
      el.className = 'vdd-widget-store'
      el.style.display = 'none'
      doc.body.appendChild(el)
      this.hidden = el
    }
    return this.hidden
  }

  /** This widget's element, created (in the hidden store) on first ask. */
  elementFor(id: string): HTMLDivElement {
    let el = this.elements.get(id)
    if (!el) {
      el = this.ownerDocument().createElement('div')
      el.className = 'vdd-panel-float__content'
      const record = new Map<Element, { top: number; left: number }>()
      this.scrolls.set(el, record)
      el.addEventListener('scroll', (e) => {
        const target = e.target
        // An element being hidden or detached can report its reset to 0 as a scroll: ignored.
        if (!(target instanceof Element) || target.getClientRects().length === 0) return
        record.set(target, { top: target.scrollTop, left: target.scrollLeft })
      }, { capture: true, passive: true })
      this.hiddenStore().appendChild(el)
      this.elements.set(id, el)
    }
    return el
  }

  /** This widget's element, or `undefined` when it is not open. */
  get(id: string): HTMLDivElement | undefined {
    return this.elements.get(id)
  }

  /** Show `el` in `host`, with the scroll offsets it had inside. */
  attach(el: HTMLElement, host: HTMLElement): void {
    if (el.parentElement === host) return
    // With moveBefore() for a widget that keeps its embeds (rdd 7.11.0, see ./domMove.ts).
    moveInto(host, el)
    const record = this.scrolls.get(el)
    if (!record || record.size === 0) return
    const apply = () => record.forEach(({ top, left }, s) => {
      if (!s.isConnected) { record.delete(s); return }
      if (s.scrollTop !== top) s.scrollTop = top
      if (s.scrollLeft !== left) s.scrollLeft = left
    })
    apply()
    // Again next frame: a slot inside an element the workspace has not laid out yet (a hosted
    // panel's, on its first frame) cannot take an offset on the first pass.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply)
  }

  /**
   * Take `el` out of `host` into the hidden store, **only if it is still there**: another slot
   * may already have claimed it, so the order of one slot's unmount and the next one's mount
   * does not matter. A released element (a closed widget's) is already out of every host.
   */
  leave(el: HTMLElement, host: HTMLElement): void {
    if (el.parentElement === host) moveInto(this.hiddenStore(), el)
  }

  /** Forget a widget's element. Its content unmounts with its Teleport. */
  release(id: string): void {
    this.elements.get(id)?.remove()
    this.elements.delete(id)
  }

  /** Drop every element and the hidden store. Called when the overlay unmounts. */
  dispose(): void {
    for (const el of this.elements.values()) el.remove()
    this.elements.clear()
    this.hidden?.remove()
    this.hidden = null
  }
}
