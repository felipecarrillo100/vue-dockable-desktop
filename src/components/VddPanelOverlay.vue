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
import type { PanelFloatPlacement } from '../core/stretch'
import VddFloatingWidget from './VddFloatingWidget.vue'

const store = createPanelOverlayStore()
provide(PANEL_OVERLAY_KEY, store)

const root = useTemplateRef<HTMLDivElement>('root')
watchEffect(() => { store.container.value = root.value })

/** Widgets opened through `useFloatingWidgets()`, rather than placed in a template. */
const managed = computed(() => store.managedIds().map(id => ({
  id,
  widget: store.managed.get(id)!,
  // Present for every open id: `openManaged` seeds it before this can run.
  placement: store.managedPlacements[id]!,
})))

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

    <!--
      `placement` is bound to the store's own record and written straight back, because binding
      a `defineModel` at all makes the parent authoritative: Vue re-syncs the child's local
      value whenever the prop's *identity* changes. Binding a fresh `{ anchor, stretch }`
      literal here — which is what 1.0.0 did — therefore reset the widget on every render of
      this component, and this component re-renders on `draggingId`, `hovered` and
      `managedVersion`: a drop clears `draggingId` in the same function that applies the
      placement, so the gesture undid itself.

      The handler *replaces* the record rather than mutating it, so the emitted object becomes
      the prop and the re-sync sees nothing to change.
    -->
    <VddFloatingWidget
      v-for="{ id, widget, placement } in managed"
      :key="id"
      :widget-id="id"
      :title="widget.title"
      :icon="widget.icon"
      :open="true"
      :placement="placement"
      :width="widget.width ?? 320"
      :height="widget.height ?? 240"
      @update:open="(value: boolean) => { if (!value) store.closeManaged(id) }"
      @update:placement="(next: PanelFloatPlacement) => store.setManagedPlacement(id, next)"
    >
      <component :is="widget.component" v-bind="widget.props" />
    </VddFloatingWidget>
  </div>
</template>
