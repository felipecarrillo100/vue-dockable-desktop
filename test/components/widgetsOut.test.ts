/**
 * Widgets out of the panel (rdd 7.11.0, M3): `useFloatingWidgets().move()` / `location()`, through
 * the public API, in a real desktop. A port of rdd's `WidgetsOut.test.tsx` WO1–WO8 (names kept),
 * plus WO17–WO19 (M6, `WidgetPlacement`) and WO21 (the title across moves, rdd next.1).
 *
 * WO1: docked beside the owner: a hosted panel shows the same content element; nothing remounts
 * WO2: tabbed, floating (at a rect, without one, from out of the panel) and minimised
 * WO3: back into the panel: the frame returns where it was, with the same element and state
 * WO4: from one place out of the panel to another, still without a remount
 * WO5: refusals (not-open, owner-not-docked, owner-not-kept-alive, no-workspace) change nothing
 * WO6: ownership: an in-page close of the hosted panel, close(), closeAll() and the owner closing
 *      all close the widget; a layout load sends it back into the panel
 * WO7: the owner minimised: the widget stays out and on screen
 * WO8: the hosted panel follows the widget's title and icon, also on a re-open
 * WO17: placement(): null when not open; the panel form; docked, tabbed and floating out of it,
 *       with home; a minimised one remembers where it was
 * WO18: open({ placement }) puts it back in the panel; a broken value uses the config; a re-open
 *       of a live id ignores it; a free position waits for the panel to have a size
 * WO19: open({ placement }) out of the panel moves it out after opening, and back goes home;
 *       closed and re-opened in one go, the same panel id shows the new content; refused, it
 *       stays in the panel
 * WO21: a title set on the hosted panel is kept across moves out of the panel
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace, useFloatingWidgets } from '../../src'
import type { ManagedWidget, Workspace } from '../../src'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddPanelOverlay from '../../src/components/VddPanelOverlay.vue'
import VddModals from '../../src/components/VddModals.vue'
import { findLeafForPanel } from '../../src/core/layoutTree'
import { usePanelDom } from '../../src/composables/usePanelDom'
import type { PanelDomCache } from '../../src/core/panelDom'

let api: ReturnType<typeof useFloatingWidgets> | null = null
const mounts = vi.fn()
const unmounts = vi.fn()

/** Widget content with state, and a record of every mount and unmount. */
const Table = defineComponent({
  setup() {
    const n = ref(0)
    onMounted(() => mounts())
    onUnmounted(() => unmounts())
    return () => h('button', { id: 'wo-count', onClick: () => { n.value++ } }, String(n.value))
  },
})
const Grab = defineComponent({ setup() { api = useFloatingWidgets(); return () => null } })
const Owner = defineComponent({ setup: () => () => h(VddPanelOverlay, null, { default: () => h(Grab) }) })
/** Also hands the tests the workspace's panel DOM cache, to see its hosted-content registry. */
let dom: PanelDomCache | null = null
const Plain = defineComponent({ setup() { dom = usePanelDom(); return () => h('div') } })
const TIcon = defineComponent({ setup: () => () => h('i', { class: 't-icon' }) })
const RIcon = defineComponent({ setup: () => () => h('i', { class: 'r-icon' }) })

const table: ManagedWidget = { title: 'Table', component: Table, anchor: 'bottom-left', width: 240, height: 160 }

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
  api = null
  dom = null
  mounts.mockClear(); unmounts.mockClear()
})

function desktop(ws: Workspace, root: () => unknown = () => h(VddDesktop)): void {
  const wrapper = mount(defineComponent({ setup: () => root }), {
    global: { plugins: [ws] },
    attachTo: document.body,
  }) as VueWrapper
  mounted.push(wrapper)
}

async function setup(): Promise<Workspace> {
  const ws = createWorkspace({
    panels: {
      map: { component: Owner },
      lazy: { component: Owner, defaultOptions: { keepAlive: false } },
      plain: { component: Plain },
    },
  }) as unknown as Workspace
  desktop(ws)
  await nextTick()
  ws.openPanel('map', 'map', { title: 'Map' })
  await nextTick()
  api!.open('table', table)
  await nextTick()
  return ws
}

