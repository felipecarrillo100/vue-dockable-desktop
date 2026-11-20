import { computed, inject } from 'vue'
import type { ComputedRef } from 'vue'
import { PANEL_OVERLAY_KEY } from '../core/overlayState'
import type {
  ManagedWidget, MoveResult, PanelOverlayStore, WidgetLocation, WidgetPlacement, WidgetTarget,
} from '../core/overlayState'

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
  /**
   * Move a widget out of its panel, between places out of it, or back (7.11): docked beside the
   * owner panel, a tab in its group, a floating window, or `{ to: 'panel' }`. Never throws; a
   * refusal changes nothing. Its content never remounts.
   */
  move: (id: string, to: WidgetTarget) => MoveResult
  /** Where a widget is now, or `null` when it isn't open. */
  location: (id: string) => WidgetLocation | null
  /**
   * Where a widget is, as plain JSON to save (7.11): in the panel (its corner, stretch, size or
   * free position) or out of it (docked, tabbed or floating, with where it goes back to). Give it
   * back as `open(id, { …, placement })` to open it there. `null` when it isn't open.
   */
  placement: (id: string) => WidgetPlacement | null
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
    move: (id, to) => {
      if (store.hosting) return store.hosting.move(id, to)
      return store.managed.has(id) ? { ok: false, reason: 'no-workspace' } : { ok: false, reason: 'not-open' }
    },
    location: (id) => store.hosting?.location(id) ?? (store.managed.has(id) ? 'panel' : null),
    placement: (id) => store.placementOf(id),
  }
}
