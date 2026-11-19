<script setup lang="ts">
/**
 * An iframe that counts its loads, for the M11 gate (7.11, `preserveEmbeds`): a move that
 * re-inserts it reloads it, which fires `load` again. Counted by `name` in `window.__embedLoads`.
 * Used as a panel (the name comes from the panel's props) and as a managed widget's content.
 */
const props = defineProps<{ name: string }>()
const loads = ((window as unknown as { __embedLoads?: Record<string, number> }).__embedLoads ??= {})
const loaded = () => { loads[props.name] = (loads[props.name] ?? 0) + 1 }
</script>

<template>
  <iframe
    :data-embed="name"
    :srcdoc="`<p>${name}</p>`"
    style="width: 100%; height: 100%; border: 0"
    @load="loaded"
  />
</template>
