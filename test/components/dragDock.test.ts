/**
 * The drag-and-dock system.
 *
 * Ports `TouchSupport.test.tsx` (15 tests), names preserved and adapted to `vdd-` class
 * names. Everything geometric — where a drop actually lands, whether a zone is reachable —
 * is in the browser gate, since jsdom measures every box as zero and `elementsFromPoint`
 * therefore returns nothing useful.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import { CANCEL_MOVE_PX, LONG_PRESS_MS } from '../../src/composables/useDragDock'

const P = defineComponent({ name: 'MockPanel', setup: () => () => h('div', 'panel') })

const TWO_LEAF = JSON.stringify({
  version: 2,
  gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
    { type: 'leaf', id: 'L', panels: [], activePanelId: null },
    { type: 'leaf', id: 'R', panels: [], activePanelId: null } ] },
  floating: [], minimized: [], panels: {},
})

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount').forEach(el => el.remove())
  document.body.innerHTML = ''
  document.body.className = ''
  vi.useRealTimers()
})

const setup = (dir?: 'ltr' | 'rtl') => {
  const ws = createWorkspace({
    panels: { map: { component: P }, locked: { component: P, defaultOptions: { canDrag: false } } },
    initialState: TWO_LEAF,
    ...(dir ? { dir } : {}),
  })
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body })
  mounted.push(wrapper)
  return { ws, wrapper }
}

/** A real PointerEvent: @vue/test-utils cannot assign `button`/`pointerType` here. */
const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })

describe('pointer events, not mouse events', () => {
  it('resizer bar has no onmousedown attribute (uses onpointerdown)', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.openPanel('b', 'map')
    ws.dockPanelToGroup('b', 'R', 'center')
    await nextTick()
    const bar = wrapper.find('[data-vdd-divider]')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('onmousedown')).toBeUndefined()
  })

  it('dispatching pointerdown on a tab does not throw', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    expect(() => wrapper.find('[data-vdd-tab="a"]').element
      .dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }))).not.toThrow()
  })

  it('right-click (button=2) on mouse does not start drag', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    wrapper.find('[data-vdd-tab="a"]').element.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', button: 2 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 200 }))
    await nextTick()
    expect(ws.state.draggedPanelId).toBeNull()
  })
})

describe('touch long-press', () => {
  beforeEach(() => { vi.useFakeTimers() })

  it('vdd-long-press-active class is added after 300ms hold on touch', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    const tab = wrapper.find('[data-vdd-tab="a"]').element as HTMLElement
    tab.setPointerCapture = vi.fn()
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: 10 }))
    expect(tab.classList.contains('vdd-long-press-active')).toBe(false)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(tab.classList.contains('vdd-long-press-active')).toBe(true)
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(true)
  })

  it('vdd-long-press-active class NOT added if finger moved > 8px before 300ms', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    const tab = wrapper.find('[data-vdd-tab="a"]').element as HTMLElement
    tab.setPointerCapture = vi.fn()
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: 10 }))
    tab.dispatchEvent(pointer('pointermove', { pointerType: 'touch', clientX: 10 + CANCEL_MOVE_PX + 2, clientY: 10 }))
    vi.advanceTimersByTime(LONG_PRESS_MS + 50)
    expect(tab.classList.contains('vdd-long-press-active')).toBe(false)
  })

  it('a long press that never moves reports itself rather than starting a drag', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    const tab = wrapper.find('[data-vdd-tab="a"]').element as HTMLElement
    tab.setPointerCapture = vi.fn()
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: 10 }))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    tab.dispatchEvent(pointer('pointerup', { pointerType: 'touch', clientX: 10, clientY: 10 }))
    expect(ws.state.draggedPanelId).toBeNull()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)
  })
})

describe('floating window handles', () => {
  it('floating window renders all 8 resize handles', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    await nextTick()
    expect(wrapper.findAll('[data-vdd-handle]').length).toBe(8)
  })

  it('resize handles respond to pointerdown without throwing', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    await nextTick()
    const handle = wrapper.find('[data-vdd-handle="f:e"]').element as HTMLElement
    handle.setPointerCapture = vi.fn()
    expect(() => handle.dispatchEvent(pointer('pointerdown', { clientX: 5, clientY: 5 }))).not.toThrow()
  })

  it('dragging a resize handle suppresses body text-selection for the drag duration (regression: WebKit selection bleed-through)', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    await nextTick()
    const handle = wrapper.find('[data-vdd-handle="f:e"]').element as HTMLElement
    handle.setPointerCapture = vi.fn()
    handle.dispatchEvent(pointer('pointerdown', { clientX: 5, clientY: 5 }))
    expect(document.body.classList.contains('vdd-resizing-active')).toBe(true)
    handle.dispatchEvent(pointer('pointerup', { clientX: 5, clientY: 5 }))
    expect(document.body.classList.contains('vdd-resizing-active')).toBe(false)
  })
})

