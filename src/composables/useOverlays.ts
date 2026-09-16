import { computed } from 'vue'
import type { Component, ComputedRef } from 'vue'
import { useWorkspace } from './useWorkspace'
import type { ModalOptions, OverlayInstance, SidePanelOptions } from '../core/overlays'

/**
 * The modal stack.
 *
 * ```ts
 * const { open, close, closeAll, stack } = useModals()
 * const id = open(EditFeature, { featureId }, { size: 'medium', title: 'Edit' })
 * ```
 *
 * `open` returns the instance id, which is what `close(id)` takes. Modals stack, so opening
 * one never closes another.
 *
 * Every one of these is also reachable as `workspace.overlays.*` without a component, which
 * is the usual case for a confirmation raised by a service.
 */
export function useModals(): {
  /** Bottom to top — the last entry is the topmost. */
  stack: ComputedRef<OverlayInstance[]>
  /** The topmost modal, or `null`. */
  topmost: ComputedRef<OverlayInstance | null>
  open: (component: Component, props?: Record<string, unknown>, options?: ModalOptions) => string
  /** Close, honouring the modal's close guard and dirty state. */
  close: (id: string, options?: { force?: boolean }) => Promise<void>
  closeAll: () => void
} {
  const { overlays } = useWorkspace()
  return {
    stack: computed(() => overlays.state.modals),
    topmost: computed(() => overlays.state.modals[overlays.state.modals.length - 1] ?? null),
    open: overlays.openModal,
    close: (id, options) => overlays.requestClose(id, options),
    closeAll: overlays.closeAllModals,
  }
}

/**
 * The two side drawers.
 *
 * ```ts
 * const { openLeft, openRight, close, left, right } = useSidePanels()
 * await openLeft(LayerList, { layers }, { title: 'Layers', width: 320 })
 * ```
 *
 * Each side holds one panel, so opening is also closing whatever was there — which is why
 * `openLeft`/`openRight` are async and resolve to `null` when the occupant's close guard
 * refuses. A synchronous return would have to either ignore the guard or lie about the id.
 */
export function useSidePanels(): {
  left: ComputedRef<OverlayInstance | null>
  right: ComputedRef<OverlayInstance | null>
  openLeft: (component: Component, props?: Record<string, unknown>, options?: SidePanelOptions) => Promise<string | null>
  openRight: (component: Component, props?: Record<string, unknown>, options?: SidePanelOptions) => Promise<string | null>
  close: (id: string, options?: { force?: boolean }) => Promise<void>
  /** Close both drawers, leaving the modal stack alone. */
  closeAll: () => void
} {
  const { overlays } = useWorkspace()
  return {
    left: computed(() => overlays.state.leftPanel),
    right: computed(() => overlays.state.rightPanel),
    openLeft: overlays.openLeftPanel,
    openRight: overlays.openRightPanel,
    close: (id, options) => overlays.requestClose(id, options),
    closeAll: () => {
      for (const instance of [overlays.state.leftPanel, overlays.state.rightPanel]) {
        if (instance) overlays.close(instance.id)
      }
    },
  }
}
