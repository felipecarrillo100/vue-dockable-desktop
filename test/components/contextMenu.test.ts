/**
 * Context menus.
 *
 * Includes the D1 regression *through the real menu*: rdd's taskbar offered a "Maximize" item
 * whose action did nothing at all, because `maximizePanel` only mapped over floating windows
 * and a minimised panel is not in that list. Asserting the store alone would have missed
 * that the item is even offered, so it is clicked here.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddContextMenu from '../../src/components/VddContextMenu.vue'
import { clampToViewport, menuPosition } from '../../src/core/contextMenu'
import { usePanelContextMenu } from '../../src/composables/useContextMenu'

const P = defineComponent({ name: 'MockPanel', setup: () => () => h('div', 'panel') })
const Locked = defineComponent({ name: 'LockedPanel', setup: () => () => h('div') })

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount, [data-vdd-menu], [data-vdd-submenu]').forEach(el => el.remove())
  document.body.innerHTML = ''
  vi.useRealTimers()
})

const Shell = defineComponent({
  components: { VddDesktop, VddContextMenu },
  template: '<div><VddDesktop /><VddContextMenu /></div>',
})

const setup = (dir?: 'ltr' | 'rtl') => {
  const ws = createWorkspace({
    panels: {
      map: { component: P },
      locked: { component: Locked, defaultOptions: { canClose: false, canMinimize: false, canDrag: false } },
    },
    ...(dir ? { dir } : {}),
  })
  const wrapper = mount(Shell, { global: { plugins: [ws] }, attachTo: document.body })
  mounted.push(wrapper)
  return { ws, wrapper }
}

const menuLabels = () => Array.from(document.querySelectorAll('[data-vdd-menu-item], [data-vdd-menu-submenu]'))
  .map(el => el.getAttribute('data-vdd-menu-item') ?? el.getAttribute('data-vdd-menu-submenu'))
const clickItem = (label: string) => (document.querySelector(`[data-vdd-menu-item="${label}"]`) as HTMLElement | null)?.click()

describe('positioning is pure and testable', () => {
  it('reads a position from a mouse event, a touch, or explicit coordinates', () => {
    expect(menuPosition({ items: [], x: 10, y: 20 })).toEqual({ x: 10, y: 20 })
    expect(menuPosition({ items: [], event: new MouseEvent('contextmenu', { clientX: 5, clientY: 6 }) })).toEqual({ x: 5, y: 6 })
    expect(menuPosition({ items: [] })).toEqual({ x: 0, y: 0 })
  })

  it('pulls a menu back inside the viewport', () => {
    const viewport = { width: 1000, height: 800 }
    expect(clampToViewport({ x: 950, y: 100 }, { width: 200, height: 100 }, viewport)).toEqual({ x: 792, y: 100 })
    expect(clampToViewport({ x: 100, y: 780 }, { width: 200, height: 100 }, viewport)).toEqual({ x: 100, y: 692 })
    expect(clampToViewport({ x: -50, y: -50 }, { width: 200, height: 100 }, viewport)).toEqual({ x: 8, y: 8 })
  })

  it('leaves a menu that already fits exactly where it was asked for', () => {
    expect(clampToViewport({ x: 100, y: 100 }, { width: 200, height: 100 }, { width: 1000, height: 800 }))
      .toEqual({ x: 100, y: 100 })
  })
})

describe('the menu host renders what the workspace has pending', () => {
  it('renders nothing until a menu is requested', () => {
    setup()
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
  })

  it('renders items, separators and submenus', async () => {
    const { ws } = setup()
    ws.showContextMenu({ x: 10, y: 10, items: [
      { label: 'One', action: () => {} },
      { separator: true },
      { label: 'More', items: [{ label: 'Nested', action: () => {} }] },
    ] })
    await nextTick()
    expect(menuLabels()).toEqual(['One', 'More'])
    expect(document.querySelectorAll('.vdd-context-menu__separator').length).toBe(1)
  })

  it('can be opened from outside any component', async () => {
    const { ws } = setup()
    // The whole point of the request being state: a service or a plain module can do this.
    ws.showContextMenu({ x: 1, y: 1, items: [{ label: 'From a module', action: () => {} }] })
    await nextTick()
    expect(menuLabels()).toEqual(['From a module'])
  })

  it('runs an item\'s action and closes', async () => {
    const { ws } = setup()
    const action = vi.fn()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'Go', action }] })
    await nextTick()
    clickItem('Go')
    await nextTick()
    expect(action).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
  })

  it('does not run a disabled item, and leaves the menu open', async () => {
    const { ws } = setup()
    const action = vi.fn()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'Nope', action, disabled: true }] })
    await nextTick()
    clickItem('Nope')
    await nextTick()
    expect(action).not.toHaveBeenCalled()
    expect(document.querySelector('[data-vdd-menu]')).not.toBeNull()
  })

  it('renders a checkbox column only when asked, and reflects its value', async () => {
    const { ws } = setup()
    ws.showContextMenu({ x: 10, y: 10, items: [
      { label: 'On', checkbox: { value: true } },
      { label: 'Off', checkbox: { value: false } },
      { label: 'Hidden', checkbox: { value: true, active: false } },
      { label: 'Plain' },
    ] })
    await nextTick()
    const box = (label: string) => document.querySelector(`[data-vdd-menu-item="${label}"] .vdd-context-menu__checkbox`)
    expect(box('On')?.classList.contains('vdd-context-menu__checkbox--checked')).toBe(true)
    expect(box('Off')?.classList.contains('vdd-context-menu__checkbox--checked')).toBe(false)
    expect(box('Hidden')).toBeNull()
    expect(box('Plain')).toBeNull()
    expect(document.querySelector('[data-vdd-menu-item="On"]')?.getAttribute('aria-checked')).toBe('true')
  })

  it('treats checkbox.enabled: false as disabled', async () => {
    const { ws } = setup()
    const action = vi.fn()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'Locked', action, checkbox: { value: true, enabled: false } }] })
    await nextTick()
    clickItem('Locked')
    expect(action).not.toHaveBeenCalled()
  })

  it('resolves i18n descriptors in labels', async () => {
    const ws = createWorkspace({ formatMessage: (m) => `[${m.id}]` })
    const wrapper = mount(VddContextMenu, { global: { plugins: [ws] }, attachTo: document.body })
    mounted.push(wrapper)
    ws.showContextMenu({ x: 1, y: 1, items: [{ label: { id: 'menu.save', defaultMessage: 'Save' } }] })
    await nextTick()
    expect(menuLabels()).toEqual(['[menu.save]'])
  })

  it('passes a cyAction through as a test hook', async () => {
    const { ws } = setup()
    ws.showContextMenu({ x: 1, y: 1, items: [{ label: 'Tagged', cyAction: 'save-button' }] })
    await nextTick()
    expect(document.querySelector('[data-cy-action="save-button"]')).not.toBeNull()
  })
})

describe('submenus', () => {
  beforeEach(() => { vi.useFakeTimers() })

  it('opens after a short rest on the parent, not immediately', async () => {
    const { ws } = setup()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'More', items: [{ label: 'Nested' }] }] })
    await nextTick()
    const parent = document.querySelector('[data-vdd-menu-submenu="More"]') as HTMLElement
    parent.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('[data-vdd-submenu]')).toBeNull()
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(document.querySelector('[data-vdd-submenu]')).not.toBeNull()
    expect(parent.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes after a grace period once the pointer leaves, so it can be travelled into', async () => {
    const { ws } = setup()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'More', items: [{ label: 'Nested' }] }] })
    await nextTick()
    const parent = document.querySelector('[data-vdd-menu-submenu="More"]') as HTMLElement
    parent.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    vi.advanceTimersByTime(200)
    await nextTick()
    parent.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(document.querySelector('[data-vdd-submenu]')).not.toBeNull()   // still within the grace period
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(document.querySelector('[data-vdd-submenu]')).toBeNull()
  })

  it('running a nested item closes the whole menu', async () => {
    const { ws } = setup()
    const action = vi.fn()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'More', items: [{ label: 'Nested', action }] }] })
    await nextTick()
    const parent = document.querySelector('[data-vdd-menu-submenu="More"]') as HTMLElement
    parent.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    vi.advanceTimersByTime(200)
    await nextTick()
    ;(document.querySelector('[data-vdd-submenu] [data-vdd-menu-item="Nested"]') as HTMLElement).click()
    await nextTick()
    expect(action).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
  })

  it('switching to a different parent closes the previous submenu', async () => {
    const { ws } = setup()
    ws.showContextMenu({ x: 10, y: 10, items: [
      { label: 'A', items: [{ label: 'A1' }] },
      { label: 'B', items: [{ label: 'B1' }] },
    ] })
    await nextTick()
    const enter = (label: string) => (document.querySelector(`[data-vdd-menu-submenu="${label}"]`) as HTMLElement)
      .dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    enter('A'); vi.advanceTimersByTime(200); await nextTick()
    expect(document.querySelector('[data-vdd-submenu] [data-vdd-menu-item="A1"]')).not.toBeNull()
    enter('B'); await nextTick()
    expect(document.querySelector('[data-vdd-submenu]')).toBeNull()       // closed at once
    vi.advanceTimersByTime(200); await nextTick()
    expect(document.querySelector('[data-vdd-submenu] [data-vdd-menu-item="B1"]')).not.toBeNull()
  })

  it('hovering a plain item closes an open submenu after the grace period', async () => {
    const { ws } = setup()
    ws.showContextMenu({ x: 10, y: 10, items: [
      { label: 'More', items: [{ label: 'Nested' }] },
      { label: 'Plain' },
    ] })
    await nextTick()
    ;(document.querySelector('[data-vdd-menu-submenu="More"]') as HTMLElement)
      .dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    vi.advanceTimersByTime(200); await nextTick()
    ;(document.querySelector('[data-vdd-menu-item="Plain"]') as HTMLElement)
      .dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    vi.advanceTimersByTime(300); await nextTick()
    expect(document.querySelector('[data-vdd-submenu]')).toBeNull()
  })
})

describe('dismissal', () => {
  it('closes on Escape', async () => {
    const { ws } = setup()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'One' }] })
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
  })

  it('closes on a pointerdown outside, in the capture phase', async () => {
    // Capture, so it runs before a canvas or map gesture handler can swallow the event.
    const { ws } = setup()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'One' }] })
    await nextTick()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
  })

  it('also closes on a bubbled click, which survives stopPropagation on pointerdown', async () => {
    // WebGL canvases commonly stop pointerdown; rdd found this against real mapping libraries.
    const { ws } = setup()
    const canvas = document.createElement('div')
    canvas.addEventListener('pointerdown', e => e.stopPropagation())
    document.body.appendChild(canvas)
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'One' }] })
    await nextTick()
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    window.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
  })

  it('does not close on a pointerdown inside the menu', async () => {
    const { ws } = setup()
    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'One' }] })
    await nextTick()
    document.querySelector('[data-vdd-menu]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('[data-vdd-menu]')).not.toBeNull()
  })
})

describe('the standard panel menu', () => {
  it('offers float, minimise and close for a tab', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map')
    await nextTick()
    await wrapper.find('[data-vdd-tab="a"]').trigger('contextmenu')
    await nextTick()
    expect(menuLabels()).toEqual(['Float Window', 'Minimize Panel', 'Close Tab'])
  })

  it('omits what the panel has opted out of, rather than disabling it', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('l', 'locked')
    await nextTick()
    await wrapper.find('[data-vdd-tab="l"]').trigger('contextmenu')
    await nextTick()
    // canDrag, canMinimize and canClose are all false: an action a panel has opted out of is
    // not a temporarily unavailable action, so it is absent.
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()
  })

  it('appends items the panel contributed, behind a separator', async () => {
    const Contributing = defineComponent({
      name: 'ContributingPanel',
      setup() {
        usePanelContextMenu(() => [{ label: 'Save', action: () => {} }, { label: 'Revert', disabled: true }])
        return () => h('div')
      },
    })
    const ws = createWorkspace({ panels: { doc: { component: Contributing } } })
    const wrapper = mount(Shell, { global: { plugins: [ws] }, attachTo: document.body })
    mounted.push(wrapper)
    ws.openPanel('d', 'doc')
    await nextTick()
    await wrapper.find('[data-vdd-tab="d"]').trigger('contextmenu')
    await nextTick()
    expect(menuLabels()).toEqual(['Float Window', 'Minimize Panel', 'Close Tab', 'Save', 'Revert'])
    expect(document.querySelectorAll('.vdd-context-menu__separator').length).toBe(2)
  })

  it('re-reads contributed items each time, so state-driven changes work', async () => {
    let enabled = false
    const Contributing = defineComponent({
      name: 'ContributingPanel',
      setup() {
        usePanelContextMenu(() => (enabled ? [{ label: 'Publish' }] : []))
        return () => h('div')
      },
    })
    const ws = createWorkspace({ panels: { doc: { component: Contributing } } })
    const wrapper = mount(Shell, { global: { plugins: [ws] }, attachTo: document.body })
    mounted.push(wrapper)
    ws.openPanel('d', 'doc')
    await nextTick()
    await wrapper.find('[data-vdd-tab="d"]').trigger('contextmenu')
    await nextTick()
    expect(menuLabels()).not.toContain('Publish')
    ws.closeContextMenu(); await nextTick()
    enabled = true
    await wrapper.find('[data-vdd-tab="d"]').trigger('contextmenu')
    await nextTick()
    expect(menuLabels()).toContain('Publish')
  })

  it('opens from a floating window\'s title bar too', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('f', 'map', { initialTarget: 'floating' })
    await nextTick()
    await wrapper.find('[data-vdd-titlebar="f"]').trigger('contextmenu')
    await nextTick()
    expect(menuLabels()).toContain('Minimize Panel')
  })

  it('shows a more-actions button on a window only when the panel contributed items', async () => {
    const Contributing = defineComponent({
      name: 'ContributingPanel',
      setup() { usePanelContextMenu(() => [{ label: 'Export' }]); return () => h('div') },
    })
    const ws = createWorkspace({ panels: { plain: { component: P }, doc: { component: Contributing } } })
    const wrapper = mount(Shell, { global: { plugins: [ws] }, attachTo: document.body })
    mounted.push(wrapper)
    ws.openPanel('p', 'plain', { initialTarget: 'floating' })
    ws.openPanel('d', 'doc', { initialTarget: 'floating' })
    await nextTick()
    expect(wrapper.find('[data-vdd-more="p"]').exists()).toBe(false)
    expect(wrapper.find('[data-vdd-more="d"]').exists()).toBe(true)
    await wrapper.find('[data-vdd-more="d"]').trigger('click')
    await nextTick()
    expect(menuLabels()).toEqual(['Export'])      // only the contributed items
  })
})

describe('the taskbar menu — D1', () => {
  const openTaskbarMenu = async (wrapper: ReturnType<typeof setup>['wrapper'], id: string) => {
    await wrapper.find(`[data-vdd-taskbar-item="${id}"]`).trigger('contextmenu')
    await nextTick()
  }

  it('offers restore, maximise and close for a minimised panel', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await openTaskbarMenu(wrapper, 'a')
    expect(menuLabels()).toEqual(['Restore Panel', 'Maximize Panel', 'Close Panel'])
  })

  it('Maximize actually maximises — rdd\'s did nothing at all', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await openTaskbarMenu(wrapper, 'a')
    clickItem('Maximize Panel')
    await nextTick()
    // rdd's maximizePanel only mapped over `floating`, and a minimised panel is not there, so
    // clicking this item changed nothing whatsoever. It restores first here.
    expect(ws.state.panels.a!.state).toBe('floating')
    expect(ws.state.floating.find(w => w.id === 'a')!.maximized).toBe(true)
    expect(ws.state.minimized).toEqual([])
  })

  it('Restore restores', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await openTaskbarMenu(wrapper, 'a')
    clickItem('Restore Panel')
    await nextTick()
    expect(ws.state.panels.a!.state).toBe('docked')
  })

  it('still emits taskbarContextMenu, so an app can observe it', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('a', 'map'); ws.minimizePanel('a')
    await nextTick()
    await openTaskbarMenu(wrapper, 'a')
    expect(wrapper.findComponent(VddDesktop).emitted('taskbarContextMenu')?.[0]?.[0]).toBe('a')
  })
})

// ─── Custom renderer ─────────────────────────────────────────────────────────

describe('a default slot replaces the built-in menu (rdd ContextMenuAdapter)', () => {
  it('renders the slot instead of the library markup, with the items, position and a close', async () => {
    // rdd's `ContextMenuAdapter` had one field: a component to swap in. A slot is the Vue
    // spelling of that, with no provider, no ref handshake and no adapter object.
    const ws = createWorkspace({ panels: {} })
    const wrapper = mount(VddContextMenu, {
      global: { plugins: [ws] },
      attachTo: document.body,
      slots: {
        default: `<ul data-mine><li v-for="(i, n) in items" :key="n" :data-x="x" :data-y="y">
          {{ i.label }}<button data-mine-close @click="close()">x</button></li></ul>`,
      },
    })
    mounted.push(wrapper)

    ws.showContextMenu({ x: 40, y: 60, items: [{ label: 'Mine' }, { label: 'Also mine' }] })
    await nextTick()

    const own = document.querySelector('[data-mine]')
    expect(own).not.toBeNull()
    expect(own!.textContent).toContain('Mine')
    expect(own!.querySelectorAll('li')).toHaveLength(2)
    expect(own!.querySelector('li')!.getAttribute('data-x')).toBe('40')
    expect(own!.querySelector('li')!.getAttribute('data-y')).toBe('60')
    // The built-in markup is not rendered alongside it.
    expect(document.querySelector('[data-vdd-menu]')).toBeNull()

    own!.querySelector<HTMLButtonElement>('[data-mine-close]')!.click()
    await nextTick()
    expect(document.querySelector('[data-mine]')).toBeNull()
  })

  it('a real click inside the slot reaches its item, pointerdown first', async () => {
    // A mouse click is pointerdown → click. The capture-phase pointerdown dismissal used to
    // treat the whole slot as outside, so the menu closed before the click could land.
    const ws = createWorkspace({ panels: {} })
    const action = vi.fn()
    const wrapper = mount(VddContextMenu, {
      global: { plugins: [ws] },
      attachTo: document.body,
      slots: {
        default: `<ul data-mine><li v-for="(i, n) in items" :key="n">
          <button data-mine-item @click="i.action()">{{ i.label }}</button></li></ul>`,
      },
    })
    mounted.push(wrapper)

    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'Go', action }] })
    await nextTick()
    document.querySelector('[data-mine-item]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    // Re-query: a detached button would still run its listener in jsdom, but in a browser a
    // click never reaches an element that is no longer in the document.
    const live = document.querySelector<HTMLButtonElement>('[data-mine-item]')
    expect(live).not.toBeNull()
    live!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(action).toHaveBeenCalledTimes(1)
  })

  it('a slot menu is still dismissed by a press outside it, and by Escape', async () => {
    const ws = createWorkspace({ panels: {} })
    const wrapper = mount(VddContextMenu, {
      global: { plugins: [ws] },
      attachTo: document.body,
      slots: { default: '<ul data-mine><li>x</li></ul>' },
    })
    mounted.push(wrapper)

    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'One' }] })
    await nextTick()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('[data-mine]')).toBeNull()

    ws.showContextMenu({ x: 10, y: 10, items: [{ label: 'One' }] })
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.querySelector('[data-mine]')).toBeNull()
  })

  it('renders the built-in menu when no slot is given', async () => {
    const ws = createWorkspace({ panels: {} })
    const wrapper = mount(VddContextMenu, { global: { plugins: [ws] }, attachTo: document.body })
    mounted.push(wrapper)
    ws.showContextMenu({ x: 5, y: 5, items: [{ label: 'Built in' }] })
    await nextTick()
    expect(document.querySelector('[data-vdd-menu]')).not.toBeNull()
  })
})
