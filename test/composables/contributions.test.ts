/**
 * Panel contributions — toolbar items and sidebar sections a panel publishes while active.
 *
 * A port of rdd's `PanelContribution.test.tsx` (14 tests, PC1–PC13, names preserved). Three
 * shapes changed, each noted at its test:
 *
 *   rdd                                  vdd
 *   ──────────────────────────────────    ──────────────────────────────────────────
 *   `<PanelContributionProvider>`        the workspace store (ADR 0004)      (PC7, PC8)
 *   `usePanelContribution(object)`       `usePanelContribution(getter)`            (PC2)
 *   `useMergedToolbarItems()` (a hook)   also `mergeToolbarItems()`, a function   (PC10)
 *
 * PC12 and PC13 are the two that matter most, and they are not really about contributions:
 * they are about the invariant underneath. A contribution is read from `activePanelId`, so
 * the feature is only trustworthy if `activePanelId` never names a panel the user cannot see.
 * rdd seeded it from `Object.keys(panels)[0]` on restore, which is insertion order, not
 * visibility — so the shell's toolbar showed the *hidden* tab's controls. That is divergence
 * D2, fixed in M3, and these two tests are what prove the fix reaches this feature.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref, watch } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import {
  usePanelContribution, useActiveContribution, useMergedToolbarItems, useMergedSidebarTabs,
} from '../../src/composables/useContributions'
import { mergeSidebarTabs, mergeToolbarItems, sectionToTab } from '../../src/core/contributions'
import type { PanelContribution, PanelSidebarSection } from '../../src/core/contributions'
import type { ToolbarItem } from '../../src/core/toolbarTypes'
import type { SidebarTab } from '../../src/core/sidebarTypes'

const Icon = defineComponent({ name: 'Icon', setup: () => () => h('svg') })

/** Item ids, with a separator shown as `|` — the shape every merge assertion below wants. */
const ids = (items: ToolbarItem[]): string[] =>
  items.map(item => (item.type === 'separator' ? '|' : item.id))

/** The first contributed item's id, or `null`. A separator can never be first here. */
const firstItemId = (c: PanelContribution | null): string | null => {
  const first = c?.toolbarItems?.[0]
  return first && first.type !== 'separator' ? first.id : null
}
const Fallback = defineComponent({ name: 'Fallback', setup: () => () => h('svg') })
const Content = defineComponent({ name: 'Content', setup: () => () => h('div', 'section') })

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount').forEach(el => el.remove())
  document.body.innerHTML = ''
})

/** A panel that contributes one toolbar item and one section, both naming itself. */
const Contributor = defineComponent({
  name: 'Contributor',
  props: { panelId: { type: String, default: '' } },
  setup(props) {
    usePanelContribution(() => ({
      toolbarItems: [{ type: 'action', id: `act-${props.panelId}`, label: props.panelId, icon: Icon, onClick: () => {} }],
      sidebarSections: [{ id: `sec-${props.panelId}`, label: `sec-${props.panelId}`, component: Content }],
    }))
    return () => h('div', { 'data-contributor': props.panelId })
  },
})

/** A panel that publishes nothing at all. */
const Silent = defineComponent({
  name: 'Silent',
  props: { panelId: { type: String, default: '' } },
  setup: () => () => h('div', 'silent'),
})

function setup(initialState?: string) {
  const ws = createWorkspace({
    panels: { contributor: { component: Contributor }, silent: { component: Silent } },
    ...(initialState ? { initialState } : {}),
  })
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  return { ws, wrapper }
}

// ─── PC1–PC6 ─────────────────────────────────────────────────────────────────

