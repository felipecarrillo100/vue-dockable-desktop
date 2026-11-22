<script setup lang="ts">
/**
 * The pop-out windows' content (1.14.0, rdd's `PopOutWindows.tsx`): one frame per open window
 * whose page is ready. The windows themselves belong to the registry (`core/popOutWindows.ts`),
 * which `<VddDesktop>` creates and lends its panel cache; this only renders them.
 */
import { computed, watchEffect } from 'vue'
import type { Component } from 'vue'
import type { PopOutWindows } from '../core/popOutWindows'
import { setPopoutWrapper } from '../core/panelWindow'
import VddPopOutFrame from './VddPopOutFrame.vue'

const props = defineProps<{
  windows: PopOutWindows
  defaultIcon?: unknown
  /** The workspace element, whose scope each frame repeats. */
  scope?: Element | null
  /** The app's `popoutWrapper`, around each frame (and, by document, a menu and toasts shown there). */
  wrapper?: Component | null
}>()

const open = computed(() => props.windows.entries.value.filter(e => e.doc !== null))

// `<VddContextMenu>` and `<VddToasts>` are mounted beside the desktop, out of reach of its
// provide: they find the wrapper by the document they show in, recorded here while it is open.
watchEffect((onCleanup) => {
  const wrapper = props.wrapper
  if (!wrapper) return
  const undo = open.value.map(e => setPopoutWrapper(e.doc!, wrapper))
  onCleanup(() => undo.forEach(f => f()))
})
</script>

<template>
  <VddPopOutFrame
    v-for="e in open"
    :id="e.id"
    :key="e.key"
    :doc="e.doc!"
    :default-icon="defaultIcon"
    :scope="scope"
    :wrapper="wrapper ?? null"
    @return="windows.returnPanel(e.id)"
  />
</template>
