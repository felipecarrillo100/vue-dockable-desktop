/**
 * Ported from react-dockable-desktop `PanelRegistry.test.ts` (7 tests), names preserved.
 * Adapted: the registry is per-workspace here, not a module singleton
 * (docs/decisions/0004-store-outside-components.md), and components are `markRaw`-ed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, h, isReactive, reactive, toRaw } from 'vue'
import { PanelRegistry } from '../../src/core/registry'

const MapPanel = defineComponent({ name: 'MapPanel', setup: () => () => h('div', 'map') })
const EditorPanel = defineComponent({ name: 'EditorPanel', setup: () => () => h('div', 'editor') })

describe('PanelRegistry', () => {
  let registry: PanelRegistry
  beforeEach(() => { registry = new PanelRegistry() })

  it('should register a component and retrieve it by key', () => {
    registry.register('map', MapPanel)
    expect(registry.get('map')?.component).toBe(MapPanel)
  })

  it('should return undefined for an unregistered key', () => {
    expect(registry.get('nope')).toBeUndefined()
    expect(registry.has('nope')).toBe(false)
  })

  it('should store all defaultOptions alongside the component', () => {
    registry.register('map', MapPanel, {
      title: 'Map', initialTarget: 'floating', canClose: false, canMinimize: false,
      canDrag: false, defaultAnchor: 'top-right',
      favoritePosition: { x: 10, y: 20, width: 300, height: 200 },
    })
    const o = registry.get('map')!.defaultOptions!
    expect(o.title).toBe('Map')
    expect(o.initialTarget).toBe('floating')
    expect(o.canClose).toBe(false)
    expect(o.canMinimize).toBe(false)
    expect(o.canDrag).toBe(false)
    expect(o.defaultAnchor).toBe('top-right')
    expect(o.favoritePosition).toEqual({ x: 10, y: 20, width: 300, height: 200 })
  })

  it('should overwrite an existing registration', () => {
    registry.register('slot', MapPanel)
    registry.register('slot', EditorPanel, { title: 'Second' })
    expect(registry.get('slot')?.component).toBe(EditorPanel)
    expect(registry.get('slot')?.defaultOptions?.title).toBe('Second')
  })

  it('should accept an i18n descriptor object as title', () => {
    registry.register('map', MapPanel, { title: { id: 'panel.map', defaultMessage: 'Map' } })
    expect(registry.get('map')?.defaultOptions?.title).toEqual({ id: 'panel.map', defaultMessage: 'Map' })
  })

  it('should register without options and still be retrievable', () => {
    registry.register('bare', MapPanel)
    expect(registry.get('bare')).toBeDefined()
    expect(registry.get('bare')?.defaultOptions).toBeUndefined()
  })

  it('should store disableLivePreview flag', () => {
    registry.register('map', MapPanel, { disableLivePreview: true })
    expect(registry.get('map')?.defaultOptions?.disableLivePreview).toBe(true)
  })

  // ── Vue-specific additions ────────────────────────────────────────────────

  it('keeps registries independent, so two workspaces cannot see each other\'s panels', () => {
    const other = new PanelRegistry()
    registry.register('map', MapPanel)
    expect(other.has('map')).toBe(false)
    expect(registry.keys()).toEqual(['map'])
    expect(other.keys()).toEqual([])
  })

  it('markRaw\'s the component so reactive state never proxies a component definition', () => {
    registry.register('map', MapPanel, { icon: EditorPanel })
    const entry = registry.get('map')!
    const wrapped = reactive({ entry })
    // A component placed in reactive state must come back as the same object, not a Proxy:
    // a proxied component definition both warns and breaks identity comparisons.
    expect(wrapped.entry.component).toBe(MapPanel)
    expect(isReactive(wrapped.entry.component)).toBe(false)
    expect(toRaw(wrapped.entry.defaultOptions!.icon!)).toBe(EditorPanel)
  })
})
