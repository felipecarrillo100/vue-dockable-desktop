/**
 * Ported from react-dockable-desktop `FloatingWindows.test.tsx` (18 tests), names preserved.
 *
 * Geometry that depends on layout — drag distances, resize handles, the corner stacking
 * offsets in pixels — is asserted in the browser gate instead, since jsdom measures every
 * box as zero. What is asserted here is state, DOM presence, and the *logical* positioning
 * properties, which are readable from inline styles without layout.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'

const P = defineComponent({ name: 'MockPanel', setup: () => () => h('div', 'panel') })

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount').forEach(el => el.remove())
  document.body.innerHTML = ''
})

const setup = (dir?: 'ltr' | 'rtl') => {
  const ws = createWorkspace({ panels: { map: { component: P }, locked: { component: P, defaultOptions: { canDrag: false } } }, ...(dir ? { dir } : {}) })
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body })
  mounted.push(wrapper)
  return { ws, wrapper }
}
const win = (ws: ReturnType<typeof createWorkspace>, id: string) => ws.state.floating.find(w => w.id === id)!

describe('Floating Windows', () => {
  it('should open a panel directly as a floating window', () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    expect(ws.state.panels.f!.state).toBe('floating')
    expect(ws.state.floating.map(w => w.id)).toEqual(['f'])
  })

  it('should float a previously docked panel', () => {
    const { ws } = setup()
    ws.openPanel('d', 'map')
    expect(ws.state.panels.d!.state).toBe('docked')
    ws.floatPanel('d')
    expect(ws.state.panels.d!.state).toBe('floating')
    expect(JSON.stringify(ws.state.gridRoot)).not.toContain('"d"')
  })

  it('should float a panel at a specified position and size', () => {
    const { ws } = setup()
    ws.openPanel('d', 'map')
    ws.floatPanel('d', { x: 120, y: 90, width: 420, height: 300 })
    expect(win(ws, 'd')).toMatchObject({ x: 120, y: 90, width: 420, height: 300 })
  })

  it('should update floating window position via updateFloatingPosition', () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    ws.updateFloatingPosition('f', { x: 10, y: 20, width: 300, height: 200 })
    expect(win(ws, 'f')).toMatchObject({ x: 10, y: 20, width: 300, height: 200 })
  })

  it('should set anchor on a floating window', () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    ws.updateFloatingPosition('f', { anchor: 'bottom-right' })
    expect(win(ws, 'f').anchor).toBe('bottom-right')
  })

  it('should open a floating window pre-anchored to a corner', () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating', anchor: 'top-right' })
    expect(win(ws, 'f').anchor).toBe('top-right')
  })

  it('should maximize a floating window', () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    ws.maximizePanel('f')
    expect(win(ws, 'f').maximized).toBe(true)
  })

  it('should restore (toggle off maximize) a maximized floating window', () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    ws.maximizePanel('f'); ws.maximizePanel('f')
    expect(win(ws, 'f').maximized).toBe(false)
  })

  it('should focus a floating window (highest z-index)', () => {
    const { ws } = setup()
    ws.openPanel('a', 'map', { initialTarget: 'floating' })
    ws.openPanel('b', 'map', { initialTarget: 'floating' })
    expect(win(ws, 'b').z).toBeGreaterThan(win(ws, 'a').z)
    ws.focusPanel('a')
    expect(win(ws, 'a').z).toBeGreaterThan(win(ws, 'b').z)
    expect(ws.state.activePanelId).toBe('a')
  })

  it('does not churn z-order when focusing the window that is already on top', () => {
    const { ws } = setup()
    ws.openPanel('a', 'map', { initialTarget: 'floating' })
    const z = win(ws, 'a').z
    ws.focusPanel('a'); ws.focusPanel('a')
    expect(win(ws, 'a').z).toBe(z)
  })

  it('should dock a floating window back to the grid', () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    ws.dockPanel('f')
    expect(ws.state.panels.f!.state).toBe('docked')
    expect(ws.state.floating).toEqual([])
    expect(JSON.stringify(ws.state.gridRoot)).toContain('"f"')
  })

  it('should remove floating window record when panel is closed', () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    ws.closePanel('f')
    expect(ws.state.floating).toEqual([])
    expect(ws.isOpen('f')).toBe(false)
  })

  it('should cascade multiple floating windows so they do not overlap exactly', () => {
    const { ws } = setup()
    ws.openPanel('a', 'map', { initialTarget: 'floating' })
    ws.openPanel('b', 'map', { initialTarget: 'floating' })
    ws.openPanel('c', 'map', { initialTarget: 'floating' })
    const positions = ws.state.floating.map(w => `${w.x},${w.y}`)
    expect(new Set(positions).size).toBe(3)
  })

  it('should render floating window in DOM when the desktop is mounted', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    await nextTick()
    expect(wrapper.find('[data-vdd-window="f"]').exists()).toBe(true)
    expect(wrapper.find('[data-vdd-titlebar="f"]').exists()).toBe(true)
  })

  it('positions a top-right anchored window with insetInlineEnd under LTR (no manual physical flip)', async () => {
    const { ws, wrapper } = setup('ltr')
    ws.openPanel('f', 'map', { initialTarget: 'floating', anchor: 'top-right' })
    await nextTick()
    const style = wrapper.find('[data-vdd-window="f"]').attributes('style')!
    expect(style).toContain('inset-inline-end')
    expect(style).not.toContain('inset-inline-start')
  })

  it('positions a top-right anchored window with insetInlineEnd under RTL too (dir handles the mirroring, not JS)', async () => {
    const { ws, wrapper } = setup('rtl')
    ws.openPanel('f', 'map', { initialTarget: 'floating', anchor: 'top-right' })
    await nextTick()
    const el = wrapper.find('[data-vdd-window="f"]')
    expect(el.attributes('style')).toContain('inset-inline-end')
    expect(el.attributes('dir')).toBe('rtl')
  })

  it('re-mirrors an already-anchored window when direction is switched live, with no other action taken', async () => {
    const { ws, wrapper } = setup('ltr')
    ws.openPanel('f', 'map', { initialTarget: 'floating', anchor: 'top-right' })
    await nextTick()
    expect(wrapper.find('[data-vdd-window="f"]').attributes('dir')).toBe('ltr')
    ws.setDirection('rtl')
    await nextTick()
    // Nothing about the window changed — only `dir`. The logical inset does the mirroring.
    expect(wrapper.find('[data-vdd-window="f"]').attributes('dir')).toBe('rtl')
    expect(wrapper.find('[data-vdd-window="f"]').attributes('style')).toContain('inset-inline-end')
    expect(win(ws, 'f').anchor).toBe('top-right')
  })

  it('stacks two windows anchored to the same corner with an offset, in both LTR and RTL', async () => {
    for (const dir of ['ltr', 'rtl'] as const) {
      const { ws, wrapper } = setup(dir)
      ws.openPanel('a', 'map', { initialTarget: 'floating', anchor: 'top-left' })
      ws.updateFloatingPosition('a', { height: 120 })
      ws.openPanel('b', 'map', { initialTarget: 'floating', anchor: 'top-left' })
      await nextTick()
      const first = wrapper.find('[data-vdd-window="a"]').attributes('style')!
      const second = wrapper.find('[data-vdd-window="b"]').attributes('style')!
      expect(first).toContain('top: 8px')          // CORNER_INSET
      expect(second).toContain('top: 136px')       // 8 + 120 + CORNER_GAP
      for (const w of mounted.splice(0)) w.unmount()
    }
  })

  it('clamps width/height (but not position) of an anchored window when the workspace shrinks', async () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating', anchor: 'top-right' })
    ws.updateFloatingPosition('f', { x: 5000, y: 5000, width: 4000, height: 3000 })
    // The clamp is a watcher, so it lands on the next tick rather than inside the setter.
    // jsdom has no ResizeObserver, so the workspace keeps its 1024x768 fallback — enough to
    // assert the shape: size is clamped, while an anchored window's x/y are left alone,
    // because they do not affect where an anchored window appears.
    await nextTick()
    expect(win(ws, 'f').width).toBeLessThan(4000)
    expect(win(ws, 'f').height).toBeLessThan(3000)
    expect(win(ws, 'f').x).toBe(5000)
    expect(win(ws, 'f').y).toBe(5000)
  })

  it('clamps a free-floating window back into reach, position included', async () => {
    const { ws } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    ws.updateFloatingPosition('f', { x: 5000, y: 5000, width: 300, height: 200 })
    await nextTick()
    expect(win(ws, 'f').x).toBeLessThan(5000)     // enough title bar stays grabbable
    expect(win(ws, 'f').y).toBeLessThan(5000)
  })

  it('does not drag a window whose panel is registered canDrag: false', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('l', 'locked', { initialTarget: 'floating' })
    await nextTick()
    const before = { ...win(ws, 'l') }
    const bar = wrapper.find('[data-vdd-titlebar="l"]')
    expect((bar.attributes('style') ?? '')).toContain('cursor: default')

    // A real PointerEvent, because @vue/test-utils cannot assign `button` on a MouseEvent
    // here — and `button` is what the handler checks.
    const el = bar.element
    el.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 200, bubbles: true }))
    await nextTick()
    expect(win(ws, 'l')).toMatchObject({ x: before.x, y: before.y })
  })

  it('hides the minimize button for a panel registered canMinimize: false', async () => {
    const ws = createWorkspace({ panels: { locked: { component: P, defaultOptions: { canMinimize: false } } } })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body })
    mounted.push(wrapper)
    ws.openPanel('l', 'locked', { initialTarget: 'floating' })
    await nextTick()
    expect(wrapper.find('[data-vdd-minimize="l"]').exists()).toBe(false)
    expect(wrapper.find('[data-vdd-maximize="l"]').exists()).toBe(true)
  })

  it('renders focused chrome on the active window and not on the others (D2)', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map', { initialTarget: 'floating' })
    ws.openPanel('b', 'map', { initialTarget: 'floating' })
    await nextTick()
    expect(wrapper.find('[data-vdd-window="b"]').classes()).toContain('vdd-window-focused')
    expect(wrapper.find('[data-vdd-window="a"]').classes()).not.toContain('vdd-window-focused')
    // A docked panel floated by a placement action must come back focused, which is the
    // rdd defect: its floatPanel left activePanelId behind, so the new window rendered
    // unfocused despite being frontmost.
    ws.openPanel('c', 'map')
    ws.focusPanel('b')
    ws.floatPanel('c')
    await nextTick()
    expect(ws.state.activePanelId).toBe('c')
    expect(wrapper.find('[data-vdd-window="c"]').classes()).toContain('vdd-window-focused')
  })

  it('squares off a maximized window, matching the class the component renders (D9)', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    ws.maximizePanel('f')
    await nextTick()
    // rdd's rule said `.maximized` while its component rendered `rdd-maximized`, so a
    // maximized window kept its rounded corners and shadow. The class and the selector must
    // agree — the stylesheet half is asserted in stylesheet.test.ts.
    expect(wrapper.find('[data-vdd-window="f"]').classes()).toContain('vdd-maximized')
  })

  it('hides the resize handles while maximized', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    await nextTick()
    expect(wrapper.findAll('[data-vdd-handle]').length).toBe(8)
    ws.maximizePanel('f')
    await nextTick()
    expect(wrapper.findAll('[data-vdd-handle]').length).toBe(0)
  })
})
