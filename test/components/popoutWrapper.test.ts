/**
 * The window-change hooks (1.14.0, rdd 7.12.1's `PopoutWrapper.test.tsx`, ids prefixed `X`):
 * `<VddDesktop :popout-wrapper>`, `usePanelWindow()`, `usePanel().isPoppedOut`, and the
 * `panel:popped-out` / `panel:returned` events. The pop-out is an `<iframe>`'s window, handed back
 * by a stubbed `window.open`.
 *
 * XPW1: with a wrapper, nothing remounts through pop-out and return: the content's state is kept,
 *       and the wrapper itself stays mounted
 * XPW2: the wrapper gets the pop-out's document in the render that moves the element in (one
 *       flush), so the content's watchers in the child see it already
 * XPW3: back on the main window and document after the return
 * XPW4: no wrapper with popOut off; with popOut on, around every panel, canPopOut or not
 * XPW5: usePanelWindow() and usePanel().isPoppedOut through the cycle; the main window outside a
 *       panel and with popOut off
 * XPW6: panel:popped-out and panel:returned, once each with their payload, on every way back; no
 *       panel:returned for a panel closed while out. Both are sent once the panel is in its new
 *       place and a frame has passed, so each test waits for the layout.
 *
 * vdd: in rdd the wrapper commits with the child's document before the slot's passive effect moves
 * the element; in vdd the frame's patch moves it and the wrapper re-renders in the same flush, with
 * no app code run in between (XPW2 checks that flush).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick, onMounted, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace, usePanel, usePanelWindow } from '../../src'
import type { PanelWindow, Workspace } from '../../src'
import VddDesktop from '../../src/components/VddDesktop.vue'

type AnyWindow = Window & typeof globalThis
const frames: HTMLIFrameElement[] = []

function popup(): { win: AnyWindow; doc: Document; closeByUser(silent?: boolean): void } {
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
    win, doc: frame.contentDocument!,
    closeByUser(silent = false) { closed = true; if (!silent) win.dispatchEvent(new win.Event('pagehide')) },
  }
}

const log: string[] = []
const mounts = vi.fn()
const wrapperMounts = vi.fn()
let wrapperDoc: Document | null = null
const seen: { doc: Document; poppedOut: boolean; wrapperDocThen: Document | null; elementIn: Document | null }[] = []

/** A panel with state, recording its mounts and what usePanelWindow / usePanel say in its watcher. */
const Probe = defineComponent({
  props: { panelId: { type: String, default: '' } },
  setup(props) {
    const n = ref(0)
    const pw = usePanelWindow()
    const { isPoppedOut } = usePanel()
    const btn = ref<HTMLElement | null>(null)
    onMounted(() => mounts(props.panelId))
    // The content's own watcher (flush 'pre', the default): the earliest app code that sees a change.
    watch([() => pw.document, isPoppedOut], ([doc, out]) => {
      seen.push({ doc, poppedOut: out, wrapperDocThen: wrapperDoc, elementIn: btn.value?.ownerDocument ?? null })
    }, { immediate: true })
    return () => h('button', { ref: btn, class: 'pw-count', 'data-id': props.panelId, onClick: () => { n.value++ } }, String(n.value))
  },
})

/**
 * A wrapper as an app's CSS-in-JS one: records its mounts and the document it gets. Only the one
 * around a panel's content records (the frame, menus and toasts in a pop-out get one too).
 */
const Wrapper = defineComponent({
  props: {
    window: { type: null as unknown as PropType<Window>, required: true },
    document: { type: null as unknown as PropType<Document>, required: true },
  },
  setup(props, { slots }) {
    const el = ref<HTMLElement | null>(null)
    let aroundPanel = false
    onMounted(() => {
      aroundPanel = !!el.value?.closest('.vdd-panel-mount')
      if (aroundPanel) { wrapperMounts(); wrapperDoc = props.document }
    })
    return () => {
      if (aroundPanel) {
        wrapperDoc = props.document
        const where = el.value?.ownerDocument
        log.push(`render ${props.document === document ? 'main' : 'child'} element-in ${where === document ? 'main' : 'child'}`)
      }
      return h('div', { class: 'pw-wrapper', ref: el }, slots.default?.())
    }
  },
})

const wrappers: VueWrapper[] = []

