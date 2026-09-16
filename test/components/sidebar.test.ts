/**
 * `<VddSidebar>`, `<VddSecondarySidebar>`, `useSidebar()` and `useSidebarTab()`.
 *
 * A one-to-one port of rdd's `Sidebar.test.tsx` (91 tests, same SB numbers, same order).
 * rdd drove the sidebar through eight methods on an imperative handle, because React has no
 * two-way props; every one of them was a getter or a setter for a piece of state, so vdd has
 * four models instead (docs/decisions/0005-vmodel.md). Each of those tests is mapped below
 * rather than dropped — the mapping is spelled out per test, so the coverage can be compared
 * against the React suite line by line:
 *
 *   rdd handle method            vdd equivalent asserted here
 *   ──────────────────────────   ────────────────────────────────────────────────────
 *   openTab(id)                  useSidebar().openTab(id)                      (SB11)
 *   closeDrawer()                useSidebar().closeDrawer()                    (SB12)
 *   getActiveTab()               useSidebar().activeTabId  — a ref, so reactive (SB14)
 *   show() / hide() / toggle()   writing `v-model:visible`                     (SB13)
 *   showStrip() / hideStrip()    writing `v-model:strip-visible`               (SB24)
 *   setWidth(px) / getWidth()    writing / reading `v-model:width`             (SB21)
 *   onActiveTabChange            `update:activeTabId`                    (SB10, SB18)
 *   onWidthChange                `update:width`                                (SB21)
 *   onVisibilityChange           `update:visible`  — see SB13's note                 
 *   onStripVisibilityChange      `update:stripVisible`                         (SB24)
 *   renderContent(id)            a `#tab-<id>` slot, or the tab's `component`
 *   renderHeader(tab, close)     the `#header` slot, with the same two slot props
 *
 * Two assertions could not stay as they were. rdd's `setWidth` clamped inside the component,
 * so SB22 called it out of range and read the result back; a model has no setter to clamp in,
 * and clamping the caller's own ref behind their back is not something a Vue component should
 * do — so vdd clamps where the value is produced (the drag) and bounds the render with
 * min/max, and SB22 asserts both. SB26 asserted an inline `flex-basis: 0` that vdd moved to
 * the stylesheet (divergence D12), so it reads the CSS, the way `test/core/stylesheet.test.ts`
 * does. Both are noted at the test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { MockInstance } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { Component } from 'vue'
import { mount } from '@vue/test-utils'
import type { ComponentMountingOptions, VueWrapper } from '@vue/test-utils'
import VddSidebar from '../../src/components/VddSidebar.vue'
import VddSecondarySidebar from '../../src/components/VddSecondarySidebar.vue'
import { useSidebar, useSidebarTab } from '../../src/composables/useSidebar'
import type { SidebarTab } from '../../src/core/sidebarTypes'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const Icon = defineComponent({ name: 'Icon', setup: () => () => h('svg') })

/** One content component per tab id, cached: a fresh definition would remount the pane. */
const contents = new Map<string, Component>()
function contentFor(id: string): Component {
  let c = contents.get(id)
  if (!c) {
    c = defineComponent({ name: `Content-${id}`, setup: () => () => h('div', { 'data-content': id }, `${id} content`) })
    contents.set(id, c)
  }
  return c
}

const makeTab = (id: string, overrides: Partial<SidebarTab> = {}): SidebarTab => ({
  id,
  label: `Tab ${id}`,
  icon: Icon,
  component: contentFor(id),
  ...overrides,
})

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
})

/**
 * `tabs` is the component's only required prop, so the helper takes props partially and
 * completes them at the boundary — every test supplies it. Everything else, slots included,
 * keeps the component's real types, so a slot lambda's props are checked.
 */
type SidebarOptions = ComponentMountingOptions<typeof VddSidebar>
type SidebarMountProps = Partial<NonNullable<SidebarOptions['props']>> & Record<string, unknown>
type SidebarProps = NonNullable<SidebarOptions['props']>
type SecondaryProps = NonNullable<ComponentMountingOptions<typeof VddSecondarySidebar>['props']>

function mountSidebar(props: SidebarMountProps = {}, options: Omit<SidebarOptions, 'props' | 'attachTo'> = {}): VueWrapper {
  const wrapper = mount(VddSidebar, {
    ...options,
    props: props as SidebarProps,
    attachTo: document.body,
  }) as VueWrapper
  mounted.push(wrapper)
  return wrapper
}

const railButtons = (w: VueWrapper) => w.findAll('.vdd-sidebar-tab-btn')
const tabButton = (w: VueWrapper, id: string) => w.get(`[data-vdd-sidebar-tab="${id}"]`)
const drawer = (w: VueWrapper) => w.get('.vdd-sidebar-content-drawer').element as HTMLElement
const stripOuter = (w: VueWrapper) => w.get('.vdd-sidebar-strip-outer').element as HTMLElement
const content = (w: VueWrapper, id: string) => w.find(`[data-content="${id}"]`)

/** Renders nothing; runs `fn` with the sidebar context, so a test can call into it. */
function contextProbe(fn: (api: ReturnType<typeof useSidebar>) => void): Component {
  return defineComponent({
    name: 'ContextProbe',
    setup() {
      fn(useSidebar())
      return () => h('div', { 'data-probe': '' })
    },
  })
}

// ─── SB1 ─────────────────────────────────────────────────────────────────────

describe('SB1: Renders one button per tab in the strip', () => {
  it('renders correct number of tab buttons', () => {
    const w = mountSidebar({ tabs: [makeTab('a'), makeTab('b'), makeTab('c')] })
    expect(railButtons(w)).toHaveLength(3)
  })
})

// ─── SB2 ─────────────────────────────────────────────────────────────────────

describe('SB2: Tab buttons have aria-pressed=false initially', () => {
  it('all tab buttons start unpressed', () => {
    const w = mountSidebar({ tabs: [makeTab('a'), makeTab('b')] })
    for (const btn of railButtons(w)) expect(btn.attributes('aria-pressed')).toBe('false')
  })
})

// ─── SB3 ─────────────────────────────────────────────────────────────────────

describe('SB3: Clicking a tab opens the drawer', () => {
  it('content appears after clicking its tab', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    await tabButton(w, 'a').trigger('click')
    expect(content(w, 'a').exists()).toBe(true)
  })
})

// ─── SB4 ─────────────────────────────────────────────────────────────────────

