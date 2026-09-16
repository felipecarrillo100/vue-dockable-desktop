<script setup lang="ts">
/**
 * One toast card: its entry class, its auto-dismiss timer, and its exit.
 *
 * The `max-height` bookkeeping is the subtle part and is inherited wholesale from rdd,
 * where it was arrived at the hard way. The card is clipped to its own content height so the
 * exit can animate that height to zero. Content that grows *after* mount — which is exactly
 * what `toast.promise()` does when a one-line "Saving…" becomes a three-line error — would
 * then be clipped by a stale cap. So a ResizeObserver watches the *inner body*, which is
 * unconstrained and therefore does report growth, and reads the *outer card's* `scrollHeight`,
 * which reports true content height even while a stale cap is clipping it (`offsetHeight`
 * would just return the stale cap). Frozen once exiting starts, where the stylesheet's
 * `max-height: 0` takes over.
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { Component } from 'vue'
import type { ToastRecord, ToastType } from '../core/toast'
import { startExit } from '../core/toast'
import VddToastIcon from './VddToastIcon.vue'

const props = defineProps<{
  toast: ToastRecord
  /** A left-hand container slides in from the other side. */
  isLeft: boolean
  showProgress: boolean
  pauseOnHover: boolean
  animation: 'slide' | 'fade' | 'none'
  defaultDuration: number
  defaultClosable: boolean
}>()

const emit = defineEmits<{ exited: [id: string] }>()

const card = useTemplateRef<HTMLDivElement>('card')
const body = useTemplateRef<HTMLDivElement>('body')

const type = computed<ToastType>(() => props.toast.options.type ?? 'info')
const duration = computed(() => props.toast.options.duration ?? props.defaultDuration)
const closable = computed(() => props.toast.options.closable ?? props.defaultClosable)
const icon = computed<Component | null>(() => props.toast.options.icon ?? null)

// ── entry ──────────────────────────────────────────────────────────────────
const entryClass = ref(
  props.animation === 'none' ? 'vdd-toast--visible'
    : props.animation === 'fade' ? 'vdd-toast--fade-entering'
      : props.isLeft ? 'vdd-toast--entering-left'
        : 'vdd-toast--entering',
)

// ── auto-dismiss ───────────────────────────────────────────────────────────
const paused = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let remaining = 0
let startedAt = 0

function schedule(ms: number): void {
  if (ms <= 0) return
  startedAt = Date.now()
  timer = setTimeout(() => startExit(props.toast.id), ms)
}

function clear(): void {
  if (timer) { clearTimeout(timer); timer = null }
}

/** `revision` is in the key so an in-place update restarts the timer, as rdd's effect did. */
watch(
  [duration, () => props.toast.revision],
  () => {
    clear()
    remaining = duration.value
    schedule(duration.value)
  },
  { immediate: true },
)

function onEnter(): void {
  if (!props.pauseOnHover || duration.value === 0 || !timer) return
  clear()
  remaining = Math.max(0, remaining - (Date.now() - startedAt))
  paused.value = true
}

function onLeave(): void {
  if (!props.pauseOnHover || duration.value === 0) return
  paused.value = false
  schedule(remaining)
}

// ── height sync ────────────────────────────────────────────────────────────
let observer: ResizeObserver | null = null

function applyHeight(): void {
  const el = card.value
  if (el && !props.toast.exiting) el.style.maxHeight = `${el.scrollHeight}px`
}

onMounted(() => {
  applyHeight()
  // jsdom has no ResizeObserver; the height sync is a browser refinement, not behaviour.
  if (typeof ResizeObserver !== 'undefined' && body.value) {
    observer = new ResizeObserver(applyHeight)
    observer.observe(body.value)
  }
  if (props.animation !== 'none') {
    requestAnimationFrame(() => { entryClass.value = 'vdd-toast--visible' })
  }
})

// ── exit ───────────────────────────────────────────────────────────────────
let exitFallback: ReturnType<typeof setTimeout> | null = null

watch(() => props.toast.exiting, (exiting) => {
  if (!exiting) return
  clear()
  observer?.disconnect()
  observer = null
  if (props.animation === 'none' || !card.value) { emit('exited', props.toast.id); return }
  // A transition that never runs — a hidden tab, `prefers-reduced-motion`, a test — would
  // strand the record, so the timeout is a floor, not an optimisation.
  exitFallback = setTimeout(() => emit('exited', props.toast.id), 520)
}, { immediate: true })

function onTransitionEnd(event: TransitionEvent): void {
  if (props.toast.exiting && event.propertyName === 'max-height') emit('exited', props.toast.id)
}

onBeforeUnmount(() => {
  clear()
  if (exitFallback) clearTimeout(exitFallback)
  observer?.disconnect()
})
</script>

<template>
  <div
    ref="card"
    role="status"
    aria-live="polite"
    class="vdd-toast"
    :class="[
      `vdd-toast--${type}`,
      entryClass,
      { 'vdd-toast--exiting': toast.exiting, 'vdd-toast--paused': paused },
    ]"
    :data-vdd-toast="toast.id"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @transitionend="onTransitionEnd"
  >
    <component :is="icon" v-if="icon" />
    <VddToastIcon v-else :type="type" />

    <div ref="body" class="vdd-toast__body">
      <component :is="toast.options.content" v-if="toast.options.content" v-bind="toast.options.contentProps" />
      <template v-else>{{ toast.message }}</template>
    </div>

    <button
      v-if="closable"
      type="button"
      class="vdd-toast__close"
      aria-label="Close notification"
      data-vdd-toast-close
      @click="startExit(toast.id)"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>

    <div
      v-if="showProgress && duration > 0"
      class="vdd-toast__progress"
      :style="{ animationDuration: `${duration}ms` }"
    />
  </div>
</template>
