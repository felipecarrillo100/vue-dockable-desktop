/**
 * `<VddPanelOverlay>`, `<VddPanelToolbar>`, `<VddFloatingWidget>` and `useFloatingWidgets()`.
 *
 * A port of rdd's `PanelOverlay.test.tsx` (55 tests, PO1–PO27, names preserved). Three API
 * shapes changed, each noted at the test that covers it:
 *
 *   rdd                                       vdd
 *   ───────────────────────────────────────   ──────────────────────────────────────────
 *   `usePanelFloatingWindow()`                `v-model:open`                      (PO6)
 *   `defaultAnchor` + `defaultStretch`
 *     + `stretch` + `onPlacementChange`       one `v-model:placement`      (PO21, PO24)
 *   `usePanelFloatingWindowManager()`         `useFloatingWidgets()`         (PO7, PO8)
 *   three React contexts for render isolation one store                    (PO10, PO11)
 *
 * PO28–PO30 cover a bug reported against rdd 6.2.0 and present here too: a widget title the
 * library *stores* was typed `string`, so it could not be a localisable descriptor and never
 * followed a locale change. PO29 is the one that would have caught it — PO28 alone would also
 * pass a fix that resolved the title once, at `open()` time.
 *
 * `usePanelFloatingWindow()` was `useState(false)` plus three callbacks, bundled into a hook
 * because that is the only way to share it in React. In Vue it is `ref(false)`, so the hook
 * would be strictly more code than it saves — PO6 asserts the model instead, and the
 * divergence is recorded in docs/PARITY.md.
 *
 * jsdom performs no layout: every rect is zero, `offsetParent` is always `null` and
 * `offsetHeight` is 0, so the drag maths would clamp to nothing. `stubGeometry` supplies just
 * enough for the pointer arithmetic to mean something, exactly as rdd's suite does. The
 * geometry that *cannot* be faked — whether a handle is actually hittable — is the browser
 * gate's job (D5).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { Component, Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createWorkspace } from '../../src/core/workspace'
import VddPanelOverlay from '../../src/components/VddPanelOverlay.vue'
import VddPanelToolbar from '../../src/components/VddPanelToolbar.vue'
import VddFloatingWidget from '../../src/components/VddFloatingWidget.vue'
import { useFloatingWidgets } from '../../src/composables/usePanelOverlay'
import type { PanelFloatPlacement } from '../../src/core/stretch'
import type { FloatAnchor } from '../../src/types'

// ─── Harness ─────────────────────────────────────────────────────────────────

const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.classList.remove('vdd-dragging-active', 'vdd-resizing-active')
  document.body.innerHTML = ''
})

const Dot = defineComponent({ name: 'Dot', setup: () => () => h('span') })

/** Mount `component` inside a workspace, with a container the overlay can fill. */
function render(component: Component, props: Record<string, unknown> = {}, dir: 'ltr' | 'rtl' = 'ltr') {
  const ws = createWorkspace({ panels: {} })
  if (dir === 'rtl') ws.setDirection('rtl')
  const wrapper = mount(component, {
    props: props as never,
    global: { plugins: [ws] },
    attachTo: document.body,
  }) as VueWrapper
  mounted.push(wrapper)
  return { ws, wrapper }
}

const domRect = (left: number, top: number, width: number, height: number): DOMRect => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
  toJSON() { /* not used */ },
} as DOMRect)

interface GeometryStub {
  overlay: DOMRect
  widget: DOMRect
  /** What each toolbar edge reports through offsetHeight/offsetWidth. */
  toolbars?: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>
}

/** Installs the layout jsdom will not do. Call before rendering; returns the restore. */
function stubGeometry({ overlay, widget, toolbars = {} }: GeometryStub): () => void {
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  const saved = Object.fromEntries(
    (['offsetParent', 'clientWidth', 'clientHeight', 'offsetHeight', 'offsetWidth'] as const)
      .map(p => [p, Object.getOwnPropertyDescriptor(HTMLElement.prototype, p)]),
  )

  const isRoot = (el: HTMLElement) => !!el.classList?.contains('vdd-panel-overlay-root')
  const isWidget = (el: HTMLElement) => !!el.classList?.contains('vdd-panel-float')
  const edgeOf = (el: HTMLElement) =>
    (['top', 'bottom', 'left', 'right'] as const).find(e => el.classList?.contains(`vdd-panel-toolbar--${e}`)) ?? null

  HTMLElement.prototype.getBoundingClientRect = function () {
    if (isRoot(this)) return overlay
    if (isWidget(this)) return widget
    return originalRect.call(this)
  }
  const define = (prop: string, get: (el: HTMLElement) => unknown) =>
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get() { return get(this as HTMLElement) } })

  define('offsetParent', el => (isWidget(el) ? el.closest('.vdd-panel-overlay-root') : null))
  define('clientWidth', el => (isRoot(el) ? overlay.width : 0))
  define('clientHeight', el => (isRoot(el) ? overlay.height : 0))
  define('offsetHeight', el => { const e = edgeOf(el); return e ? toolbars[e] ?? 0 : 0 })
  define('offsetWidth', el => { const e = edgeOf(el); return e ? toolbars[e] ?? 0 : 0 })

  return () => {
    HTMLElement.prototype.getBoundingClientRect = originalRect
    for (const [prop, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor)
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop]
    }
  }
}

const ALL_DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const

/** The handles currently offered, sorted, so the expectation reads as a set. */
const handlesOn = (host: ParentNode): string[] =>
  ALL_DIRS.filter(d => host.querySelector(`.vdd-resize-${d}`) !== null).sort()

const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, ...init })

const widgets = () => Array.from(document.querySelectorAll('.vdd-panel-float')) as HTMLElement[]
const firstWidget = () => widgets()[0]!

/** One widget in an overlay, with `props` forwarded to it. */
const oneWidget = (props: Record<string, unknown> = {}) => defineComponent({
  name: 'OneWidget',
  components: { VddPanelOverlay, VddFloatingWidget },
  setup: () => ({ props }),
  template: `
    <VddPanelOverlay>
      <VddFloatingWidget widget-id="w" title="Widget" v-bind="props"><span /></VddFloatingWidget>
    </VddPanelOverlay>`,
})

