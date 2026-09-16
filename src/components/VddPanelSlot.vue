<script setup lang="ts">
/**
 * A place a panel is shown.
 *
 * Renders an empty box and moves the panel's element into it. The panel's own DOM is never a
 * child of this component in Vue's eyes — the persistence port owns it — so this component
 * can mount, unmount and re-render freely without touching panel state.
 *
 * The move happens in a **function ref**, which Vue calls during the patch itself, with the
 * element (and with `null` when it goes away). A watcher would work too but lands a tick
 * later, leaving the panel briefly parked in the off-screen store; a function ref places it
 * as the slot appears. The move is also made here rather than reported upwards, because this
 * is the first moment the host element exists at all.
 */
import { onBeforeUnmount } from 'vue'
import { usePanelDom } from '../composables/usePanelDom'
import { useWorkspace } from '../composables/useWorkspace'

const props = defineProps<{
  /** The panel to show here. */
  panelId: string
  /** Extra class for the host box. */
  hostClass?: string
}>()

const dom = usePanelDom()
const ws = useWorkspace()
let host: HTMLElement | null = null

function setHost(el: unknown): void {
  const element = (el as HTMLElement | null) ?? null
  host = element
  if (!dom || !element) return
  dom.moveTo(props.panelId, element, {
    refocus: ws.state.activePanelId === props.panelId,
    preserveScroll: ws.registry.get(ws.state.panels[props.panelId]?.component ?? '')
      ?.defaultOptions?.preserveScroll !== false,
  })
}

onBeforeUnmount(() => {
  // Park the panel off-screen — unless another slot has already claimed it, which is what
  // happens when a panel moves from one leaf to another.
  if (dom && dom.hostOf(props.panelId) === host) dom.moveTo(props.panelId, null)
})
</script>

<template>
  <div :ref="setHost" class="vdd-panel-slot" :class="hostClass" :data-vdd-slot="panelId" />
</template>
