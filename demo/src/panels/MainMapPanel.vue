<script setup lang="ts">
/**
 * The main map: a panel with its own overlay — toolbars on its edges and floating widgets
 * over its content, all scoped to this panel rather than to the workspace.
 *
 * This is the panel overlay system in full. A widget docked to a corner tracks that corner as
 * the panel resizes; the status strip spans the panel's width instead of carrying one, so CSS
 * keeps it in step with no JavaScript. Click a camera marker and a widget opens for it, from
 * data, through `useFloatingWidgets()`.
 *
 * It is registered with `canClose: false` and `disableLivePreview: true`: the workspace's
 * primary view should not be closable, and a tiled map is not worth scaling into a 160px
 * thumbnail.
 */
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  VddFloatingWidget, VddPanelOverlay, VddPanelToolbar, VddToolbarButton,
  VddToolbarSeparator, VddToolbarSpacer, VddToolbarToggle,
  usePanel, useWorkspace,
} from 'vue-dockable-desktop'
import type { PanelFloatPlacement } from 'vue-dockable-desktop'
import CameraWidgets from './CameraWidgets.vue'

const CAMERAS = [
  { id: 'cam-north', name: 'North Gate', colour: '#38bdf8', at: [51.515, -0.09] as [number, number] },
  { id: 'cam-east', name: 'East Yard', colour: '#22c55e', at: [51.505, -0.07] as [number, number] },
  { id: 'cam-south', name: 'South Dock', colour: '#f59e0b', at: [51.495, -0.10] as [number, number] },
  { id: 'cam-west', name: 'West Lane', colour: '#a855f7', at: [51.508, -0.115] as [number, number] },
]
const CORNERS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const

const host = useTemplateRef<HTMLDivElement>('host')
const ws = useWorkspace()
const panel = usePanel()

const grid = ref(false)
const readout = ref('51.5050, -0.0900 · z13')
const legend = ref<PanelFloatPlacement>({ anchor: 'top-left', stretch: null })
const status = ref<PanelFloatPlacement>({ anchor: 'bottom-left', stretch: 'width' })

let map: L.Map | null = null
const groups = new Map<string, L.LayerGroup>()

/**
 * OpenStreetMap's standard tiles, which need no API key.
 *
 * The dark variant is a CSS filter on the tile pane rather than a second provider — see
 * `demo.css`. One source, no token, and it follows the workspace's colour scheme.
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/** Widgets opened from data — one per camera — rather than declared in the template. */
const openCameras = ref<string[]>([])
function toggleCamera(id: string): void {
  openCameras.value = openCameras.value.includes(id)
    ? openCameras.value.filter(x => x !== id)
    : [...openCameras.value, id]
}
const cameraWidgets = computed(() => CAMERAS
  .map((camera, index) => ({ ...camera, corner: CORNERS[index % CORNERS.length]! }))
  .filter(camera => openCameras.value.includes(camera.id)))

watch(host, (element) => {
  map?.remove()
  map = null
  if (!element) return

  map = L.map(element, { center: [51.505, -0.09], zoom: 13, zoomControl: false, attributionControl: false })
  L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map)

  groups.set('markers', L.layerGroup(CAMERAS.map(camera => {
    const marker = L.circleMarker(camera.at, {
      radius: 7, color: camera.colour, fillColor: camera.colour, weight: 2, fillOpacity: 0.7,
    }).bindTooltip(`📷 ${camera.name}`, { direction: 'top' })
    marker.on('click', () => toggleCamera(camera.id))
    return marker
  })).addTo(map))

  // `interactive: false` because this is decoration: it is added after the markers, so it
  // paints — and hit-tests — above them in Leaflet's shared overlay pane, and it covers the
  // whole cluster. Without this, not one camera marker could be clicked, while the legend
  // invited exactly that. Found by the M14 browser gate trying to click one.
  groups.set('polygons', L.layerGroup([L.polygon(
    [[[51.52, -0.14], [51.52, -0.06], [51.49, -0.06], [51.49, -0.14]]],
    { color: '#f59e0b', weight: 1.4, fillOpacity: 0.06, interactive: false },
  )]).addTo(map))

  groups.set('polylines', L.layerGroup([L.polyline(
    [[51.487, -0.23], [51.49, -0.17], [51.505, -0.12], [51.508, -0.06], [51.50, 0.0]],
    { color: '#22d3ee', weight: 2.5 },
  )]))

  const report = () => {
    const centre = map!.getCenter()
    readout.value = `${centre.lat.toFixed(4)}, ${centre.lng.toFixed(4)} · z${map!.getZoom()}`
  }
  map.on('moveend zoomend', report)
  report()
}, { immediate: true })

