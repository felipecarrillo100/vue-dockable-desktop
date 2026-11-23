/**
 * Managed widgets in their own browser window (1.14.0, rdd 7.12.1's `PopOutWidgets.test.tsx`,
 * WG1–WG14 as XWG1–XWG14, the `b` variants kept): `useFloatingWidgets().popOut()`,
 * `ManagedWidget.canPopOut`, `useWidget().isPoppedOut`, `WidgetMenuContext.canPopOut / isPoppedOut /
 * popOut()`, and the way back. The pop-out is an `<iframe>`'s window, handed back by a stubbed
 * `window.open`.
 *
 * XWG1:  refusals, in order: disabled (with a development warning), not-open, not-allowed (no
 *        canPopOut; an owner type with keepAlive: false), no-gesture, blocked, no-window; each
 *        leaves the widget where it was, with no callback
 * XWG2:  from the panel: out of the panel and into the window in one step; the same element, its
 *        state kept, nothing remounts; location 'floating', isPoppedOut, its panel id unchanged
 * XWG2b: the window opens over the widget's frame in the panel, at its size
 * XWG3:  from docked, tabbed, floating and minimised: its panel pops out
 * XWG4:  one onWillMove / onMoved pair around the pop-out, and around every return
 * XWG5:  closing the window, its pagehide, or the frame's "Back into the panel" button: back into
 *        its panel, where it was
 * XWG6:  move() from the window to the panel, docked, tabbed and floating: one move, one pair
 * XWG7:  workspace.popOutPanel(hostedId) goes through the widget's rules; returnPanel(hostedId) is
 *        the window closing
 * XWG8:  placement() while out reopens it floating at its rect before the window
 * XWG9:  the owner closing closes the window and the widget; the owner minimised leaves it out
 * XWG9b: its panel minimised from code while out: minimised, not sent into its panel
 * XWG10: the menu context: canPopOut, isPoppedOut, popOut(); the frame's title icon opens the menu,
 *        in the window, by a click and from the keyboard, and the click doesn't reach the window
 * XWG11: panel:popped-out / panel:returned for its panel
 * XWG12: a widget's content gets its window from usePanelWindow(), and the app's popoutWrapper
 * XWG13: canPopOut on a workspace without popOut warns outside production, once per widget
 * XWG14: data-vdd-popout-kind="widget" on its window's frame
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'
import type { PropType } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace, useFloatingWidgets, usePanelWindow, useWidget } from '../../src'
import type { ManagedWidget, PopOutResult, WidgetHandle, WidgetMenuContext, WidgetTarget, Workspace } from '../../src'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddPanelOverlay from '../../src/components/VddPanelOverlay.vue'
import VddContextMenu from '../../src/components/VddContextMenu.vue'

type AnyWindow = Window & typeof globalThis
const frames: HTMLIFrameElement[] = []

interface Popup { win: AnyWindow; doc: Document; closeByUser(silent?: boolean): void; closed(): boolean }
function popup(): Popup {
  const frame = document.createElement('iframe')
  document.body.appendChild(frame)
  frames.push(frame)
  const win = frame.contentWindow as AnyWindow
  let closed = false
  // jsdom tears an iframe's document down on close(); a real pop-out's document stays readable.
  Object.defineProperty(win, 'closed', { get: () => closed, configurable: true })
  Object.defineProperty(win, 'close', { value: () => { closed = true }, configurable: true })
  Object.defineProperty(win, 'focus', { value: () => {}, configurable: true })
  return {
    win, doc: frame.contentDocument!, closed: () => closed,
    closeByUser(silent = false) { closed = true; if (!silent) win.dispatchEvent(new win.Event('pagehide')) },
  }
}
const stubOpen = (p: Popup | null) => vi.spyOn(window, 'open').mockImplementation(() => (p ? p.win : null))

let api: ReturnType<typeof useFloatingWidgets> | null = null
let widget: WidgetHandle | null = null
let menuSeen: WidgetMenuContext | null = null
const mounts = vi.fn()
const calls: string[] = []
let docSeen: () => Document | null = () => null
let wrapperDoc: Document | null = null

/** Widget content with state; records mounts, its handle, its callbacks and its window. */
const Table = defineComponent({
  setup() {
    const n = ref(0)
    const w = useWidget()
    widget = w
    const pw = usePanelWindow()
    docSeen = () => pw.document
    onMounted(() => mounts())
    w?.onWillMove(() => calls.push('will'))
    w?.onMoved(() => calls.push('moved'))
    return () => h('button', { class: 'wg-count', onClick: () => { n.value++ } }, String(n.value))
  },
})
const Grab = defineComponent({ setup() { api = useFloatingWidgets(); return () => null } })
const Owner = defineComponent({ setup: () => () => h(VddPanelOverlay, null, { default: () => h(Grab) }) })
/** The app's popoutWrapper: records the document it was last given. */
const Wrapper = defineComponent({
  props: {
    window: { type: null as unknown as PropType<Window>, required: true },
    document: { type: null as unknown as PropType<Document>, required: true },
  },
  setup(props, { slots }) {
    return () => { wrapperDoc = props.document; return slots.default?.() }
  },
})

