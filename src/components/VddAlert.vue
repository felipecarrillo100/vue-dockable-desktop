<script setup lang="ts">
/**
 * A message with a single OK button, meant to be opened as a modal (1.8.0) — telling rather than
 * asking. `useModals().alert()` opens it and returns a promise.
 *
 * `onSettled` fires exactly once however it goes away: OK, Enter, Escape, the backdrop or the ×.
 * Escape, the backdrop and the × only dismiss it while the modal is closable.
 */
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import type { Component } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import { usePanel } from '../composables/usePanel'
import type { AlertType, Label } from '../types'
import VddDialogIcon from './VddDialogIcon.vue'

const props = withDefaults(defineProps<{
  message: Label
  /** Picks the built-in icon and its colour. */
  alertType?: AlertType
  /** Omit it for the built-in icon of `alertType`, pass `null` for none, or pass a component. */
  icon?: Component | null
  /** The button label. Defaults to the `ok` message. */
  okLabel?: Label
  /** Called exactly once, whichever way the dialog closes. */
  onSettled?: () => void
}>(), { alertType: 'info', icon: undefined, okLabel: undefined, onSettled: undefined })

const ws = useWorkspace()
const panel = usePanel()
const okButton = useTemplateRef<HTMLButtonElement>('okButton')

let settled = false
/** Runs on every exit path, including an unmount the dialog did not initiate. */
function settle(): void {
  if (settled) return
  settled = true
  props.onSettled?.()
}

function acknowledge(): void {
  settle()
  void panel.close({ force: true })
}

onMounted(() => {
  panel.setIcon(undefined)
  okButton.value?.focus({ preventScroll: true })
})
// Escape, the backdrop and the × all unmount us without going through acknowledge().
onBeforeUnmount(() => settle())
</script>

<template>
  <form class="vdd-confirmation-form-body" @submit.prevent="acknowledge">
    <div class="vdd-dialog-content">
      <VddDialogIcon :icon="icon" :type="alertType" />
      <div class="vdd-confirmation-message">{{ ws.format(message) }}</div>
    </div>

    <div class="vdd-confirmation-actions">
      <button ref="okButton" type="submit" class="vdd-btn vdd-btn-sm vdd-btn-primary" data-vdd-alert-ok>
        {{ ws.format(okLabel ?? ws.messages.ok) }}
      </button>
    </div>
  </form>
</template>
