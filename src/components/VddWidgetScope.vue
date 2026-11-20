<script setup lang="ts">
/**
 * Provides `useWidget()` to one managed widget's content (7.11), and calls its `onMoved`
 * callbacks whenever its element has landed in another container. Internal; rdd's
 * `WidgetScope`. Rendered inside the widget's Teleport, so it lives exactly as long as the
 * content does.
 */
import { computed, provide, watch } from 'vue'
import type { WidgetHostingPort, WidgetLocation } from '../core/overlayState'
import { WIDGET_KEY, scoped } from '../composables/useWidget'
import type { WidgetHandle } from '../composables/useWidget'

const props = defineProps<{
  widgetId: string
  hosting: WidgetHostingPort
}>()

// The id is the v-for key around this component: fixed for its life.
const id = props.widgetId
const key = computed(() => props.hosting.keyOf(id))

// After the render that moved the element: it is in its new container (or gone home).
watch(key, () => props.hosting.settled(id), { flush: 'post' })

const handle: WidgetHandle = {
  id,
  ownerPanelId: props.hosting.ownerPanelId,
  // A widget in its panel has no entry, so no location check is needed.
  panelId: computed(() => props.hosting.hostedIds[id] ?? null),
  location: computed(() => key.value.split('|')[0] as WidgetLocation),
  onWillMove: cb => scoped(props.hosting.listen(id, 'will', cb)),
  onMoved: cb => scoped(props.hosting.listen(id, 'moved', cb)),
}
provide(WIDGET_KEY, handle)
</script>

<template>
  <slot />
</template>
