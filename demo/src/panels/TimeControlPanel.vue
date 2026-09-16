<script setup lang="ts">
/**
 * A playback strip: the case for a panel docked to a workspace edge as a full-width row.
 *
 * Its running frame counter is also the simplest proof that a docked panel dragged to a new
 * group is moved rather than re-created.
 */
import { computed, onBeforeUnmount, ref } from 'vue'

const playing = ref(false)
const frame = ref(50)
let timer: ReturnType<typeof setInterval> | null = null

function toggle(): void {
  playing.value = !playing.value
  if (playing.value) {
    timer = setInterval(() => { frame.value = (frame.value + 1) % 101 }, 120)
  } else if (timer) {
    clearInterval(timer)
    timer = null
  }
}
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const clock = computed(() => {
  const total = Math.round((frame.value / 100) * 24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})
</script>

<template>
  <div class="dd-panel dd-row" style="height: 100%; padding: 0.5rem 0.8rem; overflow: hidden">
    <button type="button" data-demo-play style="min-width: 5.5rem" @click="toggle">
      {{ playing ? '⏸ Pause' : '▶ Play' }}
    </button>
    <input v-model.number="frame" type="range" min="0" max="100" style="flex: 1; min-width: 80px">
    <span style="font-family: ui-monospace, monospace; white-space: nowrap">
      {{ clock }} · frame {{ frame }}/100
    </span>
  </div>
</template>
