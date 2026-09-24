/**
 * `<VddToolbar>` and `useToolbar()`.
 *
 * A one-to-one port of rdd's `Toolbar.test.tsx` (42 tests, same TB numbers, same order).
 * Two things moved:
 *
 *   rdd                                vdd
 *   ────────────────────────────────   ──────────────────────────────────────────────
 *   <ToolbarProvider> in the tree      state lives on the workspace, so `useToolbar()`
 *                                      works anywhere `useWorkspace()` does (TB1)
 *   getActiveInGroup / setActiveInGroup  activeInGroup / setActiveInGroup
 *   isModifierActive / setModifierActive / toggleModifier
 *                                      isToggled / setToggled / toggle
 *   handle show() / hide() / toggle()  writing `v-model:visible`               (TB20)
 *   onVisibilityChange                 `update:visible` — see TB20's note
 *
 * Items stay plain data with rdd's field names, so a React app's `items` array transfers
 * verbatim (docs/decisions/0007-slots-over-render-props.md) — which is why every item test
 * below is a near-literal transcription rather than a re-imagining.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { ComponentMountingOptions, VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddToolbar from '../../src/components/VddToolbar.vue'
import { useToolbar } from '../../src/composables/useToolbar'
import type { ToolbarItem, ToolbarGroupItem } from '../../src/core/toolbarTypes'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const Icon = defineComponent({ name: 'Icon', setup: () => () => h('svg') })
const named = (id: string) => defineComponent({ name: `Icon-${id}`, setup: () => () => h('svg', { 'data-icon': id }) })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-toolbar-group-flyout').forEach(el => el.remove())
  document.body.innerHTML = ''
})

type ToolbarProps = NonNullable<ComponentMountingOptions<typeof VddToolbar>['props']>

/** A toolbar with a live workspace behind it — the workspace is where the state lives now. */
function mountToolbar(props: Partial<ToolbarProps> & Record<string, unknown>) {
  const ws = createWorkspace({ panels: {} })
  const wrapper = mount(VddToolbar, {
    props: props as ToolbarProps,
    global: { plugins: [ws] },
    attachTo: document.body,
  }) as VueWrapper
  mounted.push(wrapper)
  return { ws, wrapper, toolbar: ws.toolbar }
}

const strip = (w: VueWrapper) => w.get('.vdd-toolbar-strip').element as HTMLElement
const flyout = () => document.body.querySelector('.vdd-toolbar-group-flyout')
const flyoutItems = () => Array.from(document.body.querySelectorAll('.vdd-toolbar-group-flyout-item')) as HTMLButtonElement[]
const click = async (el: Element) => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()
  await nextTick()
}

// ─── TB1 ─────────────────────────────────────────────────────────────────────

describe('TB1: useToolbar() with no workspace', () => {
  it('throws when rendered outside a workspace', () => {
    // rdd required a <ToolbarProvider> of its own. vdd keeps toolbar state on the workspace,
    // so there is one less provider to forget — and the only prerequisite is the workspace
    // every vdd app installs anyway (docs/decisions/0004-store-outside-components.md).
    const Probe = defineComponent({ setup() { useToolbar(); return () => null } })
    expect(() => mount(Probe)).toThrow(/createWorkspace\(\)/)
  })
})

// ─── TB2-TB8 ─────────────────────────────────────────────────────────────────