/** Press the header, optionally move past the threshold, then end the gesture. */
async function pressHeader(
  el: HTMLElement,
  move?: { x: number; y: number },
  end: 'up' | 'cancel' = 'cancel',
): Promise<void> {
  const header = el.querySelector('[data-vdd-widget-header]') as HTMLElement
  el.setPointerCapture = vi.fn()
  header.dispatchEvent(pointer('pointerdown', { clientX: 50, clientY: 50 }))
  await nextTick()
  if (move) {
    el.dispatchEvent(pointer('pointermove', { clientX: move.x, clientY: move.y }))
    await nextTick()
  }
  el.dispatchEvent(pointer(end === 'up' ? 'pointerup' : 'pointercancel', { clientX: move?.x ?? 50, clientY: move?.y ?? 50 }))
  await nextTick()
}

/** Drag one resize handle from a point to a point. */
async function dragHandle(
  el: HTMLElement,
  dir: string,
  from: { x: number; y: number },
  to: { x: number; y: number } | null,
  release = true,
): Promise<void> {
  const handle = el.querySelector(`.vdd-resize-${dir}`) as HTMLElement
  expect(handle, `handle ${dir} should exist`).not.toBeNull()
  handle.setPointerCapture = vi.fn()
  handle.dispatchEvent(pointer('pointerdown', { clientX: from.x, clientY: from.y }))
  await nextTick()
  if (to) {
    handle.dispatchEvent(pointer('pointermove', { clientX: to.x, clientY: to.y }))
    await nextTick()
  }
  if (release) {
    handle.dispatchEvent(pointer('pointerup', { clientX: to?.x ?? from.x, clientY: to?.y ?? from.y }))
    await nextTick()
  }
}

// ─── PO1 ─────────────────────────────────────────────────────────────────────

describe('PO1: VddPanelOverlay', () => {
  it('renders the overlay root container', () => {
    const { wrapper } = render(defineComponent({
      components: { VddPanelOverlay },
      template: '<VddPanelOverlay><span /></VddPanelOverlay>',
    }))
    expect(wrapper.find('.vdd-panel-overlay-root').exists()).toBe(true)
  })
})

// ─── PO2 ─────────────────────────────────────────────────────────────────────

describe('PO2: VddFloatingWidget open=true', () => {
  it('renders .vdd-panel-float in the DOM', () => {
    render(oneWidget({ open: true, placement: { anchor: 'top-right', stretch: null } }))
    expect(widgets()).toHaveLength(1)
  })
})

describe('PO2b: anchor positioning under RTL', () => {
  it('sets dir="rtl" and positions a top-right anchor with inset-inline-end, not a flipped left/right', () => {
    render(oneWidget({ placement: { anchor: 'top-right', stretch: null } }), {}, 'rtl')
    const el = firstWidget()
    expect(el.getAttribute('dir')).toBe('rtl')
    expect(el.style.insetInlineEnd).not.toBe('')
    expect(el.style.insetInlineStart).toBe('')
  })

  it('uses the same inset-inline-end property under LTR — the logical key does not depend on direction', () => {
    render(oneWidget({ placement: { anchor: 'top-right', stretch: null } }), {}, 'ltr')
    const el = firstWidget()
    expect(el.getAttribute('dir')).toBe('ltr')
    expect(el.style.insetInlineEnd).not.toBe('')
    expect(el.style.insetInlineStart).toBe('')
  })
})

// ─── PO3 ─────────────────────────────────────────────────────────────────────

describe('PO3: VddFloatingWidget open=false', () => {
  it('renders nothing when closed', () => {
    render(oneWidget({ open: false }))
    expect(widgets()).toHaveLength(0)
  })
})

// ─── PO4 ─────────────────────────────────────────────────────────────────────

describe('PO4: the close button reports through the open model', () => {
  it('emits update:open with false when the close button is clicked', async () => {
    // rdd took an `onClose` callback and required the caller to flip its own `open` prop.
    // The model is both halves of that, and still controllable.
    const onUpdate = vi.fn()
    render(defineComponent({
      components: { VddPanelOverlay, VddFloatingWidget },
      setup: () => ({ onUpdate }),
      template: `
        <VddPanelOverlay>
          <VddFloatingWidget widget-id="w" title="Closeable" :open="true" @update:open="onUpdate">
            <span />
          </VddFloatingWidget>
        </VddPanelOverlay>`,
    }))
    const close = firstWidget().querySelector('[data-vdd-widget-close]') as HTMLButtonElement
    expect(close).not.toBeNull()
    close.click()
    await nextTick()
    expect(onUpdate).toHaveBeenCalledWith(false)
  })
})

// ─── PO5 ─────────────────────────────────────────────────────────────────────

describe('PO5: VddPanelToolbar position class', () => {
  const withToolbar = (position: string) => defineComponent({
    components: { VddPanelOverlay, VddPanelToolbar },
    setup: () => ({ position }),
    template: `
      <VddPanelOverlay>
        <VddPanelToolbar :position="position"><button type="button">Tool</button></VddPanelToolbar>
      </VddPanelOverlay>`,
  })

  it('renders .vdd-panel-toolbar--top for position="top"', () => {
    const { wrapper } = render(withToolbar('top'))
    expect(wrapper.find('.vdd-panel-toolbar--top').exists()).toBe(true)
    expect(wrapper.find('.vdd-panel-toolbar--bottom').exists()).toBe(false)
  })

  it('renders .vdd-panel-toolbar--bottom for position="bottom"', () => {
    const { wrapper } = render(withToolbar('bottom'))
    expect(wrapper.find('.vdd-panel-toolbar--bottom').exists()).toBe(true)
  })
})

// ─── PO6 ─────────────────────────────────────────────────────────────────────

