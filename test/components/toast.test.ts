/**
 * The `toast` singleton and `<VddToasts>`.
 *
 * A port of rdd's `Toast.test.tsx` (16 tests, T1–T13, names preserved). The public API is
 * unchanged — `toast.info()`, `toast.promise()`, `toast.dismiss()` — but what is behind it
 * is not: rdd routed every call through an event emitter that the container subscribed to,
 * because React state cannot live at module scope. In Vue the queue *is* module-level
 * reactive state (docs/decisions/0004), so there is nothing to emit.
 *
 * Two of those tests change shape because of it, and say so at the test: T1 can now assert
 * that a toast raised with no container mounted is *kept* rather than merely not throwing,
 * and T10's queue is a `computed` slice rather than a second array, so promotion is asserted
 * as state rather than as the result of an imperative shift.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import VddToasts from '../../src/components/VddToasts.vue'
import { toast, toastQueue, resetToasts } from '../../src/core/toast'

const mounted: VueWrapper[] = []

type ToastsProps = Record<string, unknown>
function mountContainer(props: ToastsProps = {}) {
  const wrapper = mount(VddToasts, { props: props as never, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  resetToasts()
  document.querySelectorAll('[data-vdd-toasts]').forEach(el => el.remove())
  document.body.innerHTML = ''
  vi.clearAllTimers()
  vi.useRealTimers()
})

const cards = () => Array.from(document.querySelectorAll('.vdd-toast')) as HTMLElement[]
const host = () => document.querySelector('[data-vdd-toasts]')
/** Let the timers fire, then let Vue patch, then let the exit fallback fire. */
const settle = async () => {
  await nextTick()
  await nextTick()
}

// ─── T1 ──────────────────────────────────────────────────────────────────────

describe('T1: toast.* without a mounted container', () => {
  it('does not throw when no container is mounted, and keeps the notification queued', () => {
    expect(() => {
      toast.info('no container')
      toast.success('ok')
      toast.warning('warn')
      toast.error('err')
    }).not.toThrow()
    // rdd's emitter had no subscriber, so these four calls went nowhere. The queue is state
    // here, so they are still pending — a container mounted later shows them.
    expect(toastQueue.items).toHaveLength(4)
    expect(() => toast.dismiss()).not.toThrow()
  })
})

// ─── T2 ──────────────────────────────────────────────────────────────────────

describe('T2: the container renders a toast', () => {
  it('adds .vdd-toast--info to the document', async () => {
    mountContainer()
    toast.info('hello')
    await settle()
    expect(document.querySelector('.vdd-toast--info')).not.toBeNull()
    // Teleported to the body, so the container's own place in the tree cannot clip it.
    expect(host()!.parentElement).toBe(document.body)
  })
})

// ─── T3 ──────────────────────────────────────────────────────────────────────

describe('T3: toast type modifier classes', () => {
  it('toast.success adds .vdd-toast--success', async () => {
    mountContainer()
    toast.success('yes')
    await settle()
    expect(document.querySelector('.vdd-toast--success')).not.toBeNull()
  })

  it('toast.warning adds .vdd-toast--warning', async () => {
    mountContainer()
    toast.warning('careful')
    await settle()
    expect(document.querySelector('.vdd-toast--warning')).not.toBeNull()
  })

  it('toast.error adds .vdd-toast--error', async () => {
    mountContainer()
    toast.error('broken')
    await settle()
    expect(document.querySelector('.vdd-toast--error')).not.toBeNull()
  })
})

// ─── T4 ──────────────────────────────────────────────────────────────────────

describe('T4: toast message text', () => {
  it('renders the supplied message string inside .vdd-toast__body', async () => {
    mountContainer()
    toast.info('Layout saved')
    await settle()
    expect(document.querySelector('.vdd-toast__body')!.textContent).toContain('Layout saved')
  })
})

// ─── T5 ──────────────────────────────────────────────────────────────────────

describe('T5: the close button dismisses', () => {
  it('clicking .vdd-toast__close removes the toast (starts exit)', async () => {
    mountContainer({ defaultDuration: 0, animation: 'none' })
    toast.info('closable')
    await settle()
    expect(cards()).toHaveLength(1)

    document.querySelector<HTMLButtonElement>('.vdd-toast__close')!.click()
    await settle()
    expect(cards()).toHaveLength(0)
    expect(toastQueue.items).toHaveLength(0)
  })
})

// ─── T6 ──────────────────────────────────────────────────────────────────────

describe('T6: toast.dismiss(id) — targeted', () => {
  it('removes only the toast with the specified id', async () => {
    mountContainer({ defaultDuration: 0, animation: 'none' })
    toast.info('one', { id: 'a' })
    toast.info('two', { id: 'b' })
    await settle()
    expect(cards()).toHaveLength(2)

    toast.dismiss('a')
    await settle()
    expect(cards()).toHaveLength(1)
    expect(host()!.textContent).toContain('two')
    expect(host()!.textContent).not.toContain('one')
  })
})

// ─── T7 ──────────────────────────────────────────────────────────────────────

describe('T7: toast.dismiss() — dismiss all', () => {
  it('removes all active toasts', async () => {
    mountContainer({ defaultDuration: 0, animation: 'none' })
    toast.info('one')
    toast.success('two')
    toast.error('three')
    await settle()
    expect(cards()).toHaveLength(3)

    toast.dismiss()
    await settle()
    expect(cards()).toHaveLength(0)
  })
})

// ─── T8 ──────────────────────────────────────────────────────────────────────

