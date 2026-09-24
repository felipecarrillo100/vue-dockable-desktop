/**
 * `usePanel()` — what a panel sees of itself.
 *
 * Replaces rdd's `FormContainerContract`: six subscription methods plus `getDimensions()`
 * and `usePanelSize()` become refs, so a panel reacts with `watch`
 * (docs/decisions/0006-refs-over-subscriptions.md). The assertions here are the ones rdd
 * made through callbacks — what changes, and when.
 */
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, watch } from 'vue'
import { mount } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import { usePanel, providePanel } from '../../src/composables/usePanel'
import type { ContainerType } from '../../src/types'
import VddModals from '../../src/components/VddModals.vue'
import VddSidePanels from '../../src/components/VddSidePanels.vue'

const ws = () => createWorkspace({ panels: { map: { component: defineComponent({ setup: () => () => h('div') }) } } })

/**
 * Stand-in for the container `<VddDesktop>` will be.
 *
 * Two components on purpose: `provide` exposes a value to *descendants*, and Vue resolves
 * `inject` from the parent chain — a component cannot inject what it provided itself. The
 * container is the panel content's parent in the real thing too.
 */
const mountIn = (w: ReturnType<typeof ws>, id: string, type: ContainerType, setup: () => unknown) => {
  const Content = defineComponent({
    name: 'PanelContent',
    setup() { setup(); return () => h('div', 'content') },
  })
  const Container = defineComponent({
    name: 'PanelContainer',
    setup() {
      providePanel({ id, containerType: ref(type) })
      return () => h(Content)
    },
  })
  return mount(Container, { global: { plugins: [w] } })
}

describe('usePanel inside a container', () => {
  it('reports its own id and container type', () => {
    const w = ws(); w.openPanel('p1', 'map')
    let seen: { id: string; type: string } | undefined
    mountIn(w, 'p1', 'dockable-panel', () => {
      const { id, containerType } = usePanel()
      seen = { id, type: containerType.value }
    })
    expect(seen).toEqual({ id: 'p1', type: 'dockable-panel' })
  })

  it('isActive tracks the globally active panel, and a watcher sees the change', async () => {
    const w = ws(); w.openPanel('p1', 'map'); w.openPanel('p2', 'map')
    const seen: boolean[] = []
    mountIn(w, 'p1', 'dockable-panel', () => {
      const { isActive } = usePanel()
      seen.push(isActive.value)
      watch(isActive, v => seen.push(v))
    })
    expect(seen).toEqual([false])            // p2 is active
    w.focusPanel('p1')
    await nextTick()
    expect(seen).toEqual([false, true])
  })

  it('isMinimized and isFloating track placement', async () => {
    const w = ws(); w.openPanel('p1', 'map')
    let refs: ReturnType<typeof usePanel> | undefined
    mountIn(w, 'p1', 'dockable-panel', () => { refs = usePanel() })
    expect([refs!.isMinimized.value, refs!.isFloating.value]).toEqual([false, false])
    w.floatPanel('p1'); await nextTick()
    expect([refs!.isMinimized.value, refs!.isFloating.value]).toEqual([false, true])
    w.minimizePanel('p1'); await nextTick()
    expect([refs!.isMinimized.value, refs!.isFloating.value]).toEqual([true, false])
  })

  it('a minimized panel keeps running — the watcher fires rather than the panel unmounting', async () => {
    const w = ws(); w.openPanel('p1', 'map')
    const events: string[] = []
    mountIn(w, 'p1', 'dockable-panel', () => {
      const { isMinimized } = usePanel()
      watch(isMinimized, min => events.push(min ? 'minimized' : 'restored'))
    })
    w.minimizePanel('p1'); await nextTick()
    w.restorePanel('p1'); await nextTick()
    expect(events).toEqual(['minimized', 'restored'])
  })

  it('title and dirty are live', async () => {
    const w = ws(); w.openPanel('p1', 'map', { title: 'First' })
    let refs: ReturnType<typeof usePanel> | undefined
    mountIn(w, 'p1', 'dockable-panel', () => { refs = usePanel() })
    expect(refs!.title.value).toBe('First')
    expect(refs!.dirty.value).toBe(false)
    refs!.setTitle('Second'); refs!.setDirty(true)
    await nextTick()
    expect(refs!.title.value).toBe('Second')
    expect(refs!.dirty.value).toBe(true)
  })

  it('setDirty carries dialog options through to the panel', () => {
    const w = ws(); w.openPanel('p1', 'map')
    mountIn(w, 'p1', 'dockable-panel', () => {
      usePanel().setDirty(true, { title: 'Discard?', alertType: 'warning' })
    })
    expect(w.state.panels.p1!.dirtyOptions).toEqual({ title: 'Discard?', alertType: 'warning' })
  })

  it('minimize() and close() drive the workspace', async () => {
    const w = ws(); w.openPanel('p1', 'map')
    let refs: ReturnType<typeof usePanel> | undefined
    mountIn(w, 'p1', 'dockable-panel', () => { refs = usePanel() })
    refs!.minimize(); await nextTick()
    expect(w.state.panels.p1!.state).toBe('minimized')
    w.restorePanel('p1')
    await refs!.close()
    expect(w.isOpen('p1')).toBe(false)
  })

  it('onBeforeClose blocks a close, and is disposed with the component', async () => {
    const w = ws(); w.openPanel('p1', 'map')
    const wrapper = mountIn(w, 'p1', 'dockable-panel', () => {
      usePanel().onBeforeClose(() => false)
    })
    await w.requestClosePanel('p1')
    expect(w.isOpen('p1')).toBe(true)        // vetoed
    wrapper.unmount()
    await w.requestClosePanel('p1')
    expect(w.isOpen('p1')).toBe(false)       // guard went with the component
  })

  it('onBeforeClose may veto asynchronously', async () => {
    const w = ws(); w.openPanel('p1', 'map')
    mountIn(w, 'p1', 'dockable-panel', () => {
      usePanel().onBeforeClose(async () => { await Promise.resolve(); return false })
    })
    await w.requestClosePanel('p1')
    expect(w.isOpen('p1')).toBe(true)
  })

  it('onSaveState contributes live state to a saved layout, and is disposed with the component', () => {
    const w = ws(); w.openPanel('p1', 'map', { props: { scrollTop: 0 } })
    const scrollTop = ref(0)
    const wrapper = mountIn(w, 'p1', 'dockable-panel', () => {
      usePanel().onSaveState(() => ({ scrollTop: scrollTop.value }))
    })
    scrollTop.value = 320
    expect(JSON.parse(w.saveLayout()).panels.p1.props).toEqual({ scrollTop: 320 })
    wrapper.unmount()
    expect(JSON.parse(w.saveLayout()).panels.p1.props).toEqual({ scrollTop: 0 })
  })

  it('a dirty panel refuses to close when there is no way to confirm', async () => {
    const w = ws(); w.openPanel('p1', 'map')
    mountIn(w, 'p1', 'dockable-panel', () => { usePanel().setDirty(true) })
    await w.requestClosePanel('p1')
    expect(w.isOpen('p1')).toBe(true)
    await w.requestClosePanel('p1', { force: true })
    expect(w.isOpen('p1')).toBe(false)
  })

  it('a dirty panel closes when the confirmation is accepted', async () => {
    const w = ws(); w.openPanel('p1', 'map')
    mountIn(w, 'p1', 'dockable-panel', () => { usePanel().setDirty(true) })
    await w.requestClosePanel('p1', { onConfirm: async () => true })
    expect(w.isOpen('p1')).toBe(false)
  })
})

