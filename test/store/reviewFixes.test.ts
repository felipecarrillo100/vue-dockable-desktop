/**
 * The 1.5.1 store fixes, ported from react-dockable-desktop 7.4.1 (`Patch741.test.ts`). Each runs
 * against the workspace alone — nothing mounted — since that is where the defect lived.
 *
 * - The default message formatter replaces every `{key}`, not only the first — both copies of it,
 *   `formatLabel` and the workspace's `format`, which is now the same function.
 * - Layout repair drops leaf panel ids that aren't in `panels`, and gives a branch whose `sizes`
 *   don't match its children (or aren't finite and positive) even sizes — otherwise
 *   `flex-basis: NaN%`.
 * - A throwing event subscriber no longer stops delivery to the others, nor the publishing action.
 *
 * rdd 7.4.1's fourth store fix (restored windows keep their stacking order) is not ported: vdd
 * already seeds its z counter from the restored windows, on both paths.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { createWorkspace } from '../../src/core/workspace'
import { formatLabel } from '../../src/core/messages'
import type { LayoutNode } from '../../src/types'

const P = defineComponent({ render: () => h('div') })
const ws = () => createWorkspace({ panels: { p: { component: P } } })
const panel = (id: string, state = 'docked') => ({ id, title: id.toUpperCase(), component: 'p', state })
const leaf = (id: string, p: string) => ({ type: 'leaf', id, panels: [p], activePanelId: p })

afterEach(() => { vi.restoreAllMocks() })

describe('the default message formatter', () => {
  const label = { id: 'x', defaultMessage: '{n} of {n}, {m}', values: { n: 2, m: 'ok' } }

  it('replaces every occurrence of a placeholder (formatLabel)', () => {
    expect(formatLabel(label)).toBe('2 of 2, ok')
  })

  it('replaces every occurrence of a placeholder (workspace.format)', () => {
    expect(ws().format(label)).toBe('2 of 2, ok')
  })
})

describe('layout repair', () => {
  const load = (gridRoot: unknown, panels: Record<string, unknown>) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = ws()
    expect(w.loadLayout(JSON.stringify({ version: 2, gridRoot, floating: [], minimized: [], panels }))).toBe(true)
    return { root: w.state.gridRoot, warn }
  }

  it('drops a leaf panel id that is not in panels, and re-derives the active one', () => {
    const { root, warn } = load({ type: 'leaf', id: 'g', panels: ['ghost', 'a'], activePanelId: 'ghost' }, { a: panel('a') })
    expect(root).toMatchObject({ type: 'leaf', panels: ['a'], activePanelId: 'a' })
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/ghost/)
  })

  it('gives a branch whose sizes do not match its children even sizes', () => {
    const { root, warn } = load(
      { type: 'branch', orientation: 'horizontal', sizes: [1], children: [leaf('l1', 'a'), leaf('l2', 'b'), leaf('l3', 'c')] },
      { a: panel('a'), b: panel('b'), c: panel('c') },
    )
    const sizes = (root as Extract<LayoutNode, { type: 'branch' }>).sizes
    expect(sizes).toHaveLength(3)
    for (const s of sizes) expect(s).toBeCloseTo(1 / 3)
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/a split had sizes/)
  })

  it('gives a branch with a non-finite size even sizes', () => {
    const { root } = load(
      { type: 'branch', orientation: 'horizontal', sizes: [0.5, null], children: [leaf('l1', 'a'), leaf('l2', 'b')] },
      { a: panel('a'), b: panel('b') },
    )
    expect((root as Extract<LayoutNode, { type: 'branch' }>).sizes).toEqual([0.5, 0.5])
  })

  it('a layout saved by the workspace loads with no repair', () => {
    const w = ws()
    w.openPanel('a', 'p'); w.openPanel('b', 'p')
    w.dockPanelToWorkspaceEdge('b', 'right')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ws().loadLayout(w.saveLayout())).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('the event bus', () => {
  it('delivers to every subscriber even when one throws, and reports the error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = ws()
    const got: unknown[] = []
    w.subscribe('probe', () => { throw new Error('bad listener') })
    w.subscribe('probe', d => got.push(d))
    expect(() => w.publish('probe', 42)).not.toThrow()
    expect(got).toEqual([42])
    expect(String(error.mock.calls[0]?.[0])).toMatch(/probe/)
  })

  it('a throwing built-in subscriber does not stop the action that published', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = ws()
    w.subscribe('panel:opened', () => { throw new Error('bad listener') })
    expect(() => w.openPanel('a', 'p')).not.toThrow()
    expect(w.isOpen('a')).toBe(true)
  })
})
