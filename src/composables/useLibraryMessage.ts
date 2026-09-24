import { inject } from 'vue'
import { WORKSPACE_KEY } from '../core/workspace'
import type { Workspace } from '../core/workspace'
import { defaultMessages, formatLabel } from '../core/messages'
import type { MessageKey } from '../core/messages'

/**
 * One of the library's own strings, for a component that may render with no workspace.
 *
 * Toasts work from anywhere and a sidebar can stand alone, so these cannot `useWorkspace()`,
 * which throws without one. With a workspace the string goes through its message table and
 * formatter, exactly as every other library label does; without one it is the English
 * default. Call the returned function during render, so a locale change is followed. @internal
 */
export function useLibraryMessage(): (key: MessageKey) => string {
  const ws = inject(WORKSPACE_KEY, null) as Workspace<never> | null
  return (key) => (ws ? ws.format(ws.messages[key]) : formatLabel(defaultMessages[key]))
}
