import { getCurrentScope, onScopeDispose } from 'vue'
import type { ContextMenuItem, ShowContextMenuOptions } from '../core/contextMenu'
import { usePanel } from './usePanel'
import { useWorkspace } from './useWorkspace'

/**
 * Open a context menu from anywhere.
 *
 * ```ts
 * const showMenu = useContextMenu()
 * showMenu({ event, items: [{ label: 'Rename', action: rename }] })
 * ```
 *
 * Works wherever `useWorkspace()` works, including outside the component tree — the menu
 * request is state, and `<VddContextMenu>` renders what is pending.
 */
export function useContextMenu(): (options: ShowContextMenuOptions) => void {
  const ws = useWorkspace()
  return (options) => ws.showContextMenu(options)
}

/**
 * Contribute items to *this panel's* own context menu, from inside the panel.
 *
 * Pass a getter: it is read each time the menu opens, so items that enable, disable, check
 * or disappear with the panel's state need no extra wiring.
 *
 * ```ts
 * usePanelContextMenu(() => [
 *   { label: 'Save', action: save },
 *   { label: 'Revert', action: revert, disabled: !dirty.value },
 * ])
 * ```
 *
 * Registered in `setup` and disposed with the component — nothing to unsubscribe.
 */
export function usePanelContextMenu(items: () => ContextMenuItem[]): void {
  const ws = useWorkspace()
  const { id } = usePanel()
  if (id === 'standalone') {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[vue-dockable-desktop] usePanelContextMenu() was called outside a panel, so it did ' +
        'nothing. This is expected when a panel component is rendered standalone.',
      )
    }
    return
  }
  const off = ws.registerPanelMenu(id, items)
  if (getCurrentScope()) onScopeDispose(off)
}
