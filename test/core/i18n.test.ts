/**
 * Internationalisation: the message formatter, the built-in string table, reading direction,
 * and the consumer classes for the library's chrome.
 *
 * A port of rdd's `Internationalization.test.tsx` (21 tests, names preserved). The surface
 * collapsed on the way over, which is most of what this file records:
 *
 *   rdd                             vdd
 *   ─────────────────────────────   ──────────────────────────────────────────────────
 *   `useFormatMessage()`            `workspace.format()` — works outside components
 *   `formatLabel(label, fmt)`       still exported; `format()` is it, bound
 *   `usePredefinedMessages()`       `workspace.messages`
 *   `predefinedMessages` prop       `createWorkspace({ messages })`
 *   `useStyleClasses()`             `createWorkspace({ classes })`
 *   `useWindowManagerState().dir`   `workspace.dir` / `isRtl`, refs
 *
 * The `classes` tests are **stronger** than rdd's, and deliberately. rdd's three asserted
 * only that its hook returned the config it was given — which is true of any object and
 * cannot fail. These assert the classes reach the rendered elements, which is the part that
 * breaks: the library has already shipped four CSS hookups that matched nothing (D9, D12).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import { defaultMessages, formatLabel } from '../../src/core/messages'
import VddModals from '../../src/components/VddModals.vue'
import VddSidePanels from '../../src/components/VddSidePanels.vue'
import VddDesktop from '../../src/components/VddDesktop.vue'

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount').forEach(el => el.remove())
  document.body.innerHTML = ''
})

const Inner = defineComponent({ name: 'InnerContent', setup: () => () => h('div', 'body') })

// ─── formatLabel ─────────────────────────────────────────────────────────────

describe('formatLabel helper', () => {
  it('returns a plain string unchanged', () => {
    expect(formatLabel('Close')).toBe('Close')
  })

  it('resolves an i18n descriptor through the formatter', () => {
    const fmt = (m: { id: string }) => `translated:${m.id}`
    expect(formatLabel({ id: 'vdd.closeTab', defaultMessage: 'Close Tab' }, fmt)).toBe('translated:vdd.closeTab')
  })

  it('returns an empty string for an undefined label', () => {
    expect(formatLabel(undefined)).toBe('')
  })
})

// ─── direction ───────────────────────────────────────────────────────────────

describe('default direction', () => {
  it('should default to ltr direction', () => {
    const ws = createWorkspace({ panels: {} })
    expect(ws.state.dir).toBe('ltr')
    expect(ws.state.isRtl).toBe(false)
    expect(ws.dir.value).toBe('ltr')
  })

  it('should initialise with rtl when the dir option is rtl', () => {
    const ws = createWorkspace({ panels: {}, dir: 'rtl' })
    expect(ws.state.dir).toBe('rtl')
    expect(ws.state.isRtl).toBe(true)
  })
})

describe('setDirection', () => {
  it('setDirection("rtl") switches state to RTL', () => {
    const ws = createWorkspace({ panels: {} })
    ws.setDirection('rtl')
    expect(ws.state.dir).toBe('rtl')
    expect(ws.state.isRtl).toBe(true)
  })

  it('setDirection("ltr") switches back from RTL', () => {
    const ws = createWorkspace({ panels: {}, dir: 'rtl' })
    ws.setDirection('ltr')
    expect(ws.state.dir).toBe('ltr')
    expect(ws.state.isRtl).toBe(false)
  })

  it('setDirection is idempotent (no state churn when the value is the same)', async () => {
    const ws = createWorkspace({ panels: {} })
    let notifications = 0
    const Probe = defineComponent({
      setup() { return () => { notifications++; return h('div', ws.dir.value) } },
    })
    const wrapper = mount(Probe, { global: { plugins: [ws] } }) as VueWrapper
    mounted.push(wrapper)
    await nextTick()
    const before = notifications

    ws.setDirection('ltr')          // already ltr
    ws.setDirection('ltr')
    await nextTick()
    expect(notifications).toBe(before)

    ws.setDirection('rtl')          // a real change does notify
    await nextTick()
    expect(notifications).toBeGreaterThan(before)
  })
})

// ─── the default formatter ───────────────────────────────────────────────────

describe('default formatter (fallback)', () => {
  it('format is a callable function on the workspace', () => {
    // rdd needed `useFormatMessage()`, so formatting was only possible inside a component.
    // This works from a service, which is where a message often needs resolving.
    const ws = createWorkspace({ panels: {} })
    expect(typeof ws.format).toBe('function')
  })

  it('returns defaultMessage when one is provided', () => {
    const ws = createWorkspace({ panels: {} })
    expect(ws.format({ id: 'x.y', defaultMessage: 'Hello' })).toBe('Hello')
  })

  it('returns the id when there is no defaultMessage', () => {
    const ws = createWorkspace({ panels: {} })
    expect(ws.format({ id: 'x.y' })).toBe('x.y')
  })

  it('interpolates {placeholder} values', () => {
    const ws = createWorkspace({ panels: {} })
    expect(ws.format({ id: 'x', defaultMessage: 'Close {title} now', values: { title: 'Map' } }))
      .toBe('Close Map now')
  })
})

describe('a custom formatMessage', () => {
  it('is used instead of the default', () => {
    const ws = createWorkspace({
      panels: {},
      formatMessage: (m) => `[${m.id}]`,
    })
    expect(ws.format({ id: 'vdd.closeTab', defaultMessage: 'Close Tab' })).toBe('[vdd.closeTab]')
    // A plain string is not a descriptor, so it never reaches the formatter.
    expect(ws.format('literal')).toBe('literal')
  })
})

// ─── the built-in message table ──────────────────────────────────────────────

describe('the built-in messages', () => {
  it('is a non-empty object', () => {
    const ws = createWorkspace({ panels: {} })
    expect(typeof ws.messages).toBe('object')
    expect(Object.keys(ws.messages).length).toBeGreaterThan(0)
  })

  it('contains the expected built-in keys', () => {
    const ws = createWorkspace({ panels: {} })
    for (const key of ['closeTab', 'minimizePanel', 'floatWindow', 'unsavedChangesMessage']) {
      expect(ws.messages).toHaveProperty(key)
    }
  })

  it('allows overriding one message through the messages option', () => {
    const ws = createWorkspace({
      panels: {},
      messages: { closeTab: { id: 'custom.closeTab', defaultMessage: 'Dismiss' } },
    })
    expect(ws.messages.closeTab).toEqual({ id: 'custom.closeTab', defaultMessage: 'Dismiss' })
  })

  it('a partial override preserves every key it did not name', () => {
    const ws = createWorkspace({
      panels: {},
      messages: { closeTab: { id: 'custom.closeTab', defaultMessage: 'Dismiss' } },
    })
    expect(ws.messages.minimizePanel).toBeDefined()
    expect(typeof ws.messages.minimizePanel.id).toBe('string')
    // Every default key survives, not just the one asserted above.
    for (const key of Object.keys(defaultMessages)) expect(ws.messages).toHaveProperty(key)
  })

  it('unsavedChangesMessage carries a {title} placeholder by default', () => {
    const ws = createWorkspace({ panels: {} })
    const message = ws.messages.unsavedChangesMessage
    expect(message.defaultMessage ?? message.id).toContain('{title}')
  })

  it('every default message id is namespaced, so an app message table cannot collide', () => {
    for (const [key, message] of Object.entries(defaultMessages)) {
      expect(message.id, key).toMatch(/^vdd\./)
    }
  })
})

// ─── consumer classes for the library's chrome ───────────────────────────────

describe('the classes option', () => {
  it('returns every field, empty, when nothing is configured', () => {
    const ws = createWorkspace({ panels: {} })
    expect(ws.classes).toEqual({
      modal: '', modalBody: '', sidePanel: '', sidePanelBody: '', window: '', windowBody: '',
    })
  })

  it('a configured modal class reaches the rendered modal', async () => {
    // rdd's equivalent asserted only that its hook returned the config — which is true of any
    // object and cannot fail. What breaks is the hookup, so that is what is asserted.
    const ws = createWorkspace({ panels: {}, classes: { modal: 'mui-Paper', modalBody: 'p-4' } })
    const wrapper = mount(VddModals, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)

    ws.overlays.openModal(Inner, {}, { title: 'Titled' })
    await nextTick()
    expect(wrapper.get('.vdd-modal-window').classes()).toContain('mui-Paper')
    expect(wrapper.get('.vdd-modal-body').classes()).toContain('p-4')
  })

  it('every configured class reaches its own element', async () => {
    const ws = createWorkspace({
      panels: { p: { component: Inner } },
      classes: {
        modal: 'c-modal', modalBody: 'c-modal-body',
        sidePanel: 'c-side', sidePanelBody: 'c-side-body',
        window: 'c-window', windowBody: 'c-window-body',
      },
    })
    const wrapper = mount(defineComponent({
      components: { VddDesktop, VddModals, VddSidePanels },
      template: '<div><VddDesktop /><VddSidePanels /><VddModals /></div>',
    }), { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)

    ws.overlays.openModal(Inner, {}, { title: 'M' })
    await ws.overlays.openLeftPanel(Inner, {}, { title: 'S' })
    ws.openPanel('p', 'p')
    ws.floatPanel('p')
    await nextTick()

    expect(wrapper.get('.vdd-modal-window').classes()).toContain('c-modal')
    expect(wrapper.get('.vdd-modal-body').classes()).toContain('c-modal-body')
    expect(wrapper.get('.vdd-side-panel-window').classes()).toContain('c-side')
    expect(wrapper.get('.vdd-side-panel-body').classes()).toContain('c-side-body')
    expect(wrapper.get('.vdd-floating-window').classes()).toContain('c-window')
    expect(wrapper.get('.vdd-floating-window-body').classes()).toContain('c-window-body')
  })

  it('adds to the library\'s own classes rather than replacing them', async () => {
    const ws = createWorkspace({ panels: {}, classes: { modal: 'mine' } })
    const wrapper = mount(VddModals, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    ws.overlays.openModal(Inner, {}, { title: 'M', size: 'small' })
    await nextTick()
    const classes = wrapper.get('.vdd-modal-window').classes()
    expect(classes).toContain('mine')
    expect(classes).toContain('vdd-modal-window')
    expect(classes).toContain('vdd-modal-size-small')
  })
})