const table: ManagedWidget = {
  title: 'Table', component: Table, anchor: 'bottom-left', width: 240, height: 160,
  canPopOut: true, canDock: true, canFloat: true,
  titleMenu: (w) => { menuSeen = w; return [{ label: 'Pop it', action: () => { w.popOut() } }] },
}

const wrappers: VueWrapper[] = []
const settle = async () => { await nextTick(); await nextTick() }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

async function setup(opts: { popOut?: boolean; config?: Partial<ManagedWidget>; lazy?: boolean } = {}): Promise<Workspace> {
  const ws = createWorkspace({
    popOut: opts.popOut ?? true,
    panels: { map: { component: Owner }, lazy: { component: Owner, defaultOptions: { keepAlive: false } } },
  }) as unknown as Workspace
  wrappers.push(mount(defineComponent({
    setup: () => () => [h(VddDesktop, { popoutWrapper: Wrapper }), h(VddContextMenu)],
  }), { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper)
  await settle()
  ws.openPanel('map', opts.lazy ? 'lazy' : 'map', { title: 'Map' })
  await settle()
  api!.open('table', { ...table, ...opts.config })
  await settle()
  calls.length = 0
  mounts.mockClear()
  return ws
}
const unmountAll = () => { for (const w of wrappers.splice(0)) w.unmount() }

const content = (doc: Document = document) => doc.querySelector<HTMLElement>('.vdd-panel-float__content')
const count = (doc: Document = document) => doc.querySelector('.wg-count')?.textContent
const frameIn = () => document.querySelector<HTMLElement>('[data-vdd-widget="table"]')
const popOut = async (): Promise<PopOutResult> => { const r = api!.popOut('table'); await settle(); return r }
const go = async (to: WidgetTarget) => { const r = api!.move('table', to); await settle(); return r }
const HOSTED = 'map/table'

afterEach(() => {
  unmountAll()
  frames.splice(0).forEach(f => f.remove())
  api = null; widget = null; menuSeen = null; docSeen = () => null; wrapperDoc = null
  calls.length = 0
  mounts.mockClear()
  vi.restoreAllMocks()
  delete (navigator as unknown as { userActivation?: unknown }).userActivation
  document.body.innerHTML = ''
})

describe('XWG1: refusals', () => {
  const stays = (ws: Workspace) => {
    expect(api!.location('table')).toBe('panel')
    expect(ws.state.panels[HOSTED]).toBeUndefined()
    expect(calls).toEqual([])
  }

  it('disabled: the workspace has no popOut, with one development warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ws = await setup({ popOut: false })
    const open = stubOpen(popup())
    expect(await popOut()).toEqual({ ok: false, reason: 'disabled' })
    expect(open).not.toHaveBeenCalled()
    expect(warn.mock.calls.some(c => String(c[0]).includes('was refused'))).toBe(true)
    stays(ws)
  })

  it("disabled comes first, before the widget's own rules", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await setup({ popOut: false, config: { canPopOut: false } })
    expect(await popOut()).toEqual({ ok: false, reason: 'disabled' })
  })

  it('not-open', async () => {
    await setup()
    expect(api!.popOut('nope')).toEqual({ ok: false, reason: 'not-open' })
  })

  it('not-allowed: no canPopOut, and an owner whose type unmounts while hidden', async () => {
    const ws = await setup({ config: { canPopOut: false } })
    const open = stubOpen(popup())
    expect(await popOut()).toEqual({ ok: false, reason: 'not-allowed' })
    stays(ws)
    unmountAll()
    document.body.innerHTML = ''
    const lazy = await setup({ lazy: true })
    expect(await popOut()).toEqual({ ok: false, reason: 'not-allowed' })
    expect(open).not.toHaveBeenCalled()
    stays(lazy)
  })

  it('no-gesture', async () => {
    const ws = await setup()
    const open = stubOpen(popup())
    Object.defineProperty(navigator, 'userActivation', { value: { isActive: false }, configurable: true })
    expect(await popOut()).toEqual({ ok: false, reason: 'no-gesture' })
    expect(open).not.toHaveBeenCalled()
    stays(ws)
  })

  it('blocked, and no-window: nothing changed', async () => {
    const ws = await setup()
    stubOpen(null)
    expect(await popOut()).toEqual({ ok: false, reason: 'blocked' })
    stays(ws)
    const p = popup()
    p.closeByUser(true)
    vi.restoreAllMocks()
    stubOpen(p)
    expect(await popOut()).toEqual({ ok: false, reason: 'no-window' })
    stays(ws)
  })
})

