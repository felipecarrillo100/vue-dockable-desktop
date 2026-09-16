/**
 * The other half of layout compatibility: what vdd **writes**.
 *
 * `rdd-fixtures.test.ts` proves vdd reads rdd's output faithfully. This proves the write
 * side: load an rdd layout, save it again, and require the result to be deep-equal. If both
 * hold, the format is genuinely shared rather than merely similar.
 *
 * Brought forward from M6 deliberately — docs/decisions/0009-layout-json-compatibility.md is
 * a hard requirement, and a requirement is worth failing early.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h } from 'vue'
import { createWorkspace } from '../../src/core/workspace'

const DIR = resolve(import.meta.dirname, '../fixtures/rdd-6.2.0')
const P = defineComponent({ name: 'MockPanel', setup: () => () => h('div') })
const names = readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
const load = (name: string) => JSON.parse(readFileSync(resolve(DIR, `${name}.json`), 'utf8'))

/** Every component key any fixture mentions, so nothing warns about being unregistered. */
const panels = Object.fromEntries(
  Array.from(new Set(names.flatMap(n => Object.values(load(n).panels as Record<string, { component: string }>).map(p => p.component))))
    .map(key => [key, { component: P }]),
)

describe('rdd layouts round-trip through vdd unchanged', () => {
  it.each(names)('%s survives load → save', (name) => {
    const raw = load(name)
    const w = createWorkspace({ panels, initialState: JSON.stringify(raw) })
    const saved = JSON.parse(w.saveLayout())

    expect(saved.gridRoot).toEqual(raw.gridRoot)
    expect(saved.minimized).toEqual(raw.minimized)
    expect(saved.panels).toEqual(raw.panels)
    expect(saved.version).toBe(2)

    if (JSON.stringify(raw.floating).includes('sticky')) {
      // The one intended rewrite: pre-`anchor` booleans become a logical anchor. rdd would
      // save it the same way, so the migrated form is the compatible form.
      expect(saved.floating.every((w2: { anchor?: unknown }) => !('stickyRight' in w2))).toBe(true)
    } else {
      expect(saved.floating).toEqual(raw.floating)
    }

    // `activePanelId` is omitted rather than null when nothing qualifies, exactly as rdd does.
    if (raw.activePanelId !== undefined) expect(saved.activePanelId).toBe(raw.activePanelId)
  })

  it('is idempotent: saving twice produces identical bytes', () => {
    for (const name of names) {
      const w = createWorkspace({ panels, initialState: JSON.stringify(load(name)) })
      const once = w.saveLayout()
      expect(createWorkspace({ panels, initialState: once }).saveLayout()).toBe(once)
    }
  })

  it('a layout vdd writes from scratch is readable as version 2', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('a', 'map')
    w.openPanel('b', 'map', { initialTarget: 'floating', anchor: 'top-right' })
    w.openPanel('c', 'map')
    w.minimizePanel('c')
    const saved = JSON.parse(w.saveLayout())
    expect(saved.version).toBe(2)
    expect(saved.gridRoot.type).toMatch(/leaf|branch/)
    expect(saved.floating[0]).toMatchObject({ id: 'b', anchor: 'top-right' })
    expect(saved.minimized).toEqual([{ id: 'c', title: 'c', component: 'map' }])
    expect(saved.panels.c.previousState).toBe('docked')
  })
})

describe('saveLayout prunes what it cannot restore', () => {
  it('excludes a panel whose props are not serialisable, and prunes it from the tree', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('ok', 'map')
    w.openPanel('bad', 'map', { props: { onSave: () => {} } })
    const saved = JSON.parse(w.saveLayout())
    expect(saved.panels.bad).toBeUndefined()
    expect(saved.panels.ok).toBeDefined()
    expect(JSON.stringify(saved.gridRoot)).not.toContain('bad')
    // …while the panel keeps working on screen
    expect(w.isOpen('bad')).toBe(true)
  })

  it('announces the exclusion, because nobody may be watching the flag', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('bad', 'map', { props: { fn: () => {} } })
    const seen: { id: string; component: string }[][] = []
    w.subscribe('layout:panels-excluded', e => seen.push(e.panels))
    w.saveLayout()
    expect(seen).toEqual([[{ id: 'bad', component: 'map' }]])
  })

  it('omits activePanelId when the active panel was itself excluded', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('bad', 'map', { props: { fn: () => {} } })
    expect(w.state.activePanelId).toBe('bad')
    expect(JSON.parse(w.saveLayout()).activePanelId).toBeUndefined()
  })

  it('does not announce anything when every panel is serialisable', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('ok', 'map')
    let fired = false
    w.subscribe('layout:panels-excluded', () => { fired = true })
    w.saveLayout()
    expect(fired).toBe(false)
  })
})

describe('registered state providers', () => {
  it('are pulled fresh on every save', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('p', 'map', { props: { scrollTop: 0 } })
    let scrollTop = 0
    w.registerStateProvider('p', () => ({ scrollTop }))
    expect(JSON.parse(w.saveLayout()).panels.p.props).toEqual({ scrollTop: 0 })
    scrollTop = 250
    expect(JSON.parse(w.saveLayout()).panels.p.props).toEqual({ scrollTop: 250 })
  })

  it('fall back to static props when the provider returns undefined', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('p', 'map', { props: { path: '/a.md' } })
    w.registerStateProvider('p', () => undefined)
    expect(JSON.parse(w.saveLayout()).panels.p.props).toEqual({ path: '/a.md' })
  })

  it('are re-checked for serialisability every time, since it can change', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('p', 'map', { props: { ok: 1 } })
    let value: unknown = { ok: 1 }
    w.registerStateProvider('p', () => value)
    expect(JSON.parse(w.saveLayout()).panels.p).toBeDefined()
    value = { nowBroken: () => {} }
    expect(JSON.parse(w.saveLayout()).panels.p).toBeUndefined()
  })

  it('stop being consulted once unregistered', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('p', 'map', { props: { path: '/a.md' } })
    const off = w.registerStateProvider('p', () => ({ path: '/live.md' }))
    expect(JSON.parse(w.saveLayout()).panels.p.props.path).toBe('/live.md')
    off()
    expect(JSON.parse(w.saveLayout()).panels.p.props.path).toBe('/a.md')
  })
})

describe('loadLayout', () => {
  it('replaces the whole workspace, closing panels absent from the snapshot', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('old', 'map')
    const snapshot = createWorkspace({ panels: { map: { component: P } } })
    snapshot.openPanel('new', 'map')
    expect(w.loadLayout(snapshot.saveLayout())).toBe(true)
    expect(w.isOpen('old')).toBe(false)
    expect(w.isOpen('new')).toBe(true)
  })

  it('returns false and leaves the layout untouched for unusable input', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    w.openPanel('keep', 'map')
    for (const bad of ['not json', '{}', 'null', '[]', '{"gridRoot":null}']) {
      expect(w.loadLayout(bad)).toBe(false)
    }
    expect(w.isOpen('keep')).toBe(true)
  })

  it('publishes layout:changed so an autosave sees the restore', () => {
    const w = createWorkspace({ panels: { map: { component: P } } })
    let fired = 0
    w.subscribe('layout:changed', () => { fired++ })
    w.loadLayout(JSON.stringify(load('two-tabs')))
    expect(fired).toBe(1)
  })
})
