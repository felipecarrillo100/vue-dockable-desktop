<script setup lang="ts">
/**
 * The icon slot left of a dialog's message (1.8.0). `icon` undefined draws the built-in icon —
 * a question mark for a confirmation, the type's icon for an alert — `null` draws nothing, and a
 * component is drawn in its place. Coloured by `vdd-dialog-icon-${type}`; the glyphs use
 * currentColor, on the same grid as the toast icons.
 */
import type { Component } from 'vue'
import type { AlertType } from '../types'

defineProps<{ icon: Component | null | undefined; type: AlertType; question?: boolean }>()
</script>

<template>
  <div
    v-if="icon !== null"
    class="vdd-dialog-icon"
    :class="`vdd-dialog-icon-${type}`"
    :data-vdd-dialog-icon="icon === undefined ? 'default' : 'custom'"
  >
    <component :is="icon" v-if="icon" />
    <svg v-else viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <template v-if="question">
        <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" />
        <path
          d="M6.25 6.25a1.75 1.75 0 1 1 2.6 1.53c-.5.28-.85.7-.85 1.27v.2M8 11.25v.01"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        />
      </template>
      <template v-else-if="type === 'warning'">
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
          v-else-if="type === 'danger'"
          d="M5.5 5.5l5 5M10.5 5.5l-5 5"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
        />
        <path v-else d="M8 5v.01M8 7.5v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </template>
    </svg>
  </div>
</template>
