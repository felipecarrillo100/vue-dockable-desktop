<script setup lang="ts">
/**
 * The root of one panel's overlay: toolbars on its edges, floating widgets over its content.
 *
 * Wrap a panel's content in this to enable `<VddPanelToolbar>`, `<VddFloatingWidget>` and
 * `useFloatingWidgets()`. It is scoped to the panel, so each panel has its own toolbars,
 * its own widget stacks and its own z-order — nothing here is global.
 */
import { computed, inject, onUnmounted, provide, useTemplateRef, watchEffect } from 'vue'
import { ANCHORS } from '../core/panelOverlay'
import { createPanelOverlayStore, PANEL_OVERLAY_KEY } from '../core/overlayState'
import type { PanelFloatPlacement } from '../core/stretch'
import VddFloatingWidget from './VddFloatingWidget.vue'
import VddWidgetScope from './VddWidgetScope.vue'
import { useWidgetHosting } from '../composables/useWidgetHosting'
import { WORKSPACE_KEY } from '../core/workspace'

const ws = inject(WORKSPACE_KEY, null)
const store = createPanelOverlayStore({ rtl: () => ws?.state.isRtl ?? false })
provide(PANEL_OVERLAY_KEY, store)
/** Moving the managed widgets out of this panel and back (7.11). */
const hosting = useWidgetHosting(store)
store.hosting = hosting

const root = useTemplateRef<HTMLDivElement>('root')
watchEffect(() => { store.container.value = root.value })

/**
 * Restored free positions wait for the panel to have a size (7.11): a panel in a background tab,
 * or not laid out yet, measures 0×0. Observed only while one waits.
 */
watchEffect((onCleanup) => {
  const el = root.value
  if (!el || store.pendingCount.value === 0) return
  store.applyPending()
  if (typeof ResizeObserver === 'undefined') return
  const ro = new ResizeObserver(() => store.applyPending())
  ro.observe(el)
  onCleanup(() => ro.disconnect())
})

/** Widgets opened through `useFloatingWidgets()`, rather than placed in a template. */
const managed = computed(() => store.managedIds().map(id => ({
  id,
  widget: store.managed.get(id)!,
  // Present for every open id: `openManaged` seeds it before this can run.
  placement: store.managedPlacements[id]!,
  // Likewise: `openManaged` creates it, in the hidden store, before the list changes.
  el: store.content.get(id)!,
})))

// The teleports have unmounted their content by now; drop the elements and their store.
onUnmounted(() => store.content.dispose())

/**
 * A managed widget's `titleMenu`, from its title icon in the panel (7.11). A click from the
 * keyboard (Enter or Space: `detail` 0) opens on the first item, below the button rather than at
 * the event's 0,0.
 */
function openTitleMenu(id: string, event: MouseEvent): void {
  const items = hosting.menuItems(id)
  if (!ws || items.length === 0) return
  if (event.detail === 0 && event.currentTarget instanceof HTMLElement) {
    const r = event.currentTarget.getBoundingClientRect()
    ws.showContextMenu({ x: r.left, y: r.bottom, items, initialFocus: 'first-item' })
  } else {
    ws.showContextMenu({ event, items })
  }
}

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

      Since 7.11 (rdd) the record is the whole placement, docked or free, position and size, and
      the content is not the frame's child: it is teleported, once for the widget's whole life,
      into the widget's own element (`div.vdd-panel-float__content`), which the frame's body only
      shows. So the frame can unmount and mount again with the content's state, and its DOM,
      untouched, and come back where it was. Teleport keeps the logical parent, so `usePanel()`
      and every other injection inside the content still resolve to this panel. Out of the panel
      the frame is not rendered at all: a hosted panel's slot shows the element instead, and the
      placement record above is kept, so `move({ to: 'panel' })` brings it back where it was.
    -->
    <template
      v-for="{ id, widget, placement, el } in managed"
      :key="id"
    >
      <Teleport :to="el">
        <!-- useWidget() for the content, and its onMoved (7.11). -->
        <VddWidgetScope
          :widget-id="id"
          :hosting="hosting"
        >
          <component
            :is="widget.component"
            v-bind="widget.props"
          />
        </VddWidgetScope>
      </Teleport>
      <!-- Out of the panel, a hosted panel shows the content and there is no frame. -->
      <VddFloatingWidget
        v-if="!(id in hosting.hostedIds)"
        :widget-id="id"
        :title="widget.title"
        :icon="widget.icon"
        :open="true"
        :placement="placement"
        :width="widget.width ?? 320"
        :height="widget.height ?? 240"
        :content-el="el"
        :title-menu="widget.titleMenu && ws ? (e: MouseEvent) => openTitleMenu(id, e) : undefined"
        @update:open="(value: boolean) => { if (!value) store.closeManaged(id) }"
        @update:placement="(next: PanelFloatPlacement) => store.setManagedPlacement(id, next)"
      />
    </template>
  </div>
</template>
