/**
 * Tabs from the keyboard.
 *
 * Before 1.2.0 no tab could be focused at all: `role="tab"` elements with no tabindex, no key
 * handling, outside any `role="tablist"`, with a close × that only answered a click. This is
 * the core of the WAI-ARIA tabs pattern — one tab stop per group, arrows to move, Delete to
 * close — with automatic activation, since switching a tab is cheap here (panels stay mounted).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'

const P = defineComponent({ name: 'MockPanel', setup: () => () => h('div', 'panel') })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
})

async function setup(dir: 'ltr' | 'rtl' = 'ltr') {
  const ws = createWorkspace({ panels: { map: { component: P } }, dir })
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  ws.openPanel('a', 'map'); ws.openPanel('b', 'map'); ws.openPanel('c', 'map')
  ws.focusPanel('a')
  await nextTick()
  return { ws, wrapper }
}

const tab = (id: string) => document.querySelector(`[data-vdd-tab="${id}"]`) as HTMLElement
const key = async (el: HTMLElement, k: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  await nextTick(); await nextTick()
  await new Promise(r => setTimeout(r, 0))
}

describe('tabs are a tablist with one tab stop', () => {
  it('has tablist and tabpanel roles', async () => {
    await setup()
    expect(document.querySelector('.vdd-tab-headers-container')!.getAttribute('role')).toBe('tablist')
    expect(document.querySelector('.vdd-panel-body')!.getAttribute('role')).toBe('tabpanel')
  })

  it('only the selected tab is in the Tab order', async () => {
    await setup()
    expect(['a', 'b', 'c'].map(id => tab(id).getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('the close × is hidden from assistive tech; Delete is the keyboard path', async () => {
    await setup()
    expect(tab('a').querySelector('.vdd-close-tab-x')!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('arrow keys move between tabs', () => {
  it('ArrowRight selects and focuses the next tab, wrapping at the end', async () => {
    const { ws } = await setup()
    tab('a').focus()
    await key(tab('a'), 'ArrowRight')
    expect(ws.state.activePanelId).toBe('b')
    expect(document.activeElement).toBe(tab('b'))
    expect(tab('b').getAttribute('tabindex')).toBe('0')

    await key(tab('b'), 'ArrowRight')
    await key(tab('c'), 'ArrowRight')
    expect(ws.state.activePanelId).toBe('a')
    expect(document.activeElement).toBe(tab('a'))
  })

  it('ArrowLeft goes back, wrapping at the start', async () => {
    const { ws } = await setup()
    await key(tab('a'), 'ArrowLeft')
    expect(ws.state.activePanelId).toBe('c')
    expect(document.activeElement).toBe(tab('c'))
  })

  it('under RTL the arrows follow the reversed tab order', async () => {
    const { ws } = await setup('rtl')
    // Tab order runs right to left, so the next tab is to the left.
    await key(tab('a'), 'ArrowLeft')
    expect(ws.state.activePanelId).toBe('b')
    await key(tab('b'), 'ArrowRight')
    expect(ws.state.activePanelId).toBe('a')
  })
})

describe('Delete closes the focused tab', () => {
  it('closes a clean panel', async () => {
    const { ws } = await setup()
    await key(tab('a'), 'Delete')
    expect(ws.isOpen('a')).toBe(false)
  })

  it('asks before closing a dirty one, so with nobody to answer it stays open', async () => {
    const { ws } = await setup()
    ws.setPanelDirty('a', true)
    await key(tab('a'), 'Delete')
    expect(ws.isOpen('a')).toBe(true)
  })

  it('does nothing for a panel that cannot close', async () => {
    const ws = createWorkspace({ panels: { locked: { component: P, defaultOptions: { canClose: false } } } })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    ws.openPanel('x', 'locked')
    await nextTick()
    await key(tab('x'), 'Delete')
    expect(ws.isOpen('x')).toBe(true)
  })
})