describe('SB4: Clicking active tab again closes the drawer', () => {
  it('second click deactivates the tab', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    await tabButton(w, 'a').trigger('click')
    expect(tabButton(w, 'a').attributes('aria-pressed')).toBe('true')
    await tabButton(w, 'a').trigger('click')
    expect(tabButton(w, 'a').attributes('aria-pressed')).toBe('false')
    expect(drawer(w).style.flexBasis).toBe('0px')
  })
})

// ─── SB5 ─────────────────────────────────────────────────────────────────────

describe('SB5: eagerMount tabs are rendered before any click', () => {
  it('content is in DOM before tab is clicked', () => {
    const w = mountSidebar({ tabs: [makeTab('a', { eagerMount: true })] })
    expect(content(w, 'a').exists()).toBe(true)
  })
})

// ─── SB6 ─────────────────────────────────────────────────────────────────────

describe('SB6: Non-eagerMount tabs are not rendered before click', () => {
  it('content is absent before tab is clicked', () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    expect(content(w, 'a').exists()).toBe(false)
  })
})

// ─── SB7 ─────────────────────────────────────────────────────────────────────

describe('SB7: preserveState tabs remain in DOM after close', () => {
  it('content stays in DOM (hidden) after drawer closes', async () => {
    const w = mountSidebar({ tabs: [makeTab('a', { preserveState: true })] })
    await tabButton(w, 'a').trigger('click')
    expect(content(w, 'a').exists()).toBe(true)
    await tabButton(w, 'a').trigger('click')
    expect(content(w, 'a').exists()).toBe(true)
    expect((w.get('[data-vdd-sidebar-pane="a"]').element as HTMLElement).style.display).toBe('none')
  })
})

// ─── SB8 ─────────────────────────────────────────────────────────────────────

describe('SB8: Non-preserveState tabs are removed from DOM after close', () => {
  it('content is removed from DOM after drawer closes', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    await tabButton(w, 'a').trigger('click')
    expect(content(w, 'a').exists()).toBe(true)
    await tabButton(w, 'a').trigger('click')
    expect(content(w, 'a').exists()).toBe(false)
  })
})

// ─── SB9 ─────────────────────────────────────────────────────────────────────

describe('SB9: visible=false collapses the tab strip', () => {
  it('strip wrapper has width 0px when visible=false', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], visible: false })
    expect(stripOuter(w).style.width).toBe('0px')
  })

  it('strip wrapper has width 56px when visible=true (default)', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], visible: true })
    expect(stripOuter(w).style.width).toBe('56px')
  })
})

// ─── SB10 ────────────────────────────────────────────────────────────────────

describe('SB10: Controlled activeTabId drives which drawer is open', () => {
  it('renders the controlled tab as active', () => {
    // Passing the model's prop without its listener is what "controlled" means in Vue: the
    // component reads the caller's value and can never change it on its own.
    const w = mountSidebar({ tabs: [makeTab('a'), makeTab('b')], activeTabId: 'b' })
    expect(tabButton(w, 'b').attributes('aria-pressed')).toBe('true')
    expect(tabButton(w, 'a').attributes('aria-pressed')).toBe('false')
    expect(content(w, 'b').exists()).toBe(true)
  })

  it('emits update:activeTabId when a tab is clicked in controlled mode', async () => {
    const onUpdate = vi.fn()
    const w = mountSidebar({
      tabs: [makeTab('a'), makeTab('b')],
      activeTabId: 'a',
      'onUpdate:activeTabId': onUpdate,
    })
    await tabButton(w, 'b').trigger('click')
    expect(onUpdate).toHaveBeenCalledWith('b')
  })
})

// ─── SB11-SB14: what rdd's imperative handle did ─────────────────────────────

describe('SB11-SB14: useSidebar() and the models replace the imperative handle', () => {
  it('SB11: useSidebar().openTab() activates the correct tab', async () => {
    let api!: ReturnType<typeof useSidebar>
    const w = mountSidebar({ tabs: [makeTab('a'), makeTab('b')] }, {
      slots: { default: () => h(contextProbe(a => { api = a })) },
    })
    api.openTab('b')
    await nextTick()
    expect(tabButton(w, 'b').attributes('aria-pressed')).toBe('true')
    expect(content(w, 'b').exists()).toBe(true)
  })

  it('SB12: useSidebar().closeDrawer() closes the drawer', async () => {
    let api!: ReturnType<typeof useSidebar>
    const w = mountSidebar({ tabs: [makeTab('a')] }, {
      slots: { default: () => h(contextProbe(a => { api = a })) },
    })
    api.openTab('a')
    await nextTick()
    expect(drawer(w).style.flexBasis).not.toBe('0px')
    api.closeDrawer()
    await nextTick()
    expect(drawer(w).style.flexBasis).toBe('0px')
  })

  it('SB14: useSidebar().activeTabId reads null initially, the tab id when open', async () => {
    // rdd needed getActiveTab() because a React context value is a snapshot. This is a ref,
    // so it is not only readable but reactive — a watcher on it would fire.
    let api!: ReturnType<typeof useSidebar>
    mountSidebar({ tabs: [makeTab('a')] }, {
      slots: { default: () => h(contextProbe(a => { api = a })) },
    })
    expect(api.activeTabId.value).toBeNull()
    api.openTab('a')
    await nextTick()
    expect(api.activeTabId.value).toBe('a')
    api.closeDrawer()
    await nextTick()
    expect(api.activeTabId.value).toBeNull()
  })

  it('SB13: v-model:visible set to true shows the strip (rdd: show())', async () => {
    // rdd's show()/hide()/toggle() existed only to flip a boolean the caller could not write
    // to. The equivalent assertion is that the DOM follows the model in both directions —
    // there is nothing left for the component to emit, since the caller is the one writing.
    const visible = ref(false)
    const w = mountSidebar({ tabs: [makeTab('a')], visible: visible.value }, {})
    await w.setProps({ visible: true })
    expect(stripOuter(w).style.width).toBe('56px')
  })

  it('SB13: v-model:visible set to false hides the strip (rdd: hide())', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], visible: true })
    await w.setProps({ visible: false })
    expect(stripOuter(w).style.width).toBe('0px')
  })

  it('SB13: flipping v-model:visible false -> true shows it (rdd: toggle())', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], visible: false })
    expect(stripOuter(w).style.width).toBe('0px')
    await w.setProps({ visible: true })
    expect(stripOuter(w).style.width).toBe('56px')
  })

  it('SB13: flipping v-model:visible true -> false hides it (rdd: toggle())', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], visible: true })
    expect(stripOuter(w).style.width).toBe('56px')
    await w.setProps({ visible: false })
    expect(stripOuter(w).style.width).toBe('0px')
  })
})

