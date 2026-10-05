/**
 * Ready-made dialogs (1.8.0, from rdd 7.7.0): the confirmation's icon, `<VddAlert>`, and
 * `useModals().confirm()` / `.alert()`.
 *
 * The dismissal bug rdd 7.7.0 fixed never applied here — `<VddConfirm>` already settled on
 * unmount — but the same settle-once matrix runs against both dialogs so it stays that way.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddModals from '../../src/components/VddModals.vue'
import VddConfirm from '../../src/components/VddConfirm.vue'
import VddAlert from '../../src/components/VddAlert.vue'
import { useModals } from '../../src/composables/useOverlays'

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
})

let modals!: ReturnType<typeof useModals>
const Host = defineComponent({
  name: 'Host',
  setup() {
    modals = useModals()
    return () => h(VddModals)
  },
})

function setup() {
  const ws = createWorkspace({ panels: {} })
  const wrapper = mount(Host, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  return { ws, overlays: ws.overlays }
}

const settle = async () => {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null
const escape = async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await settle()
}

const CustomIcon = defineComponent({ name: 'CustomIcon', setup: () => () => h('i', { id: 'my-icon' }) })
const HeaderIcon = defineComponent({ name: 'HeaderIcon', setup: () => () => h('b', { id: 'header-icon' }) })

type Overlays = ReturnType<typeof setup>['overlays']
const dismissals: [string, (o: Overlays) => Promise<void> | void][] = [
  ['Escape', () => escape()],
  ['the backdrop', () => { q('[data-vdd-modal-curtain]')!.click() }],
  ['the ×', () => { q('[data-vdd-overlay-close]')!.click() }],
  ['closeAllModals', (o) => o.closeAllModals()],
  ['close(id)', (o) => o.close(o.state.modals[0]!.id)],
]

describe('<VddConfirm> settles exactly once', () => {
  for (const [name, dismiss] of dismissals) {
    it(`settles false when dismissed with ${name}, without calling onOk or onCancel`, async () => {
      const { overlays } = setup()
      const onSettled = vi.fn(), onOk = vi.fn(), onCancel = vi.fn()
      overlays.openModal(VddConfirm, { message: 'Proceed?', onSettled, onOk, onCancel })
      await settle()
      await dismiss(overlays)
      await settle()
      expect(q('[data-vdd-modal]')).toBeNull()
      expect(onSettled.mock.calls).toEqual([[false]])
      expect(onOk).not.toHaveBeenCalled()
      expect(onCancel).not.toHaveBeenCalled()
    })
  }

  it('settles true once on the confirm button', async () => {
    const { overlays } = setup()
    const onSettled = vi.fn()
    overlays.openModal(VddConfirm, { message: 'Proceed?', onSettled })
    await settle()
    q('[data-vdd-confirm-ok]')!.click()
    await settle()
    expect(onSettled.mock.calls).toEqual([[true]])
  })
})

describe('dialog icon', () => {
  it('<VddConfirm> draws the built-in question icon, coloured by alertType', async () => {
    const { overlays } = setup()
    overlays.openModal(VddConfirm, { message: 'Proceed?', alertType: 'warning' })
    await settle()
    const icon = q('.vdd-dialog-icon')!
    expect(icon.classList.contains('vdd-dialog-icon-warning')).toBe(true)
    expect(icon.getAttribute('data-vdd-dialog-icon')).toBe('default')
    expect(icon.querySelector('svg')).not.toBeNull()
  })

  it('icon: null draws no icon', async () => {
    const { overlays } = setup()
    overlays.openModal(VddConfirm, { message: 'Proceed?', icon: null })
    await settle()
    expect(q('.vdd-dialog-icon')).toBeNull()
    expect(q('.vdd-confirmation-message')!.textContent).toBe('Proceed?')
  })

  it('a custom icon replaces the built-in one, in the same slot', async () => {
    const { overlays } = setup()
    overlays.openModal(VddConfirm, { message: 'Proceed?', icon: CustomIcon, alertType: 'danger' })
    await settle()
    const icon = q('.vdd-dialog-icon')!
    expect(icon.querySelector('#my-icon')).not.toBeNull()
    expect(icon.querySelector('svg')).toBeNull()
    expect(icon.classList.contains('vdd-dialog-icon-danger')).toBe(true)
  })

  it('leaves ModalOptions.icon in the header alone', async () => {
    const { overlays } = setup()
    overlays.openModal(VddAlert, { message: 'Done' }, { icon: HeaderIcon })
    await settle()
    expect(q('.vdd-modal-icon #header-icon')).not.toBeNull()
  })

  it('<VddAlert> draws the icon of its type, not the question mark', async () => {
    const { overlays } = setup()
    overlays.openModal(VddConfirm, { message: 'Proceed?', alertType: 'success' })
    await settle()
    const question = q('.vdd-dialog-icon svg')!.innerHTML
    overlays.closeAllModals()
    await settle()
    overlays.openModal(VddAlert, { message: 'Saved', alertType: 'success' })
    await settle()
    const icon = q('.vdd-dialog-icon')!
    expect(icon.classList.contains('vdd-dialog-icon-success')).toBe(true)
    expect(icon.querySelector('svg')!.innerHTML).not.toBe(question)
  })
})

describe('<VddAlert>', () => {
  it('shows one OK button, focused, with the data hook', async () => {
    const { overlays } = setup()
    overlays.openModal(VddAlert, { message: 'Done' })
    await settle()
    expect(document.querySelectorAll('.vdd-modal-body button')).toHaveLength(1)
    expect(document.activeElement).toBe(q('[data-vdd-alert-ok]'))
    expect(q('[data-vdd-alert-ok]')!.textContent!.trim()).toBe('OK')
  })

  it('okLabel replaces the button label', async () => {
    const { overlays } = setup()
    overlays.openModal(VddAlert, { message: 'Done', okLabel: 'Got it' })
    await settle()
    expect(q('[data-vdd-alert-ok]')!.textContent!.trim()).toBe('Got it')
  })

  it('settles once on OK', async () => {
    const { overlays } = setup()
    const onSettled = vi.fn()
    overlays.openModal(VddAlert, { message: 'Done', onSettled })
    await settle()
    q('[data-vdd-alert-ok]')!.click()
    await settle()
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(q('[data-vdd-modal]')).toBeNull()
  })

  for (const [name, dismiss] of dismissals) {
    it(`settles once when dismissed with ${name}`, async () => {
      const { overlays } = setup()
      const onSettled = vi.fn()
      overlays.openModal(VddAlert, { message: 'Done', onSettled })
      await settle()
      await dismiss(overlays)
      await settle()
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(q('[data-vdd-modal]')).toBeNull()
    })
  }

  it('with closable: false, Escape and the backdrop do not close it; OK does', async () => {
    const { overlays } = setup()
    const onSettled = vi.fn()
    overlays.openModal(VddAlert, { message: 'Done', onSettled }, { closable: false })
    await settle()
    await escape()
    q('[data-vdd-modal-curtain]')!.click()
    await settle()
    expect(q('[data-vdd-modal]')).not.toBeNull()
    expect(onSettled).not.toHaveBeenCalled()
    q('[data-vdd-alert-ok]')!.click()
    await settle()
    expect(onSettled).toHaveBeenCalledTimes(1)
  })
})

describe('useModals().confirm / alert', () => {
  it('confirm resolves true on the confirm button, titled and sized by default', async () => {
    setup()
    const p = modals.confirm({ message: 'Delete?', yesNo: true })
    await settle()
    expect(q('[data-vdd-confirm-ok]')!.textContent!.trim()).toBe('Yes')
    expect(q('.vdd-modal-title')!.textContent).toBe('Confirmation')
    expect(q('.vdd-modal-size-small')).not.toBeNull()
    q('[data-vdd-confirm-ok]')!.click()
    await expect(p).resolves.toBe(true)
  })

  it('confirm resolves false on cancel and on dismissal', async () => {
    setup()
    const p1 = modals.confirm({ message: 'Delete?' })
    await settle()
    q('[data-vdd-confirm-cancel]')!.click()
    await expect(p1).resolves.toBe(false)
    await settle()
    const p2 = modals.confirm({ message: 'Delete?', title: 'Sure?' })
    await settle()
    expect(q('.vdd-modal-title')!.textContent).toBe('Sure?')
    await escape()
    await expect(p2).resolves.toBe(false)
  })

  it('alert resolves on OK and on dismissal, titled "Information" by default', async () => {
    setup()
    const p1 = modals.alert({ message: 'Saved', alertType: 'success' })
    await settle()
    expect(q('.vdd-modal-title')!.textContent).toBe('Information')
    expect(q('.vdd-modal-size-small')).not.toBeNull()
    expect(q('.vdd-dialog-icon-success')).not.toBeNull()
    q('[data-vdd-alert-ok]')!.click()
    await expect(p1).resolves.toBeUndefined()
    await settle()
    const p2 = modals.alert({ message: 'Saved', icon: null })
    await settle()
    expect(q('.vdd-dialog-icon')).toBeNull()
    q('[data-vdd-overlay-close]')!.click()
    await expect(p2).resolves.toBeUndefined()
  })
})
