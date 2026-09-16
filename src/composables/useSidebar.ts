import { inject } from 'vue'
import { SIDEBAR_KEY, SIDEBAR_TAB_KEY } from '../core/sidebarTypes'
import type { SidebarContext, SidebarTabContext } from '../core/sidebarTypes'

/**
 * Control the sidebar from anywhere inside it — including from a panel rendered in the
 * workspace, since the workspace is the sidebar's own content.
 *
 * @throws if used outside a `<VddSidebar>`.
 */
export function useSidebar(): SidebarContext {
  const context = inject(SIDEBAR_KEY, null)
  if (!context) {
    throw new Error('[vue-dockable-desktop] useSidebar() must be used inside a <VddSidebar>.')
  }
  return context
}

/**
 * Control scoped to the tab you are inside: close the drawer, re-open this tab, or switch to
 * another one, without having to know which tab you are.
 *
 * @throws if used outside a sidebar tab's content.
 */
export function useSidebarTab(): SidebarTabContext {
  const context = inject(SIDEBAR_TAB_KEY, null)
  if (!context) {
    throw new Error(
      '[vue-dockable-desktop] useSidebarTab() must be used inside a sidebar tab\'s content.',
    )
  }
  return context
}
