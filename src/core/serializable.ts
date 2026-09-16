import { isVNode } from 'vue'

/**
 * Whether a value can round-trip through `JSON.stringify`/`JSON.parse` without silently
 * losing information.
 *
 * Deliberately **not** a `JSON.stringify` try/catch: that does not throw for the failure
 * case this guards against — a function-valued property is quietly dropped, not rejected.
 * This walks the value tree instead, returning `false` as soon as it finds a function,
 * symbol, `undefined`, VNode, or any non-plain object (a class instance, `Map`, `Set`,
 * `RegExp`, …).
 *
 * A Vue **component** needs no special case: an options object or SFC carries `setup`,
 * `render` or similar function properties, and the recursive walk rejects any object
 * containing a function. An async component *is* a function and is rejected directly.
 *
 * `Date` is an explicit exception — serialisable-enough, matching `JSON.stringify`'s own
 * behaviour — even though it comes back as an ISO string rather than a `Date`. That is a
 * smaller, documentable gotcha than a silently vanishing function.
 *
 * This classification is a **compatibility surface**: it must agree with
 * react-dockable-desktop's, or the same workspace would prune different panels in each
 * library. See docs/decisions/0009-layout-json-compatibility.md.
 *
 * Pass raw values. A reactive proxy of plain data does pass, but prefer `toRaw()` at the
 * call site so the answer is about the data and not about Vue's wrapper.
 */
export function isSerializable(value: unknown): boolean {
  if (value === null) return true
  if (value === undefined) return false

  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') return true
  if (type === 'function' || type === 'symbol' || type === 'bigint') return false

  // type === 'object' from here on.
  if (value instanceof Date) return true
  if (isVNode(value)) return false
  if (Array.isArray(value)) return value.every(isSerializable)

  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false // class instance, Map, Set, RegExp, Error, …

  return Object.values(value as Record<string, unknown>).every(isSerializable)
}