describe('PanelContribution', () => {
  it('PC1: is null when no panel is active', () => {
    const { ws } = setup()
    expect(ws.state.activePanelId).toBeNull()
    expect(ws.activeContribution.value).toBeNull()
  })

  it('PC2: a published contribution is reflected once its panel becomes active', async () => {
    const { ws } = setup()
    ws.openPanel('p1', 'contributor')
    await nextTick()
    expect(ws.state.activePanelId).toBe('p1')
    expect(firstItemId(ws.activeContribution.value)).toBe('act-p1')
    expect(ws.activeContribution.value?.sidebarSections?.[0]?.label).toBe('sec-p1')
  })

  it('PC3: switching active panel switches which contribution is read', async () => {
    const { ws } = setup()
    ws.openPanel('p1', 'contributor')
    ws.openPanel('p2', 'contributor')
    await nextTick()
    expect(firstItemId(ws.activeContribution.value)).toBe('act-p2')

    ws.focusPanel('p1')
    await nextTick()
    expect(firstItemId(ws.activeContribution.value)).toBe('act-p1')
  })

  it('PC4: two independent instances keep independent, preserved state', async () => {
    // Each instance publishes through its own getter, so the same component type opened
    // twice contributes twice — and neither is clobbered by the other's republish.
    const seen: string[] = []
    const Stateful = defineComponent({
      name: 'Stateful',
      props: { panelId: { type: String, default: '' } },
      setup(props) {
        const tool = ref(`pan-${props.panelId}`)
        usePanelContribution(() => ({
          toolbarItems: [{ type: 'action', id: tool.value, label: tool.value, icon: Icon, onClick: () => {} }],
        }))
        seen.push(props.panelId)
        return () => h('div', { 'data-tool': tool.value })
      },
    })
    const ws = createWorkspace({ panels: { stateful: { component: Stateful } } })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)

    ws.openPanel('a', 'stateful')
    ws.openPanel('b', 'stateful')
    await nextTick()
    expect(seen).toEqual(['a', 'b'])
    expect(firstItemId(ws.contributions.get('a'))).toBe('pan-a')
    expect(firstItemId(ws.contributions.get('b'))).toBe('pan-b')
  })

  it('PC5: closing the active panel clears its contribution', async () => {
    const { ws } = setup()
    ws.openPanel('p1', 'contributor')
    await nextTick()
    expect(ws.contributions.get('p1')).not.toBeNull()

    ws.closePanel('p1')
    await nextTick()
    expect(ws.contributions.get('p1')).toBeNull()
    expect(ws.activeContribution.value).toBeNull()
  })

  it('PC6: a panel can contribute multiple sidebar sections at once', async () => {
    const Many = defineComponent({
      name: 'Many',
      props: { panelId: { type: String, default: '' } },
      setup() {
        usePanelContribution(() => ({
          sidebarSections: [
            { id: 'one', label: 'One', component: Content },
            { id: 'two', label: 'Two', component: Content },
            { id: 'three', label: 'Three', component: Content },
          ],
        }))
        return () => h('div')
      },
    })
    const ws = createWorkspace({ panels: { many: { component: Many } } })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    ws.openPanel('p1', 'many')
    await nextTick()
    expect(ws.activeContribution.value?.sidebarSections?.map(s => s.id)).toEqual(['one', 'two', 'three'])
  })

  it('a panel contributing nothing yields null while active', async () => {
    const { ws } = setup()
    ws.openPanel('p1', 'silent')
    await nextTick()
    expect(ws.state.activePanelId).toBe('p1')
    expect(ws.activeContribution.value).toBeNull()
  })

  it('PC7: usePanelContribution() outside a workspace throws', () => {
    // rdd threw for a missing `<PanelContributionProvider>`. There is no such provider: the
    // store is on the workspace, so the only prerequisite is the workspace itself.
    const Bare = defineComponent({ setup() { usePanelContribution(() => ({})); return () => h('div') } })
    expect(() => mount(Bare)).toThrow(/createWorkspace\(\)/)
  })

  it('PC8: useActiveContribution() outside a workspace throws', () => {
    const Bare = defineComponent({ setup() { useActiveContribution(); return () => h('div') } })
    expect(() => mount(Bare)).toThrow(/createWorkspace\(\)/)
  })

  it('PC9: sectionToTab() converts, using the fallback icon when the section omits one', () => {
    const withIcon: PanelSidebarSection = { id: 'a', label: 'A', icon: Icon, component: Content }
    const without: PanelSidebarSection = { id: 'b', label: 'B', component: Content }

    expect(sectionToTab(withIcon, Fallback)).toEqual({
      id: 'a', label: 'A', icon: Icon, component: Content, props: undefined,
    })
    expect(sectionToTab(without, Fallback).icon).toBe(Fallback)
    // No fallback given: the tab simply has no icon, which is valid for a hidden tab.
    expect(sectionToTab(without).icon).toBeUndefined()
    // `eagerMount` and `preserveState` are deliberately absent — a contribution only exists
    // while its panel is mounted and active, so neither has anything to mean.
    expect('eagerMount' in sectionToTab(without)).toBe(false)
    expect('preserveState' in sectionToTab(without)).toBe(false)
  })

  it('PC10: merged toolbar items append behind a separator, and are unchanged when empty', () => {
    const base: ToolbarItem[] = [{ type: 'action', id: 'save', label: 'Save', icon: Icon, onClick: () => {} }]
    const contributed: ToolbarItem[] = [{ type: 'action', id: 'draw', label: 'Draw', icon: Icon, onClick: () => {} }]

    expect(mergeToolbarItems(base, null)).toBe(base)                       // same array, untouched
    expect(mergeToolbarItems(base, { toolbarItems: [] })).toBe(base)
    const merged = mergeToolbarItems(base, { toolbarItems: contributed })
    expect(ids(merged)).toEqual(['save', '|', 'draw'])
  })

  it('PC11: merged sidebar tabs append contributed sections, and are unchanged when empty', () => {
    const base: SidebarTab[] = [{ id: 'files', label: 'Files', icon: Icon }]
    const sections: PanelSidebarSection[] = [{ id: 'layers', label: 'Layers', component: Content }]

    expect(mergeSidebarTabs(base, null)).toBe(base)
    expect(mergeSidebarTabs(base, { sidebarSections: [] })).toBe(base)
    const merged = mergeSidebarTabs(base, { sidebarSections: sections }, Fallback)
    expect(merged.map(t => t.id)).toEqual(['files', 'layers'])
    expect(merged[1]!.icon).toBe(Fallback)
  })
})

