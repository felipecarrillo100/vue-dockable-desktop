/**
 * The persistence port: the mechanism that makes a panel survive being moved.
 *
 * Each panel gets **one** element for its whole lifetime. Panel content is teleported into
 * that element once; moving the panel between the grid, a floating window, a hover preview
 * and the off-screen store moves *the element*, which Vue never observes. That is what keeps
 * a WebGL context, a Monaco model, a playing video and an open socket alive across every
 * layout change.
 *
 * Proven in the M0 spike, including the choice of this strategy over teleporting straight to
 * the host — see docs/decisions/0002-zero-unmount-via-teleport.md. One instance per
 * `<VddDesktop>`, never a module-level singleton: rdd's module-level `domCache` meant two
 * workspaces on a page shared panel DOM.
 */

import { shallowReactive } from 'vue'
import type { WidgetContentCache } from './widgetContent'
import { moveInto, preservesEmbeds, setPreserveEmbeds } from './domMove'

/**
 * What a hosted panel shows (7.11): the content element of the managed widget it hosts, and the
 * widget's own cache, whose hidden store the element goes back to when no slot shows it.
 */
export interface HostedContent {
  el: HTMLElement
  cache: WidgetContentCache
}

/** Scroll offsets and focus captured from a panel's subtree. */
interface Preserved {
  scrolls: { el: Element; top: number; left: number }[]
  focus: { el: HTMLElement; start: number | null; end: number | null } | null
}

/** Does this element currently participate in layout? */
function isLaidOut(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0
}

function scrollables(root: Element): Element[] {
  const out: Element[] = []
  const walk = (el: Element) => {
    if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) out.push(el)
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(root)
  return out
}

export class PanelDomCache {
  private elements = new Map<string, HTMLDivElement>()
  /**
   * Preserved state, **owned per panel and outliving the hidden period**.
   *
   * Capturing at each move is not enough: while a panel sits in the hidden store it has no
   * layout, so every scroller reports `scrollHeight === clientHeight === 0` and there is
   * nothing to read. So the record is only refreshed while the panel is laid out, and always
   * applied when it becomes laid out again — which is what makes minimise → restore work.
   * M0 verified this failing, then fixed.
   */
  private preserved = new Map<string, Preserved>()
  /**
   * The last size each panel was laid out at.
   *
   * Kept here because it outlives any one host: the taskbar's hover preview needs to know how
   * big a panel *was* in order to scale a thumbnail of it, and by then the panel is minimised
   * and has no size of its own.
   */
  private sizes = new Map<string, { width: number; height: number }>()
  private hidden: HTMLElement | null = null
  /**
   * Each hosted panel's content, by panel id (7.11), registered by the widget's overlay
   * **before** it opens the panel and cleared after it removes it. Reactive, so a hosted panel's
   * slot follows it: a widget closed and re-opened out of its panel in one tick gets a new
   * element under the same panel id, and the slot shows the new one.
   */
  private hosted = shallowReactive(new Map<string, HostedContent>())
  /**
   * The content element each hosted panel showed last, kept after its registration is cleared:
   * a hosted panel is removed (and so cleared) before its element is released, and an element that
   * keeps its embeds must be taken out of it before then (rdd 7.11.0, `preserveEmbeds`).
   */
  private lastHosted = new Map<string, HTMLElement>()

  /**
   * The document is looked up on first use, not in a parameter default: constructing the cache
   * then touches nothing, so `<VddDesktop>` can be set up where there is no DOM (server
   * rendering) as long as no panel element is asked for.
   */
  constructor(private readonly ownerDocument?: Document) {}

  private get doc(): Document {
    return this.ownerDocument ?? document
  }

  /** The off-screen store. Panels live here while minimised, and before their first host. */
  hiddenStore(): HTMLElement {
    if (!this.hidden || !this.hidden.isConnected) {
      const el = this.doc.createElement('div')
      el.className = 'vdd-panel-store'
      el.style.display = 'none'
      this.doc.body.appendChild(el)
      this.hidden = el
    }
    return this.hidden
  }

  /**
   * This panel's element, created on first ask.
   *
   * Created **already in the document**, inside the hidden store: a `<Teleport>` target must
   * exist when the teleport mounts, or Vue warns and renders nothing.
   */
  elementFor(id: string): HTMLDivElement {
    let el = this.elements.get(id)
    if (!el) {
      el = this.doc.createElement('div')
      el.className = 'vdd-panel-mount'
      el.setAttribute('data-vdd-panel', id)
      this.hiddenStore().appendChild(el)
      this.elements.set(id, el)
    }
    return el
  }

  /** Whether this panel has an element yet. */
  has(id: string): boolean {
    return this.elements.has(id)
  }