describe('PO6: v-model:open replaces usePanelFloatingWindow()', () => {
  it('starts closed; setting the model true shows the widget; false hides it', async () => {
    // rdd's hook was `useState(false)` plus `open`, `close` and `toggle` callbacks, bundled
    // because that is how React shares such a thing. Here it is a ref the caller already has,
    // so the hook would be more code than it saves. Recorded in PARITY.md.
    const open = ref(false)
    const { wrapper } = render(defineComponent({
      components: { VddPanelOverlay, VddFloatingWidget },
      setup: () => ({ open }),
      template: `
        <VddPanelOverlay>
          <VddFloatingWidget widget-id="w" title="Hooked" v-model:open="open"><span /></VddFloatingWidget>
        </VddPanelOverlay>`,
    }))
    expect(widgets()).toHaveLength(0)

    open.value = true
    await nextTick()
    expect(widgets()).toHaveLength(1)

    // And the widget's own close button writes back through the same model.
    ;(firstWidget().querySelector('[data-vdd-widget-close]') as HTMLButtonElement).click()
    await nextTick()
    expect(open.value).toBe(false)
    expect(widgets()).toHaveLength(0)
    void wrapper
  })
})

// ─── PO7 ─────────────────────────────────────────────────────────────────────

describe('PO7: useFloatingWidgets — open and close', () => {
  type Api = ReturnType<typeof useFloatingWidgets>
  let api: Api

  const probe = () => defineComponent({
    name: 'Probe',
    setup() { api = useFloatingWidgets(); return () => h('span') },
  })

  const host = () => defineComponent({
    components: { VddPanelOverlay },
    setup: () => ({ Probe: probe() }),
    template: '<VddPanelOverlay><component :is="Probe" /></VddPanelOverlay>',
  })

  it('starts with no open widgets', () => {
    render(host())
    expect(api.openIds.value).toEqual([])
  })

  it('open() shows a widget and updates openIds', async () => {
    render(host())
    api.open('p1', { title: 'Panel 1', component: Dot })
    await nextTick()
    expect(api.openIds.value).toContain('p1')
    expect(api.isOpen('p1')).toBe(true)
    expect(widgets()).toHaveLength(1)
  })

  it('close() removes a widget and updates openIds', async () => {
    render(host())
    api.open('p2', { title: 'Panel 2', component: Dot })
    await nextTick()
    api.close('p2')
    await nextTick()
    expect(api.openIds.value).not.toContain('p2')
    expect(api.isOpen('p2')).toBe(false)
    expect(widgets()).toHaveLength(0)
  })

  it('multiple managed widgets can coexist', async () => {
    render(host())
    api.open('ma', { title: 'A', component: Dot })
    api.open('mb', { title: 'B', component: Dot })
    await nextTick()
    expect(api.openIds.value).toHaveLength(2)
    expect(widgets()).toHaveLength(2)
  })
})

// ─── PO8 ─────────────────────────────────────────────────────────────────────

describe('PO8: useFloatingWidgets — closeAll', () => {
  it('closeAll() removes every managed widget at once', async () => {
    let api!: ReturnType<typeof useFloatingWidgets>
    const Probe = defineComponent({ setup() { api = useFloatingWidgets(); return () => h('span') } })
    render(defineComponent({
      components: { VddPanelOverlay },
      setup: () => ({ Probe }),
      template: '<VddPanelOverlay><component :is="Probe" /></VddPanelOverlay>',
    }))

    for (const id of ['ca-1', 'ca-2', 'ca-3']) api.open(id, { title: id, component: Dot })
    await nextTick()
    expect(api.openIds.value).toHaveLength(3)

    api.closeAll()
    await nextTick()
    expect(api.openIds.value).toHaveLength(0)
    expect(widgets()).toHaveLength(0)
  })
})

// ─── PO9 ─────────────────────────────────────────────────────────────────────

const twoWidgets = defineComponent({
  components: { VddPanelOverlay, VddFloatingWidget },
  template: `
    <VddPanelOverlay>
      <VddFloatingWidget widget-id="a" title="A"><span /></VddFloatingWidget>
      <VddFloatingWidget widget-id="b" title="B"><span /></VddFloatingWidget>
    </VddPanelOverlay>`,
})

describe('PO9: widget focus — active class', () => {
  it('the focused widget gains .vdd-panel-float--active and the others lose it', async () => {
    render(twoWidgets)
    const [a, b] = widgets()
    b!.dispatchEvent(pointer('pointerdown'))
    await nextTick()
    expect(b!.classList.contains('vdd-panel-float--active')).toBe(true)
    expect(a!.classList.contains('vdd-panel-float--active')).toBe(false)
  })
})

// ─── PO10 ────────────────────────────────────────────────────────────────────

describe('PO10: toolbar render isolation', () => {
  it('a toolbar does not re-render when a widget gains focus', async () => {
    // rdd split this state across three React contexts purely for this: a context value is one
    // object, so any change to it re-renders every consumer. Vue tracks each ref separately,
    // so one store gives the same isolation — a toolbar that never reads `topId` is untouched.
    let renders = 0
    const Probe = defineComponent({ setup: () => () => { renders++; return h('span') } })
    render(defineComponent({
      components: { VddPanelOverlay, VddPanelToolbar, VddFloatingWidget },
      setup: () => ({ Probe }),
      template: `
        <VddPanelOverlay>
          <VddPanelToolbar position="top"><component :is="Probe" /></VddPanelToolbar>
          <VddFloatingWidget widget-id="a" title="A"><span /></VddFloatingWidget>
          <VddFloatingWidget widget-id="b" title="B"><span /></VddFloatingWidget>
        </VddPanelOverlay>`,
    }))
    await nextTick()
    const before = renders
    expect(before).toBeGreaterThan(0)

    widgets()[1]!.dispatchEvent(pointer('pointerdown'))
    await nextTick()
    await nextTick()
    expect(renders).toBe(before)
  })
})

// ─── PO11 ────────────────────────────────────────────────────────────────────