const $ = (sel: string) => document.querySelector(sel)
const content = () => $('.vdd-panel-float__content') as HTMLElement | null
const frame = () => $('[data-vdd-widget="table"]') as HTMLElement | null
const hostedEl = () => $('[data-vdd-panel="map/table"]') as HTMLElement | null
const count = () => $('#wo-count')?.textContent
const click = async () => { ($('#wo-count') as HTMLElement).click(); await nextTick() }
const go = async (to: Parameters<NonNullable<typeof api>['move']>[1]) => {
  const r = api!.move('table', to)
  await nextTick()
  return r
}
const snapshot = (ws: Workspace) => JSON.stringify({
  panels: ws.state.panels, grid: ws.state.gridRoot, floating: ws.state.floating, minimized: ws.state.minimized,
})
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect

describe('WO1: docked beside the owner', () => {
  it('opens a hosted panel that shows the same element, and nothing remounts', async () => {
    const ws = await setup()
    const el = content()
    await click(); await click()
    expect(await go({ to: 'docked', position: 'bottom', size: 0.3 })).toEqual({ ok: true })
    expect(ws.state.panels['map/table']).toMatchObject({
      component: 'vdd:widget', state: 'docked', owner: { panelId: 'map', widgetId: 'table' },
    })
    expect(findLeafForPanel(ws.state.gridRoot, 'map/table')).not.toBe(findLeafForPanel(ws.state.gridRoot, 'map'))
    expect(content()).toBe(el)
    expect(el!.parentElement!.classList.contains('vdd-hosted-widget')).toBe(true)
    expect(el!.closest('[data-vdd-panel="map/table"]')).not.toBeNull()
    // Shown in the grid, not parked in a store.
    expect(el!.closest('[data-vdd-leaf]')).not.toBeNull()
    expect(frame()).toBeNull()
    expect(count()).toBe('2')
    expect(mounts).toHaveBeenCalledTimes(1)
    expect(unmounts).not.toHaveBeenCalled()
    expect(api!.location('table')).toBe('docked')
    expect(api!.openIds.value).toEqual(['table'])
    expect(ws.getOpenPanelIds()).toContain('map/table')
    expect(ws.saveLayout()).not.toContain('map/table')
  })

  it('docks at the size asked for, else the workspace split ratio', async () => {
    const ws = await setup()
    const share = () => {
      const root = ws.state.gridRoot
      return root.type === 'branch' ? root.sizes : null
    }
    await go({ to: 'docked', position: 'bottom', size: 0.3 })
    expect(share()?.[1]).toBeCloseTo(0.3)
    await go({ to: 'panel' })
    await go({ to: 'docked', position: 'right' })
    expect(share()?.[1]).toBeCloseTo(ws.state.splitRatio)
  })
})