function render(ws: Workspace, opts: { wrapper?: boolean; popoutUrl?: string } = {}): VueWrapper {
  const w = mount(defineComponent({
    setup: () => () => h(VddDesktop, { popoutUrl: opts.popoutUrl, popoutWrapper: opts.wrapper === false ? undefined : Wrapper }),
  }), { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  wrappers.push(w)
  return w
}

const settle = async () => { await nextTick(); await nextTick() }

async function setup(opts: { popOut?: boolean; wrapper?: boolean; popoutUrl?: string } = {}): Promise<Workspace> {
  const ws = createWorkspace({
    popOut: opts.popOut ?? true,
    panels: {
      probe: { component: Probe, defaultOptions: { canPopOut: true } },
      plain: { component: Probe },
    },
  }) as unknown as Workspace
  render(ws, opts)
  ws.openPanel('a', 'probe')
  await settle()
  return ws
}

/** A few animation frames: panel:popped-out / panel:returned wait for the layout. */
const afterLayout = () => new Promise(r => setTimeout(r, 100))

const counter = (doc: Document = document) => doc.querySelector<HTMLButtonElement>('.pw-count[data-id="a"]')

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  frames.splice(0).forEach(f => f.remove())
  log.length = 0; seen.length = 0; wrapperDoc = null
  mounts.mockClear(); wrapperMounts.mockClear()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('XPW1: nothing remounts', () => {
  it('through pop-out and return, the content keeps its state and the wrapper stays mounted', async () => {
    const ws = await setup()
    const p = popup()
    vi.spyOn(window, 'open').mockImplementation(() => p.win)
    counter()!.click(); counter()!.click()
    await settle()
    mounts.mockClear(); wrapperMounts.mockClear()
    ws.popOutPanel('a')
    await settle()
    expect(counter(p.doc)!.textContent).toBe('2')
    expect(counter(p.doc)!.closest('.pw-wrapper')).not.toBeNull()
    ws.returnPanel('a')
    await settle()
    expect(counter()!.textContent).toBe('2')
    expect(mounts).not.toHaveBeenCalled()
    expect(wrapperMounts).not.toHaveBeenCalled()
  })
})

describe('XPW2: the document switches in the flush that moves the element', () => {
  it('the wrapper renders once with the pop-out\'s document; the content\'s watcher then sees it, the element in the child', async () => {
    const ws = await setup()
    const p = popup()
    vi.spyOn(window, 'open').mockImplementation(() => p.win)
    log.length = 0
    seen.length = 0
    ws.popOutPanel('a')
    // Nothing yet in the click: the store changed, Vue renders on the next tick.
    expect(log).toEqual([])
    await nextTick()
    expect(log).toEqual(['render child element-in child'])
    expect(counter(p.doc)).not.toBeNull()
    const inChild = seen.find(s => s.doc === p.doc)!
    expect(inChild).toBeDefined()
    expect(inChild.wrapperDocThen).toBe(p.doc)
    expect(inChild.elementIn).toBe(p.doc)
  })
})

describe('XPW3: back on the main document', () => {
  it('after the return, the wrapper and usePanelWindow give the main ones again', async () => {
    const ws = await setup()
    const p = popup()
    vi.spyOn(window, 'open').mockImplementation(() => p.win)
    ws.popOutPanel('a')
    await settle()
    expect(wrapperDoc).toBe(p.doc)
    ws.returnPanel('a')
    await settle()
    expect(wrapperDoc).toBe(document)
    expect(seen.at(-1)!.doc).toBe(document)
    expect(document.querySelector('.vdd-workspace .pw-wrapper .pw-count')).not.toBeNull()
  })
})

describe('XPW4: where the wrapper is rendered', () => {
  it('none with popOut off', async () => {
    await setup({ popOut: false })
    expect(document.querySelector('.pw-wrapper')).toBeNull()
    expect(counter()).not.toBeNull()
  })

  it('around every panel with popOut on, canPopOut or not', async () => {
    const ws = await setup()
    ws.openPanel('b', 'plain', { initialTarget: 'floating' })
    await settle()
    expect(document.querySelectorAll('.pw-wrapper .pw-count').length).toBe(2)
  })
})

describe('XPW5: usePanelWindow and isPoppedOut', () => {
  it('through pop-out and return', async () => {
    const ws = await setup()
    const p = popup()
    vi.spyOn(window, 'open').mockImplementation(() => p.win)
    expect(seen.at(-1)).toMatchObject({ doc: document, poppedOut: false })
    ws.popOutPanel('a')
    await settle()
    expect(seen.at(-1)).toMatchObject({ doc: p.doc, poppedOut: true })
    ws.returnPanel('a')
    await settle()
    expect(seen.at(-1)).toMatchObject({ doc: document, poppedOut: false })
  })

  it('the main window outside a panel, and with popOut off', async () => {
    let outside: PanelWindow | null = null
    const w = mount(defineComponent({ setup() { outside = usePanelWindow(); return () => null } }))
    expect(outside).toEqual({ window, document })
    w.unmount()
    await setup({ popOut: false })
    expect(seen.at(-1)).toMatchObject({ doc: document, poppedOut: false })
  })
})

describe('XPW6: the events', () => {
  const paths: [string, (ws: Workspace, p: ReturnType<typeof popup>) => void][] = [
    ['returnPanel', ws => { ws.returnPanel('a') }],
    ['the frame\'s button', (_ws, p) => { p.doc.querySelector<HTMLButtonElement>('.vdd-popout-frame__return')!.click() }],
    ['the window\'s pagehide', (_ws, p) => { p.closeByUser() }],
    ['the main page\'s pagehide', () => { window.dispatchEvent(new Event('pagehide')) }],
    ['minimizing from code', ws => { ws.minimizePanel('a') }],
    ['docking from code', ws => { ws.dockPanel('a') }],
    ['a layout load that keeps it', ws => {
      ws.loadLayout(JSON.stringify({
        version: 2,
        gridRoot: { type: 'leaf', id: 'g', panels: ['a'], activePanelId: 'a' },
        floating: [], minimized: [],
        panels: { a: { id: 'a', title: 'a', component: 'probe', state: 'docked' } },
      }))
    }],
  ]
  for (const [name, back] of paths) {
    it(`popped-out once with its window; returned once, by ${name}`, async () => {
      const ws = await setup()
      const p = popup()
      vi.spyOn(window, 'open').mockImplementation(() => p.win)
      const out = vi.fn()
      const returned = vi.fn()
      ws.subscribe('panel:popped-out', out)
      ws.subscribe('panel:returned', returned)
      ws.popOutPanel('a')
      await settle()
      await afterLayout()
      expect(out).toHaveBeenCalledTimes(1)
      expect(out).toHaveBeenCalledWith({ id: 'a', window: p.win })
      expect(returned).not.toHaveBeenCalled()
      back(ws, p)
      await settle()
      await afterLayout()
      expect(ws.isOpen('a')).toBe(true)
      expect(returned).toHaveBeenCalledTimes(1)
      expect(returned).toHaveBeenCalledWith({ id: 'a' })
      expect(out).toHaveBeenCalledTimes(1)
    })
  }

  it('returned once by the closed poll, and by unmounting the desktop', async () => {
    for (const how of ['poll', 'unmount'] as const) {
      const ws = await setup()
      const p = popup()
      vi.spyOn(window, 'open').mockImplementation(() => p.win)
      const returned = vi.fn()
      ws.subscribe('panel:returned', returned)
      ws.popOutPanel('a')
      await settle()
      await afterLayout()
      if (how === 'poll') { p.closeByUser(true); await new Promise(r => setTimeout(r, 600)) }
      else wrappers.pop()!.unmount()
      await settle()
      await afterLayout()
      expect(returned, how).toHaveBeenCalledTimes(1)
      for (const w of wrappers.splice(0)) w.unmount()
    }
  })

  it('no panel:returned for a panel closed while out (panel:closed is sent)', async () => {
    const ws = await setup()
    const p = popup()
    vi.spyOn(window, 'open').mockImplementation(() => p.win)
    const returned = vi.fn()
    const closed = vi.fn()
    ws.subscribe('panel:returned', returned)
    ws.subscribe('panel:closed', closed)
    ws.popOutPanel('a')
    await settle()
    await afterLayout()
    ws.closePanel('a')
    await settle()
    await afterLayout()
    expect(closed).toHaveBeenCalledTimes(1)
    expect(returned).not.toHaveBeenCalled()
  })

  it('with popoutUrl, popped-out is sent once the page is ready, not before', async () => {
    const ws = await setup({ popoutUrl: '/popout.html' })
    const p = popup()
    let url = 'about:blank'
    Object.defineProperty(p.doc, 'URL', { get: () => url, configurable: true })
    Object.defineProperty(p.doc, 'readyState', { get: () => 'complete', configurable: true })
    vi.spyOn(window, 'open').mockImplementation(() => p.win)
    const out = vi.fn()
    ws.subscribe('panel:popped-out', out)
    ws.popOutPanel('a')
    await settle()
    await afterLayout()
    expect(out).not.toHaveBeenCalled()
    expect(wrapperDoc).toBe(document)
    url = 'http://localhost/popout.html'
    p.win.dispatchEvent(new p.win.Event('load'))
    await settle()
    await afterLayout()
    expect(out).toHaveBeenCalledTimes(1)
    expect(wrapperDoc).toBe(p.doc)
  })
})
