<script setup lang="ts">
/**
 * Workspace-level drop targets: the four outer edges, and the four corners.
 *
 * An edge dock creates a full-width or full-height row. A corner **floats** the panel pinned
 * to that corner — two different outcomes from adjacent gestures, which is why a corner
 * disarms the edge it overlaps.
 */
import { computed } from 'vue'
import type { FloatAnchor, SplitDirection } from '../types'
import { useDragDock } from '../composables/useDragDock'
import { useWorkspace } from '../composables/useWorkspace'
import { isDropAllowed } from '../core/dockRules'
import { flipZoneHorizontal } from '../core/anchorGeometry'

const drag = useDragDock()
const ws = useWorkspace()

const EDGES: SplitDirection[] = ['left', 'right', 'top', 'bottom']
const CORNERS: FloatAnchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

/**
 * Targets the rules forbid aren't offered (1.10.0). An edge dock flips left and right under RTL, and
 * so does a corner float; `canDrop` sees the side and corner the move applies.
 */
const offeredEdges = computed(() => {
  const dragged = ws.state.draggedPanelId
  if (dragged === null) return EDGES
  return EDGES.filter(e => isDropAllowed(ws, dragged, { kind: 'edge', side: ws.state.isRtl && (e === 'left' || e === 'right') ? (e === 'left' ? 'right' : 'left') : e }))
})
const offeredCorners = computed(() => {
  const dragged = ws.state.draggedPanelId
  if (dragged === null) return CORNERS
  return CORNERS.filter(c => isDropAllowed(ws, dragged, { kind: 'float', anchor: ws.state.isRtl ? flipZoneHorizontal(c) : c }))
})

/** The share of the workspace an edge dock would take. */
const preview = computed(() => {
  const armed = drag?.edge.value
  if (!armed) return null
  const share = `${ws.state.edgeSplitRatio * 100}%`
  switch (armed) {
    case 'left': return { left: '0', top: '0', bottom: '0', width: share }
    case 'right': return { right: '0', top: '0', bottom: '0', width: share }
    case 'top': return { top: '0', left: '0', right: '0', height: share }
    default: return { bottom: '0', left: '0', right: '0', height: share }
  }
})
</script>

<template>
  <div
    v-for="e in offeredEdges"
    :key="e"
    class="vdd-workspace-edge-trigger"
    :class="`vdd-edge-trigger-${e}`"
    :data-vdd-edge="e"
    @pointerenter="drag?.hoverEdge(e)"
    @pointerleave="drag?.hoverEdge(null)"
  />

  <div
    v-for="c in offeredCorners"
    :key="c"
    class="vdd-corner-zone"
    :class="[`vdd-corner-zone--${c}`, { 'vdd-corner-zone--hovered': drag?.corner.value === c }]"
    :data-vdd-corner="c"
    aria-hidden="true"
    @pointerenter="drag?.hoverCorner(c)"
    @pointerleave="drag?.hoverCorner(null)"
  />

  <div v-if="preview" class="vdd-workspace-edge-preview" :style="preview" />
</template>