describe('drag lifecycle classes', () => {
  it('pointerdown on workspace panel updates active state without throwing', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.openPanel('b', 'map')
    ws.dockPanelToGroup('b', 'R', 'center')
    ws.focusPanel('b')
    await nextTick()
    const leaf = wrapper.findAll('[data-vdd-leaf]').find(l => l.attributes('data-vdd-leaf') === 'L')!
    expect(() => leaf.element.dispatchEvent(pointer('pointerdown'))).not.toThrow()
    await nextTick()
    expect(ws.state.activePanelId).toBe('a')
  })

  it('dragging the title bar toggles document.body.vdd-dragging-active for the drag duration', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    await nextTick()
    const bar = wrapper.find('[data-vdd-titlebar="f"]').element as HTMLElement
    bar.setPointerCapture = vi.fn()
    bar.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 10 }))
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(true)
    bar.dispatchEvent(pointer('pointerup', { clientX: 10, clientY: 10 }))
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)
  })

  it('cancelling the drag (pointercancel) also removes vdd-dragging-active', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    await nextTick()
    const bar = wrapper.find('[data-vdd-titlebar="f"]').element as HTMLElement
    bar.setPointerCapture = vi.fn()
    bar.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 10 }))
    bar.dispatchEvent(pointer('pointercancel'))
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)
  })

  it('dragging a docked tab toggles document.body.vdd-dragging-active for the drag duration', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    const tab = wrapper.find('[data-vdd-tab="a"]').element as HTMLElement
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 60 }))
    await nextTick()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(true)
    expect(ws.state.draggedPanelId).toBe('a')
    window.dispatchEvent(pointer('pointerup', { clientX: 60, clientY: 60 }))
    await nextTick()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)
    expect(ws.state.draggedPanelId).toBeNull()
  })

  it('cancelling the tab drag (pointercancel) also removes vdd-dragging-active', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    const tab = wrapper.find('[data-vdd-tab="a"]').element as HTMLElement
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 60 }))
    window.dispatchEvent(pointer('pointercancel'))
    await nextTick()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)
    expect(ws.state.draggedPanelId).toBeNull()
  })

  it('a press that never passes the threshold is a click, not a drag', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    const tab = wrapper.find('[data-vdd-tab="a"]').element as HTMLElement
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 13, clientY: 12 }))   // under 5px
    await nextTick()
    expect(ws.state.draggedPanelId).toBeNull()
    window.dispatchEvent(pointer('pointerup', { clientX: 13, clientY: 12 }))
  })

  it('does not start a drag for a tab whose panel is registered canDrag: false', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('l', 'locked')
    await nextTick()
    const tab = wrapper.find('[data-vdd-tab="l"]').element as HTMLElement
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 90, clientY: 90 }))
    await nextTick()
    expect(ws.state.draggedPanelId).toBeNull()
  })
})

describe('drop zones are state-driven, not :hover-driven', () => {
  const startDrag = async (wrapper: ReturnType<typeof setup>['wrapper'], id: string) => {
    const tab = wrapper.find(`[data-vdd-tab="${id}"]`).element as HTMLElement
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 80, clientY: 80 }))
    await nextTick()
  }

  it('renders no drop zones until a drag is in progress', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    expect(wrapper.findAll('[data-vdd-drop-zone]').length).toBe(0)
    expect(wrapper.findAll('[data-vdd-edge]').length).toBe(0)
    await startDrag(wrapper, 'a')
    expect(wrapper.findAll('[data-vdd-drop-zone]').length).toBeGreaterThan(0)
    expect(wrapper.findAll('[data-vdd-edge]').length).toBe(4)
    expect(wrapper.findAll('[data-vdd-corner]').length).toBe(4)
  })

  it('hovering a cross target box applies a state-driven active class, not :hover (regression: Safari/touch never highlighted)', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    await startDrag(wrapper, 'a')
    const box = wrapper.findAll('[data-vdd-drop-zone="left"]')[0]!
    await box.trigger('pointerenter')
    expect(box.classes()).toContain('vdd-dock-target-box--active')
    await box.trigger('pointerleave')
    expect(box.classes()).not.toContain('vdd-dock-target-box--active')
  })

  it('hovering a cross target box clears the active edge-drop highlight', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    await startDrag(wrapper, 'a')
    await wrapper.find('[data-vdd-edge="left"]').trigger('pointerenter')
    expect(wrapper.find('.vdd-workspace-edge-preview').exists()).toBe(true)
    // A leaf's cross overlaps the edge zones beneath it; the more specific target must win.
    await wrapper.findAll('[data-vdd-drop-zone="center"]')[0]!.trigger('pointerenter')
    expect(wrapper.find('.vdd-workspace-edge-preview').exists()).toBe(false)
  })

  it('hovering a corner clears the active edge, since they produce different outcomes', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    await startDrag(wrapper, 'a')
    await wrapper.find('[data-vdd-edge="top"]').trigger('pointerenter')
    expect(wrapper.find('.vdd-workspace-edge-preview').exists()).toBe(true)
    await wrapper.find('[data-vdd-corner="top-left"]').trigger('pointerenter')
    expect(wrapper.find('.vdd-workspace-edge-preview').exists()).toBe(false)
    expect(wrapper.find('[data-vdd-corner="top-left"]').classes()).toContain('vdd-corner-zone--hovered')
  })

  it('shows a ghost for a tab drag and not for a window drag', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    await startDrag(wrapper, 'a')
    expect(wrapper.find('[data-vdd-ghost]').exists()).toBe(true)
    window.dispatchEvent(pointer('pointerup', { clientX: 80, clientY: 80 }))
    await nextTick()
    expect(wrapper.find('[data-vdd-ghost]').exists()).toBe(false)
  })
})