// ─── SB15 ────────────────────────────────────────────────────────────────────

describe('SB15: useSidebar() outside a sidebar throws', () => {
  it('throws when rendered outside a Sidebar tree', () => {
    const Bare = defineComponent({ setup() { useSidebar(); return () => h('div') } })
    expect(() => mount(Bare)).toThrow(/useSidebar\(\)/)
  })
})

// ─── SB16 ────────────────────────────────────────────────────────────────────

describe('SB16: useSidebarTab() outside a tab throws', () => {
  it('throws when rendered outside a sidebar tab\'s content', () => {
    const Bare = defineComponent({ setup() { useSidebarTab(); return () => h('div') } })
    expect(() => mount(Bare)).toThrow(/useSidebarTab\(\)/)
  })
})

// ─── SB17 ────────────────────────────────────────────────────────────────────

describe('SB17: position controls strip and drawer order', () => {
  const order = (w: VueWrapper) => {
    const children = Array.from((w.element as HTMLElement).children)
    return {
      strip: children.findIndex(el => el.classList.contains('vdd-sidebar-strip-outer')),
      drawer: children.findIndex(el => el.classList.contains('vdd-sidebar-content-drawer')),
    }
  }

  it("position='left': strip comes before drawer in DOM", () => {
    const w = mountSidebar({ tabs: [makeTab('a')], position: 'left', activeTabId: 'a' })
    const { strip, drawer: d } = order(w)
    expect(strip).toBeGreaterThanOrEqual(0)
    expect(d).toBeGreaterThanOrEqual(0)
    expect(strip).toBeLessThan(d)
  })

  it("position='right' (default): drawer comes before strip in DOM", () => {
    const w = mountSidebar({ tabs: [makeTab('a')], position: 'right', activeTabId: 'a' })
    const { strip, drawer: d } = order(w)
    expect(strip).toBeGreaterThanOrEqual(0)
    expect(d).toBeGreaterThanOrEqual(0)
    expect(d).toBeLessThan(strip)
  })
})

// ─── SB18 ────────────────────────────────────────────────────────────────────

describe('SB18: update:activeTabId is emitted on tab selection changes', () => {
  it('fires with tab id when tab is opened', async () => {
    const onUpdate = vi.fn()
    const w = mountSidebar({ tabs: [makeTab('a')], 'onUpdate:activeTabId': onUpdate })
    await tabButton(w, 'a').trigger('click')
    expect(onUpdate).toHaveBeenCalledWith('a')
  })

  it('fires with null when active tab is clicked to close', async () => {
    const onUpdate = vi.fn()
    const w = mountSidebar({ tabs: [makeTab('a')], 'onUpdate:activeTabId': onUpdate })
    await tabButton(w, 'a').trigger('click')
    onUpdate.mockClear()
    await tabButton(w, 'a').trigger('click')
    expect(onUpdate).toHaveBeenCalledWith(null)
  })
})

// ─── SB19 ────────────────────────────────────────────────────────────────────

describe('SB19: the width model initialises the drawer width in pixels', () => {
  it('drawer flex-basis reflects the initial width (rdd: defaultWidth)', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a', width: 320 })
    expect(drawer(w).style.flexBasis).toBe('320px')
  })

  it('defaults to 280px when width is omitted', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a' })
    expect(drawer(w).style.flexBasis).toBe('280px')
  })
})

// ─── SB21 ────────────────────────────────────────────────────────────────────

describe('SB21: v-model:width replaces setWidth/getWidth', () => {
  it('writing the width model updates drawer flex-basis (rdd: setWidth)', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a', width: 280 })
    await w.setProps({ width: 400 })
    expect(drawer(w).style.flexBasis).toBe('400px')
  })

  it('the caller\'s own ref is the current pixel width (rdd: getWidth)', () => {
    // There is nothing to read back from: the model *is* the caller's value. rdd needed a
    // getter only because the width lived inside the component.
    const width = ref(310)
    const w = mountSidebar({
      tabs: [makeTab('a')], activeTabId: 'a',
      width: width.value, 'onUpdate:width': (v: number) => { width.value = v },
    })
    expect(width.value).toBe(310)
    expect(drawer(w).style.flexBasis).toBe('310px')
  })

  it('reading reflects a write (rdd: getWidth after setWidth)', async () => {
    const width = ref(280)
    const w = mountSidebar({
      tabs: [makeTab('a')], activeTabId: 'a',
      width: width.value, 'onUpdate:width': (v: number) => { width.value = v },
    })
    width.value = 350
    await w.setProps({ width: 350 })
    expect(width.value).toBe(350)
    expect(drawer(w).style.flexBasis).toBe('350px')
  })

  it('dragging the resizer emits update:width (rdd: onWidthChange)', async () => {
    const onUpdate = vi.fn()
    const w = mountSidebar({
      tabs: [makeTab('a')], activeTabId: 'a', position: 'right', width: 300,
      'onUpdate:width': onUpdate,
    })
    const bar = w.get('[data-vdd-sidebar-resizer]').element as HTMLElement
    bar.setPointerCapture = vi.fn()
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 100, clientY: 0 }))
    // A right-hand drawer grows when the pointer moves left.
    bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 60, clientY: 0 }))
    expect(onUpdate).toHaveBeenCalledWith(340)
    bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
  })
})

// ─── SB22 ────────────────────────────────────────────────────────────────────

describe('SB22: the width stays within minWidth and maxWidth', () => {
  /**
   * rdd clamped inside `setWidth`. A model has no setter to clamp in, and silently rewriting
   * the caller's own ref is not something a Vue component should do — so vdd clamps where the
   * value is produced (the drag), and bounds the render declaratively with min/max-width so
   * even a value the caller sets out of range cannot draw out of range. Both are asserted.
   */
  const dragBy = (bar: HTMLElement, dx: number) => {
    bar.setPointerCapture = vi.fn()
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 500, clientY: 0 }))
    bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 500 + dx, clientY: 0 }))
    bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
  }

  it('a drag past minWidth is clamped to minWidth', () => {
    const onUpdate = vi.fn()
    const w = mountSidebar({
      tabs: [makeTab('a')], activeTabId: 'a', position: 'right',
      width: 300, minWidth: 200, maxWidth: 600, 'onUpdate:width': onUpdate,
    })
    dragBy(w.get('[data-vdd-sidebar-resizer]').element as HTMLElement, 1000) // shrink hard
    expect(onUpdate).toHaveBeenLastCalledWith(200)
  })

  it('a drag past maxWidth is clamped to maxWidth, and the render is bounded too', () => {
    const onUpdate = vi.fn()
    const w = mountSidebar({
      tabs: [makeTab('a')], activeTabId: 'a', position: 'right',
      width: 300, minWidth: 200, maxWidth: 600, 'onUpdate:width': onUpdate,
    })
    dragBy(w.get('[data-vdd-sidebar-resizer]').element as HTMLElement, -1000) // grow hard
    expect(onUpdate).toHaveBeenLastCalledWith(600)
    const style = drawer(w).style
    expect(style.minWidth).toBe('200px')
    expect(style.maxWidth).toBe('600px')
  })
})

