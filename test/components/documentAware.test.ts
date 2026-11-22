/**
 * Document-aware internals (1.14.0, groundwork for pop-out windows). A port of rdd 7.12.1's
 * `DocumentAware.test.tsx` (DA1–DA18), ids prefixed `X` (`PO` is taken here).
 *
 * A panel's element can live in a same-origin child window while its code runs in the main
 * window's realm, so the library takes the document and window from the element it acts on. The
 * second window here is an `<iframe>`: jsdom gives it its own document, window and constructors,
 * as a real pop-out has (a `createHTMLDocument` document has no `defaultView`, so it cannot stand
 * in for a window).
 *
 * Vue creates its elements with the main `document` and they are adopted into the iframe's when
 * inserted there, exactly as a Teleport into a pop-out's body will do: their `ownerDocument` is the
 * iframe's, their prototype the main realm's. So geometry stubs for rendered chrome go on the main
 * `HTMLElement.prototype`, and nodes made with `doc.createElement` stand for the other realm's own.
 *
 * XDA1:  isNode / isElement / isHTMLElement accept a node of another window; instanceof does not
 * XDA2:  docOf / winOf: the node's own document and window; the main ones as the fallback
 * XDA3:  rafOf / cancelRafOf use the node's window's frames; the global ones for a main node
 * XDA4:  resizeObserverFor builds the observer from the node's window's constructor
 * XDA5:  registerDocument is counted, and listeners follow registrations (+ isRegistered,
 *        onDocumentsChange, focusedDocument)
 * XDA6:  a context menu opened from another document renders into its body and fits its window
 * XDA7:  Escape in a registered document closes the menu; in an unregistered one it does not;
 *        each document's Escape is its own
 * XDA8:  a pointerdown elsewhere in the menu's document closes it; one inside the menu does not
 * XDA9:  the context menu records its opener from its own document and hands focus back there
 * XDA10: menu arrow keys follow focus in the menu's own document
 * XDA11: panel focus is recorded and restored in the element's own document, on its window's frame
 * XDA11b: a managed widget's scroll offsets are recorded from scroll events there and put back
 * XDA12: a managed widget's drag and resize set and clear the body class on its own document
 * XDA13: the toolbar flyout portals into the button's document, fits that window, closes there
 * XDA14: isRtlElement asks the element's own window
 * XDA15: moveIntoWhenConnected waits on the slot's window's frames
 * XDA16: click-to-activate works in a registered document
 * XDA17: the panel search dropdown portals into the input's document and fits its window
 * XDA18: a panel toolbar measures itself with its own window's ResizeObserver
 * XDA19: a modal in the page does not answer an Escape pressed in another document
 * XDA20: a toast card's observer and entry frame come from its own window
 *
 * Not ported: DA6's "opened from the keyboard, sits at its target and takes its direction" (vdd's
 * menu opens where the caller says, and takes the workspace's `dir`: there is no target-relative
 * placement to make document-aware); DA13's "hands focus back to the button" (vdd's flyout does
 * not move focus into itself, so there is no focus to hand back); DA14's `isElementRtl` fallback
 * to the element's own document (vdd has no such helper: `isRtlElement` reads the computed style).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import type { Component } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { cancelRafOf, docOf, isElement, isHTMLElement, isNode, rafOf, resizeObserverFor, winOf } from '../../src/core/domContext'
import {
  focusedDocument, isRegistered, listenOnDocuments, onDocumentsChange, registerDocument,
} from '../../src/core/documentRegistry'
import { createWorkspace } from '../../src/core/workspace'
import { PanelDomCache } from '../../src/core/panelDom'
import { WidgetContentCache } from '../../src/core/widgetContent'
import { moveIntoWhenConnected, setPreserveEmbeds } from '../../src/core/domMove'
import { isRtlElement } from '../../src/core/dragResize'
import VddContextMenu from '../../src/components/VddContextMenu.vue'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddPanelOverlay from '../../src/components/VddPanelOverlay.vue'
import VddPanelToolbar from '../../src/components/VddPanelToolbar.vue'
import VddFloatingWidget from '../../src/components/VddFloatingWidget.vue'
import VddToolbar from '../../src/components/VddToolbar.vue'
import VddToolbarSearch from '../../src/components/VddToolbarSearch.vue'
import VddModals from '../../src/components/VddModals.vue'
import VddToastItem from '../../src/components/VddToastItem.vue'
import type { ToolbarItem } from '../../src/core/toolbarTypes'

type AnyWindow = Window & typeof globalThis

const frames: HTMLIFrameElement[] = []
const wrappers: VueWrapper[] = []
const cleanups: (() => void)[] = []

/** A second window: an iframe with its own document, window and DOM constructors. */
function otherWindow(): { win: AnyWindow; doc: Document } {
  const frame = document.createElement('iframe')
  document.body.appendChild(frame)
  frames.push(frame)
  return { win: frame.contentWindow as AnyWindow, doc: frame.contentDocument! }
}