describe('WO2: tabbed, floating and minimised', () => {
  it('floating without a rect, from out of the panel, opens where its panel is on screen', async () => {
    const ws = await setup()
    await go({ to: 'docked', position: 'bottom' })
    const el = hostedEl()!
    const viewport = el.closest('.vdd-workspace-viewport') as HTMLElement
    el.getBoundingClientRect = () => rect(130, 90, 410, 170)
    viewport.getBoundingClientRect = () => rect(10, 20, 1000, 700)
    await go({ to: 'floating' })
    expect(ws.state.floating.find(w => w.id === 'map/table')).toMatchObject({ x: 120, y: 70, width: 410, height: 170 })
    // Floating already, it stays where it is.
    await go({ to: 'floating', rect: { x: 33, y: 44, width: 300, height: 200 } })
    await go({ to: 'floating' })
    expect(ws.state.floating.find(w => w.id === 'map/table')).toMatchObject({ x: 33, y: 44, width: 300, height: 200 })
  })

  it('floating without a rect, from the panel, opens where its frame is', async () => {
    const ws = await setup()
    const viewport = frame()!.closest('.vdd-workspace-viewport') as HTMLElement
    frame()!.getBoundingClientRect = () => rect(60, 70, 250, 150)
    viewport.getBoundingClientRect = () => rect(10, 20, 1000, 700)
    await go({ to: 'floating' })
    expect(ws.state.floating.find(w => w.id === 'map/table')).toMatchObject({ x: 50, y: 50, width: 250, height: 150 })
  })

  it('a tab in the owner\'s group', async () => {
    const ws = await setup()
    await go({ to: 'tabbed' })
    expect(findLeafForPanel(ws.state.gridRoot, 'map/table')).toBe(findLeafForPanel(ws.state.gridRoot, 'map'))
    expect(api!.location('table')).toBe('tabbed')
  })

  it('a floating window at the given rect', async () => {
    const ws = await setup()
    await go({ to: 'floating', rect: { x: 40, y: 50, width: 300, height: 200 } })
    expect(ws.state.floating.find(w => w.id === 'map/table')).toMatchObject({ x: 40, y: 50, width: 300, height: 200 })
    expect(api!.location('table')).toBe('floating')
    expect(content()!.closest('[data-vdd-panel="map/table"]')).not.toBeNull()
  })

  it('a floating window without a rect takes the widget\'s size', async () => {
    const ws = await setup()
    await go({ to: 'floating' })
    expect(ws.state.floating.find(w => w.id === 'map/table')).toMatchObject({ width: 240, height: 160 })
  })

  it('minimised by the user', async () => {
    const ws = await setup()
    await go({ to: 'docked', position: 'right' })
    ws.minimizePanel('map/table')
    await nextTick()
    expect(api!.location('table')).toBe('minimized')
  })
})

describe('WO3: back into the panel', () => {
  it('the frame returns where it was, with the same element and state; the hosted panel leaves', async () => {
    const ws = await setup()
    ws.openPanel('other', 'plain', { dockTo: { panel: 'map', position: 'right' } })
    await nextTick()
    const el = content()
    const style = frame()!.getAttribute('style')
    await click()
    const closed = vi.fn()
    ws.subscribe('panel:closed', ({ id }) => closed(id))
    await go({ to: 'docked', position: 'bottom' })
    expect(await go({ to: 'panel' })).toEqual({ ok: true })
    expect(ws.state.panels['map/table']).toBeUndefined()
    expect(closed).toHaveBeenCalledWith('map/table')
    expect(frame()).not.toBeNull()
    expect(frame()!.getAttribute('style')).toBe(style)
    expect(content()).toBe(el)
    expect(el!.parentElement!.classList.contains('vdd-panel-float__body')).toBe(true)
    expect(count()).toBe('1')
    expect(mounts).toHaveBeenCalledTimes(1)
    expect(api!.location('table')).toBe('panel')
    expect(api!.isOpen('table')).toBe(true)
    // The workspace no longer holds the element for a panel that is gone.
    expect(dom!.hostedContent('map/table')).toBeUndefined()
  })

  it('is a no-op success when already in the panel', async () => {
    await setup()
    expect(await go({ to: 'panel' })).toEqual({ ok: true })
    expect(frame()).not.toBeNull()
  })
})

describe('WO4: from one place out to another', () => {
  it('docked, then floating, then tabbed: one hosted panel, the same element, no remount', async () => {
    const ws = await setup()
    const el = content()
    await click()
    await go({ to: 'docked', position: 'bottom' })
    await go({ to: 'floating', rect: { x: 10, y: 10, width: 200, height: 150 } })
    expect(api!.location('table')).toBe('floating')
    await go({ to: 'tabbed' })
    expect(api!.location('table')).toBe('tabbed')
    expect(Object.keys(ws.state.panels).sort()).toEqual(['map', 'map/table'])
    expect(ws.state.floating).toEqual([])
    expect(content()).toBe(el)
    expect(el!.parentElement!.classList.contains('vdd-hosted-widget')).toBe(true)
    expect(count()).toBe('1')
    expect(mounts).toHaveBeenCalledTimes(1)
  })
})

