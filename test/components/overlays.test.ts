/**
 * Side panels and the modal stack.
 *
 * A port of rdd's `PanelSystem.test.tsx` (6 tests, names preserved). Two things moved:
 *
 * - There is no `<PanelProvider>`. Overlay state is on the workspace
 *   ([0004](../../docs/decisions/0004-store-outside-components.md)), so the test opens
 *   panels through `ws.overlays` with no component mounted at all — which is the case that
 *   motivated it: a modal raised by a save handler or a router guard.
 * - `LeftPanelRenderer`/`RightPanelRenderer` are a `sides` prop on one component rather than
 *   two more exports, since all three shared an implementation and differed only in a filter.
 *
 * The close-with-guards-and-dirty-check sequence is asserted in `dirtyState.test.ts`; here it
 * matters only that Escape reaches the right instance.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddSidePanels from '../../src/components/VddSidePanels.vue'
import VddModals from '../../src/components/VddModals.vue'
import VddConfirm from '../../src/components/VddConfirm.vue'

const Content = defineComponent({
  name: 'Content',
  props: { panelId: { type: String, default: '' }, message: { type: String, default: 'Default' } },
  setup: (props) => () => h('div', { id: `panel-content-${props.panelId}` }, [
    h('span', { class: 'msg-span' }, props.message),
  ]),
})

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
})

/** Both hosts, as an application would place them. */
const Both = defineComponent({
  name: 'Both',
  components: { VddSidePanels, VddModals },
  template: '<div><VddSidePanels /><VddModals /></div>',
})

