<script setup lang="ts">
/**
 * The cross of drop targets over one leaf: four sides plus the centre.
 *
 * Armed state is driven by the drag machine rather than CSS `:hover`. `:hover` is unreliable
 * during an active drag in some browsers and does not exist at all on touch, whereas the
 * machine already tracks the armed target for every input type.
 */
import { computed } from 'vue'
import type { DropPosition } from '../types'
import { useDragDock } from '../composables/useDragDock'
import { useWorkspace } from '../composables/useWorkspace'

const props = defineProps<{ leafId: string }>()
const drag = useDragDock()
const ws = useWorkspace()

const POSITIONS: DropPosition[] = ['top', 'bottom', 'left', 'right', 'center']
const GLYPH: Record<DropPosition, string> = {
  top: '▲', bottom: '▼', left: '◀', right: '▶', center: '▣',
}

const isArmed = (position: DropPosition) =>
  drag?.zone.value?.leafId === props.leafId && drag.zone.value.position === position

/** The preview fills the share of the leaf the drop would actually take. */
const preview = computed(() => {
  const armed = drag?.zone.value
  if (!armed || armed.leafId !== props.leafId) return null
  const share = `${ws.state.splitRatio * 100}%`
  const rest = `${(1 - ws.state.splitRatio) * 100}%`
  const p = armed.position
  return {
    left: p === 'right' ? rest : '0',
    top: p === 'bottom' ? rest : '0',
    width: p === 'left' || p === 'right' ? share : '100%',
    height: p === 'top' || p === 'bottom' ? share : '100%',
  }
})
</script>

<template>
  <div class="vdd-dock-drop-zone-overlay">
    <div class="vdd-dock-target-cross">
      <div
        v-for="position in POSITIONS"
        :key="position"
        class="vdd-dock-target-box"
        :class="[`vdd-dock-target-${position}`, { 'vdd-dock-target-box--active': isArmed(position) }]
        "
        :data-vdd-drop-zone="position"
        :data-vdd-leaf="leafId"
        @pointerenter="drag?.hoverZone(leafId, position)"
        @pointerleave="drag?.hoverZone(leafId, null)"
      >{{ GLYPH[position] }}</div>
    </div>
  </div>
  <div v-if="preview" class="vdd-dock-preview-highlight" :style="preview" />
</template>
