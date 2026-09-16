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
  /** Show a letter tile instead of a live thumbnail in the taskbar hover preview. @default false */
  disableLivePreview?: boolean
  /**
   * Restore scroll offsets after the panel is re-parented. Turn off for a panel that
   * manages virtualised scrolling itself and would rather react to `isMinimized`.
   * @default true
   * @see docs/decisions/0014-preserve-scroll-and-focus.md
   */
  preserveScroll?: boolean
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
