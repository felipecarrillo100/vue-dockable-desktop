/**
 * `<VddDesktop>` — grid rendering, tab groups, and the persistence port.
 *
 * Ports `CoreLayout.test.tsx` (7) and `TabOperations.test.tsx` (4), names preserved, and
 * **substitutes** `DomStability.test.tsx` (3): rdd's version asserts React-portal specifics,
 * so the same guarantee is asserted through Teleport instead (PARITY.md §3).
 *
 * jsdom does no layout, so nothing here can check geometry, hit areas or real scrolling.
 * Those live in the browser gate, `scripts/gates/browser/m4.mjs`.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import { usePanel } from '../../src/composables/usePanel'

/** A panel that records how many times it was created, and holds state that must survive. */
const makeCounter = () => {
  const mounts = ref(0)
  const Panel = defineComponent({
    name: 'CounterPanel',
    setup() {
      mounts.value++
      const ticks = ref(0)
      const { id } = usePanel()
      return () => h('div', { class: 'counter', 'data-counter-id': id }, [
        h('span', { class: 'ticks' }, String(ticks.value)),
        h('button', { class: 'tick', onClick: () => ticks.value++ }, 'tick'),
      ])
    },
  })
  return { Panel, mounts }
}

const TWO_LEAF = JSON.stringify({
  version: 2,
  gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
    { type: 'leaf', id: 'L', panels: [], activePanelId: null },
    { type: 'leaf', id: 'R', panels: [], activePanelId: null } ] },
  floating: [], minimized: [], panels: {},
})

/**
 * These tests attach to `document.body` and query it directly, because the panel DOM lives
 * outside the component tree by design — so they must clean up after themselves or a later
 * `document.querySelector` finds an earlier test's leftovers. (It did: three tests failed
 * against stale nodes before this was added.)
 */
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount').forEach(el => el.remove())
  document.body.innerHTML = ''
})

const setup = (initialState?: string) => {
  const { Panel, mounts } = makeCounter()
  const ws = createWorkspace({ panels: { counter: { component: Panel } }, ...(initialState ? { initialState } : {}) })
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body })
  mounted.push(wrapper)
  return { ws, wrapper, mounts }
}

describe('WindowManager Core Layout Operations', () => {
  it('renders an empty workspace without error', () => {
    const { wrapper } = setup()
    expect(wrapper.find('.vdd-workspace').exists()).toBe(true)
    expect(wrapper.find('.vdd-empty-leaf-placeholder').exists()).toBe(true)
  })

  it('renders a leaf group with a tab per panel', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'counter'); ws.openPanel('b', 'counter')
    await nextTick()
    expect(wrapper.findAll('[data-vdd-tab]').map(t => t.attributes('data-vdd-tab'))).toEqual(['a', 'b'])
  })

  it('renders a branch with a divider between each pair of children', async () => {
    const { ws, wrapper } = setup(TWO_LEAF)
    ws.openPanel('a', 'counter')
    ws.openPanel('b', 'counter')
    ws.dockPanelToGroup('b', 'R', 'center')
    await nextTick()
    expect(wrapper.findAll('.vdd-workspace-branch').length).toBe(1)
    expect(wrapper.findAll('[data-vdd-divider]').length).toBe(1)
  })

  it('renders nested branches recursively', async () => {
    const { ws, wrapper } = setup(TWO_LEAF)
    ws.openPanel('a', 'counter')
    ws.openPanel('b', 'counter')
    ws.dockPanelToGroup('b', 'R', 'center')
    ws.openPanel('c', 'counter')
    ws.dockPanelToGroup('c', 'R', 'bottom')          // splits R, nesting a branch
    await nextTick()
    expect(wrapper.findAll('.vdd-workspace-branch').length).toBe(2)
    expect(wrapper.findAll('[data-vdd-leaf]').length).toBe(3)
  })

  it('marks the selected tab active, and distinguishes focused from unfocused groups', async () => {
    const { ws, wrapper } = setup(TWO_LEAF)
    ws.openPanel('a', 'counter')
    ws.openPanel('b', 'counter')
    ws.dockPanelToGroup('b', 'R', 'center')          // b is docked, and becomes active
    await nextTick()
    expect(wrapper.find('[data-vdd-tab="b"]').classes()).toContain('vdd-workspace-tab-active-focused')
    expect(wrapper.find('[data-vdd-tab="a"]').classes()).toContain('vdd-workspace-tab-active-unfocused')
  })

  it('never lets the focused tab and activePanelId disagree (D2)', async () => {
    const { ws, wrapper } = setup(TWO_LEAF)
    ws.openPanel('a', 'counter')
    ws.openPanel('b', 'counter')
    ws.dockPanelToGroup('b', 'R', 'center')
    await nextTick()
    const focused = wrapper.findAll('.vdd-workspace-tab-active-focused')
    expect(focused.length).toBe(1)
    expect(focused[0]!.attributes('data-vdd-tab')).toBe(ws.state.activePanelId)
  })

  it('renders an unregistered panel as a diagnostic rather than crashing', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('ghost', 'not-registered')
    await nextTick()
    expect(wrapper.find('.vdd-unregistered-panel').exists()).toBe(true)
  })
})