// `size` is a ref, so Leaflet is told about a new box by watching it.
watch(panel.size, (size) => { if (size && map) map.invalidateSize() })

ws.subscribe('layer-visibility', ({ layerId, visible }: { layerId: string; visible: boolean }) => {
  const group = groups.get(layerId)
  if (!group || !map) return
  if (visible) group.addTo(map)
  else map.removeLayer(group)
})

onBeforeUnmount(() => { map?.remove(); map = null })

const zoom = (by: number) => map?.setZoom((map.getZoom() ?? 13) + by)
const recentre = () => map?.setView([51.505, -0.09], 13)
</script>

<template>
  <VddPanelOverlay>
    <!-- A toolbar on the panel's own edge. Docked widgets keep clear of it, and cannot be
         resized over it. -->
    <VddPanelToolbar position="top" variant="frosted" button-variant="ghost">
      <VddToolbarButton title="Zoom in" @click="zoom(1)"><span>＋</span></VddToolbarButton>
      <VddToolbarButton title="Zoom out" @click="zoom(-1)"><span>－</span></VddToolbarButton>
      <VddToolbarSeparator />
      <VddToolbarButton title="Recentre" @click="recentre"><span>◎</span></VddToolbarButton>
      <VddToolbarToggle v-model:active="grid" title="Graticule"><span>#</span></VddToolbarToggle>
      <VddToolbarSpacer />
      <span style="font: 0.68rem ui-monospace, monospace; opacity: 0.7; padding-inline-end: 0.4rem">
        {{ readout }}
      </span>
    </VddPanelToolbar>

    <div ref="host" class="dd-leaflet" data-demo-mainmap />

    <!-- A corner-docked widget. Drag its header to tear it off, drop it on another corner. -->
    <VddFloatingWidget
      widget-id="legend"
      title="Legend"
      v-model:placement="legend"
      :width="200"
      :height="150"
    >
      <div class="dd-panel" style="padding: 0.5rem 0.6rem">
        <div v-for="camera in CAMERAS" :key="camera.id" class="dd-row" style="font-size: 0.72rem">
          <span class="dd-swatch" :style="{ background: camera.colour }" />
          {{ camera.name }}
        </div>
        <p class="dd-note">Click a marker to open its feed.</p>
      </div>
    </VddFloatingWidget>

    <!-- A full-width strip: `stretch: 'width'` pins both inline ends and carries no width, so
         it tracks the panel with no JavaScript at all. -->
    <VddFloatingWidget
      widget-id="status"
      title="Status"
      v-model:placement="status"
      :width="260"
      :height="64"
    >
      <div class="dd-row" style="padding: 0.3rem 0.6rem; font: 0.7rem ui-monospace, monospace; gap: 1rem">
        <span>{{ openCameras.length }}/{{ CAMERAS.length }} feeds</span>
        <span>graticule {{ grid ? 'on' : 'off' }}</span>
        <span style="opacity: 0.55">this strip spans the panel — two pins, no width</span>
      </div>
    </VddFloatingWidget>

    <!--
      Widgets from data: one per open camera, each seeded to a different corner and then free to
      be dragged anywhere. Opened through `useFloatingWidgets()`, which has to be called from
      inside the overlay — hence the child component.
    -->
    <CameraWidgets :cameras="cameraWidgets" @close="toggleCamera" />
  </VddPanelOverlay>
</template>
