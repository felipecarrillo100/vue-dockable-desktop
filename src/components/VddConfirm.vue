<script setup lang="ts">
/**
 * A confirm/cancel dialog, meant to be opened as a modal.
 *
 * Also what the library itself opens when a dirty panel is closed, which is why `onSettled`
 * exists: the caller needs to know the answer however the dialog went away — the buttons,
 * Escape, the backdrop, or the ×. Resolving only on the buttons would leave a
 * `requestClose()` awaiting forever if the user pressed Escape.
 */
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import { usePanel } from '../composables/usePanel'
import type { AlertType, Label } from '../types'

const props = withDefaults(defineProps<{
  message: Label
  /** An extra banner above the message — which fields are invalid, say. */
  alert?: string
  alertType?: AlertType
  /** Label the buttons "Yes"/"No" rather than "OK"/"Cancel". */
  yesNo?: boolean
  onOk?: () => void
  onCancel?: () => void
  /** Called exactly once, whichever way the dialog closes. `ok` says which. */
  onSettled?: (ok: boolean) => void
}>(), { alertType: 'info', yesNo: false })

const ws = useWorkspace()
const panel = usePanel()
const confirmButton = useTemplateRef<HTMLButtonElement>('confirmButton')

let settled = false
/** Runs on every exit path, including an unmount the dialog did not initiate. */
function settle(ok: boolean): void {
  if (settled) return
  settled = true
  props.onSettled?.(ok)
}

function confirm(): void {
  settle(true)
  props.onOk?.()
  void panel.close({ force: true })
}

function cancel(): void {
  settle(false)
  props.onCancel?.()
  void panel.close({ force: true })
}

onMounted(() => {
  panel.setIcon(undefined)
  // Focus the confirm button so Enter answers and a screen reader announces the choice.
  confirmButton.value?.focus({ preventScroll: true })
})
// Escape, the backdrop and the × all unmount us without going through cancel().
onBeforeUnmount(() => settle(false))
</script>

<template>
  <form class="vdd-confirmation-form-body" @submit.prevent="confirm">
    <div v-if="alert" class="vdd-confirmation-alert" :class="`vdd-confirmation-alert-${alertType}`">
      <span>{{ alert }}</span>
    </div>

    <div class="vdd-confirmation-message">{{ ws.format(message) }}</div>

    <div class="vdd-confirmation-actions">
      <button type="button" class="vdd-btn vdd-btn-sm vdd-btn-outline" data-vdd-confirm-cancel @click="cancel">
        {{ ws.format(yesNo ? ws.messages.no : ws.messages.cancel) }}
      </button>
      <button ref="confirmButton" type="submit" class="vdd-btn vdd-btn-sm vdd-btn-primary" data-vdd-confirm-ok>
        {{ ws.format(yesNo ? ws.messages.yes : ws.messages.ok) }}
      </button>
    </div>
  </form>
</template>
