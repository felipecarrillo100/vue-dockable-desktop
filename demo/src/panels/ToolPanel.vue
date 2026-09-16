<script setup lang="ts">
/**
 * A tool palette that publishes itself to the application's own toolbar and sidebar.
 *
 * This is what `usePanelContribution` is for: the shell has no idea these tools exist, and
 * they appear in its toolbar only while this panel is the active one. Focus another panel and
 * they are gone — which is the invariant the library guarantees, since `activePanelId` never
 * names a panel the user cannot see.
 */
import { computed, h, markRaw, ref } from 'vue'
import { usePanelContribution } from 'vue-dockable-desktop'

const tool = ref<'pan' | 'draw' | 'measure'>('pan')

const glyph = (path: string) => markRaw({
  render: () => h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }, [h('path', { d: path })]),
})
const ICONS = {
  pan: glyph('M9 11V6a2 2 0 1 1 4 0v5m0 0V4a2 2 0 1 1 4 0v7m0 0V9a2 2 0 1 1 4 0v5a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8v-1a2 2 0 1 1 4 0'),
  draw: glyph('M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'),
  measure: glyph('M3 21h18M3 21V3m0 18l6-6m12 6V9'),
}

const Sections = markRaw({
  render: () => h('div', { class: 'dd-panel' }, [
    h('p', { class: 'dd-note' }, 'Contributed by the Tools panel while it is active.'),
  ]),
})

usePanelContribution(() => ({
  toolbarItems: (['pan', 'draw', 'measure'] as const).map(id => ({
    type: 'radio' as const,
    id: `tool-${id}`,
    group: 'demo-tool',
    label: id[0]!.toUpperCase() + id.slice(1),
    icon: ICONS[id],
    onActivate: () => { tool.value = id },
  })),
  sidebarSections: [
    { id: 'contributed-tools', label: 'Tool options', icon: ICONS.draw, component: Sections },
  ],
}))

const description = computed(() => ({
  pan: 'Drag to move the view. The default tool.',
  draw: 'Click to place vertices; double-click to finish.',
  measure: 'Click two points to measure the distance between them.',
}[tool.value]))
</script>

<template>
  <div class="dd-panel">
    <div class="dd-section">
      <h5>Active tool</h5>
      <div class="dd-row">
        <component :is="ICONS[tool]" />
        <strong>{{ tool }}</strong>
      </div>
      <p class="dd-note">{{ description }}</p>
    </div>
    <p class="dd-note">
      These three tools are in the application's toolbar and the sidebar right now, contributed
      by this panel. Focus a different panel and they disappear — a contribution is surfaced
      only while its own panel is the active one.
    </p>
  </div>
</template>
