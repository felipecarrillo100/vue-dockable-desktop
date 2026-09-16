<script setup lang="ts">
/**
 * One rendered modal. Its own component for the same reason as the side panel host: the
 * panel context it provides is per instance, and a stack has several at once.
 */
import { computed } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import { useOverlayHost } from '../composables/useOverlayHost'
import VddOverlayFrame from './VddOverlayFrame.vue'
import type { OverlayInstance } from '../core/overlays'

const props = defineProps<{
  instance: OverlayInstance
  /** Depth in the stack, which is what separates the modals' z-indexes. */
  index: number
}>()

const ws = useWorkspace()
const { displayTitle, icon, dismissible, close, bodyPadding } = useOverlayHost(() => props.instance)

const sizeClass = computed(() => `vdd-modal-size-${props.instance.options.size ?? 'auto'}`)

/**
 * Stacks against `--vdd-z-base`, which `createWorkspace({ zIndexBase })` mirrors onto the
 * document element — so raising the base moves the modals with everything else. rdd set this
 * inline against the same variable; the variable is the part that matters.
 */
const zIndex = computed(() => `calc(var(--vdd-z-base, 1000) + 9000 + ${props.index * 10})`)
</script>

<template>
  <div
    class="vdd-modal-overlay"
    :style="{ zIndex }"
    :dir="ws.state.dir"
    :data-vdd-modal="instance.id"
  >
    <!-- Clicking the backdrop dismisses, unless the modal was opened with closable: false. -->
    <div class="vdd-modal-curtain" data-vdd-modal-curtain @click="dismissible && close()" />
    <div class="vdd-modal-window" :class="[sizeClass, ws.classes.modal]">
      <VddOverlayFrame
        block="modal"
        :title="displayTitle"
        :icon="icon"
        :closable="dismissible"
        :close-label="ws.format(ws.messages.closeTooltip)"
        :body-padding="bodyPadding"
        @close="close()"
      >
        <component :is="instance.component" v-bind="{ ...instance.props, panelId: instance.id }" />
      </VddOverlayFrame>
    </div>
  </div>
</template>
