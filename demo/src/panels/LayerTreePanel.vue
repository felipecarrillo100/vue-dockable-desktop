<script setup lang="ts">
/**
 * A layer catalogue that talks to the map panel through the workspace's event bus, reads the
 * toolbar's active tool, and drives the sidebar drawer.
 *
 * Three integration points in one small panel: `publish`/`subscribe` for panel-to-panel
 * messages, `useToolbar()` for shared tool state, and `useSidebar()` for the drawer — all
 * reachable without either panel knowing the other exists.
 */
import { computed, onMounted, reactive } from 'vue'
import { useSidebar, useToolbar, useWorkspace } from 'vue-dockable-desktop'

export interface LayerDefinition {
  id: string
  name: string
  visible: boolean
  /** A base map is always on, so its switch is disabled rather than absent. */
  locked?: boolean
}

const LAYERS: LayerDefinition[] = [
  { id: 'basemap', name: '🗺️  Carto dark base map', visible: true, locked: true },
  { id: 'markers', name: '📍  London landmarks', visible: true },
  { id: 'polygons', name: '🏛️  District boundaries', visible: true },
  { id: 'polylines', name: '🌊  Thames path', visible: false },
]

const ws = useWorkspace()
const toolbar = useToolbar()
const sidebar = useSidebar()

const visibility = reactive<Record<string, boolean>>(
  Object.fromEntries(LAYERS.map(l => [l.id, l.visible])),
)

/** Announce the initial state, so the map starts in step with this panel. */
onMounted(() => {
  for (const layer of LAYERS) {
    if (!layer.locked) ws.publish('layer-visibility', { layerId: layer.id, visible: visibility[layer.id] })
  }
})

function toggle(id: string): void {
  visibility[id] = !visibility[id]
  ws.publish('layer-visibility', { layerId: id, visible: visibility[id] })
}

// The toolbar's state is on the workspace, so this reads the active tool without the toolbar
// passing anything down — and without this panel knowing where the toolbar is.
const activeTool = computed(() => toolbar.activeInGroup('demo-tool') ?? 'none')
</script>

<template>
  <div class="dd-panel">
    <div class="dd-section">
      <h5>Active tool, read from the workspace</h5>
      <code>{{ activeTool }}</code>
      <p class="dd-note">
        Open the Tools panel and pick a tool — this updates without the two panels knowing
        about each other.
      </p>
    </div>

    <div class="dd-section">
      <h5>Layers</h5>
      <div class="dd-col">
        <label
          v-for="layer in LAYERS"
          :key="layer.id"
          class="dd-row"
          :style="{ opacity: visibility[layer.id] ? 1 : 0.5, cursor: layer.locked ? 'default' : 'pointer' }"
        >
          <input
            type="checkbox"
            :checked="visibility[layer.id]"
            :disabled="layer.locked"
            :data-demo-layer="layer.id"
            @change="toggle(layer.id)"
          >
          <span>{{ layer.name }}</span>
        </label>
      </div>
      <p class="dd-note">Published on the event bus; the map subscribes.</p>
    </div>

    <div class="dd-section">
      <h5>Drive the sidebar from inside a panel</h5>
      <div class="dd-row">
        <button type="button" data-demo-open-search @click="sidebar.openTab('search')">Open Search</button>
        <button type="button" data-demo-close-drawer @click="sidebar.closeDrawer()">Close drawer</button>
      </div>
      <p class="dd-note">
        <code>useSidebar()</code> works from here because the workspace is the sidebar's own
        content — a panel is inside it.
      </p>
    </div>
  </div>
</template>
