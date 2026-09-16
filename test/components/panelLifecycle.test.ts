/**
 * `usePanel()` — dirty state, close guards, titles, size, and the lifecycle a panel can
 * observe about itself.
 *
 * A **rewrite** of rdd's `FormContainer.test.tsx` (24 tests, names preserved), and the one
 * milestone the plan marked as a rewrite rather than a port
 * (docs/PARITY.md §3, docs/decisions/0006-refs-over-subscriptions.md). rdd handed a panel six
 * subscription methods and two size APIs:
 *
 *   rdd contract member        vdd equivalent asserted here
 *   ────────────────────────   ──────────────────────────────────────────────────────
 *   onActivate / onDeactivate  `watch(isActive)`                        (tests 16–19, 24)
 *   onContainerTypeChange      `watch(containerType)`                      (tests 20–22)
 *   onClose                    `onBeforeUnmount` / `subscribe('panel:closed')`  (test 19)
 *   onMinimize / onRestore     `watch(isMinimized)`                           (test 13)
 *   onResize + getDimensions   `size`, one ref                              (tests 14–15)
 *   usePanelSize()             `size` — the same ref, so there is no second API (test 15)
 *   requestClose               `close()`                                   (tests 4, 5, 9)
 *   onCloseRequested           `onBeforeClose()`, disposed with the component  (test 4)
 *   setDirty / setTitle        `setDirty()` / `setTitle()`                  (tests 1–3)
 *   registerStateProvider      `onSaveState()`                                (test 10)
 *
 * **The ordering guarantee.** rdd fired `onDeactivate` synchronously before `onClose`, which
 * its test asserted. Vue queues watcher callbacks, so that ordering is not automatic and the
 * plan called for pinning whatever vdd actually offers. Measured, it is this:
 *
 *   - A `watch(isActive, …, { flush: 'sync' })` **does** see the deactivation before
 *     `panel:closed` is published. Test 19 asserts it.
 *   - A default-flush watcher does **not**, and cannot: the panel's own component is
 *     unmounted in the same flush, so its watcher is disposed before it would have run.
 *     For "before I go" work the Vue answer is `onBeforeUnmount`/`onScopeDispose`, which
 *     runs deterministically. Test 19 asserts that too.
 *
 * That is a real difference from rdd and is recorded as divergence D14 — with the note that
 * the rdd ordering is still available, by asking for a synchronous watcher.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddModals from '../../src/components/VddModals.vue'
import { usePanel } from '../../src/composables/usePanel'
import type { UsePanelReturn } from '../../src/composables/usePanel'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Where each mounted panel publishes its `usePanel()` return, keyed by panel id. */
const api = new Map<string, UsePanelReturn>()
/** Ordered lifecycle log, for the ordering assertions. */
let log: string[] = []

/** A panel that hands its whole contract to the test. */
const Form = defineComponent({
  name: 'FormPanel',
  props: { panelId: { type: String, default: '' }, message: { type: String, default: 'Default' } },
  setup(props) {
    const panel = usePanel()
    api.set(props.panelId, panel)
    return () => h('div', { id: `child-${props.panelId}`, 'data-message': props.message }, 'form')
  },
})

/** A panel that logs its own lifecycle, both ways round. */
const Lifecycle = defineComponent({
  name: 'LifecyclePanel',
  props: { panelId: { type: String, default: '' } },
  setup(props) {
    const panel = usePanel()
    api.set(props.panelId, panel)
    const id = props.panelId
    watch(panel.isActive, v => log.push(`${v ? 'activate' : 'deactivate'}:${id}`))
    watch(panel.isActive, v => log.push(`sync-${v ? 'activate' : 'deactivate'}:${id}`), { flush: 'sync' })
    watch(panel.containerType, t => log.push(`containerType:${id}:${t}`))
    watch(panel.isMinimized, v => log.push(`${v ? 'minimize' : 'restore'}:${id}`))
    onBeforeUnmount(() => log.push(`unmount:${id}`))
    return () => h('div', { id: `lc-${props.panelId}`, 'data-container-type': panel.containerType.value })
  },
})

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  api.clear()
  log = []
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount').forEach(el => el.remove())
  document.body.innerHTML = ''
})

