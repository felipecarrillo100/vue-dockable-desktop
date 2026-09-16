<script setup lang="ts">
/**
 * Renders whichever side drawers are open.
 *
 * Place it once, anywhere inside the app — the panels are `position: fixed`, so where it
 * sits in the tree does not affect where they appear.
 *
 * `sides` narrows it to one edge, which is what rdd offered as two extra exported
 * components (`LeftPanelRenderer`, `RightPanelRenderer`). A prop rather than three
 * components: the three shared an implementation and differed only in this filter.
 */
import { computed } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import VddSidePanelHost from './VddSidePanelHost.vue'

const props = withDefaults(defineProps<{
  /** Applied when `openLeftPanel`/`openRightPanel` did not specify a width. @default 400 */
  defaultWidth?: number | string
  /** Which edges this instance is responsible for. @default 'both' */
  sides?: 'both' | 'left' | 'right'
}>(), { defaultWidth: 400, sides: 'both' })

const { overlays } = useWorkspace()
const left = computed(() => (props.sides === 'right' ? null : overlays.state.leftPanel))
const right = computed(() => (props.sides === 'left' ? null : overlays.state.rightPanel))
</script>

<template>
  <VddSidePanelHost
    v-if="left"
    :key="left.id"
    :instance="left"
    position="left"
    :default-width="defaultWidth"
  />
  <VddSidePanelHost
    v-if="right"
    :key="right.id"
    :instance="right"
    position="right"
    :default-width="defaultWidth"
  />
</template>
