/**
 * rdd 7.11.0, M7: focusPanel(id, { restore }), updatePanelProps, and preserveEmbeds. A port of
 * rdd's `FocusPropsEmbeds.test.tsx` (names kept).
 *
 * FE1: focusPanel leaves a minimised panel minimised, as before; { restore: true } restores it
 * FE2: updatePanelProps replaces or derives the props, re-renders, re-checks serializable,
 *      emits layout:changed; nothing for a panel that isn't open or a hosted one
 * FE3: moveInto uses moveBefore only for a marked element it applies to; moveIntoWhenConnected
 *      waits for the slot to be connected
 * FE4: a panel type's preserveEmbeds, and a widget's, move their element with moveBefore; an
 *      iframe stand-in never detaches across a dock move, out of the panel and back
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { Teleport, defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace, useFloatingWidgets } from '../../src'
import type { Workspace, WidgetTarget } from '../../src'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddPanelOverlay from '../../src/components/VddPanelOverlay.vue'
import VddPanelSlot from '../../src/components/VddPanelSlot.vue'
import { moveInto, moveIntoWhenConnected, setPreserveEmbeds } from '../../src/core/domMove'

let api: ReturnType<typeof useFloatingWidgets> | null = null
const rendered: Record<string, unknown>[] = []

const Plain = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => { rendered.push({ ...attrs }); return h('div', { class: 'plain' }) }
  },
})
const Grab = defineComponent({ setup() { api = useFloatingWidgets(); return () => null } })
const Owner = defineComponent({ setup: () => () => h(VddPanelOverlay, null, { default: () => h(Grab) }) })

/**
 * A moveBefore for jsdom, which has none: records its calls and moves like appendChild, but, as
 * the real one, without "disconnecting" what it moves (see the probe below).
 */
let movingBefore = false
type MB = { moveBefore?: (n: Node, c: Node | null) => void }
function stubMoveBefore(): Node[] {
  const calls: Node[] = []
  ;(Element.prototype as MB).moveBefore = function (this: Element, node: Node) {
    calls.push(node)
    movingBefore = true
    try { this.appendChild(node) } finally { movingBefore = false }
  }
  return calls
}
/** Stands in for an iframe: counts every real detach, which is when an iframe would reload. */
let reloads = 0
if (!customElements.get('vdd-probe')) {
  customElements.define('vdd-probe', class extends HTMLElement {
    disconnectedCallback() { if (!movingBefore) reloads += 1 }
  })
}
const Embed = defineComponent({ setup: () => () => h('vdd-probe') })
const Probe = defineComponent({ setup: () => () => h('vdd-probe', { id: 't-content' }) })
/** A slot for panel 'e' in a box that is never in the document, while `strayShown` is true. */
const strayShown = ref(false)
const strayBox = () => document.createElement('div')
const Stray = defineComponent({
  setup() {
    const box = strayBox()
    return () => (strayShown.value ? h(Teleport, { to: box }, h(VddPanelSlot, { panelId: 'e' })) : null)
  },
})

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
  api = null
  rendered.length = 0
  strayShown.value = false
  delete (Element.prototype as MB).moveBefore
})

async function setup(): Promise<Workspace> {
  const ws = createWorkspace({
    panels: {
      plain: { component: Plain },
      embed: { component: Plain, defaultOptions: { preserveEmbeds: true } },
      frame: { component: Embed, defaultOptions: { preserveEmbeds: true } },
      bare: { component: Embed },
      map: { component: Owner },
      stray: { component: Stray },
    },
  }) as unknown as Workspace
  mounted.push(mount(defineComponent({ setup: () => () => h(VddDesktop) }), {
    global: { plugins: [ws] },
    attachTo: document.body,
  }) as VueWrapper)
  await nextTick()
  return ws
}
/** A tick, then the microtask and a few frames moveIntoWhenConnected may wait for. */
const settle = async () => { await nextTick(); await new Promise(r => setTimeout(r, 80)); await nextTick() }
const step = async (fn: () => unknown) => { fn(); await settle() }