// ─── PC12–PC13: the invariant underneath ─────────────────────────────────────

describe('PanelContribution after a layout restore', () => {
  /**
   * Two panels in one tab group with the **second** selected, and `panels` key order putting
   * the first one first. rdd seeded `activePanelId` from `Object.keys(panels)[0]`, so it
   * resolved to the hidden panel and the shell surfaced the wrong contribution.
   */
  const RESTORED = JSON.stringify({
    version: 2,
    gridRoot: { type: 'leaf', id: 'g1', panels: ['p1', 'p2'], activePanelId: 'p2' },
    floating: [],
    minimized: [],
    panels: {
      p1: { id: 'p1', title: 'P1', component: 'contributor', state: 'docked', serializable: true },
      p2: { id: 'p2', title: 'P2', component: 'contributor', state: 'docked', serializable: true },
    },
  })

  it('PC12: surfaces the contribution of the panel that is actually visible', async () => {
    const { ws } = setup(RESTORED)
    await nextTick()
    expect(ws.state.activePanelId).toBe('p2')
    expect(ws.activeContribution.value).not.toBeNull()
    expect(ws.activeContribution.value?.sidebarSections?.[0]?.label).toBe('sec-p2')
  })

  it('PC13: renders the visible tab as focused, not unfocused', async () => {
    const { wrapper } = setup(RESTORED)
    await nextTick()
    expect(wrapper.find('[data-vdd-tab="p2"]').classes()).toContain('vdd-workspace-tab-active-focused')
    expect(wrapper.find('[data-vdd-tab="p1"]').classes()).not.toContain('vdd-workspace-tab-active-focused')
  })
})

// ─── The composables over the same merge functions ───────────────────────────

