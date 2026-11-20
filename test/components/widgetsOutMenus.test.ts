/**
 * Widgets out of the panel (rdd 7.11.0), M4 and M5 plus their next.1 / 7.11.0 fixes: the widget's
 * capabilities and `titleMenu`, `useWidget()` and the move callbacks, through the public API in a
 * real desktop. A port of rdd's `WidgetsOut.test.tsx` WO9–WO16, WO20, WO22 and WO23 (names kept).
 *
 * WO9:  canDock / canFloat are the hosted panel's user rules; a re-open changes them
 * WO10: titleMenu in the panel: the title icon becomes a button opening the app's items
 * WO11: the hosted tab's menu: the app's items, then Minimize and Close; no built-in Float
 * WO12: a floating hosted panel's ⋮ menu: the app's items, then Close
 * WO13: useWidget(): null outside a widget; id, owner, a reactive location
 * WO14: the order of the callbacks (incl. floating to floating and tabbed to tabbed, rdd 7.11.0)
 * WO15: the user's own moves of the hosted panel call both
 * WO16: a no-op, a refusal and a close call nothing; a layout load is a move; unsubscribing
 * WO20: a widget's panel brings its owner's contribution (rdd next.1)
 * WO22: useWidget().panelId (rdd next.1)
 * WO23: the title icon opens the menu out of the panel (rdd next.1)
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import {
  createWorkspace, useFloatingWidgets, useWidget, usePanelContribution, useActiveContribution,
} from '../../src'
import type { ManagedWidget, WidgetHandle, WidgetMenuContext, Workspace } from '../../src'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddPanelOverlay from '../../src/components/VddPanelOverlay.vue'
import VddContextMenu from '../../src/components/VddContextMenu.vue'
import VddModals from '../../src/components/VddModals.vue'
import { isDropAllowed } from '../../src/core/dockRules'

let api: ReturnType<typeof useFloatingWidgets> | null = null
const Table = defineComponent({ setup: () => () => h('button', { id: 'wo-count' }, '0') })
const Grab = defineComponent({ setup() { api = useFloatingWidgets(); return () => null } })
const Owner = defineComponent({ setup: () => () => h(VddPanelOverlay, null, { default: () => h(Grab) }) })
const Plain = defineComponent({ setup: () => () => h('div') })
const TIcon = defineComponent({ setup: () => () => h('i', { class: 't-icon' }) })

const table: ManagedWidget = { title: 'Table', component: Table, anchor: 'bottom-left', width: 240, height: 160 }

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
  api = null
  widget = null
  calls.length = 0
})

function desktop(ws: Workspace | null, root: () => unknown): void {
  const wrapper = mount(defineComponent({ setup: () => root }), {
    global: { plugins: ws ? [ws] : [] },
    attachTo: document.body,
  }) as VueWrapper
  mounted.push(wrapper)
}

async function setup(extra: Record<string, { component: unknown }> = {}, shell?: unknown): Promise<Workspace> {
  const ws = createWorkspace({
    panels: { map: { component: Owner }, plain: { component: Plain }, ...extra } as never,
  }) as unknown as Workspace
  desktop(ws, () => [h(VddDesktop), h(VddContextMenu), shell ? h(shell as never) : null])
  await nextTick()
  ws.openPanel('map', 'map', { title: 'Map' })
  await nextTick()
  api!.open('table', table)
  await nextTick()
  return ws
}

const $ = (sel: string) => document.querySelector(sel)
const content = () => $('.vdd-panel-float__content') as HTMLElement | null
const act = async (fn: () => unknown) => { fn(); await nextTick(); await nextTick() }
/** The open menu, top level: each item's label, and '---' for a separator. */
const menu = () => {
  const m = document.querySelector('.vdd-context-menu:not(.vdd-context-menu--submenu)')
  return m
    ? [...m.children].map(c => c.tagName === 'HR' ? '---' : c.querySelector('.vdd-context-menu__label')?.textContent ?? '?')
    : null
}
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('.vdd-context-menu__item')]
  .find(b => b.querySelector('.vdd-context-menu__label')?.textContent === label)!
const rightClick = (sel: string) => act(() => {
  $(sel)!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
})
const allowed = (ws: Workspace, to: Parameters<typeof isDropAllowed>[2]) =>
  isDropAllowed(ws as never, 'map/table', to)

