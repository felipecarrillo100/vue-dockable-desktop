<script setup lang="ts">
/**
 * The activity bar and its resizable drawer.
 *
 * rdd exposed eight imperative methods for this through a ref — `openTab`, `closeDrawer`,
 * `getActiveTab`, `show`, `hide`, `toggle`, `setWidth`, `getWidth` — because React cannot
 * express two-way props. Every one of them was a getter or setter for state, so here they
 * are four models: `active-tab-id`, `visible`, `strip-visible`, `width`
 * (docs/decisions/0005-vmodel.md). Binding a model makes the caller the source of truth;
 * omitting it lets the component keep its own.
 */
import { computed, provide, ref, watch } from 'vue'
import type { SidebarProps, SidebarTab } from '../core/sidebarTypes'
import { SIDEBAR_KEY, isTabEntry, toRailArray } from '../core/sidebarTypes'
import { isRtlElement, startPointerDrag } from '../core/dragResize'
import VddSidebarRail from './VddSidebarRail.vue'
import VddSidebarDrawer from './VddSidebarDrawer.vue'

const props = withDefaults(defineProps<SidebarProps>(), {
  position: 'right',
  minWidth: 150,
  maxWidth: 600,
  showCloseButton: false,
  hideDefaultHeader: false,
  isSecondary: false,
})

const slots = defineSlots<{
  default?: () => unknown
  /** Replaces the library's drawer header, for whichever tab is open. */
  header?: (props: { tab: SidebarTab; close: () => void; open: () => void }) => unknown
  /** Content for one tab, by id: `#tab-layers`. */
  [key: `tab-${string}`]: (props: { tab: SidebarTab; close: () => void; open: () => void }) => unknown
}>()

/** The open tab, or `null` when the drawer is closed. */
const activeTabId = defineModel<string | null>('activeTabId', { default: null })
/** Whether the whole sidebar — strip and drawer — is shown. */
const visible = defineModel<boolean>('visible', { default: true })
/** Whether the activity strip is shown. The drawer is unaffected. */
const stripVisible = defineModel<boolean>('stripVisible', { default: true })
/** Drawer width in pixels. */
const width = defineModel<number>('width', { default: 280 })

const headerEntries = computed(() => toRailArray(props.headerAction))
const footerEntries = computed(() => toRailArray(props.footerAction))
/** A header or footer tab behaves exactly like a main-list tab, so they share one list. */
const allTabs = computed<SidebarTab[]>(() => [
  ...headerEntries.value.filter(isTabEntry),
  ...props.tabs,
  ...footerEntries.value.filter(isTabEntry),
])

/** Tabs mounted at least once, for lazy mounting and `preserveState`. */
const everMounted = ref(new Set<string>())

/**
 * Which tabs are currently mounted.
 *
 * Derived rather than tracked in an effect: the accumulated set, plus the open tab (which
 * covers a controlled model changing without going through `openTab`), plus every eager tab.
 */
const mountedTabs = computed(() => {
  const result = new Set(everMounted.value)
  if (activeTabId.value) result.add(activeTabId.value)
  for (const tab of allTabs.value) if (tab.eagerMount) result.add(tab.id)
  return result
})

function setActive(id: string | null): void {
  if (id !== null) {
    if (!everMounted.value.has(id)) {
      const next = new Set(everMounted.value)
      next.add(id)
      everMounted.value = next
    }
  } else {
    // Closing: drop tabs that asked for neither eager mounting nor preserved state.
    const next = new Set(everMounted.value)
    let changed = false
    for (const id2 of everMounted.value) {
      const tab = allTabs.value.find(t => t.id === id2)
      if (tab && !tab.eagerMount && !tab.preserveState) { next.delete(id2); changed = true }
    }
    if (changed) everMounted.value = next
  }
  activeTabId.value = id
}

/**
 * If the open tab stops existing — its contributing panel closed, or the list changed — close
 * the drawer rather than leaving it open and empty with no button left to close it. Never
 * silently fall back to a different tab the user did not choose.
 */
watch([activeTabId, allTabs], ([id, tabs]) => {
  if (id != null && !tabs.some(t => t.id === id)) setActive(null)
}, { immediate: true })

/** Mounted tabs, in rail order, for the drawer. */
const mountedList = computed(() => allTabs.value.filter(t => mountedTabs.value.has(t.id)))


const isVisible = computed(() => visible.value !== false)
const isStripVisible = computed(() => isVisible.value && stripVisible.value !== false)
const isOpen = computed(() => isVisible.value && activeTabId.value != null)
const openTab = computed(() => allTabs.value.find(t => t.id === activeTabId.value) ?? null)