describe('WindowManager Tab Operations', () => {
  it('clicking a tab selects it', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'counter'); ws.openPanel('b', 'counter')
    await nextTick()
    await wrapper.find('[data-vdd-tab="a"]').trigger('click')
    expect(ws.state.activePanelId).toBe('a')
  })

  it('clicking a tab\'s close button closes that panel', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'counter'); ws.openPanel('b', 'counter')
    await nextTick()
    await wrapper.find('[data-vdd-close="a"]').trigger('click')
    await nextTick()
    expect(ws.isOpen('a')).toBe(false)
    expect(wrapper.findAll('[data-vdd-tab]').length).toBe(1)
  })

  it('shows a dirty marker on the tab', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'counter')
    ws.setPanelDirty('a', true)
    await nextTick()
    expect(wrapper.find('[data-vdd-tab="a"]').text()).toContain('*')
  })

  it('reorders tabs by index', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'counter'); ws.openPanel('b', 'counter'); ws.openPanel('c', 'counter')
    await nextTick()
    const leafId = (wrapper.find('[data-vdd-leaf]').attributes('data-vdd-leaf'))!
    ws.movePanelOrder('c', leafId, 0)
    await nextTick()
    expect(wrapper.findAll('[data-vdd-tab]').map(t => t.attributes('data-vdd-tab'))).toEqual(['c', 'a', 'b'])
  })
})