describe('TB2-TB8: toolbar state on the workspace', () => {
  /** No component needed: the store is live the moment it is created (ADR 0004). */
  const toolbar = () => createWorkspace({ panels: {} }).toolbar

  it('TB2: activeInGroup() returns null initially', () => {
    expect(toolbar().activeInGroup('tools')).toBeNull()
  })

  it('TB3: setActiveInGroup() -> activeInGroup() round-trip', () => {
    const t = toolbar()
    t.setActiveInGroup('tools', 'pencil')
    expect(t.activeInGroup('tools')).toBe('pencil')
  })

  it('TB4: setActiveInGroup(group, null) deselects', () => {
    const t = toolbar()
    t.setActiveInGroup('tools', 'pencil')
    t.setActiveInGroup('tools', null)
    expect(t.activeInGroup('tools')).toBeNull()
  })

  it('TB5: isToggled() returns false initially (rdd: isModifierActive)', () => {
    expect(toolbar().isToggled('snap')).toBe(false)
  })

  it('TB6: setToggled(id, true) enables the toggle (rdd: setModifierActive)', () => {
    const t = toolbar()
    t.setToggled('snap', true)
    expect(t.isToggled('snap')).toBe(true)
  })

  it('TB7: toggle() flips state (rdd: toggleModifier)', () => {
    const t = toolbar()
    t.toggle('snap')
    expect(t.isToggled('snap')).toBe(true)
    t.toggle('snap')
    expect(t.isToggled('snap')).toBe(false)
  })

  it('TB8: multiple radio groups are independent', () => {
    const t = toolbar()
    t.setActiveInGroup('tools', 'pencil')
    t.setActiveInGroup('shapes', 'circle')
    expect(t.activeInGroup('tools')).toBe('pencil')
    expect(t.activeInGroup('shapes')).toBe('circle')
    t.setActiveInGroup('tools', null)
    expect(t.activeInGroup('tools')).toBeNull()
    expect(t.activeInGroup('shapes')).toBe('circle')
  })
})

// ─── TB9 ─────────────────────────────────────────────────────────────────────

describe('TB9: Toolbar renders action buttons', () => {
  it('renders a button for each action item', () => {
    const items: ToolbarItem[] = [
      { type: 'action', id: 'a', label: 'A', icon: Icon, onClick: () => {} },
      { type: 'action', id: 'b', label: 'B', icon: Icon, onClick: () => {} },
    ]
    const { wrapper } = mountToolbar({ items })
    const buttons = wrapper.findAll('.vdd-toolbar-btn-action')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.attributes('aria-label')).toBe('A')
    expect(buttons[1]!.attributes('aria-label')).toBe('B')
  })
})

// ─── TB10 ────────────────────────────────────────────────────────────────────