/** The desktop plus the modal host, since the unsaved-changes question is a modal. */
const App = defineComponent({
  name: 'App',
  components: { VddDesktop, VddModals },
  template: '<div><VddDesktop /><VddModals /></div>',
})

function setup() {
  const ws = createWorkspace({
    panels: { form: { component: Form }, lifecycle: { component: Lifecycle } },
  })
  const wrapper = mount(App, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  return { ws, wrapper }
}

const panelOf = (id: string): UsePanelReturn => {
  const found = api.get(id)
  if (!found) throw new Error(`panel ${id} did not mount`)
  return found
}
/** Vue flushes on a microtask; a close awaits a promise, so give it both. */
const flush = async () => { await nextTick(); await Promise.resolve(); await nextTick() }

// ─── Integration ─────────────────────────────────────────────────────────────

describe('usePanel integration', () => {
  it('should render form container and show asterisk on dirty state', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('p1', 'form', { title: 'Editor' })
    await nextTick()

    expect(wrapper.find('#child-p1').exists()).toBe(true)
    expect(wrapper.find('[data-vdd-tab="p1"]').text()).toBe('Editor')

    panelOf('p1').setDirty(true)
    await nextTick()
    expect(ws.state.panels.p1!.dirty).toBe(true)
    expect(wrapper.find('[data-vdd-tab="p1"]').text()).toContain('*')
  })

  it('should clear dirty flag and asterisk when setDirty(false) is called', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('p1', 'form', { title: 'Editor' })
    await nextTick()

    panelOf('p1').setDirty(true)
    await nextTick()
    expect(wrapper.find('[data-vdd-tab="p1"]').text()).toContain('*')

    panelOf('p1').setDirty(false)
    await nextTick()
    expect(ws.state.panels.p1!.dirty).toBe(false)
    expect(wrapper.find('[data-vdd-tab="p1"]').text()).not.toContain('*')
  })

  it('should support dynamic title updates via the panel contract', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('p1', 'form', { title: 'Initial Title' })
    await nextTick()
    expect(wrapper.find('[data-vdd-tab="p1"]').text()).toBe('Initial Title')

    panelOf('p1').setTitle('Dynamic Title')
    await nextTick()
    expect(wrapper.find('[data-vdd-tab="p1"]').text()).toBe('Dynamic Title')
    // And the live title is readable back through the same composable.
    expect(panelOf('p1').title.value).toBe('Dynamic Title')
  })

  it('should block panel closure when an onBeforeClose guard returns false', async () => {
    const { ws } = setup()
    ws.openPanel('p1', 'form', { title: 'Guard Test' })
    await nextTick()

    panelOf('p1').onBeforeClose(() => false)
    await ws.requestClosePanel('p1')
    await flush()
    expect(ws.isOpen('p1')).toBe(true)
  })

  it('should bypass the guard and the dirty check on a force close', async () => {
    const { ws } = setup()
    ws.openPanel('p1', 'form', { title: 'Force Close Test' })
    await nextTick()

    panelOf('p1').onBeforeClose(() => false)
    panelOf('p1').setDirty(true)
    await nextTick()

    await panelOf('p1').close({ force: true })
    await flush()
    expect(ws.isOpen('p1')).toBe(false)
  })

  it('should show the dirty confirmation modal when a dirty panel is closed', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('p1', 'form', { title: 'Modal Test' })
    await nextTick()
    panelOf('p1').setDirty(true)
    await nextTick()

    // The tab's own × is the path a user takes, and it is wired to the same request.
    expect(wrapper.find('[data-vdd-close="p1"]').exists()).toBe(true)
    void ws.requestClosePanel('p1')
    await flush()

    expect(ws.overlays.state.modals).toHaveLength(1)
    const modal = wrapper.get('.vdd-modal-overlay')
    expect(modal.get('.vdd-modal-title').text()).toBe('Unsaved Changes')
    expect(modal.text()).toContain('Modal Test')
    expect(ws.isOpen('p1')).toBe(true)
  })

  it('should keep the panel open when No is clicked in the dirty confirmation modal', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('p1', 'form', { title: 'Modal Test' })
    await nextTick()
    panelOf('p1').setDirty(true)
    await nextTick()

    void ws.requestClosePanel('p1')
    await flush()
    await wrapper.get('[data-vdd-confirm-cancel]').trigger('click')
    await flush()

    expect(ws.isOpen('p1')).toBe(true)
    expect(ws.overlays.state.modals).toHaveLength(0)
  })

  it('should close the panel when Yes is clicked in the dirty confirmation modal', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('p1', 'form', { title: 'Modal Test' })
    await nextTick()
    panelOf('p1').setDirty(true)
    await nextTick()

    void ws.requestClosePanel('p1')
    await flush()
    await wrapper.get('[data-vdd-confirm-ok]').trigger('click')
    await flush()

    expect(ws.isOpen('p1')).toBe(false)
    expect(ws.overlays.state.modals).toHaveLength(0)
  })

  it('closing a dirty panel with nothing able to ask should silently abort (no modal, no close)', async () => {
    // rdd's equivalent: `requestClose` on a dirty panel with no `onConfirm` supplied. vdd
    // supplies the question by default, so the way to reach this state is to mount no
    // `<VddModals>` — and the refusal is the same: the edits are not discarded.
    const ws = createWorkspace({ panels: { form: { component: Form } } })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)

    ws.openPanel('p1', 'form', { title: 'No Host' })
    await nextTick()
    panelOf('p1').setDirty(true)
    await nextTick()

    await ws.requestClosePanel('p1')
    await flush()
    expect(ws.isOpen('p1')).toBe(true)
    expect(ws.overlays.state.modals).toHaveLength(0)
  })

  it('onSaveState (from inside the panel) is reflected in saveLayout, pulled fresh each time', async () => {
    const { ws } = setup()
    const value = ref<unknown>({ count: 0 })
    const Stateful = defineComponent({
      name: 'Stateful',
      props: { panelId: { type: String, default: '' } },
      setup() {
        usePanel().onSaveState(() => value.value)
        return () => h('div', 'stateful')
      },
    })
    ws.registry.register('stateful', Stateful)
    ws.openPanel('p1', 'stateful', { title: 'Stateful' })
    await nextTick()

    expect(JSON.parse(ws.saveLayout()).panels.p1.props).toEqual({ count: 0 })

    // Pulled on every save, not captured once — the whole reason the hook exists.
    value.value = { count: 7, note: 'later' }
    expect(JSON.parse(ws.saveLayout()).panels.p1.props).toEqual({ count: 7, note: 'later' })
  })

  it('openPanel props are spread onto the rendered component alongside panelId', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('p1', 'form', { title: 'Props', props: { message: 'from open' } })
    await nextTick()
    expect(wrapper.get('#child-p1').attributes('data-message')).toBe('from open')
    expect(panelOf('p1').id).toBe('p1')
  })

  it('a caller-supplied prop named panelId can never override the injected id', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('p1', 'form', { title: 'Props', props: { panelId: 'spoofed', message: 'x' } })
    await nextTick()
    // The injected id is bound after the spread, so it wins — a panel can always trust it.
    expect(wrapper.find('#child-spoofed').exists()).toBe(false)
    expect(wrapper.find('#child-p1').exists()).toBe(true)
    expect(panelOf('p1').id).toBe('p1')
  })
})