describe('the persistence port keeps panels alive (substitutes DomStability)', () => {
  it('mounts each panel exactly once, however many tabs exist', async () => {
    const { ws, mounts } = setup()
    ws.openPanel('a', 'counter'); ws.openPanel('b', 'counter')
    await nextTick()
    expect(mounts.value).toBe(2)
  })

  it('does not re-create a panel when the user switches tabs away and back', async () => {
    const { ws, mounts } = setup()
    ws.openPanel('a', 'counter'); ws.openPanel('b', 'counter')
    await nextTick()
    const before = mounts.value
    ws.focusPanel('a'); await nextTick()
    ws.focusPanel('b'); await nextTick()
    ws.focusPanel('a'); await nextTick()
    expect(mounts.value).toBe(before)
  })

  it('keeps a panel\'s own DOM node identical across every placement change', async () => {
    const { ws } = setup(TWO_LEAF)
    ws.openPanel('a', 'counter')
    ws.openPanel('keeper', 'counter')
    await nextTick()
    const node = document.querySelector('[data-counter-id="a"]')
    expect(node).not.toBeNull()

    ws.dockPanelToGroup('a', 'R', 'center'); await nextTick()
    expect(document.querySelector('[data-counter-id="a"]')).toBe(node)
    ws.minimizePanel('a'); await nextTick()
    expect(document.querySelector('[data-counter-id="a"]')).toBe(node)   // off-screen, still alive
    ws.restorePanel('a'); await nextTick()
    expect(document.querySelector('[data-counter-id="a"]')).toBe(node)
    ws.floatPanel('a'); await nextTick()
    expect(document.querySelector('[data-counter-id="a"]')).toBe(node)
  })

  it('keeps a panel\'s component state through a tab switch', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'counter'); ws.openPanel('b', 'counter')
    await nextTick()
    const tick = document.querySelector('[data-counter-id="a"] .tick') as HTMLElement
    tick.click(); tick.click(); tick.click()
    await nextTick()
    expect(document.querySelector('[data-counter-id="a"] .ticks')!.textContent).toBe('3')

    ws.focusPanel('b'); await nextTick()
    ws.focusPanel('a'); await nextTick()
    expect(document.querySelector('[data-counter-id="a"] .ticks')!.textContent).toBe('3')
    expect(wrapper.find('[data-vdd-tab="a"]').classes()).toContain('vdd-active')
  })

  it('moves the panel element into the slot that currently shows it', async () => {
    const { ws } = setup()
    ws.openPanel('a', 'counter')
    await nextTick()
    const mountEl = document.querySelector('[data-vdd-panel="a"]')!
    expect(mountEl.parentElement!.getAttribute('data-vdd-slot')).toBe('a')

    ws.minimizePanel('a'); await nextTick()
    expect(mountEl.parentElement!.className).toContain('vdd-panel-store')   // parked off-screen

    ws.restorePanel('a'); await nextTick()
    expect(mountEl.parentElement!.getAttribute('data-vdd-slot')).toBe('a')
  })

  it('parks a background tab\'s panel off-screen, alive, with no slot of its own', async () => {
    // Only the selected tab of a leaf has a slot. A background tab's panel is therefore in
    // the off-screen store — still mounted, still ticking, simply not shown. This is the
    // shape of the whole design, so it is asserted rather than assumed.
    const { ws, mounts } = setup()
    ws.openPanel('a', 'counter')
    ws.openPanel('b', 'counter')          // b is selected; a moves to the background
    await nextTick()
    const a = document.querySelector('[data-vdd-panel="a"]')!
    const b = document.querySelector('[data-vdd-panel="b"]')!
    expect(a.parentElement!.className).toContain('vdd-panel-store')
    expect(b.parentElement!.getAttribute('data-vdd-slot')).toBe('b')
    expect(document.querySelectorAll('[data-vdd-slot]').length).toBe(1)
    expect(mounts.value).toBe(2)          // both alive

    ws.focusPanel('a'); await nextTick()
    expect(a.parentElement!.getAttribute('data-vdd-slot')).toBe('a')
    expect(b.parentElement!.className).toContain('vdd-panel-store')
    expect(mounts.value).toBe(2)          // neither was re-created
  })

  it('places a panel in its slot within a single tick, not a frame later', async () => {
    // The move is made from a function ref during the patch, so a panel is never briefly
    // parked off-screen while its slot already exists — which a watcher-based move would do.
    const { ws } = setup()
    ws.openPanel('a', 'counter')
    await nextTick()
    expect(document.querySelector('[data-vdd-panel="a"]')!.parentElement!.getAttribute('data-vdd-slot')).toBe('a')
  })

  it('releases a closed panel\'s element so the cache cannot grow forever', async () => {
    const { ws } = setup()
    ws.openPanel('a', 'counter')
    await nextTick()
    expect(document.querySelector('[data-vdd-panel="a"]')).not.toBeNull()
    ws.closePanel('a'); await nextTick()
    expect(document.querySelector('[data-vdd-panel="a"]')).toBeNull()
  })

  it('cleans up the hidden store when the desktop unmounts', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'counter')
    await nextTick()
    expect(document.querySelectorAll('.vdd-panel-store').length).toBe(1)
    wrapper.unmount()
    mounted.length = 0
    await nextTick()
    expect(document.querySelectorAll('.vdd-panel-store').length).toBe(0)
  })
})

describe('skin and animations', () => {
  it('mirrors the skin onto the document so teleported chrome inherits its tokens', () => {
    const ws = createWorkspace()
    const wrapper = mount(VddDesktop, { props: { skin: 'macos' }, global: { plugins: [ws] } })
    mounted.push(wrapper)
    expect(document.documentElement.getAttribute('data-vdd-skin')).toBe('macos')
    mounted.length = 0
    wrapper.unmount()
    expect(document.documentElement.getAttribute('data-vdd-skin')).toBeNull()
  })

  it('opts out of the library\'s own animations without touching the host app', () => {
    const ws = createWorkspace()
    const wrapper = mount(VddDesktop, { props: { animations: false }, global: { plugins: [ws] } })
    mounted.push(wrapper)
    expect(wrapper.find('.vdd-workspace').classes()).toContain('vdd-no-animations')
    expect(document.documentElement.classList.contains('vdd-no-animations')).toBe(true)
    mounted.length = 0
    wrapper.unmount()
    expect(document.documentElement.classList.contains('vdd-no-animations')).toBe(false)
  })
})