describe('WO5: refusals', () => {
  it('not-open', async () => {
    await setup()
    expect(api!.move('nope', { to: 'tabbed' })).toEqual({ ok: false, reason: 'not-open' })
    expect(api!.location('nope')).toBeNull()
  })

  it('owner-not-docked for docked and tabbed; a floating owner can still float it', async () => {
    const ws = await setup()
    ws.floatPanel('map')
    await nextTick()
    const before = snapshot(ws)
    expect(await go({ to: 'docked', position: 'left' })).toEqual({ ok: false, reason: 'owner-not-docked' })
    expect(await go({ to: 'tabbed' })).toEqual({ ok: false, reason: 'owner-not-docked' })
    expect(snapshot(ws)).toBe(before)
    expect(frame()).not.toBeNull()
    expect(await go({ to: 'floating' })).toEqual({ ok: true })
  })

  it('owner-not-docked while out of the panel leaves it where it is', async () => {
    const ws = await setup()
    await go({ to: 'floating', rect: { x: 40, y: 50, width: 300, height: 200 } })
    ws.floatPanel('map')
    await nextTick()
    expect(await go({ to: 'tabbed' })).toEqual({ ok: false, reason: 'owner-not-docked' })
    expect(api!.location('table')).toBe('floating')
    expect(ws.state.floating.find(w => w.id === 'map/table')).toMatchObject({ x: 40, y: 50 })
  })

  it('owner-not-kept-alive', async () => {
    const ws = await setup()
    ws.closePanel('map')
    await nextTick()
    ws.openPanel('lz', 'lazy')
    await nextTick()
    api!.open('table', table)
    await nextTick()
    const before = snapshot(ws)
    expect(await go({ to: 'docked', position: 'bottom' })).toEqual({ ok: false, reason: 'owner-not-kept-alive' })
    expect(snapshot(ws)).toBe(before)
  })

  // rdd also tests an overlay outside any provider. A vdd floating widget needs a workspace to
  // render at all (it reads the direction from it), so that case cannot be built here; the store
  // without hosting reports `no-workspace` from useFloatingWidgets() all the same.

  it('no-workspace inside a workspace but not in a workspace panel (as in a modal or drawer)', async () => {
    const ws = createWorkspace({ panels: { plain: { component: Plain } } }) as unknown as Workspace
    desktop(ws, () => [h(Owner), h(VddDesktop)])
    await nextTick()
    api!.open('table', table)
    await nextTick()
    const before = snapshot(ws)
    expect(api!.move('table', { to: 'floating' })).toEqual({ ok: false, reason: 'no-workspace' })
    expect(snapshot(ws)).toBe(before)
  })

  it('no-workspace in a modal, which has a panel context but no place in the layout', async () => {
    const ws = createWorkspace({ panels: { plain: { component: Plain } } }) as unknown as Workspace
    desktop(ws, () => [h(VddDesktop), h(VddModals)])
    await nextTick()
    ws.overlays.openModal(Owner, {}, { title: 'Modal' })
    await nextTick(); await nextTick()
    api!.open('table', table)
    await nextTick()
    const before = snapshot(ws)
    expect(api!.move('table', { to: 'floating' })).toEqual({ ok: false, reason: 'no-workspace' })
    expect(snapshot(ws)).toBe(before)
  })
})

