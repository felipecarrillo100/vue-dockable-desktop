<script setup lang="ts">
/** Hands the gate `useFloatingWidgets()`, which only works inside the overlay. */
import { defineComponent, h, markRaw } from 'vue'
import { useFloatingWidgets } from 'vue-dockable-desktop'
import type { WidgetMenuContext } from 'vue-dockable-desktop'
import ManagedContent from './ManagedContent.vue'
import EmbedFrame from './EmbedFrame.vue'

const api = useFloatingWidgets()
const icon = markRaw(defineComponent({ render: () => h('span', { class: 'wo-icon', style: 'display:inline-block;width:12px;height:12px;background:currentColor' }) }))
const w = window as unknown as { __overlay: Record<string, unknown>; __woPopResult?: unknown }
w.__overlay.widgets = {
  api,
  content: markRaw(ManagedContent),
  // An iframe that counts its loads (7.11, preserveEmbeds on a widget).
  embed: markRaw(EmbedFrame),
  // An icon for the widget's tab and title bar out of the panel (M4: they open its menu).
  icon,
}

// `?wo=1` (the M18 gate, P5): a managed widget that can go into its own window, with the app's own
// "Open in new window" item in its titleMenu (the library adds none for a widget). `?opo=1`: the
// owner panel can pop out too, and #wo-po-in, a click inside it, pops the widget out from there.
const params = new URLSearchParams(location.search)
const opo = params.get('opo') === '1'
if (params.get('wo') === '1') {
  api.open('wo', {
    title: 'Widget', component: markRaw(ManagedContent), icon, anchor: 'top-left', width: 200, height: 160,
    canPopOut: true, canFloat: true, canDock: true,
    titleMenu: (m: WidgetMenuContext) => [
      { label: 'Open in new window', disabled: !m.canPopOut || m.isPoppedOut, action: () => { w.__woPopResult = m.popOut() } },
      { label: 'Back into the panel', disabled: m.location === 'panel', action: () => { m.move({ to: 'panel' }) } },
    ],
  })
}
function popOutHere(): void {
  w.__woPopResult = api.popOut('wo')
}
</script>

<template>
  <button
    v-if="opo"
    id="wo-po-in"
    style="position: absolute; left: 40%; top: 45%; z-index: 1"
    @click="popOutHere"
  >
    pop out wo here
  </button>
  <span
    v-else
    hidden
  />
</template>
