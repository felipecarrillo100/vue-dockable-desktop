<script setup lang="ts">
/**
 * A floating widget inside a panel: docked to a corner, dragged free of it, dropped back onto
 * one — and optionally spanning the panel on either axis instead of carrying a size.
 *
 * rdd's `PanelFloatingWindow` needed **nine** refs mirroring state purely to avoid stale
 * closures in its pointer handlers, plus a `key` remount trick and a controlled/uncontrolled
 * branch for `stretch`. None of that is here: a Vue ref read inside a handler is already the
 * current value, and `v-model:placement` makes controlled and uncontrolled the same code path
 * for a *caller* (docs/decisions/0005-vmodel.md). What it does not offer is rdd's third
 * position — seed it, then let the component own it — because binding the prop at all makes
 * the binder authoritative. `<VddPanelOverlay>` needed exactly that for managed widgets, and
 * 1.0.0 shipped it as a bound object literal, which reset placement on every render; the
 * overlay owns and echoes the value now. See the model's own comment below.
 *
 * Anchor and stretch are **one** model, because one gesture can change both — releasing a
 * stretched axis re-pins the anchor — and reporting them separately would surface a state
 * that is never valid.
 */
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import type { Component } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import { usePanelOverlayOptional } from '../composables/usePanelOverlay'
import { computeResizedRect, startPointerDrag } from '../core/dragResize'
import type { ResizeDir } from '../core/dragResize'
import {
  DOCK_INSET, DRAG_THRESHOLD, MIN_H, MIN_W, SNAP_IN, SNAP_OUT,
  anchorAfterRelease, dockedBand, flipZoneHorizontal, handleDirs, hoveredZone, stackOffset,
} from '../core/panelOverlay'
import { addAxis, bucketsFor, releaseAxis, stretchesBlock, stretchesInline } from '../core/stretch'
import type { PanelFloatPlacement, Stretch } from '../core/stretch'
import type { FloatAnchor, Label } from '../types'

const props = withDefaults(defineProps<{
  /** Unique within this panel's overlay. Drives z-order and stack membership. */
  widgetId: string
  /** Header text: plain, or a localisable descriptor resolved on every render. */
  title: Label
  icon?: Component
  /** Width in pixels. Ignored while the inline axis is stretched, and returned to on release. */
  width?: number
  /** Height in pixels. Ignored while the block axis is stretched, and returned to on release. */
  height?: number
  /** `false` disables resize-to-stretch snapping, for content that needs a bounded size. @default true */
  stretchable?: boolean
}>(), { width: 320, height: 240, stretchable: true })

/** Whether the widget is mounted. `v-model:open` replaces rdd's `usePanelFloatingWindow()`. */
const open = defineModel<boolean>('open', { default: true })

/**
 * Where the widget sits: its corner, and which axes span the panel.
 *
 * Bind it and the caller owns placement — which is also the only way to persist it, since the
 * library serialises nothing about inner widgets. Leave it off and the widget keeps its own.
 *
 * **If you bind it, the value must be stable or echoed back.** `defineModel` re-syncs from the
 * prop whenever the prop's *identity* changes, so a fresh object literal — `:placement="{ anchor,
 * stretch }"` — resets the widget on every render of the parent, with or without a listener, and
 * gestures appear to work and then revert. Hold it in a `ref` and use `v-model:placement`, or
 * write the emitted value back into whatever you bound.
 */
const placement = defineModel<PanelFloatPlacement>('placement', {
  default: () => ({ anchor: 'top-right' as FloatAnchor, stretch: null }),
})

const ws = useWorkspace()
const store = usePanelOverlayOptional()
const el = useTemplateRef<HTMLDivElement>('el')

const isRtl = computed(() => ws.state.isRtl)
const anchor = computed(() => placement.value.anchor)
const stretch = computed(() => placement.value.stretch)

/** `docked` tracks a corner; `free` positions from an explicit box. */
const mode = ref<'docked' | 'free'>('docked')
const freePos = ref<{ x: number; y: number } | null>(null)

