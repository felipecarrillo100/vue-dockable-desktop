/**
 * The class-name and stacking hookups the stylesheet depends on.
 *
 * A port of rdd's `StyleHookups.test.tsx` (7 declarations, 12 tests with its two `it.each`
 * blocks; names preserved). Every case here covers a rule in `index.css` that **silently
 * matched nothing**, because the class the component rendered was not the class the selector
 * named — the `rdd-` prefix rename reached the stylesheet but not the JSX — or because an
 * inline `z-index` overrode the rule that reads the stacking variable.
 *
 * These assert the *rendered contract* — which class is emitted, and that no inline z-index
 * is set — rather than computed styles. jsdom loads no stylesheet, so a computed-style
 * assertion would pass no matter which class was emitted, which is exactly how the original
 * breakage went unnoticed through a whole release. The complementary check — that the rule
 * actually applies on screen — is in `scripts/gates/browser/m13.mjs`.
 *
 * The third stacking test changed shape and says so at the test: rdd asserted that a
 * caller-supplied inline `z-index` still won, which is the thing that had defeated
 * `zIndexBase` in the first place. vdd asserts the replacement instead — that `zIndexBase`
 * moves the chrome — which is the outcome the inline override was breaking.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import VddContextMenu from '../../src/components/VddContextMenu.vue'
import VddModals from '../../src/components/VddModals.vue'
import VddConfirm from '../../src/components/VddConfirm.vue'

const Panel = defineComponent({ name: 'MockPanel', setup: () => () => h('div') })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount, [data-vdd-menu]').forEach(el => el.remove())
  document.documentElement.style.removeProperty('--vdd-z-base')
  document.body.innerHTML = ''
  vi.useRealTimers()
})

// ─── the taskbar mode class ──────────────────────────────────────────────────
// index.css keys autohide's overlay and peek-strip rules off
// `.vdd-taskbar-footer-container.vdd-taskbar-mode-autohide`, so an unprefixed
// `taskbar-mode-autohide` left the whole mode rendering as a plain always-on bar.

describe('the taskbar mode class', () => {
  /**
   * `compact` and `autohide` mount the bar only once something is minimised, so a minimised
   * panel is what makes the bar observable in every mode rather than only in `always`.
   */
  const withMinimised = async (taskbar: 'always' | 'compact' | 'autohide') => {
    const ws = createWorkspace({ panels: { map: { component: Panel } } })
    const wrapper = mount(VddDesktop, {
      props: { taskbar },
      global: { plugins: [ws] },
      attachTo: document.body,
    }) as VueWrapper
    mounted.push(wrapper)
    ws.openPanel('map-1', 'map')
    ws.minimizePanel('map-1')
    await nextTick()
    return wrapper.find('.vdd-taskbar-footer-container')
  }

  it.each(['always', 'compact', 'autohide'] as const)(
    'renders the vdd- prefixed mode class for %s',
    async (mode) => {
      const bar = await withMinimised(mode)
      expect(bar.exists()).toBe(true)
      expect(bar.classes()).toContain(`vdd-taskbar-mode-${mode}`)
      // The unprefixed name is what the stylesheet does *not* match.
      expect(bar.classes()).not.toContain(`taskbar-mode-${mode}`)
    },
  )

  it('pairs the mode class with the container class the autohide rules require', async () => {
    // The selector is `.vdd-taskbar-footer-container.vdd-taskbar-mode-autohide`; either half
    // alone matches nothing, so both have to be on the same element.
    const bar = await withMinimised('autohide')
    expect(bar.exists()).toBe(true)
    expect(bar.classes()).toContain('vdd-taskbar-footer-container')
    expect(bar.classes()).toContain('vdd-taskbar-mode-autohide')
  })
})

// ─── the confirmation alert class ────────────────────────────────────────────
// index.css defines .vdd-confirmation-alert-danger/-info/-warning/-success. The unprefixed
// `confirmation-alert-${type}` matched none of them, so every alert banner rendered with base
// styling only — including the library's own unsaved-changes dialogs, which pass 'danger'.

