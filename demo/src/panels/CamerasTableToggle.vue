<script setup lang="ts">
/**
 * The toolbar toggle that opens the cameras table (1.13.0). A component of its own for the same
 * reason as `CameraWidgets`: `useFloatingWidgets()` needs the overlay's injection, and the map
 * panel's own `setup` sits outside its overlay.
 *
 * The table can leave the map: its title menu docks it below the map, opens it as a tab or floats
 * it, and, out of the panel, brings it back.
 */
import { computed } from 'vue'
import { VddToolbarToggle, useFloatingWidgets } from 'vue-dockable-desktop'
import type { ManagedWidget } from 'vue-dockable-desktop'
import CamerasTable from './CamerasTable.vue'
import type { TableCamera } from './CamerasTable.vue'

const props = defineProps<{ cameras: TableCamera[]; onPick: (at: [number, number]) => void }>()

const ID = 'map-cameras'
const widgets = useFloatingWidgets()

const table = (): ManagedWidget => ({
  title: 'Cameras',
  component: CamerasTable,
  props: { cameras: props.cameras, onPick: props.onPick },
  anchor: 'bottom-left',
  width: 300,
  height: 170,
  canDock: true,
  canFloat: true,
  titleMenu: w => w.location === 'panel'
    ? [
        { label: 'Dock below the map', action: () => w.move({ to: 'docked', position: 'bottom', size: 0.3 }) },
        { label: 'Open as a tab', action: () => w.move({ to: 'tabbed' }) },
        { label: 'Float', action: () => w.move({ to: 'floating' }) },
      ]
    : [{ label: 'Back into the map', action: () => w.move({ to: 'panel' }) }],
})

const open = computed({
  get: () => widgets.isOpen(ID),
  set: (on: boolean) => { if (on) widgets.open(ID, table()); else widgets.close(ID) },
})
</script>

<template>
  <VddToolbarToggle v-model:active="open" title="Cameras table (can leave the map)">
    <span>▤</span>
  </VddToolbarToggle>
</template>