describe('FE1: focusPanel and a minimised panel', () => {
  it('leaves it minimised without restore, and restores it with', async () => {
    const ws = await setup()
    await step(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain', { initialTarget: 'tabbed' }) })
    await step(() => ws.minimizePanel('a'))
    await step(() => ws.focusPanel('a'))
    expect(ws.state.panels.a!.state).toBe('minimized')
    const restored = vi.fn()
    ws.subscribe('panel:restored', restored)
    await step(() => ws.focusPanel('a', { restore: true }))
    expect(ws.state.panels.a!.state).toBe('docked')
    expect(ws.state.activePanelId).toBe('a')
    expect(restored).toHaveBeenCalledWith({ id: 'a' })
  })

  it('on an open panel, restore changes nothing', async () => {
    const ws = await setup()
    await step(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain', { initialTarget: 'tabbed' }) })
    const restored = vi.fn()
    ws.subscribe('panel:restored', restored)
    await step(() => ws.focusPanel('a', { restore: true }))
    expect(ws.state.activePanelId).toBe('a')
    expect(ws.state.panels.a!.state).toBe('docked')
    expect(restored).not.toHaveBeenCalled()
  })
})

describe('FE2: updatePanelProps', () => {
  it('replaces the props, re-renders, and emits layout:changed', async () => {
    const ws = await setup()
    await step(() => ws.openPanel('a', 'plain', { props: { line: 1 } }))
    const changed = vi.fn()
    ws.subscribe('layout:changed', changed)
    await step(() => ws.updatePanelProps('a', { line: 2 }))
    expect(ws.state.panels.a!.props).toEqual({ line: 2 })
    expect(rendered.at(-1)).toMatchObject({ line: 2, 'panel-id': 'a' })
    expect(changed).toHaveBeenCalled()
    await step(() => ws.updatePanelProps('a', prev => ({ ...prev, zoom: 3 })))
    expect(ws.state.panels.a!.props).toEqual({ line: 2, zoom: 3 })
    expect(rendered.at(-1)).toMatchObject({ line: 2, zoom: 3 })
  })

  it('re-checks serializable, which decides saveLayout', async () => {
    const ws = await setup()
    await step(() => ws.openPanel('a', 'plain', { props: { line: 1 } }))
    expect(ws.state.panels.a!.serializable).toBe(true)
    await step(() => ws.updatePanelProps('a', { onPick: () => {} }))
    expect(ws.state.panels.a!.serializable).toBe(false)
    expect(ws.saveLayout()).not.toContain('"a"')
    await step(() => ws.updatePanelProps('a', { line: 5 }))
    expect(ws.state.panels.a!.serializable).toBe(true)
    expect(JSON.parse(ws.saveLayout()).panels.a.props).toEqual({ line: 5 })
  })

  it('does nothing for a panel that isn\'t open, or a hosted one', async () => {
    const ws = await setup()
    await step(() => ws.openPanel('map', 'map'))
    await step(() => api!.open('t', { title: 'T', component: Plain }))
    await step(() => api!.move('t', { to: 'tabbed' }))
    const before = ws.state.panels
    const changed = vi.fn()
    ws.subscribe('layout:changed', changed)
    ws.updatePanelProps('nope', { x: 1 })
    ws.updatePanelProps('map/t', { x: 1 })
    expect(ws.state.panels).toBe(before)
    expect(ws.state.panels['map/t']!.props).toBeUndefined()
    expect(changed).not.toHaveBeenCalled()
  })
})

describe('FE3: moveInto and moveIntoWhenConnected', () => {
  const connected = () => { const d = document.createElement('div'); document.body.appendChild(d); return d }

  it('uses moveBefore only for a marked, connected element in the same document', () => {
    const calls = stubMoveBefore()
    const from = connected(); const to = connected()
    const el = document.createElement('div')
    from.appendChild(el)
    moveInto(to, el)
    expect(calls).toEqual([])                     // not marked
    setPreserveEmbeds(el, true)
    moveInto(from, el)
    expect(calls).toEqual([el])
    expect(el.parentElement).toBe(from)
    const loose = document.createElement('div')
    setPreserveEmbeds(loose, true)
    moveInto(to, loose)                           // its first insertion: not connected yet
    expect(calls).toHaveLength(1)
    const detachedSlot = document.createElement('div')
    moveInto(detachedSlot, el)                    // the slot isn't in the document
    expect(calls).toHaveLength(1)
    from.appendChild(el)
    const other = document.implementation.createHTMLDocument('x')
    const foreign = other.createElement('div')
    other.body.appendChild(foreign)
    moveInto(foreign, el)                         // another document
    expect(calls).toHaveLength(1)
  })

  it('falls back to appendChild where there is no moveBefore, or it throws', () => {
    const to = connected(); const from = connected()
    const el = document.createElement('div')
    from.appendChild(el)
    setPreserveEmbeds(el, true)
    moveInto(to, el)
    expect(el.parentElement).toBe(to)
    ;(Element.prototype as MB).moveBefore = () => { throw new Error('nope') }
    moveInto(from, el)
    expect(el.parentElement).toBe(from)
  })

  it('a marked element waits for its slot to be connected; any other moves at once', async () => {
    const calls = stubMoveBefore()
    const from = connected()
    const el = document.createElement('div'); const plain = document.createElement('div')
    from.append(el, plain)
    setPreserveEmbeds(el, true)
    const slot = document.createElement('div')
    moveIntoWhenConnected(slot, plain)
    expect(plain.parentElement).toBe(slot)
    moveIntoWhenConnected(slot, el)
    expect(el.parentElement).toBe(from)           // still where it was, connected
    document.body.appendChild(slot)
    await Promise.resolve()
    expect(el.parentElement).toBe(slot)
    expect(calls).toEqual([el])
    // Cancelled before the slot connects: it stays.
    const late = document.createElement('div')
    const cancel = moveIntoWhenConnected(late, el)
    cancel()
    document.body.appendChild(late)
    await new Promise(r => setTimeout(r, 40))
    expect(el.parentElement).toBe(slot)
  })
})

describe('FE4: preserveEmbeds on a panel type and on a widget', () => {
  it('a panel type with it moves its element with moveBefore; one without does not', async () => {
    const calls = stubMoveBefore()
    const ws = await setup()
    await step(() => ws.openPanel('e', 'embed'))
    await step(() => ws.openPanel('p', 'plain', { dockTo: { panel: 'e', position: 'right' } }))
    const embedEl = document.querySelector('[data-vdd-panel="e"]')!
    const plainEl = document.querySelector('[data-vdd-panel="p"]')!
    calls.length = 0
    await step(() => { ws.floatPanel('e'); ws.floatPanel('p') })
    expect(embedEl.closest('[data-vdd-window="e"]')).not.toBeNull()
    expect(calls).toContain(embedEl)
    expect(calls).not.toContain(plainEl)
  })

  it('a panel type with it: an iframe in it never reloads as the grid changes around it', async () => {
    stubMoveBefore()
    const ws = await setup()
    await step(() => ws.openPanel('e', 'frame'))
    reloads = 0
    const steps: [string, () => void][] = [
      ['split beside it', () => ws.openPanel('p', 'plain', { dockTo: { panel: 'e', position: 'bottom' } })],
      ['float', () => ws.floatPanel('e')],
      ['dock', () => ws.dockPanel('e')],
      ['minimize', () => ws.minimizePanel('e')],
      ['restore', () => ws.restorePanel('e')],
      ['the other closes', () => ws.closePanel('p')],
    ]
    for (const [name, fn] of steps) {
      await step(fn)
      expect(reloads, name).toBe(0)
    }
    expect(document.querySelector('vdd-probe')!.closest('[data-vdd-leaf]')).not.toBeNull()
  })

  it('a slot that goes before it is ever connected leaves the panel where it is', async () => {
    stubMoveBefore()
    const ws = await setup()
    await step(() => ws.openPanel('e', 'frame'))
    await step(() => ws.openPanel('s', 'stray', { dockTo: { panel: 'e', position: 'right' } }))
    const el = document.querySelector('[data-vdd-panel="e"]')!
    strayShown.value = true
    await nextTick()
    expect(el.closest('[data-vdd-leaf]')).not.toBeNull()   // waiting, still shown where it was
    strayShown.value = false
    await nextTick()
    await new Promise(r => setTimeout(r, 1300))           // past the wait's bound
    expect(el.isConnected).toBe(true)
    expect(el.closest('[data-vdd-leaf]')).not.toBeNull()
  })

  it('...and a panel type without it reloads, as before', async () => {
    stubMoveBefore()
    const ws = await setup()
    await step(() => ws.openPanel('e', 'bare'))
    reloads = 0
    await step(() => ws.floatPanel('e'))
    expect(reloads).toBeGreaterThan(0)
  })

  it('a widget with it moves its content element with moveBefore, out and back', async () => {
    const calls = stubMoveBefore()
    const ws = await setup()
    await step(() => ws.openPanel('map', 'map'))
    await step(() => api!.open('t', { title: 'T', component: Probe, preserveEmbeds: true }))
    const el = document.getElementById('t-content')!.parentElement!
    calls.length = 0
    await step(() => api!.move('t', { to: 'docked', position: 'bottom' }))
    expect(el.parentElement!.classList.contains('vdd-hosted-widget')).toBe(true)
    expect(calls).toContain(el)
    calls.length = 0
    await step(() => api!.move('t', { to: 'panel' }))
    expect(calls).toContain(el)
    expect(el.parentElement!.classList.contains('vdd-panel-float__body')).toBe(true)
  })

  it('a widget with it marks its owner panel\'s element and its hosted panel\'s', async () => {
    const calls = stubMoveBefore()
    const ws = await setup()
    await step(() => ws.openPanel('map', 'map'))
    await step(() => api!.open('t', { title: 'T', component: Probe, preserveEmbeds: true }))
    await step(() => api!.move('t', { to: 'docked', position: 'bottom' }))
    const owner = document.querySelector('[data-vdd-panel="map"]')!
    const hosted = document.querySelector('[data-vdd-panel="map/t"]')!
    calls.length = 0
    await step(() => { ws.floatPanel('map/t'); ws.floatPanel('map') })
    expect(calls).toContain(hosted)
    expect(calls).toContain(owner)
  })

  it('a widget with it: an iframe in it never reloads, out, between places, and back', async () => {
    stubMoveBefore()
    const ws = await setup()
    await step(() => ws.openPanel('map', 'map'))
    await step(() => api!.open('t', { title: 'T', component: Embed, preserveEmbeds: true }))
    reloads = 0
    const steps: WidgetTarget[] = [
      { to: 'docked', position: 'bottom' }, { to: 'floating', rect: { x: 0, y: 0, width: 200, height: 120 } },
      { to: 'tabbed' }, { to: 'docked', position: 'right' }, { to: 'panel' },
    ]
    for (const to of steps) {
      await step(() => api!.move('t', to))
      expect(reloads, JSON.stringify(to)).toBe(0)
    }
    // ...and the user's own moves of its panel, and the grid changing around its owner.
    await step(() => api!.move('t', { to: 'docked', position: 'bottom' }))
    await step(() => ws.minimizePanel('map/t'))
    await step(() => ws.restorePanel('map/t'))
    await step(() => ws.openPanel('p', 'plain', { dockTo: { panel: 'map', position: 'left' } }))
    await step(() => api!.move('t', { to: 'panel' }))
    expect(reloads).toBe(0)
    expect(document.querySelector('vdd-probe')!.parentElement!.parentElement!.classList.contains('vdd-panel-float__body')).toBe(true)
  })

  it('...and without it, it does (the probe sees real detaches)', async () => {
    stubMoveBefore()
    const ws = await setup()
    await step(() => ws.openPanel('map', 'map'))
    await step(() => api!.open('t', { title: 'T', component: Embed }))
    reloads = 0
    await step(() => api!.move('t', { to: 'docked', position: 'bottom' }))
    expect(reloads).toBeGreaterThan(0)
  })

  it('a widget without it never does', async () => {
    const calls = stubMoveBefore()
    const ws = await setup()
    await step(() => ws.openPanel('map', 'map'))
    await step(() => api!.open('t', { title: 'T', component: Probe }))
    const el = document.getElementById('t-content')!.parentElement!
    await step(() => api!.move('t', { to: 'docked', position: 'bottom' }))
    await step(() => api!.move('t', { to: 'panel' }))
    expect(calls).not.toContain(el)
  })
})
