<script setup lang="ts">
/**
 * The label that follows the pointer during a tab drag.
 *
 * Only for a tab: dragging a floating window moves the window itself, so a ghost would be
 * a second thing to look at.
 */
import { computed } from 'vue'
import { useDragDock } from '../composables/useDragDock'
import { useWorkspace } from '../composables/useWorkspace'

const drag = useDragDock()
const ws = useWorkspace()

const label = computed(() => {
  const id = drag?.draggedId.value
  if (!id) return ''
  const panel = ws.state.panels[id]
  return panel ? ws.format(panel.title) : id
})

const isTabDrag = computed(() =>
  !!drag?.draggedId.value && !ws.state.floating.some(w => w.id === drag.draggedId.value))
</script>

<template>
  <div
    v-if="isTabDrag"
    class="vdd-drag-ghost-tab"
    data-vdd-ghost
    :style="{ left: `${(drag?.pointer.value.x ?? 0) + 12}px`, top: `${(drag?.pointer.value.y ?? 0) + 12}px` }"
  >{{ label }}</div>
</template>