/** A container in `doc`'s body. */
function hostIn(doc: Document): HTMLElement {
  const el = doc.createElement('div')
  doc.body.appendChild(el)
  return el
}

/** Mount `component` with a workspace behind it, into `container`. */
function render(component: Component, container: HTMLElement, props: Record<string, unknown> = {}, ws = createWorkspace({ panels: {} })) {
  const wrapper = mount(component, { props: props as never, global: { plugins: [ws] }, attachTo: container }) as VueWrapper
  wrappers.push(wrapper)
  return { ws, wrapper }
}

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  cleanups.splice(0).forEach(f => f())
  frames.splice(0).forEach(f => f.remove())
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const settle = async () => { await nextTick(); await nextTick() }

/** jsdom lays nothing out: a 100x50 box wherever an element's inline left/top put it. */
function boxesFromStyle(proto: typeof HTMLElement.prototype, at: { left: number; top: number } = { left: 0, top: 0 }) {
  return vi.spyOn(proto, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const left = this.style.left ? parseFloat(this.style.left) : at.left
    const top = this.style.top ? parseFloat(this.style.top) : at.top
    return { left, top, right: left + 100, bottom: top + 50, width: 100, height: 50, x: left, y: top, toJSON() {} } as DOMRect
  })
}

const sized = (win: AnyWindow, w: number, h: number) => {
  Object.defineProperty(win, 'innerWidth', { value: w, configurable: true })
  Object.defineProperty(win, 'innerHeight', { value: h, configurable: true })
}

const keydown = (win: AnyWindow, target: EventTarget, key: string) =>
  target.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

/** A context menu host in the main document, and its workspace. */
function mountMenu() {
  return render(VddContextMenu, hostIn(document))
}

const items = [{ label: 'One', action: () => {} }, { label: 'Two', action: () => {} }]

/** Opens the menu as an event from `target` would. */
async function openFrom(ws: ReturnType<typeof createWorkspace>, target: EventTarget, x = 10, y = 10, menuItems = items) {
  ws.showContextMenu({ event: { target, clientX: x, clientY: y, preventDefault() {} } as unknown as MouseEvent, items: menuItems })
  await settle()
}

describe('XDA1: node checks across windows', () => {
  it('accepts a node of another window, where instanceof does not', () => {
    const { doc } = otherWindow()
    const div = doc.createElement('div')
    expect(div instanceof HTMLElement).toBe(false)
    expect(div instanceof Element).toBe(false)
    expect(isNode(div)).toBe(true)
    expect(isElement(div)).toBe(true)
    expect(isHTMLElement(div)).toBe(true)
  })

  it('rejects what is not an element, or not an HTML one', () => {
    const { doc, win } = otherWindow()
    expect(isElement(doc.createTextNode('x'))).toBe(false)
    expect(isNode(doc.createTextNode('x'))).toBe(true)
    expect(isNode(win)).toBe(false)
    expect(isNode(null)).toBe(false)
    expect(isElement({ nodeType: 1 })).toBe(false)
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    expect(isElement(svg)).toBe(true)
    expect(isHTMLElement(svg)).toBe(false)
  })
})