// ─── SB23 ────────────────────────────────────────────────────────────────────

describe('SB23: stripVisible=false collapses only the strip', () => {
  it('strip wrapper collapses to 0px when stripVisible=false', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], stripVisible: false })
    expect(stripOuter(w).style.width).toBe('0px')
  })

  it('strip wrapper is visible (56px) when stripVisible is omitted', () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    expect(stripOuter(w).style.width).toBe('56px')
  })

  it('stripVisible=false does not hide the drawer when a tab is open', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a', stripVisible: false, width: 280 })
    expect(stripOuter(w).style.width).toBe('0px')
    expect(drawer(w).style.flexBasis).toBe('280px')
    expect(content(w, 'a').exists()).toBe(true)
  })
})

// ─── SB24 ────────────────────────────────────────────────────────────────────

describe('SB24: v-model:strip-visible replaces showStrip/hideStrip', () => {
  it('setting strip-visible to true shows the strip (rdd: showStrip())', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], stripVisible: false })
    await w.setProps({ stripVisible: true })
    expect(stripOuter(w).style.width).toBe('56px')
  })

  it('setting strip-visible to false hides the strip (rdd: hideStrip())', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], stripVisible: true })
    await w.setProps({ stripVisible: false })
    expect(stripOuter(w).style.width).toBe('0px')
  })
})

// ─── SB25 ────────────────────────────────────────────────────────────────────

describe('SB25: resize handle renders only when drawer is open', () => {
  it('no .vdd-resizer-bar when no tab is active', () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    expect(w.find('.vdd-resizer-bar').exists()).toBe(false)
  })

  it('.vdd-resizer-bar is present when a tab is active', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a' })
    expect(w.find('.vdd-resizer-bar').exists()).toBe(true)
  })
})

// ─── SB26 ────────────────────────────────────────────────────────────────────

describe('SB26: the content wrapper uses flex-basis:0 (content can\'t inflate it and shift the drawer)', () => {
  it('.vdd-sidebar-main has flex-basis 0 and min-width 0', () => {
    // rdd set this inline on the JSX, so it read the style attribute. vdd moved every
    // structural rule to the stylesheet (divergence D12) and jsdom loads no stylesheet, so
    // the rule is read from the CSS source — the same approach as test/core/stylesheet.test.ts.
    //
    // flex-basis: auto (what a bare flex-grow:1 leaves in place) makes a flex item's
    // hypothetical size its content's max-content width, and min-width:0 lowers only the
    // shrink floor, not that starting size. So a wide panel inside would inflate this wrapper
    // and steal width from the drawer beside it.
    const css = readFileSync(resolve(import.meta.dirname, '../../src/index.css'), 'utf8')
    const rule = css.match(/\.vdd-sidebar-main\s*\{[^}]*\}/)
    expect(rule).not.toBeNull()
    expect(rule![0]).toMatch(/flex-basis:\s*0/)
    expect(rule![0]).toMatch(/min-width:\s*0/)
    // And the class is actually the one the component emits, not a name only the CSS knows.
    const w = mountSidebar({ tabs: [makeTab('a')] }, { slots: { default: () => h('div', 'workspace content') } })
    expect(w.get('.vdd-sidebar-main').text()).toBe('workspace content')
  })
})

// ─── SB27 ────────────────────────────────────────────────────────────────────

describe('SB27: drawer auto-closes when the active tab stops existing in tabs', () => {
  it('uncontrolled: closes when the active tab is removed but other tabs remain', async () => {
    const w = mountSidebar({ tabs: [makeTab('a'), makeTab('b')] })
    await tabButton(w, 'a').trigger('click')
    expect(content(w, 'a').exists()).toBe(true)
    await w.setProps({ tabs: [makeTab('b')] })
    await nextTick()
    expect(drawer(w).style.flexBasis).toBe('0px')
    expect(content(w, 'a').exists()).toBe(false)
  })

  it('uncontrolled: closes when tabs becomes fully empty', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    await tabButton(w, 'a').trigger('click')
    await w.setProps({ tabs: [] })
    await nextTick()
    expect(drawer(w).style.flexBasis).toBe('0px')
    expect(railButtons(w)).toHaveLength(0)
  })

  it('does NOT fall back to a different tab when the active one vanishes', async () => {
    const w = mountSidebar({ tabs: [makeTab('a'), makeTab('b')] })
    await tabButton(w, 'a').trigger('click')
    await w.setProps({ tabs: [makeTab('b')] })
    await nextTick()
    expect(tabButton(w, 'b').attributes('aria-pressed')).toBe('false')
    expect(content(w, 'b').exists()).toBe(false)
  })

  it('controlled: emits update:activeTabId with null when the controlled active tab vanishes', async () => {
    const onUpdate = vi.fn()
    const w = mountSidebar({
      tabs: [makeTab('a'), makeTab('b')], activeTabId: 'a', 'onUpdate:activeTabId': onUpdate,
    })
    await w.setProps({ tabs: [makeTab('b')] })
    await nextTick()
    expect(onUpdate).toHaveBeenCalledWith(null)
  })
})

// ─── SB28 ────────────────────────────────────────────────────────────────────