describe('WO6: ownership', () => {
  const out = async (ws: Workspace) => { await go({ to: 'docked', position: 'bottom' }); return ws }

  it('an in-page close of the hosted panel closes the widget', async () => {
    const ws = await out(await setup())
    ws.openPanel('other', 'plain')
    await nextTick()
    expect(dom!.hostedContent('map/table')?.el).toBe(content())
    ws.closePanel('map/table')
    await nextTick()
    expect(api!.isOpen('table')).toBe(false)
    expect(unmounts).toHaveBeenCalledTimes(1)
    expect(content()).toBeNull()
    expect(dom!.hostedContent('map/table')).toBeUndefined()
  })

  it('the tab\'s × closes it the same way', async () => {
    await out(await setup())
    ;($('[data-vdd-tab="map/table"] .vdd-close-tab-x') as HTMLElement).click()
    await nextTick(); await nextTick()
    expect(api!.isOpen('table')).toBe(false)
    expect(content()).toBeNull()
  })

  it('close() and closeAll() remove the hosted panel', async () => {
    const ws = await out(await setup())
    api!.close('table')
    await nextTick()
    expect(ws.state.panels['map/table']).toBeUndefined()
    expect(unmounts).toHaveBeenCalledTimes(1)
    api!.open('table', table)
    await nextTick()
    await out(ws)
    expect(ws.state.panels['map/table']).toBeDefined()
    api!.closeAll()
    await nextTick()
    expect(ws.state.panels['map/table']).toBeUndefined()
    expect(unmounts).toHaveBeenCalledTimes(2)
  })

  it('the owner closing closes the widget and removes its hosted panel', async () => {
    const ws = await out(await setup())
    ws.closePanel('map')
    await nextTick(); await nextTick()
    expect(ws.state.panels['map/table']).toBeUndefined()
    expect(unmounts).toHaveBeenCalledTimes(1)
    expect(content()).toBeNull()
    expect($('.vdd-widget-store')).toBeNull()
  })

  it('a layout load drops the hosted panel and the widget goes back into its panel', async () => {
    const ws = await setup()
    const layout = ws.saveLayout()
    await click()
    await out(ws)
    ws.loadLayout(layout)
    await nextTick()
    expect(ws.state.panels['map/table']).toBeUndefined()
    expect(api!.isOpen('table')).toBe(true)
    expect(api!.location('table')).toBe('panel')
    expect(frame()).not.toBeNull()
    expect(content()!.parentElement!.classList.contains('vdd-panel-float__body')).toBe(true)
    expect(count()).toBe('1')
    // Home for good: moving out again opens a fresh hosted panel.
    expect(await go({ to: 'tabbed' })).toEqual({ ok: true })
    expect(content()!.parentElement!.classList.contains('vdd-hosted-widget')).toBe(true)
  })
})

describe('WO7: the owner minimised', () => {
  it('leaves the widget out and on screen', async () => {
    const ws = await setup()
    ws.openPanel('other', 'plain', { dockTo: { panel: 'map', position: 'right' } })
    await nextTick()
    await go({ to: 'docked', position: 'bottom' })
    ws.minimizePanel('map')
    await nextTick()
    expect(ws.state.panels['map/table']!.state).toBe('docked')
    expect(content()!.closest('[data-vdd-panel="map/table"]')).not.toBeNull()
    expect(content()!.closest('[data-vdd-leaf]')).not.toBeNull()
    expect(mounts).toHaveBeenCalledTimes(1)
  })
})

describe('WO8: title and icon', () => {
  it('the hosted panel takes the widget\'s title and icon, and a re-open updates them', async () => {
    const ws = await setup()
    api!.open('table', { ...table, icon: TIcon })
    await nextTick()
    await go({ to: 'tabbed' })
    expect(ws.state.panels['map/table']!.title).toBe('Table')
    expect($('[data-vdd-tab="map/table"] .t-icon')).not.toBeNull()
    api!.open('table', { ...table, title: 'Rows', icon: RIcon })
    await nextTick()
    expect(ws.state.panels['map/table']!.title).toBe('Rows')
    expect($('[data-vdd-tab="map/table"] .r-icon')).not.toBeNull()
    expect(api!.location('table')).toBe('tabbed')            // a re-open doesn't move it
  })
})

// ─── M6: WidgetPlacement ──────────────────────────────────────────────────────

