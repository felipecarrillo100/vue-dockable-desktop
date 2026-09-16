<script setup lang="ts">
/**
 * The notification host. Mount once, anywhere.
 *
 * `maxVisible` is a `computed` slice of the one queue, not a second array that has to be
 * shifted from. rdd kept the overflow in a separate `queueRef` and promoted from it
 * imperatively when a toast finished exiting; here a toast leaving the list means the next
 * one is simply inside the slice, so promotion is not code.
 */
import { computed, onBeforeUnmount, watch } from 'vue'
import { removeToast, toastQueue } from '../core/toast'
import type { ToastAdapter, ToastPosition } from '../core/toast'
import VddToastItem from './VddToastItem.vue'

const props = withDefaults(defineProps<{
  /** @default 'top-right' */
  position?: ToastPosition
  /** How many show at once. The rest wait. @default 3 */
  maxVisible?: number
  /** Auto-dismiss delay in ms; `0` makes every toast sticky. @default 5000 */
  defaultDuration?: number
  /** @default true */
  defaultClosable?: boolean
  /** Hold the timer while the pointer is over a toast. @default true */
  pauseOnHover?: boolean
  /** @default 'slide' */
  animation?: 'slide' | 'fade' | 'none'
  /** Put the newest toast at the top of the stack. @default false */
  newestOnTop?: boolean
  /** A countdown bar along the bottom of each toast. @default false */
  progressBar?: boolean
  /** Card width in pixels. @default 320 */
  width?: number
  /** Hand every `toast.*` call to another library instead. */
  adapter?: ToastAdapter
}>(), {
  position: 'top-right',
  maxVisible: 3,
  defaultDuration: 5000,
  defaultClosable: true,
  pauseOnHover: true,
  animation: 'slide',
  newestOnTop: false,
  progressBar: false,
  width: 320,
})

// An adapter is registered on the store, so `toast.*` reaches it even when called from
// outside any component — the whole point of the singleton.
watch(() => props.adapter, (adapter) => { toastQueue.adapter = adapter ?? null }, { immediate: true })
onBeforeUnmount(() => { if (toastQueue.adapter === props.adapter) toastQueue.adapter = null })

/**
 * What is on screen: the oldest `maxVisible` toasts, with the ones still animating out kept
 * in place so they can finish rather than being yanked as the next one arrives.
 */
const visible = computed(() => {
  const result = []
  let shown = 0
  for (const item of toastQueue.items) {
    if (item.exiting) { result.push(item); continue }
    if (shown >= props.maxVisible) break
    result.push(item)
    shown++
  }
  return props.newestOnTop ? [...result].reverse() : result
})

/**
 * A toast dismissed while still queued has never been rendered, so nothing will ever report
 * its transition ending. Drop it here — this component is the only thing that knows whether
 * a given toast was on screen at all.
 */
watch(() => toastQueue.items.map(t => `${t.id}:${t.exiting}`).join(','), () => {
  const onScreen = new Set(visible.value.map(t => t.id))
  for (const item of [...toastQueue.items]) {
    if (item.exiting && !onScreen.has(item.id)) removeToast(item.id)
  }
}, { immediate: true })

const isLeft = computed(() => props.position.endsWith('left'))
</script>

<template>
  <Teleport v-if="adapter" to="body">
    <component :is="adapter.component" v-if="adapter.component" :position="position" />
  </Teleport>

  <Teleport v-else to="body">
    <div
      class="vdd-toast-container"
      :class="[
        `vdd-toast-container--${position}`,
        newestOnTop ? 'vdd-toast-container--newest-top' : 'vdd-toast-container--newest-bottom',
      ]"
      :style="{ width: `${width}px` }"
      aria-label="Notifications"
      aria-live="polite"
      data-vdd-toasts
    >
      <VddToastItem
        v-for="item in visible"
        :key="item.id"
        :toast="item"
        :is-left="isLeft"
        :show-progress="progressBar"
        :pause-on-hover="pauseOnHover"
        :animation="animation"
        :default-duration="defaultDuration"
        :default-closable="defaultClosable"
        @exited="removeToast"
      />
    </div>
  </Teleport>
</template>
