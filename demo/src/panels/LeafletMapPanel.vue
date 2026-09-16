<script setup lang="ts">
/**
 * Leaflet in a dockable panel.
 *
 * The reason this matters: a map instance is bound to a DOM element, and most layout engines
 * re-create a panel's DOM when it moves. Leaflet survives here because the element is moved
 * intact — the map keeps its centre, its zoom, its layers and its tile cache through docking,
 * floating and minimising. All it needs is `invalidateSize()` when its box changes, which
 * `usePanel().size` reports as a ref.
 *
 * Its live thumbnail is disabled in the registry (`disableLivePreview`), because scaling a
 * tiled map into a 160px preview is wasted work — the taskbar shows its initial instead.
 */
import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { usePanel, useWorkspace } from 'vue-dockable-desktop'

const host = useTemplateRef<HTMLDivElement>('host')
const ws = useWorkspace()
const panel = usePanel()
const readout = ref('')

let map: L.Map | null = null
const layers = new Map<string, L.Layer>()

const LANDMARKS: [number, number, string][] = [
  [51.5007, -0.1246, 'Big Ben'],
  [51.5081, -0.0759, 'Tower of London'],
  [51.5033, -0.1196, 'London Eye'],
  [51.5194, -0.1270, 'British Museum'],
]

watch(host, (element) => {
  map?.remove()
  map = null
  if (!element) return

  map = L.map(element, { center: [51.505, -0.09], zoom: 12, zoomControl: true, attributionControl: false })
  // OpenStreetMap's standard tiles: no API key. The dark look is a CSS filter (demo.css).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

  layers.set('markers', L.layerGroup(
    LANDMARKS.map(([lat, lng, name]) => L.circleMarker([lat, lng], {
      radius: 5, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.85, weight: 1,
    }).bindTooltip(name)),
  ).addTo(map))

  layers.set('polygons', L.polygon([
    [[51.52, -0.14], [51.52, -0.08], [51.49, -0.08], [51.49, -0.14]],
  ], { color: '#f59e0b', weight: 1.5, fillOpacity: 0.08 }).addTo(map))

  // Off by default, matching what the layer panel publishes on mount.
  layers.set('polylines', L.polyline([
    [51.487, -0.23], [51.49, -0.17], [51.505, -0.12], [51.508, -0.06], [51.50, 0.0],
  ], { color: '#22d3ee', weight: 2.5 }))

  const report = () => {
    const c = map!.getCenter()
    readout.value = `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)} · z${map!.getZoom()}`
  }
  map.on('moveend zoomend', report)
  report()
}, { immediate: true })

/**
 * `usePanel().size` is a ref, so this is a watcher rather than a subscription.
 *
 * rdd needed `onResize()` plus `getDimensions()` plus a `usePanelSize()` hook wrapping both;
 * here the size is state and Leaflet is told when it changes.
 */
watch(panel.size, (size) => { if (size && map) map.invalidateSize() })

// The layer panel publishes; this subscribes. Neither knows about the other, and the
// subscription is disposed with the component because `useWorkspace()` wraps it.
ws.subscribe('layer-visibility', ({ layerId, visible }: { layerId: string; visible: boolean }) => {
  const layer = layers.get(layerId)
  if (!layer || !map) return
  if (visible) layer.addTo(map)
  else map.removeLayer(layer)
})

onBeforeUnmount(() => { map?.remove(); map = null })
</script>

<template>
  <div class="dd-panel dd-panel--flush" style="position: relative">
    <div ref="host" class="dd-leaflet" data-demo-leaflet />
    <div
      style="position: absolute; inset-block-end: 6px; inset-inline-start: 6px; z-index: 500;
             padding: 0.15rem 0.45rem; border-radius: 4px; background: rgba(0,0,0,0.55);
             font: 0.68rem ui-monospace, monospace; color: #cfe3f5; pointer-events: none"
    >
      {{ readout }}
    </div>
  </div>
</template>
