<script setup lang="ts">
/**
 * One rendered side panel. Its own component so each instance gets its own
 * `useOverlayHost()` — the composable provides a panel context, and `provide` is per
 * instance, so the left and right drawers cannot share one.
 */
import { computed } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import { useOverlayHost } from '../composables/useOverlayHost'
import VddOverlayFrame from './VddOverlayFrame.vue'
import type { OverlayInstance } from '../core/overlays'

const props = defineProps<{
  instance: OverlayInstance
  position: 'left' | 'right'
  /** Used when the instance did not ask for a width. */
  defaultWidth: number | string
}>()

const ws = useWorkspace()
const { displayTitle, icon, close, bodyPadding } = useOverlayHost(() => props.instance)

const width = computed(() => {
  const value = props.instance.options.width ?? props.defaultWidth
  return typeof value === 'number' ? `${value}px` : value
})
</script>

<template>
  <div
    class="vdd-side-panel vdd-side-panel-visible"
    :class="position === 'left' ? 'vdd-side-panel-left' : 'vdd-side-panel-right'"
    :style="{ width }"
    :dir="ws.state.dir"
    :data-vdd-side-panel="position"
  >
    <div class="vdd-side-panel-window" :class="ws.classes.sidePanel">
      <VddOverlayFrame
        block="side-panel"
        :title="displayTitle"
        :icon="icon"
        :closable="true"
        :close-label="ws.format(ws.messages.closeTooltip)"
        :body-padding="bodyPadding"
        @close="close()"
      >
        <component :is="instance.component" v-bind="{ ...instance.props, panelId: instance.id }" />
      </VddOverlayFrame>
    </div>
  </div>
</template>