// ─── M4: capabilities and titleMenu ───────────────────────────────────────────

describe('WO9: canDock / canFloat', () => {
  it('are false by default, and a re-open changes them while out', async () => {
    const ws = await setup()
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    expect(allowed(ws, { kind: 'float', anchor: null })).toBe(false)
    expect(allowed(ws, { kind: 'edge', side: 'left' })).toBe(false)
    await act(() => api!.open('table', { ...table, canFloat: true }))
    expect(allowed(ws, { kind: 'float', anchor: null })).toBe(true)
    expect(allowed(ws, { kind: 'edge', side: 'left' })).toBe(false)
    await act(() => api!.open('table', { ...table, canFloat: true, canDock: true }))
    expect(allowed(ws, { kind: 'edge', side: 'left' })).toBe(true)
  })

  it('a widget opened with them carries them out', async () => {
    const ws = await setup()
    await act(() => api!.close('table'))
    await act(() => api!.open('table', { ...table, canDock: true }))
    await act(() => api!.move('table', { to: 'tabbed' }))
    expect(allowed(ws, { kind: 'edge', side: 'left' })).toBe(true)
    expect(allowed(ws, { kind: 'float', anchor: null })).toBe(false)
  })
})

describe('WO10: titleMenu in the panel', () => {
  it('turns the title icon into a button that opens the app\'s items, given where the widget is', async () => {
    await setup()
    let seen: WidgetMenuContext | null = null
    await act(() => api!.open('table', {
      ...table, canDock: true, icon: TIcon,
      titleMenu: (w) => {
        seen = w
        return [
          { label: 'Dock below', action: () => w.move({ to: 'docked', position: 'bottom' }) },
          { label: 'Close it', action: () => w.close() },
        ]
      },
    }))
    const button = $('[data-vdd-widget="table"] button.vdd-panel-float__menu') as HTMLButtonElement
    expect(button).not.toBeNull()
    expect(button.querySelector('.t-icon')).not.toBeNull()
    await act(() => button.click())
    expect(menu()).toEqual(['Dock below', 'Close it'])
    expect(seen).toMatchObject({ id: 'table', location: 'panel', canDock: true, canFloat: false })
    await act(() => menuItem('Dock below').click())
    expect(api!.location('table')).toBe('docked')
  })

  it('a "Close" item closes the widget for real', async () => {
    await setup()
    await act(() => api!.open('table', { ...table, titleMenu: w => [{ label: 'Close it', action: () => w.close() }] }))
    await act(() => ($('button.vdd-panel-float__menu') as HTMLElement).click())
    await act(() => menuItem('Close it').click())
    expect(api!.isOpen('table')).toBe(false)
  })

  it('without titleMenu the icon stays plain, and with no icon there is no button', async () => {
    await setup()
    expect($('.vdd-panel-float__menu')).toBeNull()
    await act(() => api!.open('table', { ...table, icon: TIcon }))
    expect($('span.vdd-panel-float__icon .t-icon')).not.toBeNull()
    expect($('.vdd-panel-float__menu')).toBeNull()
  })

  it('with titleMenu and no icon, the button shows a menu glyph', async () => {
    await setup()
    await act(() => api!.open('table', { ...table, titleMenu: () => [{ label: 'x' }] }))
    expect($('button.vdd-panel-float__menu svg')).not.toBeNull()
  })

  it('a click on the button neither starts a drag nor reaches the frame; from the keyboard it opens on the first item', async () => {
    await setup()
    await act(() => api!.open('table', { ...table, titleMenu: () => [{ label: 'A' }, { label: 'B' }] }))
    const button = $('button.vdd-panel-float__menu') as HTMLElement
    const reached = vi.fn()
    $('[data-vdd-widget-header]')!.addEventListener('pointerdown', reached)
    $('[data-vdd-widget-header]')!.addEventListener('click', reached)
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    // A click from the keyboard: detail 0.
    await act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })))
    expect(reached).not.toHaveBeenCalled()
    expect(menu()).toEqual(['A', 'B'])
    expect(document.activeElement?.getAttribute('data-vdd-menu-item')).toBe('A')
  })
})