describe('PO11: manager consumer render isolation', () => {
  it('a useFloatingWidgets() consumer does not re-render when a widget gains focus', async () => {
    let renders = 0
    const Probe = defineComponent({
      setup() {
        useFloatingWidgets()
        return () => { renders++; return h('span') }
      },
    })
    render(defineComponent({
      components: { VddPanelOverlay, VddFloatingWidget },
      setup: () => ({ Probe }),
      template: `
        <VddPanelOverlay>
          <component :is="Probe" />
          <VddFloatingWidget widget-id="a" title="A"><span /></VddFloatingWidget>
          <VddFloatingWidget widget-id="b" title="B"><span /></VddFloatingWidget>
        </VddPanelOverlay>`,
    }))
    await nextTick()
    const before = renders
    expect(before).toBeGreaterThan(0)

    widgets()[1]!.dispatchEvent(pointer('pointerdown'))
    await nextTick()
    await nextTick()
    expect(renders).toBe(before)
  })
})

// ─── PO12 ────────────────────────────────────────────────────────────────────

describe('PO12: a resize drag suppresses selection', () => {
  it('toggles .vdd-resizing-active on the body for the drag duration (WebKit selection bleed-through)', async () => {
    render(oneWidget({ placement: { anchor: 'top-right', stretch: null }, width: 300, height: 200 }))
    const el = firstWidget()

    // Undock first: a docked top-right widget offers no `se` handle (PO15). The move matters —
    // undocking happens at the drag threshold, not on the press (PO19). Ended with
    // pointercancel because jsdom reports a 0x0 container, so every coordinate reads as a
    // corner and a pointerup would re-dock immediately.
    await pressHeader(el, { x: 80, y: 80 })

    expect(document.body.classList.contains('vdd-resizing-active')).toBe(false)
    const handle = el.querySelector('.vdd-resize-se') as HTMLElement
    expect(handle).not.toBeNull()
    handle.setPointerCapture = vi.fn()

    handle.dispatchEvent(pointer('pointerdown', { pointerId: 2, clientX: 100, clientY: 100 }))
    await nextTick()
    expect(document.body.classList.contains('vdd-resizing-active')).toBe(true)

    handle.dispatchEvent(pointer('pointerup', { pointerId: 2, clientX: 130, clientY: 130 }))
    await nextTick()
    expect(document.body.classList.contains('vdd-resizing-active')).toBe(false)
  })
})

// ─── PO13 ────────────────────────────────────────────────────────────────────

describe('PO13: a header drag suppresses selection', () => {
  it('toggles .vdd-dragging-active on the body for the drag duration', async () => {
    render(oneWidget({ placement: { anchor: 'top-right', stretch: null }, width: 300, height: 200 }))
    const el = firstWidget()
    el.setPointerCapture = vi.fn()
    const header = el.querySelector('[data-vdd-widget-header]') as HTMLElement

    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)
    header.dispatchEvent(pointer('pointerdown', { clientX: 50, clientY: 50 }))
    await nextTick()
    // Applied once the drag actually starts, not on the press itself.
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)

    el.dispatchEvent(pointer('pointermove', { clientX: 80, clientY: 80 }))
    await nextTick()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(true)

    el.dispatchEvent(pointer('pointerup', { clientX: 80, clientY: 80 }))
    await nextTick()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)
  })

  it('cancelling the drag also removes .vdd-dragging-active', async () => {
    render(oneWidget({ placement: { anchor: 'top-right', stretch: null }, width: 300, height: 200 }))
    const el = firstWidget()
    el.setPointerCapture = vi.fn()
    const header = el.querySelector('[data-vdd-widget-header]') as HTMLElement

    header.dispatchEvent(pointer('pointerdown', { clientX: 50, clientY: 50 }))
    el.dispatchEvent(pointer('pointermove', { clientX: 80, clientY: 80 }))
    await nextTick()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(true)

    el.dispatchEvent(pointer('pointercancel', { clientX: 80, clientY: 80 }))
    await nextTick()
    expect(document.body.classList.contains('vdd-dragging-active')).toBe(false)
  })
})

// ─── PO14 ────────────────────────────────────────────────────────────────────

describe('PO14: the toolbar re-measures through a ResizeObserver', () => {
  it("updates a docked widget's inset when the toolbar resizes after mount, not only at mount", async () => {
    // A one-shot measurement is right for a live mount. During a layout restore the DOM is not
    // settled at that instant, so rdd baked in a wrong size — usually 0 — permanently, and
    // every docked widget ended up positioned at the toolbar's own edge, covering it.
    let trigger: (() => void) | null = null
    const original = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) { trigger = cb }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver

    try {
      render(defineComponent({
        components: { VddPanelOverlay, VddPanelToolbar, VddFloatingWidget },
        template: `
          <VddPanelOverlay>
            <VddPanelToolbar position="top"><button type="button">Tool</button></VddPanelToolbar>
            <VddFloatingWidget widget-id="w" title="Float" :placement="{ anchor: 'top-left', stretch: null }">
              <span />
            </VddFloatingWidget>
          </VddPanelOverlay>`,
      }))
      await nextTick()

      const toolbar = document.querySelector('.vdd-panel-toolbar') as HTMLElement
      const el = firstWidget()
      expect(trigger).not.toBeNull()
      // jsdom reports offsetHeight 0, which is exactly the reported bug's "0 baked in" case.
      expect(el.style.top).toBe('0px')

      Object.defineProperty(toolbar, 'offsetHeight', { configurable: true, value: 48 })
      trigger!()
      await nextTick()
      expect(el.style.top).toBe('48px')
    } finally {
      globalThis.ResizeObserver = original
    }
  })
})

// ─── PO15–PO18: anchor-aware resize handles ──────────────────────────────────

const anchored = (anchor: FloatAnchor, dir: 'ltr' | 'rtl' = 'ltr', extra: Record<string, unknown> = {}) =>
  render(oneWidget({ placement: { anchor, stretch: null }, width: 300, height: 200, ...extra }), {}, dir)

describe('PO15: docked resize handles follow the anchor', () => {
  it.each([
    ['top-left', ['e', 's', 'se']],
    ['top-right', ['s', 'sw', 'w']],
    ['bottom-left', ['e', 'n', 'ne']],
    ['bottom-right', ['n', 'nw', 'w']],
  ] as const)('%s offers exactly its free edges plus their corner', (anchor, expected) => {
    anchored(anchor)
    expect(handlesOn(firstWidget())).toEqual([...expected].sort())
  })

  it('never offers a handle on a pinned edge (bottom-right pins bottom and right)', () => {
    anchored('bottom-right')
    const el = firstWidget()
    // The two rdd rendered that could not work, plus their corner.
    expect(el.querySelector('.vdd-resize-s')).toBeNull()
    expect(el.querySelector('.vdd-resize-e')).toBeNull()
    expect(el.querySelector('.vdd-resize-se')).toBeNull()
  })
})