/**
 * The widget's own size.
 *
 * Left untouched while an axis is stretched — the render simply stops reading it, exactly as a
 * maximised workspace window keeps its rect. Releasing the axis therefore restores the
 * previous size with no snapshot and no bookkeeping.
 */
const size = ref({ w: props.width, h: props.height })

/** Which axes would snap to stretched if the drag ended now. Drives the visual cue. */
const snapArmed = ref({ inline: false, block: false })

/** The single write path for placement, so a listener never sees a half-applied transition. */
function applyPlacement(nextAnchor: FloatAnchor, nextStretch: Stretch | null): void {
  placement.value = { anchor: nextAnchor, stretch: nextStretch }
}

// ── stack membership ───────────────────────────────────────────────────────
/**
 * Depends on the whole placement, not only the anchor — a full-width strip belongs to both
 * buckets of its edge — so this re-runs whenever either changes, not just on mount.
 *
 * `watch` with explicit sources rather than `watchEffect`: registering also *reads* the
 * stacks (to skip a no-op write), so an effect that tracked its own body would depend on the
 * very state it writes and re-trigger itself forever. Naming the sources is the fix, and it
 * also says exactly what a re-registration is supposed to follow.
 */
watch(
  [() => open.value, mode, anchor, stretch],
  ([isOpen, currentMode]) => {
    if (!store || !isOpen) return
    if (currentMode !== 'docked') { store.undock(props.widgetId); return }
    store.dock(props.widgetId, anchor.value, stretch.value)
  },
  { immediate: true },
)

watch(() => size.value.h, (h) => store?.reportSize(props.widgetId, h), { immediate: true })
onBeforeUnmount(() => store?.undock(props.widgetId))

// A block-stretched widget spans the very axis stacking uses to separate siblings, so it
// cannot stack — it overlaps them and z-order decides. Worth saying once.
let warnedBlockStretch = false
// Also an explicit watch, for the same reason: it reads the stacks, which the effect above
// writes, so as a `watchEffect` the two would chase each other.
watch([mode, anchor, stretch], () => {
  if (process.env.NODE_ENV === 'production' || warnedBlockStretch) return
  if (!store || mode.value !== 'docked' || !stretchesBlock(stretch.value)) return
  const half = anchor.value.endsWith('-right') ? 'right' : 'left'
  const neighbours = ([`top-${half}`, `bottom-${half}`] as FloatAnchor[])
    .flatMap(bucket => store.stacks[bucket] ?? [])
    .filter(other => other !== props.widgetId)
  if (neighbours.length === 0) return
  warnedBlockStretch = true
  console.warn(
    `[vue-dockable-desktop] <VddFloatingWidget> "${props.widgetId}" stretches the block axis ` +
    `("${stretch.value}") while ${neighbours.length} other widget(s) are anchored to the same ` +
    `side (${neighbours.join(', ')}). A block-stretched widget spans the axis stacking uses to ` +
    `separate siblings, so it cannot stack and will overlap them — z-order decides which is on ` +
    `top. Give it a fixed height, or move the others to the opposite side.`,
  )
})

// ── geometry ───────────────────────────────────────────────────────────────
const zOrder = computed(() => store?.zOrders[props.widgetId] ?? 101)
const isActive = computed(() => !store || store.topId.value === props.widgetId)
const band = () => dockedBand(store?.insets ?? { top: 0, bottom: 0, inlineStart: 0, inlineEnd: 0 }, isRtl.value)

function containerBounds(): { cw: number; ch: number } {
  const parent = el.value?.offsetParent as HTMLElement | null
  return { cw: parent?.clientWidth ?? 9999, ch: parent?.clientHeight ?? 9999 }
}

const stack = computed(() => {
  if (!store || mode.value !== 'docked') return { offset: 0, registered: true }
  return stackOffset(
    props.widgetId,
    bucketsFor(anchor.value, stretch.value),
    store.stacks,
    store.dockedSizes,
    props.height,
  )
})

