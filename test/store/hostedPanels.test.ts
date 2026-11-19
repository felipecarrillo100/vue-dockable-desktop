/**
 * Hosted panels, ported from react-dockable-desktop 7.11.0 M1 (`HostedPanels.test.tsx`, HP1–HP7): a
 * workspace panel that shows a managed widget moved out of its owner panel. The actions are
 * `@internal` until the overlay uses them, so these drive the workspace directly, nothing mounted.
 *
 * HP1: optionsFor: an ordinary panel gets its kind's options; a hosted panel gets the hosted base
 *      plus its own canFloat/canDock; a minimised entry falls back to its component
 * HP2: openHostedPanel docks beside its owner (split or tab), or floats exactly at its rect
 * HP3: ...and refuses, changing nothing, when the owner isn't docked or the id is taken
 * HP4: saveLayout never writes a hosted panel and never reports it as excluded
 * HP5: loadLayout and initialState drop a hosted panel found in a layout, with every reference,
 *      and strip a hand-made `owner`; a load tells each live hosted panel first (onDrop)
 * HP6: closePanel on a hosted panel calls its close handler; removeHostedPanel does not
 * HP7: setHostedOptions changes what the user may do (isDropAllowed)
 */
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, toRaw } from 'vue'
import { createWorkspace } from '../../src/core/workspace'
import { PanelRegistry } from '../../src/core/registry'
import { optionsFor, HOSTED_COMPONENT } from '../../src/core/panelOptions'
import { isDropAllowed } from '../../src/core/dockRules'
import type { LayoutNode, PanelOwner } from '../../src/types'
import type { WorkspaceState } from '../../src/core/workspace'

const Plain = defineComponent({ render: () => h('div') })

/** A workspace with a docked owner panel "map". */
function setup(initialState?: string) {
  const ws = createWorkspace({
    panels: { plain: { component: Plain }, pinned: { component: Plain, defaultOptions: { canClose: false } } },
    ...(initialState ? { initialState } : {}),
  })
  if (!initialState) ws.openPanel('map', 'plain')
  return ws
}

const owner = (options?: PanelOwner['options']): PanelOwner => ({ panelId: 'map', widgetId: 'table', ...(options ? { options } : {}) })
const leafOf = (s: Readonly<WorkspaceState>, id: string): string | null => {
  const walk = (n: LayoutNode): string | null =>
    n.type === 'leaf' ? (n.panels.includes(id) ? n.id : null) : n.children.map(walk).find(Boolean) ?? null
  return walk(s.gridRoot)
}
const snapshot = (s: Readonly<WorkspaceState>) => JSON.stringify(toRaw(s))

describe('HP1: optionsFor', () => {
  const registry = new PanelRegistry()
  registry.register('plain', Plain, { canFloat: false, title: 'Plain' })

  it('an ordinary panel gets its kind\'s options', () => {
    expect(optionsFor(registry, { id: 'a', title: 'A', component: 'plain', state: 'docked', serializable: true }))
      .toEqual({ canFloat: false, title: 'Plain' })
  })

  it('a hosted panel gets the hosted base, and its own canFloat/canDock (false unless allowed)', () => {
    const base = { id: 'h', title: 'H', component: HOSTED_COMPONENT, state: 'docked' as const, serializable: false }
    expect(optionsFor(registry, { ...base, owner: owner() }))
      .toEqual({ canDrag: true, canClose: true, canMinimize: true, keepAlive: true, canFloat: false, canDock: false })
    expect(optionsFor(registry, { ...base, owner: owner({ canFloat: true, canDock: true }) }))
      .toMatchObject({ canFloat: true, canDock: true })
  })

  it('an id no longer open falls back to its component (a minimised entry\'s own copy)', () => {
    expect(optionsFor(registry, undefined, 'plain')).toEqual({ canFloat: false, title: 'Plain' })
    expect(optionsFor(registry, undefined)).toBeUndefined()
  })

  it('a hosted panel can always close, minimise and float when allowed, through the workspace', () => {
    const ws = setup()
    ws.openHostedPanel('map/table', owner({ canFloat: true }), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })
    ws.minimizePanel('map/table')
    expect(ws.state.panels['map/table']?.state).toBe('minimized')
    ws.restorePanel('map/table')
    ws.closePanel('map/table')
    expect(ws.state.panels['map/table']).toBeUndefined()
  })
})