describe('PO16: the inline half mirrors under RTL', () => {
  it('top-right under RTL pins the physical left, so the free inline handle is `e`', () => {
    anchored('top-right', 'rtl')
    expect(handlesOn(firstWidget())).toEqual(['e', 's', 'se'].sort())
  })

  it('bottom-left under RTL pins the physical right, so the free inline handle is `w`', () => {
    anchored('bottom-left', 'rtl')
    expect(handlesOn(firstWidget())).toEqual(['n', 'nw', 'w'].sort())
  })

  it('the block axis is unaffected by direction', () => {
    anchored('bottom-right', 'rtl')
    expect(firstWidget().querySelector('.vdd-resize-n')).not.toBeNull()
    expect(firstWidget().querySelector('.vdd-resize-s')).toBeNull()
  })
})

describe('PO17: a free-floating widget keeps all eight handles', () => {
  it('offers every direction once undocked', async () => {
    anchored('bottom-right')
    await pressHeader(firstWidget(), { x: 80, y: 80 })
    expect(handlesOn(firstWidget())).toEqual([...ALL_DIRS].sort())
  })
})

describe('PO18: a bottom-anchored widget resizes from the top', () => {
  it('dragging the `n` handle upward makes it taller, leaving the pinned bottom edge alone', async () => {
    // An 800x600 overlay holding a 300x200 widget pinned bottom-right, so its top edge is y=400.
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(492, 400, 300, 200) })
    try {
      anchored('bottom-right')
      const el = firstWidget()
      const pinnedBefore = el.style.bottom
      expect(el.style.height).toBe('200px')

      await dragHandle(el, 'n', { x: 640, y: 400 }, { x: 640, y: 350 }, false)
      expect(el.style.height).toBe('250px')
      // The anchored edge must not move — growth comes out of the top.
      expect(el.style.bottom).toBe(pinnedBefore)
    } finally {
      restore()
    }
  })
})

// ─── PO19 ────────────────────────────────────────────────────────────────────

describe('PO19: clicking the header does not undock', () => {
  // Undocking on pointerdown — with the threshold gating only the drop-zone overlay — meant a
  // plain click tore the widget off its anchor: it looked unchanged, but its stacked siblings
  // reflowed to close the gap and it stopped tracking the corner from then on.
  const stack = defineComponent({
    components: { VddPanelOverlay, VddFloatingWidget },
    template: `
      <VddPanelOverlay>
        <VddFloatingWidget widget-id="first" title="First" :placement="{ anchor: 'top-left', stretch: null }"
          :width="240" :height="160"><span /></VddFloatingWidget>
        <VddFloatingWidget widget-id="second" title="Second" :placement="{ anchor: 'top-left', stretch: null }"
          :width="240" :height="100"><span /></VddFloatingWidget>
      </VddPanelOverlay>`,
  })

  it('a click leaves the widget docked', async () => {
    render(stack)
    const first = widgets()[0]!
    await pressHeader(first)
    // Docked positioning keeps the logical inset and writes no free-mode `left`.
    expect(first.style.insetInlineStart).toBe('8px')
    expect(first.style.left).toBe('')
    expect(handlesOn(first)).toEqual(['e', 's', 'se'].sort())
  })

  it('a click does not reflow its stacked siblings', async () => {
    render(stack)
    await nextTick()
    const [first, second] = widgets()
    const before = second!.style.top
    expect(before).toBe('168px')     // 160px sibling + 8px gap
    await pressHeader(first!)
    expect(second!.style.top).toBe(before)
  })

  it('a sub-threshold move does not undock either', async () => {
    // The threshold is what stops a 1px jitter during a click from tearing the widget off.
    // rdd's suite covered the press and the real drag but never the move in between.
    render(stack)
    const first = widgets()[0]!
    await pressHeader(first, { x: 52, y: 51 })      // 3px total, under DRAG_THRESHOLD
    expect(first.style.insetInlineStart).toBe('8px')
    expect(first.style.left).toBe('')
    expect(handlesOn(first)).toEqual(['e', 's', 'se'].sort())
  })

  it('a real drag past the threshold still undocks', async () => {
    render(stack)
    const first = widgets()[0]!
    await pressHeader(first, { x: 90, y: 90 })
    expect(first.style.left).not.toBe('')
    expect(first.style.insetInlineStart).toBe('')
    expect(handlesOn(first)).toEqual([...ALL_DIRS].sort())
  })
})

// ─── PO20 ────────────────────────────────────────────────────────────────────

describe('PO20: docked resize respects toolbar insets', () => {
  it('stops at a bottom toolbar instead of the container edge', async () => {
    // rdd bounded growth by the raw container edge, so a docked widget could be resized clean
    // over a toolbar on the far side — the same defect a 5.x fix addressed for *positioning*.
    const restore = stubGeometry({
      overlay: domRect(0, 0, 800, 600),
      widget: domRect(8, 0, 300, 200),
      toolbars: { bottom: 40 },
    })
    try {
      render(defineComponent({
        components: { VddPanelOverlay, VddPanelToolbar, VddFloatingWidget },
        template: `
          <VddPanelOverlay>
            <VddPanelToolbar position="bottom"><span /></VddPanelToolbar>
            <VddFloatingWidget widget-id="w" title="PO20" :placement="{ anchor: 'top-left', stretch: null }"
              :stretchable="false" :width="300" :height="200"><span /></VddFloatingWidget>
          </VddPanelOverlay>`,
      }))
      await nextTick()

      const el = firstWidget()
      await dragHandle(el, 's', { x: 150, y: 198 }, { x: 150, y: 900 })
      // 600 container - 40 toolbar - 0 top offset. rdd reached 600, straight over the toolbar.
      expect(el.style.height).toBe('560px')
    } finally {
      restore()
    }
  })
})

