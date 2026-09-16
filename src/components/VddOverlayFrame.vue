<script setup lang="ts">
/**
 * The header-and-body chrome shared by a side panel and a modal.
 *
 * Both have an icon, a title carrying the dirty asterisk, a close button and a body whose
 * padding the caller may set. rdd wrote that markup twice, once per renderer, with only the
 * class prefix differing — and the two had already drifted apart in whether the close button
 * could be suppressed.
 *
 * The class names are picked from a literal map rather than built by interpolation: a
 * consumer searching devtools for `vdd-modal-header` must find it in the source, and the
 * css-prefix gate reads literals.
 */
import { computed } from 'vue'
import type { Component } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'

const props = defineProps<{
  block: 'side-panel' | 'modal'
  title: string
  icon: Component | null
  /** `false` hides the close button entirely — a modal opened with `closable: false`. */
  closable: boolean
  closeLabel: string
  /** Body padding, or `undefined` to leave it to the stylesheet. */
  bodyPadding?: string
}>()

const emit = defineEmits<{ close: [] }>()

const MODAL = {
  header: 'vdd-modal-header',
  icon: 'vdd-modal-icon',
  title: 'vdd-modal-title',
  closeButton: 'vdd-modal-close-button',
  body: 'vdd-modal-body',
} as const

const SIDE_PANEL = {
  header: 'vdd-side-panel-header',
  icon: 'vdd-side-panel-icon',
  title: 'vdd-side-panel-title',
  closeButton: 'vdd-side-panel-close-button',
  body: 'vdd-side-panel-body',
} as const

const c = computed(() => (props.block === 'modal' ? MODAL : SIDE_PANEL))

/** The consumer's own class for this body, from `createWorkspace({ classes })`. */
const ws = useWorkspace()
const hostBodyClass = computed(() =>
  props.block === 'modal' ? ws.classes.modalBody : ws.classes.sidePanelBody)
</script>

<template>
  <div :class="c.header">
    <div v-if="icon" :class="c.icon"><component :is="icon" /></div>
    <h4 :class="c.title">{{ title }}</h4>
    <button
      v-if="closable"
      type="button"
      :class="c.closeButton"
      :title="closeLabel"
      :aria-label="closeLabel"
      data-vdd-overlay-close
      @click="emit('close')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
  <div :class="[c.body, hostBodyClass]" :style="bodyPadding != null ? { padding: bodyPadding } : undefined">
    <slot />
  </div>
</template>
