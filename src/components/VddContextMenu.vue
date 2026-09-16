<script setup lang="ts">
/**
 * The context-menu host.
 *
 * Renders whatever menu the workspace has pending, so `showContextMenu()` works from any
 * component — or from no component at all. rdd needed a provider, an adapter ref and a
 * registration handshake to make the menu reachable from both sides of the workspace in the
 * component tree; here the request is just state.
 *
 * Mount one of these once, alongside `<VddDesktop>`.
 */
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import type { ContextMenuItem, ContextMenuSimpleItem, ContextMenuSubMenu } from '../core/contextMenu'
import { clampToViewport, isSeparator, isSubMenu } from '../core/contextMenu'
import { useWorkspace } from '../composables/useWorkspace'

withDefaults(defineProps<{
  /** Visual theme hook, mirrored onto the menu's class. @default 'dark' */
  theme?: string
}>(), { theme: 'dark' })

defineSlots<{
  /**
   * Render the whole menu yourself, with your own UI kit.
   *
   * Replaces rdd's `ContextMenuAdapter`, whose single field was a component to swap in — a
   * slot is the Vue spelling of exactly that (docs/decisions/0007-slots-over-render-props.md),
   * and it needs no provider, no ref handshake and no adapter object.
   *
   * `items` is the pending menu, `x`/`y` the requested position, and `close` dismisses it.
   * Positioning and dismissal are then yours: the built-in clamping, Escape handling and
   * outside-click handling belong to the built-in markup this replaces.
   */
  default?: (props: { items: ContextMenuItem[]; x: number; y: number; close: () => void }) => unknown
}>()

/** How long the pointer must rest on a submenu parent before it opens. */
const SUBMENU_OPEN_MS = 150
/** Grace period before a submenu closes, so the pointer can travel into it. */
const SUBMENU_CLOSE_MS = 200

const ws = useWorkspace()
const root = useTemplateRef<HTMLDivElement>('root')
const submenuRoot = useTemplateRef<HTMLDivElement>('submenuRoot')

const request = computed(() => ws.contextMenu.value)
const position = ref({ x: 0, y: 0 })
const openSubmenu = ref<number | null>(null)
const submenuPosition = ref({ x: 0, y: 0 })
const itemEls = new Map<number, HTMLElement>()

let openTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
const clearTimers = () => { clearTimeout(openTimer); clearTimeout(closeTimer) }

function close(): void {
  clearTimers()
  openSubmenu.value = null
  ws.closeContextMenu()
}

/** Position the menu, then pull it back inside the viewport once it has a size. */
watch(request, async (next) => {
  if (!next) { openSubmenu.value = null; return }
  position.value = { x: next.x, y: next.y }
  itemEls.clear()
  openSubmenu.value = null
  await nextTick()
  const el = root.value
  if (!el) return
  const box = el.getBoundingClientRect()
  position.value = clampToViewport(
    { x: next.x, y: next.y },
    { width: box.width, height: box.height },
    { width: window.innerWidth, height: window.innerHeight },
  )
})

/**
 * Dismissal.
 *
 * Two listeners, because one is not enough. `pointerdown` in the capture phase runs before
 * any canvas or map gesture handler can swallow it; a bubbled `click` on `window` survives a
 * `stopPropagation` on pointerdown, which WebGL canvases commonly do. rdd learned this the
 * hard way against real mapping libraries.
 */
watch(request, (next) => {
  if (next) {
    document.addEventListener('pointerdown', onOutside, { capture: true })
    window.addEventListener('click', onOutside)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('pointerdown', onOutside, { capture: true })
    window.removeEventListener('click', onOutside)
    document.removeEventListener('keydown', onKey)
  }
})

function onOutside(event: Event): void {
  const target = event.target
  // `Node.contains()` throws for anything that is not a Node, and an event target need not
  // be one — a click dispatched on `window` is the common case. If we cannot tell whether it
  // was inside, it was not the menu, so dismiss: closing is the safe default.
  if (!(target instanceof Node)) { close(); return }
  if (root.value?.contains(target) || submenuRoot.value?.contains(target)) return
  close()
}
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.stopPropagation(); close() }
}

onBeforeUnmount(() => {
  clearTimers()
  document.removeEventListener('pointerdown', onOutside, { capture: true })
  window.removeEventListener('click', onOutside)
  document.removeEventListener('keydown', onKey)
})

// ── items ──────────────────────────────────────────────────────────────────
const simple = (item: ContextMenuItem) => item as ContextMenuSimpleItem
const showsCheckbox = (item: ContextMenuItem) => {
  const box = simple(item).checkbox
  return !!box && box.active !== false
}
const isChecked = (item: ContextMenuItem) => showsCheckbox(item) && simple(item).checkbox!.value === true
const isDisabled = (item: ContextMenuItem) =>
  simple(item).disabled === true || (showsCheckbox(item) && simple(item).checkbox!.enabled === false)

function keepEl(index: number, el: unknown): void {
  const element = el as HTMLElement | null
  if (element) itemEls.set(index, element)
  else itemEls.delete(index)
}

function activate(item: ContextMenuItem): void {
  if (isDisabled(item)) return
  simple(item).action?.()
  close()
}

