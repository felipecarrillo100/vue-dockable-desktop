/**
 * Side panels and modals: two drawers and a modal stack, all rendered outside the workspace.
 *
 * On the workspace store rather than behind a provider of its own
 * (docs/decisions/0004-store-outside-components.md), so `openModal()` works from a service,
 * a router guard or an event handler — none of which are components. rdd needed a
 * `<PanelProvider>` wrapping the app for this, and a second provider inside each rendered
 * instance to hand it the close contract.
 *
 * `requestClose` here is the *only* implementation of the close-with-guards-and-dirty-check
 * sequence. rdd had it twice, thirty-five identical lines in `SidePanelRenderer` and again in
 * `ModalStackRenderer` — which is how two containers end up disagreeing about what a dirty
 * panel does.
 */
import { markRaw, reactive, shallowReactive } from 'vue'
import type { Component } from 'vue'
import type { DirtyStateOptions, Label } from '../types'

/** Which of the three overlay slots an instance occupies. */
export type OverlayKind = 'left-panel' | 'right-panel' | 'modal'

/** Options for `openLeftPanel` / `openRightPanel`. */
export interface SidePanelOptions {
  title?: Label
  /** Rendered in the header, before the title. */
  icon?: Component
  /** A number is pixels; a string is used as-is (`'40vw'`). @default 400 */
  width?: number | string
  /**
   * Padding for the body. A number is pixels; a string is any CSS value or shorthand.
   * Nothing is set at all by default, so the stylesheet decides and content can go
   * edge-to-edge.
   */
  bodyPadding?: number | string
}

/** Options for `openModal`. */
export interface ModalOptions {
  title?: Label
  icon?: Component
  /** Maps to a `max-width` rule. @default 'auto' */
  size?: 'small' | 'medium' | 'large' | 'fullscreen' | 'auto'
  /** `false` removes the close button *and* dismissal by backdrop click or Escape. @default true */
  closable?: boolean
  /** As `SidePanelOptions.bodyPadding`. */
  bodyPadding?: number | string
}

/** One open side panel or modal. */
export interface OverlayInstance {
  id: string
  /** Kept raw: a component definition is not reactive data, and proxying one is wasteful. */
  component: Component
  props: Record<string, unknown>
  kind: OverlayKind
  options: SidePanelOptions & ModalOptions
  dirty: boolean
  dirtyOptions?: DirtyStateOptions
}

export interface OverlayState {
  leftPanel: OverlayInstance | null
  rightPanel: OverlayInstance | null
  /** Bottom to top: the last entry is the topmost modal. */
  modals: OverlayInstance[]
}

/**
 * What the built-in unsaved-changes question needs to know.
 *
 * Deliberately not an `OverlayInstance` or a `PanelInfo`: a docked tab, a floating window, a
 * drawer and a modal all ask the same question, and narrowing it to these two fields is what
 * lets one implementation serve all four.
 */
export interface DiscardRequest {
  /** The thing being closed, already formatted — it appears in the message. */
  title: string
  dirtyOptions?: DirtyStateOptions
}

/** Ask the user whether to discard unsaved changes. Resolves `false` for every refusal. */
export type ConfirmDiscard = (request: DiscardRequest) => Promise<boolean>

export interface Overlays {
  readonly state: OverlayState
  /**
   * Open a drawer on the left. Resolves to the new instance's id, or `null` when a panel was
   * already open there and its close guard refused — a drawer is a single slot, so opening
   * one is also closing the other.
   */
  openLeftPanel(component: Component, props?: Record<string, unknown>, options?: SidePanelOptions): Promise<string | null>
  openRightPanel(component: Component, props?: Record<string, unknown>, options?: SidePanelOptions): Promise<string | null>
  /** Push a modal onto the stack. Synchronous: a stack has room for another. */
  openModal(component: Component, props?: Record<string, unknown>, options?: ModalOptions): string
  /** Remove an instance immediately, with no guard and no dirty check. */
  close(id: string): void
  closeAll(): void
  closeAllModals(): void
  getInstance(id: string): OverlayInstance | undefined
  updateInstance(id: string, updates: Partial<Pick<OverlayInstance, 'props' | 'options' | 'dirty' | 'dirtyOptions'>>): void
  setDirty(id: string, dirty: boolean, options?: DirtyStateOptions): void
  /**
   * Close, honouring this instance's close guard and its dirty state.
   *
   * `force` skips both. Without a `confirm`, a dirty instance stays open rather than
   * discarding the user's edits silently — the same refusal `requestClosePanel` makes.
   */
  requestClose(id: string, options?: { force?: boolean; confirm?: (instance: OverlayInstance) => Promise<boolean> }): Promise<void>
  /** Veto an instance's close. Returning `false` blocks it. */
  registerCloseGuard(id: string, guard: () => boolean | Promise<boolean>): () => void
  /** The topmost modal, or `null`. */
  topmostModal(): OverlayInstance | null
  /**
   * Ask the user whether to discard unsaved changes, as a modal on top of the stack.
   *
   * Resolves `false` when nothing can render the question — which is why a dirty close with
   * no `<VddModals>` mounted refuses instead of discarding. Every close path in the library
   * routes through this one function: a tab's ×, a floating window's ×, a drawer, a modal,
   * and `usePanel().close()`. rdd wired an equivalent separately into each container, and
   * the docked-panel path was wired to nothing at all.
   */
  confirmDiscard: ConfirmDiscard
  /**
   * Register the component that renders that question, and the formatter for its message.
   * Called by `<VddModals>` on mount: asking requires somewhere to render.
   * @internal
   */
  setConfirmRenderer(renderer: ConfirmRenderer | null): void
  /** @internal */
  dispose(): void
}

