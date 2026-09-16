/**
 * Toolbar selection state: which item is active in each radio group, and which toggles are on.
 *
 * Lives on the workspace so it needs no provider of its own and is reachable from anywhere,
 * including outside components. Every item can also be *controlled* instead — see
 * `VddToolbar` — in which case none of this is consulted for that item.
 */
import { reactive } from 'vue'

export interface ToolbarState {
  /** The active item in a radio group, or `null`. */
  activeInGroup: (group: string) => string | null
  /** Set the active item in a group. `null` clears it. */
  setActiveInGroup: (group: string, id: string | null) => void
  /** Whether a toggle is on. */
  isToggled: (id: string) => boolean
  /** Set a toggle explicitly. */
  setToggled: (id: string, on: boolean) => void
  /** Flip a toggle. */
  toggle: (id: string) => void
}

export function createToolbarState(): ToolbarState {
  const groups = reactive<Record<string, string | null>>({})
  const toggles = reactive<Record<string, boolean>>({})

  return {
    activeInGroup: (group) => groups[group] ?? null,
    setActiveInGroup: (group, id) => { groups[group] = id },
    isToggled: (id) => toggles[id] === true,
    setToggled: (id, on) => { toggles[id] = on },
    toggle: (id) => { toggles[id] = !toggles[id] },
  }
}
