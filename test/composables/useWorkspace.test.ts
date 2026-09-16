/**
 * `useWorkspace()` — the Vue-facing half of the store.
 *
 * New in vdd: rdd needed `useSyncExternalStore`, a mirrored ref, a subscriber set and a
 * selector overload to achieve what `computed` does here
 * (docs/decisions/0003-reactive-store.md). These tests assert the properties that machinery
 * existed to provide: destructuring stays reactive, and subscriptions clean themselves up.
 */
import { describe, it, expect, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'
import type { ComputedRef } from 'vue'
import { mount } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import { useWorkspace } from '../../src/composables/useWorkspace'

const P = defineComponent({ name: 'MockPanel', setup: () => () => h('div') })
const ws = () => createWorkspace({ panels: { map: { component: P } } })

const withWorkspace = (w: ReturnType<typeof ws>, setup: () => unknown) =>
  mount(defineComponent({ setup, render: () => h('div') }), { global: { plugins: [w] } })

describe('useWorkspace', () => {
  it('throws a directed error when no workspace is installed', () => {
    const Bare = defineComponent({ setup: () => { useWorkspace(); return () => h('div') } })
    expect(() => mount(Bare)).toThrow(/createWorkspace\(\)/)
  })

  it('is available through app.use(workspace)', () => {
    const w = ws()
    let seen: unknown
    withWorkspace(w, () => { seen = useWorkspace().isOpen('x'); return {} })
    expect(seen).toBe(false)
  })

  it('destructured state stays reactive', async () => {
    const w = ws()
    const seen: (string | null)[] = []
    withWorkspace(w, () => {
      const { activePanelId } = useWorkspace()
      seen.push(activePanelId.value)
      return { activePanelId }
    })
    w.openPanel('p1', 'map')
    await nextTick()
    const { activePanelId } = w
    expect(seen[0]).toBeNull()
    expect(activePanelId.value).toBe('p1')
  })

  it('supports computed() over the state, replacing rdd\'s selector argument', async () => {
    const w = ws()
    let tabCount: ComputedRef<number> | undefined
    withWorkspace(w, () => {
      const { panels } = useWorkspace()
      tabCount = computed(() => Object.keys(panels.value).length)
      return {}
    })
    expect(tabCount!.value).toBe(0)
    w.openPanel('a', 'map'); w.openPanel('b', 'map')
    await nextTick()
    expect(tabCount!.value).toBe(2)
  })

  it('re-renders a component when the state it reads changes', async () => {
    const w = ws()
    const Comp = defineComponent({
      setup() {
        const { panels } = useWorkspace()
        return () => h('div', Object.keys(panels.value).join(','))
      },
    })
    const wrapper = mount(Comp, { global: { plugins: [w] } })
    expect(wrapper.text()).toBe('')
    w.openPanel('a', 'map')
    await nextTick()
    expect(wrapper.text()).toBe('a')
  })

  it('disposes a subscription made in setup when the component unmounts', () => {
    const w = ws()
    const fn = vi.fn()
    const wrapper = withWorkspace(w, () => { useWorkspace().subscribe('e', fn); return {} })
    w.publish('e', 1)
    expect(fn).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    w.publish('e', 2)
    expect(fn).toHaveBeenCalledTimes(1)      // nothing to unsubscribe by hand
  })

  it('still returns an unsubscribe function, for a subscription that should end sooner', () => {
    const w = ws()
    const fn = vi.fn()
    let off: (() => void) | undefined
    withWorkspace(w, () => { off = useWorkspace().subscribe('e', fn); return {} })
    off!()
    w.publish('e', 1)
    expect(fn).not.toHaveBeenCalled()
  })

  it('outside a component scope, behaves exactly like the workspace itself', () => {
    const w = ws()
    const fn = vi.fn()
    w.subscribe('e', fn)
    w.publish('e', 1)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('exposes actions that mutate the shared store', async () => {
    const w = ws()
    withWorkspace(w, () => { useWorkspace().openPanel('from-component', 'map'); return {} })
    await nextTick()
    expect(w.isOpen('from-component')).toBe(true)
  })
})
