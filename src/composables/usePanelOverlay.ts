import { computed, inject } from 'vue'
import type { ComputedRef } from 'vue'
import { PANEL_OVERLAY_KEY } from '../core/overlayState'
import type { ManagedWidget, PanelOverlayStore } from '../core/overlayState'

/**
 * The overlay a widget or toolbar is inside.
 *
 * @throws if used outside a `<VddPanelOverlay>`.
 * @internal — applications use {@link useFloatingWidgets}.
 */
export function usePanelOverlay(): PanelOverlayStore {
  const store = inject(PANEL_OVERLAY_KEY, null)
  if (!store) {
    throw new Error(
      '[vue-dockable-desktop] This component must be used inside a <VddPanelOverlay>. ' +
      'Wrap your panel content in one to enable toolbars and floating widgets.',
    )
  }
  return store
}

/** Same, but `null` outside an overlay — for components that work either way. */
export function usePanelOverlayOptional(): PanelOverlayStore | null {
  return inject(PANEL_OVERLAY_KEY, null)
}

/**
 * Open and close floating widgets by id, without declaring each one in the template.
 *
 * For widgets whose existence is data — one per selected feature, one per running job — where
 * writing a `<VddFloatingWidget>` per case is not possible.
 *
 * ```ts
 * const widgets = useFloatingWidgets()
 * widgets.open('feature-42', {
 *   title: 'Feature 42', component: FeatureInfo, props: { id: 42 }, anchor: 'top-right',
 * })
 * ```
 *
 * A widget placed in the template with `<VddFloatingWidget>` is the simpler option and
 * behaves identically otherwise.
 */
export function useFloatingWidgets(): {
  /** Ids of the currently open managed widgets, in the order they were opened. */
  openIds: ComputedRef<string[]>
  open: (id: string, widget: ManagedWidget) => void
  close: (id: string) => void
  closeAll: () => void
  isOpen: (id: string) => boolean
} {
  const store = usePanelOverlay()
  return {
    openIds: computed(() => store.managedIds()),
    open: store.openManaged,
    close: store.closeManaged,
    closeAll: store.closeAllManaged,
    isOpen: (id) => {
      void store.managedVersion.value
      return store.managed.has(id)
    },
  }
}