describe('T8: sticky toast (duration=0)', () => {
  it('does not auto-dismiss after time passes', async () => {
    vi.useFakeTimers()
    mountContainer()
    toast.error('Sticky error', { duration: 0 })
    await settle()
    vi.advanceTimersByTime(10_000)
    await settle()
    expect(document.querySelector('.vdd-toast')).not.toBeNull()
  })
})

// ─── T9 ──────────────────────────────────────────────────────────────────────

describe('T9: auto-dismiss after the default duration', () => {
  it('removes the toast from the DOM after the configured duration plus the exit animation', async () => {
    vi.useFakeTimers()
    mountContainer({ defaultDuration: 50 })
    toast.info('auto')
    await settle()
    expect(document.querySelector('.vdd-toast')).not.toBeNull()

    vi.advanceTimersByTime(51)     // the auto-dismiss timer
    await settle()
    vi.advanceTimersByTime(521)    // the exit fallback, since jsdom runs no transitions
    await settle()

    expect(document.querySelector('.vdd-toast')).toBeNull()
  })
})

// ─── T10 ─────────────────────────────────────────────────────────────────────

describe('T10: the maxVisible queue', () => {
  it('queues the 3rd toast and promotes it when the 1st exits', async () => {
    // rdd kept the overflow in a second array and shifted from it when a toast finished
    // exiting. Here all three are in one queue and the container renders a slice, so
    // "promotion" is just the slice moving — which is why nothing needs to be triggered.
    mountContainer({ maxVisible: 2, defaultDuration: 0, animation: 'none' })
    toast.info('first')
    toast.info('second')
    toast.info('third')
    await settle()

    expect(toastQueue.items).toHaveLength(3)
    expect(cards()).toHaveLength(2)
    expect(host()!.textContent).not.toContain('third')

    document.querySelector<HTMLButtonElement>('.vdd-toast__close')!.click()
    await settle()

    expect(cards()).toHaveLength(2)
    expect(host()!.textContent).toContain('third')
    expect(host()!.textContent).not.toContain('first')
  })
})

// ─── T11 ─────────────────────────────────────────────────────────────────────

describe('T11: toast.promise()', () => {
  it('shows pending text immediately, then updates to success on resolve', async () => {
    mountContainer()
    let resolve!: (value: string) => void
    const promise = new Promise<string>((res) => { resolve = res })

    toast.promise(promise, { pending: 'Saving…', success: r => `Saved: ${r}`, error: 'Failed' })
    await settle()
    expect(document.querySelector('.vdd-toast')!.textContent).toContain('Saving…')
    expect(document.querySelector('.vdd-toast--info')).not.toBeNull()

    resolve('file.txt')
    await promise
    await settle()

    expect(document.querySelector('.vdd-toast--success')).not.toBeNull()
    expect(document.querySelector('.vdd-toast')!.textContent).toContain('Saved: file.txt')
    // Updated in place, not stacked.
    expect(cards()).toHaveLength(1)
  })

  it('shows the error message when the promise rejects', async () => {
    mountContainer()
    const promise = Promise.reject(new Error('network error'))
    promise.catch(() => { /* asserted through the toast */ })

    toast.promise(promise, { pending: 'Loading…', success: 'Done', error: e => `Error: ${(e as Error).message}` })
    await settle()
    try { await promise } catch { /* expected */ }
    await settle()

    expect(document.querySelector('.vdd-toast--error')).not.toBeNull()
    expect(document.querySelector('.vdd-toast')!.textContent).toContain('Error: network error')
  })
})

// ─── T12 ─────────────────────────────────────────────────────────────────────

describe('T12: dedup by id', () => {
  it('re-calling toast.info with the same id updates in place, not duplicating', async () => {
    mountContainer()
    toast.info('Original message', { id: 'dedup-1', duration: 0 })
    await settle()
    expect(cards()).toHaveLength(1)
    expect(document.querySelector('.vdd-toast__body')!.textContent).toContain('Original message')

    toast.success('Updated message', { id: 'dedup-1', duration: 0 })
    await settle()
    expect(cards()).toHaveLength(1)
    expect(document.querySelector('.vdd-toast__body')!.textContent).toContain('Updated message')
    expect(document.querySelector('.vdd-toast--success')).not.toBeNull()
  })
})

// ─── T13 ─────────────────────────────────────────────────────────────────────

describe('T13: max-height re-syncs when content grows after mount', () => {
  it('updates max-height to the new, taller content height instead of staying locked at the first-render value', async () => {
    // The real bug: toast.promise() swapping a one-line "pending" for a wrapped error, with
    // the card still clipped to the height it had at mount. The card holds its own height
    // fixed, so it never reports a resize on its own — the observer watches the
    // unconstrained inner body as a trigger and reads the card's scrollHeight, which is the
    // only measurement that reports true content height through a stale cap.
    let trigger: (() => void) | null = null
    const original = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) { trigger = cb }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver

    try {
      mountContainer()
      toast.info('Working…', { id: 'grow-1', duration: 0 })
      await settle()

      const card = document.querySelector('.vdd-toast') as HTMLElement
      Object.defineProperty(card, 'scrollHeight', { configurable: true, value: 60 })
      trigger!()
      expect(card.style.maxHeight).toBe('60px')

      toast.error('This is a considerably longer error message that wraps onto more than one line.', { id: 'grow-1' })
      await settle()
      Object.defineProperty(card, 'scrollHeight', { configurable: true, value: 140 })

      // Without the re-measure, this stays at 60px and the wrapped text is clipped by
      // .vdd-toast's overflow: hidden.
      trigger!()
      expect(card.style.maxHeight).toBe('140px')
    } finally {
      globalThis.ResizeObserver = original
    }
  })
})