function onItemEnter(index: number, item: ContextMenuItem): void {
  clearTimeout(closeTimer)
  if (openSubmenu.value !== null && openSubmenu.value !== index) {
    clearTimeout(openTimer)
    openSubmenu.value = null
  }
  if (isSubMenu(item) && item.items?.length) {
    clearTimeout(openTimer)
    openTimer = setTimeout(() => {
      const el = itemEls.get(index)
      if (el) {
        const box = el.getBoundingClientRect()
        // Opens away from the parent item, mirrored for reading direction.
        submenuPosition.value = ws.state.isRtl
          ? { x: window.innerWidth - box.left + 2, y: box.top }
          : { x: box.right + 2, y: box.top }
      }
      openSubmenu.value = index
    }, SUBMENU_OPEN_MS)
  } else {
    clearTimeout(openTimer)
    if (openSubmenu.value !== null) {
      closeTimer = setTimeout(() => { openSubmenu.value = null }, SUBMENU_CLOSE_MS)
    }
  }
}

function onItemLeave(item: ContextMenuItem): void {
  clearTimeout(openTimer)
  if (isSubMenu(item) && item.items?.length) {
    closeTimer = setTimeout(() => { openSubmenu.value = null }, SUBMENU_CLOSE_MS)
  }
}

const submenuItems = computed<ContextMenuItem[]>(() => {
  const index = openSubmenu.value
  if (index === null || !request.value) return []
  const item = request.value.items[index]
  return item && isSubMenu(item) ? item.items ?? [] : []
})

/** The submenu opens rightwards under LTR and leftwards under RTL. */
const submenuStyle = computed(() => ws.state.isRtl
  ? { position: 'fixed' as const, right: `${submenuPosition.value.x}px`, top: `${submenuPosition.value.y}px` }
  : { position: 'fixed' as const, left: `${submenuPosition.value.x}px`, top: `${submenuPosition.value.y}px` })
</script>

<template>
  <Teleport v-if="request" to="body">
    <slot
      v-if="$slots.default"
      :items="request.items"
      :x="position.x"
      :y="position.y"
      :close="() => ws.closeContextMenu()"
    />

    <div
      v-else
      ref="root"
      class="vdd-context-menu"
      :class="`vdd-context-menu--${theme}`"
      :style="{ position: 'fixed', left: `${position.x}px`, top: `${position.y}px` }"
      :dir="ws.state.dir"
      data-vdd-menu
      role="menu"
      aria-orientation="vertical"
    >
      <template v-for="(item, index) in request.items" :key="index">
        <hr v-if="isSeparator(item)" class="vdd-context-menu__separator" role="separator" >

        <button
          v-else-if="isSubMenu(item)"
          :ref="(el) => keepEl(index, el)"
          type="button"
          class="vdd-context-menu__item vdd-context-menu__item--has-submenu"
          :class="{ 'vdd-context-menu__item--submenu-open': openSubmenu === index }"
          :title="(item as ContextMenuSubMenu).title ? ws.format((item as ContextMenuSubMenu).title) : undefined"
          :data-vdd-menu-submenu="ws.format((item as ContextMenuSubMenu).label)"
          role="menuitem"
          aria-haspopup="true"
          :aria-expanded="openSubmenu === index"
          @pointerenter="onItemEnter(index, item)"
          @pointerleave="onItemLeave(item)"
        >
          <span class="vdd-context-menu__icon" aria-hidden="true" />
          <span class="vdd-context-menu__label">{{ ws.format((item as ContextMenuSubMenu).label) }}</span>
          <span class="vdd-context-menu__chevron" aria-hidden="true">›</span>
        </button>

        <button
          v-else
          :ref="(el) => keepEl(index, el)"
          type="button"
          class="vdd-context-menu__item"
          :class="{ 'vdd-context-menu__item--disabled': isDisabled(item) }"
          :disabled="isDisabled(item)"
          :title="simple(item).title ? ws.format(simple(item).title) : undefined"
          :data-cy-action="simple(item).cyAction"
          :data-vdd-menu-item="ws.format(simple(item).label)"
          role="menuitem"
          :aria-checked="showsCheckbox(item) ? isChecked(item) : undefined"
          @click="activate(item)"
          @pointerenter="onItemEnter(index, item)"
          @pointerleave="onItemLeave(item)"
        >
          <span class="vdd-context-menu__icon" :aria-hidden="!simple(item).icon">
            <component :is="simple(item).icon" v-if="simple(item).icon" />
          </span>
          <span class="vdd-context-menu__label">{{ ws.format(simple(item).label) }}</span>
          <span
            v-if="showsCheckbox(item)"
            class="vdd-context-menu__checkbox"
            :class="{ 'vdd-context-menu__checkbox--checked': isChecked(item) }"
            aria-hidden="true"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="2" :fill="isChecked(item) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5" />
              <path v-if="isChecked(item)" d="M2.5 6 L4.5 8.5 L9.5 3.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </button>
      </template>
    </div>

    <div
      v-if="openSubmenu !== null && submenuItems.length"
      ref="submenuRoot"
      class="vdd-context-menu vdd-context-menu--submenu"
      :class="`vdd-context-menu--${theme}`"
      :style="submenuStyle"
      :dir="ws.state.dir"
      data-vdd-submenu
      role="menu"
      @pointerenter="clearTimers()"
      @pointerleave="openSubmenu = null"
    >
      <template v-for="(item, index) in submenuItems" :key="index">
        <hr v-if="isSeparator(item)" class="vdd-context-menu__separator" role="separator" >
        <button
          v-else
          type="button"
          class="vdd-context-menu__item"
          :class="{ 'vdd-context-menu__item--disabled': isDisabled(item) }"
          :disabled="isDisabled(item)"
          :data-vdd-menu-item="ws.format(simple(item).label)"
          role="menuitem"
          @click="activate(item)"
        >
          <span class="vdd-context-menu__icon" :aria-hidden="!simple(item).icon">
            <component :is="simple(item).icon" v-if="simple(item).icon" />
          </span>
          <span class="vdd-context-menu__label">{{ ws.format(simple(item).label) }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>
