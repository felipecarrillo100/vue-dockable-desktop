/**
 * The 1.5.0 field-report fixes, ported from react-dockable-desktop 7.4.0 (`TitleThunk.test.tsx`,
 * `FiniteGeometry.test.tsx`).
 *
 * Title functions: a title may be `() => string`, called each time it is rendered, so a title that
 * reads the app's locale ref follows a language change — a translated *string* is fixed in the
 * language active when the panel opened. A function can't be saved: a restored panel takes its
 * registered default title.
 *
 * Finite geometry: a saved window's `null` (JSON's NaN), Infinity or missing size is replaced on
 * load by the default a new float gets, with a warning naming the window.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import { formatLabel } from '../../src/core/messages'
import VddDesktop from '../../src/components/VddDesktop.vue'

const Empty = defineComponent({ render: () => h('div') })
const lang = ref<'en' | 'de'>('en')
const t = (key: 'layers' | 'notes') => ({ en: { layers: 'Layers', notes: 'Notes' }, de: { layers: 'Ebenen', notes: 'Notizen' } })[lang.value][key]

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  lang.value = 'en'
  vi.restoreAllMocks()
})

function desktop() {
  const ws = createWorkspace({
    panels: {
      plain: { component: Empty },
      titled: { component: Empty, defaultOptions: { title: () => t('notes') } },
    },
  })
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  const tabText = (id: string) => document.querySelector(`[data-vdd-tab="${id}"]`)?.textContent ?? ''
  return { ws, tabText }
}

describe('title functions', () => {
  it('formatLabel and workspace.format call a function label', () => {
    expect(formatLabel(() => 'called')).toBe('called')
    expect(createWorkspace().format(() => 'called')).toBe('called')
  })

  it('renders the function, and follows the locale ref it reads', async () => {
    const { ws, tabText } = desktop()
    ws.openPanel('a', 'plain', { title: () => t('layers') })
    await nextTick()
    expect(tabText('a')).toContain('Layers')
    lang.value = 'de'
    await nextTick()
    expect(tabText('a')).toContain('Ebenen')
  })

  it('updatePanelTitle accepts a function', async () => {
    const { ws, tabText } = desktop()
    ws.openPanel('b', 'plain', { title: 'Static' })
    ws.updatePanelTitle('b', () => t('notes'))
    await nextTick()
    expect(tabText('b')).toContain('Notes')
  })

  it('a saved layout omits a function title; the restored panel takes its registered default', async () => {
    const { ws, tabText } = desktop()
    ws.openPanel('c', 'titled', { title: () => t('layers') })
    const json = ws.saveLayout()
    expect('title' in JSON.parse(json).panels.c).toBe(false)
    expect(ws.loadLayout(json)).toBe(true)
    expect(typeof ws.state.panels.c!.title).toBe('function')
    await nextTick()
    expect(tabText('c')).toContain('Notes')
    lang.value = 'de'
    await nextTick()
    expect(tabText('c')).toContain('Notizen')
  })

  it('a panel type registered without a title restores with its id', () => {
    const { ws } = desktop()
    ws.openPanel('d', 'plain', { title: () => t('layers') })
    ws.loadLayout(ws.saveLayout())
    expect(ws.state.panels.d!.title).toBe('d')
  })
})

describe('finite window geometry on load', () => {
  const LAYOUT = `{
    "version": 2,
    "gridRoot": { "type": "leaf", "id": "g", "panels": ["a"], "activePanelId": "a" },
    "floating": [
      { "id": "w1", "x": null, "y": 1e999, "height": 200, "z": 101 },
      { "id": "w2", "x": 40, "y": 60, "width": 320, "height": 240, "z": 102 }
    ],
    "minimized": [],
    "panels": {
      "a":  { "id": "a",  "title": "A",  "component": "plain", "state": "docked" },
      "w1": { "id": "w1", "title": "W1", "component": "plain", "state": "floating" },
      "w2": { "id": "w2", "title": "W2", "component": "plain", "state": "floating" }
    }
  }`

  it('replaces null, Infinity and missing numbers with the default a new window gets, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ws } = desktop()
    expect(ws.loadLayout(LAYOUT)).toBe(true)
    const w1 = ws.state.floating.find(w => w.id === 'w1')!
    const w2 = ws.state.floating.find(w => w.id === 'w2')!
    expect([w1.x, w1.y, w1.width, w1.height]).toEqual([300, 150, 450, 200])
    expect([w2.x, w2.y, w2.width, w2.height]).toEqual([40, 60, 320, 240])
    const messages = warn.mock.calls.map(c => String(c[0])).join('\n')
    expect(messages).toMatch(/floating window "w1" had x = null/)
    expect(messages).toMatch(/floating window "w1" had y = Infinity/)
    expect(messages).toMatch(/floating window "w1" had width = undefined/)
    expect(messages).not.toMatch(/"w2"/)
  })
})
