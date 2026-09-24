import { getCurrentScope, inject, onScopeDispose } from 'vue'
import type { BuiltInEvents } from '../core/eventBus'
import { WORKSPACE_KEY } from '../core/workspace'
import type { Workspace } from '../core/workspace'

/**
 * The workspace, from anywhere inside an app that has `app.use(workspace)`.
 *
 * Returns refs and functions, so destructuring keeps reactivity — the shape `storeToRefs`
 * exists to produce in Pinia:
 *
 * ```ts
 * const { activePanelId, panels, openPanel } = useWorkspace()
 * ```
 *
 * There is no selector argument. react-dockable-desktop needed one to control re-renders;
 * in Vue a `computed()` is both more capable and the idiom you already know.
 *
 * `subscribe()` is wrapped so a subscription made during `setup` is disposed with the
 * component. Outside a scope it behaves exactly like `workspace.subscribe`.
 */
export function useWorkspace<TEvents extends object = Record<string, unknown>>(): Workspace<TEvents> {
  const workspace = inject(WORKSPACE_KEY, null) as Workspace<TEvents> | null
  if (!workspace) {
    throw new Error(
      '[vue-dockable-desktop] useWorkspace() found no workspace. Create one with ' +
      'createWorkspace() and install it with app.use(workspace).',
    )
  }

  if (!getCurrentScope()) return workspace

  // Auto-disposing subscribe: register in setup, forget about cleanup.
  return {
    ...workspace,
    subscribe<K extends keyof (TEvents & BuiltInEvents) & string>(
      event: K,
      cb: (data: (TEvents & BuiltInEvents)[K]) => void,
    ): () => void {
      const off = workspace.subscribe(event, cb)
      onScopeDispose(off)
      return off
    },
  }
}
