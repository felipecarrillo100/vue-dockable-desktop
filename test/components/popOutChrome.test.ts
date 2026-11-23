/**
 * What the library renders into a pop-out besides the panel (1.14.0, rdd 7.12.1's
 * `PopOutChrome.test.tsx`, ids prefixed `X`): the app's popoutWrapper around the frame, a menu and
 * toasts shown there; toasts in the window the user is in; and when the four events arrive. The
 * pop-out is an `<iframe>`'s window, handed back by a stubbed `window.open`.
 *
 * XPC1: the wrapper is around the frame and a menu shown in the pop-out, with that window; not
 *       around a menu in the page; none without a wrapper
 * XPC2: a toast raised while the pop-out has focus shows there (inside the wrapper); otherwise in
 *       the page; the same id updates in place, in its window; the window closing removes it; a
 *       queued toast whose window closed shows in the page; maxVisible counts every window
 * XPC3: when the four events arrive: panel:popping-out in the click, with the element still in
 *       the page (with popoutUrl too, before the page loads); panel:popped-out once it is in the
 *       window and a frame has passed; panel:returning with it still in the window,
 *       panel:returned once it is back in the page and laid out; a window that fails sends
 *       popping-out then returned; none for a refused pop-out, a panel closed while out, or with
 *       popOut off; an event for a replaced pop-out or return is dropped; sent anyway after the
 *       limit
 * XPC4: a toolbar flyout opened in a popped-out panel is in the panel's own tree: the wrapper's
 *       provide (the pop-out's document) reaches its items' icons, with nothing added for it
 * XPC5: data-vdd-popout-kind="panel" on a panel's frame (a widget's: P5)
 *
 * vdd: `<VddContextMenu>` and `<VddToasts>` are mounted beside `<VddDesktop>`, as an app does, so
 * the wrapper reaches them by their document, not by provide/inject (rdd moved its provider outside
 * the menu's).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { computed, defineComponent, h, inject, nextTick, provide } from 'vue'
import type { ComputedRef, InjectionKey, PropType } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace, resetToasts, toast, VddToolbar } from '../../src'
import type { ToolbarItem, Workspace } from '../../src'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddContextMenu from '../../src/components/VddContextMenu.vue'
import VddToasts from '../../src/components/VddToasts.vue'
import { POPOUT_PLACED_TIMEOUT_MS } from '../../src/core/popOutWindows'

type AnyWindow = Window & typeof globalThis
const frames: HTMLIFrameElement[] = []

function popup(): { win: AnyWindow; doc: Document; focused(on: boolean): void } {
  const frame = document.createElement('iframe')
  document.body.appendChild(frame)
  frames.push(frame)
  const win = frame.contentWindow as AnyWindow
  const doc = frame.contentDocument!
  let closed = false
  let focused = false
  // jsdom tears an iframe's document down on close(); a real pop-out's document stays readable.
  Object.defineProperty(win, 'closed', { get: () => closed, configurable: true })
  Object.defineProperty(win, 'close', { value: () => { closed = true }, configurable: true })
  Object.defineProperty(win, 'focus', { value: () => {}, configurable: true })
  // Whether the user is in this window, as the browser reports it.
  Object.defineProperty(doc, 'hasFocus', { value: () => focused, configurable: true })
  return { win, doc, focused(on) { focused = on } }
}

/** The document the wrapper got, as a CSS-in-JS cache provider would pass its cache down. */
const WRAPPER_DOC = Symbol('pc-wrapper-doc') as InjectionKey<ComputedRef<Document>>

/** A wrapper as an app's CSS-in-JS one, marking what it is around and the document it got. */
const Wrapper = defineComponent({
  props: {
    window: { type: null as unknown as PropType<Window>, required: true },
    document: { type: null as unknown as PropType<Document>, required: true },
  },
  setup(props, { slots }) {
    provide(WRAPPER_DOC, computed(() => props.document))
    return () => h('div', { class: 'pc-wrapper', 'data-doc-ok': props.document === props.window.document ? '' : undefined }, slots.default?.())
  },
})

