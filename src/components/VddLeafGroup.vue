<script setup lang="ts">
/**
 * A tab group: a tab bar and the selected panel's body.
 *
 * The tab bar distinguishes *selected* from *globally active*: the selected tab of an
 * inactive group is drawn differently from the one the user is actually working in. Those
 * must never disagree with `activePanelId` — the invariant behind divergence D2.
 */
import { computed, nextTick, useTemplateRef } from 'vue'
import type { LayoutLeafNode } from '../types'
import { useWorkspace } from '../composables/useWorkspace'
import { useDragDock } from '../composables/useDragDock'
import { buildPanelMenu } from '../core/panelMenu'
import { tabSide } from '../core/dragResize'
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
  drag.hoverTab({ leafId, panelId, index, side: tabSide(event.clientX, rect, ws.state.isRtl) })
}

const tabs = computed(() => props.leaf.panels.flatMap((id) => {
  const panel = ws.state.panels[id]
  return panel ? [{ id, panel, options: ws.registry.get(panel.component)?.defaultOptions ?? {} }] : []
}))

const selectedId = computed(() => props.leaf.activePanelId)

/**
 * Keyboard: one tab stop per group, arrows to move, Delete to close — the core of the WAI-ARIA
 * tabs pattern, with automatic activation since switching tabs is cheap here. Arrows follow
 * tab order, which runs right to left under RTL.
 */
const tabBar = useTemplateRef<HTMLElement>('tabBar')
const tabStop = (id: string, index: number) =>
  (selectedId.value ? id === selectedId.value : index === 0) ? 0 : -1

function onTabKey(index: number, event: KeyboardEvent): void {
  const list = tabs.value
  const current = list[index]
  if (!current) return
  if (event.key === 'Delete') {
    if (current.options.canClose !== false) void ws.requestClosePanel(current.id)
    event.preventDefault()
    return
  }
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  event.preventDefault()
  const forward = (event.key === 'ArrowRight') !== ws.state.isRtl
  const next = list[(index + (forward ? 1 : list.length - 1)) % list.length]!
  ws.focusPanel(next.id)
  // After the switch has rendered: re-attaching the panel may restore focus inside it, and
  // keyboard focus belongs on the tab list.
  void nextTick(() => {
    tabBar.value?.querySelector<HTMLElement>(`[data-vdd-tab="${CSS.escape(next.id)}"]`)?.focus()
  })
}

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
      <div
        ref="tabBar"
        class="vdd-tab-headers-container"
        role="tablist"
      >
        <div
          v-for="(tab, index) in tabs"
          :key="tab.id"
          :class="tabClass(tab.id)"
          :data-vdd-tab="tab.id"
          :data-vdd-tab-leaf="leaf.id"
          :data-vdd-tab-index="String(index)"
          role="tab"
          :aria-selected="tab.id === selectedId"
          :tabindex="tabStop(tab.id, index)"
          :style="{ cursor: tab.options.canDrag === false ? 'default' : 'pointer' }"
          @click="ws.focusPanel(tab.id)"
          @contextmenu.prevent="openMenu(tab.id, $event)"
          @pointerdown="tab.options.canDrag !== false
            ? drag?.startTabDrag(tab.id, $event, (e) => openMenu(tab.id, e))
            : undefined"
          @pointermove="onTabPointerMove(leaf.id, tab.id, index, $event)"
          @pointerleave="drag?.dragging.value && drag.hoverTab(null)"
          @keydown="onTabKey(index, $event)"
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
            aria-hidden="true"
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

    <div
      class="vdd-panel-body"
      role="tabpanel"
    >
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
