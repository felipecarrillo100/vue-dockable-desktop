<script setup lang="ts">
/**
 * One panel, mounted once for its whole life.
 *
 * Teleports the panel's component into that panel's cache element and tells it who it is.
 * The teleport target never changes and never disappears, so no layout change can unmount
 * the panel — the structural guarantee behind
 * docs/decisions/0002-zero-unmount-via-teleport.md.
 */
import { computed, ref, watchEffect } from 'vue'
import type { PanelDomCache } from '../core/panelDom'
import { providePanel } from '../composables/usePanel'
import { useWorkspace } from '../composables/useWorkspace'
import type { ContainerType } from '../types'

const props = defineProps<{ panelId: string; cache: PanelDomCache }>()

const ws = useWorkspace()
const info = computed(() => ws.state.panels[props.panelId])
const entry = computed(() => (info.value ? ws.registry.get(info.value.component) : undefined))

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

// Track the rendered size so `usePanel().size` is live without the panel asking for it.
let observer: ResizeObserver | null = null
watchEffect((onCleanup) => {
  const el = target.value
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver((entries) => {
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
  observer.observe(el)
  onCleanup(() => { observer?.disconnect(); observer = null })
})
</script>

<template>
  <Teleport :to="target">
    <div class="vdd-panel-content" :dir="ws.state.dir">
      <component
        v-if="entry"
        :is="entry.component"
        v-bind="info?.props ?? {}"
        :panel-id="panelId"
      />
      <div v-else class="vdd-unregistered-panel">
        <strong>Unregistered panel</strong>
        <span>No component is registered for key "{{ info?.component }}".</span>
      </div>
    </div>
  </Teleport>
</template>
