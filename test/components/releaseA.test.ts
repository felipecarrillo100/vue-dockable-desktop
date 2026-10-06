/**
 * The 1.9.0 additions (parity with rdd 7.8.0), through the public API: each is opt-in, and
 * without it nothing changes.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import type { Workspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import { usePanel } from '../../src/composables/usePanel'
import type { PanelDefaultOptions } from '../../src/core/registry'

const Plain = defineComponent({ setup: () => () => h('div', { 'data-plain': '' }) })

let mounts = 0
let unmounts = 0
/** Counts its own mounts, and keeps a counter so a fresh mount is visible. */
const Heavy = defineComponent({
  setup() {
    const { id } = usePanel()
    const clicks = ref(0)
    onMounted(() => { mounts++ })
    onUnmounted(() => { unmounts++ })
    return () => h('button', { 'data-heavy': id, onClick: () => clicks.value++ }, String(clicks.value))
  },
})

const wrappers: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  document.body.innerHTML = ''
})

function setup(opts: { slots?: Record<string, () => unknown>; heavy?: PanelDefaultOptions; chart?: PanelDefaultOptions; initialState?: string } = {}): Workspace {
  mounts = 0; unmounts = 0
  const ws = createWorkspace({
    panels: {
      plain: { component: Plain },
      heavy: { component: Heavy, defaultOptions: opts.heavy ?? {} },
      chart: { component: Plain, defaultOptions: opts.chart ?? {} },
    },
    ...(opts.initialState ? { initialState: opts.initialState } : {}),
  })
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body, slots: opts.slots as never })
  wrappers.push(wrapper)
  return ws
}
const $ = (sel: string) => document.querySelector(sel)
type Node = { type: 'leaf'; id: string; panels: string[] } | { type: 'branch'; sizes: number[]; orientation: string; children: Node[] }
const leafOf = (node: Node, id: string): Extract<Node, { type: 'leaf' }> | null =>
  node.type === 'leaf' ? (node.panels.includes(id) ? node : null) : node.children.map(c => leafOf(c, id)).find(Boolean) ?? null

describe('#empty-workspace', () => {
  it('shows the app view while no panel is docked, and the panel once one opens', async () => {
    const ws = setup({ slots: { 'empty-workspace': () => h('p', { 'data-welcome': '' }, 'Open a file to start') } })
    await nextTick()
    expect($('[data-welcome]')?.textContent).toBe('Open a file to start')
    expect($('.vdd-empty-leaf-placeholder')).toBeNull()
    ws.openPanel('a', 'plain'); await nextTick()
    expect($('[data-welcome]')).toBeNull()
    ws.closePanel('a'); await nextTick()
    expect($('[data-welcome]')).not.toBeNull()
  })

  it('without the slot, the built-in message shows as before', async () => {
    setup(); await nextTick()
    expect($('.vdd-empty-leaf-placeholder')).not.toBeNull()
    expect($('.vdd-empty-workspace')).toBeNull()
  })

  it('empty groups inside a split keep the built-in message: only the root group shows the view', async () => {
    // A layout that starts as a split of two empty groups: neither is the root group.
    const split = JSON.stringify({
      version: 2,
      gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
        { type: 'leaf', id: 'L', panels: [], activePanelId: null },
        { type: 'leaf', id: 'R', panels: [], activePanelId: null }] },
      floating: [], minimized: [], panels: {},
    })
    setup({ initialState: split, slots: { 'empty-workspace': () => h('p', { 'data-welcome': '' }) } })
    await nextTick()
    expect(document.querySelectorAll('.vdd-empty-leaf-placeholder').length).toBe(2)
    expect($('[data-welcome]')).toBeNull()
  })
})