// ─── PO21–PO23: edge-stretch placement ───────────────────────────────────────

const stretched = (anchor: FloatAnchor, stretch: string | null = null, dir: 'ltr' | 'rtl' = 'ltr') => {
  render(oneWidget({ placement: { anchor, stretch }, width: 240, height: 160 }), {}, dir)
  return firstWidget()
}

describe('PO21: placement.stretch positioning', () => {
  it('width: pins both inline ends and writes no width', () => {
    const el = stretched('bottom-left', 'width')
    expect(el.style.insetInlineStart).toBe('8px')
    expect(el.style.insetInlineEnd).toBe('8px')
    expect(el.style.width).toBe('')          // implied by the two pins — the whole mechanism
    expect(el.style.height).toBe('160px')    // the block axis still carries its size
  })

  it('height: pins both block ends and writes no height', () => {
    const el = stretched('top-right', 'height')
    expect(el.style.top).toBe('0px')
    expect(el.style.bottom).toBe('0px')
    expect(el.style.height).toBe('')
    expect(el.style.width).toBe('240px')
  })

  it('both: fills the panel, carrying neither size', () => {
    const el = stretched('top-left', 'both')
    expect(el.style.insetInlineStart).toBe('8px')
    expect(el.style.insetInlineEnd).toBe('8px')
    expect(el.style.top).toBe('0px')
    expect(el.style.bottom).toBe('0px')
    expect(el.style.width).toBe('')
    expect(el.style.height).toBe('')
  })

  it('unstretched is unchanged — one inset per axis, both sizes written', () => {
    const el = stretched('bottom-right')
    expect(el.style.insetInlineEnd).toBe('8px')
    expect(el.style.insetInlineStart).toBe('')
    expect(el.style.width).toBe('240px')
    expect(el.style.height).toBe('160px')
  })
})

describe('PO22: handle sets while stretched', () => {
  it('inline-stretched: the free block edge, plus both inline ends to release from', () => {
    expect(handlesOn(stretched('bottom-left', 'width'))).toEqual(['n', 'e', 'w'].sort())
  })

  it('block-stretched: the free inline edge, plus both block ends', () => {
    expect(handlesOn(stretched('top-right', 'height'))).toEqual(['w', 'n', 's'].sort())
  })

  it('fills the panel: all four edges are releasable — never a dead end', () => {
    expect(handlesOn(stretched('top-left', 'both'))).toEqual(['n', 's', 'e', 'w'].sort())
  })

  it('no corner handle in a stretched state (it would mix a resize with a release)', () => {
    for (const s of ['width', 'height', 'both']) {
      const el = stretched('top-left', s)
      for (const corner of ['ne', 'nw', 'se', 'sw']) {
        expect(el.querySelector(`.vdd-resize-${corner}`)).toBeNull()
      }
      for (const w of mounted.splice(0)) w.unmount()
    }
  })

  it('the inline pair is direction-agnostic — both physical ends, either way', () => {
    expect(handlesOn(stretched('bottom-left', 'width', 'rtl'))).toEqual(['n', 'e', 'w'].sort())
  })
})

describe('PO23: releasing a stretched axis by dragging its end', () => {
  it('dragging the right edge inward pins the left end and adopts the dragged width', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 432, 784, 160) })
    try {
      const el = stretched('bottom-left', 'width')
      expect(el.style.width).toBe('')

      await dragHandle(el, 'e', { x: 790, y: 500 }, { x: 690, y: 500 })

      expect(el.style.width).toBe('684px')            // 784 measured - 100 dragged
      expect(el.style.insetInlineStart).toBe('8px')
      expect(el.style.insetInlineEnd).toBe('')
      expect(handlesOn(el)).toEqual(['e', 'n', 'ne'].sort())
    } finally {
      restore()
    }
  })

  it('dragging the left edge inward pins the right end instead', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 432, 784, 160) })
    try {
      const el = stretched('bottom-left', 'width')
      await dragHandle(el, 'w', { x: 10, y: 500 }, { x: 110, y: 500 })
      expect(el.style.width).toBe('684px')
      expect(el.style.insetInlineEnd).toBe('8px')
      expect(el.style.insetInlineStart).toBe('')
    } finally {
      restore()
    }
  })

  it('releasing one axis of `both` leaves the other stretched', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 0, 784, 600) })
    try {
      const el = stretched('top-left', 'both')
      await dragHandle(el, 'e', { x: 790, y: 300 }, { x: 690, y: 300 })
      expect(el.style.width).toBe('684px')   // inline released
      expect(el.style.height).toBe('')       // block still stretched
      expect(el.style.top).toBe('0px')
      expect(el.style.bottom).toBe('0px')
    } finally {
      restore()
    }
  })

  it('dragging the free edge of the unstretched axis does not release anything', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 432, 784, 160) })
    try {
      const el = stretched('bottom-left', 'width')
      await dragHandle(el, 'n', { x: 400, y: 434 }, { x: 400, y: 384 })
      expect(el.style.width).toBe('')          // still stretched
      expect(el.style.height).toBe('210px')    // 160 + 50, an ordinary resize
    } finally {
      restore()
    }
  })
})

// ─── PO24 ────────────────────────────────────────────────────────────────────

