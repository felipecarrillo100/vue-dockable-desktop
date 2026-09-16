<script setup lang="ts">
/**
 * A panel whose content is a full overlay: toolbars on all four edges, a corner widget, a
 * full-width strip, and a widget the gate can reposition.
 *
 * Exists for the browser gate, which needs real layout to measure what jsdom cannot — chiefly
 * whether every resize handle is actually hittable across its whole nominal area (D5).
 */
import { markRaw, reactive, ref } from 'vue'
import {
  VddPanelOverlay, VddPanelToolbar, VddToolbarButton, VddToolbarToggle,
  VddToolbarSeparator, VddToolbarSpacer, VddToolbarItem, VddToolbarCenter,
  VddToolbarSearch, VddFloatingWidget,
} from 'vue-dockable-desktop'
import type { PanelFloatPlacement } from 'vue-dockable-desktop'

const state = reactive({
  card: { anchor: 'top-left', stretch: null } as PanelFloatPlacement,
  strip: { anchor: 'bottom-left', stretch: 'width' } as PanelFloatPlacement,
  free: { anchor: 'bottom-right', stretch: null } as PanelFloatPlacement,
})
const toolbars = reactive({ top: true, bottom: true, left: true, right: true })
const grid = ref(false)
const Glyph = markRaw({ name: 'Glyph', template: '<svg width="12" height="12"><rect width="12" height="12" /></svg>' })

/** Every dropdown row class needs a result carrying a group, a description and an icon. */
const search = (query: string) => query
  ? [{ id: 'r1', label: `Result ${query}`, description: 'a matching feature', group: 'Layers', icon: Glyph }]
  : []


// The gate drives placement through this handle rather than by clicking, so what it measures
// is the rendered result of a placement rather than the gesture that produced it.
;(window as unknown as { __overlay: unknown }).__overlay = { state, toolbars, grid }
</script>

<template>
  <VddPanelOverlay>
    <VddPanelToolbar
      v-if="toolbars.top"
      position="top"
      variant="frosted"
    >
      <VddToolbarButton
        title="Save"
        @click="() => {}"
      >
        <span>S</span>
      </VddToolbarButton>
      <VddToolbarSeparator />
      <VddToolbarToggle
        v-model:active="grid"
        title="Grid"
      >
        <span>#</span>
      </VddToolbarToggle>
      <VddToolbarItem>
        <span class="chip">12 layers</span>
      </VddToolbarItem>
      <VddToolbarCenter>
        <span class="chip">centre</span>
      </VddToolbarCenter>
      <VddToolbarSpacer />
      <VddToolbarSearch :search="search" />
      <VddToolbarButton
        title="Help"
        @click="() => {}"
      >
        <span>?</span>
      </VddToolbarButton>
    </VddPanelToolbar>

    <VddPanelToolbar
      v-if="toolbars.bottom"
      position="bottom"
    >
      <VddToolbarButton
        title="Zoom"
        @click="() => {}"
      >
        <span>Z</span>
      </VddToolbarButton>
    </VddPanelToolbar>

    <VddPanelToolbar
      v-if="toolbars.left"
      position="left"
    >
      <VddToolbarButton
        title="Pan"
        @click="() => {}"
      >
        <span>P</span>
      </VddToolbarButton>
    </VddPanelToolbar>

    <VddPanelToolbar
      v-if="toolbars.right"
      position="right"
    >
      <VddToolbarButton
        title="Layers"
        @click="() => {}"
      >
        <span>L</span>
      </VddToolbarButton>
    </VddPanelToolbar>

    <div
      class="body"
      data-overlay-body
    >
      panel content
    </div>

    <VddFloatingWidget
      v-model:placement="state.card"
      widget-id="card"
      title="Card"
      :icon="Glyph"
      :width="260"
      :height="180"
    >
      <div data-widget-body="card">
        card
      </div>
    </VddFloatingWidget>

    <VddFloatingWidget
      v-model:placement="state.strip"
      widget-id="strip"
      title="Strip"
      :width="240"
      :height="70"
    >
      <div data-widget-body="strip">
        strip
      </div>
    </VddFloatingWidget>

    <VddFloatingWidget
      v-model:placement="state.free"
      widget-id="free"
      title="Free"
      :width="220"
      :height="150"
    >
      <div data-widget-body="free">
        free
      </div>
    </VddFloatingWidget>
  </VddPanelOverlay>
</template>

<style scoped>
.chip { font: 10px system-ui; color: #9ab; padding: 0 6px; }
.body { width: 100%; height: 100%; display: grid; place-items: center; font: 12px system-ui; color: #789; }
</style>
