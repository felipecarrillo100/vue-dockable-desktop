# M3 — Store, workspace, registry · **PASS**

`npm run gate -- M3` · raw: [gate.json](gate.json) · manifest: [tree.txt](tree.txt)

```
  ok  types · lint · build · counts · css-prefix · api-surface · M3
  tests: 247/247 across 15 files
M3 GATE: PASS
```

Target was ~55 tests; landed **247 total** (132 new this milestone).

## What exists now

`createWorkspace(config)` — the reactive store, every action, the panel registry, the event
bus, persistence — plus `useWorkspace()` and `usePanel()`. No rendering yet.

| | |
|---|---|
| `core/workspace.ts` | state + 25 actions + save/load |
| `core/eventBus.ts` | typed pub/sub, with a separate internal path for the library's own events |
| `composables/useWorkspace.ts` | refs + actions, destructurable; auto-disposing `subscribe` |
| `composables/usePanel.ts` | a panel's view of itself — all refs, two registrations |

## The store is live before any component

The M3 gate proves it by *running* it: create a workspace with no Vue app in existence, open
a panel, save, reload. rdd needed `_connect`, `_disconnect`, `_pendingCalls`,
`_pendingOpenPanelIds`, `_pendingSubscriptions`, a never-connected warning timer and an
`isConnected` flag to paper over the gap between "client created" and "state exists". The
gate also asserts **none of those names have crept back**.

Consequence for the suite: rdd drove its event-bus tests through mounted components because
its bus only existed inside a provider. Here the same assertions hold with no component at
all — and V2Features' four pending-queue tests are **moot**, recorded in PARITY §3 rather
than quietly dropped.

## One resolution point for `activePanelId`

Divergence D2 exists because rdd decided the active panel action by action, and five actions
forgot to. Here there is exactly one `resolveActive()`, and the gate enforces three things:

1. exactly one definition of it;
2. `state.activePanelId` is assigned in exactly **three** places — the resolver, `focusPanel`'s
   deliberate minimized case, and `loadLayout` (which takes what the snapshot resolved). A
   fourth assignment fails the gate;
3. all **12** placement actions route through it.

That is the difference between fixing a bug and making it unrepeatable. Two self-test cases
prove the gate objects when an action decides for itself, or when the handshake returns.

## Layout compatibility — now verified in both directions

Brought forward from M6, because a hard requirement is worth failing early. All 10 rdd
fixtures **round-trip**: load → save is deep-equal on `gridRoot`, `minimized`, `panels`,
`floating` and `activePanelId`, and saving twice is byte-identical. It passed first try.

Also covered: pruning of non-serialisable panels (excluded from the snapshot, pruned from
the tree, still working on screen), the `layout:panels-excluded` announcement, `activePanelId`
omitted when the active panel was itself excluded, and state providers pulled fresh on every
save with serialisability re-checked each time.

## Defects fixed and pinned by tests

| | |
|---|---|
| **D1** | `maximizePanel` on a minimized panel restores it first, then maximises. rdd only mapped over `floating`, where a minimized panel is not, so its taskbar menu item did nothing |
| **D2** | every placement action resolves the active panel; a test asserts leaf selection and `activePanelId` can never disagree |
| **D3** | `openPanel` on a minimized panel honours `lastLeafId`, like `restorePanel`. The test builds the two-live-leaf layout that actually distinguishes them |
| **D4** | re-opening a minimized panel publishes `panel:restored` **and** `layout:changed`; a second test counts one `layout:changed` for each of eight placement actions |

## A real bug the tests caught

`{ focus: false }` did not work. `addPanelToLeaf` always selected the panel it added, so a
"background" panel still became its leaf's visible tab while another panel stayed globally
active — the D2 symptom, reintroduced by my own code.

Worth noting: **rdd has this bug too.** Its `openPanel` keeps the old `activePanelId` on
`focus: false` while its `addPanelToLeaf` moves the leaf selection, so the two disagree by
construction. The fix here is that `addPanelToLeaf` takes an explicit `select` option and
"open in the background" means not taking the visible tab either.

## Fixes during the milestone

- Generic event payloads were unprovable: `TEvents & BuiltInEvents` cannot be satisfied by a
  built-in payload, since an application could narrow a built-in key. Added a typed internal
  `emit()` for the library's own events so its call sites are checked rather than cast.
- A test provided and injected in the *same* component. Vue resolves `inject` from the parent
  chain, so self-injection does not work — the container must be the panel's parent, which is
  how the real thing is shaped too.
- `process.env.NODE_ENV` failed the build tsconfig, which excludes Node types on purpose. A
  narrow ambient declaration in `src/env.d.ts` replaces it, with the reasoning recorded
  there: every bundler replaces `process.env.NODE_ENV`, so dev warnings vanish from
  production builds, while `import.meta.env.DEV` would tie the library to Vite.
- `ReturnType<typeof computed<T>>` is the *writable* variant; `ComputedRef<T>` is the right type.
- An inline `import('vue').InjectionKey<…>` annotation, and a literal double space in a gate regex.
