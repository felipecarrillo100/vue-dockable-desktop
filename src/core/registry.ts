import { markRaw } from 'vue'
import type { Component } from 'vue'
import type { FloatAnchor, Label } from '../types'

/** Defaults applied to every instance of a registered panel. All optional. */
export interface PanelDefaultOptions {
  /** Tab and window title. */
  title?: Label
  /** Icon shown in the tab, title bar and taskbar. */
  icon?: Component
  /** Where the panel goes when first opened. @default 'docked' */
  initialTarget?: 'floating' | 'docked' | 'tabbed'
  /** Bounds used the first time the panel is floated. Numbers are px; strings any CSS length. */
  favoritePosition?: { x: number | string; y: number | string; width: number | string; height: number | string }
  /** Corner to pin newly-floated windows to. */
  defaultAnchor?: FloatAnchor
  /** Show the close button. @default true */
  canClose?: boolean
  /** Show the minimise button. @default true */
  canMinimize?: boolean
  /** Allow dragging the tab, which is also what allows floating by drag. @default true */
  canDrag?: boolean
  /**
   * `false`: the user can't make this panel floating. A tab drag can't end in a floating window
   * (dropped on nothing or on a corner, it stays where it was), and "Float Window" and the taskbar's
   * "Maximize" are hidden. A window the app floated itself can still be moved. The app's own
   * `floatPanel` always works. @default true (1.10.0)
   */
  canFloat?: boolean
  /**
   * `false`: the user can't dock this panel. Dragging it offers no group, tab or edge targets
   * (corners still pin a floating window), so it stays floating. The app's own docking calls always
   * work; give the kind `initialTarget: 'floating'` so it opens floating. @default true (1.10.0)
   */
  canDock?: boolean
  /** Show a letter tile instead of a live thumbnail in the taskbar hover preview. @default false */
  disableLivePreview?: boolean
  /**
   * Restore scroll offsets after the panel is re-parented. Turn off for a panel that
   * manages virtualised scrolling itself and would rather react to `isMinimized`.
   * @default true
   * @see docs/decisions/0014-preserve-scroll-and-focus.md
   */
  preserveScroll?: boolean
  /**
   * Class added to each panel of this kind, on its own content element (`.vdd-panel-content`),
   * which moves with the panel between groups, windows and the taskbar preview. (1.9.0)
   */
  className?: string
  /** Class added to the tab of each panel of this kind. (1.9.0) */
  tabClassName?: string
  /**
   * `false` unmounts the panel's component while it is hidden (an unselected tab, or minimised)
   * and mounts it afresh when shown, to free what a heavy, rarely shown panel holds. Its own
   * state is lost each time, and a guard it registered with `onBeforeClose` is not active while
   * it is unmounted (its dirty flag still is). Its tab, title and lifecycle continue, and the
   * taskbar shows a letter tile instead of a live preview. @default true
   * @see docs/decisions/0021-opt-in-unmount-while-hidden.md
   */
  keepAlive?: boolean
}

/** A registered panel kind. */
export interface PanelRegistryEntry {
  component: Component
  defaultOptions?: PanelDefaultOptions
}

/**
 * The panel catalogue: component keys → components.
 *
 * One instance per workspace, never a module-level singleton, so two workspaces on a page
 * cannot see each other's panels (docs/decisions/0004-store-outside-components.md).
 */
export class PanelRegistry {
  private entries = new Map<string, PanelRegistryEntry>()

  /**
   * Register a panel kind. `markRaw` is applied to the component: a component placed in
   * reactive state would otherwise be deep-proxied by Vue, which both warns and is
   * pointless — a component definition is never reactive data.
   */
  register(id: string, component: Component, defaultOptions?: PanelDefaultOptions): void {
    this.entries.set(id, {
      component: markRaw(component),
      ...(defaultOptions ? { defaultOptions: { ...defaultOptions, ...(defaultOptions.icon ? { icon: markRaw(defaultOptions.icon) } : {}) } } : {}),
    })
  }

  /** Look up a panel kind, or `undefined` if the key was never registered. */
  get(id: string): PanelRegistryEntry | undefined {
    return this.entries.get(id)
  }

  /** Whether a key is registered. */
  has(id: string): boolean {
    return this.entries.has(id)
  }

  /** Every registered key. */
  keys(): string[] {
    return Array.from(this.entries.keys())
  }
}
