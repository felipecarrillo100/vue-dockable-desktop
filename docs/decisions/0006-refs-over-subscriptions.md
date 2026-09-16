# 0006 — Reactive refs instead of lifecycle subscriptions

**Status:** Accepted

## Context

rdd's `FormContainerContract` — what a panel sees of its own container — carries six
subscription methods, each returning an unsubscribe function:
`onActivate`, `onDeactivate`, `onMinimize`, `onRestore`, `onResize`,
`onContainerTypeChange`. Plus `getDimensions()` for a one-shot read and `usePanelSize()`,
a `useSyncExternalStore` wrapper, for a reactive one.

All eight exist because React has no way to hand a component a piece of live state. Behind
them, rdd maintains a module-level `Map` of `Set`s of callbacks per panel
(`panelLifecycleRegistry`), and effects that diff previous against current state to decide
which callbacks to fire.

## Decision

Expose state as refs. `usePanel()` returns:

```ts
const {
  id, title, isActive, isMinimized, isFloating, containerType, size, dirty,
  setTitle, setIcon, setDirty, close, minimize, onBeforeClose, onSaveState,
} = usePanel()
```

`isActive`, `isMinimized`, `isFloating`, `containerType`, `size`, `dirty` and `title` are
refs. Anything that was a subscription becomes a watcher, written by the user where they
need it:

```ts
watch(isActive, active => { if (active) editor.focus() })
watch(size, ({ width, height }) => chart.resize(width, height))
watchEffect(() => { if (isMinimized.value) pausePolling() })
```

Two things stay functions, because they are registrations of behaviour rather than reads of
state — but both auto-dispose with the surrounding scope, so neither returns an unsubscribe:

- `onBeforeClose(() => boolean | Promise<boolean>)` — veto a close.
- `onSaveState(() => unknown)` — contribute live state to `saveLayout()`.

## Consequences

- Eight API members collapse into six refs and two registrations. Nothing is lost: every
  rdd callback has an exact watcher equivalent, and watchers are strictly more capable
  (`immediate`, `flush`, `deep`, multiple sources, `watchEffect`).
- The `panelLifecycleRegistry` module-level Map and its diffing effects are deleted.
- **Ordering guarantees change and must be tested.** rdd fires `onDeactivate(old)` then
  `onActivate(new)`, synchronously in an effect — an ordering that commit `6de3381`
  explicitly documented as a behaviour change. Vue watchers default to `flush: 'pre'` and
  fire per watcher, so relative order between two panels' watchers is not guaranteed the
  same way. rdd's `FormContainer` lifecycle tests are therefore **rewritten, not ported**,
  and must pin the ordering vdd actually offers. Where a panel needs deterministic
  handoff, the workspace event bus (`panel:activated`) is the ordered channel.
- `usePanel()` must work when a panel is rendered standalone (outside any container), as
  rdd's `defaultContract` allows. The refs then report a `'standalone'` container and the
  actions are no-ops with a dev warning.