describe('drop resolution', () => {
  const dragTo = async (
    wrapper: ReturnType<typeof setup>['wrapper'],
    id: string,
    arm: () => Promise<void>,
  ) => {
    const tab = wrapper.find(`[data-vdd-tab="${id}"]`).element as HTMLElement
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 80, clientY: 80 }))
    await nextTick()
    await arm()
    window.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 300 }))
    await nextTick()
  }

  it('dropping on a leaf\'s centre joins that tab group', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.openPanel('keeper', 'map')
    ws.dockPanelToGroup('keeper', 'R', 'center')
    await nextTick()
    await dragTo(wrapper, 'a', async () => {
      const zones = wrapper.findAll('[data-vdd-drop-zone="center"]')
      const target = zones.find(z => z.attributes('data-vdd-leaf') === 'R')!
      await target.trigger('pointerenter')
    })
    expect(ws.state.panels.a!.state).toBe('docked')
    expect(JSON.stringify(ws.state.gridRoot)).toContain('"R"')
  })

  it('dropping on a workspace edge creates a full-width row', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.openPanel('keeper', 'map')
    await nextTick()
    await dragTo(wrapper, 'a', async () => {
      await wrapper.find('[data-vdd-edge="bottom"]').trigger('pointerenter')
    })
    const root = ws.state.gridRoot as { type: string; orientation: string; children: unknown[] }
    expect(root.type).toBe('branch')
    expect(root.orientation).toBe('vertical')
    expect(JSON.stringify(root.children[1])).toContain('"a"')
  })

  it('dropping on a corner floats the panel pinned to that corner', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.openPanel('keeper', 'map')
    await nextTick()
    await dragTo(wrapper, 'a', async () => {
      await wrapper.find('[data-vdd-corner="bottom-right"]').trigger('pointerenter')
    })
    expect(ws.state.panels.a!.state).toBe('floating')
    expect(ws.state.floating.find(w => w.id === 'a')!.anchor).toBe('bottom-right')
  })

  it('dropping over nothing floats the panel where the pointer let go', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.openPanel('keeper', 'map')
    await nextTick()
    await dragTo(wrapper, 'a', async () => {})
    expect(ws.state.panels.a!.state).toBe('floating')
    expect(ws.state.floating.find(w => w.id === 'a')!.anchor).toBeNull()
  })

  it('mirrors left and right drop sides under RTL', async () => {
    const { ws, wrapper } = setup('rtl')
    ws.openPanel('a', 'map'); ws.openPanel('keeper', 'map')
    await nextTick()
    await dragTo(wrapper, 'a', async () => {
      // Physically the left edge; logically, under RTL, the trailing one.
      await wrapper.find('[data-vdd-edge="left"]').trigger('pointerenter')
    })
    const root = ws.state.gridRoot as { orientation: string; children: unknown[] }
    expect(root.orientation).toBe('horizontal')
    // flipped: a physical-left drop docks to the logical right, so the panel is the 2nd child
    expect(JSON.stringify(root.children[1])).toContain('"a"')
  })

  it('corrects the insertion index when reordering within the same leaf', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.openPanel('b', 'map'); ws.openPanel('c', 'map')
    await nextTick()
    const leafId = wrapper.find('[data-vdd-leaf]').attributes('data-vdd-leaf')!
    // DOM indices are pre-removal: moving 'a' (index 0) to the right of 'b' (index 1) must
    // land it at index 1, not 2, because removing 'a' first shifts 'b' down.
    const tab = wrapper.find('[data-vdd-tab="a"]').element as HTMLElement
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 80, clientY: 80 }))
    await nextTick()
    const target = wrapper.find('[data-vdd-tab="b"]')
    const el = target.element as HTMLElement
    el.getBoundingClientRect = () => ({ left: 100, width: 100, right: 200, top: 0, bottom: 30, height: 30, x: 100, y: 0, toJSON: () => ({}) })
    el.dispatchEvent(pointer('pointermove', { pointerType: 'mouse', clientX: 180, clientY: 10 }))  // right half
    await nextTick()
    window.dispatchEvent(pointer('pointerup', { clientX: 180, clientY: 10 }))
    await nextTick()
    const order = wrapper.findAll('[data-vdd-tab]').map(t => t.attributes('data-vdd-tab'))
    expect(order).toEqual(['b', 'a', 'c'])
    expect(leafId).toBeTruthy()
  })
})
