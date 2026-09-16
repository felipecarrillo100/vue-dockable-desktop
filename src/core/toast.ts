/**
 * The toast singleton.
 *
 * rdd routed every `toast.*` call through an event emitter that `<ToastContainer>`
 * subscribed to, because React state cannot live at module scope — the emitter existed
 * purely to get a call made outside React into a component's `useState`.
 *
 * In Vue the queue *is* module-level reactive state, so there is nothing to emit: `toast()`
 * pushes, `<VddToasts>` renders. One less indirection, and two consequences worth having —
 * two containers mounted at once show the same toasts instead of racing for the subscription,
 * and a test can assert the store directly without rendering anything.
 *
 * `maxVisible` follows from that too. rdd kept a separate queue array and imperatively
 * shifted from it when a toast finished exiting; here every toast goes in one list and the
 * container renders a `computed` slice of it, so promotion is not code at all.
 */
import { reactive } from 'vue'
import type { Component } from 'vue'

export type ToastType = 'info' | 'success' | 'warning' | 'error'
export type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** Per-toast options. Anything omitted falls back to the `<VddToasts>` defaults. */
export interface ToastOptions {
  /** @default 'info' — set for you by the `toast.info`/`success`/… shorthands. */
  type?: ToastType
  /** Auto-dismiss delay in ms. `0` never auto-dismisses. @default from the container */
  duration?: number
  /** Supply to deduplicate: calling again with the same id updates that toast in place. */
  id?: string
  /** @default from the container */
  closable?: boolean
  /** Replaces the built-in type icon. */
  icon?: Component
  /** Replaces the message string with a component. */
  content?: Component
  /** Props for `content`. */
  contentProps?: Record<string, unknown>
  /** Called on dismissal by timer, close button or `toast.dismiss()`. */
  onClose?: () => void
}

/** A toast's options with every default filled in. What an adapter receives. */
export interface ResolvedToastOptions extends Required<Pick<ToastOptions, 'id' | 'type' | 'duration' | 'closable'>> {
  icon?: Component
  content?: Component
  contentProps?: Record<string, unknown>
  onClose?: () => void
}

/** One toast in the store. */
export interface ToastRecord {
  id: string
  message: string
  options: ToastOptions & { id: string }
  /** Set while the exit transition runs; an exiting toast no longer counts as visible. */
  exiting: boolean
  /** Bumped whenever the toast is updated, so a watcher can restart its timer. */
  revision: number
}

/** Messages for `toast.promise()`. The settled forms may be functions of the value. */
export interface ToastPromiseMessages<T> {
  pending: string
  success: string | ((result: T) => string)
  error: string | ((error: unknown) => string)
}

/**
 * Hand every `toast.*` call to another notification library instead.
 *
 * `component` is rendered by `<VddToasts>` in place of the built-in list; `null` means the
 * adapter owns its own DOM and `<VddToasts>` renders nothing at all.
 */
export interface ToastAdapter {
  show(id: string, message: string, options: ResolvedToastOptions): void
  update(id: string, message: string, patch: Partial<ResolvedToastOptions>): void
  /** With no id, dismiss everything. */
  dismiss(id?: string): void
  component: Component | null
}

/** The live queue. Exported for `<VddToasts>` and for tests; applications use `toast`. */
export const toastQueue = reactive<{ items: ToastRecord[]; adapter: ToastAdapter | null }>({
  items: [],
  adapter: null,
})

let counter = 0

function show(message: string, options: ToastOptions = {}): string {
  const id = options.id ?? `vdd-toast-${++counter}`
  const resolved = { ...options, id }

  const existing = toastQueue.items.find(t => t.id === id)
  if (existing) {
    // Dedup: update in place rather than stacking a second copy. Also the path
    // `toast.promise()` takes when the promise settles.
    existing.message = message
    existing.options = { ...existing.options, ...resolved }
    existing.exiting = false
    existing.revision++
    toastQueue.adapter?.update(id, message, resolved as Partial<ResolvedToastOptions>)
    return id
  }

  toastQueue.items.push({ id, message, options: resolved, exiting: false, revision: 0 })
  return id
}

/** Begin the exit transition. `<VddToasts>` removes the record when it finishes. */
export function startExit(id: string): void {
  const item = toastQueue.items.find(t => t.id === id)
  if (!item || item.exiting) return
  item.exiting = true
  item.options.onClose?.()
}

/** Drop a record outright — called once its exit transition has ended. */
export function removeToast(id: string): void {
  const index = toastQueue.items.findIndex(t => t.id === id)
  if (index !== -1) toastQueue.items.splice(index, 1)
}

/**
 * Dismiss one toast, or all of them.
 *
 * This only *marks* — the exit transition and the record's eventual removal belong to
 * `<VddToasts>`, which is the only thing that knows whether a given toast is on screen at
 * all or still queued behind `maxVisible`. A queued toast has nothing to animate away, so
 * the container drops it outright.
 */
function dismiss(id?: string): void {
  if (toastQueue.adapter) { toastQueue.adapter.dismiss(id); return }
  if (id === undefined) {
    for (const t of [...toastQueue.items]) startExit(t.id)
    return
  }
  startExit(id)
}

export interface ToastFunction {
  (message: string, options?: ToastOptions): string
  info(message: string, options?: ToastOptions): string
  success(message: string, options?: ToastOptions): string
  warning(message: string, options?: ToastOptions): string
  error(message: string, options?: ToastOptions): string
  /** Dismiss one toast, or all of them when called with no id. */
  dismiss(id?: string): void
  /**
   * Track a promise: a sticky "pending" toast immediately, updated in place on settlement.
   * Returns the same promise, so it can be dropped into an existing chain.
   */
  promise<T>(promise: Promise<T>, messages: ToastPromiseMessages<T>, options?: ToastOptions): Promise<T>
}

/**
 * Show a notification, from anywhere — a component, a store, a service, an interceptor.
 *
 * Mount `<VddToasts>` once to render them. Calling with none mounted is not an error: the
 * toast sits in the queue and appears if a container mounts later.
 *
 * ```ts
 * toast.success('Layout saved')
 * toast.error('Upload failed', { duration: 0 })     // sticky
 * await toast.promise(save(), { pending: 'Saving…', success: 'Saved', error: 'Failed' })
 * ```
 */
export const toast: ToastFunction = Object.assign(
  (message: string, options?: ToastOptions) => show(message, options),
  {
    info: (message: string, options?: ToastOptions) => show(message, { ...options, type: 'info' }),
    success: (message: string, options?: ToastOptions) => show(message, { ...options, type: 'success' }),
    warning: (message: string, options?: ToastOptions) => show(message, { ...options, type: 'warning' }),
    error: (message: string, options?: ToastOptions) => show(message, { ...options, type: 'error' }),
    dismiss,
    promise<T>(promise: Promise<T>, messages: ToastPromiseMessages<T>, options?: ToastOptions): Promise<T> {
      const id = show(messages.pending, { ...options, type: 'info', duration: 0 })
      promise.then(
        (result) => {
          const text = typeof messages.success === 'function' ? messages.success(result) : messages.success
          show(text, { ...options, id, type: 'success', duration: options?.duration ?? 5000 })
        },
        (error: unknown) => {
          const text = typeof messages.error === 'function' ? messages.error(error) : messages.error
          show(text, { ...options, id, type: 'error', duration: options?.duration ?? 5000 })
        },
      )
      return promise
    },
  },
)

/** Empty the queue with no animation. For tests and for a full application teardown. */
export function resetToasts(): void {
  toastQueue.items.splice(0)
  toastQueue.adapter = null
}
