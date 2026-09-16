<script setup lang="ts">
/** An icon button for a `<VddPanelToolbar>`. The icon is a slot, so anything renders. */
defineProps<{
  /** Tooltip and accessible name. */
  title?: string
  disabled?: boolean
  /** Overrides the toolbar's own `buttonVariant`. */
  variant?: 'ghost' | 'soft' | 'outlined' | 'filled'
}>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="vdd-panel-toolbar-btn"
    :title="title"
    :aria-label="title"
    :disabled="disabled"
    :data-variant="variant"
    @click="emit('click')"
  ><slot /></button>
</template>