describe('WO17: placement()', () => {
  it('is null for a widget that isn\'t open, and the panel form in the panel', async () => {
    await setup()
    expect(api!.placement('nope')).toBeNull()
    expect(api!.placement('table')).toEqual({ v: 1, at: 'panel', anchor: 'bottom-left', stretch: null, mode: 'docked', width: 240, height: 160 })
  })

  it('out of the panel: where, plus home', async () => {
    const ws = await setup()
    const home = api!.placement('table')
    await go({ to: 'docked', position: 'right', size: 0.3 })
    expect(api!.placement('table')).toEqual({ v: 1, at: 'docked', position: 'right', size: 0.3, home })
    await go({ to: 'tabbed' })
    expect(api!.placement('table')).toEqual({ v: 1, at: 'tabbed', home })
    await go({ to: 'floating', rect: { x: 40, y: 50, width: 300, height: 200 } })
    expect(api!.placement('table')).toEqual({ v: 1, at: 'floating', rect: { x: 40, y: 50, width: 300, height: 200 }, home })
    // The user moves the window, then minimises it: it remembers the window as it was last.
    ws.updateFloatingPosition('map/table', { x: 90, y: 70 })
    expect(api!.placement('table')).toEqual({ v: 1, at: 'floating', rect: { x: 90, y: 70, width: 300, height: 200 }, home })
    ws.minimizePanel('map/table')
    await nextTick()
    expect(api!.placement('table')).toEqual({ v: 1, at: 'floating', rect: { x: 90, y: 70, width: 300, height: 200 }, home })
  })

  it('minimised from the grid: docked or tabbed, as it was', async () => {
    const ws = await setup()
    const home = api!.placement('table')
    await go({ to: 'docked', position: 'left', size: 0.25 })
    ws.minimizePanel('map/table')
    await nextTick()
    expect(api!.placement('table')).toEqual({ v: 1, at: 'docked', position: 'left', size: 0.25, home })
    ws.restorePanel('map/table')
    await go({ to: 'tabbed' })
    ws.minimizePanel('map/table')
    await nextTick()
    expect(api!.placement('table')).toEqual({ v: 1, at: 'tabbed', home })
  })

  it('is plain JSON', async () => {
    await setup()
    await go({ to: 'docked', position: 'bottom' })
    const p = api!.placement('table')
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
  })
})

describe('WO18: open({ placement }) in the panel', () => {
  const saved = { v: 1, at: 'panel', anchor: 'top-right', stretch: 'height', mode: 'docked', width: 280, height: 190 } as const

  it('puts it where it was saved', async () => {
    await setup()
    api!.close('table')
    api!.open('table', { ...table, placement: saved })
    await nextTick()
    expect(api!.placement('table')).toEqual(saved)
    expect(frame()!.style.insetInlineEnd).toBe('8px')   // top-right
  })

  it('a value it can\'t read falls back to the config', async () => {
    await setup()
    api!.close('table')
    api!.open('table', { ...table, placement: { ...saved, v: 2 } as never })
    expect(api!.placement('table')).toMatchObject({ anchor: 'bottom-left', width: 240, height: 160 })
    api!.close('table')
    api!.open('table', { ...table, placement: { ...saved, anchor: 'nowhere' } as never })
    expect(api!.placement('table')).toMatchObject({ anchor: 'bottom-left' })
  })

  it('a re-open of a live id ignores it, in or out of the panel', async () => {
    await setup()
    api!.open('table', { ...table, placement: saved })
    expect(api!.placement('table')).toMatchObject({ anchor: 'bottom-left' })
    api!.open('table', { ...table, placement: { v: 1, at: 'tabbed', home: saved } as never })
    await nextTick()
    expect(api!.location('table')).toBe('panel')
  })

  const freeSaved = { v: 1, at: 'panel', anchor: 'top-left', stretch: null, mode: 'free', offset: { corner: 'bottom-right', inline: 16, block: 24 }, width: 200, height: 100 }

  it('a free position waits for the panel to have a size, and is kept meanwhile', async () => {
    // jsdom lays nothing out: the overlay measures 0x0, as a hidden panel does.
    await setup()
    api!.close('table')
    api!.open('table', { ...table, placement: freeSaved as never })
    await nextTick()
    expect(api!.placement('table')).toEqual(freeSaved)          // not re-measured against 0x0
    expect(frame()!.style.left).toBe('')                        // shown docked meanwhile
  })

  /** jsdom defines these on Element.prototype; shadowed on HTMLElement, for the overlay root only. */
  const sizeRoot = (w: number, h: number) => {
    const sized = (dim: () => number) => ({ configurable: true, get(this: HTMLElement) { return this.classList.contains('vdd-panel-overlay-root') ? dim() : 0 } })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', sized(() => w))
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', sized(() => h))
  }
  const unsize = () => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
  }

  it('a free position is placed at once when the panel has a size', async () => {
    sizeRoot(800, 600)
    try {
      await setup()
      api!.close('table')
      api!.open('table', { ...table, placement: freeSaved as never })
      await nextTick()
      expect(frame()!.style.left).toBe(`${800 - 200 - 16}px`)
      expect(frame()!.style.top).toBe(`${600 - 100 - 24}px`)
    } finally { unsize() }
  })

  it('...and once it gets one, when the overlay root is resized', async () => {
    let observed: (() => void) | null = null
    const RO = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) { this.cb = cb }
      cb: () => void
      observe(el: Element) { if (el.classList.contains('vdd-panel-overlay-root')) observed = this.cb }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    try {
      await setup()
      api!.close('table')
      api!.open('table', { ...table, placement: freeSaved as never })
      await nextTick()
      expect(frame()!.style.left).toBe('')
      expect(observed).not.toBeNull()
      sizeRoot(800, 600)
      observed!()
      await nextTick()
      expect(frame()!.style.left).toBe(`${800 - 200 - 16}px`)
      expect(api!.placement('table')).toEqual(freeSaved)        // measured against the size now: the same
    } finally { unsize(); globalThis.ResizeObserver = RO }
  })
})