describe('WO11: the hosted tab\'s menu', () => {
  it('leads with the app\'s items, then Minimize and Close; no built-in Float', async () => {
    const ws = await setup()
    let seen: WidgetMenuContext | null = null
    await act(() => api!.open('table', {
      ...table, canFloat: true,
      titleMenu: (w) => { seen = w; return [{ label: 'Back into the map', action: () => w.move({ to: 'panel' }) }] },
    }))
    await act(() => api!.move('table', { to: 'tabbed' }))
    await rightClick('[data-vdd-tab="map/table"]')
    expect(menu()).toEqual(['Back into the map', '---', 'Minimize Panel', '---', 'Close Tab'])
    expect(seen).toMatchObject({ location: 'tabbed', canFloat: true })
    await act(() => menuItem('Back into the map').click())
    expect(api!.location('table')).toBe('panel')
    expect(ws.isOpen('map/table')).toBe(false)
    // Back home, nothing is left registered under the hosted panel's id.
    expect(ws.panelMenuItems('map/table')).toEqual([])
  })

  it('without titleMenu it is the built-in items only, still without Float', async () => {
    await setup()
    await act(() => api!.open('table', { ...table, canFloat: true }))
    await act(() => api!.move('table', { to: 'tabbed' }))
    await rightClick('[data-vdd-tab="map/table"]')
    expect(menu()).toEqual(['Minimize Panel', '---', 'Close Tab'])
  })

  it('an ordinary panel\'s menu is unchanged: Float first', async () => {
    await setup()
    await rightClick('[data-vdd-tab="map"]')
    expect(menu()![0]).toBe('Float Window')
  })
})

describe('WO12: a floating hosted panel\'s title-bar menu', () => {
  it('is the app\'s items, then Close, which closes the widget', async () => {
    await setup()
    await act(() => api!.open('table', { ...table, titleMenu: () => [{ label: 'Back into the map' }] }))
    await act(() => api!.move('table', { to: 'floating', rect: { x: 10, y: 10, width: 200, height: 150 } }))
    await act(() => ($('[data-vdd-window="map/table"] .vdd-btn-more-actions') as HTMLElement).click())
    expect(menu()).toEqual(['Back into the map', '---', 'Close Panel'])
    await act(() => menuItem('Close Panel').click())
    expect(api!.isOpen('table')).toBe(false)
  })

  it('without titleMenu there is no menu button', async () => {
    await setup()
    await act(() => api!.move('table', { to: 'floating' }))
    expect($('[data-vdd-window="map/table"] .vdd-btn-more-actions')).toBeNull()
  })

  it('a re-open that adds a titleMenu while floating shows the button at once', async () => {
    await setup()
    await act(() => api!.move('table', { to: 'floating' }))
    await act(() => api!.open('table', { ...table, titleMenu: () => [{ label: 'x' }] }))
    expect($('[data-vdd-window="map/table"] .vdd-btn-more-actions')).not.toBeNull()
  })
})

// ─── M5: useWidget() and the move callbacks ───────────────────────────────────

let widget: WidgetHandle | null = null
const calls: string[] = []
/** Records its handle, and what each callback saw: where the content element was at that moment. */
const Probe = defineComponent({
  setup() {
    widget = useWidget()
    const w = widget
    if (w) {
      const where = () => content()?.parentElement?.className ?? 'nowhere'
      w.onWillMove(() => calls.push(`will@${where()}`))
      w.onMoved(() => calls.push(`moved@${where()}`))
    }
    return () => h('span', { id: 'wo-loc' }, w?.location.value ?? 'none')
  },
})
const probed: ManagedWidget = { ...table, component: Probe }
const frames = () => new Promise(r => setTimeout(r, 80))
const loc = () => document.getElementById('wo-loc')?.textContent
async function setupProbe(): Promise<Workspace> {
  const ws = await setup()
  await act(() => api!.close('table'))
  await act(() => api!.open('table', probed))
  calls.length = 0
  return ws
}