/** Supplied by `<VddModals>`: opens the question and resolves the user's answer. @internal */
export type ConfirmRenderer = (request: DiscardRequest) => Promise<boolean>

let counter = 0
/** Ids are unique per process, and carry the kind so a stray id is readable in devtools. */
const nextId = (kind: OverlayKind): string => `vdd-${kind}-${++counter}`

export function createOverlays(): Overlays {
  // `shallowReactive` on the instance list: the instances hold component definitions and
  // caller props, and deep-proxying those would reach into application objects the library
  // has no business rewriting. Replacement, not mutation, is how an instance changes.
  const state = reactive<OverlayState>({
    leftPanel: null,
    rightPanel: null,
    modals: shallowReactive([]),
  }) as OverlayState

  const guards = new Map<string, () => boolean | Promise<boolean>>()
  let confirmRenderer: ConfirmRenderer | null = null

  const instances = (): OverlayInstance[] =>
    [state.leftPanel, state.rightPanel, ...state.modals].filter((i): i is OverlayInstance => i !== null)

  const getInstance = (id: string): OverlayInstance | undefined => instances().find(i => i.id === id)

  function make(
    kind: OverlayKind,
    component: Component,
    props: Record<string, unknown>,
    options: SidePanelOptions & ModalOptions,
  ): OverlayInstance {
    return { id: nextId(kind), component: markRaw(component), props, kind, options, dirty: false }
  }

  /** A drawer holds one panel, so opening asks the occupant's guard before evicting it. */
  async function openDrawer(
    slot: 'leftPanel' | 'rightPanel',
    kind: OverlayKind,
    component: Component,
    props: Record<string, unknown> = {},
    options: SidePanelOptions = {},
  ): Promise<string | null> {
    const current = state[slot]
    if (current) {
      const guard = guards.get(current.id)
      if (guard && !(await guard())) return null
      // The occupant's own dirty state is deliberately *not* consulted here: it is the
      // caller who is replacing the panel, and a guard is the documented way to object.
      guards.delete(current.id)
    }
    const instance = make(kind, component, props, options)
    state[slot] = instance
    return instance.id
  }

  function openModal(
    component: Component,
    props: Record<string, unknown> = {},
    options: ModalOptions = {},
  ): string {
    const instance = make('modal', component, props, options)
    state.modals.push(instance)
    return instance.id
  }

  function close(id: string): void {
    guards.delete(id)
    if (state.leftPanel?.id === id) { state.leftPanel = null; return }
    if (state.rightPanel?.id === id) { state.rightPanel = null; return }
    const index = state.modals.findIndex(m => m.id === id)
    if (index !== -1) state.modals.splice(index, 1)
  }

  function updateInstance(
    id: string,
    updates: Partial<Pick<OverlayInstance, 'props' | 'options' | 'dirty' | 'dirtyOptions'>>,
  ): void {
    const current = getInstance(id)
    if (!current) return
    const next: OverlayInstance = { ...current, ...updates }
    if (state.leftPanel?.id === id) { state.leftPanel = next; return }
    if (state.rightPanel?.id === id) { state.rightPanel = next; return }
    const index = state.modals.findIndex(m => m.id === id)
    if (index !== -1) state.modals.splice(index, 1, next)
  }

  async function requestClose(
    id: string,
    options?: { force?: boolean; confirm?: (instance: OverlayInstance) => Promise<boolean> },
  ): Promise<void> {
    if (options?.force) { close(id); return }

    const guard = guards.get(id)
    if (guard && !(await guard())) return

    const instance = getInstance(id)
    if (instance?.dirty) {
      if (!options?.confirm) return           // no way to ask: refuse rather than discard
      if (!(await options.confirm(instance))) return
    }
    close(id)
  }

  return {
    state,
    openLeftPanel: (component, props, options) => openDrawer('leftPanel', 'left-panel', component, props, options),
    openRightPanel: (component, props, options) => openDrawer('rightPanel', 'right-panel', component, props, options),
    openModal,
    close,
    closeAll: () => {
      guards.clear()
      state.leftPanel = null
      state.rightPanel = null
      state.modals.splice(0)
    },
    closeAllModals: () => {
      for (const m of state.modals) guards.delete(m.id)
      state.modals.splice(0)
    },
    getInstance,
    updateInstance,
    setDirty: (id, dirty, options) => updateInstance(id, { dirty, dirtyOptions: options }),
    requestClose,
    registerCloseGuard: (id, guard) => {
      guards.set(id, guard)
      return () => { if (guards.get(id) === guard) guards.delete(id) }
    },
    topmostModal: () => state.modals[state.modals.length - 1] ?? null,
    confirmDiscard: (request) => confirmRenderer?.(request) ?? Promise.resolve(false),
    setConfirmRenderer: (renderer) => { confirmRenderer = renderer },
    dispose: () => { guards.clear(); confirmRenderer = null },
  }
}