describe('XWG2: from the panel', () => {
  it('leaves the panel into the window in one step: the same element, its state, its panel id', async () => {
    const ws = await setup()
    const p = popup()
    stubOpen(p)
    const el = content()!
    ;(el.querySelector('.wg-count') as HTMLElement).click()
    await settle()
    mounts.mockClear()
    expect(await popOut()).toEqual({ ok: true })
    expect(content(p.doc)).toBe(el)
    expect(count(p.doc)).toBe('1')
    expect(mounts).not.toHaveBeenCalled()
    expect(api!.location('table')).toBe('floating')
    expect(widget!.isPoppedOut.value).toBe(true)
    expect(widget!.panelId.value).toBe(HOSTED)
    expect(widget!.location.value).toBe('floating')
    expect(ws.state.panels[HOSTED]).toMatchObject({ state: 'floating', poppedOut: true, owner: { panelId: 'map', widgetId: 'table' } })
    expect(frameIn()).toBeNull()   // no frame in the panel
  })
})

describe("XWG2b: the window's place", () => {
  it("opens over the widget's frame in the panel, at its size", async () => {
    await setup()
    const open = stubOpen(popup())
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isFrame = this.getAttribute('data-vdd-widget') === 'table'
      const w = isFrame ? 400 : 0
      const hh = isFrame ? 300 : 0
      return { left: 50, top: 60, right: 50 + w, bottom: 60 + hh, width: w, height: hh, x: 50, y: 60, toJSON() {} } as DOMRect
    })
    await popOut()
    expect(String(open.mock.calls[0]![2])).toMatch(/width=400,height=300/)
  })
})

describe('XWG3: from each place out of the panel', () => {
  const places: [string, () => void][] = [
    ['docked', () => { api!.move('table', { to: 'docked', position: 'bottom' }) }],
    ['tabbed', () => { api!.move('table', { to: 'tabbed' }) }],
    ['floating', () => { api!.move('table', { to: 'floating', rect: { x: 10, y: 10, width: 200, height: 100 } }) }],
    ['minimized', () => { api!.move('table', { to: 'floating' }) }],
  ]
  for (const [where, move] of places) {
    it(`${where}: its panel pops out, the same element`, async () => {
      const ws = await setup()
      const p = popup()
      stubOpen(p)
      move()
      await settle()
      if (where === 'minimized') { ws.minimizePanel(HOSTED); await settle() }
      expect(api!.location('table')).toBe(where)
      const el = content()!
      expect(await popOut()).toEqual({ ok: true })
      expect(content(p.doc)).toBe(el)
      expect(api!.location('table')).toBe('floating')
      expect(widget!.isPoppedOut.value).toBe(true)
      expect(widget!.panelId.value).toBe(HOSTED)
    })
  }
})