  /** Record the size a panel was last laid out at. */
  reportSize(id: string, size: { width: number; height: number }): void {
    this.sizes.set(id, size)
  }

  /** The size a panel was last laid out at, or a sensible default for a thumbnail. */
  sizeOf(id: string): { width: number; height: number } {
    return this.sizes.get(id) ?? { width: 800, height: 500 }
  }

  /** The host this panel's element is currently inside. */
  hostOf(id: string): HTMLElement | null {
    return this.elements.get(id)?.parentElement ?? null
  }

  /**
   * Move a panel's element into `host` (or the hidden store when `null`), preserving scroll
   * and focus around the move.
   *
   * @param refocus restore focus as well. Only true when the panel is becoming the active
   *   one — restoring focus into a background panel would steal the caret from wherever the
   *   user is actually typing.
   */
  moveTo(id: string, host: HTMLElement | null, options?: { refocus?: boolean; preserveScroll?: boolean }): void {
    const el = this.elementFor(id)
    const target = host ?? this.hiddenStore()
    if (el.parentElement === target) return

    const preserve = options?.preserveScroll !== false
    if (preserve) this.remember(id, el)
    // With moveBefore() for an element that keeps its embeds (see ./domMove.ts).
    moveInto(target, el)
    if (preserve) this.apply(id, el, options?.refocus === true)
  }

  /**
   * Marks a panel's element as keeping its embeds alive when it moves (rdd 7.11.0): a panel type
   * with `preserveEmbeds` (its slot marks it), and a widget with it, its owner panel's element and
   * its hosted panel's. Only switches on.
   */
  preserveEmbeds(id: string): void {
    setPreserveEmbeds(this.elementFor(id), true)
  }

  /** A hosted panel's content, or `undefined` (an ordinary panel, or none registered). */
  hostedContent(id: string): HostedContent | undefined {
    return this.hosted.get(id)
  }

  /** Register (or, with `null`, clear) the content a hosted panel shows. */
  setHostedContent(id: string, content: HostedContent | null): void {
    if (content) {
      this.hosted.set(id, content)
      this.lastHosted.set(id, content.el)
    } else {
      this.hosted.delete(id)
    }
  }

  /** Forget a panel entirely. Called when the panel closes. */
  release(id: string): void {
    const el = this.elements.get(id)
    // A widget's content that keeps its embeds is still inside its hosted panel's element (the
    // slot that shows it unmounts after this): parked first, connected, so its next slot can
    // take it with moveBefore() instead of re-inserting it.
    const inner = this.lastHosted.get(id)
    if (el && inner && preservesEmbeds(inner) && el.contains(inner)) moveInto(this.hiddenStore(), inner)
    this.lastHosted.delete(id)
    el?.remove()
    this.elements.delete(id)
    this.preserved.delete(id)
    this.sizes.delete(id)
  }

  /** Drop every element and the hidden store. */
  dispose(): void {
    for (const el of this.elements.values()) el.remove()
    this.elements.clear()
    this.preserved.clear()
    this.sizes.clear()
    this.hosted.clear()
    this.lastHosted.clear()
    this.hidden?.remove()
    this.hidden = null
  }

  // ── ADR 0014 ───────────────────────────────────────────────────────────────

  private remember(id: string, el: HTMLElement): void {
    if (!isLaidOut(el)) return               // nothing meaningful to read; keep what we have
    const scrolls = scrollables(el).map(s => ({ el: s, top: s.scrollTop, left: s.scrollLeft }))
    let focus: Preserved['focus'] = null
    const active = this.doc.activeElement as HTMLElement | null
    if (active && el.contains(active)) {
      const field = active as HTMLInputElement
      const hasSelection = 'selectionStart' in field && field.selectionStart !== null
      focus = {
        el: active,
        start: hasSelection ? field.selectionStart : null,
        end: hasSelection ? field.selectionEnd : null,
      }
    }
    this.preserved.set(id, { scrolls, focus })
  }

  private apply(id: string, el: HTMLElement, refocus: boolean): void {
    const record = this.preserved.get(id)
    if (!record) return
    const run = () => {
      for (const s of record.scrolls) { s.el.scrollTop = s.top; s.el.scrollLeft = s.left }
      if (refocus && record.focus) {
        record.focus.el.focus({ preventScroll: true })
        if (record.focus.start !== null) {
          try {
            (record.focus.el as HTMLInputElement).setSelectionRange(record.focus.start, record.focus.end ?? record.focus.start)
          } catch { /* the element does not support selection */ }
        }
      }
    }
    if (isLaidOut(el)) run()
    // Again next frame: on the way out of the hidden store the subtree has not been laid out
    // yet, so the synchronous attempt cannot stick.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (isLaidOut(el)) run() })
  }
}
