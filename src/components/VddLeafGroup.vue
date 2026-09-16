<script setup lang="ts">
/**
 * A tab group: a tab bar and the selected panel's body.
 *
 * The tab bar distinguishes *selected* from *globally active*: the selected tab of an
 * inactive group is drawn differently from the one the user is actually working in. Those
 * must never disagree with `activePanelId` — the invariant behind divergence D2.
 */
import { computed } from 'vue'
import type { LayoutLeafNode } from '../types'
import { useWorkspace } from '../composables/useWorkspace'
import { useDragDock } from '../composables/useDragDock'
import { buildPanelMenu } from '../core/panelMenu'
import VddPanelSlot from './VddPanelSlot.vue'
import VddDropZones from './VddDropZones.vue'

const props = defineProps<{ leaf: LayoutLeafNode }>()

const ws = useWorkspace()
const drag = useDragDock()

/** The standard panel menu, plus whatever the panel itself contributed. */
function openMenu(panelId: string, event: MouseEvent | PointerEvent): void {
  const panel = ws.state.panels[panelId]
  if (!panel) return
  const options = ws.registry.get(panel.component)?.defaultOptions ?? {}
  const items = buildPanelMenu(ws, panelId, options, {
    float: () => ws.floatPanel(panelId),
    minimize: () => ws.minimizePanel(panelId),
    close: () => ws.requestClosePanel(panelId),
    restore: () => ws.restorePanel(panelId),
    maximize: () => ws.maximizePanel(panelId),
  })
  if (items.length === 0) return
  ws.showContextMenu({ event, items })
}

/** Which half of a tab the pointer is over decides which side the panel is inserted on. */
function onTabPointerMove(leafId: string, panelId: string, index: number, event: PointerEvent): void {
  if (!drag?.dragging.value || event.pointerType === 'touch') return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  drag.hoverTab({ leafId, panelId, index, side: event.clientX - rect.left < rect.width / 2 ? 'left' : 'right' })
}

const tabs = computed(() => props.leaf.panels.flatMap((id) => {
  const panel = ws.state.panels[id]
  return panel ? [{ id, panel, options: ws.registry.get(panel.component)?.defaultOptions ?? {} }] : []
}))

const selectedId = computed(() => props.leaf.activePanelId)

const tabClass = (id: string) => {
  const hovered = drag?.tab.value
  const isInsertionPoint = hovered?.leafId === props.leaf.id && hovered.panelId === id
  return [
    'vdd-workspace-tab',
    id === selectedId.value
      ? ['vdd-active', id === ws.state.activePanelId ? 'vdd-workspace-tab-active-focused' : 'vdd-workspace-tab-active-unfocused']
      : 'vdd-workspace-tab-inactive',
    isInsertionPoint ? (hovered.side === 'left' ? 'vdd-drag-hover-left' : 'vdd-drag-hover-right') : '',
  ]
}
</script>

<template>
  <div
    class="vdd-workspace-panel"
    :data-vdd-leaf="leaf.id"
    :data-active-panel-id="selectedId ?? ''"
    @pointerdown="selectedId && ws.focusPanel(selectedId)"
  >
    <div class="vdd-workspace-tab-bar">
      <div class="vdd-tab-headers-container">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.id"
          :class="tabClass(tab.id)"
          :data-vdd-tab="tab.id"
          :data-vdd-tab-leaf="leaf.id"
          :data-vdd-tab-index="String(index)"
          role="tab"
          :aria-selected="tab.id === selectedId"
          :style="{ cursor: tab.options.canDrag === false ? 'default' : 'pointer' }"
          @click="ws.focusPanel(tab.id)"
          @contextmenu.prevent="openMenu(tab.id, $event)"
          @pointerdown="tab.options.canDrag !== false
            ? drag?.startTabDrag(tab.id, $event, (e) => openMenu(tab.id, e))
            : undefined"
          @pointermove="onTabPointerMove(leaf.id, tab.id, index, $event)"
          @pointerleave="drag?.dragging.value && drag.hoverTab(null)"
        >
          <span class="vdd-text-truncate">
            <span v-if="tab.options.icon" class="vdd-workspace-tab-icon">
              <component :is="tab.options.icon" />
            </span>
            <span>{{ ws.format(tab.panel.title) }}{{ tab.panel.dirty ? ' *' : '' }}</span>
          </span>
          <span
            v-if="tab.options.canClose !== false"
            class="vdd-close-tab-x"
            :title="ws.format(ws.messages.closeTab)"
            :data-vdd-close="tab.id"
            @click.stop="ws.requestClosePanel(tab.id)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </span>
        </div>
      </div>

      <!--
        An empty split group can otherwise only be closed programmatically. rdd offered this
        button and vdd did not — the `closeLeafGroup` action existed with nothing to call it,
        and three CSS rules sat in the stylesheet matching nothing. Found by M13's class/rule
        correspondence sweep, which is exactly the shape of defect it looks for.
      -->
      <div v-if="tabs.length === 0" class="vdd-tab-header-actions">
        <button
          type="button"
          class="vdd-header-close-empty-group"
          :title="ws.format(ws.messages.closeEmptyGroup)"
          :aria-label="ws.format(ws.messages.closeEmptyGroup)"
          data-vdd-close-empty-group
          @click.stop="ws.closeLeafGroup(leaf.id)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <div class="vdd-panel-body">
      <VddDropZones v-if="drag?.dragging.value" :leaf-id="leaf.id" />
      <!--
        Keyed by the selected panel so switching tabs mounts a new slot, which hands the
        persistence port a new host. The panel itself is never re-created.
      -->
      <VddPanelSlot v-if="selectedId" :key="selectedId" :panel-id="selectedId" />
      <div v-else class="vdd-empty-leaf-placeholder">
        <span>{{ ws.format(ws.messages.emptyGroup) }}</span>
      </div>
    </div>
  </div>
</template>
