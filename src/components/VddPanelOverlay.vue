<script setup lang="ts">
/**
 * The root of one panel's overlay: toolbars on its edges, floating widgets over its content.
 *
 * Wrap a panel's content in this to enable `<VddPanelToolbar>`, `<VddFloatingWidget>` and
 * `useFloatingWidgets()`. It is scoped to the panel, so each panel has its own toolbars,
 * its own widget stacks and its own z-order — nothing here is global.
 */
import { computed, provide, useTemplateRef, watchEffect } from 'vue'
import { ANCHORS } from '../core/panelOverlay'
import { createPanelOverlayStore, PANEL_OVERLAY_KEY } from '../core/overlayState'
import VddFloatingWidget from './VddFloatingWidget.vue'

const store = createPanelOverlayStore()
provide(PANEL_OVERLAY_KEY, store)

const root = useTemplateRef<HTMLDivElement>('root')
watchEffect(() => { store.container.value = root.value })

/** Widgets opened through `useFloatingWidgets()`, rather than placed in a template. */
const managed = computed(() =>
  store.managedIds().map(id => ({ id, widget: store.managed.get(id)! })))

/** Drop zones are only shown while something is being dragged. */
const dragging = computed(() => store.draggingId.value !== null)
</script>

<template>
  <div
    ref="root"
    class="vdd-panel-overlay-root"
    :class="{ 'vdd-dragging-active': dragging }"
    data-vdd-panel-overlay
  >
    <slot />

    <template v-if="dragging">
      <div
        v-for="zone in ANCHORS"
        :key="zone"
        class="vdd-panel-float-dropzone"
        :class="[
          `vdd-panel-float-dropzone--${zone}`,
          { 'vdd-panel-float-dropzone--hovered': store.hovered.value === zone },
        ]"
        :data-vdd-dropzone="zone"
        aria-hidden="true"
      />
    </template>

    <VddFloatingWidget
      v-for="{ id, widget } in managed"
      :key="id"
      :widget-id="id"
      :title="widget.title"
      :icon="widget.icon"
      :open="true"
      :placement="{ anchor: widget.anchor ?? 'top-right', stretch: widget.stretch ?? null }"
      :width="widget.width ?? 320"
      :height="widget.height ?? 240"
      @update:open="(value: boolean) => { if (!value) store.closeManaged(id) }"
    >
      <component :is="widget.component" v-bind="widget.props" />
    </VddFloatingWidget>
  </div>
</template>