describe('XDA2: docOf / winOf', () => {
  it("gives the node's own document and window", () => {
    const { doc, win } = otherWindow()
    const div = doc.createElement('div')
    expect(docOf(div)).toBe(doc)
    expect(docOf(doc)).toBe(doc)
    expect(winOf(div)).toBe(win)
    expect(winOf(div)).not.toBe(window)
  })

  it('falls back to the main document and window', () => {
    expect(docOf(null)).toBe(document)
    expect(winOf(undefined)).toBe(window)
    // A document with no window of its own (createHTMLDocument) is shown in none: the main one.
    const loose = document.implementation.createHTMLDocument('x')
    expect(docOf(loose.body)).toBe(loose)
    expect(winOf(loose.body)).toBe(window)
  })
})

describe('XDA3: rafOf / cancelRafOf', () => {
  it("uses the node's window's frames", () => {
    const { doc, win } = otherWindow()
    const own = vi.spyOn(win, 'requestAnimationFrame').mockReturnValue(7)
    const ownCancel = vi.spyOn(win, 'cancelAnimationFrame').mockImplementation(() => {})
    const main = vi.spyOn(window, 'requestAnimationFrame')
    const el = doc.createElement('div')
    const cb = () => {}
    expect(rafOf(el)!(cb)).toBe(7)
    expect(own).toHaveBeenCalledWith(cb)
    expect(main).not.toHaveBeenCalled()
    cancelRafOf(el)(7)
    expect(ownCancel).toHaveBeenCalledWith(7)
  })

  it('uses the global ones for a node of the main window', () => {
    const main = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(3)
    expect(rafOf(document.body)!(() => {})).toBe(3)
    expect(main).toHaveBeenCalledTimes(1)
  })
})

/** jsdom has no ResizeObserver: a main-window one, for the duration of a test. */
function mainObserver(): typeof ResizeObserver {
  const original = globalThis.ResizeObserver
  class MainObserver { constructor(_cb: ResizeObserverCallback) {} observe() {} unobserve() {} disconnect() {} }
  globalThis.ResizeObserver = MainObserver as unknown as typeof ResizeObserver
  cleanups.push(() => { globalThis.ResizeObserver = original })
  return MainObserver as unknown as typeof ResizeObserver
}

describe('XDA4: resizeObserverFor', () => {
  it("builds the observer from the node's window's constructor", () => {
    const Main = mainObserver()
    const { doc, win } = otherWindow()
    const built: ResizeObserverCallback[] = []
    class OwnObserver { constructor(cb: ResizeObserverCallback) { built.push(cb) } observe() {} unobserve() {} disconnect() {} }
    (win as unknown as { ResizeObserver: unknown }).ResizeObserver = OwnObserver
    const cb: ResizeObserverCallback = () => {}
    const ro = resizeObserverFor(doc.createElement('div'), cb)
    expect(ro).toBeInstanceOf(OwnObserver)
    expect(built).toEqual([cb])
    // A main-window node keeps the global one.
    expect(resizeObserverFor(document.body, cb)).toBeInstanceOf(Main)
  })

  it("falls back to the main window's when the node's window has none", () => {
    const Main = mainObserver()
    const { doc, win } = otherWindow()
    ;(win as unknown as { ResizeObserver: unknown }).ResizeObserver = undefined
    expect(resizeObserverFor(doc.createElement('div'), () => {})).toBeInstanceOf(Main)
  })
})

