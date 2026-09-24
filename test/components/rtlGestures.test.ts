/**
 * Pointer gestures under right-to-left.
 *
 * A pointer delta is physical; the sizes, sides and tab indexes it changes are logical, and
 * under RTL a flex row lays out right to left. Before 1.1.2 four gestures mixed the two:
 *
 * - a split divider moved away from the pointer;
 * - a sidebar's resizer shrank the drawer when dragged away from its edge;
 * - a toolbar flyout opened towards the edge when only the workspace, not the strip, was RTL;
 * - dropping a tab on another tab's left half inserted it on the right, and vice versa.
 *
 * jsdom does no layout and does not derive `direction` from `dir`, so these stub what a
 * browser would compute. The playground covers the same gestures for real.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddSidebar from '../../src/components/VddSidebar.vue'
import VddToolbar from '../../src/components/VddToolbar.vue'
import { tabSide } from '../../src/core/dragResize'
import type { ToolbarItem } from '../../src/core/toolbarTypes'

const P = defineComponent({ name: 'MockPanel', setup: () => () => h('div', 'panel') })
const Icon = defineComponent({ name: 'Icon', setup: () => () => h('svg') })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount, .vdd-toolbar-group-flyout').forEach(el => el.remove())
  document.body.innerHTML = ''
  document.body.className = ''
  vi.restoreAllMocks()
})

/** Make `getComputedStyle(el).direction` report `dir` for every element `match` accepts. */
function computedDirection(dir: 'ltr' | 'rtl', match: (el: Element) => boolean = () => true): void {
  const original = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const style = original(el, pseudo)
    if (!match(el)) return style
    return new Proxy(style, { get: (t, k) => (k === 'direction' ? dir : Reflect.get(t, k)) })
  })
}

const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...init })

// ─── Split divider ───────────────────────────────────────────────────────────

describe('a split divider follows the pointer', () => {
  const TWO = JSON.stringify({
    version: 2,
    gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
      { type: 'leaf', id: 'L', panels: [], activePanelId: null },
      { type: 'leaf', id: 'R', panels: [], activePanelId: null } ] },
    floating: [], minimized: [], panels: {},
  })

  const dragDivider = async (dir: 'ltr' | 'rtl', dx: number) => {
    const ws = createWorkspace({ panels: { map: { component: P } }, initialState: TWO, dir })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    await nextTick()
    const divider = wrapper.get('[data-vdd-divider]').element as HTMLElement
    Object.defineProperty(divider.parentElement!, 'clientWidth', { value: 1000 })
    divider.setPointerCapture = vi.fn()
    divider.dispatchEvent(pointer('pointerdown', { clientX: 500, clientY: 0 }))
    divider.dispatchEvent(pointer('pointermove', { clientX: 500 + dx, clientY: 0 }))
    divider.dispatchEvent(pointer('pointerup', { clientX: 500 + dx, clientY: 0 }))
    return (ws.state.gridRoot as { sizes: number[] }).sizes
  }

  it('under LTR, moving right grows the first (left-hand) child', async () => {
    computedDirection('ltr')
    const sizes = await dragDivider('ltr', 50)
    expect(sizes[0]).toBeCloseTo(0.55)
  })

  it('under RTL, moving right shrinks the first child, which is on the right', async () => {
    computedDirection('rtl')
    const sizes = await dragDivider('rtl', 50)
    expect(sizes[0]).toBeCloseTo(0.45)
    expect(sizes[1]).toBeCloseTo(0.55)
  })
})

// ─── Sidebar resizer ─────────────────────────────────────────────────────────

describe('a sidebar resizer grows away from its edge', () => {
  const dragResizer = (position: 'left' | 'right', dx: number) => {
    const onUpdate = vi.fn()
    const wrapper = mount(VddSidebar, {
      props: {
        tabs: [{ id: 'a', label: 'A', icon: Icon, component: P }],
        activeTabId: 'a', position, width: 300, 'onUpdate:width': onUpdate,
      } as never,
      attachTo: document.body,
    }) as VueWrapper
    mounted.push(wrapper)
    const bar = wrapper.get('[data-vdd-sidebar-resizer]').element as HTMLElement
    bar.setPointerCapture = vi.fn()
    bar.dispatchEvent(pointer('pointerdown', { clientX: 500, clientY: 0 }))
    bar.dispatchEvent(pointer('pointermove', { clientX: 500 + dx, clientY: 0 }))
    bar.dispatchEvent(pointer('pointerup'))
    return onUpdate
  }

  it('position="left" under RTL sits on the right, so dragging left grows it', () => {
    computedDirection('rtl')
    expect(dragResizer('left', -40)).toHaveBeenLastCalledWith(340)
  })

  it('position="right" under RTL sits on the left, so dragging right grows it', () => {
    computedDirection('rtl')
    expect(dragResizer('right', 40)).toHaveBeenLastCalledWith(340)
  })

  it('LTR is unchanged', () => {
    computedDirection('ltr')
    expect(dragResizer('left', 40)).toHaveBeenLastCalledWith(340)
    expect(dragResizer('right', -40)).toHaveBeenLastCalledWith(340)
  })
})