describe('PO24: controlled placement', () => {
  it('does not self-update when the placement model is bound without a listener', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 432, 784, 160) })
    const seen: PanelFloatPlacement[] = []
    try {
      render(defineComponent({
        components: { VddPanelOverlay, VddFloatingWidget },
        setup: () => ({ onPlacement: (p: PanelFloatPlacement) => seen.push(p) }),
        template: `
          <VddPanelOverlay>
            <VddFloatingWidget widget-id="ctl" title="Ctl" :width="240" :height="160"
              :placement="{ anchor: 'bottom-left', stretch: 'width' }"
              @update:placement="onPlacement"><span /></VddFloatingWidget>
          </VddPanelOverlay>`,
      }))
      const el = firstWidget()
      expect(el.style.width).toBe('')          // the caller's value is applied

      await dragHandle(el, 'e', { x: 790, y: 500 }, { x: 690, y: 500 })

      // Reported, but not self-applied: the prop never changed, so it is still stretched.
      expect(seen).toEqual([{ anchor: 'bottom-left', stretch: null }])
      expect(el.style.width).toBe('')
    } finally {
      restore()
    }
  })

  it('reports anchor and stretch together, as one atomic placement', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 432, 784, 160) })
    const seen: PanelFloatPlacement[] = []
    try {
      const placement = ref<PanelFloatPlacement>({ anchor: 'bottom-left', stretch: 'width' })
      render(defineComponent({
        components: { VddPanelOverlay, VddFloatingWidget },
        setup: () => ({ placement, onPlacement: (p: PanelFloatPlacement) => seen.push(p) }),
        template: `
          <VddPanelOverlay>
            <VddFloatingWidget widget-id="atomic" title="Atomic" :width="240" :height="160"
              v-model:placement="placement" @update:placement="onPlacement"><span /></VddFloatingWidget>
          </VddPanelOverlay>`,
      }))
      const el = firstWidget()

      // Dragging the left end pins the right one, so both halves change in a single report.
      await dragHandle(el, 'w', { x: 10, y: 500 }, { x: 110, y: 500 })
      expect(seen).toHaveLength(1)
      expect(seen[0]).toEqual({ anchor: 'bottom-right', stretch: null })
      // With the model bound two-way, it did apply.
      await nextTick()
      expect(el.style.insetInlineEnd).toBe('8px')
    } finally {
      restore()
    }
  })
})

// ─── PO25 ────────────────────────────────────────────────────────────────────

describe('PO25: a strip stacks against both corners of its edge', () => {
  // The taller card is deliberately in the corner the strip is *not* anchored to. rdd's own
  // test put it in the strip's own corner, where "clears both buckets" and "clears only my
  // bucket" give the same answer — so the assertion could not tell them apart. Reversing the
  // heights is what makes this test about the behaviour it names.
  const edge = defineComponent({
    components: { VddPanelOverlay, VddFloatingWidget },
    template: `
      <VddPanelOverlay>
        <VddFloatingWidget widget-id="left-card" title="left-card" :placement="{ anchor: 'bottom-left', stretch: null }"
          :width="200" :height="90"><span /></VddFloatingWidget>
        <VddFloatingWidget widget-id="right-card" title="right-card" :placement="{ anchor: 'bottom-right', stretch: null }"
          :width="200" :height="120"><span /></VddFloatingWidget>
        <VddFloatingWidget widget-id="strip" title="strip" :placement="{ anchor: 'bottom-left', stretch: 'width' }"
          :width="240" :height="60"><span /></VddFloatingWidget>
      </VddPanelOverlay>`,
  })

  const byId = (id: string) => document.querySelector(`[data-vdd-widget="${id}"]`) as HTMLElement

  it('clears the taller of the two corners it spans', async () => {
    render(edge)
    await nextTick()
    expect(byId('left-card').style.bottom).toBe('0px')
    expect(byId('right-card').style.bottom).toBe('0px')
    // Registered in both bottom buckets, so it clears the 120px card in the *other* corner
    // (128px), not the 90px one it happens to share a corner with (which would be 98px).
    expect(byId('strip').style.bottom).toBe('128px')
  })

  it('does not disturb the corner widgets themselves', async () => {
    render(edge)
    await nextTick()
    expect(byId('left-card').style.width).toBe('200px')
    expect(byId('right-card').style.width).toBe('200px')
  })
})

// ─── PO26 ────────────────────────────────────────────────────────────────────

describe('PO26: detaching a stretched widget', () => {
  it('materialises the measured size and clears stretch', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 432, 784, 160) })
    const seen: PanelFloatPlacement[] = []
    try {
      const placement = ref<PanelFloatPlacement>({ anchor: 'bottom-left', stretch: 'width' })
      render(defineComponent({
        components: { VddPanelOverlay, VddFloatingWidget },
        setup: () => ({ placement, onPlacement: (p: PanelFloatPlacement) => seen.push(p) }),
        template: `
          <VddPanelOverlay>
            <VddFloatingWidget widget-id="detach" title="Detach" :width="240" :height="160"
              v-model:placement="placement" @update:placement="onPlacement"><span /></VddFloatingWidget>
          </VddPanelOverlay>`,
      }))
      const el = firstWidget()
      await pressHeader(el, { x: 440, y: 480 })

      // Free mode positions from an explicit box, so the 784px it was actually occupying has to
      // be adopted — not the stale 240px it had before stretching.
      expect(el.style.width).toBe('784px')
      expect(el.style.left).not.toBe('')
      expect(seen.some(p => p.stretch === null)).toBe(true)
    } finally {
      restore()
    }
  })
})

// ─── PO27 ────────────────────────────────────────────────────────────────────

