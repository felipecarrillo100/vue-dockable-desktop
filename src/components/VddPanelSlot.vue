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
import { optionsFor } from '../core/panelOptions'
import { moveIntoWhenConnected } from '../core/domMove'

const props = defineProps<{
  /** The panel to show here. */
  panelId: string
  /** Extra class for the host box. */
  hostClass?: string
}>()

const dom = usePanelDom()
const ws = useWorkspace()
let host: HTMLElement | null = null
/** A move waiting for this slot to be in the document (`preserveEmbeds`); cancelled on unmount. */
let pending: (() => void) | null = null

function setHost(el: unknown): void {
  const element = (el as HTMLElement | null) ?? null
  host = element
  if (!dom || !element) return
  const options = optionsFor(ws.registry, ws.state.panels[props.panelId])
  if (options?.preserveEmbeds === true) dom.preserveEmbeds(props.panelId)
  pending?.()
  // A function ref runs during the patch, before a new group's or window's subtree is inserted:
  // an element that keeps its embeds waits for this slot to be connected (rdd 7.11.0), so it can
  // move with moveBefore(). Any other moves at once, as before.
  pending = moveIntoWhenConnected(element, dom.elementFor(props.panelId), () => {
    pending = null
    dom.moveTo(props.panelId, element, {
      refocus: ws.state.activePanelId === props.panelId,
      preserveScroll: options?.preserveScroll !== false,
    })
  })
}

onBeforeUnmount(() => {
  pending?.()
  pending = null
  // Park the panel off-screen — unless another slot has already claimed it, which is what
  // happens when a panel moves from one leaf to another. `onBeforeUnmount` runs before Vue
  // removes this slot from the document, so a panel that keeps its embeds is still connected
  // and parks with moveBefore() (rdd parks in a layout cleanup for the same reason).
  if (dom && dom.hostOf(props.panelId) === host) dom.moveTo(props.panelId, null)
})
</script>

<template>
  <div :ref="setHost" class="vdd-panel-slot" :class="hostClass" :data-vdd-slot="panelId" />
</template>
