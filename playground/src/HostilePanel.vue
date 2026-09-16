<script setup lang="ts">
/**
 * A panel designed to lose its state if anything re-creates or carelessly re-parents it:
 * a live WebGL context, a playing video, a scrolled list, a focused input with a caret, a
 * running interval, and a mid-flight CSS animation.
 *
 * The browser gates drive this through every layout change and assert none of it resets.
 */
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { usePanel } from 'vue-dockable-desktop'

// Declared rather than left to fall through: `VddPanelMount` passes `panelId` for panels
// that want it, and an undeclared prop would land on the root element as an attribute.
defineProps<{ panelId?: string }>()

const { id, isActive, isMinimized, size } = usePanel()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const video = useTemplateRef<HTMLVideoElement>('video')
const ticks = ref(0)
let timer: number | undefined

onMounted(() => {
  const w = window as unknown as Record<string, Record<string, unknown>>
  w.__mounts = w.__mounts ?? {}
  w.__mounts[id] = ((w.__mounts[id] as number) ?? 0) + 1

  const gl = canvas.value!.getContext('webgl')
  w.__gl = w.__gl ?? {}
  w.__gl[id] = gl as unknown as Record<string, unknown>
  if (gl) { gl.clearColor(0.2, 0.7, 0.9, 1); gl.clear(gl.COLOR_BUFFER_BIT) }

  video.value?.play().catch(() => { /* reported by the harness */ })
  timer = window.setInterval(() => { ticks.value++ }, 50)
})

onUnmounted(() => {
  window.clearInterval(timer)
  const w = window as unknown as Record<string, Record<string, number>>
  w.__unmounts = w.__unmounts ?? {}
  w.__unmounts[id] = (w.__unmounts[id] ?? 0) + 1
})
</script>

<template>
  <div
    class="hostile"
    :data-hostile="id"
  >
    <div class="meta">
      <b>{{ id }}</b>
      <span :data-ticks="id">{{ ticks }}</span>
      <span :data-active="id">{{ isActive ? 'active' : '' }}</span>
      <span :data-min="id">{{ isMinimized ? 'min' : '' }}</span>
      <span :data-size="id">{{ size ? `${Math.round(size.width)}x${Math.round(size.height)}` : '' }}</span>
    </div>
    <canvas
      ref="canvas"
      :data-canvas="id"
      width="60"
      height="40"
    />
    <video
      ref="video"
      :data-video="id"
      src="/test.mp4"
      width="80"
      muted
      loop
      playsinline
    />
    <div
      class="scroller"
      :data-scroller="id"
    >
      <div
        v-for="n in 80"
        :key="n"
        class="row"
      >
        row {{ n }}
      </div>
    </div>
    <input
      :data-input="id"
      value="hello world"
    >
    <div
      class="anim"
      :data-anim="id"
    />
  </div>
</template>

<style scoped>
.hostile { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px; font: 11px system-ui; align-items: flex-start; }
.meta { width: 100%; display: flex; gap: 6px; }
.scroller { height: 60px; width: 110px; overflow: auto; border: 1px solid #555; }
.row { padding: 1px 3px; }
input { width: 100px; }
.anim { width: 12px; height: 12px; background: #f59e0b; animation: vdd-pg-slide 4s linear infinite; }
@keyframes vdd-pg-slide { from { transform: translateX(0) } to { transform: translateX(60px) } }
</style>
