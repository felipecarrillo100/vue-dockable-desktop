/**
 * The 1.10.0 docking rules (parity with rdd 7.9.0), through the public API and real gestures:
 * `canFloat` / `canDock` per kind and the workspace's `canDrop` veto. They govern what the user does;
 * the app's own calls always work. Without them nothing changes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import type { Workspace, WorkspaceConfig } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import { startPointerDrag } from '../../src/core/dragResize'
import { buildPanelMenu, buildTaskbarMenu } from '../../src/core/panelMenu'
import type { PanelDrop, LayoutNode } from '../../src/types'
import type { ContextMenuItem } from '../../src/core/contextMenu'

const P = defineComponent({ render: () => h('div') })
const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, pointerType: 'mouse', ...init })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
  document.body.className = ''
  delete (document as { elementsFromPoint?: unknown }).elementsFromPoint
})

async function setup(config: Partial<WorkspaceConfig> = {}): Promise<{ ws: Workspace; wrapper: VueWrapper }> {
  const ws = createWorkspace({ panels: { p: { component: P } }, ...config } as WorkspaceConfig)
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  await nextTick()
  return { ws, wrapper }
}
const $$ = (sel: string) => [...document.querySelectorAll(sel)]
const attrs = (sel: string, attr: string) => $$(sel).map(e => e.getAttribute(attr)).sort()

async function startTabDrag(id: string) {
  document.querySelector(`[data-vdd-tab="${id}"]`)!.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 10 }))
  window.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 200 }))
  await nextTick()
}
async function release() { window.dispatchEvent(pointer('pointerup', { clientX: 200, clientY: 200 })); await nextTick() }
const hover = async (el: Element) => { el.dispatchEvent(new PointerEvent('pointerenter')); await nextTick() }
const findLeaf = (n: LayoutNode, id: string): Extract<LayoutNode, { type: 'leaf' }> | null =>
  n.type === 'leaf' ? (n.id === id ? n : null) : n.children.map(c => findLeaf(c, id)).find(Boolean) ?? null

describe('canFloat: false', () => {
  it('a tab dropped on nothing stays docked, and no corner is offered', async () => {
    const { ws } = await setup({ panels: { p: { component: P }, pinned: { component: P, defaultOptions: { canFloat: false } } } })
    ws.openPanel('a', 'p'); ws.openPanel('k', 'pinned'); await nextTick()
    await startTabDrag('k')
    expect($$('[data-vdd-corner]')).toHaveLength(0)
    expect($$('[data-vdd-drop-zone]').length).toBeGreaterThan(0)
    await release()
    expect(ws.state.floating.map(f => f.id)).toEqual([])
    expect(ws.state.panels.k!.state).toBe('docked')
  })

  it('its menus have no "Float Window" and, minimised from a group, no "Maximize"', async () => {
    const { ws } = await setup({ panels: { p: { component: P }, pinned: { component: P, defaultOptions: { canFloat: false } } } })
    ws.openPanel('a', 'p'); ws.openPanel('k', 'pinned')
    const noop = { float() {}, minimize() {}, close() {}, restore() {}, maximize() {} }
    const labels = (items: ContextMenuItem[]) => items.map(i => ('label' in i && i.label ? ws.format(i.label) : '|'))
    expect(labels(buildPanelMenu(ws, 'k', { canFloat: false }, noop))).not.toContain('Float Window')
    expect(labels(buildPanelMenu(ws, 'a', {}, noop))).toContain('Float Window')
    ws.minimizePanel('k')
    expect(labels(buildTaskbarMenu(ws, 'k', { canFloat: false }, noop))).not.toContain('Maximize Panel')
  })

  it("doesn't restrict the app: floatPanel still floats it", async () => {
    const { ws } = await setup({ panels: { pinned: { component: P, defaultOptions: { canFloat: false } } } })
    ws.openPanel('k', 'pinned'); ws.floatPanel('k')
    expect(ws.state.floating.map(f => f.id)).toEqual(['k'])
  })
})

describe('canDock: false', () => {
  it('a window drag offers no group or edge target, only corners, and the panel stays floating', async () => {
    const { ws } = await setup({ panels: { p: { component: P }, palette: { component: P, defaultOptions: { canDock: false, initialTarget: 'floating' } } } })
    ws.openPanel('a', 'p'); ws.openPanel('w', 'palette'); await nextTick()
    const bar = document.querySelector('[data-vdd-titlebar="w"]') as HTMLElement
    bar.setPointerCapture = vi.fn();
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [document.body]
    bar.dispatchEvent(pointer('pointerdown', { clientX: 350, clientY: 310 }))
    bar.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 200 }))
    await nextTick()
    expect($$('[data-vdd-drop-zone]')).toHaveLength(0)
    expect($$('[data-vdd-edge]')).toHaveLength(0)
    expect($$('[data-vdd-corner]')).toHaveLength(4)
    bar.dispatchEvent(pointer('pointerup', { clientX: 200, clientY: 200 }))
    await nextTick()
    expect(ws.state.panels.w!.state).toBe('floating')
  })
})

describe('canDrop', () => {
  it('is asked with { panelId, component, to }, and a vetoed target is not offered', async () => {
    const calls: PanelDrop[] = []
    const { ws } = await setup({
      canDrop: (d: PanelDrop) => { calls.push(d); return !(d.to.kind === 'group' && d.to.position === 'left') && !(d.to.kind === 'edge' && d.to.side === 'top') },
    })
    ws.openPanel('a', 'p'); ws.openPanel('b', 'p'); await nextTick()
    await startTabDrag('b')
    expect(attrs('[data-vdd-drop-zone]', 'data-vdd-drop-zone')).toEqual(['bottom', 'center', 'right', 'top'])
    expect(attrs('[data-vdd-edge]', 'data-vdd-edge')).toEqual(['bottom', 'left', 'right'])
    expect(calls.some(c => c.panelId === 'b' && c.component === 'p' && c.to.kind === 'group')).toBe(true)
    await release()
  })

  it('under RTL it sees the side the move applies: the zone drawn on the left splits to the right', async () => {
    const { ws } = await setup({ dir: 'rtl', canDrop: (d: PanelDrop) => !(d.to.kind === 'group' && d.to.position === 'right') })
    ws.openPanel('a', 'p'); ws.openPanel('b', 'p'); await nextTick()
    await startTabDrag('b')
    expect(attrs('[data-vdd-drop-zone]', 'data-vdd-drop-zone')).toEqual(['bottom', 'center', 'right', 'top'])
    await release()
  })

  it('a vetoed group refuses tabs inserted among its tabs, with no insertion marker', async () => {
    const { ws } = await setup({
      initialState: JSON.stringify({ version: 2, gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
        { type: 'leaf', id: 'L', panels: ['a', 'x'], activePanelId: 'a' }, { type: 'leaf', id: 'R', panels: ['b'], activePanelId: 'b' }] },
        floating: [], minimized: [], panels: { a: { id: 'a', title: 'a', component: 'p', state: 'docked' }, x: { id: 'x', title: 'x', component: 'p', state: 'docked' }, b: { id: 'b', title: 'b', component: 'p', state: 'docked' } } }),
      canDrop: (d: PanelDrop) => !(d.to.kind === 'group' && d.to.leafId === 'R'),
    })
    await startTabDrag('a')
    document.querySelector('[data-vdd-tab="b"]')!.dispatchEvent(pointer('pointermove', { clientX: 210, clientY: 10 }))
    await nextTick()
    expect($$('[data-vdd-tab].vdd-drag-hover-left, [data-vdd-tab].vdd-drag-hover-right')).toHaveLength(0)
    await release()
    expect(findLeaf(ws.state.gridRoot, 'R')!.panels).toEqual(['b'])
  })

  it('a rule that changes during a drag is asked again at release', async () => {
    let allowRight = true
    const { ws } = await setup({ canDrop: (d: PanelDrop) => allowRight || !(d.to.kind === 'group' && d.to.position === 'right') })
    ws.openPanel('a', 'p'); ws.openPanel('b', 'p'); await nextTick()
    await startTabDrag('b')
    await hover(document.querySelector('[data-vdd-drop-zone="right"]')!)
    allowRight = false
    await release()
    expect(ws.state.gridRoot.type).toBe('leaf')
  })

  it('a rule changed mid-drag is asked again at release, for a tab insertion too', async () => {
    let allowR = true
    const { ws } = await setup({
      initialState: JSON.stringify({ version: 2, gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
        { type: 'leaf', id: 'L', panels: ['a', 'x'], activePanelId: 'a' }, { type: 'leaf', id: 'R', panels: ['b'], activePanelId: 'b' }] },
        floating: [], minimized: [], panels: { a: { id: 'a', title: 'a', component: 'p', state: 'docked' }, x: { id: 'x', title: 'x', component: 'p', state: 'docked' }, b: { id: 'b', title: 'b', component: 'p', state: 'docked' } } }),
      canDrop: (d: PanelDrop) => allowR || !(d.to.kind === 'group' && d.to.leafId === 'R'),
    })
    await startTabDrag('a')
    document.querySelector('[data-vdd-tab="b"]')!.dispatchEvent(pointer('pointermove', { clientX: 210, clientY: 10 }))
    await nextTick()
    allowR = false
    await release()
    expect(findLeaf(ws.state.gridRoot, 'R')!.panels).toEqual(['b'])
  })

  it('a canDrop that throws allows the move, and says why', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { ws } = await setup({ canDrop: () => { throw new Error('boom') } })
      ws.openPanel('a', 'p'); ws.openPanel('b', 'p'); await nextTick()
      await startTabDrag('b')
      expect($$('[data-vdd-drop-zone]')).toHaveLength(5)
      expect(error.mock.calls.some(c => String(c[0]).includes('canDrop threw'))).toBe(true)
      await release()
    } finally {
      error.mockRestore()
    }
  })

  it('without rules, every target is offered as before', async () => {
    const { ws } = await setup()
    ws.openPanel('a', 'p'); ws.openPanel('b', 'p'); await nextTick()
    await startTabDrag('b')
    expect($$('[data-vdd-drop-zone]')).toHaveLength(5)
    expect($$('[data-vdd-edge]')).toHaveLength(4)
    expect($$('[data-vdd-corner]')).toHaveLength(4)
    await release()
  })
})

describe('startPointerDrag ends on a lost capture (1.10.0; blur since 1.5.1)', () => {
  it("a lost capture at the document (the element was removed) ends it; another pointer's does not", () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.setPointerCapture = vi.fn()
    const log: string[] = []
    startPointerDrag({
      element: el, pointerId: 7, startClientX: 0, startClientY: 0, captureStart: () => ({}),
      onMove: () => log.push('move'), onEnd: () => log.push('end'), onCancel: () => log.push('cancel'),
      activeClasses: [{ el: document.body, classes: ['probe-dragging'] }],
    })
    document.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 99, bubbles: true }))
    expect(log).toEqual([])
    el.remove()
    document.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 7, bubbles: true }))
    expect(log).toEqual(['cancel'])
    expect(document.body.classList.contains('probe-dragging')).toBe(false)
  })
})