/**
 * Inline axis: one inset plus an explicit width, or **both** insets and no width at all.
 * Setting both ends is the whole stretch mechanism — CSS then keeps the widget spanning the
 * panel for free, with no observer and no JavaScript.
 */
const widgetStyle = computed<Record<string, string | number | undefined>>(() => {
  if (mode.value !== 'docked' || !store) {
    return {
      left: `${freePos.value?.x ?? 0}px`,
      top: `${freePos.value?.y ?? 0}px`,
      width: `${size.value.w}px`,
      height: `${size.value.h}px`,
      zIndex: zOrder.value,
    }
  }

  const b = band()
  const style: Record<string, string | number | undefined> = {
    zIndex: zOrder.value,
    // Hidden until its first stack registration lands, so it never paints at the wrong offset.
    opacity: stack.value.registered ? undefined : 0,
    pointerEvents: stack.value.registered ? undefined : 'none',
  }

  if (stretchesInline(stretch.value)) {
    style.insetInlineStart = `${store.insets.inlineStart + DOCK_INSET}px`
    style.insetInlineEnd = `${store.insets.inlineEnd + DOCK_INSET}px`
  } else {
    style[anchor.value.endsWith('-right') ? 'insetInlineEnd' : 'insetInlineStart'] = `${DOCK_INSET}px`
    style.width = `${size.value.w}px`
  }

  // The block insets carry no gutter, matching how a docked widget sits flush against a
  // top or bottom toolbar rather than inset from it.
  if (stretchesBlock(stretch.value)) {
    style.top = `${b.top}px`
    style.bottom = `${b.bottom}px`
  } else if (anchor.value.startsWith('top-')) {
    style.top = `${b.top + stack.value.offset}px`
    style.height = `${size.value.h}px`
  } else {
    style.bottom = `${b.bottom + stack.value.offset}px`
    style.height = `${size.value.h}px`
  }

  return style
})

const dirs = computed(() => handleDirs(mode.value, anchor.value, stretch.value, isRtl.value))

// ── header drag ────────────────────────────────────────────────────────────
let drag: { mouseX: number; mouseY: number; posX: number; posY: number; moved: boolean } | null = null

function onHeaderDown(event: PointerEvent): void {
  if (event.button !== 0) return
  event.preventDefault()

  let startX: number
  let startY: number
  if (mode.value === 'docked') {
    // Snapshot the rendered position so that *if* this becomes a real drag, switching to free
    // positioning causes no visual jump. Undocking is deferred to the threshold below: doing
    // it here meant a plain click on the header silently tore the widget off its anchor — it
    // looked unchanged, but its stacked siblings reflowed to close the gap and it stopped
    // tracking the corner on every later panel resize.
    const node = el.value
    const container = store?.container.value
    if (node && container) {
      const r = node.getBoundingClientRect()
      const c = container.getBoundingClientRect()
      startX = r.left - c.left
      startY = r.top - c.top
    } else {
      startX = DOCK_INSET
      startY = store?.insets.top ?? 0
    }
  } else {
    startX = freePos.value?.x ?? 0
    startY = freePos.value?.y ?? 0
  }

  drag = { mouseX: event.clientX, mouseY: event.clientY, posX: startX, posY: startY, moved: false }
  el.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return
  if (!drag.moved) {
    if (Math.abs(event.clientX - drag.mouseX) + Math.abs(event.clientY - drag.mouseY) < DRAG_THRESHOLD) return
    drag.moved = true
    if (mode.value === 'docked') {
      // A stretched axis carries no size, so free mode — which positions from an explicit box
      // — would snap back to whatever the size was before stretching. Materialise what is
      // actually on screen, then clear stretch: free and spanning are mutually exclusive.
      if (stretch.value) {
        const r = el.value?.getBoundingClientRect()
        if (r) size.value = { w: Math.round(r.width), h: Math.round(r.height) }
        applyPlacement(anchor.value, null)
      }
      store?.undock(props.widgetId)
      mode.value = 'free'
    }
    document.body.classList.add('vdd-dragging-active')
    if (store) store.draggingId.value = props.widgetId
  }

  const { cw, ch } = containerBounds()
  freePos.value = {
    x: Math.max(0, Math.min(drag.posX + event.clientX - drag.mouseX, cw - size.value.w)),
    y: Math.max(0, Math.min(drag.posY + event.clientY - drag.mouseY, ch - size.value.h)),
  }

  const container = store?.container.value
  if (container && store) {
    const raw = hoveredZone(container.getBoundingClientRect(), event.clientX, event.clientY)
    store.hovered.value = raw && isRtl.value ? flipZoneHorizontal(raw) : raw
  }
}

