<script setup lang="ts">
/**
 * A place a managed widget's content is shown (7.11). Internal.
 *
 * Renders an empty box and moves the widget's content element into it, as `VddPanelSlot`
 * does for a panel. The content is teleported into that element by `<VddPanelOverlay>` for the
 * widget's whole life, so this component can mount and unmount freely without touching it.
 *
 * It follows the **element**, not the widget's id: a close and re-open in one tick gives the
 * id a new element, and the slot has to show that one. On unmount the element goes back to the
 * hidden store — `onBeforeUnmount` runs before Vue removes this box from the document — but
 * only if it is still here, so it does not matter whether the next slot mounted first.
 *
 * The box carries no class of its own: the caller's falls through (the frame's
 * `vdd-panel-float__body`).
 */
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'
import type { WidgetContentCache } from '../core/widgetContent'

const props = defineProps<{
  /** The element to show here. */
  el: HTMLElement
  /** The cache that owns it, whose hidden store it returns to. */
  cache: WidgetContentCache
}>()

const host = useTemplateRef<HTMLDivElement>('host')

watch([host, () => props.el], ([box, el], previous) => {
  const [oldBox, oldEl] = previous ?? []
  if (oldBox && oldEl && oldEl !== el) props.cache.leave(oldEl, oldBox)
  if (box) props.cache.attach(el, box)
}, { immediate: true, flush: 'sync' })

onBeforeUnmount(() => {
  if (host.value) props.cache.leave(props.el, host.value)
})
</script>

<template>
  <div ref="host" />
</template>