describe('WO13: useWidget()', () => {
  it('is null outside a managed widget', async () => {
    desktop(null, () => h(Probe))
    await nextTick()
    expect(widget).toBeNull()
  })

  it('gives the id, the owner panel, and a location that re-renders when it changes', async () => {
    const ws = await setupProbe()
    expect(widget).toMatchObject({ id: 'table', ownerPanelId: 'map' })
    expect(widget!.location.value).toBe('panel')
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    expect(loc()).toBe('docked')
    await act(() => api!.move('table', { to: 'tabbed' }))
    expect(loc()).toBe('tabbed')
    await act(() => ws.minimizePanel('map/table'))
    expect(loc()).toBe('minimized')
    await act(() => api!.move('table', { to: 'panel' }))
    expect(loc()).toBe('panel')
  })

  it('has no owner panel outside a workspace panel', async () => {
    const ws = createWorkspace({ panels: {} }) as unknown as Workspace
    desktop(ws, () => h(Owner))
    await nextTick()
    await act(() => api!.open('table', probed))
    expect(widget).toMatchObject({ id: 'table', ownerPanelId: null })
    expect(widget!.location.value).toBe('panel')
  })

  it('has no owner panel in a modal, which has a panel context but no place in the layout', async () => {
    const ws = createWorkspace({ panels: {} }) as unknown as Workspace
    desktop(ws, () => [h(VddDesktop), h(VddModals)])
    await nextTick()
    ws.overlays.openModal(Owner, {}, { title: 'Modal' })
    await nextTick(); await nextTick()
    await act(() => api!.open('table', probed))
    expect(widget).toMatchObject({ id: 'table', ownerPanelId: null })
  })
})

describe('WO14: the order of the callbacks', () => {
  it('floating to floating, and tabbed to tabbed, are moves too: one will, one moved', async () => {
    await setupProbe()
    await act(() => api!.move('table', { to: 'floating', rect: { x: 0, y: 0, width: 200, height: 100 } }))
    await frames()
    calls.length = 0
    await act(() => api!.move('table', { to: 'floating', rect: { x: 50, y: 40, width: 320, height: 200 } }))
    await frames()
    expect(calls.map(c => c.split('@')[0])).toEqual(['will', 'moved'])
    await act(() => api!.move('table', { to: 'tabbed' }))
    await frames()
    calls.length = 0
    await act(() => api!.move('table', { to: 'tabbed' }))
    await frames()
    expect(calls.map(c => c.split('@')[0])).toEqual(['will', 'moved'])
  })

  it('onWillMove before the element moves, onMoved after it landed', async () => {
    await setupProbe()
    api!.move('table', { to: 'docked', position: 'bottom' })
    expect(calls).toEqual(['will@vdd-panel-float__body'])
    await frames()
    expect(calls).toEqual(['will@vdd-panel-float__body', 'moved@vdd-hosted-widget'])
    api!.move('table', { to: 'panel' })
    await frames()
    expect(calls.slice(2)).toEqual(['will@vdd-hosted-widget', 'moved@vdd-panel-float__body'])
  })

  it('out to out is one move: one will, one moved', async () => {
    await setupProbe()
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    await frames()
    calls.length = 0
    api!.move('table', { to: 'floating', rect: { x: 0, y: 0, width: 200, height: 100 } })
    await frames()
    expect(calls).toEqual(['will@vdd-hosted-widget', 'moved@vdd-hosted-widget'])
  })
})

describe('WO15: the user\'s own moves', () => {
  it('minimising and restoring the hosted panel call both', async () => {
    const ws = await setupProbe()
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    await frames()
    calls.length = 0
    // Synchronously, inside the workspace's own call: before anything re-renders.
    ws.minimizePanel('map/table')
    expect(calls).toEqual(['will@vdd-hosted-widget'])
    await frames()
    expect(calls).toHaveLength(2)
    ws.restorePanel('map/table')
    expect(calls[2]).toMatch(/^will@/)
    await frames()
    expect(calls).toHaveLength(4)
    expect(calls[3]).toBe('moved@vdd-hosted-widget')
  })

  it('floating it from the grid calls both', async () => {
    const ws = await setupProbe()
    await act(() => api!.move('table', { to: 'tabbed' }))
    await frames()
    calls.length = 0
    ws.floatPanel('map/table')
    expect(calls).toEqual(['will@vdd-hosted-widget'])
    await frames()
    expect(calls).toEqual(['will@vdd-hosted-widget', 'moved@vdd-hosted-widget'])
    expect(loc()).toBe('floating')
  })
})