describe('SB28: headerAction renders a standalone, non-toggling button above the tabs', () => {
  it('renders no extra button when headerAction is omitted', () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    expect(railButtons(w)).toHaveLength(1)
    expect(w.find('.vdd-sidebar-header-area').exists()).toBe(false)
  })

  it('renders a button with the given icon/label, calls onClick, and never opens the drawer', async () => {
    const onClick = vi.fn()
    const onUpdate = vi.fn()
    const w = mountSidebar({
      tabs: [makeTab('a')],
      headerAction: { id: 'burger', icon: Icon, label: 'Menu', onClick },
      'onUpdate:activeTabId': onUpdate,
    })
    const btn = w.get('[data-vdd-rail-action="burger"]')
    expect(btn.attributes('title')).toBe('Menu')
    expect(btn.attributes('aria-label')).toBe('Menu')
    await btn.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(drawer(w).style.flexBasis).toBe('0px')
  })

  it('disabled: true renders a disabled button that does not fire onClick', async () => {
    const onClick = vi.fn()
    const w = mountSidebar({
      tabs: [makeTab('a')],
      headerAction: { id: 'burger', icon: Icon, label: 'Menu', onClick, disabled: true },
    })
    const btn = w.get('[data-vdd-rail-action="burger"]')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('a custom entry renders wholesale, with no .vdd-sidebar-tab-btn generated for it', () => {
    // rdd's `render: () => node`. vdd takes a component, since that is what a Vue caller has.
    const Custom = defineComponent({ setup: () => () => h('div', { 'data-custom': 'yes' }, 'custom') })
    const w = mountSidebar({
      tabs: [],
      headerAction: { id: 'x', custom: true, component: Custom },
    })
    expect(w.get('[data-custom="yes"]').text()).toBe('custom')
    expect(railButtons(w)).toHaveLength(0)
  })

  it('adds the reduced-top-padding modifier class to the strip only when headerAction is present', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    const strip = () => w.get('.vdd-sidebar-tabs-strip')
    expect(strip().classes()).not.toContain('vdd-sidebar-tabs-strip--has-header-action')
    await w.setProps({ headerAction: { icon: Icon, label: 'Menu', onClick: () => {} } })
    expect(strip().classes()).toContain('vdd-sidebar-tabs-strip--has-header-action')
  })

  it('wraps headerAction in .vdd-sidebar-header-area (both forms) and tabs in .vdd-sidebar-tabs-list', async () => {
    const single = { icon: Icon, label: 'Menu', onClick: () => {} }
    const w = mountSidebar({ tabs: [makeTab('a')], headerAction: single })
    expect(w.get('.vdd-sidebar-header-area').findAll('button')).toHaveLength(1)
    expect(w.get('.vdd-sidebar-tabs-list').findAll('button')).toHaveLength(1)
    await w.setProps({ headerAction: [single, { icon: Icon, label: 'Other', onClick: () => {} }] })
    expect(w.get('.vdd-sidebar-header-area').findAll('button')).toHaveLength(2)
    expect(w.get('.vdd-sidebar-tabs-list').findAll('button')).toHaveLength(1)
  })
})

// ─── SB29 ────────────────────────────────────────────────────────────────────

describe('SB29: showCloseButton adds an extra close control to the drawer header', () => {
  it('renders no close button when showCloseButton is omitted', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a' })
    expect(w.find('.vdd-sidebar-drawer-close-button').exists()).toBe(false)
    expect(w.find('.vdd-sidebar-drawer-header').exists()).toBe(true)
  })

  it('renders a close button in the drawer header when showCloseButton is true', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a', showCloseButton: true })
    const btn = w.get('.vdd-sidebar-drawer-close-button')
    expect(w.get('.vdd-sidebar-drawer-header').element.contains(btn.element)).toBe(true)
  })

  it('clicking the close button collapses the drawer via the same path as clicking the active tab icon', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], showCloseButton: true })
    await tabButton(w, 'a').trigger('click')
    expect(drawer(w).style.flexBasis).not.toBe('0px')
    await w.get('.vdd-sidebar-drawer-close-button').trigger('click')
    expect(drawer(w).style.flexBasis).toBe('0px')
    expect(tabButton(w, 'a').attributes('aria-pressed')).toBe('false')
  })

  it('does not render a close button when the drawer is closed (no active tab)', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], showCloseButton: true })
    expect(w.find('.vdd-sidebar-drawer-close-button').exists()).toBe(false)
  })
})

// ─── SB30 ────────────────────────────────────────────────────────────────────

describe('SB30: footerAction mirrors headerAction, pinned to the bottom, and can mix tabs and action buttons', () => {
  it('renders no footer-area when footerAction is omitted', () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    expect(w.find('.vdd-sidebar-footer-area').exists()).toBe(false)
  })

  it('renders a single action button in .vdd-sidebar-footer-area, firing onClick without touching activeTabId', async () => {
    const onClick = vi.fn()
    const onUpdate = vi.fn()
    const w = mountSidebar({
      tabs: [makeTab('a')],
      footerAction: { id: 'settings', icon: Icon, label: 'Settings', onClick },
      'onUpdate:activeTabId': onUpdate,
    })
    const area = w.get('.vdd-sidebar-footer-area')
    expect(area.findAll('button')).toHaveLength(1)
    await area.get('button').trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('adds the --has-footer-action modifier class to the strip only when footerAction is present', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')] })
    const strip = () => w.get('.vdd-sidebar-tabs-strip')
    expect(strip().classes()).not.toContain('vdd-sidebar-tabs-strip--has-footer-action')
    await w.setProps({ footerAction: { icon: Icon, label: 'Settings', onClick: () => {} } })
    expect(strip().classes()).toContain('vdd-sidebar-tabs-strip--has-footer-action')
  })

  it('accepts an array mixing an action button and a real tab, rendering both in the footer area', () => {
    const w = mountSidebar({
      tabs: [makeTab('a')],
      footerAction: [{ id: 'settings', icon: Icon, label: 'Settings', onClick: () => {} }, makeTab('help')],
    })
    const area = w.get('.vdd-sidebar-footer-area')
    expect(area.findAll('button')).toHaveLength(2)
    expect(area.find('[data-vdd-rail-action="settings"]').exists()).toBe(true)
    expect(area.find('[data-vdd-sidebar-tab="help"]').exists()).toBe(true)
  })

  it('a tab entry inside footerAction behaves exactly like a main-list tab: mounts, activates, and renders its content on click', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], footerAction: [makeTab('help')] })
    expect(content(w, 'help').exists()).toBe(false)
    await tabButton(w, 'help').trigger('click')
    expect(tabButton(w, 'help').attributes('aria-pressed')).toBe('true')
    expect(content(w, 'help').exists()).toBe(true)
  })

  it('removing a footer tab while active closes the drawer instead of leaving stale content (SB27 for rail tabs)', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], footerAction: [makeTab('help')] })
    await tabButton(w, 'help').trigger('click')
    expect(content(w, 'help').exists()).toBe(true)
    await w.setProps({ footerAction: [] })
    await nextTick()
    expect(drawer(w).style.flexBasis).toBe('0px')
    expect(content(w, 'help').exists()).toBe(false)
  })

  it('a single-object headerAction keeps working alongside footerAction', async () => {
    const onHeader = vi.fn()
    const onFooter = vi.fn()
    const w = mountSidebar({
      tabs: [makeTab('a')],
      headerAction: { id: 'burger', icon: Icon, label: 'Menu', onClick: onHeader },
      footerAction: { id: 'settings', icon: Icon, label: 'Settings', onClick: onFooter },
    })
    await w.get('[data-vdd-rail-action="burger"]').trigger('click')
    await w.get('[data-vdd-rail-action="settings"]').trigger('click')
    expect(onHeader).toHaveBeenCalledTimes(1)
    expect(onFooter).toHaveBeenCalledTimes(1)
  })
})