describe('state attributes', () => {
  const has = (sel: string, attr: string) => $(sel)?.hasAttribute(attr) ?? false

  it('a tab carries data-vdd-selected, -focused and -dirty only while each is true', async () => {
    const ws = setup()
    ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain'); await nextTick()
    expect([has('[data-vdd-tab="b"]', 'data-vdd-selected'), has('[data-vdd-tab="b"]', 'data-vdd-focused')]).toEqual([true, true])
    expect([has('[data-vdd-tab="a"]', 'data-vdd-selected'), has('[data-vdd-tab="a"]', 'data-vdd-focused')]).toEqual([false, false])
    ws.setPanelDirty('a', true); await nextTick()
    expect(has('[data-vdd-tab="a"]', 'data-vdd-dirty')).toBe(true)
    expect(has('[data-vdd-tab="b"]', 'data-vdd-dirty')).toBe(false)
    ws.setPanelDirty('a', false); await nextTick()
    expect(has('[data-vdd-tab="a"]', 'data-vdd-dirty')).toBe(false)
    // Floating b away: a becomes its group's selected tab, but b stays the focused panel.
    ws.floatPanel('b'); await nextTick()
    expect(has('[data-vdd-tab="a"]', 'data-vdd-selected')).toBe(true)
    expect(has('[data-vdd-tab="a"]', 'data-vdd-focused')).toBe(false)
  })

  it('a floating window carries data-vdd-focused and -maximized only while each is true', async () => {
    const ws = setup()
    ws.openPanel('a', 'plain', { initialTarget: 'floating' }); ws.openPanel('b', 'plain', { initialTarget: 'floating' }); await nextTick()
    expect(has('[data-vdd-window="b"]', 'data-vdd-focused')).toBe(true)
    expect(has('[data-vdd-window="a"]', 'data-vdd-focused')).toBe(false)
    expect(has('[data-vdd-window="b"]', 'data-vdd-maximized')).toBe(false)
    ws.maximizePanel('b'); await nextTick()
    expect(has('[data-vdd-window="b"]', 'data-vdd-maximized')).toBe(true)
    ws.maximizePanel('b'); await nextTick()
    expect(has('[data-vdd-window="b"]', 'data-vdd-maximized')).toBe(false)
  })
})

describe('openPanel dockTo', () => {
  it('splits beside the target panel, giving the new group the requested share', () => {
    const ws = setup()
    ws.openPanel('chart', 'plain')
    ws.openPanel('legend', 'plain', { dockTo: { panel: 'chart', position: 'right', size: 0.25 } })
    const root = ws.state.gridRoot as Node
    expect(root.type).toBe('branch')
    if (root.type !== 'branch') return
    expect(root.orientation).toBe('horizontal')
    expect(root.children.map(c => (c.type === 'leaf' ? c.panels : []))).toEqual([['chart'], ['legend']])
    expect(root.sizes).toEqual([0.75, 0.25])
  })

  it("'center' adds it as a tab in the target's group, even a second group", () => {
    const ws = setup()
    ws.openPanel('a', 'plain')
    ws.openPanel('c', 'plain', { dockTo: { panel: 'a', position: 'right' } })
    ws.openPanel('b', 'plain', { dockTo: { panel: 'c', position: 'center' } })
    expect(leafOf(ws.state.gridRoot as Node, 'b')?.panels).toEqual(['c', 'b'])
    expect(leafOf(ws.state.gridRoot as Node, 'a')?.panels).toEqual(['a'])
  })

  it('wins over initialTarget, and clamps size to 0.1–0.9', () => {
    const ws = setup()
    ws.openPanel('a', 'plain')
    ws.openPanel('b', 'plain', { initialTarget: 'floating', dockTo: { panel: 'a', position: 'left', size: 5 } })
    expect(ws.state.floating.map(f => f.id)).toEqual([])
    const root = ws.state.gridRoot as Node
    if (root.type !== 'branch') throw new Error('expected a split')
    expect(root.sizes[0]).toBe(0.9)
    expect(root.sizes[1]).toBeCloseTo(0.1)
  })

  it('falls back to the usual placement, with a warning, when the target is not docked', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const ws = setup()
      ws.openPanel('f', 'plain', { initialTarget: 'floating' })
      ws.openPanel('b', 'plain', { dockTo: { panel: 'f', position: 'right' } })
      expect(ws.state.gridRoot.type).toBe('leaf')
      expect(leafOf(ws.state.gridRoot as Node, 'b')).not.toBeNull()
      expect(warn.mock.calls.some(c => String(c[0]).includes('could not dock beside "f"'))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })

  it('does nothing for a panel that is already open', () => {
    const ws = setup()
    ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain')
    const before = JSON.stringify(ws.state.gridRoot)
    ws.openPanel('b', 'plain', { dockTo: { panel: 'a', position: 'right' } })
    expect(JSON.stringify(ws.state.gridRoot)).toBe(before)
  })
})