describe('the confirmation alert class', () => {
  const withAlert = (props: Record<string, unknown>) => {
    const ws = createWorkspace({ panels: {} })
    const wrapper = mount(VddConfirm, {
      props: { message: 'Discard?', ...props } as never,
      global: { plugins: [ws] },
      attachTo: document.body,
    }) as VueWrapper
    mounted.push(wrapper)
    return wrapper
  }

  it.each(['info', 'warning', 'success', 'danger'] as const)(
    'renders the vdd- prefixed alert class for %s',
    (alertType) => {
      const wrapper = withAlert({ alert: 'Two fields are empty.', alertType })
      const banner = wrapper.find('.vdd-confirmation-alert')
      expect(banner.exists()).toBe(true)
      expect(banner.classes()).toContain(`vdd-confirmation-alert-${alertType}`)
      expect(banner.classes()).not.toContain(`confirmation-alert-${alertType}`)
    },
  )

  it('renders no banner when `alert` is omitted', () => {
    const wrapper = withAlert({ alertType: 'danger' })
    expect(wrapper.find('.vdd-confirmation-alert').exists()).toBe(false)
  })
})

// ─── context-menu stacking ───────────────────────────────────────────────────
// .vdd-context-menu and .vdd-context-menu--submenu carry
// `calc(var(--vdd-z-base, 1000) + 8500/8501)`, which an inline z-index silently overrode —
// so `zIndexBase` never moved the menu.

describe('context-menu stacking', () => {
  const showMenu = async (items: unknown[], zIndexBase?: number) => {
    const ws = createWorkspace({ panels: {}, ...(zIndexBase ? { zIndexBase } : {}) })
    const wrapper = mount(VddContextMenu, {
      global: { plugins: [ws] },
      attachTo: document.body,
    }) as VueWrapper
    mounted.push(wrapper)
    ws.showContextMenu({ x: 40, y: 60, items: items as never })
    await nextTick()
    return { ws, wrapper }
  }

  it('leaves the main menu z-index to the stylesheet', async () => {
    await showMenu([{ label: 'Float Window', action: () => {} }])
    const menu = document.querySelector('[data-vdd-menu]') as HTMLElement
    expect(menu).not.toBeNull()
    expect(menu.style.zIndex).toBe('')
    // Positioning stays inline — only stacking moved to CSS.
    expect(menu.style.position).toBe('fixed')
  })

  it('leaves the submenu z-index to the stylesheet', async () => {
    vi.useFakeTimers()
    await showMenu([{ label: 'More', items: [{ label: 'Nested', action: () => {} }] }])

    const parent = document.querySelector('.vdd-context-menu__item--has-submenu') as HTMLElement
    expect(parent).not.toBeNull()
    parent.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    vi.advanceTimersByTime(200)   // past the 150ms submenu open delay
    await nextTick()

    const submenu = document.querySelector('.vdd-context-menu--submenu') as HTMLElement
    expect(submenu).not.toBeNull()
    expect(submenu.style.zIndex).toBe('')
  })

  it('zIndexBase moves the chrome, which is what the inline z-index used to defeat', async () => {
    // rdd's third case asserted that a caller's inline z-index still won. That override is
    // precisely what made `zIndexBase` do nothing, so vdd asserts the replacement: the base
    // reaches the document element as a custom property, and the stylesheet's calc() picks
    // it up. Nothing here sets a z-index inline, so there is nothing to defeat it.
    const ws = createWorkspace({ panels: { map: { component: Panel } }, zIndexBase: 4200 })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    await nextTick()

    expect(document.documentElement.style.getPropertyValue('--vdd-z-base')).toBe('4200')
    expect(ws.config.zIndexBase).toBe(4200)
  })

  it('a modal stacks against the variable rather than a literal', async () => {
    const ws = createWorkspace({ panels: {}, zIndexBase: 4200 })
    const wrapper = mount(VddModals, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    ws.overlays.openModal(Panel, {}, { title: 'M' })
    await nextTick()
    const overlay = wrapper.get('.vdd-modal-overlay').element as HTMLElement
    // A literal would be frozen at build time; the calc() follows the base.
    expect(overlay.style.zIndex).toContain('var(--vdd-z-base')
  })

  it('the base is removed from the document element when the workspace unmounts', async () => {
    const ws = createWorkspace({ panels: {}, zIndexBase: 7777 })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    await nextTick()
    expect(document.documentElement.style.getPropertyValue('--vdd-z-base')).toBe('7777')

    wrapper.unmount()
    // Left behind, it would shift a second workspace — or the host page's own chrome.
    expect(document.documentElement.style.getPropertyValue('--vdd-z-base')).toBe('')
  })
})