// ─── SB31 ────────────────────────────────────────────────────────────────────

describe('SB31: hidden tab renders no rail button', () => {
  it('omits the button for a hidden tab while other tabs still render theirs', () => {
    const w = mountSidebar({ tabs: [makeTab('a'), makeTab('secret', { hidden: true }), makeTab('b')] })
    expect(railButtons(w)).toHaveLength(2)
    expect(w.find('[data-vdd-sidebar-tab="secret"]').exists()).toBe(false)
    expect(w.find('[data-vdd-sidebar-tab="a"]').exists()).toBe(true)
  })
})

// ─── SB32 ────────────────────────────────────────────────────────────────────

describe('SB32: hidden tab still opens through useSidebar()', () => {
  it('mounts drawer content for a hidden tab when opened programmatically', async () => {
    let api!: ReturnType<typeof useSidebar>
    const w = mountSidebar({ tabs: [makeTab('a'), makeTab('secret', { hidden: true })] }, {
      slots: { default: () => h(contextProbe(a => { api = a })) },
    })
    api.openTab('secret')
    await nextTick()
    expect(content(w, 'secret').exists()).toBe(true)
    expect(drawer(w).style.flexBasis).not.toBe('0px')
  })
})

// ─── SB33 ────────────────────────────────────────────────────────────────────

describe('SB33: hidden tab still opens via a controlled activeTabId', () => {
  it('mounts drawer content for a hidden tab set as the controlled active tab', () => {
    const w = mountSidebar({
      tabs: [makeTab('a'), makeTab('secret', { hidden: true })], activeTabId: 'secret',
    })
    expect(content(w, 'secret').exists()).toBe(true)
    expect(railButtons(w)).toHaveLength(1)
  })
})

// ─── SB34 ────────────────────────────────────────────────────────────────────

describe('SB34: hidden entry inside headerAction/footerAction renders no button but still opens', () => {
  it('headerAction: a hidden tab entry renders no button but still opens', async () => {
    let api!: ReturnType<typeof useSidebar>
    const w = mountSidebar({ tabs: [], headerAction: [makeTab('secret', { hidden: true })] }, {
      slots: { default: () => h(contextProbe(a => { api = a })) },
    })
    expect(railButtons(w)).toHaveLength(0)
    api.openTab('secret')
    await nextTick()
    expect(content(w, 'secret').exists()).toBe(true)
  })

  it('footerAction: a hidden tab entry renders no button but still opens', async () => {
    let api!: ReturnType<typeof useSidebar>
    const w = mountSidebar({ tabs: [], footerAction: [makeTab('secret', { hidden: true })] }, {
      slots: { default: () => h(contextProbe(a => { api = a })) },
    })
    expect(railButtons(w)).toHaveLength(0)
    api.openTab('secret')
    await nextTick()
    expect(content(w, 'secret').exists()).toBe(true)
  })
})

// ─── SB35 ────────────────────────────────────────────────────────────────────

describe('SB35: every tab hidden -> zero rail buttons, all still individually openable', () => {
  it('renders no buttons in the tabs list when every tab is hidden, but each still opens', async () => {
    let api!: ReturnType<typeof useSidebar>
    const w = mountSidebar({
      tabs: [makeTab('a', { hidden: true }), makeTab('b', { hidden: true })],
    }, { slots: { default: () => h(contextProbe(x => { api = x })) } })
    expect(w.get('.vdd-sidebar-tabs-list').findAll('button')).toHaveLength(0)
    for (const id of ['a', 'b']) {
      api.openTab(id)
      await nextTick()
      expect(content(w, id).exists()).toBe(true)
    }
  })

  it('composes with a visible headerAction hamburger: rail shows exactly one button while all tabs stay hidden', () => {
    const w = mountSidebar({
      tabs: [makeTab('a', { hidden: true }), makeTab('b', { hidden: true })],
      headerAction: { id: 'burger', icon: Icon, label: 'Menu', onClick: () => {} },
    })
    expect(railButtons(w)).toHaveLength(1)
    expect(w.find('[data-vdd-rail-action="burger"]').exists()).toBe(true)
  })
})

// ─── SB36 ────────────────────────────────────────────────────────────────────

describe('SB36: auto-close-if-removed guard still fires when the removed active tab was hidden', () => {
  it('closes when the active hidden tab is removed, mirroring SB27 for a visible tab', async () => {
    let api!: ReturnType<typeof useSidebar>
    const w = mountSidebar({ tabs: [makeTab('a'), makeTab('secret', { hidden: true })] }, {
      slots: { default: () => h(contextProbe(x => { api = x })) },
    })
    api.openTab('secret')
    await nextTick()
    expect(content(w, 'secret').exists()).toBe(true)
    await w.setProps({ tabs: [makeTab('a')] })
    await nextTick()
    expect(drawer(w).style.flexBasis).toBe('0px')
    expect(content(w, 'secret').exists()).toBe(false)
  })
})

// ─── SB37 ────────────────────────────────────────────────────────────────────

describe('SB37: hideDefaultHeader suppresses the drawer header for every tab, not per-tab', () => {
  it('renders no .vdd-sidebar-drawer-header for any tab, even with showCloseButton set', async () => {
    const w = mountSidebar({
      tabs: [makeTab('a'), makeTab('b')], activeTabId: 'a',
      hideDefaultHeader: true, showCloseButton: true,
    })
    expect(w.find('.vdd-sidebar-drawer-header').exists()).toBe(false)
    await w.setProps({ activeTabId: 'b' })
    expect(w.find('.vdd-sidebar-drawer-header').exists()).toBe(false)
  })
})

// ─── SB38 ────────────────────────────────────────────────────────────────────

describe('SB38: the default header still renders when hideDefaultHeader is omitted', () => {
  it('renders .vdd-sidebar-drawer-header and its title as before (contrast with SB37)', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a' })
    expect(w.find('.vdd-sidebar-drawer-header').exists()).toBe(true)
    expect(w.get('.vdd-sidebar-header-title').text()).toBe('Tab a')
  })
})

