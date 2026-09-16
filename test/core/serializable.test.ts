/**
 * Ported from react-dockable-desktop `serializable.test.ts` (8 tests), names preserved,
 * with the React-element case replaced by its Vue equivalents.
 *
 * This classification is a compatibility surface: it must agree with rdd's, or the same
 * workspace would prune different panels in each library
 * (docs/decisions/0009-layout-json-compatibility.md).
 */
import { describe, it, expect } from 'vitest'
import { h, defineComponent, reactive, markRaw } from 'vue'
import { isSerializable } from '../../src/core/serializable'

class CustomClass { value = 1 }

describe('isSerializable', () => {
  it('accepts primitives and null', () => {
    expect(isSerializable('hello')).toBe(true)
    expect(isSerializable(42)).toBe(true)
    expect(isSerializable(true)).toBe(true)
    expect(isSerializable(null)).toBe(true)
  })

  it('rejects a bare undefined', () => {
    expect(isSerializable(undefined)).toBe(false)
  })

  it('accepts arrays and plain objects of serializable values', () => {
    expect(isSerializable([1, 'two', true, null])).toBe(true)
    expect(isSerializable({ a: 1, b: { c: 'nested' }, d: [1, 2, 3] })).toBe(true)
    expect(isSerializable(Object.create(null))).toBe(true)
  })

  it('rejects an array or object containing undefined anywhere', () => {
    expect(isSerializable([1, undefined, 3])).toBe(false)
    expect(isSerializable({ a: 1, b: { c: undefined } })).toBe(false)
  })

  it('rejects functions and symbols, anywhere in the tree', () => {
    expect(isSerializable(() => {})).toBe(false)
    expect(isSerializable(Symbol('s'))).toBe(false)
    expect(isSerializable({ a: 1, nested: { deep: () => {} } })).toBe(false)
    expect(isSerializable([1, [2, [() => {}]]])).toBe(false)
  })

  it('rejects VNodes', () => {
    expect(isSerializable(h('div'))).toBe(false)
    expect(isSerializable({ icon: h('span', 'x') })).toBe(false)
  })

  it('rejects class instances, Map, and Set', () => {
    expect(isSerializable(new CustomClass())).toBe(false)
    expect(isSerializable(new Map())).toBe(false)
    expect(isSerializable(new Set())).toBe(false)
    expect(isSerializable(/re/)).toBe(false)
    expect(isSerializable({ ok: 1, bad: new CustomClass() })).toBe(false)
  })

  it('treats Date as serializable-enough, matching JSON.stringify\'s own behavior', () => {
    expect(isSerializable(new Date())).toBe(true)
    expect(isSerializable({ when: new Date() })).toBe(true)
  })

  // ── Vue-specific additions ────────────────────────────────────────────────
  // A Vue component is a plain object, unlike a React component (a function), so it would
  // pass a naive prototype check. It is rejected because it carries function properties,
  // which the recursive walk finds — asserted here so that reasoning cannot silently rot.

  it('rejects a Vue component passed as a prop', () => {
    const Comp = defineComponent({ setup: () => () => h('div') })
    expect(isSerializable(Comp)).toBe(false)
    expect(isSerializable({ renderer: Comp })).toBe(false)
  })

  it('rejects an async component, which is a function', () => {
    expect(isSerializable(() => import('vue'))).toBe(false)
  })

  it('accepts a reactive proxy of plain data, so props need not be unwrapped to be classified', () => {
    expect(isSerializable(reactive({ a: 1, b: { c: 2 } }))).toBe(true)
  })

  it('rejects markRaw-ed non-plain values, since markRaw does not make a value serializable', () => {
    expect(isSerializable(markRaw(new CustomClass()))).toBe(false)
  })
})
