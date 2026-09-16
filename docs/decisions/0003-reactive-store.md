# 0003 — A plain `reactive` store; no Pinia

**Status:** Accepted

## Context

rdd holds the whole workspace in one `useState` plus a mirrored `stateRef` for synchronous
reads, and exposes it through `useSyncExternalStore` so that `useWindowManagerState(selector)`
can avoid re-rendering every consumer on every change. That is three mechanisms serving one
need: *read state, subscribe narrowly.*

Vue gives that for free. The open question is only whether to depend on Pinia.

## Decision

A plain `reactive()` store, built with Vue's own primitives, exposed through
`provide`/`inject`. No Pinia.

Reasons:

- rdd's only runtime dependency is React itself; vdd's should be Vue itself. A layout engine
  forcing a state-management choice on its host app is presumptuous.
- Pinia's value is app-wide store organisation, devtools and SSR plumbing. We need one
  store instance, owned by the library, whose lifetime is the workspace — not the app.
- Consumers can still put vdd state in their own Pinia store if they want; nothing prevents
  it.

State shape is unchanged from rdd — `gridRoot`, `floating[]`, `minimized[]`, `panels{}`,
`activePanelId`, `draggedPanelId`, `dir`, `isRtl`, `splitRatio`, `edgeSplitRatio` — because
[0009](0009-layout-json-compatibility.md) requires the serialisable subset to match exactly.

`useWorkspace()` returns **refs and functions**, so destructuring preserves reactivity:

```ts
const { activePanelId, panels, openPanel, saveLayout } = useWorkspace()
```

This is the shape `storeToRefs` exists to produce in Pinia; we can simply return it.

## Consequences

- The `(selector)` overload disappears. Users needing a derived value write `computed()` —
  more flexible than a selector, and the idiom they already know.
- The tree-mutation helpers stay **pure functions returning new nodes**, as in rdd, and the
  store assigns their result. Vue works with mutation too, but purity keeps the port
  low-risk and keeps `saveLayout` honest.
- Two Vue-specific hazards, both handled in the store rather than left to users:
  - Anything placed in `reactive` gets a Proxy. Panel components and user-supplied `props`
    must be `markRaw`-ed, or Vue will proxy a component definition and warn.
  - `saveLayout` must serialise raw data (`toRaw`) so no Proxy leaks into JSON, and
    `isSerializable` must be given raw values — it inspects prototypes, and a Proxy of a
    plain object would otherwise be classified by its target's prototype by accident
    rather than by design.
