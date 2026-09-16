<script setup lang="ts">
/** The built-in per-type icons. Replaced per toast by `toast(msg, { icon })`. */
import type { ToastType } from '../core/toast'

defineProps<{ type: ToastType }>()
</script>

<template>
  <svg class="vdd-toast__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <template v-if="type === 'warning'">
      <path d="M8 2.5L14 13.5H2L8 2.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M8 7v2.5M8 11.5v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>
    <template v-else>
      <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" />
      <path
        v-if="type === 'success'"
        d="M5 8l2 2 4-4"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      />
      <path
        v-else-if="type === 'error'"
        d="M5.5 5.5l5 5M10.5 5.5l-5 5"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
      />
      <path v-else d="M8 5v.01M8 7.5v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>
  </svg>
</template>