describe('the merge composables track the active panel', () => {
  it('useMergedToolbarItems and useMergedSidebarTabs follow a focus change', async () => {
    // The hooks are thin `computed`s over the plain functions above, so what is worth
    // asserting is that they are reactive — which is the whole reason rdd needed
    // `useSyncExternalStore` for this and vdd needs nothing.
    let items!: ReturnType<typeof useMergedToolbarItems>
    let tabs!: ReturnType<typeof useMergedSidebarTabs>
    const Shell = defineComponent({
      name: 'Shell',
      setup() {
        items = useMergedToolbarItems([{ type: 'action', id: 'save', label: 'Save', icon: Icon, onClick: () => {} }])
        tabs = useMergedSidebarTabs([{ id: 'files', label: 'Files', icon: Icon }], Fallback)
        return () => h('div')
      },
    })
    const ws = createWorkspace({ panels: { contributor: { component: Contributor } } })
    const wrapper = mount(defineComponent({
      components: { VddDesktop, Shell },
      template: '<div><Shell /><VddDesktop /></div>',
    }), { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)

    expect(ids(items.value)).toEqual(['save'])
    expect(tabs.value.map(t => t.id)).toEqual(['files'])

    ws.openPanel('p1', 'contributor')
    await nextTick()
    expect(ids(items.value)).toEqual(['save', '|', 'act-p1'])
    expect(tabs.value.map(t => t.id)).toEqual(['files', 'sec-p1'])

    ws.openPanel('p2', 'contributor')
    await nextTick()
    expect(ids(items.value)).toEqual(['save', '|', 'act-p2'])
    expect(tabs.value.map(t => t.id)).toEqual(['files', 'sec-p2'])
  })

  it('a stale withdrawal cannot clear a newer contribution for the same panel', () => {
    // The guard that makes publish-then-withdraw safe. A republish hands back a new
    // withdrawal, and calling the *previous* one must do nothing — otherwise every update
    // would clear the value it had just written, depending only on call order.
    const ws = createWorkspace({ panels: {} })
    const first: PanelContribution = { toolbarItems: [{ type: 'action', id: 'first', label: 'F', icon: Icon, onClick: () => {} }] }
    const second: PanelContribution = { toolbarItems: [{ type: 'action', id: 'second', label: 'S', icon: Icon, onClick: () => {} }] }

    const withdrawFirst = ws.contributions.publish('p', first)
    const withdrawSecond = ws.contributions.publish('p', second)
    expect(firstItemId(ws.contributions.get('p'))).toBe('second')

    withdrawFirst()
    expect(firstItemId(ws.contributions.get('p'))).toBe('second')

    withdrawSecond()
    expect(ws.contributions.get('p')).toBeNull()
  })

  it('a panel never momentarily publishes nothing while updating', async () => {
    // Withdrawing before publishing would leave a gap anything reading in the same flush
    // would see as the contribution disappearing.
    const tool = ref('pan')
    const observed: (string | null)[] = []
    const Live = defineComponent({
      name: 'Live',
      props: { panelId: { type: String, default: '' } },
      setup() {
        usePanelContribution(() => ({
          toolbarItems: [{ type: 'action', id: tool.value, label: tool.value, icon: Icon, onClick: () => {} }],
        }))
        return () => h('div')
      },
    })
    const ws = createWorkspace({ panels: { live: { component: Live } } })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    ws.openPanel('p1', 'live')
    await nextTick()

    const stop = watch(ws.activeContribution, c => observed.push(firstItemId(c)), { flush: 'sync' })
    tool.value = 'draw'
    await nextTick()
    stop()

    expect(observed).not.toContain(null)
    expect(observed.at(-1)).toBe('draw')
  })

  it('a republished contribution is picked up without re-registering', async () => {
    // rdd asked callers to memoise the object and re-call the hook every render. A getter
    // means the component republishes when its own state changes and never otherwise.
    const tool = ref('pan')
    const Live = defineComponent({
      name: 'Live',
      props: { panelId: { type: String, default: '' } },
      setup() {
        usePanelContribution(() => ({
          toolbarItems: [{ type: 'action', id: tool.value, label: tool.value, icon: Icon, onClick: () => {} }],
        }))
        return () => h('div')
      },
    })
    const ws = createWorkspace({ panels: { live: { component: Live } } })
    const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)

    ws.openPanel('p1', 'live')
    await nextTick()
    expect(firstItemId(ws.activeContribution.value)).toBe('pan')

    tool.value = 'draw'
    await nextTick()
    expect(firstItemId(ws.activeContribution.value)).toBe('draw')
    expect(ws.contributions.ids()).toEqual(['p1'])      // republished, not duplicated
  })
})

// ─── A hidden panel contributes nothing visible ──────────────────────────────

describe('a contribution is never surfaced for a panel the user cannot see', () => {
  it('a minimised panel keeps publishing but is not the active one', async () => {
    // The invariant stated directly: minimising leaves the panel mounted and still
    // publishing, but it is no longer active, so the shell must not show its controls.
    const { ws } = setup()
    ws.openPanel('p1', 'contributor')
    await nextTick()
    expect(firstItemId(ws.activeContribution.value)).toBe('act-p1')

    ws.minimizePanel('p1')
    await nextTick()
    expect(ws.state.activePanelId).not.toBe('p1')
    expect(ws.activeContribution.value).toBeNull()
    // Still mounted and still published — restoring it surfaces the same contribution again.
    expect(firstItemId(ws.contributions.get('p1'))).toBe('act-p1')

    ws.restorePanel('p1')
    await nextTick()
    expect(firstItemId(ws.activeContribution.value)).toBe('act-p1')
  })

  it('a background tab keeps publishing but is not the active one', async () => {
    const { ws } = setup()
    ws.openPanel('p1', 'contributor')
    ws.openPanel('p2', 'contributor')
    await nextTick()
    // p2 is the visible tab; p1 is behind it and must not be surfaced.
    expect(firstItemId(ws.activeContribution.value)).toBe('act-p2')
    expect(ws.contributions.get('p1')).not.toBeNull()
    expect(ws.contributions.ids().sort()).toEqual(['p1', 'p2'])
  })
})

// ─── Standalone ──────────────────────────────────────────────────────────────

describe('usePanelContribution outside a panel', () => {
  it('warns and does nothing rather than throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const ws = createWorkspace({ panels: {} })
      const Bare = defineComponent({
        setup() { usePanelContribution(() => ({ toolbarItems: [] })); return () => h('div') },
      })
      const wrapper = mount(Bare, { global: { plugins: [ws] } }) as VueWrapper
      mounted.push(wrapper)
      expect(ws.contributions.ids()).toEqual([])
      expect(warn.mock.calls.some(c => String(c[0]).includes('usePanelContribution'))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })
})
