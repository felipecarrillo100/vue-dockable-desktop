/**
 * `useModals()` and `useSidePanels()`.
 *
 * These had **no coverage** until M13's non-vacuity sweep said so: the overlay tests drove
 * `ws.overlays` directly, which is the same store but not the same surface. The composables
 * are what an application actually calls, and two of their behaviours are their own — the
 * async drawer open that can resolve `null`, and `closeAll()` meaning different things for
 * drawers and for the modal stack.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import { useModals, useSidePanels } from '../../src/composables/useOverlays'

const Body = defineComponent({ name: 'PanelBody', setup: () => () => h('div', 'body') })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
})

/** Both composables, from inside a component, with the workspace they read. */
function setup() {
  let modals!: ReturnType<typeof useModals>
  let panels!: ReturnType<typeof useSidePanels>
  const ws = createWorkspace({ panels: {} })
  const wrapper = mount(defineComponent({
    setup() {
      modals = useModals()
      panels = useSidePanels()
      return () => h('div')
    },
  }), { global: { plugins: [ws] } }) as VueWrapper
  mounted.push(wrapper)
  return { ws, modals, panels }
}

describe('useModals', () => {
  it('reports the stack and the topmost modal, reactively', async () => {
    const { modals } = setup()
    expect(modals.stack.value).toEqual([])
    expect(modals.topmost.value).toBeNull()

    const first = modals.open(Body, {}, { title: 'First' })
    const second = modals.open(Body, {}, { title: 'Second' })
    expect(modals.stack.value.map(m => m.id)).toEqual([first, second])
    expect(modals.topmost.value?.id).toBe(second)
  })

  it('close() goes through the guard and the dirty check', async () => {
    const { ws, modals } = setup()
    const id = modals.open(Body, {}, { title: 'Guarded' })
    ws.overlays.registerCloseGuard(id, () => false)

    await modals.close(id)
    expect(modals.stack.value).toHaveLength(1)     // the guard refused

    await modals.close(id, { force: true })
    expect(modals.stack.value).toHaveLength(0)     // force skips it
  })

  it('a dirty modal with nothing able to ask stays open', async () => {
    // No `<VddModals>` is mounted here, so there is no renderer for the question — and
    // refusing is the only acceptable default when the alternative is discarding edits.
    const { ws, modals } = setup()
    const id = modals.open(Body, {}, { title: 'Dirty' })
    ws.overlays.setDirty(id, true)
    await modals.close(id)
    expect(modals.stack.value).toHaveLength(1)
  })

  it('closeAll() empties the stack and leaves the drawers alone', async () => {
    const { modals, panels } = setup()
    await panels.openLeft(Body, {}, { title: 'Left' })
    modals.open(Body, {}, { title: 'A' })
    modals.open(Body, {}, { title: 'B' })

    modals.closeAll()
    expect(modals.stack.value).toHaveLength(0)
    expect(panels.left.value).not.toBeNull()
  })
})

describe('useSidePanels', () => {
  it('opens each drawer and reports it', async () => {
    const { panels } = setup()
    expect(panels.left.value).toBeNull()
    expect(panels.right.value).toBeNull()

    const left = await panels.openLeft(Body, { a: 1 }, { title: 'Left' })
    const right = await panels.openRight(Body, {}, { title: 'Right', width: 320 })
    expect(panels.left.value?.id).toBe(left)
    expect(panels.right.value?.id).toBe(right)
    expect(panels.left.value?.props).toEqual({ a: 1 })
  })

  it('opening a drawer that is already occupied resolves null when the occupant refuses', async () => {
    // A drawer is one slot, so opening is also closing — which is the whole reason these are
    // async. A synchronous return would have to ignore the guard or lie about the id.
    const { ws, panels } = setup()
    const first = await panels.openLeft(Body, {}, { title: 'First' })
    ws.overlays.registerCloseGuard(first!, () => false)

    const second = await panels.openLeft(Body, {}, { title: 'Second' })
    expect(second).toBeNull()
    expect(panels.left.value?.id).toBe(first)

    // ...and succeeds once nothing objects.
    const guard = vi.fn(() => true)
    ws.overlays.registerCloseGuard(first!, guard)
    const third = await panels.openLeft(Body, {}, { title: 'Third' })
    expect(third).not.toBeNull()
    expect(guard).toHaveBeenCalled()
    expect(panels.left.value?.id).toBe(third)
  })

  it('closeAll() closes both drawers and leaves the modal stack alone', async () => {
    const { modals, panels } = setup()
    await panels.openLeft(Body, {}, { title: 'Left' })
    await panels.openRight(Body, {}, { title: 'Right' })
    modals.open(Body, {}, { title: 'Modal' })

    panels.closeAll()
    expect(panels.left.value).toBeNull()
    expect(panels.right.value).toBeNull()
    expect(modals.stack.value).toHaveLength(1)
  })

  it('close() honours a guard, and force skips it', async () => {
    const { ws, panels } = setup()
    const id = await panels.openRight(Body, {}, { title: 'Right' })
    ws.overlays.registerCloseGuard(id!, () => false)

    await panels.close(id!)
    expect(panels.right.value).not.toBeNull()
    await panels.close(id!, { force: true })
    expect(panels.right.value).toBeNull()
  })
})

describe('both composables outside a workspace', () => {
  it('throw with a message naming what is missing', () => {
    const BareModals = defineComponent({ setup() { useModals(); return () => h('div') } })
    const BarePanels = defineComponent({ setup() { useSidePanels(); return () => h('div') } })
    expect(() => mount(BareModals)).toThrow(/createWorkspace\(\)/)
    expect(() => mount(BarePanels)).toThrow(/createWorkspace\(\)/)
  })
})