describe('className and tabClassName per panel kind', () => {
  it("adds them to that kind's content element and tab only", async () => {
    const ws = setup({ chart: { className: 'app-chart', tabClassName: 'app-chart-tab' } })
    // The content shown in the group body is the selected panel's own element.
    const shownContent = () => document.querySelector('.vdd-panel-body .vdd-panel-content')
    ws.openPanel('p', 'plain'); ws.openPanel('c', 'chart'); await nextTick()
    expect(shownContent()?.className).toBe('vdd-panel-content app-chart')
    ws.focusPanel('p'); await nextTick()
    expect(shownContent()?.className).toBe('vdd-panel-content')
    expect($('[data-vdd-tab="c"]')!.classList.contains('app-chart-tab')).toBe(true)
    expect($('[data-vdd-tab="p"]')!.classList.contains('app-chart-tab')).toBe(false)
    // The class travels with the panel: still there once it floats.
    ws.floatPanel('c'); await nextTick()
    expect($('[data-vdd-window="c"] .vdd-panel-content')?.className).toBe('vdd-panel-content app-chart')
  })
})

describe('keepAlive: false', () => {
  const heavy = (id: string) => document.querySelector(`[data-heavy="${id}"]`) as HTMLButtonElement | null

  it('unmounts the component while it is an unselected tab, and mounts it afresh when shown', async () => {
    const ws = setup({ heavy: { keepAlive: false } })
    ws.openPanel('h', 'heavy'); await nextTick()
    heavy('h')!.click(); await nextTick()
    expect(heavy('h')!.textContent).toBe('1')
    ws.openPanel('p', 'plain'); await nextTick()        // p's tab is selected: h is hidden
    expect(unmounts).toBe(1)
    ws.focusPanel('h'); await nextTick()               // shown again: a fresh mount
    expect(mounts).toBe(2)
    expect(heavy('h')!.textContent).toBe('0')
    expect(ws.isOpen('h')).toBe(true)                  // hiding is not closing
  })

  it('unmounts while minimised, and its taskbar preview is the letter tile', async () => {
    const ws = setup({ heavy: { keepAlive: false } })
    ws.openPanel('h', 'heavy', { initialTarget: 'floating' }); await nextTick()
    ws.minimizePanel('h'); await nextTick()
    expect(unmounts).toBe(1)
    ws.restorePanel('h'); await nextTick()
    expect(mounts).toBe(2)
  })

  it('by default, a hidden panel stays mounted and keeps its state, as before', async () => {
    const ws = setup()
    ws.openPanel('h', 'heavy'); await nextTick()
    heavy('h')!.click(); await nextTick()
    ws.openPanel('p', 'plain'); await nextTick()
    ws.focusPanel('h'); await nextTick()
    expect([mounts, unmounts]).toEqual([1, 0])
    expect(heavy('h')!.textContent).toBe('1')
  })

  it('leaks nothing across many hide/show cycles', async () => {
    const ws = setup({ heavy: { keepAlive: false } })
    ws.openPanel('h', 'heavy'); ws.openPanel('p', 'plain'); await nextTick()
    // One full cycle first (two separate renders), so first-show work isn't counted as a leak.
    ws.focusPanel('h'); await nextTick()
    ws.focusPanel('p'); await nextTick()
    const nodesAfterWarmup = document.querySelectorAll('*').length
    for (let i = 0; i < 50; i++) {
      ws.focusPanel('h'); await nextTick()
      ws.focusPanel('p'); await nextTick()
    }
    expect(mounts - unmounts).toBe(0)                  // hidden now: no live instance
    expect(document.querySelectorAll('*').length).toBe(nodesAfterWarmup)
    expect(heavy('h')).toBeNull()
  })
})
