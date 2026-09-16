import { computed, getCurrentScope, onScopeDispose, toValue, watch } from 'vue'
import type { Component, ComputedRef, MaybeRefOrGetter } from 'vue'
import { useWorkspace } from './useWorkspace'
import { usePanel } from './usePanel'
import { mergeSidebarTabs, mergeToolbarItems } from '../core/contributions'
import type { PanelContribution } from '../core/contributions'
import type { SidebarTab } from '../core/sidebarTypes'
import type { ToolbarItem } from '../core/toolbarTypes'

/**
 * Publish this panel's toolbar items and sidebar sections, for the shell to surface while
 * this panel is the active one.
 *
 * Pass a getter or a ref, not a plain object: the contribution is re-published whenever it
 * changes, so items that enable, check or disappear with the panel's own state need no extra
 * wiring.
 *
 * ```ts
 * const tool = ref<'pan' | 'draw'>('pan')
 * usePanelContribution(() => ({
 *   toolbarItems: [
 *     { type: 'toggle', id: 'draw', label: 'Draw', icon: Pencil,
 *       active: tool.value === 'draw', onToggle: v => (tool.value = v ? 'draw' : 'pan') },
 *   ],
 *   sidebarSections: [{ id: 'layers', label: 'Layers', component: LayerList }],
 * }))
 * ```
 *
 * rdd asked callers to memoise the object themselves, and to call the hook on every render,
 * because a new object literal each render meant republishing each render. A getter makes
 * that the framework's problem instead of the caller's.
 *
 * Registered in `setup` and withdrawn with the component — nothing to unsubscribe.
 */
export function usePanelContribution(contribution: MaybeRefOrGetter<PanelContribution>): void {
  const ws = useWorkspace()
  const { id } = usePanel()

  if (id === 'standalone') {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[vue-dockable-desktop] usePanelContribution() was called outside a panel, so it did ' +
        'nothing. This is expected when a panel component is rendered standalone.',
      )
    }
    return
  }

  let withdraw = ws.contributions.publish(id, toValue(contribution))
  const stop = watch(() => toValue(contribution), (next) => {
    // Publish the new one *first*, then withdraw the old registration. The other order
    // leaves a moment where this panel has published nothing, which anything reading the
    // active contribution during the same flush would observe as a disappearance. The
    // store's withdraw is a no-op once something newer has replaced it, which is what makes
    // this order safe rather than merely lucky.
    const previous = withdraw
    withdraw = ws.contributions.publish(id, next)
    previous()
  }, { deep: true })

  if (getCurrentScope()) {
    onScopeDispose(() => { stop(); withdraw() })
  }
}

/**
 * What the active panel has published, or `null`.
 *
 * For the app shell to merge into its own `<VddToolbar :items>` and `<VddSidebar :tabs>`.
 * Nothing is merged automatically: the library does not know what a contributed item means
 * for your domain, or where in your toolbar it belongs.
 */
export function useActiveContribution(): ComputedRef<PanelContribution | null> {
  return useWorkspace().activeContribution
}

/**
 * A static toolbar list with the active panel's contributed items appended behind a
 * separator, as a `computed`.
 *
 * `mergeToolbarItems` is the plain function underneath, for when the merge position or the
 * separator needs to be different.
 */
export function useMergedToolbarItems(
  staticItems: MaybeRefOrGetter<ToolbarItem[]>,
): ComputedRef<ToolbarItem[]> {
  const active = useActiveContribution()
  return computed(() => mergeToolbarItems(toValue(staticItems), active.value))
}

/** A static tab list with the active panel's contributed sections appended, as a `computed`. */
export function useMergedSidebarTabs(
  staticTabs: MaybeRefOrGetter<SidebarTab[]>,
  fallbackIcon?: Component,
): ComputedRef<SidebarTab[]> {
  const active = useActiveContribution()
  return computed(() => mergeSidebarTabs(toValue(staticTabs), active.value, fallbackIcon))
}