describe('XDA5: registerDocument', () => {
  it('is counted, and a listener follows registrations', () => {
    const { doc, win } = otherWindow()
    const add = vi.spyOn(doc, 'addEventListener')
    const remove = vi.spyOn(doc, 'removeEventListener')
    const seen: Event[] = []
    const stop = listenOnDocuments('keydown', e => seen.push(e))
    const press = () => keydown(win, doc.body, 'a')

    press()
    expect(seen).toHaveLength(0)                   // not registered yet
    const first = registerDocument(doc)
    const second = registerDocument(doc)
    expect(add).toHaveBeenCalledTimes(1)           // attached once, on the first registration
    press()
    expect(seen).toHaveLength(1)
    first()
    first()                                        // undoing one registration twice does nothing
    expect(remove).not.toHaveBeenCalled()
    press()
    expect(seen).toHaveLength(2)
    second()
    expect(remove).toHaveBeenCalledTimes(1)
    press()
    expect(seen).toHaveLength(2)

    // A listener added while a document is registered reaches it; stopping removes it.
    const again = registerDocument(doc)
    const late: Event[] = []
    const stopLate = listenOnDocuments('keydown', e => late.push(e))
    press()
    expect(late).toHaveLength(1)
    stopLate()
    press()
    expect(late).toHaveLength(1)
    again()
    stop()
  })

  it('registering the main document changes nothing', () => {
    const seen: Event[] = []
    const stop = listenOnDocuments('keydown', e => seen.push(e))
    const undo = registerDocument(document)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    undo()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(seen).toHaveLength(2)                   // still listened on after the undo
    stop()
  })

  it('tells who is registered, who joins and leaves, and which document has focus', () => {
    const { doc } = otherWindow()
    const changes = vi.fn()
    const stop = onDocumentsChange(changes)
    expect(isRegistered(document)).toBe(true)
    expect(isRegistered(doc)).toBe(false)
    const first = registerDocument(doc)
    const second = registerDocument(doc)
    expect(isRegistered(doc)).toBe(true)
    expect(changes).toHaveBeenCalledTimes(1)       // joined once
    vi.spyOn(doc, 'hasFocus').mockReturnValue(false)
    expect(focusedDocument()).toBe(document)
    vi.spyOn(doc, 'hasFocus').mockReturnValue(true)
    expect(focusedDocument()).toBe(doc)
    first()
    expect(changes).toHaveBeenCalledTimes(1)
    second()
    expect(changes).toHaveBeenCalledTimes(2)       // left once, on the last undo
    expect(isRegistered(doc)).toBe(false)
    expect(focusedDocument()).toBe(document)
    stop()
    registerDocument(doc)()
    expect(changes).toHaveBeenCalledTimes(2)       // stopped
  })
})

describe('XDA6: a context menu opened from another document', () => {
  it('renders into that body and fits that window', async () => {
    const { doc, win } = otherWindow()
    const anchor = hostIn(doc)
    sized(win, 300, 200)
    boxesFromStyle(HTMLElement.prototype, { left: 20, top: 20 })
    const { ws } = mountMenu()
    await openFrom(ws, anchor, 280, 10)
    const menu = doc.body.querySelector<HTMLElement>('.vdd-context-menu')
    expect(menu).not.toBeNull()
    expect(document.body.querySelector('.vdd-context-menu')).toBeNull()
    // Clamped to the other window's 300px (the main one is 1024 wide): 300 - 100 - 8.
    expect(menu!.style.left).toBe('192px')
  })

  it('opens its submenu there', async () => {
    const { doc, win } = otherWindow()
    sized(win, 300, 200)
    const { ws } = mountMenu()
    await openFrom(ws, doc.body, 10, 10, [{ label: 'More', items: [{ label: 'Inner', action: () => {} }] }] as never)
    const parent = doc.body.querySelector<HTMLElement>('.vdd-context-menu__item--has-submenu')!
    parent.click()
    await settle()
    expect(doc.body.querySelector('.vdd-context-menu--submenu')).not.toBeNull()
    expect(document.body.querySelector('.vdd-context-menu--submenu')).toBeNull()
  })

  it('stays on the main body when opened from the main document', async () => {
    const { ws } = mountMenu()
    await openFrom(ws, document.body)
    expect(document.body.querySelector('.vdd-context-menu')).not.toBeNull()
  })
})

