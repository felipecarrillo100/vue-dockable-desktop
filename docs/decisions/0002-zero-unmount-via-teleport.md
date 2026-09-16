# 0002 — Zero unmount via `<Teleport>` over a cached element

**Status:** Accepted — proven by the M0 spike ([artifacts/M0](../../artifacts/M0/README.md))

## Context

The defining feature of this library is that **a panel is mounted once and never
unmounted** while it is open. Moving between docked, tabbed, floating and minimised states
re-parents its DOM instead of re-creating it. That is what lets a panel hold a WebGL map,
a Monaco editor model, a playing video, an open WebSocket or simply a scroll position
without losing it on every layout change.

rdd achieves it with a module-level `Map<string, HTMLDivElement>` of cache elements. Panel
content is rendered by `createPortal` into the cache element; the cache element is then
imperatively `appendChild`-ed into whichever host currently owns the panel (a leaf body, a
floating window body, the taskbar hover preview, or a hidden `display:none` container).
React never knows the element moved.

## Decision

Use the same architecture, with `<Teleport :to="cacheEl">` in place of `createPortal`.

**The M0 spike proved two strategies work, and this one was chosen.** Both preserved
everything through `docked → tabbed → floating → minimised → restored elsewhere`:

| | Mechanism | Result |
|---|---|---|
| **S1 — chosen** | Teleport to a stable per-panel cache element; move that element imperatively | PASS |
| S2 | Teleport straight to the host and change `to` reactively, letting Vue move the nodes | PASS |

S2 is the more idiomatic-looking of the two — no imperative DOM work at all — and it was
tempting. S1 wins on a single structural argument: **its teleport target can never
disappear.** A cache element exists for the panel's whole lifetime, so no sequence of layout
changes can unmount the panel. With S2 the target *is* a host element, so any code path where
a host is destroyed and re-created — a leaf being split, a floating window closing — briefly
yields a null target, and a Teleport with no target renders nothing, which unmounts the panel
and destroys exactly the state this whole design exists to protect.

S2 can be made safe by always falling back to the hidden container instead of rendering
nothing. But then the guarantee rests on remembering that fallback in every present and
future code path, whereas S1's guarantee is a property of the structure. For the library's
central promise, a structural invariant beats a discipline.

The imperative part is confined to one ~40-line module, and placement itself stays fully
declarative: the store owns *where* each panel belongs, a watcher observes the resolved
target element, and only the final `appendChild` is imperative. Nothing in the public API
exposes any of it.
`Teleport`'s `to` accepts an actual `HTMLElement`, and Vue keeps the component instance in
the component tree while its rendered DOM lives at the target — the property we need.

Rejected alternative: **`<KeepAlive>`**. It caches the inactive subtree of a *single*
dynamic slot. We need many panels alive simultaneously in different hosts, and one panel to
keep running while off-screen. `KeepAlive` also fires `onDeactivated`, which is the wrong
semantic — a minimised panel here is not deactivated, it is merely not visible.

Two implementation constraints follow:

1. A `Teleport` target must already be in the document when the teleport mounts, so cache
   elements are appended to the hidden container at creation time, before any panel renders.
2. The cache element's identity must be stable for the panel's whole lifetime. Moving it is
   an imperative DOM operation outside Vue's knowledge, which is exactly why it works.

## Consequences

- The zero-unmount guarantee needs its own test suite, replacing rdd's `DomStability`
  (which asserts React-portal specifics). Asserting *that a specific DOM node is the same
  node* before and after each transition is the only honest test of this.
- Panels are always rendered, even when minimised. Their watchers run and their timers
  tick — identical to rdd, and the reason `activePanelId` correctness matters so much
  ([0012](0012-fix-known-defects.md), D2).
- Vue devtools shows every panel in the tree regardless of where it appears on screen. This
  confuses people; the manual should say so.
- The fallbacks listed here before M0 — render-in-place, fixed containers with transforms,
  or one Vue app per panel — are no longer needed. Kept in the history for the record only.
- **Watch the resolved target element, not the placement state.** On a watcher's first
  (`immediate`) run, host template refs have not been assigned, so every target is `null`.
  Watching placement alone parks every panel in the hidden container with nothing left to
  re-trigger the move. Found in M0.
- **An `<iframe>` inside a panel reloads** on every re-parent. No strategy prevents this;
  it is how iframes work. Documented as a limitation in the manual.
