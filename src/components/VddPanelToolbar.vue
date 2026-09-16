<script setup lang="ts">
/**
 * A toolbar strip on one edge of a panel's overlay.
 *
 * It claims space on that edge, and docked widgets keep clear of it — both where they sit and
 * how far they may be resized. Left and right strips inset themselves past any top and bottom
 * strips, so the corners are never contested.
 */
import { computed, onBeforeUnmount, useTemplateRef, watchEffect } from 'vue'
import { usePanelOverlay } from '../composables/usePanelOverlay'
import type { ButtonVariant, ToolbarPosition, ToolbarVariant } from '../core/panelOverlay'

const props = withDefaults(defineProps<{
  position: ToolbarPosition
  /** @default 'transparent' */
  variant?: ToolbarVariant
  /** Inherited by this toolbar's buttons unless they override it. @default 'ghost' */
  buttonVariant?: ButtonVariant
  /** Icon button size in pixels. Left to the stylesheet when unset. */
  buttonSize?: number
}>(), { variant: 'transparent', buttonVariant: 'ghost' })

const store = usePanelOverlay()
const el = useTemplateRef<HTMLDivElement>('el')
const isBlockEdge = computed(() => props.position === 'top' || props.position === 'bottom')

/**
 * Re-measured, not measured once.
 *
 * A single measurement is right for a live mount, where the toolbar is already at its final
 * size. During a layout restore the panel's DOM is not necessarily settled at that instant, so
 * rdd baked in a wrong size — usually 0 — permanently, and every docked widget ended up
 * positioned at the toolbar's own edge, covering it. This also catches later changes: buttons
 * wrapping, a `buttonSize` change, content appearing.
 */
let observer: ResizeObserver | null = null
watchEffect((onCleanup) => {
  const node = el.value
  const position = props.position
  if (!node) return

  const measure = () => {
    store.registerToolbar(position, isBlockEdge.value ? node.offsetHeight : node.offsetWidth)
  }
  measure()

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(node)
  }
  onCleanup(() => {
    observer?.disconnect()
    observer = null
    store.unregisterToolbar(position)
  })
})

onBeforeUnmount(() => store.unregisterToolbar(props.position))

/**
 * Only position is inline, because only position depends on the other toolbars' measured
 * sizes. Everything else — padding, gap, backdrop, the strip's own thickness — is in the
 * stylesheet where a consumer can reach it (divergence D12).
 */
const placement = computed(() => {
  switch (props.position) {
    case 'top': return { top: '0px', left: '0px', right: '0px' }
    case 'bottom': return { bottom: '0px', left: '0px', right: '0px' }
    case 'left': return { insetInlineStart: '0px', top: `${store.insets.top}px`, bottom: `${store.insets.bottom}px` }
    default: return { insetInlineEnd: '0px', top: `${store.insets.top}px`, bottom: `${store.insets.bottom}px` }
  }
})

const sizeVar = computed(() =>
  props.buttonSize != null ? { '--vdd-panel-toolbar-btn-size': `${props.buttonSize}px` } : {})
</script>

<template>
  <div
    ref="el"
    class="vdd-panel-toolbar"
    :class="`vdd-panel-toolbar--${position}`"
    :data-variant="variant"
    :data-btn-variant="buttonVariant"
    :data-vdd-panel-toolbar="position"
    :style="{ ...placement, ...sizeVar }"
    role="toolbar"
    :aria-orientation="isBlockEdge ? 'horizontal' : 'vertical'"
  >
    <slot />
  </div>
</template>