describe('WO19: open({ placement }) out of the panel', () => {
  const home = { v: 1, at: 'panel', anchor: 'top-right', stretch: null, mode: 'docked', width: 280, height: 190 }

  it('moves it out after opening, and going back goes home', async () => {
    const ws = await setup()
    api!.close('table')
    api!.open('table', { ...table, placement: { v: 1, at: 'docked', position: 'bottom', size: 0.4, home } as never })
    await nextTick()
    expect(api!.location('table')).toBe('docked')
    expect(ws.state.panels['map/table']).toBeDefined()
    expect(api!.placement('table')).toEqual({ v: 1, at: 'docked', position: 'bottom', size: 0.4, home })
    await go({ to: 'panel' })
    expect(api!.placement('table')).toEqual(home)
  })

  it('closed and re-opened out of the panel in one go, the same panel id shows the new content', async () => {
    await setup()
    await go({ to: 'tabbed' })
    const saved = api!.placement('table')
    const old = content()
    api!.close('table')
    api!.open('table', { ...table, placement: saved! })
    await nextTick()
    expect(content()).not.toBe(old)
    expect(api!.location('table')).toBe('tabbed')
    expect(content()!.parentElement!.classList.contains('vdd-hosted-widget')).toBe(true)
    expect(content()!.querySelector('#wo-count')).not.toBeNull()
  })

  it('floating at its saved rect', async () => {
    const ws = await setup()
    api!.close('table')
    api!.open('table', { ...table, placement: { v: 1, at: 'floating', rect: { x: 20, y: 30, width: 300, height: 200 }, home } as never })
    await nextTick()
    expect(ws.state.floating.find(w => w.id === 'map/table')).toMatchObject({ x: 20, y: 30, width: 300, height: 200 })
  })

  it('refused (the owner is floating), it stays in the panel', async () => {
    const ws = await setup()
    ws.floatPanel('map')
    await nextTick()
    api!.close('table')
    api!.open('table', { ...table, placement: { v: 1, at: 'tabbed', home } as never })
    await nextTick()
    expect(api!.location('table')).toBe('panel')
    expect(api!.placement('table')).toEqual(home)
  })
})

describe('WO21: the hosted panel\'s title across moves', () => {
  it('a title set with updatePanelTitle is kept from one place out of the panel to another', async () => {
    const ws = await setup()
    await go({ to: 'docked', position: 'bottom' })
    ws.updatePanelTitle('map/table', 'Table · Map 1')
    await go({ to: 'floating' })
    expect(ws.state.panels['map/table']!.title).toBe('Table · Map 1')
    await go({ to: 'tabbed' })
    expect(ws.state.panels['map/table']!.title).toBe('Table · Map 1')
  })

  it('a first move out takes the widget\'s title, and a re-open still applies a new one', async () => {
    const ws = await setup()
    await go({ to: 'docked', position: 'bottom' })
    expect(ws.state.panels['map/table']!.title).toBe('Table')
    ws.updatePanelTitle('map/table', 'Custom')
    api!.open('table', { ...table, title: 'Table · Map 2' })
    expect(ws.state.panels['map/table']!.title).toBe('Table · Map 2')
  })
})
