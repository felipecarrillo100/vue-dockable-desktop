/**
 * The 1.12.0 runtime panel icon (parity with rdd's `setPanelIcon`). `workspace.setPanelIcon(id,
 * icon)` — or `usePanel().setIcon(icon)` from inside a workspace panel — replaces the registered
 * `defaultOptions.icon` on the tab, the floating title bar, the taskbar button and the icon the
 * `#tab-content` slot receives; `null` restores the registered one. It lives only in memory:
 * `saveLayout()` never writes it, and `loadLayout()` keeps it for a panel that stays open.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace, usePanel } from '../../src'
import type { Workspace, TabContentProps } from '../../src'
import VddDesktop from '../../src/components/VddDesktop.vue'

const P = defineComponent({ render: () => h('div') })
const Registered = defineComponent({ render: () => h('i', { class: 'registered-icon' }) })
const Runtime = defineComponent({ render: () => h('i', { class: 'runtime-icon' }) })

let setIconFromPanel: ((icon: unknown) => void) | undefined
const Setter = defineComponent({
  setup() {
    setIconFromPanel = usePanel().setIcon
    return () => h('div')
  },
})

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
  setIconFromPanel = undefined
  vi.restoreAllMocks()
})

async function setup(slot?: (tab: TabContentProps) => unknown): Promise<Workspace> {
  const ws = createWorkspace({
    panels: {
      plain: { component: P },
      other: { component: P, defaultOptions: { icon: Registered } },
      setter: { component: Setter, defaultOptions: { icon: Registered } },
    },
  })
  const wrapper = mount(VddDesktop, {
    global: { plugins: [ws] },
    attachTo: document.body,
    ...(slot ? { slots: { 'tab-content': slot } } : {}),
  }) as VueWrapper
  mounted.push(wrapper)
  await nextTick()
  return ws
}
const $ = (sel: string) => document.querySelector(sel)
const tabIcon = (id: string) => $(`[data-vdd-tab="${id}"] .vdd-workspace-tab-icon`)
const windowIcon = (id: string) => $(`[data-vdd-titlebar="${id}"] .vdd-window-title-icon`)
const taskbarIcon = (id: string) => $(`[data-vdd-taskbar-item="${id}"] .vdd-taskbar-item-icon`)

describe('setPanelIcon', () => {
  it('changes the tab icon, and null restores the registered one', async () => {
    const ws = await setup()
    ws.openPanel('a', 'other'); await nextTick()
    expect(tabIcon('a')!.querySelector('.registered-icon')).not.toBeNull()
    ws.setPanelIcon('a', Runtime); await nextTick()
    expect(tabIcon('a')!.querySelector('.runtime-icon')).not.toBeNull()
    expect(tabIcon('a')!.querySelector('.registered-icon')).toBeNull()
    ws.setPanelIcon('a', null); await nextTick()
    expect(tabIcon('a')!.querySelector('.registered-icon')).not.toBeNull()
    expect(ws.state.panels.a!.icon).toBeUndefined()
  })

  it('gives an icon to a panel that registers none', async () => {
    const ws = await setup()
    ws.openPanel('a', 'plain'); await nextTick()
    expect(tabIcon('a')).toBeNull()
    ws.setPanelIcon('a', Runtime); await nextTick()
    expect(tabIcon('a')!.querySelector('.runtime-icon')).not.toBeNull()
  })

  it('changes the floating title bar icon', async () => {
    const ws = await setup()
    ws.openPanel('f', 'other', { initialTarget: 'floating' }); await nextTick()
    expect(windowIcon('f')!.querySelector('.registered-icon')).not.toBeNull()
    ws.setPanelIcon('f', Runtime); await nextTick()
    expect(windowIcon('f')!.querySelector('.runtime-icon')).not.toBeNull()
    expect(windowIcon('f')!.querySelector('.registered-icon')).toBeNull()
  })

  it('changes the taskbar icon', async () => {
    const ws = await setup()
    ws.openPanel('m', 'other'); ws.minimizePanel('m'); await nextTick()
    expect(taskbarIcon('m')!.querySelector('.registered-icon')).not.toBeNull()
    ws.setPanelIcon('m', Runtime); await nextTick()
    expect(taskbarIcon('m')!.querySelector('.runtime-icon')).not.toBeNull()
    expect(taskbarIcon('m')!.querySelector('.registered-icon')).toBeNull()
  })

  it('#tab-content receives the runtime icon', async () => {
    const last: Record<string, TabContentProps> = {}
    const ws = await setup((tab) => { last[tab.panelId] = tab; return h('b', tab.title) })
    ws.openPanel('a', 'other'); await nextTick()
    expect(last.a!.icon).toBe(Registered)
    ws.setPanelIcon('a', Runtime); await nextTick()
    expect(last.a!.icon).toBe(Runtime)
    ws.setPanelIcon('a', null); await nextTick()
    expect(last.a!.icon).toBe(Registered)
  })

  it('an unknown id does nothing, and the same icon changes no state', async () => {
    const ws = await setup()
    ws.openPanel('a', 'other')
    const before = ws.state.panels
    ws.setPanelIcon('nope', Runtime)
    expect(ws.state.panels).toBe(before)
    expect('nope' in ws.state.panels).toBe(false)
    ws.setPanelIcon('a', Runtime)
    const withIcon = ws.state.panels
    ws.setPanelIcon('a', Runtime)
    expect(ws.state.panels).toBe(withIcon)
  })
})

describe('usePanel().setIcon in a workspace panel', () => {
  it('updates the panel icon, with no standalone warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ws = await setup()
    ws.openPanel('s', 'setter'); await nextTick(); await nextTick()
    expect(setIconFromPanel).toBeDefined()
    setIconFromPanel!(Runtime); await nextTick()
    expect(ws.state.panels.s!.icon).toBe(Runtime)
    expect(tabIcon('s')!.querySelector('.runtime-icon')).not.toBeNull()
    setIconFromPanel!(undefined); await nextTick()
    expect(tabIcon('s')!.querySelector('.registered-icon')).not.toBeNull()
    expect(warn.mock.calls.flat().join(' ')).not.toContain('standalone')
  })
})

describe('persistence', () => {
  it('saveLayout writes no icon, byte for byte the same as without one', async () => {
    const ws = await setup()
    ws.openPanel('a', 'other'); ws.openPanel('f', 'plain', { initialTarget: 'floating' })
    ws.openPanel('m', 'other'); ws.minimizePanel('m')
    const without = ws.saveLayout()
    ws.setPanelIcon('a', Runtime); ws.setPanelIcon('f', Runtime); ws.setPanelIcon('m', Runtime)
    const withIcons = ws.saveLayout()
    expect(withIcons).not.toContain('icon')
    expect(withIcons).toBe(without)
  })

  it('loadLayout keeps the icon of a panel that stays open with the same component', async () => {
    const ws = await setup()
    ws.openPanel('a', 'other'); ws.openPanel('b', 'other', { initialTarget: 'tabbed' })
    const saved = ws.saveLayout()
    ws.setPanelIcon('a', Runtime); ws.setPanelIcon('b', Runtime)
    // `b` comes back as a different component: its runtime icon belonged to the old one.
    const swapped = JSON.parse(saved)
    swapped.panels.b.component = 'plain'
    expect(ws.loadLayout(JSON.stringify(swapped))).toBe(true)
    await nextTick()
    expect(ws.state.panels.a!.icon).toBe(Runtime)
    expect(ws.state.panels.b!.icon).toBeUndefined()
    ws.focusPanel('a'); await nextTick()
    expect(tabIcon('a')!.querySelector('.runtime-icon')).not.toBeNull()
  })

  it('an icon in a hand-made layout is dropped', async () => {
    const ws = await setup()
    ws.openPanel('a', 'other')
    const layout = JSON.parse(ws.saveLayout())
    layout.panels.a.icon = { render: 'not a component' }
    const fresh = createWorkspace({ panels: { other: { component: P } } })
    expect(fresh.loadLayout(JSON.stringify(layout))).toBe(true)
    expect(fresh.state.panels.a!.icon).toBeUndefined()
  })
})