// ─── Toolbar flyout ──────────────────────────────────────────────────────────

describe('a toolbar flyout opens by the strip\'s own direction', () => {
  const items: ToolbarItem[] = [{
    type: 'group', id: 'tools', label: 'Tools', defaultIcon: Icon,
    items: [{ id: 'pen', label: 'Pen', icon: Icon }],
  }]

  const openFlyout = async (workspaceDir: 'ltr' | 'rtl') => {
    // A button at x 100–140, and a flyout the same size: on screen whichever way it opens,
    // so the viewport clamp leaves the placement alone.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 100, right: 140, top: 100, bottom: 140, width: 40, height: 40, x: 100, y: 100, toJSON: () => ({}) } as DOMRect)
    const ws = createWorkspace({ panels: {}, dir: workspaceDir })
    const wrapper = mount(VddToolbar, {
      props: { items, position: 'left' } as never,
      global: { plugins: [ws] },
      attachTo: document.body,
    }) as VueWrapper
    mounted.push(wrapper)
    await wrapper.get('.vdd-toolbar-btn-group').trigger('click')
    await nextTick()
    return document.querySelector('.vdd-toolbar-group-flyout') as HTMLElement
  }

  it('an RTL workspace beside an LTR strip still opens a left strip rightwards', async () => {
    computedDirection('ltr')
    const flyout = await openFlyout('rtl')
    expect(flyout.style.left).toBe('148px')
    expect(flyout.style.right).toBe('')
  })

  it('an RTL strip opens a left strip (now on the right) leftwards', async () => {
    computedDirection('rtl')
    const flyout = await openFlyout('ltr')
    expect(flyout.style.right).not.toBe('')
    expect(flyout.style.left).toBe('')
  })
})

// ─── Tab insertion side ──────────────────────────────────────────────────────

describe('a tab dropped on another tab lands on the side the pointer is on', () => {
  it('tabSide maps a physical half to a logical side', () => {
    const rect = { left: 100, width: 100 }
    expect(tabSide(120, rect, false)).toBe('left')
    expect(tabSide(180, rect, false)).toBe('right')
    // Under RTL the logical start is on the right.
    expect(tabSide(120, rect, true)).toBe('right')
    expect(tabSide(180, rect, true)).toBe('left')
  })

  const dropOnB = async (dir: 'ltr' | 'rtl', clientX: number) => {
    const ws = createWorkspace({ panels: { map: { component: P } }, dir })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    ws.openPanel('a', 'map'); ws.openPanel('b', 'map'); ws.openPanel('c', 'map')
    await nextTick()
    const tab = wrapper.get('[data-vdd-tab="a"]').element as HTMLElement
    tab.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 80, clientY: 80 }))
    await nextTick()
    const b = wrapper.get('[data-vdd-tab="b"]').element as HTMLElement
    b.getBoundingClientRect = () => ({ left: 100, width: 100, right: 200, top: 0, bottom: 30, height: 30, x: 100, y: 0, toJSON: () => ({}) })
    b.dispatchEvent(pointer('pointermove', { pointerType: 'mouse', clientX, clientY: 10 }))
    await nextTick()
    window.dispatchEvent(pointer('pointerup', { clientX, clientY: 10 }))
    await nextTick()
    return wrapper.findAll('[data-vdd-tab]').map(t => t.attributes('data-vdd-tab'))
  }

  it('under RTL, the left half of a tab is its logical end: the tab goes after it', async () => {
    expect(await dropOnB('rtl', 120)).toEqual(['b', 'a', 'c'])
  })

  it('under RTL, the right half of a tab is its logical start: the tab goes before it', async () => {
    expect(await dropOnB('rtl', 180)).toEqual(['a', 'b', 'c'])
  })
})
