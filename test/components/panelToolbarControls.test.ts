/**
 * The panel-toolbar controls: button, toggle, separator, spacer, item, centre, search.
 *
 * These had **no jsdom coverage at all** until M13's non-vacuity sweep said so — they were
 * exercised only by the browser tour, which proves their CSS applies but not what they do.
 * The toggle's model, the button's disabled state and the search's abort behaviour are all
 * logic, and logic belongs here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddToolbarButton from '../../src/components/VddToolbarButton.vue'
import VddToolbarToggle from '../../src/components/VddToolbarToggle.vue'
import VddToolbarSeparator from '../../src/components/VddToolbarSeparator.vue'
import VddToolbarSpacer from '../../src/components/VddToolbarSpacer.vue'
import VddToolbarItem from '../../src/components/VddToolbarItem.vue'
import VddToolbarCenter from '../../src/components/VddToolbarCenter.vue'
import VddToolbarSearch from '../../src/components/VddToolbarSearch.vue'
import type { SearchResult } from '../../src/components/VddToolbarSearch.vue'

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('[data-vdd-search-results]').forEach(el => el.remove())
  document.body.innerHTML = ''
  vi.useRealTimers()
})

const keep = <T extends VueWrapper>(w: T): T => { mounted.push(w); return w }
const ws = () => createWorkspace({ panels: {} })

// ─── button ──────────────────────────────────────────────────────────────────

describe('VddToolbarButton', () => {
  it('renders its slot, its accessible name, and emits click', async () => {
    const wrapper = keep(mount(VddToolbarButton, {
      props: { title: 'Zoom to fit' },
      slots: { default: () => h('span', 'icon') },
    }) as VueWrapper)
    const button = wrapper.get('button')
    expect(button.classes()).toContain('vdd-panel-toolbar-btn')
    expect(button.attributes('title')).toBe('Zoom to fit')
    expect(button.attributes('aria-label')).toBe('Zoom to fit')
    expect(button.text()).toBe('icon')

    await button.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('does not emit when disabled', async () => {
    const wrapper = keep(mount(VddToolbarButton, { props: { title: 'X', disabled: true } }) as VueWrapper)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('carries its own variant when given one, and none when not', () => {
    expect(keep(mount(VddToolbarButton, { props: { variant: 'filled' } }) as VueWrapper)
      .get('button').attributes('data-variant')).toBe('filled')
    // Absent rather than empty: the toolbar's own `data-btn-variant` is what should win.
    expect(keep(mount(VddToolbarButton, {}) as VueWrapper)
      .get('button').attributes('data-variant')).toBeUndefined()
  })
})

// ─── toggle ──────────────────────────────────────────────────────────────────

describe('VddToolbarToggle', () => {
  it('reflects and reports its model, and sets aria-pressed', async () => {
    // rdd took `active` plus `onToggle` and left flipping it to the caller; the model is both
    // halves, and still controllable by binding it without a listener.
    const wrapper = keep(mount(VddToolbarToggle, { props: { title: 'Grid', active: false } }) as VueWrapper)
    const button = wrapper.get('button')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.classes()).not.toContain('vdd-panel-toolbar-btn--active')

    await button.trigger('click')
    expect(wrapper.emitted('update:active')).toEqual([[true]])

    await wrapper.setProps({ active: true })
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.classes()).toContain('vdd-panel-toolbar-btn--active')

    await button.trigger('click')
    expect(wrapper.emitted('update:active')!.at(-1)).toEqual([false])
  })

  it('does not report when disabled', async () => {
    const wrapper = keep(mount(VddToolbarToggle, { props: { disabled: true, active: false } }) as VueWrapper)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:active')).toBeUndefined()
  })
})

// ─── the layout pieces ───────────────────────────────────────────────────────

describe('the toolbar layout pieces', () => {
  it.each([
    [VddToolbarSeparator, 'vdd-panel-toolbar__sep'],
    [VddToolbarSpacer, 'vdd-panel-toolbar__spacer'],
  ])('renders its own class and is hidden from assistive tech', (component, expected) => {
    const wrapper = keep(mount(component) as VueWrapper)
    expect(wrapper.classes()).toContain(expected)
    // Decorative: a separator or a spacer announced to a screen reader is noise.
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it.each([
    [VddToolbarItem, 'vdd-panel-toolbar__item'],
    [VddToolbarCenter, 'vdd-panel-toolbar__center'],
  ])('wraps its slot without announcing itself', (component, expected) => {
    const wrapper = keep(mount(component, { slots: { default: () => h('span', 'content') } }) as VueWrapper)
    expect(wrapper.classes()).toContain(expected)
    expect(wrapper.text()).toBe('content')
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })
})

// ─── search ──────────────────────────────────────────────────────────────────

describe('VddToolbarSearch', () => {
  const setup = (search: (q: string, signal: AbortSignal) => SearchResult[] | Promise<SearchResult[]>) => {
    const workspace = ws()
    const wrapper = keep(mount(VddToolbarSearch, {
      props: { search } as never,
      global: { plugins: [workspace] },
      attachTo: document.body,
    }) as VueWrapper)
    return wrapper
  }

  const results = () => Array.from(document.querySelectorAll('[data-vdd-search-result]'))

  it('starts collapsed and expands into an input', async () => {
    const wrapper = setup(() => [])
    expect(wrapper.find('[data-vdd-search-input]').exists()).toBe(false)
    await wrapper.get('[data-vdd-search-toggle]').trigger('click')
    expect(wrapper.find('[data-vdd-search-input]').exists()).toBe(true)
  })

  it('debounces, then shows grouped results teleported out of the toolbar', async () => {
    vi.useFakeTimers()
    const search = vi.fn(() => [
      { id: 'a', label: 'Alpha', description: 'first', group: 'Layers' },
      { id: 'b', label: 'Beta', group: 'Layers' },
    ])
    const wrapper = setup(search)
    await wrapper.get('[data-vdd-search-toggle]').trigger('click')
    await wrapper.get('[data-vdd-search-input]').setValue('al')

    // Not yet: the field waits before asking, so typing does not fire a request per keystroke.
    expect(search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(400)
    await nextTick()
    expect(search).toHaveBeenCalledTimes(1)
    expect(results()).toHaveLength(2)
    // Teleported, so the toolbar's own bounds cannot clip it.
    expect(document.querySelector('[data-vdd-search-results]')!.parentElement).toBe(document.body)
    expect(document.querySelector('.vdd-panel-toolbar-search__group')!.textContent).toBe('Layers')
  })

  it('emits select and collapses when a result is chosen', async () => {
    vi.useFakeTimers()
    const wrapper = setup(() => [{ id: 'a', label: 'Alpha' }])
    await wrapper.get('[data-vdd-search-toggle]').trigger('click')
    await wrapper.get('[data-vdd-search-input]').setValue('al')
    await vi.advanceTimersByTimeAsync(400)
    await nextTick()

    ;(results()[0] as HTMLElement).click()
    await nextTick()
    expect(wrapper.emitted('select')).toEqual([[{ id: 'a', label: 'Alpha' }]])
    expect(wrapper.find('[data-vdd-search-input]').exists()).toBe(false)
    expect(results()).toHaveLength(0)
  })

  it('an emptied query clears the results without asking again', async () => {
    vi.useFakeTimers()
    const search = vi.fn(() => [{ id: 'a', label: 'Alpha' }])
    const wrapper = setup(search)
    await wrapper.get('[data-vdd-search-toggle]').trigger('click')
    await wrapper.get('[data-vdd-search-input]').setValue('al')
    await vi.advanceTimersByTimeAsync(400)
    await nextTick()
    expect(results()).toHaveLength(1)

    await wrapper.get('[data-vdd-search-input]').setValue('   ')
    await vi.advanceTimersByTimeAsync(400)
    await nextTick()
    expect(results()).toHaveLength(0)
    expect(search).toHaveBeenCalledTimes(1)      // whitespace is not a query
  })

  it('aborts a superseded request and discards its result', async () => {
    vi.useFakeTimers()
    // The stale-result race: a slow request for an earlier query must not overwrite a fast
    // one for a later query. The signal is in the signature so a caller can honour it, and
    // the component discards a resolved-but-aborted result as well — an abort cannot retract
    // a promise that has already settled.
    const signals: AbortSignal[] = []
    const search = (query: string, signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<SearchResult[]>((resolve) => {
        setTimeout(() => resolve([{ id: query, label: query }]), query === 'slow' ? 500 : 10)
      })
    }
    const wrapper = setup(search)
    await wrapper.get('[data-vdd-search-toggle]').trigger('click')

    await wrapper.get('[data-vdd-search-input]').setValue('slow')
    await vi.advanceTimersByTimeAsync(350)       // the request is now in flight
    await wrapper.get('[data-vdd-search-input]').setValue('fast')
    await vi.advanceTimersByTimeAsync(350)
    await nextTick()

    expect(signals).toHaveLength(2)
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)

    // Let the slow one land. It must not replace the fast one's result.
    await vi.advanceTimersByTimeAsync(500)
    await nextTick()
    expect(results().map(el => el.getAttribute('data-vdd-search-result'))).toEqual(['fast'])
  })

  it('Escape collapses the field', async () => {
    const wrapper = setup(() => [])
    await wrapper.get('[data-vdd-search-toggle]').trigger('click')
    await wrapper.get('[data-vdd-search-input]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-vdd-search-input]').exists()).toBe(false)
  })

  it('a rejected search shows nothing rather than surfacing the error', async () => {
    vi.useFakeTimers()
    const wrapper = setup(() => Promise.reject(new Error('network')))
    await wrapper.get('[data-vdd-search-toggle]').trigger('click')
    await wrapper.get('[data-vdd-search-input]').setValue('x')
    await vi.advanceTimersByTimeAsync(400)
    await nextTick()
    expect(results()).toHaveLength(0)
  })
})
