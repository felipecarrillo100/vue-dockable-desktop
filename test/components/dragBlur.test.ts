/**
 * The window losing focus mid-drag ends the drag (1.5.1), ported from react-dockable-desktop
 * 7.4.1 (`DragBlur.test.tsx`). Nothing listened for `blur`: after an alt-tab the pointer
 * listeners, the armed drop target and the body's `vdd-dragging-active` stayed, so the next
 * release ran the drop — docking the panel into the target it was over before the window lost
 * focus. Covered for the three gestures that can dock: a mouse tab drag, a touch tab drag, and a
 * floating window's title-bar drag.
 *
 * jsdom does no hit-testing, so the gestures that resolve their target from the pointer position
 * (touch, and the captured title-bar drag) get a `document.elementsFromPoint` that returns the
 * drop zone under test.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import { LONG_PRESS_MS } from '../../src/composables/useDragDock'

const P = defineComponent({ render: () => h('div') })
const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, pointerType: 'mouse', ...init })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
  document.body.className = ''
  delete (document as { elementsFromPoint?: unknown }).elementsFromPoint
  vi.useRealTimers()
})

function setup() {
  const ws = createWorkspace({ panels: { p: { component: P } } })
  ws.openPanel('a', 'p'); ws.openPanel('b', 'p')
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  return { ws, wrapper }
}
const zone = (wrapper: VueWrapper) => wrapper.find('[data-vdd-drop-zone="right"]')
const hitTestReturns = (el: Element) => {
  (document as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [el]
}

describe('window blur during a drag', () => {
  it('cancels a mouse tab drag: no stale drop on the next release', async () => {
    const { ws, wrapper } = setup()
    await nextTick()
    const before = JSON.stringify(ws.state.gridRoot)
    expect(ws.state.gridRoot.type).toBe('leaf')

    wrapper.find('[data-vdd-tab="b"]').element.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 200 }))
    await nextTick()
    expect(ws.state.draggedPanelId).toBe('b')
    await zone(wrapper).trigger('pointerenter')

    window.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(ws.state.draggedPanelId).toBeNull()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)

    window.dispatchEvent(pointer('pointerup', { clientX: 200, clientY: 200 }))
    await nextTick()
    expect(JSON.stringify(ws.state.gridRoot)).toBe(before)
  })

  it('cancels a touch tab drag, and clears the long-press class', async () => {
    vi.useFakeTimers()
    const { ws, wrapper } = setup()
    await nextTick()
    const before = JSON.stringify(ws.state.gridRoot)
    const tab = wrapper.find('[data-vdd-tab="b"]').element as HTMLElement
    tab.setPointerCapture = vi.fn()
    hitTestReturns(document.body)

    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 10 }))
    vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    tab.dispatchEvent(pointer('pointermove', { pointerType: 'touch', clientX: 101, clientY: 11 }))
    await nextTick()
    expect(ws.state.draggedPanelId).toBe('b')
    hitTestReturns(zone(wrapper).element)
    tab.dispatchEvent(pointer('pointermove', { pointerType: 'touch', clientX: 200, clientY: 200 }))
    await nextTick()
    expect(zone(wrapper).classes()).toContain('vdd-dock-target-box--active')

    window.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(ws.state.draggedPanelId).toBeNull()
    expect(tab.classList.contains('vdd-long-press-active')).toBe(false)
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)

    tab.dispatchEvent(pointer('pointerup', { pointerType: 'touch', clientX: 200, clientY: 200 }))
    await nextTick()
    expect(JSON.stringify(ws.state.gridRoot)).toBe(before)
  })

  it('cancels a floating window drag too: the next release does not dock it', async () => {
    const { ws, wrapper } = setup()
    ws.floatPanel('b', { x: 300, y: 300, width: 200, height: 150 })
    await nextTick()
    const before = JSON.stringify(ws.state.gridRoot)
    const bar = wrapper.find('[data-vdd-titlebar="b"]').element as HTMLElement
    bar.setPointerCapture = vi.fn()
    hitTestReturns(document.body)

    bar.dispatchEvent(pointer('pointerdown', { clientX: 350, clientY: 310 }))
    bar.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 200 }))
    await nextTick()
    expect(ws.state.draggedPanelId).toBe('b')
    hitTestReturns(zone(wrapper).element)
    bar.dispatchEvent(pointer('pointermove', { clientX: 210, clientY: 210 }))
    await nextTick()
    expect(zone(wrapper).classes()).toContain('vdd-dock-target-box--active')

    window.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(ws.state.draggedPanelId).toBeNull()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)

    bar.dispatchEvent(pointer('pointerup', { clientX: 210, clientY: 210 }))
    await nextTick()
    expect(ws.state.panels.b!.state).toBe('floating')
    expect(JSON.stringify(ws.state.gridRoot)).toBe(before)
  })

  it('a drag that is not interrupted still drops (the control)', async () => {
    const { ws, wrapper } = setup()
    await nextTick()
    wrapper.find('[data-vdd-tab="b"]').element.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 200 }))
    await nextTick()
    await zone(wrapper).trigger('pointerenter')
    window.dispatchEvent(pointer('pointerup', { clientX: 200, clientY: 200 }))
    await nextTick()
    expect(ws.state.gridRoot.type).toBe('branch')
  })

  it('a floating window drag that is not interrupted still docks (the control)', async () => {
    const { ws, wrapper } = setup()
    ws.floatPanel('b', { x: 300, y: 300, width: 200, height: 150 })
    await nextTick()
    const bar = wrapper.find('[data-vdd-titlebar="b"]').element as HTMLElement
    bar.setPointerCapture = vi.fn()
    hitTestReturns(document.body)
    bar.dispatchEvent(pointer('pointerdown', { clientX: 350, clientY: 310 }))
    bar.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 200 }))
    await nextTick()
    hitTestReturns(zone(wrapper).element)
    bar.dispatchEvent(pointer('pointermove', { clientX: 210, clientY: 210 }))
    bar.dispatchEvent(pointer('pointerup', { clientX: 210, clientY: 210 }))
    await nextTick()
    expect(ws.state.panels.b!.state).toBe('docked')
  })
})
