<script setup lang="ts">
/**
 * The recursive grid: a branch renders its children with a draggable divider between each
 * pair; a leaf renders a tab group.
 *
 * `path` is the index route from the root to this node — what `updateSplitSizes` addresses.
 */
import { computed } from 'vue'
import type { LayoutNode } from '../types'
import { useWorkspace } from '../composables/useWorkspace'
import { startPointerDrag } from '../core/dragResize'
import VddLeafGroup from './VddLeafGroup.vue'

const props = defineProps<{ node: LayoutNode; path: number[] }>()

const ws = useWorkspace()
const isRow = computed(() => props.node.type === 'branch' && props.node.orientation === 'horizontal')

function onDividerDown(index: number, event: PointerEvent): void {
  if (props.node.type !== 'branch') return
  event.preventDefault()
  const divider = event.currentTarget as HTMLElement
  const parent = divider.parentElement
  const extent = parent
    ? (isRow.value ? parent.clientWidth : parent.clientHeight)
    : (isRow.value ? 1000 : 800)
  const sizes = [...props.node.sizes]

  startPointerDrag({
    element: divider,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    captureStart: () => sizes,
    activeClasses: [
      { el: divider, classes: ['vdd-active'] },
      { el: document.body, classes: ['vdd-resizing-active', isRow.value ? 'vdd-resizing-col-active' : 'vdd-resizing-row-active'] },
    ],
    onMove: (dx, dy, start) => {
      const delta = (isRow.value ? dx : dy) / extent
      const next = [...start]
      next[index] = (start[index] ?? 0) + delta
      next[index + 1] = (start[index + 1] ?? 0) - delta
      // Neither neighbour may collapse; below this the divider simply stops.
      if ((next[index] ?? 0) > 0.05 && (next[index + 1] ?? 0) > 0.05) {
        ws.updateSplitSizes(props.path, next)
      }
    },
  })
}
</script>

<template>
  <VddLeafGroup v-if="node.type === 'leaf'" :leaf="node" />

  <div
    v-else
    class="vdd-workspace-branch"
    :class="isRow ? 'vdd-row' : 'vdd-column'"
    :style="{ display: 'flex', flexDirection: isRow ? 'row' : 'column', width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }"
  >
    <template v-for="(child, index) in node.children" :key="index">
      <div :style="{ flexGrow: node.sizes[index], flexBasis: `${(node.sizes[index] ?? 0) * 100}%`, overflow: 'hidden', position: 'relative', minWidth: 0, minHeight: 0 }">
        <VddWorkspaceGrid :node="child" :path="[...path, index]" />
      </div>
      <div
        v-if="index < node.children.length - 1"
        class="vdd-resizer-bar"
        :data-vdd-divider="[...path, index].join('-')"
        :style="{ cursor: isRow ? 'col-resize' : 'row-resize', width: isRow ? '1px' : '100%', height: isRow ? '100%' : '1px', zIndex: 20 }"
        @pointerdown="onDividerDown(index, $event)"
      />
    </template>
  </div>
</template>