describe('WO16: when nothing is called, and the rest', () => {
  it('a no-op, a refusal and a close call nothing', async () => {
    const ws = await setupProbe()
    await act(() => api!.move('table', { to: 'panel' }))
    await act(() => ws.floatPanel('map'))
    await act(() => api!.move('table', { to: 'tabbed' }))          // refused: owner floating
    await frames()
    expect(calls).toEqual([])
    await act(() => ws.dockPanel('map'))
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    await frames()
    calls.length = 0
    await act(() => ws.closePanel('map/table'))
    await frames()
    expect(calls).toEqual([])
  })

  it('a layout load sending it home is a move', async () => {
    const ws = await setupProbe()
    const layout = ws.saveLayout()
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    await frames()
    calls.length = 0
    await act(() => ws.loadLayout(layout))
    await frames()
    expect(calls).toEqual(['will@vdd-hosted-widget', 'moved@vdd-panel-float__body'])
  })

  it('unsubscribing stops the calls', async () => {
    await setupProbe()
    const extra = vi.fn()
    const off = widget!.onWillMove(extra)
    off()
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    await frames()
    expect(extra).not.toHaveBeenCalled()
    expect(calls).toHaveLength(2)
  })

  it('a subscription made in setup goes with the component', async () => {
    await setupProbe()
    await act(() => api!.open('table', table))     // the probe unmounts
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    await frames()
    expect(calls).toEqual([])
  })
})

describe('WO20: a widget\'s panel brings its owner\'s contribution', () => {
  const OwnerWithTools = defineComponent({
    setup() {
      usePanelContribution({ sidebarSections: [{ id: 'tools', label: 'Tools', component: Plain }] })
      return () => h(VddPanelOverlay, null, { default: () => h(Grab) })
    },
  })
  const PlainWithOwn = defineComponent({
    setup() {
      usePanelContribution({ sidebarSections: [{ id: 'own', label: 'Own', component: Plain }] })
      return () => h('div')
    },
  })
  const Shell = defineComponent({
    setup() {
      const active = useActiveContribution()
      return () => h('span', { id: 'wo-contrib' }, active.value?.sidebarSections?.map(s => s.id).join(',') ?? 'none')
    },
  })
  const contrib = () => document.getElementById('wo-contrib')?.textContent

  it('the active widget panel shows the owner\'s; an ordinary panel shows its own', async () => {
    const ws = await setup({ map: { component: OwnerWithTools }, other: { component: PlainWithOwn } }, Shell)
    await act(() => ws.focusPanel('map'))
    expect(contrib()).toBe('tools')
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    await act(() => ws.focusPanel('map/table'))
    expect(ws.state.activePanelId).toBe('map/table')
    expect(contrib()).toBe('tools')
    await act(() => ws.openPanel('other', 'other', { title: 'Other' }))
    await act(() => ws.focusPanel('other'))
    expect(contrib()).toBe('own')
    await act(() => api!.move('table', { to: 'floating' }))
    await act(() => ws.focusPanel('map/table'))
    expect(contrib()).toBe('tools')
  })
})

describe('WO22: useWidget().panelId', () => {
  it('is null in the panel, the widget panel\'s id out of it, and null again back home', async () => {
    const ws = await setupProbe()
    expect(widget!.panelId.value).toBeNull()
    await act(() => api!.move('table', { to: 'docked', position: 'bottom' }))
    expect(widget!.panelId.value).toBe('map/table')
    await act(() => api!.move('table', { to: 'floating' }))
    expect(widget!.panelId.value).toBe('map/table')
    await act(() => ws.minimizePanel('map/table'))
    expect(widget!.panelId.value).toBe('map/table')
    await act(() => api!.move('table', { to: 'panel' }))
    expect(widget!.panelId.value).toBeNull()
  })
})

