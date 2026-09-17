<script setup lang="ts">
/**
 * One floating widget per open camera, opened through `useFloatingWidgets()`.
 *
 * A component of its own rather than part of `MainMapPanel`, because the composable needs the
 * overlay's injection and the panel is the component that *renders* the overlay — so the
 * panel's own `setup` sits outside it. Every application that opens widgets from data hits
 * this, which is why the manual shows the same shape.
 *
 * This is the `open()`-from-data path; the legend and status widgets beside it are declarative,
 * so the demo exercises both — and the browser gate can drive a gesture through the path that
 * regressed in 1.0.0.
 *
 * The widget's own × closes it in the overlay, not here, so `openIds` is watched and the
 * removal reported back to the panel that owns the camera list.
 */
import { watch } from 'vue'
import { useFloatingWidgets } from 'vue-dockable-desktop'
import type { FloatAnchor } from 'vue-dockable-desktop'
import CameraFeed from './CameraFeed.vue'

/** A camera that should have a widget open, with the corner it starts in. */
export interface OpenCamera {
  id: string
  name: string
  colour: string
  corner: FloatAnchor
}

const props = defineProps<{ cameras: OpenCamera[] }>()
const emit = defineEmits<{ close: [id: string] }>()

const widgets = useFloatingWidgets()

// Open what is missing, close what is gone. `anchor` is only a seed, so a camera that is
// already open is left exactly where the user dragged it.
watch(() => props.cameras, (cameras) => {
  const wanted = new Set(cameras.map(c => c.id))
  for (const id of widgets.openIds.value) if (!wanted.has(id)) widgets.close(id)
  for (const camera of cameras) {
    if (widgets.isOpen(camera.id)) continue
    widgets.open(camera.id, {
      title: camera.name,
      component: CameraFeed,
      props: { name: camera.name, colour: camera.colour },
      anchor: camera.corner,
      width: 260,
      height: 190,
    })
  }
}, { immediate: true, deep: true })

// A × on the widget itself removes it from the overlay; tell the panel so its marker follows.
watch(widgets.openIds, (ids) => {
  const live = new Set(ids)
  for (const camera of props.cameras) if (!live.has(camera.id)) emit('close', camera.id)
})
</script>

<template>
  <!-- Nothing of its own: the widgets are rendered by the overlay. -->
  <span hidden />
</template>
