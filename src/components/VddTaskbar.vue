<script setup lang="ts">
/**
 * The taskbar: one icon per minimised panel, with a live hover preview.
 *
 * Three visibility modes:
 *   - `always`   — a permanent strip.
 *   - `compact`  — present only while something is minimised.
 *   - `autohide` — an overlay that collapses to an 8px peek strip and expands on hover. It
 *                  also flashes open for two seconds when a panel is minimised, so the panel
 *                  is seen going somewhere rather than just vanishing.
 *
 * On touch there is no hover, so the first tap opens the preview and a second restores.
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { PanelDomCache } from '../core/panelDom'
import { useWorkspace } from '../composables/useWorkspace'
import { CANCEL_MOVE_PX, LONG_PRESS_MS } from '../composables/useDragDock'
import VddTaskbarPreview from './VddTaskbarPreview.vue'

export type TaskbarVisibility = 'always' | 'compact' | 'autohide'

const props = withDefaults(defineProps<{
  visibility?: TaskbarVisibility
  cache: PanelDomCache
  /** Fallback icon for panels that register none. */
  defaultIcon?: unknown
}>(), { visibility: 'always' })

const emit = defineEmits<{
  /** A long press or right-click on an icon: the host opens a menu for it (M8). */
  contextMenu: [panelId: string, event: PointerEvent | MouseEvent]
}>()

const ws = useWorkspace()

/** More than this many icons and the strip gets scroll arrows. */
const SCROLL_AFTER = 4
const COLLAPSE_DELAY_MS = 400
const FLASH_MS = 2000

const strip = shallowRef<HTMLElement | null>(null)
const expanded = ref(false)
const hovered = ref<{ id: string; anchor: { left: number; top: number; width: number }; fromTouch: boolean } | null>(null)
let collapseTimer: ReturnType<typeof setTimeout> | undefined
let dismissTimer: ReturnType<typeof setTimeout> | undefined

const items = computed(() => ws.state.minimized.map(entry => ({
  ...entry,
  options: ws.registry.get(entry.component)?.defaultOptions ?? {},
})))

const visible = computed(() => props.visibility === 'always' || items.value.length > 0)
const scrollable = computed(() => items.value.length > SCROLL_AFTER)

function scrollBy(direction: -1 | 1): void {
  strip.value?.scrollBy({ left: direction * 150, behavior: 'smooth' })
}

// ── autohide ───────────────────────────────────────────────────────────────
const expand = () => { clearTimeout(collapseTimer); expanded.value = true }
const scheduleCollapse = () => {
  clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => { expanded.value = false }, COLLAPSE_DELAY_MS)
}

watch(() => ws.state.minimized.length, (now, before) => {
  if (props.visibility !== 'autohide' || now <= (before ?? 0)) return
  expand()
  collapseTimer = setTimeout(() => { expanded.value = false }, FLASH_MS)
})

// ── preview ────────────────────────────────────────────────────────────────
const anchorOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width }
}

function showPreview(id: string, el: HTMLElement, fromTouch = false): void {
  clearTimeout(dismissTimer)
  hovered.value = { id, anchor: anchorOf(el), fromTouch }
}
const dismissPreview = () => {
  // A short grace period so the pointer can travel from the icon to the preview without it
  // closing on the way.
  clearTimeout(dismissTimer)
  dismissTimer = setTimeout(() => { hovered.value = null }, 150)
}
const keepPreview = () => clearTimeout(dismissTimer)

function onIconEnter(id: string, event: PointerEvent): void {
  if (event.pointerType === 'touch') return
  const el = event.currentTarget as HTMLElement
  // A pointerenter can fire for a stationary cursor when the strip scrolls or reflows under
  // it; ignoring an enter whose coordinates are outside the icon keeps stray previews away.
  const r = el.getBoundingClientRect()
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) return
  showPreview(id, el, false)
}