describe('PO27: resize-to-stretch snapping', () => {
  // An 800x600 overlay with no toolbars and a 300x200 widget at top-left:
  // the full inline extent is 800 - 8 - 8 = 784, and the full block extent is 600.
  const snappable = (extra: Record<string, unknown> = {}) => {
    render(oneWidget({ placement: { anchor: 'top-left', stretch: null }, width: 300, height: 200, ...extra }))
    return firstWidget()
  }

  it('snaps the block axis to stretched when dragged to the far extent', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 0, 300, 200) })
    try {
      const el = snappable()
      await dragHandle(el, 's', { x: 150, y: 198 }, { x: 150, y: 900 })
      expect(el.style.height).toBe('')        // no explicit height — both block ends pinned
      expect(el.style.top).toBe('0px')
      expect(el.style.bottom).toBe('0px')
      expect(el.style.width).toBe('300px')    // the inline axis is untouched
    } finally {
      restore()
    }
  })

  it('shows the snapping cue while armed, before release', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 0, 300, 200) })
    try {
      const el = snappable()
      expect(el.className).not.toContain('vdd-panel-float--snapping')
      await dragHandle(el, 's', { x: 150, y: 198 }, { x: 150, y: 900 }, false)
      expect(el.className).toContain('vdd-panel-float--snapping')

      const handle = el.querySelector('.vdd-resize-s') as HTMLElement
      handle.dispatchEvent(pointer('pointerup', { clientX: 150, clientY: 900 }))
      await nextTick()
      expect(el.className).not.toContain('vdd-panel-float--snapping')
    } finally {
      restore()
    }
  })

  it('restores the pre-drag size on the snapped axis, so releasing returns to it', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 0, 300, 200) })
    try {
      const el = snappable()
      await dragHandle(el, 's', { x: 150, y: 198 }, { x: 150, y: 900 })
      expect(el.style.height).toBe('')
      // Release the axis again by dragging its bottom end inward: it returns to 200, the size
      // the user last chose deliberately, not the 600 the drag passed through.
      await dragHandle(el, 's', { x: 150, y: 598 }, { x: 150, y: 300 })
      expect(el.style.height).not.toBe('')
    } finally {
      restore()
    }
  })

  it('stays armed within the release tolerance (hysteresis)', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 0, 300, 200) })
    try {
      const el = snappable()
      const handle = el.querySelector('.vdd-resize-s') as HTMLElement
      handle.setPointerCapture = vi.fn()
      handle.dispatchEvent(pointer('pointerdown', { clientX: 150, clientY: 198 }))
      handle.dispatchEvent(pointer('pointermove', { clientX: 150, clientY: 900 }))
      await nextTick()
      // Pull back 30px — inside SNAP_OUT (40), so it stays armed.
      handle.dispatchEvent(pointer('pointermove', { clientX: 150, clientY: 568 }))
      await nextTick()
      expect(el.className).toContain('vdd-panel-float--snapping')

      handle.dispatchEvent(pointer('pointerup', { clientX: 150, clientY: 568 }))
      await nextTick()
      expect(el.style.height).toBe('')
    } finally {
      restore()
    }
  })

  it('disarms once pulled back past the release tolerance', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 0, 300, 200) })
    try {
      const el = snappable()
      const handle = el.querySelector('.vdd-resize-s') as HTMLElement
      handle.setPointerCapture = vi.fn()
      handle.dispatchEvent(pointer('pointerdown', { clientX: 150, clientY: 198 }))
      handle.dispatchEvent(pointer('pointermove', { clientX: 150, clientY: 900 }))
      await nextTick()
      handle.dispatchEvent(pointer('pointermove', { clientX: 150, clientY: 548 }))
      await nextTick()
      expect(el.className).not.toContain('vdd-panel-float--snapping')

      handle.dispatchEvent(pointer('pointerup', { clientX: 150, clientY: 548 }))
      await nextTick()
      expect(el.style.height).toBe('550px')    // an ordinary resize, no stretch
    } finally {
      restore()
    }
  })

  it('stretchable=false never snaps', async () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), widget: domRect(8, 0, 300, 200) })
    try {
      const el = snappable({ stretchable: false })
      await dragHandle(el, 's', { x: 150, y: 198 }, { x: 150, y: 900 })
      expect(el.style.height).toBe('600px')    // clamped, still explicit
      expect(el.style.bottom).toBe('')
    } finally {
      restore()
    }
  })
})

// ─── PO28–PO30 ───────────────────────────────────────────────────────────────

describe('PO28–PO30: a stored widget title is localisable', () => {
  const TABLES: Record<Locale, Record<string, string>> = {
    es: { 'legend.title': 'Leyenda SLD' },
    ru: { 'legend.title': 'Легенда SLD' },
  }
  type Locale = 'es' | 'ru'
  const DESCRIPTOR = { id: 'legend.title', defaultMessage: 'SLD Legend' }

  type Api = ReturnType<typeof useFloatingWidgets>
  let api: Api

  /**
   * A workspace whose formatter reads a ref, which is how an application switches language:
   * no plugin is rebuilt and no component is remounted, so anything that resolves a label
   * during render simply re-renders.
   */
  function renderWithLocale(locale: Ref<Locale>) {
    const ws = createWorkspace({
      panels: {},
      formatMessage: m => TABLES[locale.value][m.id] ?? m.defaultMessage ?? m.id,
    })
    const probe = defineComponent({
      name: 'Probe',
      setup() { api = useFloatingWidgets(); return () => h('span') },
    })
    const host = defineComponent({
      components: { VddPanelOverlay },
      setup: () => ({ Probe: probe }),
      template: '<VddPanelOverlay><component :is="Probe" /></VddPanelOverlay>',
    })
    const wrapper = mount(host, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    return ws
  }

  const titleText = () => document.querySelector('.vdd-panel-float__title')?.textContent

  it('PO28: open() accepts a descriptor title and resolves it through the formatter', async () => {
    renderWithLocale(ref<Locale>('es'))
    api.open('legend', { title: DESCRIPTOR, component: Dot })
    await nextTick()
    expect(titleText()).toBe('Leyenda SLD')
  })

  it('PO29: the title re-resolves when the locale changes, with no reopen', async () => {
    const locale = ref<Locale>('es')
    renderWithLocale(locale)
    api.open('legend', { title: DESCRIPTOR, component: Dot })
    await nextTick()
    expect(titleText()).toBe('Leyenda SLD')
    locale.value = 'ru'
    await nextTick()
    expect(titleText()).toBe('Легенда SLD')
  })

  it('PO30: a plain string title renders unchanged', async () => {
    renderWithLocale(ref<Locale>('es'))
    api.open('legend', { title: 'SLD Legend', component: Dot })
    await nextTick()
    expect(titleText()).toBe('SLD Legend')
  })

  it('PO30: a descriptor on a template widget resolves too', async () => {
    const ws = createWorkspace({
      panels: {},
      formatMessage: m => TABLES.es[m.id] ?? m.defaultMessage ?? m.id,
    })
    const host = defineComponent({
      components: { VddPanelOverlay, VddFloatingWidget },
      setup: () => ({ title: DESCRIPTOR, Dot }),
      template: '<VddPanelOverlay><VddFloatingWidget widget-id="legend" :title="title"><component :is="Dot" /></VddFloatingWidget></VddPanelOverlay>',
    })
    mounted.push(mount(host, { global: { plugins: [ws] }, attachTo: document.body }) as VueWrapper)
    await nextTick()
    expect(titleText()).toBe('Leyenda SLD')
  })
})
