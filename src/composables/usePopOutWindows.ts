import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { PopOutWindows } from '../core/popOutWindows'
import type { PopOutMenu } from '../core/panelMenu'
import { toast } from '../core/toast'
import { useWorkspace } from './useWorkspace'

export const POPOUT_WINDOWS_KEY = Symbol('vdd-popout-windows') as InjectionKey<PopOutWindows>

/** @internal — `<VddDesktop>` owns its workspace's pop-out windows (1.14.0) and shares them inside it. */
export function providePopOutWindows(windows: PopOutWindows): void {
  provide(POPOUT_WINDOWS_KEY, windows)
}

/** @internal The desktop's pop-out windows, or null outside a `<VddDesktop>`. */
export function usePopOutWindows(): PopOutWindows | null {
  return inject(POPOUT_WINDOWS_KEY, null)
}

/**
 * @internal "Open in new window" for the tab and floating-window menus (1.14.0), or undefined when
 * the workspace has no pop-out windows. From the menu, a blocked pop-up is the user's to know
 * about: a toast says so. A call from app code shows nothing.
 */
export function usePopOutMenu(): PopOutMenu | undefined {
  const windows = usePopOutWindows()
  if (!windows?.enabled) return undefined
  const ws = useWorkspace()
  return {
    canPopOut: windows.canPopOut,
    popOut: (id) => {
      const result = ws.popOutPanel(id)
      if (!result.ok && result.reason === 'blocked') toast.warning(ws.format(ws.messages.popOutBlocked))
    },
  }
}
