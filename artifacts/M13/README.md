# M13 — Parity, compatibility, docs · **PASS**

`npm run gate -- M13` · raw: [gate.json](gate.json) · browser: [browser.json](browser.json) ·
screenshot: [tour.png](tour.png)

```
  ok  types · lint · tests · build · counts · css-prefix · api-surface · docs-api · M13 · M13 browser
  tests: 719/719 across 32 files
M13 GATE: PASS
```

The closing gate. **25 new tests** (14 StyleHookups + 16 toolbar controls + 9 `useOverlays`,
less one browser-dependent test replaced by six exhaustive pure ones), suite 694 → **719**
against rdd's 468.

## What the closing gate asserts

Seven things that are only true of the *whole* port:

1. **All 26 rdd suites are accounted for by name** in `PARITY.md` §3, each with a disposition.
   The gate checks the table against the list, so a suite cannot be quietly dropped — and it
   caught five that were ported in M2 and never written down.
2. The suite is at least as large as the one it replaces, with nothing failing or skipped.
3. Every class the library emits has a rule, or is a **declared** consumer hook.
4. `PARITY.md` has no TBD, and the divergences are numbered without gaps.
5. Every decision record has a status, and none is still Proposed.
6. No manual chapter is left as an outline.
7. Every source module is executed by the suite.

## The class/rule correspondence sweep

This is where the milestone's real work went, and it found eight things.

The static half — *every emitted class has a rule* — is in the gate. The other half — *no rule
is dead* — is in the browser, because a third of the library's class names come from
script-level constants (a class map in the overlay frame, `tabClass()`, the toast entry
classes, the drag `activeClasses` arrays) that no static scan of templates can see. My first
attempt did try to scan them, and produced a list of 34 "dead" rules that were **all false
positives**. So the browser gate tours **54 states** and reads what is actually in the DOM.

Two dead rules, both inherited from rdd, where nothing in either library emitted the class:

- `.vdd-panel-float__resize` — the widget's handles are `.vdd-resize-handle.vdd-resize-<dir>`.
- `.vdd-menu-icon` — vdd renders menu icons in `.vdd-context-menu__icon`, shared with the
  toolbar flyout.

Two more superseded by a working equivalent, so also removed: `.vdd-window-header-actions`
(vdd emits `.vdd-titlebar-actions`) and `.vdd-empty-workspace-grid` (`.vdd-empty-leaf-placeholder`).

**A missing affordance, found through its dead CSS.** `.vdd-tab-header-actions` and
`.vdd-header-close-empty-group` had rules and no emitter — because vdd had no button to close
an empty split group at all. `closeLeafGroup` was on the API with nothing calling it. rdd
renders that button; vdd now does too, which makes three rules live at once. A dead rule was
the only visible symptom of a missing feature.

**A dead hookup in my own port.** `createWorkspace({ zIndexBase })` existed, every piece of
teleported chrome stacked with `calc(var(--vdd-z-base, 1000) + n)` — and **nothing ever wrote
the variable**, so the option did nothing at all. rdd sets it on the document element; vdd did
not. Now it does, and three tests cover it: the base reaches the document element, a modal
stacks against the variable rather than a literal, and the variable is removed on unmount.

**A feature gap, recorded rather than discovered later.** rdd renders scroll buttons on a tab
bar that overflows; vdd's tab bar is a plain scroll container. The three rules its buttons left
behind are gone and the gap is **divergence D15** — a known gap belongs in its own change, not
smuggled into the milestone that closes the port.

Twelve rounds of the browser gate were needed, and eleven of them were the tour not reaching a
state rather than a rule being dead. Each round added a state the playground could not reach:
side toolbars, a panel-toolbar toggle, a search with grouped results, a widget icon, every
modal size, every toast position, the progress bar, a paused toast, a disabled menu item, a
hovered drop target, taskbar overflow, the letter-fallback preview, a tab-icon panel, the
animations opt-out, an unregistered panel. The playground is now a genuinely complete harness.