describe('XDA7: Escape in another document', () => {
  it('closes the menu when that document is registered', async () => {
    const { doc, win } = otherWindow()
    const { ws } = mountMenu()
    await openFrom(ws, doc.body)
    keydown(win, doc.body, 'Escape')
    await settle()
    expect(doc.body.querySelector('.vdd-context-menu')).not.toBeNull()  // not registered: unheard

    cleanups.push(registerDocument(doc))
    keydown(win, doc.body, 'Escape')
    await settle()
    expect(doc.body.querySelector('.vdd-context-menu')).toBeNull()
  })

  it("is that document's own: an Escape in the page leaves a menu there open", async () => {
    const { doc } = otherWindow()
    cleanups.push(registerDocument(doc))
    const { ws } = mountMenu()
    await openFrom(ws, doc.body)
    keydown(window, document.body, 'Escape')
    await settle()
    expect(doc.body.querySelector('.vdd-context-menu')).not.toBeNull()
  })

  it("and the page's menu stays through an Escape in the other document", async () => {
    const { doc, win } = otherWindow()
    cleanups.push(registerDocument(doc))
    const { ws } = mountMenu()
    await openFrom(ws, document.body)
    keydown(win, doc.body, 'Escape')
    await settle()
    expect(document.body.querySelector('.vdd-context-menu')).not.toBeNull()
    keydown(window, document.body, 'Escape')
    await settle()
    expect(document.body.querySelector('.vdd-context-menu')).toBeNull()
  })
})

describe('XDA8: outside clicks in the menu document', () => {
  it('a pointerdown elsewhere there closes it; one inside does not', async () => {
    const { doc, win } = otherWindow()
    const { ws } = mountMenu()
    const elsewhere = hostIn(doc)
    await openFrom(ws, elsewhere)
    const menu = doc.body.querySelector('.vdd-context-menu')!
    menu.querySelector('button')!.dispatchEvent(new win.Event('pointerdown', { bubbles: true }))
    await settle()
    expect(doc.body.querySelector('.vdd-context-menu')).not.toBeNull()
    elsewhere.dispatchEvent(new win.Event('pointerdown', { bubbles: true }))
    await settle()
    expect(doc.body.querySelector('.vdd-context-menu')).toBeNull()
  })
})

describe('XDA9: the opener in another document', () => {
  it('gets focus back when the menu closes from inside', async () => {
    const { doc, win } = otherWindow()
    const opener = doc.createElement('button')
    doc.body.appendChild(opener)
    opener.focus()
    expect(doc.activeElement).toBe(opener)
    // The main document has focus elsewhere: it must not count.
    const mainInput = document.createElement('input')
    document.body.appendChild(mainInput)
    mainInput.focus()

    const { ws } = mountMenu()
    await openFrom(ws, opener)
    const menu = doc.body.querySelector<HTMLElement>('.vdd-context-menu')!
    expect(doc.activeElement).toBe(menu)
    keydown(win, menu, 'Tab')
    await settle()
    expect(doc.body.querySelector('.vdd-context-menu')).toBeNull()
    expect(doc.activeElement).toBe(opener)
  })
})

describe('XDA10: menu arrow keys in another document', () => {
  it("move from the item focused in the menu's own document", async () => {
    const { doc, win } = otherWindow()
    const { ws } = mountMenu()
    await openFrom(ws, doc.body, 10, 10, [
      { label: 'a', action: () => {} }, { label: 'b', action: () => {} }, { label: 'c', action: () => {} },
    ])
    const menu = doc.body.querySelector<HTMLElement>('.vdd-context-menu')!
    const [, b, c] = Array.from(menu.querySelectorAll<HTMLElement>('button'))
    b!.focus()
    expect(doc.activeElement).toBe(b)
    keydown(win, b!, 'ArrowDown')
    expect(doc.activeElement).toBe(c)
  })
})

describe('XDA11: panel focus restore in another document', () => {
  it("records focus there, and restores it on that window's frame", () => {
    const { doc, win } = otherWindow()
    // jsdom lays nothing out: report the nodes as on screen.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const frame = vi.spyOn(win, 'requestAnimationFrame').mockReturnValue(1)
    const mainFrame = vi.spyOn(window, 'requestAnimationFrame')
    const cache = new PanelDomCache()
    cleanups.push(() => cache.dispose())
    const first = hostIn(doc)
    const second = hostIn(doc)
    cache.moveTo('p', first)
    const root = cache.elementFor('p')
    const field = doc.createElement('input')
    root.appendChild(field)
    field.focus()
    expect(doc.activeElement).toBe(field)
    // Focus in the main document is elsewhere; that is not the panel's document.
    const mainInput = document.createElement('input')
    document.body.appendChild(mainInput)
    mainInput.focus()
    const refocus = vi.spyOn(field, 'focus')
    frame.mockClear()                              // the first move's own second pass

    cache.moveTo('p', second, { refocus: true })
    expect(refocus).toHaveBeenCalled()
    expect(frame).toHaveBeenCalledTimes(1)
    expect(mainFrame).not.toHaveBeenCalled()
  })
})

