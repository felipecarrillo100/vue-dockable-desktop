<script setup lang="ts">
/**
 * `?rc=1` (the M18 gate, 1.14.0): the app's `popoutWrapper` for the runtime CSS-in-JS stand-in
 * (runtimeCss.ts): hands its cache the document of what it is around, as an app's CacheProvider would.
 */
import { computed, provide } from 'vue'
import { STYLE_DOCUMENT } from './runtimeCss'

// `PopoutWrapperProps`, spelled out: the SFC compiler needs props' types it can resolve here.
const props = defineProps<{ window: Window; document: Document }>()
provide(STYLE_DOCUMENT, computed(() => props.document))
</script>

<template>
  <slot />
</template>
