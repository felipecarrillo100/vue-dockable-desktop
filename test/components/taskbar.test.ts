/**
 * The taskbar, its three visibility modes, and the hover preview.
 *
 * The preview's defining property — that it contains *the live panel*, not a copy — is
 * asserted here by DOM node identity, and again in the browser gate where it can also be
 * shown to be scaled and still rendering.
 *
 * Includes the taskbar half of rdd's `StyleHookups.test.tsx`: its `taskbarVisibility` prop
 * did nothing at all in 6.0.0 because the component emitted `taskbar-mode-autohide` while
 * every rule was keyed on `.rdd-taskbar-mode-autohide`. Asserting the emitted class name is
 * the only way to catch that, since jsdom never loads the stylesheet.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import { LONG_PRESS_MS } from '../../src/composables/useDragDock'

const P = defineComponent({
  name: 'MockPanel',
  props: { panelId: { type: String, default: '' } },
  setup: (props) => () => h('div', { class: 'body', 'data-body': props.panelId }, [
    h('div', { class: 'scroller', 'data-scroller': props.panelId, style: 'height:40px;overflow:auto' },
      Array.from({ length: 30 }, (_, i) => h('div', `row ${i}`))),
  ]),
})
const NoPreview = defineComponent({ name: 'NoPreviewPanel', setup: () => () => h('div', 'x') })

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount, [data-vdd-preview]').forEach(el => el.remove())
  document.body.innerHTML = ''
  vi.useRealTimers()
})

const setup = (taskbar?: 'always' | 'compact' | 'autohide') => {
  const ws = createWorkspace({
    panels: {
      map: { component: P },
      quiet: { component: NoPreview, defaultOptions: { disableLivePreview: true, title: 'Quiet Panel' } },
    },
  })
  const wrapper = mount(VddDesktop, {
    props: taskbar ? { taskbar } : {},
    global: { plugins: [ws] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return { ws, wrapper }
}

describe('taskbar visibility modes', () => {
  it('always: the strip is present even with nothing minimised', () => {
    const { wrapper } = setup('always')
    expect(wrapper.find('[data-vdd-taskbar]').exists()).toBe(true)
  })

  it('compact: the strip appears only while something is minimised', async () => {
    const { ws, wrapper } = setup('compact')
    expect(wrapper.find('[data-vdd-taskbar]').exists()).toBe(false)
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    expect(wrapper.find('[data-vdd-taskbar]').exists()).toBe(true)
    ws.restorePanel('a')
    await nextTick()
    expect(wrapper.find('[data-vdd-taskbar]').exists()).toBe(false)
  })

  it('emits the mode class the stylesheet is keyed on (rdd shipped this broken)', async () => {
    for (const mode of ['always', 'compact', 'autohide'] as const) {
      const { ws, wrapper } = setup(mode)
      ws.openPanel('a', 'map'); ws.minimizePanel('a')
      await nextTick()
      const bar = wrapper.find('[data-vdd-taskbar]')
      expect(bar.classes()).toContain(`vdd-taskbar-mode-${mode}`)
      for (const w of mounted.splice(0)) w.unmount()
    }
  })

  it('autohide: renders a peek handle and expands on hover', async () => {
    const { ws, wrapper } = setup('autohide')
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    expect(wrapper.find('[data-vdd-peek]').exists()).toBe(true)
    const bar = wrapper.find('[data-vdd-taskbar]')
    await bar.trigger('pointerleave')
    await new Promise(r => setTimeout(r, 450))
    expect(bar.classes()).not.toContain('vdd-taskbar-expanded')
    await bar.trigger('pointerenter')
    expect(bar.classes()).toContain('vdd-taskbar-expanded')
  })

  it('autohide: flashes open when a panel is minimised, then collapses', async () => {
    vi.useFakeTimers()
    const { ws, wrapper } = setup('autohide')
    ws.openPanel('a', 'map')
    ws.minimizePanel('a')
    await nextTick()
    expect(wrapper.find('[data-vdd-taskbar]').classes()).toContain('vdd-taskbar-expanded')
    vi.advanceTimersByTime(2100)
    await nextTick()
    expect(wrapper.find('[data-vdd-taskbar]').classes()).not.toContain('vdd-taskbar-expanded')
  })

  it('always: no peek handle, since there is nothing to peek from', async () => {
    const { wrapper } = setup('always')
    expect(wrapper.find('[data-vdd-peek]').exists()).toBe(false)
  })
})

describe('taskbar items', () => {
  it('shows one icon per minimised panel, in order', async () => {
    const { ws, wrapper } = setup()
    for (const id of ['a', 'b', 'c']) { ws.openPanel(id, 'map'); ws.minimizePanel(id) }
    await nextTick()
    expect(wrapper.findAll('[data-vdd-taskbar-item]').map(i => i.attributes('data-vdd-taskbar-item')))
      .toEqual(['a', 'b', 'c'])
  })

  it('clicking an icon restores the panel', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await wrapper.find('[data-vdd-taskbar-item="a"]').trigger('click')
    expect(ws.state.panels.a!.state).toBe('docked')
    expect(ws.state.activePanelId).toBe('a')
  })

  it('shows scroll arrows only once there are more icons than fit', async () => {
    const { ws, wrapper } = setup()
    for (const id of ['a', 'b', 'c', 'd']) { ws.openPanel(id, 'map'); ws.minimizePanel(id) }
    await nextTick()
    expect(wrapper.findAll('[data-vdd-taskbar-scroll]').length).toBe(0)
    ws.openPanel('e', 'map'); ws.minimizePanel('e')
    await nextTick()
    expect(wrapper.findAll('[data-vdd-taskbar-scroll]').length).toBe(2)
  })

  it('asks the host for a context menu on right-click', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await wrapper.find('[data-vdd-taskbar-item="a"]').trigger('contextmenu')
    expect(wrapper.emitted('taskbarContextMenu')?.[0]?.[0]).toBe('a')
  })
})

describe('the hover preview is the live panel, not a copy', () => {
  const hover = async (wrapper: ReturnType<typeof setup>['wrapper'], id: string) => {
    const icon = wrapper.find(`[data-vdd-taskbar-item="${id}"]`).element as HTMLElement
    icon.getBoundingClientRect = () => ({ left: 100, top: 500, right: 138, bottom: 538, width: 38, height: 38, x: 100, y: 500, toJSON: () => ({}) })
    icon.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse', clientX: 110, clientY: 510 }))
    await nextTick()
  }

  it('moves the panel\'s own element into the preview — the same DOM node', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    const node = document.querySelector('[data-body="a"]')
    expect(node).not.toBeNull()
    ws.minimizePanel('a')
    await nextTick()
    await hover(wrapper, 'a')
    const preview = document.querySelector('[data-vdd-preview]')
    expect(preview).not.toBeNull()
    // The very same node, now inside the preview: a thumbnail of a running panel rather than
    // a screenshot or a second instance.
    expect(preview!.contains(node!)).toBe(true)
    expect(document.querySelectorAll('[data-body="a"]').length).toBe(1)
  })

  it('returns the panel to the off-screen store when the preview closes', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await hover(wrapper, 'a')
    const mount = document.querySelector('[data-vdd-panel="a"]')!
    expect(mount.closest('[data-vdd-preview]')).not.toBeNull()
    await wrapper.find('[data-vdd-taskbar-item="a"]').trigger('pointerleave')
    await new Promise(r => setTimeout(r, 200))
    await nextTick()
    expect(document.querySelector('[data-vdd-preview]')).toBeNull()
    expect(mount.parentElement!.className).toContain('vdd-panel-store')
  })

  it('scales the thumbnail from the size the panel had while it was on screen', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await hover(wrapper, 'a')
    const host = document.querySelector('.vdd-taskbar-item-preview-host') as HTMLElement
    expect(host).not.toBeNull()
    // jsdom reports no size, so the cache's 800x500 default is used: 220/800 vs 140/500 →
    // 0.275 is the smaller, so the aspect ratio is preserved rather than stretched.
    expect(host.style.transform).toBe('scale(0.275)')
  })

  it('shows the title, a dirty marker, and a close button', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map', { title: 'Notes' })
    ws.setPanelDirty('a', true)
    ws.minimizePanel('a')
    await nextTick()
    await hover(wrapper, 'a')
    const preview = document.querySelector('[data-vdd-preview]')!
    expect(preview.textContent).toContain('Notes')
    expect(preview.textContent).toContain('*')
    expect(preview.querySelector('[data-vdd-preview-close="a"]')).not.toBeNull()
  })

  it('clicking the preview restores the panel', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await hover(wrapper, 'a')
    ;(document.querySelector('[data-vdd-preview]') as HTMLElement).click()
    await nextTick()
    expect(ws.state.panels.a!.state).toBe('docked')
    expect(document.querySelector('[data-vdd-preview]')).toBeNull()
  })

  it('shows a letter tile instead for a panel with disableLivePreview', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('q', 'quiet'); ws.minimizePanel('q')
    await nextTick()
    await hover(wrapper, 'q')
    const preview = document.querySelector('[data-vdd-preview]')!
    expect(preview.querySelector('.vdd-taskbar-item-preview-letter')?.textContent).toBe('Q')
    expect(preview.querySelector('.vdd-taskbar-item-preview-host')).toBeNull()
    // and the panel stays parked off-screen rather than being moved into the preview
    expect(document.querySelector('[data-vdd-panel="q"]')!.parentElement!.className).toContain('vdd-panel-store')
  })

  it('closes itself if its panel stops being minimised elsewhere', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await hover(wrapper, 'a')
    expect(document.querySelector('[data-vdd-preview]')).not.toBeNull()
    ws.restorePanel('a')          // restored from somewhere else entirely
    await nextTick()
    expect(document.querySelector('[data-vdd-preview]')).toBeNull()
  })

  it('does not preview on a touch pointerenter, where there is no hover', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    const icon = wrapper.find('[data-vdd-taskbar-item="a"]').element as HTMLElement
    icon.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'touch' }))
    await nextTick()
    expect(document.querySelector('[data-vdd-preview]')).toBeNull()
  })
})

describe('touch: tap to preview, tap again to restore', () => {
  beforeEach(() => { vi.useFakeTimers() })

  it('first tap opens the preview, second restores', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    const icon = wrapper.find('[data-vdd-taskbar-item="a"]').element as HTMLElement
    const tap = () => {
      icon.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 5, clientY: 5 }))
      icon.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: 5, clientY: 5 }))
    }
    tap()
    await nextTick()
    expect(document.querySelector('[data-vdd-preview]')).not.toBeNull()
    expect(ws.state.panels.a!.state).toBe('minimized')
    tap()
    await nextTick()
    expect(ws.state.panels.a!.state).toBe('docked')
  })

  it('a long press asks for a context menu instead', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    const icon = wrapper.find('[data-vdd-taskbar-item="a"]').element as HTMLElement
    icon.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 5, clientY: 5 }))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    await nextTick()
    expect(wrapper.emitted('taskbarContextMenu')?.[0]?.[0]).toBe('a')
    expect(ws.state.panels.a!.state).toBe('minimized')
  })
})