describe("XDA11b: a managed widget's scroll offsets in another document", () => {
  it('are recorded from scroll events there and put back', () => {
    const { doc, win } = otherWindow()
    vi.spyOn(win.Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const frame = vi.spyOn(win, 'requestAnimationFrame').mockReturnValue(1)
    const cache = new WidgetContentCache()
    cleanups.push(() => cache.dispose())
    const el = cache.elementFor('w')
    const host = hostIn(doc)
    cache.attach(el, host)
    const list = doc.createElement('div')
    let top = 0
    Object.defineProperty(list, 'scrollTop', { get: () => top, set: (v: number) => { top = v }, configurable: true })
    el.appendChild(list)
    top = 120
    list.dispatchEvent(new win.Event('scroll'))
    top = 0                                        // the move reset it
    cache.leave(el, host)
    const next = hostIn(doc)
    cache.attach(el, next)
    expect(top).toBe(120)
    expect(frame).toHaveBeenCalled()               // the second pass, on that window's frame
  })
})

describe("XDA12: a managed widget's drag in another document", () => {
  const Widget = defineComponent({
    components: { VddPanelOverlay, VddFloatingWidget },
    template: '<VddPanelOverlay><VddFloatingWidget widget-id="da12" title="W"><span /></VddFloatingWidget></VddPanelOverlay>',
  })
  const pointer = (win: AnyWindow, type: string, x: number) =>
    new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: 10, button: 0 })

  it('sets and clears the body class there, not on the main body', async () => {
    const { doc, win } = otherWindow()
    render(Widget, hostIn(doc))
    await settle()
    const frame = doc.querySelector<HTMLElement>('.vdd-panel-float')!
    frame.setPointerCapture = vi.fn()
    const header = frame.querySelector('[data-vdd-widget-header]')!
    header.dispatchEvent(pointer(win, 'pointerdown', 10))
    frame.dispatchEvent(pointer(win, 'pointermove', 60))
    await settle()
    expect(doc.body.classList.contains('vdd-dragging-active')).toBe(true)
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)
    frame.dispatchEvent(pointer(win, 'pointerup', 60))
    await settle()
    expect(doc.body.classList.contains('vdd-dragging-active')).toBe(false)
  })

  it('a resize sets the resizing class there too', async () => {
    const { doc, win } = otherWindow()
    render(Widget, hostIn(doc))
    await settle()
    const handle = doc.querySelector<HTMLElement>('.vdd-resize-handle')!
    handle.setPointerCapture = vi.fn()
    handle.dispatchEvent(pointer(win, 'pointerdown', 10))
    expect(doc.body.classList.contains('vdd-resizing-active')).toBe(true)
    expect(document.body.classList.contains('vdd-resizing-active')).toBe(false)
    handle.dispatchEvent(pointer(win, 'pointerup', 10))
    expect(doc.body.classList.contains('vdd-resizing-active')).toBe(false)
  })

  it("a resize ends when the handle's own window loses focus", async () => {
    const { doc, win } = otherWindow()
    render(Widget, hostIn(doc))
    await settle()
    const handle = doc.querySelector<HTMLElement>('.vdd-resize-handle')!
    handle.setPointerCapture = vi.fn()
    handle.dispatchEvent(pointer(win, 'pointerdown', 10))
    win.dispatchEvent(new win.Event('blur'))
    expect(doc.body.classList.contains('vdd-resizing-active')).toBe(false)
  })
})