function restore(id: string): void {
  hovered.value = null
  ws.restorePanel(id)
}

function onIconClick(id: string, event: MouseEvent): void {
  // On touch the first tap opens the preview; only a second tap restores. The click that
  // follows a tap is ignored here so the two gestures do not collide.
  if (hovered.value?.fromTouch) return
  void event
  restore(id)
}

/** Touch: tap toggles the preview, long press asks the host for a context menu. */
function onIconPointerDown(id: string, event: PointerEvent): void {
  if (event.pointerType !== 'touch') return
  const el = event.currentTarget as HTMLElement
  const startX = event.clientX
  const startY = event.clientY
  let cancelled = false

  const cleanup = () => {
    clearTimeout(timer)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', cleanup)
  }
  const onMove = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > CANCEL_MOVE_PX) { cancelled = true; cleanup() }
  }
  const onUp = () => {
    cleanup()
    if (cancelled) return
    if (hovered.value?.id === id) restore(id)
    else showPreview(id, el, true)
  }
  const timer = setTimeout(() => {
    if (cancelled) return
    cleanup()
    navigator.vibrate?.(10)
    emit('contextMenu', id, event)
  }, LONG_PRESS_MS)

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', cleanup)
}

// A preview must not outlive its panel: restoring or closing from elsewhere closes it.
watch(() => ws.state.minimized.map(m => m.id).join(','), (ids) => {
  if (hovered.value && !ids.split(',').includes(hovered.value.id)) hovered.value = null
})

onBeforeUnmount(() => { clearTimeout(collapseTimer); clearTimeout(dismissTimer) })
</script>

<template>
  <div
    v-if="visible"
    class="vdd-taskbar-footer-container"
    :class="[
      `vdd-taskbar-mode-${visibility}`,
      { 'vdd-taskbar-expanded': visibility === 'autohide' && expanded },
    ]"
    data-vdd-taskbar
    :data-vdd-taskbar-mode="visibility"
    @pointerenter="visibility === 'autohide' && expand()"
    @pointerleave="visibility === 'autohide' && scheduleCollapse()"
  >
    <div v-if="visibility === 'autohide'" class="vdd-taskbar-peek-handle" data-vdd-peek />

    <button
      v-if="scrollable"
      type="button"
      class="vdd-taskbar-nav-btn"
      data-vdd-taskbar-scroll="left"
      :aria-label="ws.format(ws.messages.scrollTabsLeft)"
      @click="scrollBy(-1)"
    >◀</button>

    <div ref="strip" class="vdd-taskbar-items-container">
      <div
        v-for="item in items"
        :key="item.id"
        class="vdd-taskbar-glassmorphic-item"
        :data-vdd-taskbar-item="item.id"
        role="button"
        :title="ws.format(item.title)"
        @click="onIconClick(item.id, $event)"
        @contextmenu.prevent="emit('contextMenu', item.id, $event)"
        @pointerdown="onIconPointerDown(item.id, $event)"
        @pointerenter="onIconEnter(item.id, $event)"
        @pointerleave="dismissPreview()"
      >
        <span class="vdd-taskbar-item-icon">
          <component :is="item.options.icon ?? defaultIcon" v-if="item.options.icon ?? defaultIcon" />
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
        </span>
      </div>
    </div>

    <button
      v-if="scrollable"
      type="button"
      class="vdd-taskbar-nav-btn"
      data-vdd-taskbar-scroll="right"
      :aria-label="ws.format(ws.messages.scrollTabsRight)"
      @click="scrollBy(1)"
    >▶</button>

    <VddTaskbarPreview
      v-if="hovered"
      :key="hovered.id"
      :panel-id="hovered.id"
      :anchor="hovered.anchor"
      :cache="cache"
      @keep="keepPreview()"
      @restore="restore(hovered.id)"
      @close="ws.requestClosePanel(hovered.id); hovered = null"
      @dismiss="dismissPreview()"
    />
  </div>
</template>
