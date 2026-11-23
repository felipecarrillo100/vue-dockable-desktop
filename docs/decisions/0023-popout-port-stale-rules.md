# 0023 — Milestone rules after the pop-out port: three code fixes, seven rules that followed the code

**Status:** Accepted (2026-11-22, during the unattended 1.14.0 port; owner to review). Integrity
rule 1 asks for this: a gate that is wrong is changed by a decision record. The procedure and the
precedent are [0020](0020-stale-milestone-rules.md).

## Context

The 1.14.0 `gate:release` passed every gate except five old milestone **rule** gates (static source
checks), M3, M8, M9, M10 and M11. The library was not broken: the port moved code into new shapes
that the rules did not know. These are the changes:

- every piece of chrome that can show in a pop-out window takes its document from its own element:
  `docOf(el).body` as a Teleport target, `isNode` for `instanceof Node`, and `resizeObserverFor`
  for `new ResizeObserver` (ADR 0022);
- Escape goes through `listenOnDocuments` and is answered only in the element's own document;
- `focusPanel`'s old body became the `@internal activatePanel`, so that a click inside a pop-out
  activates the panel without bringing its window forward again;
- a return from a pop-out is worked out on a copy (`Snapshot`) and written back by `applySnapshot`.

We checked each failure against the code before changing any rule. Where the code could keep the
rule's shape at no cost, the code changed. Where it could not, the rule changed.

## Decision

### Code fixes (the rule caught something, or the old shape cost nothing)

1. **M3, "assigned in 4 places".** `applySnapshot` wrote the copy's `activePanelId` directly. That
   is a placement action deciding for itself: a second resolution path beside `resolveActive`,
   which D2 forbids. It now writes the layout and calls `resolveActive(next.activePanelId)`, which
   decides on the live state and sends `panel:activated`. The visible behaviour is unchanged: the
   copy's value was already resolved the same way (`resolveActivePanelId`), except that a stale
   copied value can no longer be written. No test changed. The M3 selftest seed proves the rule
   catches the old line.
2. **M8, "bubbled window click listener".** The menu listens on the main `window` by name again,
   and on its own window when that is another one. It has the same listeners as before.
3. **M8 and M9, "Escape must dismiss".** In the menu and the toolbar flyout, `onKey` tests
   `event.key === 'Escape'` again, as one condition with the claim check and the own-document
   check. The behaviour is the same.

### Rules that followed the code (the behaviour is the same, only where it is written moved)

4. **M3, "focusPanel does not route".** `focusPanel` calls `activatePanel`, which ends at
   `resolveActive`. The rule now **also checks `activatePanel`** as a placement action, and accepts
   a call to it as a route. It is stricter than before: a marker must match the whole name, so
   `function focusPanel` no longer finds `focusPanelWindow`.
5. **M9, flyout teleport.** The rule accepts `:to="target ?? 'body'"`, but only when `target` is
   set to `docOf(button.value).body`. It still fails with no Teleport, and with a target that is
   not a body.
6. **M9, non-Node guard.** The rule accepts `if (!isNode(target)) { close(); return }` as well as
   `target instanceof Node`. It still fails with no guard.
7. **M10, toast observer target.** The rule accepts `observer?.observe(body.value)`, and when
   `resizeObserverFor` is used it requires `resizeObserverFor(body.value, applyHeight)`. It still
   fails when the card is observed.
8. **M10, the height sync is optional.** The rule accepts `resizeObserverFor` with
   `observer?.observe`, but only while `domContext.ts`'s `resizeObserverFor` returns null when
   there is no `ResizeObserver`. It still fails on a bare `new ResizeObserver`.
9. **M11, toolbar re-measures.** The rule accepts `observer = resizeObserverFor(node, measure)`
   followed by `observer?.observe(node)`. It still fails when nothing observes.
10. **M11, search dropdown teleport.** The rule accepts `:to="dropdown.body"`, but only when that
    body is `docOf(node).body`. It still fails with no Teleport, and with a target that is not a
    body.

Following rule 6 of 0020, every updated rule and every code fix has a seeded violation in
`scripts/gates/selftest.mjs` (13 new checks). Three seeds whose anchors the port had made stale now
point at today's code: the M11 toolbar and search, and M10's panelId order (`VddPanelMount.vue`'s
template is indented one level deeper).

One limit stays as it was. M3 accepts a call to `restorePanel` as a route, and `activatePanel`
calls it in its restore branch, so the rule alone does not see `activatePanel`'s final
`resolveActive(id)` removed. The old `focusPanel` had the same limit. The assignment count still
catches that line being replaced by a direct write, and a selftest seed proves it.

## Consequences

- M3, M8, M9, M10 and M11 pass on 1.14.0, and each still fails on the defect it was written for.
- As 0020 said, rules that pin a written form go stale. The port's helpers (`docOf`, `isNode`,
  `resizeObserverFor`, `listenOnDocuments`) are now the standard form for chrome that can be in
  another document. New rules should accept these helpers from the start.