function onPointerUp(): void {
  if (drag?.moved && store) {
    const zone = store.hovered.value
    if (zone) {
      mode.value = 'docked'
      freePos.value = null
      applyPlacement(zone, stretch.value)
    }
    store.hovered.value = null
    store.draggingId.value = null
  }
  document.body.classList.remove('vdd-dragging-active')
  drag = null
}

function onPointerCancel(): void {
  if (drag?.moved && store) {
    store.hovered.value = null
    store.draggingId.value = null
  }
  document.body.classList.remove('vdd-dragging-active')
  drag = null
}

// ── resize ─────────────────────────────────────────────────────────────────
function onResizeDown(dir: ResizeDir, event: PointerEvent): void {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()

  let startX = 0
  let startY = 0
  if (mode.value === 'free') {
    startX = freePos.value?.x ?? 0
    startY = freePos.value?.y ?? 0
  } else {
    const node = el.value
    const parent = node?.offsetParent as HTMLElement | null
    if (node && parent) {
      const r = node.getBoundingClientRect()
      const p = parent.getBoundingClientRect()
      startX = r.left - p.left
      startY = r.top - p.top
    }
  }

  // A stretched axis's stored size is stale by design, so the drag has to start from the
  // *measured* extent or the widget jumps on the first move.
  const measured = el.value?.getBoundingClientRect()
  const start = {
    x: startX,
    y: startY,
    w: stretchesInline(stretch.value) && measured ? measured.width : size.value.w,
    h: stretchesBlock(stretch.value) && measured ? measured.height : size.value.h,
  }

  const dragsInline = dir.includes('e') || dir.includes('w')
  const dragsBlock = dir.includes('n') || dir.includes('s')
  let released = false
  let armed = { inline: false, block: false }

  /**
   * Dragging an end of a stretched axis releases it: the edge under the pointer becomes the
   * moving one and the opposite end becomes the new pin, so it reads exactly like an ordinary
   * resize. Once per drag — `released` guards repeat moves before the next render.
   */
  function releaseIfNeeded(): void {
    if (released || mode.value !== 'docked') return
    const current = stretch.value
    const axes = {
      inline: dragsInline && stretchesInline(current),
      block: dragsBlock && stretchesBlock(current),
    }
    if (!axes.inline && !axes.block) return
    released = true

    let next = current
    if (axes.inline) next = releaseAxis(next, 'inline')
    if (axes.block) next = releaseAxis(next, 'block')
    applyPlacement(anchorAfterRelease(anchor.value, dir, axes, isRtl.value), next)
  }

  startPointerDrag({
    element: event.currentTarget as HTMLElement,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    captureStart: () => start,
    activeClasses: [{ el: document.body, classes: ['vdd-resizing-active'] }],
    onMove: (dx, dy, from) => {
      // Re-measured every move: the container can change size mid-drag.
      const { cw, ch } = containerBounds()
      // Docked widgets stop at the toolbar band. Free ones are unconstrained beyond the
      // container itself, since free means free.
      const b = mode.value === 'docked' ? band() : { left: 0, right: 0, top: 0, bottom: 0 }
      const rect = computeResizedRect(dir, dx, dy, from, {
        minW: MIN_W, minH: MIN_H,
        maxW: (cw - b.right) - from.x, maxH: (ch - b.bottom) - from.y,
        minX: b.left, minY: b.top,
      })
      releaseIfNeeded()

      // ── resize-to-stretch snapping ──
      // The clamps above already stop growth exactly where a stretched axis would sit, so an
      // armed drag is visually at its target already; the cue is an outline, not a ghost.
      if (mode.value === 'docked' && props.stretchable) {
        const fullInline = cw - b.left - b.right
        const fullBlock = ch - b.top - b.bottom - stack.value.offset
        const current = stretch.value
        const next = { ...armed }
        if (dragsInline && !stretchesInline(current)) {
          if (rect.w >= fullInline - SNAP_IN) next.inline = true
          else if (armed.inline && rect.w < fullInline - SNAP_OUT) next.inline = false
        }
        if (dragsBlock && !stretchesBlock(current)) {
          if (rect.h >= fullBlock - SNAP_IN) next.block = true
          else if (armed.block && rect.h < fullBlock - SNAP_OUT) next.block = false
        }
        if (next.inline !== armed.inline || next.block !== armed.block) {
          armed = next
          snapArmed.value = next
        }
      }

      // Only write an axis that carries a size. A still-stretched axis keeps its stored
      // value, so releasing it later restores the size it had before stretching.
      const effective = released
        ? releaseAxis(releaseAxis(stretch.value, dragsInline ? 'inline' : 'block'), dragsBlock ? 'block' : 'inline')
        : stretch.value
      size.value = {
        w: stretchesInline(effective) ? size.value.w : rect.w,
        h: stretchesBlock(effective) ? size.value.h : rect.h,
      }
      if (mode.value === 'free') freePos.value = { x: rect.x, y: rect.y }
    },
    onEnd: (from) => {
      if (!armed.inline && !armed.block) {
        if (snapArmed.value.inline || snapArmed.value.block) snapArmed.value = { inline: false, block: false }
        return
      }
      // Restore the size the axis had *before* this drag: while an axis is stretched its
      // stored size is what releasing it returns to, so it should be the size the user last
      // chose deliberately — not the full-bleed value the drag happened to pass through.
      size.value = {
        w: armed.inline ? from.w : size.value.w,
        h: armed.block ? from.h : size.value.h,
      }
      let next = stretch.value
      if (armed.inline) next = addAxis(next, 'inline')
      if (armed.block) next = addAxis(next, 'block')
      applyPlacement(anchor.value, next)
      snapArmed.value = { inline: false, block: false }
    },
  })
}
</script>