describe('HP2–HP3: openHostedPanel', () => {
  it('docks below its owner, and publishes panel:opened with the reserved component', () => {
    const ws = setup()
    const opened = vi.fn()
    const changed = vi.fn()
    ws.subscribe('panel:opened', opened)
    ws.subscribe('layout:changed', changed)
    expect(ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })).toBe(true)
    const s = ws.state
    expect(s.panels['map/table']).toMatchObject({ component: HOSTED_COMPONENT, state: 'docked', serializable: false, owner: owner() })
    expect(leafOf(s, 'map/table')).not.toBeNull()
    expect(leafOf(s, 'map/table')).not.toBe(leafOf(s, 'map'))                   // a split, not a tab
    expect(s.activePanelId).toBe('map/table')
    expect(opened).toHaveBeenCalledWith({ id: 'map/table', component: HOSTED_COMPONENT })
    expect(changed).toHaveBeenCalled()
  })

  it('"center" opens it as a tab in its owner\'s group', () => {
    const ws = setup()
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'center' } })
    expect(leafOf(ws.state, 'map/table')).toBe(leafOf(ws.state, 'map'))
  })

  it('floats exactly at its rect, not cascaded off a window already there', () => {
    const ws = setup()
    ws.openPanel('f', 'plain', { initialTarget: 'floating' })
    const taken = ws.state.floating.find(w => w.id === 'f')!
    const rect = { x: taken.x as number, y: taken.y as number, width: 300, height: 200 }
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'float', rect })
    expect(ws.state.floating.find(w => w.id === 'map/table')).toMatchObject(rect)
    expect(ws.state.panels['map/table']?.state).toBe('floating')
    expect(ws.state.activePanelId).toBe('map/table')
  })

  it('refuses, changing nothing, when the owner isn\'t docked or the id is taken', () => {
    const ws = setup()
    ws.openPanel('f', 'plain', { initialTarget: 'floating' })
    const before = snapshot(ws.state)
    const opened = vi.fn()
    ws.subscribe('panel:opened', opened)
    expect(ws.openHostedPanel('f/w', { panelId: 'f', widgetId: 'w' }, 'W', { kind: 'dock', dockTo: { panel: 'f', position: 'bottom' } })).toBe(false)
    expect(ws.openHostedPanel('map', owner(), 'Taken', { kind: 'float', rect: { x: 0, y: 0, width: 10, height: 10 } })).toBe(false)
    expect(snapshot(ws.state)).toBe(before)
    expect(opened).not.toHaveBeenCalled()
  })
})

describe('HP4: saveLayout', () => {
  it('never writes a hosted panel, and never reports it as excluded', () => {
    const ws = setup()
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })
    ws.openHostedPanel('map/chart', { panelId: 'map', widgetId: 'chart' }, 'Chart', { kind: 'float', rect: { x: 10, y: 10, width: 200, height: 100 } })
    ws.openHostedPanel('map/list', { panelId: 'map', widgetId: 'list' }, 'List', { kind: 'float', rect: { x: 50, y: 50, width: 200, height: 100 } })
    ws.minimizePanel('map/list')
    const excluded = vi.fn()
    ws.subscribe('layout:panels-excluded', excluded)
    const saved = ws.saveLayout()
    expect(saved).not.toContain('map/table')
    expect(saved).not.toContain('map/chart')
    expect(saved).not.toContain('map/list')
    expect(saved).not.toContain(HOSTED_COMPONENT)
    expect(saved).not.toContain('owner')
    expect(excluded).not.toHaveBeenCalled()
    expect(JSON.parse(saved).panels).toHaveProperty('map')
    // The live workspace is untouched.
    expect(ws.state.panels['map/table']).toBeDefined()
  })
})

describe('HP5: loading a layout that names a hosted panel', () => {
  /** What saveLayout would have written without its guard: the hosted panels and their places. */
  const crafted = () => {
    const ws = setup()
    ws.openPanel('f', 'plain', { initialTarget: 'floating' })
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'center' } })
    ws.openHostedPanel('map/chart', { panelId: 'map', widgetId: 'chart' }, 'Chart', { kind: 'float', rect: { x: 10, y: 10, width: 200, height: 100 } })
    ws.openHostedPanel('map/list', { panelId: 'map', widgetId: 'list' }, 'List', { kind: 'float', rect: { x: 50, y: 50, width: 200, height: 100 } })
    ws.minimizePanel('map/list')
    const s = JSON.parse(snapshot(ws.state)) as WorkspaceState
    const panels = Object.fromEntries(Object.entries(s.panels).map(([id, p]) => {
      const { owner: _o, ...rest } = p
      return [id, rest]
    })) as Record<string, unknown>
    panels.map = { ...(panels.map as object), owner: { panelId: 'x', widgetId: 'y' } }   // a hand-made owner on an ordinary panel
    return JSON.stringify({ version: 2, gridRoot: s.gridRoot, floating: s.floating, minimized: s.minimized, panels, activePanelId: 'map/table' })
  }

  it('loadLayout drops it from panels, the tree, the floating windows and the taskbar, and strips a hand-made owner', () => {
    const json = crafted()
    expect(json).toContain(HOSTED_COMPONENT)
    const ws = setup()
    expect(ws.loadLayout(json)).toBe(true)
    const s = ws.state
    expect(Object.keys(s.panels).sort()).toEqual(['f', 'map'])
    expect(leafOf(s, 'map/table')).toBeNull()
    expect(s.floating.map(w => w.id)).toEqual(['f'])
    expect(s.minimized).toEqual([])
    expect(s.panels.map!.owner).toBeUndefined()
    expect(s.activePanelId).not.toBe('map/table')
    expect(s.activePanelId).not.toBeNull()
  })

  it('initialState drops it the same way', () => {
    const ws = setup(crafted())
    expect(Object.keys(ws.state.panels).sort()).toEqual(['f', 'map'])
    expect(leafOf(ws.state, 'map/table')).toBeNull()
    expect(ws.state.floating.map(w => w.id)).toEqual(['f'])
    expect(ws.state.minimized).toEqual([])
    expect(ws.state.panels.map!.owner).toBeUndefined()
    expect(ws.state.activePanelId).not.toBe('map/table')
  })

  it('a live hosted panel is not in a loaded layout: the load tells its owner first, then removes it', () => {
    const ws = setup()
    const layout = ws.saveLayout()
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })
    let presentAtDrop: boolean | undefined
    const onDrop = vi.fn(() => { presentAtDrop = 'map/table' in ws.state.panels })
    const onClose = vi.fn()
    ws.registerHostedCloseHandler('map/table', onClose, onDrop)
    ws.loadLayout(layout)
    expect(ws.state.panels['map/table']).toBeUndefined()
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(presentAtDrop).toBe(true)                 // called before the state is replaced
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a layout load that is refused tells no one', () => {
    const ws = setup()
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })
    const onDrop = vi.fn()
    ws.registerHostedCloseHandler('map/table', () => {}, onDrop)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ws.loadLayout('{"not":"a layout"}')).toBe(false)
    expect(onDrop).not.toHaveBeenCalled()
    expect(ws.state.panels['map/table']).toBeDefined()
    vi.restoreAllMocks()
  })
})