function setup() {
  const ws = createWorkspace({ panels: {} })
  const wrapper = mount(Both, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  return { ws, wrapper, overlays: ws.overlays }
}

const escape = async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

describe('Panel System (side panels and nested modals)', () => {
  it('should support opening left and right side panels with dynamic props', async () => {
    const { wrapper, overlays } = setup()

    const leftId = await overlays.openLeftPanel(Content, { message: 'Hello Left' }, { title: 'Left Drawer' })
    await nextTick()

    expect(leftId).not.toBeNull()
    expect(overlays.state.leftPanel).not.toBeNull()
    expect(overlays.state.leftPanel!.id).toBe(leftId)
    expect(overlays.state.leftPanel!.props.message).toBe('Hello Left')

    const left = wrapper.get('.vdd-side-panel-left')
    expect(left.get('.vdd-side-panel-title').text()).toBe('Left Drawer')
    expect(left.get('.msg-span').text()).toBe('Hello Left')
    expect((left.element as HTMLElement).style.width).toBe('400px')

    const rightId = await overlays.openRightPanel(Content, { message: 'Hello Right' }, { title: 'Right Drawer', width: 550 })
    await nextTick()

    expect(rightId).not.toBeNull()
    expect(overlays.state.rightPanel!.id).toBe(rightId)
    expect(overlays.state.rightPanel!.props.message).toBe('Hello Right')
    expect((wrapper.get('.vdd-side-panel-right').element as HTMLElement).style.width).toBe('550px')
  })

  it('should default the body to zero (no inline) padding, and respect a bodyPadding override', async () => {
    const { wrapper, overlays } = setup()

    // No bodyPadding given: nothing inline, so the stylesheet governs and content is
    // edge-to-edge. An inline default would be unreachable without !important.
    await overlays.openLeftPanel(Content, {}, { title: 'Left Drawer' })
    await nextTick()
    expect((wrapper.get('.vdd-side-panel-left .vdd-side-panel-body').element as HTMLElement).style.padding).toBe('')

    // A number is pixels.
    await overlays.openRightPanel(Content, {}, { title: 'Right Drawer', bodyPadding: 12 })
    await nextTick()
    expect((wrapper.get('.vdd-side-panel-right .vdd-side-panel-body').element as HTMLElement).style.padding).toBe('12px')

    // A string passes through verbatim, shorthand included.
    overlays.close(overlays.state.leftPanel!.id)
    await overlays.openLeftPanel(Content, {}, { title: 'Left Drawer', bodyPadding: '4px 8px' })
    await nextTick()
    expect((wrapper.get('.vdd-side-panel-left .vdd-side-panel-body').element as HTMLElement).style.padding).toBe('4px 8px')
  })

  it('should support nested stacked modals and track their sizes and headers', async () => {
    const { wrapper, overlays } = setup()

    overlays.openModal(Content, { message: 'Modal 1' }, { title: 'First Modal', size: 'small' })
    await nextTick()
    expect(overlays.state.modals).toHaveLength(1)
    expect(overlays.state.modals[0]!.options.title).toBe('First Modal')

    overlays.openModal(Content, { message: 'Modal 2' }, { title: 'Second Modal', size: 'large' })
    await nextTick()
    expect(overlays.state.modals).toHaveLength(2)

    const windows = wrapper.findAll('.vdd-modal-overlay')
    expect(windows).toHaveLength(2)
    expect(windows[0]!.get('.vdd-modal-title').text()).toBe('First Modal')
    expect(windows[1]!.get('.vdd-modal-title').text()).toBe('Second Modal')
    expect(windows[0]!.get('.vdd-modal-window').classes()).toContain('vdd-modal-size-small')
    expect(windows[1]!.get('.vdd-modal-window').classes()).toContain('vdd-modal-size-large')

    // Stacking is by depth, so a modal opened from a modal lands above it.
    const z = windows.map(w => (w.element as HTMLElement).style.zIndex)
    expect(z[0]).toBe('calc(var(--vdd-z-base, 1000) + 9000 + 0)')
    expect(z[1]).toBe('calc(var(--vdd-z-base, 1000) + 9000 + 10)')
  })

  it('should default the modal body to zero (no inline) padding, and respect a bodyPadding override', async () => {
    const { wrapper, overlays } = setup()

    overlays.openModal(Content, {}, { title: 'First Modal' })
    await nextTick()
    expect((wrapper.get('.vdd-modal-body').element as HTMLElement).style.padding).toBe('')

    overlays.openModal(Content, {}, { title: 'Second Modal', bodyPadding: 12 })
    await nextTick()
    expect((wrapper.findAll('.vdd-modal-body')[1]!.element as HTMLElement).style.padding).toBe('12px')

    overlays.openModal(Content, {}, { title: 'Third Modal', bodyPadding: '4px 8px' })
    await nextTick()
    expect((wrapper.findAll('.vdd-modal-body')[2]!.element as HTMLElement).style.padding).toBe('4px 8px')
  })

  it('should route Escape key closes to topmost modal, and to side drawers only if modals stack is empty', async () => {
    const { overlays } = setup()

    await overlays.openLeftPanel(Content, {}, { title: 'Left Drawer' })
    overlays.openModal(Content, {}, { title: 'Modal 1' })
    overlays.openModal(Content, {}, { title: 'Modal 2' })
    await nextTick()

    expect(overlays.state.leftPanel).not.toBeNull()
    expect(overlays.state.modals).toHaveLength(2)

    // The topmost modal answers, and nothing below it does — not the modal underneath, and
    // not the drawer, even though all three are listening on the same document.
    await escape()
    expect(overlays.state.modals).toHaveLength(1)
    expect(overlays.state.modals[0]!.options.title).toBe('Modal 1')
    expect(overlays.state.leftPanel).not.toBeNull()

    await escape()
    expect(overlays.state.modals).toHaveLength(0)
    expect(overlays.state.leftPanel).not.toBeNull()

    // Only now, with the stack empty, does the drawer take it.
    await escape()
    expect(overlays.state.leftPanel).toBeNull()
  })

  it('should support VddConfirm rendering, resolving its ok and cancel handlers', async () => {
    const { wrapper, overlays } = setup()
    const onOk = vi.fn()
    const onCancel = vi.fn()

    overlays.openModal(
      VddConfirm,
      { message: 'Critical Action Prompt', alert: 'System Alert Notice', alertType: 'danger', yesNo: true, onOk, onCancel },
      { title: 'Confirmation Dialog' },
    )
    await nextTick()

    expect(overlays.state.modals).toHaveLength(1)
    expect(overlays.state.modals[0]!.options.title).toBe('Confirmation Dialog')

    const body = wrapper.get('.vdd-modal-body')
    expect(body.text()).toContain('Critical Action Prompt')
    expect(body.text()).toContain('System Alert Notice')

    const ok = body.get('[data-vdd-confirm-ok]')
    expect(ok.text()).toBe('Yes')
    expect(body.get('[data-vdd-confirm-cancel]').text()).toBe('No')

    await ok.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()

    expect(onOk).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(overlays.state.modals).toHaveLength(0)
  })
})