describe('XDA13: the toolbar flyout in another document', () => {
  const Icon = defineComponent({ setup: () => () => h('svg') })
  const groupItems: ToolbarItem[] = [{
    type: 'group', id: 'g', label: 'Group', defaultIcon: Icon,
    items: [{ id: 'a', label: 'A', icon: Icon }, { id: 'b', label: 'B', icon: Icon }],
  }]

  const openIn = async (position: 'right' | 'top', setup?: (win: AnyWindow) => void) => {
    const { doc, win } = otherWindow()
    setup?.(win)
    render(VddToolbar, hostIn(doc), { items: groupItems, position })
    const btn = doc.querySelector<HTMLButtonElement>('button.vdd-toolbar-btn-group')!
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    await settle()
    return { doc, win, btn, flyout: doc.body.querySelector<HTMLElement>('.vdd-toolbar-group-flyout') }
  }

  it("portals into the button's body and closes on a press there", async () => {
    const { doc, win, flyout } = await openIn('top')
    expect(flyout).not.toBeNull()
    expect(document.body.querySelector('.vdd-toolbar-group-flyout')).toBeNull()
    doc.body.dispatchEvent(new win.Event('pointerdown', { bubbles: true }))
    await settle()
    expect(doc.body.querySelector('.vdd-toolbar-group-flyout')).toBeNull()
  })

  it("is placed with the button's window size", async () => {
    // Beside a right-hand strip: `right` is measured from that window's width (300 - 20 + 8).
    const { flyout } = await openIn('right', win => { sized(win, 300, 200); boxesFromStyle(HTMLElement.prototype, { left: 20, top: 20 }) })
    expect(flyout!.style.right).toBe('288px')
  })

  it("is clamped into the button's window", async () => {
    // Below a top strip at x 250: its right edge (350) passes that window's 300, so 300 - 100 - 8.
    const { flyout } = await openIn('top', win => { sized(win, 300, 200); boxesFromStyle(HTMLElement.prototype, { left: 250, top: 20 }) })
    expect(flyout!.style.left).toBe('192px')
  })

  it("answers an Escape in the button's document only", async () => {
    const { doc, win } = await openIn('top')
    cleanups.push(registerDocument(doc))
    keydown(window, document.body, 'Escape')
    await settle()
    expect(doc.body.querySelector('.vdd-toolbar-group-flyout')).not.toBeNull()
    keydown(win, doc.body, 'Escape')
    await settle()
    expect(doc.body.querySelector('.vdd-toolbar-group-flyout')).toBeNull()
  })
})

describe('XDA14: rtl helpers', () => {
  it("isRtlElement asks the element's own window", () => {
    const { doc, win } = otherWindow()
    const el = doc.createElement('div')
    doc.body.appendChild(el)
    const own = vi.spyOn(win, 'getComputedStyle').mockReturnValue({ direction: 'rtl' } as CSSStyleDeclaration)
    expect(isRtlElement(el)).toBe(true)
    expect(own).toHaveBeenCalledWith(el)
  })
})

describe('XDA15: moveIntoWhenConnected', () => {
  it("waits on the slot's window's frames", async () => {
    const { doc, win } = otherWindow()
    const own = vi.spyOn(win, 'requestAnimationFrame').mockReturnValue(1)
    const main = vi.spyOn(window, 'requestAnimationFrame')
    const slot = doc.createElement('div')           // not connected yet
    const el = doc.createElement('div')
    doc.body.appendChild(el)
    setPreserveEmbeds(el, true)
    const cancel = moveIntoWhenConnected(slot, el)
    await Promise.resolve()                         // the first attempt waits a microtask
    expect(own).toHaveBeenCalledTimes(1)
    expect(main).not.toHaveBeenCalled()
    cancel()
  })
})

describe('XDA16: click-to-activate in a registered document', () => {
  it('a pointerdown in a panel shown there makes it the active one', async () => {
    const P = defineComponent({ setup: () => () => h('div') })
    const ws = createWorkspace({ panels: { p: { component: P } } })
    render(VddDesktop, hostIn(document), {}, ws)
    ws.openPanel('a', 'p')
    ws.openPanel('b', 'p')
    ws.focusPanel('b')
    await settle()
    expect(ws.state.activePanelId).toBe('b')

    const { doc, win } = otherWindow()
    const pane = doc.createElement('div')
    pane.className = 'vdd-workspace-panel'
    pane.setAttribute('data-active-panel-id', 'a')
    const inner = doc.createElement('span')
    pane.appendChild(inner)
    doc.body.appendChild(pane)
    const press = () => inner.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, button: 0 }))

    press()
    expect(ws.state.activePanelId).toBe('b')       // not registered: unheard
    cleanups.push(registerDocument(doc))
    press()
    expect(ws.state.activePanelId).toBe('a')
  })
})

