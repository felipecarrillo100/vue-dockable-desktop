<script setup lang="ts">
/**
 * Renders the modal stack, bottom to top.
 *
 * Place it once. Modals are `position: fixed` with their own stacking, so its position in
 * the tree is irrelevant — including relative to the workspace, which is the point: a modal
 * opened by a panel must not be clipped by that panel's box.
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import VddModalHost from './VddModalHost.vue'
import VddConfirm from './VddConfirm.vue'
import type { DiscardRequest } from '../core/overlays'

const ws = useWorkspace()
const { overlays } = ws

/**
 * The library's own unsaved-changes question, registered here because asking needs somewhere
 * to render — mount no `<VddModals>` and a dirty close refuses rather than discarding.
 *
 * Every close path in the library resolves through this one promise, so the answer cannot
 * differ between a tab, a window, a drawer and a modal.
 */
function confirmDiscard(request: DiscardRequest): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    overlays.openModal(
      VddConfirm,
      {
        message: request.dirtyOptions?.message ?? {
          ...ws.messages.unsavedChangesMessage,
          values: { title: request.title },
        },
        alert: request.dirtyOptions?.alert,
        alertType: request.dirtyOptions?.alertType ?? 'danger',
        yesNo: true,
        // Resolving on settle rather than only on the buttons is what makes Escape, the
        // backdrop and the × all count as a refusal — and stops an awaiting close from
        // hanging forever when the user dismisses the question instead of answering it.
        onSettled: (ok: boolean) => resolve(ok),
      },
      { title: request.dirtyOptions?.title ?? ws.messages.unsavedChangesTitle, size: 'small' },
    )
  })
}

onMounted(() => overlays.setConfirmRenderer(confirmDiscard))
onBeforeUnmount(() => overlays.setConfirmRenderer(null))
</script>

<template>
  <VddModalHost
    v-for="(modal, index) in overlays.state.modals"
    :key="modal.id"
    :instance="modal"
    :index="index"
  />
</template>