describe('WO23: the title icon opens the menu out of the panel', () => {
  // An ordinary panel shows a tab or title-bar icon only when it has one; a widget's panel always
  // does (the menu glyph without an icon), as rdd always shows one.
  const withMenu: ManagedWidget = { ...table, icon: TIcon, titleMenu: () => [{ label: 'Back into the map' }] }

  it('the tab icon of a widget panel opens the same menu as a right-click on its tab', async () => {
    await setup()
    await act(() => api!.open('table', withMenu))
    await act(() => api!.move('table', { to: 'tabbed' }))
    const icon = $('[data-vdd-tab="map/table"] .vdd-workspace-tab-icon') as HTMLElement
    expect(icon.classList.contains('vdd-workspace-tab-icon--menu')).toBe(true)
    const reached = vi.fn()
    $('[data-vdd-tab="map/table"]')!.addEventListener('pointerdown', reached)
    icon.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reached).not.toHaveBeenCalled()        // not a tab drag
    await act(() => icon.click())
    expect(menu()).toEqual(['Back into the map', '---', 'Minimize Panel', '---', 'Close Tab'])
  })

  it('an ordinary panel\'s tab icon opens nothing', async () => {
    const ws = await setup()
    ws.setPanelIcon('map', TIcon)
    await nextTick()
    const icon = $('[data-vdd-tab="map"] .vdd-workspace-tab-icon') as HTMLElement
    expect(icon.classList.contains('vdd-workspace-tab-icon--menu')).toBe(false)
    await act(() => icon.click())
    expect(menu()).toBeNull()
  })

  it('the floating title-bar icon opens the ⋮ menu; without a titleMenu it is plain', async () => {
    await setup()
    await act(() => api!.open('table', { ...table, icon: TIcon }))
    await act(() => api!.move('table', { to: 'floating' }))
    const plain = $('[data-vdd-window="map/table"] .vdd-window-title-icon') as HTMLElement
    expect(plain.classList.contains('vdd-window-title-icon--menu')).toBe(false)
    await act(() => plain.click())
    expect(menu()).toBeNull()
    await act(() => api!.move('table', { to: 'panel' }))
    await act(() => api!.open('table', withMenu))
    await act(() => api!.move('table', { to: 'floating' }))
    const icon = $('[data-vdd-window="map/table"] .vdd-window-title-icon') as HTMLElement
    expect(icon.classList.contains('vdd-window-title-icon--menu')).toBe(true)
    const reached = vi.fn()
    $('[data-vdd-titlebar="map/table"]')!.addEventListener('pointerdown', reached)
    $('[data-vdd-titlebar="map/table"]')!.addEventListener('dblclick', reached)
    icon.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    icon.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(reached).not.toHaveBeenCalled()        // neither a window drag nor a maximise
    await act(() => icon.click())
    expect(menu()).toEqual(['Back into the map', '---', 'Close Panel'])
  })

  it('a widget without an icon still gets one there: the menu glyph, opening the same menus', async () => {
    await setup()
    await act(() => api!.open('table', { ...table, titleMenu: () => [{ label: 'Back into the map' }] }))
    await act(() => api!.move('table', { to: 'tabbed' }))
    const tabIcon = $('[data-vdd-tab="map/table"] .vdd-workspace-tab-icon--menu') as HTMLElement
    expect(tabIcon.querySelector('svg')).not.toBeNull()
    await act(() => tabIcon.click())
    expect(menu()).toEqual(['Back into the map', '---', 'Minimize Panel', '---', 'Close Tab'])
    await act(() => document.body.click())
    await act(() => api!.move('table', { to: 'floating' }))
    const winIcon = $('[data-vdd-window="map/table"] .vdd-window-title-icon') as HTMLElement
    expect(winIcon.classList.contains('vdd-window-title-icon--menu')).toBe(true)
    expect(winIcon.querySelector('svg')).not.toBeNull()
    await act(() => winIcon.click())
    expect(menu()).toEqual(['Back into the map', '---', 'Close Panel'])
  })

  it('...even without a titleMenu, its tab gets the glyph (not its title bar); an ordinary panel gets none', async () => {
    await setup()
    await act(() => api!.move('table', { to: 'tabbed' }))
    const tabIcon = $('[data-vdd-tab="map/table"] .vdd-workspace-tab-icon--menu') as HTMLElement
    await act(() => tabIcon.click())
    expect(menu()).toEqual(['Minimize Panel', '---', 'Close Tab'])
    expect($('[data-vdd-tab="map"] .vdd-workspace-tab-icon')).toBeNull()
    // Floating, its ⋮ is the only menu (Close): no glyph in the title bar.
    await act(() => document.body.click())
    await act(() => api!.move('table', { to: 'floating' }))
    expect($('[data-vdd-window="map/table"]')).not.toBeNull()
    expect($('[data-vdd-window="map/table"] .vdd-window-title-icon')).toBeNull()
  })
})
