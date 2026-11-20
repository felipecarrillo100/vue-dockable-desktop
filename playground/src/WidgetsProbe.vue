<script setup lang="ts">
/** Hands the gate `useFloatingWidgets()`, which only works inside the overlay. */
import { defineComponent, h, markRaw } from 'vue'
import { useFloatingWidgets } from 'vue-dockable-desktop'
import ManagedContent from './ManagedContent.vue'
import EmbedFrame from './EmbedFrame.vue'

;(window as unknown as { __overlay: Record<string, unknown> }).__overlay.widgets = {
  api: useFloatingWidgets(),
  content: markRaw(ManagedContent),
  // An iframe that counts its loads (7.11, preserveEmbeds on a widget).
  embed: markRaw(EmbedFrame),
  // An icon for the widget's tab and title bar out of the panel (M4: they open its menu).
  icon: markRaw(defineComponent({ render: () => h('span', { class: 'wo-icon', style: 'display:inline-block;width:12px;height:12px;background:currentColor' }) })),
}
</script>

<template>
  <span hidden />
</template>