describe('TB10: Action button click fires onClick', () => {
  it('onClick is called when action button is clicked', async () => {
    const onClick = vi.fn()
    const { wrapper } = mountToolbar({
      items: [{ type: 'action', id: 'a', label: 'A', icon: Icon, onClick }] satisfies ToolbarItem[],
    })
    await wrapper.get('[data-vdd-toolbar-item="a"]').trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

// ─── TB11 ────────────────────────────────────────────────────────────────────

describe('TB11: Toolbar renders separators', () => {
  it('renders a separator div with role=separator', () => {
    const { wrapper } = mountToolbar({
      items: [
        { type: 'action', id: 'a', label: 'A', icon: Icon, onClick: () => {} },
        { type: 'separator' },
        { type: 'action', id: 'b', label: 'B', icon: Icon, onClick: () => {} },
      ] satisfies ToolbarItem[],
    })
    const sep = wrapper.get('.vdd-toolbar-separator')
    expect(sep.attributes('role')).toBe('separator')
  })
})

// ─── TB12-TB14 ───────────────────────────────────────────────────────────────

describe('TB12-TB14: Radio buttons', () => {
  const pencil = { type: 'radio', id: 'pencil', group: 'tools', label: 'Pencil', icon: Icon } as const
  const brush = { type: 'radio', id: 'brush', group: 'tools', label: 'Brush', icon: Icon } as const
  const radios: ToolbarItem[] = [pencil, brush]

  it('TB12: radio button is inactive (no .vdd-active class) by default', () => {
    const { wrapper } = mountToolbar({ items: radios })
    for (const btn of wrapper.findAll('.vdd-toolbar-btn-radio')) {
      expect(btn.classes()).not.toContain('vdd-active')
      expect(btn.attributes('aria-pressed')).toBe('false')
    }
  })

  it('TB13: clicking radio button activates it and calls onActivate', async () => {
    const onActivate = vi.fn()
    const { wrapper, toolbar } = mountToolbar({
      items: [{ ...pencil, onActivate }, brush] satisfies ToolbarItem[],
    })
    await wrapper.get('[data-vdd-toolbar-item="pencil"]').trigger('click')
    expect(wrapper.get('[data-vdd-toolbar-item="pencil"]').classes()).toContain('vdd-active')
    expect(onActivate).toHaveBeenCalledWith('pencil')
    expect(toolbar.activeInGroup('tools')).toBe('pencil')
  })

  it('TB14: clicking second radio in same group deactivates first', async () => {
    const { wrapper } = mountToolbar({ items: radios })
    await wrapper.get('[data-vdd-toolbar-item="pencil"]').trigger('click')
    await wrapper.get('[data-vdd-toolbar-item="brush"]').trigger('click')
    expect(wrapper.get('[data-vdd-toolbar-item="pencil"]').classes()).not.toContain('vdd-active')
    expect(wrapper.get('[data-vdd-toolbar-item="brush"]').classes()).toContain('vdd-active')
  })
})

// ─── TB15-TB17 ───────────────────────────────────────────────────────────────

describe('TB15-TB17: Toggle buttons', () => {
  it('TB15: toggle button is inactive by default', () => {
    const { wrapper } = mountToolbar({
      items: [{ type: 'toggle', id: 'snap', label: 'Snap', icon: Icon }] satisfies ToolbarItem[],
    })
    const btn = wrapper.get('.vdd-toolbar-btn-toggle')
    expect(btn.classes()).not.toContain('vdd-active')
    expect(btn.attributes('aria-pressed')).toBe('false')
  })

  it('TB16: clicking toggle activates it and calls onToggle(true)', async () => {
    const onToggle = vi.fn()
    const { wrapper, toolbar } = mountToolbar({
      items: [{ type: 'toggle', id: 'snap', label: 'Snap', icon: Icon, onToggle }] satisfies ToolbarItem[],
    })
    await wrapper.get('[data-vdd-toolbar-item="snap"]').trigger('click')
    expect(onToggle).toHaveBeenCalledWith(true)
    expect(wrapper.get('[data-vdd-toolbar-item="snap"]').classes()).toContain('vdd-active')
    expect(toolbar.isToggled('snap')).toBe(true)
  })

  it('TB17: clicking toggle again deactivates it and calls onToggle(false)', async () => {
    const onToggle = vi.fn()
    const { wrapper } = mountToolbar({
      items: [{ type: 'toggle', id: 'snap', label: 'Snap', icon: Icon, onToggle }] satisfies ToolbarItem[],
    })
    const btn = wrapper.get('[data-vdd-toolbar-item="snap"]')
    await btn.trigger('click')
    await btn.trigger('click')
    expect(onToggle).toHaveBeenLastCalledWith(false)
    expect(btn.classes()).not.toContain('vdd-active')
  })
})

// ─── TB18-TB19 ───────────────────────────────────────────────────────────────

describe('TB18-TB19: Toolbar visibility', () => {
  const one: ToolbarItem[] = [{ type: 'action', id: 'a', label: 'A', icon: Icon, onClick: () => {} }]

  it('TB18: visible=false collapses a vertical (left) strip to width 0px', () => {
    const { wrapper } = mountToolbar({ items: one, position: 'left', visible: false })
    expect(strip(wrapper).style.width).toBe('0px')
  })

  it('TB18b: visible=true leaves width to CSS (no inline collapse override)', () => {
    // The open size belongs to the stylesheet, including its coarse-pointer override. An
    // inline width here would quietly undo the larger touch targets.
    const { wrapper } = mountToolbar({ items: [], position: 'left', visible: true })
    expect(strip(wrapper).style.width).toBe('')
  })

  it('TB19: visible=false collapses a horizontal (top) strip to height 0px', () => {
    const { wrapper } = mountToolbar({ items: [], position: 'top', visible: false })
    expect(strip(wrapper).style.height).toBe('0px')
  })

  it('TB19b: visible=true leaves height to CSS (no inline collapse override)', () => {
    const { wrapper } = mountToolbar({ items: [], position: 'top', visible: true })
    expect(strip(wrapper).style.height).toBe('')
  })
})

// ─── TB20 ────────────────────────────────────────────────────────────────────

describe('TB20: v-model:visible replaces the imperative handle', () => {
  const one: ToolbarItem[] = [{ type: 'action', id: 'a', label: 'A', icon: Icon, onClick: () => {} }]

  it('setting visible to true shows the strip (rdd: show())', async () => {
    // rdd's show()/hide()/toggle() existed only to flip a boolean the caller could not write.
    // With a model the caller owns it, so what is left to assert is that the DOM follows.
    const { wrapper } = mountToolbar({ items: one, position: 'left', visible: false })
    await wrapper.setProps({ visible: true })
    expect(strip(wrapper).style.width).toBe('')
  })

  it('setting visible to false hides the strip (rdd: hide())', async () => {
    const { wrapper } = mountToolbar({ items: one, position: 'left', visible: true })
    await wrapper.setProps({ visible: false })
    expect(strip(wrapper).style.width).toBe('0px')
  })

  it('flipping visible false -> true shows it (rdd: toggle())', async () => {
    const { wrapper } = mountToolbar({ items: one, position: 'top', visible: false })
    expect(strip(wrapper).style.height).toBe('0px')
    await wrapper.setProps({ visible: true })
    expect(strip(wrapper).style.height).toBe('')
  })

  it('flipping visible true -> false hides it (rdd: toggle())', async () => {
    const { wrapper } = mountToolbar({ items: one, position: 'top', visible: true })
    expect(strip(wrapper).style.height).toBe('')
    await wrapper.setProps({ visible: false })
    expect(strip(wrapper).style.height).toBe('0px')
  })
})

// ─── TB21 ────────────────────────────────────────────────────────────────────

describe('TB21: Disabled buttons', () => {
  it('disabled action button has disabled attribute and click does not fire', async () => {
    const onClick = vi.fn()
    const { wrapper } = mountToolbar({
      items: [{ type: 'action', id: 'a', label: 'A', icon: Icon, onClick, disabled: true }] satisfies ToolbarItem[],
    })
    const btn = wrapper.get('[data-vdd-toolbar-item="a"]')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disabled radio button cannot be activated', async () => {
    const onActivate = vi.fn()
    const { wrapper, toolbar } = mountToolbar({
      items: [{ type: 'radio', id: 'pencil', group: 'tools', label: 'Pencil', icon: Icon, onActivate, disabled: true }] satisfies ToolbarItem[],
    })
    const btn = wrapper.get('[data-vdd-toolbar-item="pencil"]')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(onActivate).not.toHaveBeenCalled()
    expect(toolbar.activeInGroup('tools')).toBeNull()
  })
})

// ─── TB22-TB29 ───────────────────────────────────────────────────────────────

describe('TB22-TB29: Group button / flyout', () => {
  const onActivate = vi.fn()
  beforeEach(() => { onActivate.mockReset() })

  const groupItems = (): ToolbarItem[] => [{
    type: 'group',
    id: 'draw-tool',
    label: 'Drawing Tools',
    defaultIcon: named('default'),
    items: [
      { id: 'tool-pen', label: 'Pen', shortcut: 'P', icon: named('pen'), onActivate },
      { type: 'separator' },
      { id: 'tool-eraser', label: 'Eraser', icon: named('eraser') },
    ],
  }]

  const mountGroup = () => {
    const { wrapper } = mountToolbar({ items: groupItems() })
    return { wrapper, btn: wrapper.get('.vdd-toolbar-btn-group') }
  }

  it('TB22: group button renders with default label when no sub-item active', () => {
    const { btn } = mountGroup()
    expect(btn.attributes('aria-label')).toBe('Drawing Tools')
    expect(btn.attributes('aria-haspopup')).toBe('menu')
    expect(btn.classes()).not.toContain('vdd-active')
  })

  it('TB23: clicking group button renders flyout in document.body', async () => {
    const { btn } = mountGroup()
    await click(btn.element)
    const f = flyout()
    expect(f).not.toBeNull()
    expect(f!.getAttribute('role')).toBe('menu')
    // Teleported, so the strip's own overflow: hidden cannot clip it.
    expect(f!.closest('.vdd-toolbar-strip')).toBeNull()
  })

  it('TB24: clicking sub-item activates it, closes flyout, calls onActivate', async () => {
    const { btn } = mountGroup()
    await click(btn.element)
    await click(flyoutItems()[0]!)
    expect(flyout()).toBeNull()
    expect(onActivate).toHaveBeenCalledWith('tool-pen')
  })

  it('TB25: active sub-item label replaces default label on parent button', async () => {
    const { btn } = mountGroup()
    await click(btn.element)
    await click(flyoutItems()[0]!)
    expect(btn.attributes('aria-label')).toBe('Pen')
  })

  it('TB26: parent button gets .vdd-active class when any sub-item is active', async () => {
    const { btn } = mountGroup()
    await click(btn.element)
    await click(flyoutItems()[0]!)
    expect(btn.classes()).toContain('vdd-active')
  })

  it('TB27: clicking group button again when open closes the flyout', async () => {
    const { btn } = mountGroup()
    await click(btn.element)
    expect(flyout()).not.toBeNull()
    await click(btn.element)
    expect(flyout()).toBeNull()
  })

  it('TB28: separator entry renders with role="separator" inside flyout', async () => {
    const { btn } = mountGroup()
    await click(btn.element)
    const sep = document.body.querySelector('.vdd-toolbar-group-flyout-sep')
    expect(sep).not.toBeNull()
    expect(sep!.getAttribute('role')).toBe('separator')
  })

  it('TB29: disabled group button has disabled attribute and does not open flyout', async () => {
    const { wrapper } = mountToolbar({
      items: [{
        type: 'group', id: 'disabled-group', label: 'Disabled Group', defaultIcon: Icon,
        items: [{ id: 'sub1', label: 'Sub 1', icon: Icon }], disabled: true,
      }] satisfies ToolbarItem[],
    })
    const btn = wrapper.get('.vdd-toolbar-btn-group')
    expect(btn.attributes('disabled')).toBeDefined()
    await click(btn.element)
    expect(flyout()).toBeNull()
  })
})

// ─── TB30-TB33 ───────────────────────────────────────────────────────────────

describe('TB30-TB33: Controlled group mode', () => {
  const base = {
    type: 'group' as const,
    id: 'draw-tool',
    label: 'Drawing Tools',
    defaultIcon: named('default'),
    items: [
      { id: 'tool-pen', label: 'Pen', icon: named('pen') },
      { id: 'tool-eraser', label: 'Eraser', icon: named('eraser') },
    ],
  }
  /** `activeItemId` present at all — `null` included — makes the caller the owner. */
  const controlled = (extra: Partial<ToolbarGroupItem>): ToolbarItem[] => [{ ...base, ...extra }]

  it('TB30: activeItemId="tool-pen" shows Pen label and .vdd-active class without any workspace state', () => {
    const { wrapper, toolbar } = mountToolbar({ items: controlled({ activeItemId: 'tool-pen' }) })
    const btn = wrapper.get('.vdd-toolbar-btn-group')
    expect(btn.attributes('aria-label')).toBe('Pen')
    expect(btn.classes()).toContain('vdd-active')
    expect(toolbar.activeInGroup('draw-tool')).toBeNull()
  })

  it('TB31: clicking sub-item fires onActiveItemChange and does NOT write to the workspace', async () => {
    const onActiveItemChange = vi.fn()
    const { wrapper, toolbar } = mountToolbar({
      items: controlled({ activeItemId: null, onActiveItemChange }),
    })
    await click(wrapper.get('.vdd-toolbar-btn-group').element)
    await click(flyoutItems()[0]!)
    expect(onActiveItemChange).toHaveBeenCalledWith('tool-pen')
    expect(toolbar.activeInGroup('draw-tool')).toBeNull()
  })

  it('TB32: controlled group does not self-update after click (frozen until the prop changes)', async () => {
    const onActiveItemChange = vi.fn()
    const { wrapper } = mountToolbar({ items: controlled({ activeItemId: null, onActiveItemChange }) })
    const btn = wrapper.get('.vdd-toolbar-btn-group')
    await click(btn.element)
    await click(flyoutItems()[0]!)
    expect(btn.attributes('aria-label')).toBe('Drawing Tools')
    expect(btn.classes()).not.toContain('vdd-active')
    expect(onActiveItemChange).toHaveBeenCalledWith('tool-pen')
    // ...and it does follow the prop once the caller changes it.
    await wrapper.setProps({ items: controlled({ activeItemId: 'tool-pen', onActiveItemChange }) })
    expect(btn.attributes('aria-label')).toBe('Pen')
  })

  it('TB33: activeItemId=null ignores workspace state — shows the default icon and no .vdd-active', async () => {
    const { wrapper, toolbar } = mountToolbar({ items: controlled({ activeItemId: null }) })
    toolbar.setActiveInGroup('draw-tool', 'tool-pen')
    await nextTick()
    const btn = wrapper.get('.vdd-toolbar-btn-group')
    expect(btn.attributes('aria-label')).toBe('Drawing Tools')
    expect(btn.find('[data-icon="default"]').exists()).toBe(true)
    expect(btn.classes()).not.toContain('vdd-active')
  })
})

// ─── TB34-TB36 ───────────────────────────────────────────────────────────────

describe('TB34-TB36: Controlled toggle mode', () => {
  it('TB34: active=true shows .vdd-active class and aria-pressed=true without any workspace state', () => {
    const { wrapper, toolbar } = mountToolbar({
      items: [{ type: 'toggle', id: 'snap', label: 'Snap', icon: Icon, active: true }] satisfies ToolbarItem[],
    })
    const btn = wrapper.get('.vdd-toolbar-btn-toggle')
    expect(btn.classes()).toContain('vdd-active')
    expect(btn.attributes('aria-pressed')).toBe('true')
    expect(toolbar.isToggled('snap')).toBe(false)
  })

  it('TB35: clicking a controlled toggle calls onToggle and does NOT write to the workspace', async () => {
    const onToggle = vi.fn()
    const { wrapper, toolbar } = mountToolbar({
      items: [{ type: 'toggle', id: 'snap', label: 'Snap', icon: Icon, active: false, onToggle }] satisfies ToolbarItem[],
    })
    await wrapper.get('[data-vdd-toolbar-item="snap"]').trigger('click')
    expect(onToggle).toHaveBeenCalledWith(true)
    expect(toolbar.isToggled('snap')).toBe(false)
  })

  it('TB36: active=false ignores workspace state even if that id is toggled there', async () => {
    const { wrapper, toolbar } = mountToolbar({
      items: [{ type: 'toggle', id: 'snap', label: 'Snap', icon: Icon, active: false }] satisfies ToolbarItem[],
    })
    // Unrelated uncontrolled code writing the same id must not leak into a controlled item —
    // which is what makes two instances of one panel type able to hold independent state.
    toolbar.setToggled('snap', true)
    await nextTick()
    const btn = wrapper.get('.vdd-toolbar-btn-toggle')
    expect(btn.classes()).not.toContain('vdd-active')
    expect(btn.attributes('aria-pressed')).toBe('false')
  })
})

describe('1.1.2: collapse and roles', () => {
  it('a collapsed strip is inert and carries the collapsed class; an open one is not', async () => {
    // Collapsing only set width: 0, so the buttons stayed in the Tab order.
    const { wrapper } = mountToolbar({ items: [{ type: 'action', id: 'a', label: 'A', icon: Icon, onClick: () => {} }], visible: false })
    expect(strip(wrapper).hasAttribute('inert')).toBe(true)
    expect(strip(wrapper).classList.contains('vdd-toolbar-strip--collapsed')).toBe(true)
    await wrapper.setProps({ visible: true })
    expect(strip(wrapper).hasAttribute('inert')).toBe(false)
    expect(strip(wrapper).classList.contains('vdd-toolbar-strip--collapsed')).toBe(false)
  })

  it('flyout tools are menuitemradio with aria-checked, not menuitem with aria-pressed', async () => {
    const { wrapper } = mountToolbar({ items: [{
      type: 'group', id: 'g', label: 'G', defaultIcon: Icon,
      items: [{ id: 'one', label: 'One', icon: Icon }, { id: 'two', label: 'Two', icon: Icon }],
    }] })
    await click(wrapper.get('.vdd-toolbar-btn-group').element)
    await click(flyoutItems()[0]!)
    await click(wrapper.get('.vdd-toolbar-btn-group').element)
    const items = flyoutItems()
    expect(items.map(i => i.getAttribute('role'))).toEqual(['menuitemradio', 'menuitemradio'])
    expect(items.map(i => i.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(items.some(i => i.hasAttribute('aria-pressed'))).toBe(false)
  })
})
