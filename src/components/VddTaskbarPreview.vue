<script setup lang="ts">
/**
 * The hover preview for a minimised panel.
 *
 * Not a screenshot — **the panel itself**, moved into a scaled box. The panel is still
 * mounted and still running, so what you see is live: a map still renders, a video still
 * plays, a spinner still spins. That is only possible because the panel's DOM is never
 * re-created (see src/core/panelDom.ts).
 *
 * Teleported to `document.body` and positioned `fixed`, so it is never clipped by the
 * taskbar's own overflow.
 *
 * The pointer handlers are on the tooltip's own element, not left to fall through from the
 * component: this component's root is a `<Teleport>`, which is not a real element, so a
 * listener bound on the component tag attaches to nothing. Without them, leaving the icon
 * starts a dismissal that nothing cancels, the preview disappears before the pointer
 * arrives, and it can never be clicked at all.
 */
import { computed, onBeforeUnmount, watch } from 'vue'
import type { PanelDomCache } from '../core/panelDom'
import { useWorkspace } from '../composables/useWorkspace'

const props = defineProps<{
  panelId: string
  /** The icon's on-screen rect, so the preview can sit above it. */
  anchor: { left: number; top: number; width: number }
  cache: PanelDomCache
}>()

const emit = defineEmits<{
  restore: []
  close: []
  dismiss: []
  /** The pointer is over the preview: whatever dismissal is pending must be cancelled. */
  keep: []
}>()

const ws = useWorkspace()

/** The thumbnail never exceeds this box; the panel's real aspect ratio is preserved. */
const MAX_W = 220
const MAX_H = 140

const panel = computed(() => ws.state.panels[props.panelId])
const options = computed(() => (panel.value ? ws.registry.get(panel.value.component)?.defaultOptions ?? {} : {}))
const live = computed(() => options.value.disableLivePreview !== true)

const source = computed(() => props.cache.sizeOf(props.panelId))
const scale = computed(() => Math.min(MAX_W / source.value.width, MAX_H / source.value.height))
const frame = computed(() => ({
  width: `${Math.round(source.value.width * scale.value)}px`,
  height: `${Math.round(source.value.height * scale.value)}px`,
}))
const inner = computed(() => ({
  width: `${source.value.width}px`,
  height: `${source.value.height}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
  position: 'absolute' as const,
  top: '0',
  left: '0',
  ['--vdd-preview-scale' as string]: String(scale.value),
}))

/** First letter of the title, for a panel that opts out of a live preview. */
const initial = computed(() => {
  const text = ws.format(panel.value?.title) || props.panelId
  return (Array.from(text)[0] ?? 'P').toUpperCase()
})

/**
 * Move the panel into the preview while it is open, and back to the off-screen store when it
 * closes. `refocus: false` — hovering a taskbar icon must never steal the caret from whatever
 * the user is actually typing in.
 */
let mine: HTMLElement | null = null

/**
 * Take the panel when this element appears; hand it back when it goes.
 *
 * Vue calls a function ref with `null` on teardown, so this runs for both. The `null` case
 * must go through the ownership check rather than parking the panel outright: restoring from
 * the preview gives the panel a slot *and* closes the preview, and if the teardown parks it
 * unconditionally the panel ends up off-screen while a slot for it sits empty.
 */
function host(el: unknown): void {
  if (!live.value) return
  const element = (el as HTMLElement | null) ?? null
  if (element) {
    mine = element
    props.cache.moveTo(props.panelId, element, { refocus: false })
  } else {
    releaseIfStillMine(props.panelId)
  }
}

/**
 * Give the panel back — but only if this preview still has it.
 *
 * Restoring from the preview closes the preview *and* gives the panel a slot, and the order
 * is not guaranteed. Parking it unconditionally meant the closing preview could steal the
 * panel back from the slot that had just claimed it, leaving a docked panel with nowhere to
 * be shown. Same ownership check `VddPanelSlot` makes for the same reason.
 */
function releaseIfStillMine(id: string): void {
  if (!live.value) return
  if (mine === null || props.cache.hostOf(id) !== mine) { mine = null; return }
  mine = null
  props.cache.moveTo(id, null, { refocus: false })
}

watch(() => props.panelId, (_id, previous) => {
  if (previous !== undefined) releaseIfStillMine(previous)
})

onBeforeUnmount(() => releaseIfStillMine(props.panelId))
</script>

<template>
  <Teleport to="body">
    <div
      class="vdd-taskbar-item-tooltip"
      data-vdd-preview
      :dir="ws.state.dir"
      :style="{
        position: 'fixed',
        left: `${anchor.left + anchor.width / 2}px`,
        top: `${anchor.top - 8}px`,
        transform: 'translateX(-50%) translateY(-100%)',
      }"
      @click="emit('restore')"
      @pointerenter="emit('keep')"
      @pointerleave="emit('dismiss')"
    >
      <div class="vdd-tooltip-header-row">
        <span class="vdd-tooltip-title-text vdd-text-truncate">
          {{ ws.format(panel?.title) }}{{ panel?.dirty ? ' *' : '' }}
        </span>
        <span
          class="vdd-tooltip-close-x"
          aria-hidden="true"
          :data-vdd-preview-close="panelId"
          :title="ws.format(ws.messages.closePanel)"
          @click.stop="emit('close')"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </span>
      </div>

      <div class="vdd-taskbar-item-preview-frame" :style="frame">
        <!--
          The panel's own element is moved in here by `host()`. Nothing is rendered inside
          this div by Vue — if it were, the live panel would have to be duplicated, and a
          duplicate is exactly what a preview must not be.
        -->
        <div v-if="live" :ref="host" class="vdd-taskbar-item-preview-host" :style="inner" />
        <div v-else class="vdd-taskbar-item-preview-letter">{{ initial }}</div>
      </div>
    </div>
  </Teleport>
</template>
