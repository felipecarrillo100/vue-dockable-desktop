/**
 * Accessible names that were hard-coded English.
 *
 * The toast region ("Notifications"), a toast's close button ("Close notification") and a
 * sidebar drawer's close button ("Close") never went through the message table, so an
 * application's translations and formatter could not reach them. They do now. None of these
 * components needs a workspace — toasts work from anywhere, and a sidebar can stand alone —
 * so without one they fall back to English.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddToasts from '../../src/components/VddToasts.vue'
import VddSidebar from '../../src/components/VddSidebar.vue'
import { toast, resetToasts } from '../../src/core/toast'
import type { MessageDescriptor } from '../../src/types'

const Icon = defineComponent({ name: 'Icon', setup: () => () => h('svg') })
const Pane = defineComponent({ name: 'Pane', setup: () => () => h('div', 'pane') })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  resetToasts()
  document.body.innerHTML = ''
})

const keep = (w: VueWrapper) => { mounted.push(w); return w }
const region = () => document.querySelector('[data-vdd-toasts]')!
const toastClose = () => document.querySelector('.vdd-toast [aria-label]')!
const drawerClose = () => document.querySelector('[data-vdd-sidebar-close]')!

const sidebarProps = {
  tabs: [{ id: 'a', label: 'A', icon: Icon, component: Pane }],
  activeTabId: 'a',
  showCloseButton: true,
}

describe('without a workspace, the names are English', () => {
  it('toasts', async () => {
    keep(mount(VddToasts, { attachTo: document.body }) as VueWrapper)
    toast.info('hello')
    await nextTick()
    expect(region().getAttribute('aria-label')).toBe('Notifications')
    expect(toastClose().getAttribute('aria-label')).toBe('Close notification')
  })

  it('the sidebar drawer', () => {
    keep(mount(VddSidebar, { props: sidebarProps as never, attachTo: document.body }) as VueWrapper)
    expect(drawerClose().getAttribute('aria-label')).toBe('Close')
    expect(drawerClose().getAttribute('title')).toBe('Close')
  })
})

describe('with a workspace, they go through its message table and formatter', () => {
  const messages: Record<string, MessageDescriptor> = {
    notifications: { id: 'vdd.notifications', defaultMessage: 'Avisos' },
    closeNotification: { id: 'vdd.closeNotification', defaultMessage: 'Cerrar aviso' },
    close: { id: 'vdd.close', defaultMessage: 'Cerrar' },
  }

  it('overridden messages reach the toast region, the toast close and the drawer close', async () => {
    const ws = createWorkspace({ panels: {}, messages })
    keep(mount(VddToasts, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper)
    keep(mount(VddSidebar, { props: sidebarProps as never, global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper)
    toast.info('hola')
    await nextTick()
    expect(region().getAttribute('aria-label')).toBe('Avisos')
    expect(toastClose().getAttribute('aria-label')).toBe('Cerrar aviso')
    expect(drawerClose().getAttribute('aria-label')).toBe('Cerrar')
  })

  it('a formatter change is followed', async () => {
    const locale = ref<'en' | 'nl'>('en')
    const nl: Record<string, string> = { 'vdd.notifications': 'Meldingen', 'vdd.close': 'Sluiten' }
    const ws = createWorkspace({
      panels: {},
      formatMessage: (d) => (locale.value === 'nl' ? nl[d.id] : undefined) ?? d.defaultMessage ?? d.id,
    })
    keep(mount(VddToasts, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper)
    keep(mount(VddSidebar, { props: sidebarProps as never, global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper)
    expect(region().getAttribute('aria-label')).toBe('Notifications')

    locale.value = 'nl'
    await nextTick()
    expect(region().getAttribute('aria-label')).toBe('Meldingen')
    expect(drawerClose().getAttribute('aria-label')).toBe('Sluiten')
  })
})