describe('XWG4: callbacks', () => {
  it('one pair around the pop-out from the panel, and one around the window closing', async () => {
    await setup()
    const p = popup()
    stubOpen(p)
    await popOut()
    await wait(80)
    expect(calls).toEqual(['will', 'moved'])
    calls.length = 0
    p.closeByUser()
    await settle()
    await wait(80)
    expect(calls).toEqual(['will', 'moved'])
  })

  it('one pair around a pop-out from floating (same location, another container)', async () => {
    await setup()
    stubOpen(popup())
    await go({ to: 'floating' })
    await wait(80)
    calls.length = 0
    await popOut()
    await wait(80)
    expect(calls).toEqual(['will', 'moved'])
  })

  it('one pair around a pop-out from docked and the window closing (it comes back docked for a moment)', async () => {
    await setup()
    const p = popup()
    stubOpen(p)
    await go({ to: 'docked', position: 'bottom' })
    await wait(80)
    calls.length = 0
    await popOut()
    await wait(80)
    expect(calls).toEqual(['will', 'moved'])
    calls.length = 0
    p.closeByUser()
    await settle()
    await wait(80)
    expect(calls).toEqual(['will', 'moved'])
    expect(api!.location('table')).toBe('panel')
  })

  it('none for a refusal', async () => {
    await setup()
    stubOpen(null)
    await popOut()
    await wait(80)
    expect(calls).toEqual([])
  })
})

describe('XWG5: closing the window sends it back into its panel', () => {
  const ways: [string, (ws: Workspace, p: Popup) => void][] = [
    ['the window closing', (_ws, p) => { p.closeByUser() }],
    ['the frame\'s "Back into the panel"', (_ws, p) => { p.doc.querySelector<HTMLButtonElement>('.vdd-popout-frame__return')!.click() }],
    ['returnPanel on its panel id', (ws) => { ws.returnPanel(HOSTED) }],
  ]
  for (const [name, close] of ways) {
    it(`${name}: back in the panel, where it was, the same element and state`, async () => {
      const ws = await setup()
      const p = popup()
      stubOpen(p)
      const el = content()!
      ;(el.querySelector('.wg-count') as HTMLElement).click()
      await settle()
      const before = frameIn()!.getAttribute('style')
      await popOut()
      if (name.includes('Back')) expect(p.doc.querySelector('.vdd-popout-frame__return')!.getAttribute('aria-label')).toBe('Back into the panel')
      close(ws, p)
      await settle()
      expect(api!.location('table')).toBe('panel')
      expect(ws.state.panels[HOSTED]).toBeUndefined()
      expect(content()).toBe(el)
      expect(count()).toBe('1')
      expect(p.closed()).toBe(true)
      expect(frameIn()).not.toBeNull()
      expect(frameIn()!.getAttribute('style')).toBe(before)   // its old place in the panel
    })
  }
})

describe('XWG6: move() from the window', () => {
  const targets: [string, WidgetTarget, string][] = [
    ['the panel', { to: 'panel' }, 'panel'],
    ['docked', { to: 'docked', position: 'right' }, 'docked'],
    ['tabbed', { to: 'tabbed' }, 'tabbed'],
    ['floating', { to: 'floating', rect: { x: 20, y: 20, width: 220, height: 140 } }, 'floating'],
  ]
  for (const [name, to, where] of targets) {
    it(`to ${name}: the window closes and it moves, as one move with one pair`, async () => {
      const ws = await setup()
      const p = popup()
      stubOpen(p)
      const el = content()!
      await popOut()
      await wait(80)
      calls.length = 0
      expect(await go(to)).toEqual({ ok: true })
      await wait(80)
      expect(api!.location('table')).toBe(where)
      expect(widget!.isPoppedOut.value).toBe(false)
      expect(p.closed()).toBe(true)
      expect(content()).toBe(el)
      expect(calls).toEqual(['will', 'moved'])
      if (where !== 'panel') expect(ws.state.panels[HOSTED]!.poppedOut).toBeUndefined()
    })
  }
})