// ─── Lifecycle ───────────────────────────────────────────────────────────────

describe('usePanel lifecycle', () => {
  it('minimize moves the panel to the taskbar, and isMinimized reports it', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    await nextTick()

    panelOf('lc').minimize()
    await nextTick()

    expect(ws.state.panels.lc!.state).toBe('minimized')
    expect(panelOf('lc').isMinimized.value).toBe(true)
    expect(wrapper.find('[data-vdd-taskbar-item="lc"]').exists()).toBe(true)
    expect(log).toContain('minimize:lc')
  })

  it('size is null before anything has measured the panel', async () => {
    // rdd had getDimensions() *and* usePanelSize() for this; one ref answers both.
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    await nextTick()
    // jsdom runs no layout and fires no ResizeObserver, so nothing has reported a size.
    expect(panelOf('lc').size.value).toBeNull()
  })

  it('size is one reactive ref, so a watcher replaces rdd\'s onResize + usePanelSize', async () => {
    // rdd needed three things for this: `getDimensions()` to read, `onResize()` to be told,
    // and `usePanelSize()` — a `useSyncExternalStore` wrapper over both — to get it into a
    // render. They are one ref here, and writing it is the host's job, so what this asserts
    // is the contract a panel actually depends on: the ref is reactive, and it is never a
    // guess. jsdom runs no layout and fires no ResizeObserver, so nothing ever measures the
    // panel and the value stays null — the browser gate is where a real size is asserted.
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    await nextTick()

    const size = panelOf('lc').size
    const seen: (number | null)[] = []
    watch(size, s => seen.push(s?.width ?? null))

    expect(size.value).toBeNull()
    // Neither floating nor docking invents a size, which is the point: `null` means "not
    // laid out yet", and a panel can trust that rather than defending against a zero.
    ws.floatPanel('lc', { x: 10, y: 10, width: 420, height: 300 })
    await nextTick()
    expect(ws.state.floating.find(f => f.id === 'lc')?.width).toBe(420)
    expect(size.value).toBeNull()
    expect(seen).toEqual([])
  })

  it('isActive becomes true when the panel gains focus', async () => {
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    ws.openPanel('lc2', 'lifecycle', { title: 'LC2' })
    await nextTick()

    ws.focusPanel('lc')
    await nextTick()
    expect(panelOf('lc').isActive.value).toBe(true)
    expect(log).toContain('activate:lc')
  })

  it('isActive becomes false when the panel loses focus', async () => {
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    ws.openPanel('lc2', 'lifecycle', { title: 'LC2' })
    await nextTick()
    ws.focusPanel('lc')
    await nextTick()
    log = []

    ws.focusPanel('lc2')
    await nextTick()
    expect(panelOf('lc').isActive.value).toBe(false)
    expect(log).toContain('deactivate:lc')
    expect(log).toContain('activate:lc2')
  })

  it('the active panel is deactivated when it is closed', async () => {
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    ws.openPanel('lc2', 'lifecycle', { title: 'LC2' })
    await nextTick()
    ws.focusPanel('lc')
    await nextTick()
    log = []

    ws.closePanel('lc')
    await flush()
    expect(ws.state.activePanelId).not.toBe('lc')
    expect(log.some(e => e === 'sync-deactivate:lc')).toBe(true)
  })

  it('deactivation is observable before the close is published, with a synchronous watcher', async () => {
    // rdd fired onDeactivate before onClose, synchronously. Vue queues watchers, so a
    // default-flush watcher on a closing panel never runs — its component is unmounted in
    // the same flush. Both halves are asserted, because both are the contract (D14).
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    await nextTick()
    ws.focusPanel('lc')
    await nextTick()
    log = []
    ws.subscribe('panel:closed', ({ id }) => log.push(`closed:${id}`))

    ws.closePanel('lc')
    await flush()

    const deactivate = log.indexOf('sync-deactivate:lc')
    const closed = log.indexOf('closed:lc')
    expect(deactivate).toBeGreaterThanOrEqual(0)
    expect(closed).toBeGreaterThanOrEqual(0)
    expect(deactivate).toBeLessThan(closed)

    // The deterministic hook for "before I go" work is the Vue one, and it does run.
    expect(log).toContain('unmount:lc')
    // The default-flush watcher did not fire for the closing panel. This is the divergence.
    expect(log).not.toContain('deactivate:lc')
  })

  it('containerType reports floating-window when the panel is floated', async () => {
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    await nextTick()
    log = []

    ws.floatPanel('lc')
    await nextTick()
    expect(panelOf('lc').containerType.value).toBe('floating-window')
    expect(log).toContain('containerType:lc:floating-window')
  })

  it('containerType reports dockable-panel when a floating panel is docked back', async () => {
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    await nextTick()
    ws.floatPanel('lc')
    await nextTick()
    log = []

    ws.dockPanel('lc')
    await nextTick()
    expect(panelOf('lc').containerType.value).toBe('dockable-panel')
    expect(log).toContain('containerType:lc:dockable-panel')
  })

  it('containerType does NOT change during minimize and restore', async () => {
    // Minimising does not move a panel between containers — it takes it off screen, still
    // mounted and still running. Reporting the docked type while a *floating* panel was
    // minimised made one cycle look like two container changes; vdd reports what the panel
    // was, which is also where restoring puts it back.
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    await nextTick()
    ws.floatPanel('lc')
    await nextTick()
    log = []

    ws.minimizePanel('lc')
    await nextTick()
    expect(panelOf('lc').containerType.value).toBe('floating-window')
    ws.restorePanel('lc')
    await nextTick()
    expect(panelOf('lc').containerType.value).toBe('floating-window')

    expect(log.filter(e => e.startsWith('containerType:'))).toEqual([])
    // The minimise itself is observable, through the ref that actually describes it.
    expect(log).toContain('minimize:lc')
    expect(log).toContain('restore:lc')
  })

  it('containerType is dockable-panel at mount for a docked panel', async () => {
    const { ws, wrapper } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    await nextTick()
    expect(panelOf('lc').containerType.value).toBe('dockable-panel')
    expect(wrapper.get('#lc-lc').attributes('data-container-type')).toBe('dockable-panel')
  })

  it('isActive does not change when an unrelated panel gains focus', async () => {
    const { ws } = setup()
    ws.openPanel('lc', 'lifecycle', { title: 'LC' })
    ws.openPanel('lc2', 'lifecycle', { title: 'LC2' })
    ws.openPanel('lc3', 'lifecycle', { title: 'LC3' })
    await nextTick()
    ws.focusPanel('lc')
    await nextTick()
    log = []

    ws.focusPanel('lc2')
    await nextTick()
    log = []
    // lc is already inactive; a third panel taking focus must not touch it.
    ws.focusPanel('lc3')
    await nextTick()

    expect(log.filter(e => e.endsWith(':lc'))).toEqual([])
    expect(panelOf('lc').isActive.value).toBe(false)
  })
})

// ─── Standalone ──────────────────────────────────────────────────────────────

describe('usePanel outside a container', () => {
  it('reports a standalone panel and warns rather than throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      let panel!: UsePanelReturn
      const Bare = defineComponent({ setup() { panel = usePanel(); return () => h('div') } })
      const wrapper = mount(Bare) as VueWrapper
      mounted.push(wrapper)

      expect(panel.id).toBe('standalone')
      expect(panel.containerType.value).toBe('standalone')
      expect(panel.isActive.value).toBe(false)
      expect(panel.size.value).toBeNull()

      // The actions are no-ops with a diagnostic, so a panel component renders on its own —
      // in a test, or a storybook — without special-casing. rdd's default contract warned
      // for `requestClose` only and silently did nothing for the rest.
      panel.setTitle('x')
      panel.setDirty(true)
      panel.minimize()
      void panel.close()
      expect(warn.mock.calls.length).toBeGreaterThanOrEqual(4)
    } finally {
      warn.mockRestore()
    }
  })
})
