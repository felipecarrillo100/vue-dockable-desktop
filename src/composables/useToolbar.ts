import { useWorkspace } from './useWorkspace'
import type { ToolbarState } from '../core/toolbarState'

/**
 * Toolbar selection state — which item is active in each radio group, and which toggles are
 * on — for items the caller has not taken control of.
 *
 * Reachable anywhere `useWorkspace()` is, so a panel can read or set the active tool without
 * the toolbar having to pass anything down. rdd needed a `<ToolbarProvider>` in the tree.
 */
export function useToolbar(): ToolbarState {
  return useWorkspace().toolbar
}
