<script setup lang="ts">
/**
 * The cameras as a table: a managed widget that can leave the map (1.13.0, rdd 7.11.0's "Cameras
 * table"). Docked below the map, as a tab, or floating, it is still this one component: the
 * selected row survives every move, and a click still pans the map that owns it.
 */
import { ref } from 'vue'
import { useWidget } from 'vue-dockable-desktop'

export interface TableCamera {
  id: string
  name: string
  colour: string
  at: [number, number]
}

const props = defineProps<{ cameras: TableCamera[]; onPick: (at: [number, number]) => void }>()

const widget = useWidget()
const selected = ref<string | null>(null)

function pick(camera: TableCamera): void {
  selected.value = camera.id
  props.onPick(camera.at)
}
</script>

<template>
  <div style="padding: 0.4rem; font-size: 0.72rem">
    <div style="opacity: 0.6; margin-bottom: 0.25rem">Shown: {{ widget?.location.value ?? '—' }}</div>
    <table style="width: 100%; border-collapse: collapse">
      <tbody>
        <tr
          v-for="camera in props.cameras"
          :key="camera.id"
          :style="{ cursor: 'pointer', background: selected === camera.id ? 'rgba(56,189,248,0.18)' : undefined }"
          @click="pick(camera)"
        >
          <td style="padding: 0.2rem 0.4rem">
            <span :style="{ color: camera.colour }">●</span> {{ camera.name }}
          </td>
          <td style="padding: 0.2rem 0.4rem; opacity: 0.6; text-align: end; font-family: ui-monospace, monospace">
            {{ camera.at[0].toFixed(3) }}, {{ camera.at[1].toFixed(3) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