// ─── SB39 ────────────────────────────────────────────────────────────────────

describe('SB39: the #header slot renders in place of the default header and its close prop collapses the drawer', () => {
  it('renders the #header slot for the active tab, and its close slot prop closes the drawer', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')] }, {
      slots: {
        header: (p: { tab: SidebarTab; close: () => void }) =>
          h('div', { 'data-custom-header': p.tab.id }, [
            h('button', { 'data-custom-close': '', onClick: p.close }, 'x'),
          ]),
      },
    })
    await tabButton(w, 'a').trigger('click')
    expect(w.find('[data-custom-header="a"]').exists()).toBe(true)
    expect(w.find('.vdd-sidebar-drawer-header').exists()).toBe(false)
    await w.get('[data-custom-close]').trigger('click')
    expect(drawer(w).style.flexBasis).toBe('0px')
  })
})

// ─── SB40 ────────────────────────────────────────────────────────────────────

describe('SB40: hideDefaultHeader with no #header slot renders nothing for the header; useSidebarTab().close still works', () => {
  it('renders no default header, no slot output, and a nested close still collapses the drawer', async () => {
    const Closer = defineComponent({
      name: 'Closer',
      setup() {
        const tab = useSidebarTab()
        return () => h('button', { 'data-nested-close': tab.tabId, onClick: tab.close }, 'close')
      },
    })
    const w = mountSidebar({ tabs: [makeTab('a', { component: Closer })], hideDefaultHeader: true })
    await tabButton(w, 'a').trigger('click')
    expect(w.find('.vdd-sidebar-drawer-header').exists()).toBe(false)
    const btn = w.get('[data-nested-close="a"]')
    await btn.trigger('click')
    expect(drawer(w).style.flexBasis).toBe('0px')
  })
})

// ─── SB41 ────────────────────────────────────────────────────────────────────

describe('SB41: the #header slot alone, without hideDefaultHeader, suppresses the default header', () => {
  it('renders the slot output and no default header, with hideDefaultHeader omitted entirely', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a' }, {
      slots: { header: () => h('div', { 'data-custom-header': 'yes' }, 'mine') },
    })
    expect(w.find('[data-custom-header="yes"]').exists()).toBe(true)
    expect(w.find('.vdd-sidebar-drawer-header').exists()).toBe(false)
  })

  it('renders no .vdd-sidebar-drawer-close-button even with showCloseButton set, since the default header is fully skipped', () => {
    const w = mountSidebar({ tabs: [makeTab('a')], activeTabId: 'a', showCloseButton: true }, {
      slots: { header: () => h('div', 'mine') },
    })
    expect(w.find('.vdd-sidebar-drawer-close-button').exists()).toBe(false)
  })
})

// ─── SB42 ────────────────────────────────────────────────────────────────────

describe('SB42: dev-only console.warn when showCloseButton has no effect', () => {
  let original: string | undefined
  let warn: MockInstance<(...args: unknown[]) => void>

  beforeEach(() => {
    original = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) as MockInstance<(...args: unknown[]) => void>
  })

  afterEach(() => {
    process.env.NODE_ENV = original
    warn.mockRestore()
  })

  const messages = () => warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('showCloseButton'))

  it('warns when showCloseButton and hideDefaultHeader are both set', () => {
    mountSidebar({ tabs: [makeTab('a')], showCloseButton: true, hideDefaultHeader: true })
    expect(messages()).toHaveLength(1)
  })

  it('warns when showCloseButton and a #header slot are both given, with hideDefaultHeader omitted', () => {
    mountSidebar({ tabs: [makeTab('a')], showCloseButton: true }, {
      slots: { header: () => h('div', 'mine') },
    })
    expect(messages()).toHaveLength(1)
  })

  it('does not warn when only showCloseButton is set', () => {
    mountSidebar({ tabs: [makeTab('a')], showCloseButton: true })
    expect(messages()).toHaveLength(0)
  })

  it('does not warn when only hideDefaultHeader is set (no showCloseButton)', () => {
    mountSidebar({ tabs: [makeTab('a')], hideDefaultHeader: true })
    expect(messages()).toHaveLength(0)
  })

  it('warns only once even across multiple updates', async () => {
    const w = mountSidebar({ tabs: [makeTab('a')], showCloseButton: true, hideDefaultHeader: true })
    await w.setProps({ tabs: [makeTab('a'), makeTab('b')] })
    await w.setProps({ activeTabId: 'a' })
    await w.setProps({ hideDefaultHeader: false })
    await w.setProps({ hideDefaultHeader: true })
    expect(messages()).toHaveLength(1)
  })
})

// ─── SB43 ────────────────────────────────────────────────────────────────────

/** A primary with a secondary nested in its default slot. */
function mountPair(
  primary: SidebarMountProps,
  secondary: SidebarMountProps,
  inner?: () => unknown,
): VueWrapper {
  const wrapper = mount(VddSidebar, {
    props: primary as SidebarProps,
    attachTo: document.body,
    slots: { default: () => h(VddSecondarySidebar, secondary as SecondaryProps, inner ? { default: inner } : undefined) },
  }) as VueWrapper
  mounted.push(wrapper)
  return wrapper
}

describe('SB43: VddSecondarySidebar renders on the opposite side automatically', () => {
  it('primary position="left" -> secondary renders on the right', () => {
    const w = mountPair({ tabs: [makeTab('a')], position: 'left' }, { tabs: [makeTab('b')] })
    const sides = w.findAll('[data-vdd-sidebar]').map(el => el.attributes('data-vdd-sidebar'))
    expect(sides).toEqual(['left', 'right'])
  })

  it('primary position="right" -> secondary renders on the left', () => {
    const w = mountPair({ tabs: [makeTab('a')], position: 'right' }, { tabs: [makeTab('b')] })
    const sides = w.findAll('[data-vdd-sidebar]').map(el => el.attributes('data-vdd-sidebar'))
    expect(sides).toEqual(['right', 'left'])
  })
})

// ─── SB44 ────────────────────────────────────────────────────────────────────

describe('SB44: VddSecondarySidebar with no primary ancestor throws', () => {
  it('throws when rendered standalone', () => {
    expect(() => mount(VddSecondarySidebar, { props: { tabs: [makeTab('a')] } }))
      .toThrow(/must be rendered inside a <VddSidebar>/)
  })
})

// ─── SB45 ────────────────────────────────────────────────────────────────────

