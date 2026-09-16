# M10 — Side panels, modals, toasts, dirty state · **PASS**

`npm run gate -- M10` · raw: [gate.json](gate.json)

```
  ok  types · lint · tests · build · counts · css-prefix · api-surface · M10
  tests: 555/555 across 25 files
M10 GATE: PASS
```

**49 new tests** (6 side-panel/modal, 16 toast, 25 lifecycle, 2 context-menu slot), suite
506 → 555. No browser gate: everything here is DOM structure, state and event routing.

## The duplication rdd could not avoid, removed

rdd's `SidePanelRenderer` and `ModalStackRenderer` each carried their own copy of the close
sequence — the guard, the dirty check, the confirmation modal, the title asterisk, the
`setDirty`/`setTitle` plumbing, the Escape handler. Thirty-five of those lines were
character-for-character identical.

Here there is one `requestClose` in the store and one `useOverlayHost()` composable; the two
hosts differ only in their chrome, and even that is shared through `VddOverlayFrame`. The gate
asserts neither host re-implements the dirty check or the Escape handler.

**Escape routing was the clearest symptom.** The rule is one rule — the topmost modal answers,
and a drawer answers only when no modal is open — and rdd stated it twice in two different
shapes: `modals.length === 0` in the drawer, `isTopmost` in the modal. It is now one function,
and the gate pins all three of its parts, including the `stopPropagation` without which the
drawers listening on the same document close along with the modal.

## Asking the user is now the default

This is the milestone's real finding. rdd wired the unsaved-changes question separately into
each container — and **never wired it into the docked-panel path at all**. Closing a dirty tab
in the workspace went straight through `closePanel`.

vdd has six close call sites (a tab's ×, a floating window's ×, a taskbar menu, a drawer, a
modal, `usePanel().close()`), and after this milestone none of them knows the question exists:
`requestClosePanel` defaults `onConfirm` to `overlays.confirmDiscard`, which `<VddModals>`
registers on mount. One implementation, reached from everywhere, so a tab and a drawer cannot
answer differently.

Two safety properties the gate pins, because getting either backwards silently destroys a
user's work:

- `confirmDiscard` resolves **false** when no renderer is registered. Mount no `<VddModals>`
  and a dirty close refuses rather than discarding — you cannot ask without somewhere to
  render the question, and refusing is the only acceptable default.
- The question resolves on **unmount**, not only on its buttons. Escape, the backdrop and the
  × are all refusals, and an awaiting `close()` would otherwise hang forever on them.

## The toast emitter is gone

rdd routed every `toast.*` call through an event emitter that `<ToastContainer>` subscribed
to. That emitter existed for exactly one reason: React state cannot live at module scope, so
a call made outside React had no way into a component's `useState`.

In Vue the queue *is* module-level reactive state, so `toast()` pushes and `<VddToasts>`
renders. Consequences worth having: two containers show the same toasts instead of racing for
the subscription, a test can assert the store with nothing rendered, and a toast raised before
any container mounts is **kept** rather than dropped — asserted in T1, where rdd could only
assert "does not throw".

`maxVisible` followed. rdd kept the overflow in a second array and shifted from it
imperatively when a toast finished exiting. Here everything is in one queue and the container
renders a `computed` slice, so promotion is not code at all — T10 asserts it as state. The one
piece that did need care: a toast dismissed while still queued has never been rendered, so
nothing will ever report its transition ending. The container drops it, because the container
is the only thing that knows whether a given toast was on screen.

rdd's T13 regression — `toast.promise()`'s pending message becoming a longer error and being
clipped — is ported with its mechanism intact, and the gate pins the two non-obvious parts:
the observer watches the *inner body* (the card holds its own height fixed and so never
reports a resize) and reads the *card's* `scrollHeight` (the only measurement that reports
true content height through a stale cap).

## Two divergences

**D14 — a closing panel cannot observe its own deactivation with an ordinary watcher.** The
plan flagged this in advance: rdd fired `onDeactivate` synchronously before `onClose` and
asserted that order, and Vue queues watcher callbacks. I measured it rather than assuming, and
the answer is precise:

- `watch(isActive, fn, { flush: 'sync' })` **does** see the deactivation before
  `panel:closed` is published — rdd's ordering is available, just not by default.
- A default-flush watcher does not, and *cannot*: the panel's own component is unmounted in
  the same flush, so its watcher is disposed before it would have run. For "before I go" work
  the Vue answer is `onBeforeUnmount`/`onScopeDispose`, which runs deterministically.

Both halves are asserted by one test and pinned by the gate, and the gate also fails if D14 is
dropped from `PARITY.md` — which it caught on the first run, when I had written the test but
not yet the divergence.

**A real bug found: `containerType` lied about minimised panels.** It read
`state === 'floating' ? 'floating-window' : 'dockable-panel'`, so a *minimised floating*
panel reported `dockable-panel` — and one minimise/restore cycle looked like two container
changes to anything watching. That is exactly the false signal rdd's `onContainerTypeChange`
promised not to send. A minimised panel now reports the container it will be restored to,
which is also what it still belongs to: minimising takes a panel off screen, it does not move
it. Found by probing the ordering rather than by a test — the test came after.

## Six subscription methods became refs

rdd's `FormContainerContract` gave a panel `onActivate`, `onDeactivate`,
`onContainerTypeChange`, `onClose`, `onMinimize`, `onRestore`, plus `getDimensions()`,
`onResize()` and a `usePanelSize()` hook wrapping both. `usePanel()` answers all nine with
four refs and two hooks, and the ported test file tabulates the mapping so the two suites can
be read against each other.

`usePanelSize()` has no vdd equivalent by design: it was a `useSyncExternalStore` bridge whose
whole job was turning a subscription into something a render could use. `size` is already a
ref.

## Fixes during the milestone

- I wrote a module-level `visibleIds` Set with a setter so the toast store could tell a queued
  toast from a rendered one. That is a rendering concern in the wrong file; pruning moved into
  the container, and the store now only marks.
- `useSidePanels().closeAll()` initially called `overlays.closeAll()`, which also closes every
  modal. It now closes the two drawers and leaves the stack alone.
- The gate's own first run failed on two rules, one of which was a regex that did not match a
  generic call (`reactive<T>(`) — a gate that cannot see the thing it checks is worse than no
  gate, so it is in the selftest now like the rest.

## A parity gap found while writing the manual

Chapter 8's outline promised "supplying your own context-menu renderer". There wasn't one:
rdd's `ContextMenuAdapter` and `DefaultContextMenuAdapter` had no vdd equivalent, and the gap
appeared in no section of `PARITY.md` — it had simply been missed, and would have stayed
missed had the chapter not been written against the shipped API.

rdd's adapter is an object with a single field: a component to swap in for the menu. That is
what a slot is ([ADR 0007](../../docs/decisions/0007-slots-over-render-props.md)), so
`<VddContextMenu>`'s default slot now receives `{ items, x, y, close }` and replaces the
built-in markup — no adapter object, no provider, no ref handshake. Two tests cover it, and
`PARITY.md` records it under a new "Closed during the port" heading.

Worth noting as a process point: drafting each manual chapter against the shipped API, rather
than from the plan, is what surfaced this. It is the second thing the docs have caught.
