/**
 * The 1.11.0 tab content and typed registry (parity with rdd 7.10.0), through the public API. The
 * `#tab-content` slot replaces what's inside each grid tab; the tab itself stays the library's.
 * `definePanels` is a type-level marker: at runtime it returns its argument. Without either,
 * nothing changes. The type checks below are enforced by `vue-tsc` (an unused `@ts-expect-error`
 * is itself an error); the runtime assertions keep vitest honest.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import type { FunctionalComponent } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace, definePanels, useWorkspace } from '../../src'
import type { Workspace, TabContentProps } from '../../src'
import VddDesktop from '../../src/components/VddDesktop.vue'

const P = defineComponent({ render: () => h('div') })
const Icon = defineComponent({ render: () => h('i', { class: 'other-icon' }) })
const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, pointerType: 'mouse', ...init })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
  document.body.className = ''
})

type Slot = (tab: TabContentProps) => unknown
async function setup(slot?: Slot): Promise<Workspace> {
  const ws = createWorkspace({ panels: { plain: { component: P }, other: { component: P, defaultOptions: { icon: Icon } } } })
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
const $$ = (sel: string) => [...document.querySelectorAll(sel)]

/** Records the latest props each tab was rendered with, and renders them as text. */
function recorder() {
  const last: Record<string, TabContentProps> = {}
  const slot: Slot = (tab) => {
    last[tab.panelId] = tab
    return h('b', { class: 'mine', 'data-id': tab.panelId }, `${tab.component}:${tab.title}${tab.dirty ? '!' : ''}`)
  }
  return { last, slot }
}

describe('#tab-content', () => {
  it('without it, the built-in icon, title and dirty marker are shown', async () => {
    const ws = await setup()
    ws.openPanel('a', 'other', { title: 'Alpha' }); ws.setPanelDirty('a', true); await nextTick()
    const tab = $('[data-vdd-tab="a"]')!
    expect(tab.querySelector('.vdd-workspace-tab-icon .other-icon')).not.toBeNull()
    expect(tab.querySelector('.vdd-text-truncate')!.textContent).toContain('Alpha *')
  })

  it("replaces the tab's content, and the tab keeps its role, attributes and close button", async () => {
    const { slot } = recorder()
    const ws = await setup(slot)
    ws.openPanel('a', 'other', { title: 'Alpha' }); await nextTick()
    const tab = $('[data-vdd-tab="a"]')!
    expect(tab.querySelector('.vdd-workspace-tab-icon')).toBeNull()
    expect(tab.querySelector('.vdd-text-truncate > .mine')!.textContent).toBe('other:Alpha')
    expect(tab.getAttribute('role')).toBe('tab')
    expect(tab.getAttribute('aria-selected')).toBe('true');
    (tab.querySelector('[data-vdd-close="a"]') as HTMLElement).click()
    await nextTick(); await nextTick()
    expect(ws.isOpen('a')).toBe(false)
  })

  it('receives the formatted title, the icon, and the dirty, selected and focused state', async () => {
    const { last, slot } = recorder()
    const ws = await setup(slot)
    ws.openPanel('a', 'plain', { title: 'Alpha' }); ws.openPanel('b', 'other', { title: () => 'Beta', initialTarget: 'tabbed' }); await nextTick()
    expect(last.b).toMatchObject({ panelId: 'b', component: 'other', title: 'Beta', icon: Icon, dirty: false, selected: true, focused: true })
    expect(last.a).toMatchObject({ icon: undefined, selected: false, focused: false })
  })

  it('re-renders as the state changes', async () => {
    const { last, slot } = recorder()
    const ws = await setup(slot)
    ws.openPanel('a', 'plain', { title: 'Alpha' }); ws.openPanel('b', 'plain', { title: 'Beta', initialTarget: 'tabbed' }); await nextTick()
    ws.setPanelDirty('a', true); ws.updatePanelTitle('a', 'Alpha 2'); ws.focusPanel('a'); await nextTick()
    expect(last.a).toMatchObject({ title: 'Alpha 2', dirty: true, selected: true, focused: true })
    expect(last.b).toMatchObject({ selected: false, focused: false })
    expect($('[data-vdd-tab="a"] .mine')!.textContent).toBe('plain:Alpha 2!')
  })

  it('applies to every group of a split, and focused tells the groups apart', async () => {
    const { last, slot } = recorder()
    const ws = await setup(slot)
    ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain', { dockTo: { panel: 'a', position: 'right' } }); await nextTick()
    expect($$('[data-vdd-tab]').map(t => t.getAttribute('data-vdd-tab-leaf')).filter((v, i, a) => a.indexOf(v) === i)).toHaveLength(2)
    expect($$('.mine').map(e => e.getAttribute('data-id')).sort()).toEqual(['a', 'b'])
    expect(last.a!.selected && last.b!.selected).toBe(true)
    expect([last.a!.focused, last.b!.focused].filter(Boolean)).toHaveLength(1)
  })

  it('a tab is still dragged by its content', async () => {
    const ws = await setup((t) => h('b', { class: 'mine' }, t.title))
    ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain', { initialTarget: 'tabbed' }); await nextTick()
    $('[data-vdd-tab="a"] .mine')!.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 10 }))
    window.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 200 }))
    await nextTick()
    expect($$('[data-vdd-drop-zone]').length).toBeGreaterThan(0)
    window.dispatchEvent(pointer('pointerup', { clientX: 200, clientY: 200 }))
    await nextTick()
  })

  it('floating windows keep their built-in title bar', async () => {
    const ws = await setup((t) => h('b', { class: 'mine' }, t.title))
    ws.openPanel('f', 'plain', { title: 'Floaty', initialTarget: 'floating' }); await nextTick()
    expect($('[data-vdd-titlebar="f"]')!.textContent).toContain('Floaty')
    expect($$('.mine')).toHaveLength(0)
  })
})