describe('HP6: closing', () => {
  it('closePanel on a hosted panel removes it and calls its close handler once, after panel:closed', () => {
    const ws = setup()
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })
    const order: string[] = []
    const onClose = vi.fn(() => { order.push('handler') })
    ws.registerHostedCloseHandler('map/table', onClose)
    ws.subscribe('panel:closed', ({ id }) => { order.push(`closed:${id}`) })
    ws.closePanel('map/table')
    expect(ws.state.panels['map/table']).toBeUndefined()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['closed:map/table', 'handler'])
    expect(ws.state.activePanelId).toBe('map')
  })

  it('removeHostedPanel removes it without calling the handler (the widget is going back)', () => {
    const ws = setup()
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })
    const onClose = vi.fn()
    ws.registerHostedCloseHandler('map/table', onClose)
    const closed = vi.fn()
    const changed = vi.fn()
    ws.subscribe('panel:closed', closed)
    ws.subscribe('layout:changed', changed)
    ws.removeHostedPanel('map/table')
    expect(ws.state.panels['map/table']).toBeUndefined()
    expect(leafOf(ws.state, 'map/table')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(closed).toHaveBeenCalledWith({ id: 'map/table' })
    expect(changed).toHaveBeenCalled()
    expect(ws.state.activePanelId).toBe('map')
  })

  it('removeHostedPanel leaves an ordinary panel alone; an unregistered handler is not called', () => {
    const ws = setup()
    ws.removeHostedPanel('map')
    expect(ws.state.panels.map).toBeDefined()
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })
    const onClose = vi.fn()
    const unregister = ws.registerHostedCloseHandler('map/table', onClose)
    unregister()
    ws.closePanel('map/table')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closing an ordinary panel calls no hosted handler registered under its id', () => {
    const ws = setup()
    const onClose = vi.fn()
    ws.registerHostedCloseHandler('map', onClose)
    ws.closePanel('map')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('HP7: setHostedOptions', () => {
  it('changes what the user may do with the hosted panel', () => {
    const ws = setup()
    ws.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })
    expect(isDropAllowed(ws, 'map/table', { kind: 'float', anchor: null })).toBe(false)
    ws.setHostedOptions('map/table', { canFloat: true, canDock: false })
    expect(isDropAllowed(ws, 'map/table', { kind: 'float', anchor: null })).toBe(true)
    expect(isDropAllowed(ws, 'map/table', { kind: 'edge', side: 'left' })).toBe(false)
    ws.setHostedOptions('map/table', { canFloat: true, canDock: true })
    expect(isDropAllowed(ws, 'map/table', { kind: 'edge', side: 'left' })).toBe(true)
  })

  it('is a no-op when unchanged, and on an ordinary panel', () => {
    const ws = setup()
    ws.openHostedPanel('map/table', owner({ canFloat: true, canDock: false }), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })
    const panels = toRaw(ws.state).panels
    ws.setHostedOptions('map/table', { canFloat: true, canDock: false })
    expect(toRaw(ws.state).panels).toBe(panels)
    ws.setHostedOptions('map', { canFloat: true })
    expect(toRaw(ws.state).panels).toBe(panels)
    expect(ws.state.panels.map!.owner).toBeUndefined()
  })
})
