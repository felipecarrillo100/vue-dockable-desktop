<script setup lang="ts">
/**
 * A terminal, and the simplest demonstration of zero-unmount preservation: its scroll
 * position and its accumulating log survive every dock, float, minimise and restore, because
 * the panel is never unmounted (ADR 0002).
 */
import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { usePanel } from 'vue-dockable-desktop'

const lines = ref<string[]>([
  '$ vite build',
  'vite v8.0.0 building for production...',
  'transforming (48) src/index.ts',
])
const scroller = useTemplateRef<HTMLDivElement>('scroller')
const panel = usePanel()

/** A running log, so "the panel kept its state" is visible rather than asserted. */
let tick = 0
const timer = setInterval(() => {
  tick += 1
  lines.value.push(`✓ built module ${tick} in ${(Math.random() * 40 + 5).toFixed(1)}ms`)
  if (lines.value.length > 400) lines.value.splice(0, 100)
  requestAnimationFrame(() => {
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  })
}, 1200)
onBeforeUnmount(() => clearInterval(timer))

// The panel's own title reports how much it has logged, which is state the tab can show.
watch(() => lines.value.length, (n) => panel.setTitle(`Terminal (${n})`))
</script>

<template>
  <div ref="scroller" class="dd-panel" data-demo-terminal>
    <pre style="margin: 0; font-size: 0.72rem; line-height: 1.5">{{ lines.join('\n') }}</pre>
  </div>
</template>