/** A `#header` slot suppresses the default header on its own, as does the prop. */
const headerOverridden = computed(() => props.hideDefaultHeader || slots.header !== undefined)

const toggleTab = (id: string) => setActive(activeTabId.value === id ? null : id)
const close = () => setActive(null)

// ── resizing ───────────────────────────────────────────────────────────────
const resizing = ref(false)

function onResizeDown(event: PointerEvent): void {
  event.preventDefault()
  const el = event.currentTarget as HTMLElement
  // The layout is a flex row, so under RTL `position="left"` renders on the right edge. What
  // decides the sign is the physical edge, not the prop.
  const onRight = (props.position === 'right') !== isRtlElement(el)
  resizing.value = true
  startPointerDrag({
    element: el,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    captureStart: () => width.value,
    activeClasses: [
      { el, classes: ['vdd-active'] },
      { el: document.body, classes: ['vdd-resizing-active', 'vdd-resizing-col-active'] },
    ],
    // A drawer on the right edge grows when the pointer moves left, so the delta is inverted.
    onMove: (dx, _dy, start) => {
      const next = onRight ? start - dx : start + dx
      width.value = Math.max(props.minWidth, Math.min(props.maxWidth, next))
    },
    onEnd: () => { resizing.value = false },
  })
}

// ── context for descendants ────────────────────────────────────────────────
provide(SIDEBAR_KEY, {
  openTab: (id: string) => setActive(id),
  closeDrawer: close,
  activeTabId,
  position: props.position,
  isSecondary: props.isSecondary,
})

const dev = process.env.NODE_ENV !== 'production'
let warnedCloseButton = false
watch([() => props.showCloseButton, headerOverridden], ([show, overridden]) => {
  if (!dev || !show || !overridden || warnedCloseButton) return
  warnedCloseButton = true
  console.warn(
    '[vue-dockable-desktop] `showCloseButton` has no effect because the default drawer header ' +
    'is suppressed (`hideDefaultHeader` is set, or a #header slot was provided). The button is ' +
    'part of that header. Put your own close control in the #header slot, wired to its `close`.',
  )
}, { immediate: true })

let warnedMissingContent = false
watch(openTab, (tab) => {
  if (!dev || !tab || warnedMissingContent) return
  if (slots[`tab-${tab.id}`] || tab.component) return
  warnedMissingContent = true
  console.warn(
    `[vue-dockable-desktop] Sidebar tab "${tab.id}" has no content: give it a #tab-${tab.id} ` +
    `slot or a \`component\`. The drawer will open empty.`,
  )
})
</script>

<template>
  <div class="vdd-sidebar-layout" :data-vdd-sidebar="position">
    <!--
      Left and right are the same three pieces in opposite order. Rendered from one list so
      neither arrangement can drift from the other.
    -->
    <template v-for="piece in position === 'left' ? ['rail', 'drawer', 'resizer', 'main'] : ['main', 'resizer', 'drawer', 'rail']" :key="piece">
      <VddSidebarRail
        v-if="piece === 'rail'"
        :tabs="tabs"
        :header="headerEntries"
        :footer="footerEntries"
        :active-tab-id="activeTabId"
        :position="position"
        :visible="isStripVisible"
        @select="toggleTab"
      />

      <VddSidebarDrawer
        v-else-if="piece === 'drawer'"
        :tabs="mountedList"
        :active-tab-id="activeTabId"
        :position="position"
        :open="isOpen"
        :width="width"
        :min-width="minWidth"
        :max-width="maxWidth"
        :header-overridden="headerOverridden"
        :show-close-button="showCloseButton"
        :resizing="resizing"
        @close="close"
        @open="setActive"
      >
        <template v-if="$slots.header" #header="slotProps">
          <slot name="header" v-bind="slotProps" />
        </template>
        <template v-for="tab in mountedList" :key="tab.id" #[`tab-${tab.id}`]="slotProps">
          <slot :name="`tab-${tab.id}`" v-bind="slotProps" />
        </template>
      </VddSidebarDrawer>

      <div
        v-else-if="piece === 'resizer' && isOpen"
        class="vdd-resizer-bar"
        data-vdd-sidebar-resizer
        :style="{ cursor: 'col-resize', width: '1px', height: '100%', flexShrink: 0, zIndex: 20 }"
        @pointerdown="onResizeDown"
      />

      <div v-else-if="piece === 'main'" class="vdd-sidebar-main"><slot /></div>
    </template>
  </div>
</template>
