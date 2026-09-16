# 0004 — The workspace is created outside the component tree

**Status:** Accepted

## Context

`WorkspaceClient` is rdd's best idea: configuration and imperative control live in a plain
object created before React renders, so application code can call `openPanel()` from
anywhere — a service, an event handler, a router guard — without being inside a component.

But in React the *state* cannot live there. The state lives in `useState` inside the
provider, so the client is only a proxy that has to wait to be connected. Hence
`_connect(actions)`, `_disconnect()`, `_pendingCalls`, `_pendingOpenPanelIds`,
`_pendingSubscriptions`, `_startWarnTimer`, `isConnected`, and documented caveats such as
*"calls made before the provider mounts are queued and replayed"* and *"the caller can't
observe the eventual outcome of a queued call"*.

## Decision

`createWorkspace(config)` owns the reactive state directly. There is nothing to connect.

```ts
// main.ts
const workspace = createWorkspace({ panels: { … }, initialState: saved })
workspace.openPanel('map-1', 'map')   // works immediately — no app, no components yet
createApp(App).use(workspace).mount('#app')
```

The returned object is a Vue plugin (`install(app)`), which `provide`s itself for
`useWorkspace()` and registers the components globally. Same shape as `createPinia()` and
`createRouter()`, so it needs no explanation to a Vue developer.

## Consequences

- ~100 lines of queueing machinery deleted, along with every caveat about it.
- `isConnected` is gone. There is no disconnected state to observe.
- `saveLayout()` can no longer return `''` because nothing was mounted; it always returns a
  real layout.
- rdd's `V2Features` tests covering the queue become moot rather than ported
  ([0011](0011-tests-as-specification.md)).
- Multiple independent workspaces on one page are now trivial: create two, provide them in
  different subtrees. In rdd this was possible but awkward. (Note: rdd has genuine
  module-level singletons — `closeHandlers` and `idCounter` in `PanelProviderContext` — that
  vdd must move onto the workspace instance for this to hold.)
- A workspace outlives any component that uses it, so its teardown is explicit
  (`workspace.dispose()`) for apps that create them dynamically. Single-workspace apps never
  need it.