describe('usePanel outside any container', () => {
  it('reports a standalone panel rather than throwing', () => {
    let refs: ReturnType<typeof usePanel> | undefined
    mount(defineComponent({ setup() { refs = usePanel(); return () => h('div') } }))
    expect(refs!.id).toBe('standalone')
    expect(refs!.containerType.value).toBe('standalone')
    expect(refs!.isActive.value).toBe(false)
    expect(refs!.size.value).toBeNull()
  })

  it('makes its actions no-ops with a development warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let refs: ReturnType<typeof usePanel> | undefined
    mount(defineComponent({ setup() { refs = usePanel(); return () => h('div') } }))
    refs!.setDirty(true)
    refs!.minimize()
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})

/**
 * Inside a modal or a drawer the panel is not in `ws.state.panels` — overlays keep their own
 * state — and before 1.1.2 `usePanel()` looked only there. So a guard registered from inside
 * a modal was dropped with a "rendered standalone" warning and Escape closed it anyway, and
 * `title` / `dirty` reported the instance id and `false`.
 */
describe('usePanel inside a modal or side panel', () => {
  const settle = async () => { await nextTick(); await new Promise(r => setTimeout(r, 0)); await nextTick() }

  const open = async (kind: 'modal' | 'left', setup: () => void) => {
    const w = createWorkspace({ panels: {} })
    const Inner = defineComponent({ name: 'Inner', setup() { setup(); return () => h('div', 'inner') } })
    const Shell = defineComponent({
      name: 'Shell',
      components: { VddModals, VddSidePanels },
      template: '<div><VddSidePanels /><VddModals /></div>',
    })
    const wrapper = mount(Shell, { global: { plugins: [w] }, attachTo: document.body })
    const id = kind === 'modal'
      ? w.overlays.openModal(Inner, {}, { title: 'Settings' })
      : await w.overlays.openLeftPanel(Inner, {}, { title: 'Settings' })
    await settle()
    return { w, wrapper, id: id! }
  }
  const escape = async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()
  }

  it('a guard registered from inside a modal blocks Escape and close()', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let api: ReturnType<typeof usePanel> | undefined
    const guard = vi.fn(() => false)
    const { w, wrapper } = await open('modal', () => { api = usePanel(); api.onBeforeClose(guard) })

    await escape()
    expect(guard).toHaveBeenCalledTimes(1)
    expect(w.overlays.state.modals).toHaveLength(1)

    await api!.close()
    expect(guard).toHaveBeenCalledTimes(2)
    expect(w.overlays.state.modals).toHaveLength(1)

    expect(warn.mock.calls.flat().join(' ')).not.toContain('standalone')
    warn.mockRestore()
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('a guard registered from inside a drawer blocks Escape', async () => {
    const { w, wrapper } = await open('left', () => { usePanel().onBeforeClose(() => false) })
    await escape()
    expect(w.overlays.state.leftPanel).not.toBeNull()
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('reports the overlay\'s title and dirty state', async () => {
    let api: ReturnType<typeof usePanel> | undefined
    const { wrapper } = await open('modal', () => { api = usePanel() })
    expect(api!.title.value).toBe('Settings')
    expect(api!.dirty.value).toBe(false)

    api!.setDirty(true)
    await nextTick()
    expect(api!.dirty.value).toBe(true)

    api!.setTitle('Renamed')
    await nextTick()
    expect(api!.title.value).toBe('Renamed')
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('says why onSaveState and minimize do nothing, instead of calling it standalone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { wrapper } = await open('modal', () => {
      const api = usePanel()
      api.onSaveState(() => ({}))
      api.minimize()
    })
    const messages = warn.mock.calls.flat().join('\n')
    expect(messages).not.toContain('standalone')
    expect(messages).toContain('not saved with the layout')
    expect(messages).toContain('cannot be minimised')
    warn.mockRestore()
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})