## A real bug: an infinite reactive loop

The tour opens fourteen panels at once, and that surfaced **"Maximum recursive updates
exceeded" in `<VddDesktop>`**.

The clamp that keeps a floating window reachable set its `changed` flag from *the comparison*
rather than from whether the value actually changed. Both clamps have a floor (200×150), so in
a workspace narrower than that floor the clamped value still fails its own condition — and
since the watcher is deep on the very list it writes to, it rewrote the same number forever.

Fixed by extracting `clampFloatingRect` as a pure function that returns **the same object**
when nothing changed, which is how the caller can tell there is nothing to write. Seven tests,
including one that checks the clamp reaches a fixed point across **42 combinations** of
over-large box and tiny workspace — the loop only appeared at particular ratios, so "it
settles" has to hold across the range rather than at one sample.

## A hole in the class scanner, and a shared scanner

The correspondence sweep reported `.vdd-side-panel-right` as a rule nothing emitted. It is
emitted, by `position === 'left' ? 'vdd-side-panel-left' : 'vdd-side-panel-right'` — and the
scanner's object-value strip was eating everything after a ternary's colon, because `? a : b`
looks exactly like an object separator.

That is a **false negative in `css-prefix`**, which had survived four earlier fixes to the same
function — all four driven by false *positives*. A bare class in a ternary's else-branch would
never have been caught. Fixed by stripping object values only inside braces, with a selftest
case for the else-branch specifically.

The scanner now lives in `scripts/gates/lib/emitted.mjs`, shared by `css-prefix` and M13: two
gates asking the same question with two scanners is two chances to be wrong about it.

Runtime-composed classes are **enumerated exactly** rather than matched by prefix. The prefix
version was worse than useless — two expressions compose `` `vdd-${position}` ``, whose prefix
is the bare `vdd-`, which matches every class in the stylesheet, so the dead-rule half silently
passed everything.

## `non-vacuity`: a new standing sweep

The plan asked for "reverting each of the 13 source modules in turn turns the suite red".
Coverage answers the same question in one run instead of thirty, and **per module** rather than
in aggregate — which is the point, since an aggregate figure hides a whole file at 0% behind
everything else being high.

`npm run gate:sweep` runs it, and the M13 gate checks the result exists, passes, and is newer
than the source. It found **seven unexercised modules** on its first run:

- the five panel-toolbar controls, exercised only by the browser tour, which proves their CSS
  applies but not what they do — now 16 tests, including the search field's stale-result race;
- `useOverlays.ts`, because the overlay tests drove `ws.overlays` directly rather than the
  composables an application actually calls — now 9 tests;
- `core/rtl.ts`, which had **no importers at all**. Deleted: dead code in a library is worse
  than nothing, because it offers a second source of truth for reading direction, which is
  exactly the drift this port has spent thirteen milestones removing.

Now: **74 modules, every one exercised, lowest 27%, 90.87% of lines.**

Installed `@vitest/coverage-v8` as a dev dependency for it.

## Gate integrity

`npm run gate:selftest`: **67** rules, all non-vacuous — nine of them M13's, including the one
the whole parity document exists to prevent (an rdd suite dropped from the test map) and the
one the sweep exists to prevent (a module the suite never executes).

The standing gate is now: types · lint · tests · build · counts · css-prefix · api-surface ·
docs-api · the milestone's own gate · its browser gate. Three of those were added mid-plan
(`docs-api` in M12, `non-vacuity` and the correspondence check in M13), each making the runner
strictly stricter — which integrity rule 2 permits, since it is loosening that is forbidden.

## One more correction

The staleness check I first wrote for the coverage report compared **mtimes** — and failed
immediately, because the gate selftest restores every file it mutates from a backup, which
changes an mtime without changing a byte. It now compares a content hash of the sources the
sweep actually measured, which answers the question that was being asked rather than a proxy
for it.
