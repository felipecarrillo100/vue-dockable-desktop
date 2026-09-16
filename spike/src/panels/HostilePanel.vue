<!--
  A panel designed to lose state if anything remounts or re-parents it carelessly:
  a live WebGL context, a playing video, a scrolled list, a focused input with a caret,
  a running interval, a mid-flight CSS animation, and an iframe.
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'

const props = defineProps<{ id: string }>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const video = useTemplateRef<HTMLVideoElement>('video')
const ticks = ref(0)
const mounts = ref(0)
let timer: number | undefined

onMounted(() => {
  // Recorded on window so the harness can prove the component mounted exactly once.
  const w = window as any
  w.__mounts = w.__mounts ?? {}
  w.__mounts[props.id] = (w.__mounts[props.id] ?? 0) + 1
  mounts.value = w.__mounts[props.id]

  const gl = canvas.value!.getContext('webgl')
  w.__gl = w.__gl ?? {}
  w.__gl[props.id] = gl
  if (gl) { gl.clearColor(0.2, 0.7, 0.9, 1); gl.clear(gl.COLOR_BUFFER_BIT) }

  video.value!.play().catch(() => { /* autoplay policy — reported by the harness */ })
  timer = window.setInterval(() => { ticks.value++ }, 50)
})

onUnmounted(() => {
  window.clearInterval(timer)
  const w = window as any
  w.__unmounts = w.__unmounts ?? {}
  w.__unmounts[props.id] = (w.__unmounts[props.id] ?? 0) + 1
})
</script>

<template>
  <div class="panel" :data-panel="id">
    <div class="meta">
      <b>{{ id }}</b>
      mounts=<span :data-mounts="id">{{ mounts }}</span>
      ticks=<span :data-ticks="id">{{ ticks }}</span>
    </div>
    <canvas ref="canvas" :data-canvas="id" width="60" height="40" />
    <video ref="video" :data-video="id" src="/test.mp4" width="80" muted loop playsinline />
    <div class="scroller" :data-scroller="id">
      <div v-for="n in 60" :key="n" class="item">row {{ n }}</div>
    </div>
    <input :data-input="id" value="hello world" />
    <div class="anim" :data-anim="id" />
    <iframe :data-iframe="id" src="/iframe.html" width="70" height="26" />
  </div>
</template>

<style scoped>
.panel { display: flex; flex-wrap: wrap; gap: 4px; align-items: flex-start; font-size: 11px; }
.meta { width: 100%; }
.scroller { height: 52px; width: 90px; overflow: auto; border: 1px solid #555; }
.item { padding: 1px 3px; }
.anim { width: 12px; height: 12px; background: #f59e0b;
        animation: slide 4s linear infinite; }
@keyframes slide { from { transform: translateX(0) } to { transform: translateX(60px) } }
input { width: 90px; }
</style>
