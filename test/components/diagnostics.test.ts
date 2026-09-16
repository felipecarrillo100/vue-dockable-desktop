/**
 * The two diagnostics, and `useColorScheme()`.
 *
 * A port of rdd's `V3Diagnostics.test.tsx` (7 tests) and `useColorScheme.test.tsx` (5),
 * names preserved. Both diagnostics exist for the same reason: the failure they describe
 * produces a black rectangle and **no error anywhere**, which is the worst kind of first hour
 * with a library. Each is development-only, so a production build carries neither.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import { useColorScheme } from '../../src/composables/useColorScheme'

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.querySelectorAll('.vdd-panel-store, .vdd-panel-mount').forEach(el => el.remove())
  document.documentElement.removeAttribute('data-color-scheme')
  document.body.innerHTML = ''
})

const Panel = defineComponent({ name: 'Panel', setup: () => () => h('div', 'panel') })

const mountDesktop = () => {
  const ws = createWorkspace({ panels: { map: { component: Panel } } })
  const wrapper = mount(VddDesktop, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
  mounted.push(wrapper)
  return { ws, wrapper }
}

// ─── C5: the stylesheet sentinel ─────────────────────────────────────────────

describe('C5: the stylesheet sentinel (--vdd-styles-loaded)', () => {
  let original: typeof getComputedStyle
  let value = ''

  beforeEach(() => {
    original = globalThis.getComputedStyle
    // jsdom loads no stylesheet, so the sentinel is genuinely absent here — which is the
    // very case being detected. The proxy is for asserting the *present* case.
    globalThis.getComputedStyle = ((el: Element) => {
      const real = original(el)
      return new Proxy(real, {
        get(target, prop) {
          if (prop === 'getPropertyValue') {
            return (name: string) =>
              name === '--vdd-styles-loaded' ? value : target.getPropertyValue(name)
          }
          return Reflect.get(target, prop)
        },
      })
    }) as typeof getComputedStyle
  })

  afterEach(() => { globalThis.getComputedStyle = original })

  it('emits console.error when the sentinel is absent', () => {
    value = ''
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mountDesktop()
      expect(error.mock.calls.some(c => String(c[0]).includes('stylesheet is not imported'))).toBe(true)
    } finally {
      error.mockRestore()
    }
  })

  it('does NOT emit console.error when the sentinel is present', () => {
    value = '1'
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mountDesktop()
      expect(error.mock.calls.some(c => String(c[0]).includes('stylesheet is not imported'))).toBe(false)
    } finally {
      error.mockRestore()
    }
  })

  it('the message includes the exact import statement to paste', () => {
    value = ''
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mountDesktop()
      const message = error.mock.calls.map(c => String(c[0])).find(m => m.includes('stylesheet is not imported'))
      expect(message).toBeDefined()
      // The whole point of the diagnostic is that the fix is copy-pasteable.
      expect(message).toContain("import 'vue-dockable-desktop/styles.css'")
    } finally {
      error.mockRestore()
    }
  })

  it('is development-only', () => {
    value = ''
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mountDesktop()
      expect(error.mock.calls.some(c => String(c[0]).includes('stylesheet is not imported'))).toBe(false)
    } finally {
      error.mockRestore()
      process.env.NODE_ENV = originalEnv
    }
  })
})

// ─── C6: the zero-height warning ─────────────────────────────────────────────

describe('C6: the zero-height warning', () => {
  let trigger: ((height: number) => void) | null = null
  let original: typeof ResizeObserver
  let originalEnv: string | undefined

  beforeEach(() => {
    original = globalThis.ResizeObserver
    originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) {
        trigger = (height: number) =>
          cb([{ contentRect: { height, width: 1024 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    globalThis.ResizeObserver = original
    process.env.NODE_ENV = originalEnv
    trigger = null
  })

  const zeroHeight = () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mountDesktop()
    return { warn, messages: () => warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('no height')) }
  }

  it('emits console.warn when the observer reports a height of 0', async () => {
    const { warn, messages } = zeroHeight()
    try {
      await nextTick()
      expect(trigger).not.toBeNull()
      trigger!(0)
      expect(messages()).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('warns only once, however many times the observer reports zero', async () => {
    const { warn, messages } = zeroHeight()
    try {
      await nextTick()
      trigger!(0)
      trigger!(0)
      trigger!(0)
      expect(messages()).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('the message explains the CSS height-inheritance rule and names where it breaks', async () => {
    const { warn, messages } = zeroHeight()
    try {
      await nextTick()
      trigger!(0)
      const message = messages()[0]!
      // The cause is always the same, and saying it is the whole value of the warning.
      expect(message).toContain('height: 100%')
      expect(message).toContain('Zero height starts at:')
      expect(message).toContain('.vdd-fill-viewport')
    } finally {
      warn.mockRestore()
    }
  })

  it('does NOT warn when the workspace has a positive height', async () => {
    const { warn, messages } = zeroHeight()
    try {
      await nextTick()
      trigger!(600)
      expect(messages()).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })

  it('is development-only', async () => {
    process.env.NODE_ENV = 'production'
    const { warn, messages } = zeroHeight()
    try {
      await nextTick()
      trigger!(0)
      expect(messages()).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })
})

// ─── useColorScheme ──────────────────────────────────────────────────────────

describe('useColorScheme', () => {
  let scheme: ReturnType<typeof useColorScheme>

  const probe = () => {
    const wrapper = mount(defineComponent({
      setup() { scheme = useColorScheme(); return () => h('div', scheme.value) },
    })) as VueWrapper
    mounted.push(wrapper)
    return wrapper
  }

  /** The attribute is the contract, so a change has to reach the ref through the DOM. */
  const setScheme = async (value: string | null) => {
    if (value === null) document.documentElement.removeAttribute('data-color-scheme')
    else document.documentElement.setAttribute('data-color-scheme', value)
    // A MutationObserver delivers on a microtask.
    await Promise.resolve()
    await nextTick()
  }

  it('CS1: returns "dark" with no attribute set', () => {
    probe()
    expect(scheme.value).toBe('dark')
  })

  it('CS2: reads an existing attribute on first evaluation', () => {
    document.documentElement.setAttribute('data-color-scheme', 'light')
    probe()
    expect(scheme.value).toBe('light')
  })

  it('CS3: follows attribute changes, both ways', async () => {
    probe()
    expect(scheme.value).toBe('dark')
    await setScheme('light')
    expect(scheme.value).toBe('light')
    await setScheme('dark')
    expect(scheme.value).toBe('dark')
  })

  it('CS4: any value other than "light" reads as dark', async () => {
    probe()
    for (const value of ['sepia', 'DARK', '', 'Light']) {
      await setScheme(value)
      expect(scheme.value, value).toBe('dark')
    }
    // ...and removing it entirely is also dark, so there is no third state to handle.
    await setScheme(null)
    expect(scheme.value).toBe('dark')
  })

  it('CS5: stops following once the component is unmounted', async () => {
    const wrapper = probe()
    const ref = scheme
    await setScheme('light')
    expect(ref.value).toBe('light')

    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    await setScheme('dark')
    // The observer is disconnected with the scope, so the ref is frozen at its last value
    // rather than leaking an observer for the life of the page.
    expect(ref.value).toBe('light')
  })
})
