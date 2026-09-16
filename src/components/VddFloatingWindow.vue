<script setup lang="ts">
/**
 * A panel detached from the grid: its own title bar, draggable, resizable on eight edges,
 * stackable by z-order, and optionally pinned to a workspace corner.
 *
 * Positioning is deliberately split. A free-floating window is placed by `left`/`top`, which
 * are physical. An **anchored** window is placed by CSS *logical* properties
 * (`insetInlineStart`/`insetInlineEnd`) driven by the element's own `dir`, so switching
 * reading direction mirrors it with no JavaScript and no stored physical coordinates — which
 * is what lets a layout saved in one direction restore correctly in the other.
 */
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import type { FloatingWindow } from '../types'
import { useWorkspace } from '../composables/useWorkspace'
import { useDragDock } from '../composables/useDragDock'
import { buildPanelMenu } from '../core/panelMenu'
import { computeResizedRect, startPointerDrag } from '../core/dragResize'
import type { ResizeDir } from '../core/dragResize'
import VddPanelSlot from './VddPanelSlot.vue'

const props = defineProps<{
  window: FloatingWindow
  /** The workspace's measured size, for the clamps. */
  viewport: { width: number; height: number }
}>()

const ws = useWorkspace()
const drag = useDragDock()

/** Inset from the workspace edge, and the gap between windows stacked in one corner. */
const CORNER_INSET = 8
const CORNER_GAP = 8
const HANDLES: ResizeDir[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

const panel = computed(() => ws.state.panels[props.window.id])
const options = computed(() => (panel.value ? ws.registry.get(panel.value.component)?.defaultOptions ?? {} : {}))
const isFocused = computed(() => ws.state.activePanelId === props.window.id)
const isDragged = computed(() => ws.state.draggedPanelId === props.window.id)
const px = (v: number | string) => (typeof v === 'number' ? `${v}px` : v)

/** Windows sharing this corner, in stack order. */
const stack = computed(() =>
  ws.state.floating.filter(w => w.anchor === props.window.anchor && !w.maximized))

/** How far along the block axis this window sits, clearing whatever is stacked before it. */
const stackOffset = computed(() => {
  if (!props.window.anchor) return 0
  const index = stack.value.findIndex(w => w.id === props.window.id)
  let offset = CORNER_INSET
  for (let i = 0; i < index; i++) {
    const h = stack.value[i]!.height
    offset += (typeof h === 'number' ? h : Number.parseFloat(String(h))) + CORNER_GAP
  }
  return offset
})

const style = computed<CSSProperties>(() => {
  const w = props.window
  const base: CSSProperties = {
    position: 'absolute',
    zIndex: w.z,
    pointerEvents: isDragged.value ? 'none' : 'auto',
  }
  if (w.maximized) return { ...base, left: 0, top: 0, width: '100%', height: '100%' }

  if (w.anchor) {
    const isTop = w.anchor.startsWith('top')
    const isEnd = w.anchor.endsWith('-right')
    return {
      ...base,
      [isEnd ? 'insetInlineEnd' : 'insetInlineStart']: `${CORNER_INSET}px`,
      [isTop ? 'top' : 'bottom']: `${stackOffset.value}px`,
      width: px(w.width),
      height: px(w.height),
      transition: isDragged.value ? 'none' : 'top 0.2s ease, bottom 0.2s ease',
    }
  }
  return { ...base, left: px(w.x), top: px(w.y), width: px(w.width), height: px(w.height) }
})

const contributed = computed(() => ws.panelMenuItems(props.window.id))

function openMenu(event: MouseEvent | PointerEvent, onlyContributed = false): void {
  const items = onlyContributed
    ? contributed.value
    : buildPanelMenu(ws, props.window.id, options.value, {
        float: () => ws.floatPanel(props.window.id),
        minimize: () => ws.minimizePanel(props.window.id),
        close: () => ws.requestClosePanel(props.window.id),
        restore: () => ws.restorePanel(props.window.id),
        maximize: () => ws.maximizePanel(props.window.id),
      })
  if (items.length === 0) return
  ws.showContextMenu({ event, items })
}

function onTitlePointerDown(event: PointerEvent): void {
  if (options.value.canDrag === false || props.window.maximized) return
  if (event.button !== 0) return
  event.preventDefault()
  ws.focusPanel(props.window.id)

  const el = (event.currentTarget as HTMLElement).closest('.vdd-floating-window') as HTMLElement | null
  const startX = el?.offsetLeft ?? 0
  const startY = el?.offsetTop ?? 0
  const originClientX = event.clientX
  const originClientY = event.clientY
  let moved = false

  startPointerDrag({
    element: event.currentTarget as HTMLElement,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    captureStart: () => ({ x: startX, y: startY }),
    activeClasses: [{ el: document.body, classes: ['vdd-dragging-active'] }],
    onMove: (dx, dy, start) => {
      // A window dragged over a drop target docks there on release, exactly like a tab — so
      // the gesture is registered with the drag machine, which makes the zones appear.
      if (!moved) { moved = true; drag?.beginDrag(props.window.id) }
      // Dragging a pinned window unpins it: a corner anchor and a free position are mutually
      // exclusive, and the user has just chosen the position.
      ws.updateFloatingPosition(props.window.id, { x: start.x + dx, y: start.y + dy, anchor: null })
      // `startPointerDrag` holds pointer capture, so the zones get no hover events: the armed
      // target has to be resolved by hit-testing the pointer instead.
      drag?.trackPointer(originClientX + dx, originClientY + dy)
    },
    onEnd: () => {
      if (!moved || !drag) return
      const armed = drag.zone.value ?? drag.edge.value ?? drag.corner.value ?? drag.tab.value
      // Released over nothing: the window simply stays where the drag left it.
      if (armed) drag.finishDrag(props.window.id, new PointerEvent('pointerup'))
      else drag.cancel()
    },
  })
}

function onHandlePointerDown(dir: ResizeDir, event: PointerEvent): void {
  if (props.window.maximized) return
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  ws.focusPanel(props.window.id)

  const el = (event.currentTarget as HTMLElement).closest('.vdd-floating-window') as HTMLElement | null
  const start = {
    x: el?.offsetLeft ?? 0,
    y: el?.offsetTop ?? 0,
    w: el?.offsetWidth ?? 400,
    h: el?.offsetHeight ?? 300,
  }

  startPointerDrag({
    element: event.currentTarget as HTMLElement,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    captureStart: () => start,
    activeClasses: [{ el: document.body, classes: ['vdd-resizing-active'] }],
    // No maxW/maxH/minX/minY: a workspace window may grow past the viewport and be dragged
    // off-screen, matching rdd. The clamp on workspace *resize* pulls it back into reach.
    onMove: (dx, dy, from) => {
      const r = computeResizedRect(dir, dx, dy, from, { minW: 200, minH: 150 })
      ws.updateFloatingPosition(props.window.id, { x: r.x, y: r.y, width: r.w, height: r.h })
    },
  })
}
</script>

<template>
  <div
    v-if="panel"
    class="vdd-floating-window"
    :class="[{
      'vdd-maximized': window.maximized,
      'vdd-window-focused': isFocused,
    }, ws.classes.window]"
    :data-vdd-window="window.id"
    :dir="ws.state.dir"
    :style="style"
    @pointerdown.capture="ws.focusPanel(window.id)"
  >
    <div
      class="vdd-floating-window-titlebar"
      :data-vdd-titlebar="window.id"
      :style="{ cursor: window.maximized || options.canDrag === false ? 'default' : 'move' }"
      @pointerdown="onTitlePointerDown"
      @contextmenu.prevent="openMenu($event)"
      @dblclick="ws.maximizePanel(window.id)"
    >
      <span class="vdd-floating-window-title">
        <span v-if="options.icon" class="vdd-window-title-icon"><component :is="options.icon" /></span>
        <span>{{ ws.format(panel.title) }}{{ panel.dirty ? ' *' : '' }}</span>
      </span>
      <div class="vdd-titlebar-actions" @pointerdown.stop>
        <button
          v-if="contributed.length > 0"
          type="button"
          class="vdd-custom-tab-btn vdd-btn-more-actions"
          :data-vdd-more="window.id"
          :title="ws.format(ws.messages.moreActions)"
          @click="openMenu($event, true)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display: block">
            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        <button
          type="button"
          class="vdd-custom-tab-btn vdd-btn-maximize-tab"
          :data-vdd-maximize="window.id"
          :title="ws.format(window.maximized ? ws.messages.restoreSize : ws.messages.maximize)"
          @click="ws.maximizePanel(window.id)"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="4" y="4" width="16" height="16" rx="1.5" />
          </svg>
        </button>
        <button
          v-if="options.canMinimize !== false"
          type="button"
          class="vdd-custom-tab-btn vdd-btn-minimize-tab"
          :data-vdd-minimize="window.id"
          :title="ws.format(ws.messages.minimize)"
          @click="ws.minimizePanel(window.id)"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          v-if="options.canClose !== false"
          type="button"
          class="vdd-custom-tab-btn vdd-btn-close-tab"
          :data-vdd-close-window="window.id"
          :title="ws.format(ws.messages.close)"
          @click="ws.requestClosePanel(window.id)"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <div class="vdd-floating-window-body" :class="ws.classes.windowBody">
      <VddPanelSlot :panel-id="window.id" />
    </div>

    <template v-if="!window.maximized">
      <div
        v-for="dir in HANDLES"
        :key="dir"
        class="vdd-resize-handle"
        :class="`vdd-resize-${dir}`"
        :data-vdd-handle="`${window.id}:${dir}`"
        @pointerdown="onHandlePointerDown(dir, $event)"
      />
    </template>
  </div>
</template>