describe('XWG7: workspace calls on its panel id', () => {
  it("popOutPanel(hostedId) goes through the widget's rules; returnPanel(hostedId) is the window closing", async () => {
    const ws = await setup()
    const p = popup()
    stubOpen(p)
    await go({ to: 'docked', position: 'bottom' })
    expect(ws.popOutPanel(HOSTED)).toEqual({ ok: true })
    await settle()
    expect(widget!.isPoppedOut.value).toBe(true)
    ws.returnPanel(HOSTED)
    await settle()
    expect(api!.location('table')).toBe('panel')
    // Its rules: without canPopOut, the workspace call is refused too.
    api!.open('table', { ...table, canPopOut: false })
    await go({ to: 'floating' })
    expect(ws.popOutPanel(HOSTED)).toEqual({ ok: false, reason: 'not-allowed' })
  })
})

describe('XWG8: placement() while out', () => {
  it('reopens it floating, at its rect before the window', async () => {
    const ws = await setup()
    stubOpen(popup())
    await go({ to: 'floating', rect: { x: 30, y: 40, width: 250, height: 150 } })
    await popOut()
    const saved = api!.placement('table')!
    expect(saved).toMatchObject({ v: 1, at: 'floating', rect: { x: 30, y: 40, width: 250, height: 150 } })
    ws.returnPanel(HOSTED)
    await settle()
    api!.close('table')
    await settle()
    api!.open('table', { ...table, placement: saved })
    await settle()
    expect(api!.location('table')).toBe('floating')
    expect(ws.state.floating.find(w => w.id === HOSTED)).toMatchObject({ x: 30, y: 40, width: 250, height: 150 })
    expect(ws.state.panels[HOSTED]!.poppedOut).toBeUndefined()
  })
})

describe('XWG9: ownership', () => {
  it('the owner closing closes the window and the widget', async () => {
    const ws = await setup()
    const p = popup()
    stubOpen(p)
    await popOut()
    ws.closePanel('map')
    await settle()
    expect(p.closed()).toBe(true)
    expect(ws.state.panels[HOSTED]).toBeUndefined()
    expect(p.doc.querySelector('.vdd-popout-frame')).toBeNull()
  })

  it('the owner minimised: the widget stays in its window', async () => {
    const ws = await setup()
    const p = popup()
    stubOpen(p)
    await popOut()
    ws.minimizePanel('map')
    await settle()
    expect(p.closed()).toBe(false)
    expect(widget!.isPoppedOut.value).toBe(true)
    expect(content(p.doc)).not.toBeNull()
  })
})

describe('XWG9b: moved from code while out', () => {
  it('minimising its panel from code minimises it (it is not sent into its panel)', async () => {
    const ws = await setup()
    const p = popup()
    stubOpen(p)
    await popOut()
    ws.minimizePanel(HOSTED)
    await settle()
    expect(p.closed()).toBe(true)
    expect(api!.location('table')).toBe('minimized')
  })
})

