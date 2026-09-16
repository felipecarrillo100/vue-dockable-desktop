<script setup lang="ts">
/**
 * Provides one tab's context to its content.
 *
 * A component of its own because `provide` is per component instance: the drawer renders
 * every mounted pane inside a single instance, so it cannot provide a different tab id to
 * each of them.
 */
import { provide } from 'vue'
import { SIDEBAR_TAB_KEY } from '../core/sidebarTypes'

const props = defineProps<{ tabId: string }>()
const emit = defineEmits<{ close: []; open: [id: string] }>()

provide(SIDEBAR_TAB_KEY, {
  tabId: props.tabId,
  open: () => emit('open', props.tabId),
  close: () => emit('close'),
  openTab: (id: string) => emit('open', id),
})
</script>

<template>
  <div><slot /></div>
</template>
