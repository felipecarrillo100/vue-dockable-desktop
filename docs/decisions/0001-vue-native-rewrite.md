# 0001 — A Vue-native rewrite, not a transliteration

**Status:** Accepted

## Context

rdd is ~14,700 lines across 28 source files. A mechanical port is possible: React hooks map
to composables, portals to teleports, `forwardRef` to `defineExpose`. It would also be a
mistake. A meaningful share of rdd's code and public API exists *only* to work around
things React cannot do natively, and carrying that into Vue would produce a library that
Vue developers find alien and that is larger than it needs to be.

The owner's instruction: *"rather than trying to emulate React particularities, we will
rewrite it so that this feels as a native Vue project, made by Vue developers for Vue
developers, using the Vue philosophy."*

## Decision

Same feature set, same domain vocabulary, same serialised format. Everything else is
designed from the Vue side. Concretely, the following exist in rdd and do **not** survive:

| Deleted | Why it existed in React |
|---|---|
| `useSyncExternalStore`, `stateRef`, `subscribeToState`, `getSnapshot`, `WindowStoreSyncContext`, and the `useWindowManagerState()` / `(selector)` overload pair | Fine-grained re-render control. Vue's reactivity is fine-grained by default. |
| `WorkspaceClient._connect`/`_disconnect`, `_pendingCalls`, `_pendingOpenPanelIds`, `_pendingSubscriptions`, `_startWarnTimer`, `isConnected` (~100 lines) | Actions only exist once a component has mounted. In Vue the store is live from creation. |
| `SidebarHandle`, `ToolbarHandle` | React cannot express two-way props. Vue has `v-model`. |
| Six subscription methods on `FormContainerContract`, plus `getDimensions()` and `usePanelSize()` | No way to hand a component reactive state. |
| `PanelContributionStore`'s listener set and `notify` (~60 lines) | External-store plumbing. |
| `ToastEmitter`'s subscribe/unsubscribe | Same. |
| `usePanelFloatingWindow()` | Held a single boolean, because `open`/`onClose` could not be one prop. |
| `<DockableDesktopProvider>`'s five nested providers | Context is the only composition primitive. |

And these Vue capabilities are used as first-class design tools, not as translations:
`reactive`/`computed`, `v-model` (`defineModel`), scoped slots, `provide`/`inject`,
`effectScope`/`onScopeDispose` for automatic cleanup, and the `create*` + `app.use()` plugin
idiom already familiar from Pinia and Vue Router.

## Consequences

- The public API is **smaller** than rdd's, while doing the same things. That is the point.
- The rdd test suite cannot port mechanically — see [0011](0011-tests-as-specification.md).
- A user migrating from rdd must rewrite call sites, not just imports. The migration guide
  and [PARITY.md](../PARITY.md) section 1 exist to make that mechanical; the compatible
  layout format ([0009](0009-layout-json-compatibility.md)) means their users' data
  survives even when their code changes.
- Two libraries with the same name, feature set and format but different surfaces have to
  be documented separately. Accepted.
