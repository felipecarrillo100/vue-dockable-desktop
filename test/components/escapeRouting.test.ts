/**
 * One Escape, one answer.
 *
 * Every overlay and every transient widget listens for Escape on `document`, and
 * `stopPropagation()` does not stop other listeners on the same node — so before 1.1.2 which
 * of them acted depended on the order they happened to register in, and on whether a close
 * guard made the close asynchronous. These pin the orders that used to go wrong:
 *
 * - a drawer opened *after* a modal closed along with it;
 * - a context menu, toolbar flyout or toolbar search inside a modal or drawer closed its
 *   host too;
 * - a left and a right drawer closed together.
 *
 * The existing routing test in `overlays.test.ts` opens the drawer first, which is the one
 * order that always worked.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddSidePanels from '../../src/components/VddSidePanels.vue'
import VddModals from '../../src/components/VddModals.vue'
import VddContextMenu from '../../src/components/VddContextMenu.vue'
import VddToolbar from '../../src/components/VddToolbar.vue'
import VddToolbarSearch from '../../src/components/VddToolbarSearch.vue'
import type { ToolbarItem } from '../../src/core/toolbarTypes'

const Content = defineComponent({ name: 'Content', setup: () => () => h('div', { class: 'content' }, 'content') })
const Icon = defineComponent({ name: 'Icon', setup: () => () => h('svg') })

/** A panel with a toolbar search in it, for Escape inside a drawer. */
const WithSearch = defineComponent({
  name: 'WithSearch',
  setup: () => () => h(VddToolbarSearch, { search: () => [] }),
})

const groupItems: ToolbarItem[] = [{
  type: 'group',
  id: 'tools',
  label: 'Tools',
  defaultIcon: Icon,
  items: [{ id: 'pen', label: 'Pen', icon: Icon }],
}]

const Shell = defineComponent({
  name: 'Shell',
  components: { VddSidePanels, VddModals, VddContextMenu, VddToolbar },
  setup: () => ({ groupItems }),
  template: '<div><VddToolbar :items="groupItems" /><VddSidePanels /><VddModals /><VddContextMenu /></div>',
})

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
})

function setup() {
  const ws = createWorkspace({ panels: {} })
  const wrapper = mount(Shell, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  return { ws, wrapper, overlays: ws.overlays }
}

const settle = async () => {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

/** Escape as a browser delivers it: bubbling and cancelable, from `target`. */
const escape = async (target: EventTarget = document) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await settle()
}

describe('overlays answer one Escape at a time', () => {
  it('a drawer opened after a modal stays open when Escape closes the modal', async () => {
    const { overlays } = setup()
    overlays.openModal(Content, {}, { title: 'M' })
    await settle()   // the modal's host mounts, and so listens, first
    await overlays.openLeftPanel(Content, {}, { title: 'D' })
    await settle()

    await escape()
    expect(overlays.state.modals).toHaveLength(0)
    expect(overlays.state.leftPanel).not.toBeNull()

    await escape()
    expect(overlays.state.leftPanel).toBeNull()
  })

  it('the same holds when the modal has a close guard', async () => {
    const { overlays } = setup()
    const id = overlays.openModal(Content, {}, { title: 'M' })
    overlays.registerCloseGuard(id, () => true)
    await settle()
    await overlays.openLeftPanel(Content, {}, { title: 'D' })
    await settle()

    await escape()
    expect(overlays.state.modals).toHaveLength(0)
    expect(overlays.state.leftPanel).not.toBeNull()
  })

  it('with both drawers open, Escape closes the one opened last', async () => {
    const { overlays } = setup()
    await overlays.openLeftPanel(Content, {}, { title: 'L' })
    await settle()
    await overlays.openRightPanel(Content, {}, { title: 'R' })
    await settle()

    await escape()
    expect(overlays.state.rightPanel).toBeNull()
    expect(overlays.state.leftPanel).not.toBeNull()

    await escape()
    expect(overlays.state.leftPanel).toBeNull()
  })

  it('the order follows opening, not the side', async () => {
    const { overlays } = setup()
    await overlays.openRightPanel(Content, {}, { title: 'R' })
    await settle()
    await overlays.openLeftPanel(Content, {}, { title: 'L' })
    await settle()

    await escape()
    expect(overlays.state.leftPanel).toBeNull()
    expect(overlays.state.rightPanel).not.toBeNull()
  })

  it('an application widget can keep a modal open by preventing the default', async () => {
    const { overlays } = setup()
    overlays.openModal(Content, {}, { title: 'M' })
    await settle()

    // A combobox or date picker inside the modal, closing its own popup on Escape.
    const inner = document.querySelector('.content') as HTMLElement
    inner.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.preventDefault() })

    await escape(inner)
    expect(overlays.state.modals).toHaveLength(1)
  })
})

describe('transient UI inside an overlay takes Escape first', () => {
  it('a context menu over a modal closes alone', async () => {
    const { ws, overlays } = setup()
    overlays.openModal(Content, {}, { title: 'M' })
    await settle()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'One' }] })
    await settle()

    await escape()
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
    expect(overlays.state.modals).toHaveLength(1)
  })

  it('also when Escape bubbles from the focused element', async () => {
    const { ws, overlays } = setup()
    overlays.openModal(Content, {}, { title: 'M' })
    await settle()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'One' }] })
    await settle()

    await escape(document.body)
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
    expect(overlays.state.modals).toHaveLength(1)
  })

  it('a context menu over a drawer closes alone', async () => {
    const { ws, overlays } = setup()
    await overlays.openLeftPanel(Content, {}, { title: 'D' })
    await settle()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'One' }] })
    await settle()

    await escape()
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
    expect(overlays.state.leftPanel).not.toBeNull()
  })

  it('a toolbar flyout opened over a modal closes alone', async () => {
    const { wrapper, overlays } = setup()
    overlays.openModal(Content, {}, { title: 'M' })
    await settle()
    await wrapper.get('.vdd-toolbar-btn-group').trigger('click')
    await settle()
    expect(document.querySelector('.vdd-toolbar-group-flyout')).not.toBeNull()

    await escape()
    expect(document.querySelector('.vdd-toolbar-group-flyout')).toBeNull()
    expect(overlays.state.modals).toHaveLength(1)
  })

  it('Escape in a toolbar search inside a drawer collapses the search and keeps the drawer', async () => {
    const { overlays } = setup()
    await overlays.openLeftPanel(WithSearch, {}, { title: 'D' })
    await settle()
    ;(document.querySelector('[data-vdd-search-toggle]') as HTMLElement).click()
    await settle()
    const input = document.querySelector('[data-vdd-search-input]') as HTMLInputElement
    expect(input).not.toBeNull()

    await escape(input)
    expect(document.querySelector('[data-vdd-search-input]')).toBeNull()
    expect(overlays.state.leftPanel).not.toBeNull()
  })
})