/** An icon that keeps the document the wrapper gave it, to compare with the one it is shown in. */
const CtxIcon = defineComponent({
  setup() {
    const doc = inject(WRAPPER_DOC, null)
    return () => h('svg', { class: 'pc-icon', ref: (el: unknown) => { if (el) (el as { wrapperDoc?: Document }).wrapperDoc = doc?.value } })
  },
})

const Plain = defineComponent({ setup: () => () => h('svg') })
const flyoutItems: ToolbarItem[] = [{ type: 'group', id: 'g', label: 'Group', defaultIcon: Plain, items: [{ id: 'x', label: 'X', icon: CtxIcon }] }]
const Content = defineComponent({
  props: { panelId: { type: String, default: '' } },
  setup: () => () => h('div', { class: 'pc-content' }, ['content', h(VddToolbar, { items: flyoutItems, position: 'top' })]),
})

const wrappers: VueWrapper[] = []

async function setup(opts: { popOut?: boolean; wrapper?: boolean; popoutUrl?: string; maxVisible?: number } = {}): Promise<Workspace> {
  const ws = createWorkspace({
    popOut: opts.popOut ?? true,
    panels: { c: { component: Content, defaultOptions: { canPopOut: true } }, plain: { component: Content } },
  }) as unknown as Workspace
  const w = mount(defineComponent({
    setup: () => () => [
      h(VddDesktop, { popoutUrl: opts.popoutUrl, popoutWrapper: opts.wrapper === false ? undefined : Wrapper }),
      h(VddContextMenu),
      h(VddToasts, { animation: 'none', defaultDuration: 0, maxVisible: opts.maxVisible ?? 3 }),
    ],
  }), { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  wrappers.push(w)
  ws.openPanel('a', 'c')
  ws.openPanel('b', 'plain', { initialTarget: 'floating' })
  await settle()
  return ws
}

const settle = async () => { await nextTick(); await nextTick() }
const popOutA = async (ws: Workspace) => {
  const p = popup()
  vi.spyOn(window, 'open').mockImplementation(() => p.win)
  ws.popOutPanel('a')
  await settle()
  return p
}
const showMenuIn = async (ws: Workspace, doc: Document) => {
  ws.showContextMenu({ event: { target: doc.body, clientX: 5, clientY: 5 } as unknown as MouseEvent, items: [{ label: 'One', action: () => {} }] })
  await settle()
}
/** A few animation frames: panel:popped-out / panel:returned wait for the layout. */
const afterLayout = async () => { await new Promise(r => setTimeout(r, 100)); await settle() }
const toastsIn = (doc: Document) => Array.from(doc.querySelectorAll('.vdd-toast')).map(t => t.querySelector('.vdd-toast__body')?.textContent?.trim() ?? t.textContent?.trim())
const unmountAll = () => { for (const w of wrappers.splice(0)) w.unmount() }

afterEach(() => {
  unmountAll()
  resetToasts()
  frames.splice(0).forEach(f => f.remove())
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('XPC1: the app\'s wrapper around what the library renders in a pop-out', () => {
  it('around the whole frame, with the pop-out\'s window and document', async () => {
    const ws = await setup()
    const p = await popOutA(ws)
    const frame = p.doc.querySelector('.vdd-popout-frame')!
    expect(frame).not.toBeNull()
    const wrapper = frame.parentElement!
    expect(wrapper.classList.contains('pc-wrapper')).toBe(true)
    expect(wrapper.hasAttribute('data-doc-ok')).toBe(true)
    // The frame's icon and title are inside it; the panel's content is still where it was (its own wrapper).
    expect(wrapper.querySelector('.vdd-popout-frame__icon')).not.toBeNull()
    expect(p.doc.querySelector('.pc-content')).not.toBeNull()
  })

  it('around a menu shown in the pop-out; not around a menu in the page', async () => {
    const ws = await setup()
    const p = await popOutA(ws)
    await showMenuIn(ws, p.doc)
    const menu = p.doc.querySelector('.vdd-context-menu')!
    expect(menu).not.toBeNull()
    expect(menu.parentElement!.classList.contains('pc-wrapper')).toBe(true)
    expect(menu.parentElement!.hasAttribute('data-doc-ok')).toBe(true)
    ws.closeContextMenu()
    await settle()

    await showMenuIn(ws, document)
    const inPage = document.querySelector('.vdd-context-menu')!
    expect(inPage).not.toBeNull()
    expect(inPage.closest('.pc-wrapper')).toBeNull()
  })

  it('without a wrapper, the frame and a menu render as before', async () => {
    const ws = await setup({ wrapper: false })
    const p = await popOutA(ws)
    expect(p.doc.querySelector('.vdd-popout-frame')!.parentElement).toBe(p.doc.body)
    await showMenuIn(ws, p.doc)
    expect(p.doc.querySelector('.vdd-context-menu')!.parentElement).toBe(p.doc.body)
  })
})

describe('XPC2: toasts in the window the user is in', () => {
  it('in the page with no pop-out', async () => {
    await setup()
    toast('hello')
    await settle()
    expect(toastsIn(document)).toEqual(['hello'])
  })

  it('in the pop-out while it has focus, inside the wrapper; in the page when it hasn\'t', async () => {
    const ws = await setup()
    const p = await popOutA(ws)
    p.focused(true)
    toast('there')
    await settle()
    expect(toastsIn(p.doc)).toEqual(['there'])
    expect(toastsIn(document)).toEqual([])
    expect(p.doc.querySelector('.vdd-toast-container')!.parentElement!.classList.contains('pc-wrapper')).toBe(true)
    p.focused(false)
    toast('here')
    await settle()
    expect(toastsIn(document)).toEqual(['here'])
    expect(toastsIn(p.doc)).toEqual(['there'])
    // The page's container is not wrapped.
    expect(document.querySelector('.vdd-toast-container')!.closest('.pc-wrapper')).toBeNull()
  })

  it('the same id updates in place, in the window it was shown in', async () => {
    const ws = await setup()
    const p = await popOutA(ws)
    p.focused(true)
    toast('first', { id: 'x' })
    await settle()
    p.focused(false)
    toast('second', { id: 'x' })
    await settle()
    expect(toastsIn(p.doc)).toEqual(['second'])
    expect(toastsIn(document)).toEqual([])
  })

  it('its window closing removes it (onClose runs); the page\'s toasts stay', async () => {
    const ws = await setup()
    const p = await popOutA(ws)
    const onClose = vi.fn()
    p.focused(true)
    toast('there', { onClose })
    p.focused(false)
    toast('here')
    await settle()
    ws.returnPanel('a')
    await settle()
    expect(toastsIn(p.doc)).toEqual([])
    expect(toastsIn(document)).toEqual(['here'])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('maxVisible counts every window; one waiting whose window closed shows in the page', async () => {
    const ws = await setup({ maxVisible: 2 })
    const p = await popOutA(ws)
    toast('page 1')
    p.focused(true)
    toast('there 1')
    toast('there 2')
    await settle()
    // Two shown in all: one in each window; 'there 2' waits.
    expect(toastsIn(document)).toEqual(['page 1'])
    expect(toastsIn(p.doc)).toEqual(['there 1'])
    p.focused(false)
    ws.returnPanel('a')
    await settle()
    // 'there 1' went with its window; 'there 2' takes its place, in the page.
    expect(toastsIn(document)).toEqual(['page 1', 'there 2'])
    expect(toastsIn(p.doc)).toEqual([])
  })
})

describe('XPC3: when the four events arrive', () => {
  /**
   * Records the events in order, with the document the panel's element is in when each arrives
   * (the very node, kept from the start).
   */
  function record(ws: Workspace) {
    const log: string[] = []
    const el = document.querySelector('.pc-content')?.closest('.vdd-panel-mount') ?? null
    const where = () => (!el ? 'nowhere' : el.ownerDocument === document ? 'page' : 'window')
    for (const type of ['panel:popping-out', 'panel:popped-out', 'panel:returning', 'panel:returned'] as const) {
      ws.subscribe(type, (e: { id: string }) => { log.push(`${type} ${e.id} ${where()}`) })
    }
    return log
  }

  it('popping-out in the click, in the page; popped-out once it is in the window and a frame has passed; the same on the way back', async () => {
    const ws = await setup()
    const log = record(ws)
    const p = popup()
    vi.spyOn(window, 'open').mockImplementation(() => p.win)
    ws.popOutPanel('a')
    // In the click: popping-out only, the element still in the page.
    expect(log).toEqual(['panel:popping-out a page'])
    await afterLayout()
    expect(log).toEqual(['panel:popping-out a page', 'panel:popped-out a window'])
    expect(p.doc.querySelector('.pc-content')).not.toBeNull()
    log.length = 0
    ws.returnPanel('a')
    expect(log).toEqual(['panel:returning a window'])
    await afterLayout()
    expect(log).toEqual(['panel:returning a window', 'panel:returned a page'])
  })

  it('returning, then returned once laid out, on every way back: the frame\'s button, the window closing', async () => {
    for (const how of ['button', 'pagehide'] as const) {
      const ws = await setup()
      const log = record(ws)
      const p = await popOutA(ws)
      await afterLayout()
      log.length = 0
      if (how === 'button') p.doc.querySelector<HTMLButtonElement>('.vdd-popout-frame__return')!.click()
      else p.win.dispatchEvent(new p.win.Event('pagehide'))
      await afterLayout()
      expect(log, how).toEqual(['panel:returning a window', 'panel:returned a page'])
      unmountAll()
      vi.restoreAllMocks()
    }
  })

  it('none for a refused pop-out, a panel closed while out, or with popOut off', async () => {
    const ws = await setup()
    const log = record(ws)
    expect(ws.popOutPanel('b')).toEqual({ ok: false, reason: 'not-allowed' })   // no canPopOut
    expect(ws.popOutPanel('nope').ok).toBe(false)
    vi.spyOn(window, 'open').mockImplementation(() => null)                   // a blocked pop-up
    expect(ws.popOutPanel('a')).toEqual({ ok: false, reason: 'blocked' })
    await afterLayout()
    expect(log).toEqual([])
    vi.restoreAllMocks()
    await popOutA(ws)
    await afterLayout()
    log.length = 0
    ws.closePanel('a')
    await afterLayout()
    expect(log).toEqual([])
    unmountAll()

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const off = await setup({ popOut: false })
    const offLog = record(off)
    expect(off.popOutPanel('a')).toEqual({ ok: false, reason: 'disabled' })
    await afterLayout()
    expect(offLog).toEqual([])
  })

  /** A pop-out window whose app page (popoutUrl) has not loaded yet; `load()` makes it ready. */
  function pagePopup() {
    const p = popup()
    let url = 'about:blank'
    Object.defineProperty(p.doc, 'URL', { get: () => url, configurable: true })
    Object.defineProperty(p.doc, 'readyState', { get: () => 'complete', configurable: true })
    vi.spyOn(window, 'open').mockImplementation(() => p.win)
    return { ...p, load() { url = 'http://localhost/popout.html'; p.win.dispatchEvent(new p.win.Event('load')) } }
  }

  it('with popoutUrl, popping-out comes in the click, before the page loads; popped-out once it is laid out there', async () => {
    const ws = await setup({ popoutUrl: '/popout.html' })
    const log = record(ws)
    const p = pagePopup()
    ws.popOutPanel('a')
    expect(log).toEqual(['panel:popping-out a page'])
    await afterLayout()
    expect(log).toEqual(['panel:popping-out a page'])
    p.load()
    await afterLayout()
    expect(log).toEqual(['panel:popping-out a page', 'panel:popped-out a window'])
  })

  it('a window that fails before its page loads (closed early): popping-out, then returned; no popped-out, no returning', async () => {
    const ws = await setup({ popoutUrl: '/popout.html' })
    const log = record(ws)
    const p = pagePopup()
    ws.popOutPanel('a')
    p.win.close()
    // The closed poll (every 500 ms) brings it back.
    await new Promise(r => setTimeout(r, 700))
    await afterLayout()
    expect(log).toEqual(['panel:popping-out a page', 'panel:returned a page'])
  })

  it('a pop-out replaced before it was laid out: its popped-out is dropped; returned follows', async () => {
    const ws = await setup()
    const log = record(ws)
    await popOutA(ws)
    ws.returnPanel('a')
    await afterLayout()
    expect(log).toEqual(['panel:popping-out a page', 'panel:returned a page'])
    // ...and a return replaced by a new pop-out: its returned is dropped.
    log.length = 0
    vi.restoreAllMocks()
    await popOutA(ws)
    await afterLayout()
    ws.returnPanel('a')
    vi.restoreAllMocks()
    await popOutA(ws)
    await afterLayout()
    expect(log.map(l => l.split(' ')[0])).toEqual([
      'panel:popping-out', 'panel:popped-out', 'panel:returning', 'panel:popping-out', 'panel:popped-out',
    ])
  })

  it('sent anyway after the limit when the panel never shows in its window', async () => {
    const ws = await setup()
    const log = record(ws)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const p = await popOutA(ws)
    // Its frame stays hidden, as while its styles load.
    p.doc.querySelector<HTMLElement>('.vdd-popout-frame')!.style.visibility = 'hidden'
    // Real frames pass (the window's animation frames are not faked).
    for (let i = 0; i < 5; i++) await new Promise(r => p.win.requestAnimationFrame(() => r(null)))
    expect(log).toEqual(['panel:popping-out a page'])
    vi.advanceTimersByTime(POPOUT_PLACED_TIMEOUT_MS - 10)
    expect(log).toEqual(['panel:popping-out a page'])
    vi.advanceTimersByTime(20)
    expect(log).toEqual(['panel:popping-out a page', 'panel:popped-out a window'])
  })

  it('a return replaced by a new pop-out: its returned is not sent, not even at the limit', async () => {
    const ws = await setup()
    const log = record(ws)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let p = await popOutA(ws)
    for (let i = 0; i < 5; i++) await new Promise(r => p.win.requestAnimationFrame(() => r(null)))
    ws.returnPanel('a')
    vi.restoreAllMocks()
    p = await popOutA(ws)
    for (let i = 0; i < 5; i++) await new Promise(r => p.win.requestAnimationFrame(() => r(null)))
    vi.advanceTimersByTime(POPOUT_PLACED_TIMEOUT_MS + 100)
    expect(log.map(l => l.split(' ')[0])).toEqual([
      'panel:popping-out', 'panel:popped-out', 'panel:returning', 'panel:popping-out', 'panel:popped-out',
    ])
  })
})

describe('XPC5: the window\'s kind on its frame', () => {
  it('data-vdd-popout-kind="panel" on a panel\'s frame', async () => {
    const ws = await setup()
    const p = await popOutA(ws)
    expect(p.doc.querySelector('.vdd-popout-frame')!.getAttribute('data-vdd-popout-kind')).toBe('panel')
  })
})

describe('XPC4: a toolbar flyout in a popped-out panel', () => {
  it('gets the wrapper\'s provide with the pop-out\'s document', async () => {
    const ws = await setup()
    const p = await popOutA(ws)
    const btn = p.doc.querySelector<HTMLButtonElement>('button.vdd-toolbar-btn-group')!
    btn.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }))
    await settle()
    const icon = p.doc.querySelector<SVGElement>('.vdd-toolbar-group-flyout .pc-icon')!
    expect(icon).not.toBeNull()
    expect((icon as unknown as { wrapperDoc?: Document }).wrapperDoc).toBe(p.doc)
    expect(icon.ownerDocument).toBe(p.doc)
  })
})
