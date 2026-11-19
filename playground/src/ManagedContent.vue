<script setup lang="ts">
/**
 * A managed widget's content for the M11 gate (7.11): a counter and a field to carry state
 * through moves, and `#wo-fill` with `height: 100%`, which must fill the frame's body exactly as
 * it did when it was the body's own child rather than inside `div.vdd-panel-float__content`.
 * Since M3, a scroller (`#wo-scroll`) and a canvas (`#wo-gl`, the gate makes its WebGL context)
 * whose state must survive the widget's moves out of the panel and back. Since M5, `#wo-loc`
 * shows `useWidget().location`, and the move callbacks record the element's size.
 */
import { ref } from 'vue'
import { useWidget } from 'vue-dockable-desktop'

const n = ref(0)

// Since M5: what the content element measured at each onWillMove / onMoved, for the gate.
const widget = useWidget()
type Call = { kind: 'will' | 'moved'; size: [number, number]; location: string }
const probe = (window as unknown as { __overlay: { widgets: { calls?: Call[] } } }).__overlay.widgets
const size = (): [number, number] => {
  const el = document.querySelector<HTMLElement>('.vdd-panel-float__content')
  return [el?.offsetWidth ?? 0, el?.offsetHeight ?? 0]
}
const record = (kind: Call['kind']) => () => {
  ;(probe.calls ??= []).push({ kind, size: size(), location: widget?.location.value ?? 'none' })
}
widget?.onWillMove(record('will'))
widget?.onMoved(record('moved'))
</script>

<template>
  <div
    id="wo-fill"
    style="height: 100%; box-sizing: border-box; padding: 4px;"
  >
    <button
      id="wo-count"
      @click="n++"
    >
      {{ n }}
    </button>
    <input
      id="wo-text"
      style="width: 80px"
    >
    <div
      id="wo-scroll"
      style="height: 30px; width: 80px; overflow: auto;"
    >
      <div style="height: 200px" />
    </div>
    <canvas
      id="wo-gl"
      width="40"
      height="20"
    />
    <span id="wo-loc">{{ widget?.location.value ?? 'none' }}</span>
  </div>
</template>