<template>
  <div
    v-if="open"
    ref="el"
    class="vdd-panel-float"
    :class="{
      'vdd-panel-float--active': isActive,
      'vdd-panel-float--snapping': snapArmed.inline || snapArmed.block,
    }"
    :style="widgetStyle"
    :dir="ws.state.dir"
    :data-vdd-widget="widgetId"
    @pointerdown="store?.focus(widgetId)"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <div class="vdd-panel-float__header" data-vdd-widget-header @pointerdown="onHeaderDown">
      <span v-if="icon" class="vdd-panel-float__icon"><component :is="icon" /></span>
      <span class="vdd-panel-float__title">{{ ws.format(title) }}</span>
      <button
        type="button"
        class="vdd-panel-float__close"
        :title="ws.format(ws.messages.close)"
        :aria-label="ws.format(ws.messages.close)"
        data-vdd-widget-close
        @click="open = false"
        @pointerdown.stop
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      </button>
    </div>

    <div class="vdd-panel-float__body"><slot /></div>

    <div
      v-for="dir in dirs"
      :key="dir"
      class="vdd-resize-handle"
      :class="`vdd-resize-${dir}`"
      :data-vdd-widget-resize="dir"
      @pointerdown="onResizeDown(dir, $event)"
    />
  </div>
</template>