describe('XWG10: the menu', () => {
  const item = (label: string, doc: Document = document) =>
    [...doc.querySelectorAll<HTMLElement>('.vdd-context-menu__item')].find(b => b.textContent?.includes(label))

  it("the context says canPopOut and isPoppedOut, and popOut() works; the frame's icon opens the menu in the window", async () => {
    await setup()
    const p = popup()
    stubOpen(p)
    await go({ to: 'floating' })
    ;(document.querySelector('[data-vdd-window="map/table"] .vdd-btn-more-actions') as HTMLElement).click()
    await settle()
    expect(menuSeen).toMatchObject({ canPopOut: true, isPoppedOut: false, location: 'floating' })
    item('Pop it')!.click()
    await settle()
    expect(widget!.isPoppedOut.value).toBe(true)
    menuSeen = null
    const icon = p.doc.querySelector<HTMLButtonElement>('.vdd-popout-frame__icon--menu')!
    expect(icon).not.toBeNull()
    icon.click()
    await settle()
    expect(menuSeen).toMatchObject({ isPoppedOut: true, location: 'floating' })
    expect(p.doc.querySelector('.vdd-context-menu')).not.toBeNull()
  })

  it("the icon's click and press stop there: they reach neither the window (which dismisses a menu) nor the frame", async () => {
    await setup()
    const p = popup()
    stubOpen(p)
    await popOut()
    const icon = p.doc.querySelector<HTMLButtonElement>('.vdd-popout-frame__icon--menu')!
    const reached: string[] = []
    p.win.addEventListener('click', () => reached.push('click'))
    p.doc.addEventListener('pointerdown', () => reached.push('pointerdown'))
    icon.dispatchEvent(new p.win.MouseEvent('pointerdown', { bubbles: true }))
    icon.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true, detail: 1, clientX: 5, clientY: 5 }))
    await settle()
    expect(reached).toEqual([])
    expect(p.doc.querySelector('.vdd-context-menu')).not.toBeNull()
  })

  it('from the keyboard (a click with detail 0) it opens in the window, below the icon, on its first item', async () => {
    await setup()
    const p = popup()
    stubOpen(p)
    await popOut()
    const icon = p.doc.querySelector<HTMLButtonElement>('.vdd-popout-frame__icon--menu')!
    vi.spyOn(icon, 'getBoundingClientRect').mockReturnValue({ left: 12, top: 4, right: 28, bottom: 20, width: 16, height: 16, x: 12, y: 4, toJSON() {} } as DOMRect)
    icon.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true, detail: 0 }))
    await settle()
    const menu = p.doc.querySelector<HTMLElement>('.vdd-context-menu')
    expect(menu).not.toBeNull()
    expect(document.querySelector('.vdd-context-menu')).toBeNull()
    expect(menu!.style.left).toBe('12px')
    expect(menu!.style.top).toBe('20px')
    expect(p.doc.activeElement).toBe(item('Pop it', p.doc))
  })

  it('canPopOut is false without the opt-in, or with popOut off', async () => {
    await setup({ config: { canPopOut: false } })
    await go({ to: 'floating' })
    ;(document.querySelector('[data-vdd-window="map/table"] .vdd-btn-more-actions') as HTMLElement).click()
    await settle()
    expect(menuSeen).toMatchObject({ canPopOut: false })
    unmountAll()
    document.body.innerHTML = ''
    menuSeen = null
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await setup({ popOut: false })
    await go({ to: 'floating' })
    ;(document.querySelector('[data-vdd-window="map/table"] .vdd-btn-more-actions') as HTMLElement).click()
    await settle()
    expect(menuSeen).toMatchObject({ canPopOut: false })
  })
})

describe('XWG11: events for its panel', () => {
  it('panel:popped-out and panel:returned, once each, once laid out', async () => {
    const ws = await setup()
    const p = popup()
    stubOpen(p)
    const out = vi.fn()
    const back = vi.fn()
    ws.subscribe('panel:popped-out', out)
    ws.subscribe('panel:returned', back)
    await popOut()
    await wait(150)
    expect(out).toHaveBeenCalledTimes(1)
    expect(out).toHaveBeenCalledWith({ id: HOSTED, window: p.win })
    p.closeByUser()
    await settle()
    await wait(150)
    expect(back).toHaveBeenCalledTimes(1)
    expect(back).toHaveBeenCalledWith({ id: HOSTED })
  })
})

describe("XWG12: the widget's window", () => {
  it("usePanelWindow() and the app's popoutWrapper give the widget's window, and the page's again", async () => {
    await setup()
    const p = popup()
    stubOpen(p)
    expect(docSeen()).toBe(document)
    await popOut()
    expect(docSeen()).toBe(p.doc)
    expect(wrapperDoc).toBe(p.doc)
    p.closeByUser()
    await settle()
    expect(docSeen()).toBe(document)
    expect(wrapperDoc).toBe(document)
  })
})

describe('XWG13: canPopOut without popOut', () => {
  it('warns outside production, once per widget', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await setup({ popOut: false })
    api!.open('table', table)
    const mine = warn.mock.calls.filter(c => String(c[0]).includes('Widget "table" sets canPopOut'))
    expect(mine).toHaveLength(1)
  })
})

describe("XWG14: the window's kind", () => {
  it('data-vdd-popout-kind="widget" on its frame', async () => {
    await setup()
    const p = popup()
    stubOpen(p)
    await popOut()
    expect(p.doc.querySelector('.vdd-popout-frame')!.getAttribute('data-vdd-popout-kind')).toBe('widget')
  })
})