// ─── Typed registry ────────────────────────────────────────────────────────────

const MapPanel = defineComponent({
  props: { panelId: { type: String, required: true }, center: { type: Array as unknown as () => [number, number], default: undefined } },
  render: () => h('div'),
})
const ChartPanel: FunctionalComponent<{ panelId: string; series: number }> = () => h('div')
interface AppEvents { 'layer:select': { layerId: string } }

describe('definePanels', () => {
  it('returns its argument, and a workspace created from it works as usual', () => {
    const map = { plain: { component: P } }
    const panels = definePanels(map)
    expect(panels).toBe(map)
    const ws = createWorkspace({ panels })
    ws.openPanel('a', 'plain')
    expect(ws.isOpen('a')).toBe(true)
  })

  it('types openPanel from the registry, and leaves plain maps untyped', () => {
    const panels = definePanels({
      map: { component: MapPanel, defaultOptions: { title: 'Map' } },
      chart: { component: ChartPanel },
    })
    const ws = createWorkspace({ panels })
    ws.openPanel('m1', 'map')
    ws.openPanel('m2', 'map', { props: { center: [0, 0] }, initialTarget: 'floating' })
    ws.openPanel('c1', 'chart', { props: { series: 3 } })
    // @ts-expect-error not a registered panel
    ws.openPanel('m3', 'mpa')
    // @ts-expect-error props checked against ChartPanel's
    ws.openPanel('c2', 'chart', { props: { series: 'three' } })
    // @ts-expect-error an unknown prop
    ws.openPanel('c3', 'chart', { props: { series: 1, colour: 'red' } })
    // @ts-expect-error panelId is the library's to pass
    ws.openPanel('c4', 'chart', { props: { panelId: 'x', series: 1 } })
    // @ts-expect-error a component object's props are checked too
    ws.openPanel('m4', 'map', { props: { center: 'north' } })

    // Still a Workspace: it installs as a plugin, and the rest of the API is unchanged.
    const asWorkspace: Workspace = ws
    asWorkspace.closePanel('m1')

    // Typed events too, by passing both type arguments.
    const ws2 = createWorkspace<typeof panels, AppEvents>({ panels })
    ws2.publish('layer:select', { layerId: 'roads' })
    // @ts-expect-error the events are typed
    ws2.publish('layer:select', { wrong: true })
    // @ts-expect-error and so are the panels
    ws2.openPanel('x', 'mpa')

    // Plain maps are unchanged: any name, any props.
    const plain = createWorkspace({ panels: { map: { component: MapPanel } } })
    plain.openPanel('m1', 'anything', { props: { whatever: 1 } })
    createWorkspace<AppEvents>({ panels: { map: { component: MapPanel } } }).openPanel('m1', 'anything')
    createWorkspace().openPanel('m1', 'anything')
    // useWorkspace() stays untyped.
    const inside = (): void => { useWorkspace().openPanel('x', 'anything') }

    expect(ws.getOpenPanelIds()).toEqual(['m2', 'c1', 'm3', 'c2', 'c3', 'c4', 'm4'])
    expect(typeof inside).toBe('function')
  })
})