describe('XDA17: the panel search dropdown in another document', () => {
  it("portals into the input's body and fits that window", async () => {
    vi.useFakeTimers()
    const { doc, win } = otherWindow()
    sized(win, 300, 200)
    boxesFromStyle(HTMLElement.prototype, { left: 200, top: 20 })   // 200..300: a 240-wide dropdown overflows
    const results = [{ id: 'r', label: 'Result' }]
    render(VddToolbarSearch, hostIn(doc), { search: () => results })
    doc.querySelector<HTMLButtonElement>('[data-vdd-search-toggle]')!.click()
    await nextTick()
    const input = doc.querySelector<HTMLInputElement>('[data-vdd-search-input]')!
    input.value = 'map'
    input.dispatchEvent(new win.Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(300)
    await nextTick()
    const dropdown = doc.body.querySelector<HTMLElement>('.vdd-panel-toolbar-search__dropdown')
    expect(dropdown).not.toBeNull()
    expect(document.body.querySelector('.vdd-panel-toolbar-search__dropdown')).toBeNull()
    expect(dropdown!.style.left).toBe('52px')      // 300 - 240 - 8
  })
})

describe("XDA18: a panel toolbar's ResizeObserver", () => {
  it("comes from the toolbar's own window", async () => {
    const { doc, win } = otherWindow()
    const observed: Element[] = []
    class OwnObserver { constructor(_cb: ResizeObserverCallback) {} observe(el: Element) { observed.push(el) } unobserve() {} disconnect() {} }
    (win as unknown as { ResizeObserver: unknown }).ResizeObserver = OwnObserver
    const Toolbar = defineComponent({
      components: { VddPanelOverlay, VddPanelToolbar },
      template: '<VddPanelOverlay><VddPanelToolbar position="top"><span /></VddPanelToolbar></VddPanelOverlay>',
    })
    render(Toolbar, hostIn(doc))
    await settle()
    expect(observed.some(el => el.classList.contains('vdd-panel-toolbar'))).toBe(true)
  })
})

describe('XDA19: a modal in the page and an Escape elsewhere', () => {
  it('stays open through an Escape in another registered document, and closes on one in the page', async () => {
    const Content = defineComponent({ setup: () => () => h('div', 'content') })
    const { ws } = render(VddModals, hostIn(document))
    ws.overlays.openModal(Content, {}, { title: 'M' })
    await settle()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ws.overlays.state.modals).toHaveLength(1)

    const { doc, win } = otherWindow()
    cleanups.push(registerDocument(doc))
    keydown(win, doc.body, 'Escape')
    await settle()
    expect(ws.overlays.state.modals).toHaveLength(1)
    keydown(window, document.body, 'Escape')
    await settle()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ws.overlays.state.modals).toHaveLength(0)
  })
})

describe("XDA20: a toast card's observer and frame", () => {
  it('come from its own window', async () => {
    const { doc, win } = otherWindow()
    const observed: Element[] = []
    class OwnObserver { constructor(_cb: ResizeObserverCallback) {} observe(el: Element) { observed.push(el) } unobserve() {} disconnect() {} }
    (win as unknown as { ResizeObserver: unknown }).ResizeObserver = OwnObserver
    const own = vi.spyOn(win, 'requestAnimationFrame').mockReturnValue(1)
    const main = vi.spyOn(window, 'requestAnimationFrame')
    render(VddToastItem, hostIn(doc), {
      toast: { id: 't', message: 'Hi', options: { id: 't' }, exiting: false, revision: 0 },
      isLeft: false, showProgress: false, pauseOnHover: false, animation: 'slide', defaultDuration: 0, defaultClosable: true,
    })
    await settle()
    expect(observed.some(el => el.classList.contains('vdd-toast__body'))).toBe(true)
    expect(own).toHaveBeenCalled()
    expect(main).not.toHaveBeenCalled()
  })
})
