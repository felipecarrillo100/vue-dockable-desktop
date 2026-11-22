<script setup lang="ts">
/**
 * One panel, mounted once for its whole life.
 *
 * Teleports the panel's component into that panel's cache element and tells it who it is.
 * The teleport target never changes and never disappears, so no layout change can unmount
 * the panel — the structural guarantee behind
 * docs/decisions/0002-zero-unmount-via-teleport.md.
 */
import { computed, ref, watch } from 'vue'
import type { Component } from 'vue'
import { findLeaf, findLeafForPanel } from '../core/layoutTree'
import type { PanelDomCache } from '../core/panelDom'
import { providePanel } from '../composables/usePanel'
import { useWorkspace } from '../composables/useWorkspace'
import type { ContainerType } from '../types'
import { optionsFor } from '../core/panelOptions'
import VddWidgetContentSlot from './VddWidgetContentSlot.vue'
import { resizeObserverFor } from '../core/domContext'
import { usePopOutWindows } from '../composables/usePopOutWindows'
import { providePanelWindow, usePanelWindowOf } from '../composables/usePanelWindow'
import VddPopoutWrap from './popoutWrap'

const props = defineProps<{
  panelId: string
  cache: PanelDomCache
  /**
   * The app's `popoutWrapper` (1.14.0), around this panel's content for its whole life while the
   * workspace has pop-outs (the desktop passes none otherwise), so the tree never changes shape: a
   * new parent would remount it.
   */
  wrapper?: Component | null
}>()

const ws = useWorkspace()
const info = computed(() => ws.state.panels[props.panelId])
const entry = computed(() => (info.value ? ws.registry.get(info.value.component) : undefined))
/** Its options: its kind's, or a hosted panel's own. */
const options = computed(() => optionsFor(ws.registry, info.value))
/**
 * A hosted panel (7.11) shows a managed widget's content element, rendered by the widget's
 * overlay in its owner panel; nothing is mounted here, and there is no registration to look up.
 * Read through the cache's reactive registry, so a new element under the same id is followed.
 */
const isHosted = computed(() => !!info.value?.owner)
const hosted = computed(() => (isHosted.value ? props.cache.hostedContent(props.panelId) : undefined))

/**
 * Which kind of container this panel is in.
 *
 * A minimised panel reports what it *was*, not `'dockable-panel'`: minimising does not move
 * a panel between containers, it only takes it off screen — the panel is still mounted and
 * still running, and restoring puts it back where it came from. Reporting the docked type
 * while minimised made one minimise/restore cycle of a floating window look like two
 * container changes to anything watching, which is exactly the false signal rdd's
 * `onContainerTypeChange` promised not to send.
 */
const containerType = computed<ContainerType>(() => {
  const panel = info.value
  if (!panel) return 'dockable-panel'
  const effective = panel.state === 'minimized' ? panel.previousState ?? 'docked' : panel.state
  return effective === 'floating' ? 'floating-window' : 'dockable-panel'
})

/** Reported by the slot that currently shows this panel; `null` until it has been laid out. */
const size = ref<{ width: number; height: number } | null>(null)

providePanel({
  id: props.panelId,
  containerType,
  size,
})

const target = computed(() => props.cache.elementFor(props.panelId))

/**
 * The window this panel is in (1.14.0), for `usePanelWindow()` and the wrapper: from the registry's
 * entries, the store the pop-out's frame renders from, so it switches in the render that shows the
 * panel's slot in the pop-out.
 */
const panelWindow = usePanelWindowOf(props.panelId)
providePanelWindow(panelWindow)

/**
 * `keepAlive: false` (1.9.0): the component is mounted only while the panel is on screen,
 * floating or the selected tab of its group. Everything above it (this host, its context, its
 * cache element) stays, so the panel's tab, title and lifecycle carry on.
 * @see docs/decisions/0021-opt-in-unmount-while-hidden.md
 */
const shown = computed(() => {
  if (options.value?.keepAlive !== false) return true
  const panel = info.value
  if (!panel || panel.state === 'minimized') return false
  if (panel.state === 'floating') return true
  // Read through the reactive state (not toRaw), so this re-evaluates when the grid changes.
  const leafId = findLeafForPanel(ws.state.gridRoot, props.panelId)
  return leafId !== null && findLeaf(ws.state.gridRoot, leafId)?.activePanelId === props.panelId
})

/**
 * The pop-out window this panel is shown in (1.14.0), or null: its element changes windows, and
 * an observer only works from the element's own window's constructor.
 */
const popOuts = usePopOutWindows()
const windowKey = computed(() => popOuts?.entries.value.find(e => e.id === props.panelId && e.doc)?.key ?? null)

// Track the rendered size so `usePanel().size` is live without the panel asking for it.
// Rebuilt when the element moves into a pop-out window or back: after the render that moves it.
let observer: ResizeObserver | null = null
watch([target, windowKey], ([el], _, onCleanup) => {
  // From the element's own window (1.14.0).
  const ro = resizeObserverFor(el, (entries) => {
    for (const e of entries) {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) {
        size.value = { width, height }
        // Remembered beyond this host's lifetime: the taskbar preview scales a thumbnail from
        // the size the panel had while it was still on screen.
        props.cache.reportSize(props.panelId, { width, height })
      }
    }
  })
  if (!ro) return
  observer = ro
  observer.observe(el)
  onCleanup(() => { observer?.disconnect(); observer = null })
}, { immediate: true, flush: 'post' })
</script>

<template>
  <Teleport :to="target">
    <!-- The app's component from the desktop, stable across renders: not one made here. -->
    <VddPopoutWrap :wrapper="wrapper ?? null" :win="panelWindow.window" :doc="panelWindow.document">
      <div :class="['vdd-panel-content', options?.className]" :dir="ws.state.dir">
        <VddWidgetContentSlot
          v-if="hosted"
          class="vdd-hosted-widget"
          :el="hosted.el"
          :cache="hosted.cache"
        />
        <component
          v-else-if="entry && shown"
          :is="entry.component"
          v-bind="info?.props ?? {}"
          :panel-id="panelId"
        />
        <div v-else-if="!entry && !isHosted" class="vdd-unregistered-panel">
          <strong>Unregistered panel</strong>
          <span>No component is registered for key "{{ info?.component }}".</span>
        </div>
      </div>
    </VddPopoutWrap>
  </Teleport>
</template>
