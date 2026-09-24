import { computed, getCurrentScope, inject, onScopeDispose, provide, ref } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { ContainerType, DirtyStateOptions, Label } from '../types'
import { WORKSPACE_KEY } from '../core/workspace'
import type { Workspace } from '../core/workspace'

/** What a panel's container tells it about itself. @internal */
export interface PanelContext {
  id: string
  containerType: Ref<ContainerType>
  /** Set by a container that is not the workspace (a modal, a side panel). */
  close?: (options?: { force?: boolean }) => void | Promise<void>
  setTitle?: (title: Label) => void
  setIcon?: (icon: unknown) => void
  setDirty?: (dirty: boolean, options?: DirtyStateOptions) => void
  size?: Ref<{ width: number; height: number } | null>
  /** Live title and dirty state, for a container whose panel is not in `ws.state.panels`. */
  title?: Ref<Label>
  dirty?: Ref<boolean>
  /** Register a close guard with the container; returns its disposer. */
  onBeforeClose?: (guard: () => boolean | Promise<boolean>) => () => void
  /**
   * Set by a modal or side panel: it is not part of the layout, so it has nothing to save
   * and nowhere to minimise to. Lets `usePanel()` say so rather than call it standalone.
   */
  overlay?: boolean
}

export const PANEL_KEY = Symbol('vdd-panel') as InjectionKey<PanelContext>

/** @internal — used by containers to tell their content which panel it is. */
export function providePanel(context: PanelContext): void {
  provide(PANEL_KEY, context)
}

/** What {@link usePanel} returns. */
export interface UsePanelReturn {
  /** This panel's instance id. */
  id: string
  /** Live title. */
  title: ComputedRef<Label>
  /** Whether this is the globally active panel — the one contributions are read from. */
  isActive: ComputedRef<boolean>
  /** Whether this panel is minimised. It is still mounted and still running. */
  isMinimized: ComputedRef<boolean>
  /** Whether this panel is a floating window. */
  isFloating: ComputedRef<boolean>
  /** Where this panel is rendered. */
  containerType: ComputedRef<ContainerType>
  /** The panel's rendered size, or `null` before it has been laid out. */
  size: ComputedRef<{ width: number; height: number } | null>
  /** Unsaved changes. */
  dirty: ComputedRef<boolean>
  setTitle: (title: Label) => void
  setIcon: (icon: unknown) => void
  setDirty: (dirty: boolean, options?: DirtyStateOptions) => void
  /** Close, honouring dirty state and any `onBeforeClose` guard. */
  close: (options?: { force?: boolean }) => void | Promise<void>
  minimize: () => void
  /**
   * Veto a close. Return `false` (or a promise of it) to block.
   * Registered in `setup` and disposed with the component — nothing to unsubscribe.
   */
  onBeforeClose: (guard: () => boolean | Promise<boolean>) => void
  /**
   * Contribute this panel's live state to `saveLayout()`, pulled fresh on every save — for
   * state that accumulates after opening and so cannot be captured by open-time props.
   * Must be synchronous and JSON-serialisable. Disposed with the component.
   */
  onSaveState: (provider: () => unknown) => void
}

const NO_PANEL = 'standalone'

/**
 * A panel's view of itself and its container.
 *
 * Everything that describes *state* is a ref, so you react with the tools you already use:
 *
 * ```ts
 * const { isActive, size } = usePanel()
 * watch(isActive, active => active && editor.focus())
 * watch(size, ({ width, height }) => chart.resize(width, height))
 * ```
 *
 * react-dockable-desktop exposed six subscription methods plus two size APIs for this,
 * because React cannot hand a component live state. Those are all refs here
 * (docs/decisions/0006-refs-over-subscriptions.md).
 *
 * Works outside any container too: the refs then report a `'standalone'` panel and the
 * actions are no-ops with a development warning, so a panel component can be rendered on
 * its own — in a test, or a storybook — without special-casing.
 */
export function usePanel(): UsePanelReturn {
  const ctx = inject(PANEL_KEY, null)
  const workspace = inject(WORKSPACE_KEY, null) as Workspace<never> | null
  const id = ctx?.id ?? NO_PANEL

  const warnStandalone = (what: string) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[vue-dockable-desktop] usePanel().${what} was called outside a panel container, ` +
        `so it did nothing. This is expected when a panel component is rendered standalone.`,
      )
    }
  }

  /** For what a modal or side panel cannot do — accurate, where "standalone" would mislead. */
  const warnOverlay = (what: string, why: string) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[vue-dockable-desktop] usePanel().${what} did nothing: ${why}`)
    }
  }

  const info = computed(() => (workspace ? workspace.state.panels[id] : undefined))
  const fallbackSize = ref<{ width: number; height: number } | null>(null)

  return {
    id,
    title: computed(() => ctx?.title?.value ?? info.value?.title ?? id),
    isActive: computed(() => !!workspace && workspace.state.activePanelId === id),
    isMinimized: computed(() => info.value?.state === 'minimized'),
    isFloating: computed(() => info.value?.state === 'floating'),
    containerType: computed(() => ctx?.containerType.value ?? NO_PANEL),
    size: computed(() => (ctx?.size ?? fallbackSize).value),
    dirty: computed(() => (ctx?.dirty ? ctx.dirty.value : info.value?.dirty === true)),

    setTitle: (title) => {
      if (ctx?.setTitle) ctx.setTitle(title)
      else if (workspace && info.value) workspace.updatePanelTitle(id, title)
      else warnStandalone('setTitle')
    },
    setIcon: (icon) => {
      if (ctx?.setIcon) ctx.setIcon(icon)
      else warnStandalone('setIcon')
    },
    setDirty: (dirty, options) => {
      if (ctx?.setDirty) ctx.setDirty(dirty, options)
      else if (workspace && info.value) workspace.setPanelDirty(id, dirty, options)
      else warnStandalone('setDirty')
    },
    close: (options) => {
      if (ctx?.close) return ctx.close(options)
      if (workspace && info.value) return workspace.requestClosePanel(id, options)
      warnStandalone('close')
    },
    minimize: () => {
      if (workspace && info.value) workspace.minimizePanel(id)
      else if (ctx?.overlay) warnOverlay('minimize', 'modals and side panels cannot be minimised.')
      else warnStandalone('minimize')
    },

    onBeforeClose: (guard) => {
      const off = ctx?.onBeforeClose
        ? ctx.onBeforeClose(guard)
        : workspace && info.value ? workspace.registerCloseGuard(id, guard) : null
      if (!off) { warnStandalone('onBeforeClose'); return }
      if (getCurrentScope()) onScopeDispose(off)
    },
    onSaveState: (provider) => {
      if (ctx?.overlay) {
        warnOverlay('onSaveState', 'modals and side panels are not saved with the layout.')
        return
      }
      if (!workspace || !info.value) { warnStandalone('onSaveState'); return }
      const off = workspace.registerStateProvider(id, provider)
      if (getCurrentScope()) onScopeDispose(off)
    },
  }
}
