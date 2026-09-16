<script setup lang="ts">
/**
 * A two-state icon button for a `<VddPanelToolbar>`.
 *
 * rdd took `active` plus `onToggle` and left flipping it to the caller. `v-model:active` is
 * the same thing without the boilerplate, and still controllable: bind it and you own it.
 */
defineProps<{
  title?: string
  disabled?: boolean
  variant?: 'ghost' | 'soft' | 'outlined' | 'filled'
}>()

const active = defineModel<boolean>('active', { default: false })
</script>

<template>
  <button
    type="button"
    class="vdd-panel-toolbar-btn"
    :class="{ 'vdd-panel-toolbar-btn--active': active }"
    :title="title"
    :aria-label="title"
    :aria-pressed="active"
    :disabled="disabled"
    :data-variant="variant"
    @click="active = !active"
  ><slot /></button>
</template>