describe('SB45: VddSecondarySidebar nested inside another one throws', () => {
  it('throws on triple nesting', () => {
    expect(() => mount(VddSidebar, {
      props: { tabs: [makeTab('a')], position: 'left' },
      slots: {
        default: () => h(VddSecondarySidebar, { tabs: [makeTab('b')] }, {
          default: () => h(VddSecondarySidebar, { tabs: [makeTab('c')] }),
        }),
      },
    })).toThrow(/cannot be nested inside another one/)
  })
})

// ─── SB46 ────────────────────────────────────────────────────────────────────

describe('SB46: useSidebar() reports the correct position/isSecondary at both levels', () => {
  it('each level sees its own correct context value', () => {
    const seen: { position: string; isSecondary: boolean }[] = []
    const probe = () => h(contextProbe(a => { seen.push({ position: a.position, isSecondary: a.isSecondary }) }))
    mounted.push(mount(VddSidebar, {
      props: { tabs: [makeTab('a')], position: 'left' },
      attachTo: document.body,
      slots: { default: () => [probe(), h(VddSecondarySidebar, { tabs: [makeTab('b')] }, { default: probe })] },
    }) as VueWrapper)
    expect(seen).toEqual([
      { position: 'left', isSecondary: false },
      { position: 'right', isSecondary: true },
    ])
  })
})

// ─── SB47 ────────────────────────────────────────────────────────────────────

describe('SB47: resizing one sidebar does not suppress the other\'s transition', () => {
  it('dragging the primary\'s resize handle leaves the secondary\'s drawer transition untouched, and vice versa', async () => {
    // Each instance owns its own `resizing` flag. A single module-level flag would work in
    // every single-sidebar test and fail only here — which is why this test exists.
    const w = mountPair(
      { tabs: [makeTab('a')], position: 'left', activeTabId: 'a' },
      { tabs: [makeTab('b')], activeTabId: 'b' },
    )
    const drawers = w.findAll('.vdd-sidebar-content-drawer').map(d => d.element as HTMLElement)
    const bars = w.findAll('[data-vdd-sidebar-resizer]').map(b => b.element as HTMLElement)
    expect(drawers).toHaveLength(2)
    expect(bars).toHaveLength(2)
    const primaryDrawer = drawers[0]!
    const secondaryDrawer = drawers[1]!
    const primaryBar = bars[0]!
    const secondaryBar = bars[1]!

    const down = (bar: HTMLElement, id: number) => {
      bar.setPointerCapture = vi.fn()
      bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, clientX: 0, clientY: 0 }))
    }
    const up = (bar: HTMLElement, id: number) =>
      bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id }))

    const secondaryBefore = secondaryDrawer.style.transition
    down(primaryBar, 1)
    await nextTick()
    expect(primaryDrawer.style.transition).toBe('none')
    expect(secondaryDrawer.style.transition).toBe(secondaryBefore)
    up(primaryBar, 1)
    await nextTick()

    const primaryBefore = primaryDrawer.style.transition
    down(secondaryBar, 2)
    await nextTick()
    expect(secondaryDrawer.style.transition).toBe('none')
    expect(primaryDrawer.style.transition).toBe(primaryBefore)
    up(secondaryBar, 2)
  })
})

// ─── SB48 ────────────────────────────────────────────────────────────────────

describe('SB48: a hidden tab on the secondary has no rail button but is still openable', () => {
  it('renders no rail button for the hidden secondary tab, but opening it still works', async () => {
    let api!: ReturnType<typeof useSidebar>
    const w = mountPair(
      { tabs: [makeTab('a')], position: 'left' },
      { tabs: [makeTab('hid', { hidden: true })] },
      () => h(contextProbe(x => { api = x })),
    )
    expect(w.find('[data-vdd-sidebar-tab="hid"]').exists()).toBe(false)
    api.openTab('hid')
    await nextTick()
    expect(content(w, 'hid').exists()).toBe(true)
  })
})

// ─── SB49 ────────────────────────────────────────────────────────────────────

describe('SB49: headerAction on the secondary renders and fires onClick', () => {
  it('renders the secondary\'s headerAction button and calls onClick', async () => {
    const onClick = vi.fn()
    const w = mountPair(
      { tabs: [makeTab('a')], position: 'left' },
      { tabs: [makeTab('b')], headerAction: { id: 'sec', icon: Icon, label: 'Sec', onClick } },
    )
    await w.get('[data-vdd-rail-action="sec"]').trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

// ─── SB50 ────────────────────────────────────────────────────────────────────

describe('SB50: a controlled activeTabId works on the secondary', () => {
  it('the secondary drawer reflects the controlled activeTabId, and reports changes', async () => {
    const onUpdate = vi.fn()
    const w = mountPair(
      { tabs: [makeTab('a')], position: 'left' },
      { tabs: [makeTab('b'), makeTab('c')], activeTabId: 'b', 'onUpdate:activeTabId': onUpdate },
    )
    expect(content(w, 'b').exists()).toBe(true)
    await tabButton(w, 'c').trigger('click')
    expect(onUpdate).toHaveBeenCalledWith('c')
  })
})

// ─── SB51 ────────────────────────────────────────────────────────────────────

describe('SB51: useSidebarTab() inside a secondary tab resolves to that tab\'s own close', () => {
  it('closing from inside the secondary tab closes the secondary, not the primary', async () => {
    const Closer = defineComponent({
      name: 'SecondaryCloser',
      setup() {
        const tab = useSidebarTab()
        return () => h('button', { 'data-sec-close': tab.tabId, onClick: tab.close }, 'close')
      },
    })
    // The secondary is controlled, so it reports the close rather than performing it. Reading
    // the listener also proves the secondary forwards the model's listeners through `$attrs`:
    // forwarding only the declared props would leave every v-model on a secondary inert.
    const onSecondary = vi.fn()
    const onPrimary = vi.fn()
    const w = mountPair(
      { tabs: [makeTab('a')], position: 'left', activeTabId: 'a', 'onUpdate:activeTabId': onPrimary },
      { tabs: [makeTab('b', { component: Closer })], activeTabId: 'b', 'onUpdate:activeTabId': onSecondary },
    )
    const drawers = w.findAll('.vdd-sidebar-content-drawer').map(d => d.element as HTMLElement)
    expect(drawers[0]!.style.flexBasis).toBe('280px')
    expect(drawers[1]!.style.flexBasis).toBe('280px')

    await w.get('[data-sec-close="b"]').trigger('click')
    expect(onSecondary).toHaveBeenCalledWith(null)
    expect(onPrimary).not.toHaveBeenCalled()
    expect(drawers[0]!.style.flexBasis).toBe('280px')
  })
})
