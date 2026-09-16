# Progress

Appended at each gate. One row per attempt, so failures stay visible.

| Milestone | Gate | Tests | Notes |
|---|---|---|---|
| M0 spike | run 1 — **fail** | — | dev server died with its subshell (environment) |
| M0 spike | run 2 — **fail** | — | harness: `probe()` did not forward `id` into `page.evaluate` |
| M0 spike | run 3 — **fail** | — | harness: local `const URL` shadowed the global constructor |
| M0 spike | run 4 — **fail** | — | **implementation:** scroll/focus lost returning from hidden — preserved state must outlive the hidden period |
| **M0 spike** | **PASS** | 1 gate, 40 assertions | Both strategies preserve everything. S1 chosen ([0002](decisions/0002-zero-unmount-via-teleport.md)). [M0 record](evidence/M0.md) |
| M1 scaffold | run 1 — **fail** | 1 | missing dev deps: `@types/node`, `@eslint/js` — caught by the types and lint gates |
| **M1 scaffold** | **PASS** | 1 | Vite lib build, vue-tsc d.ts, vitest+jsdom, eslint, gate runner, 4 standing gates. All 6 gate rules proven non-vacuous by `npm run gate:selftest`. [M1 record](evidence/M1.md) |
| M2 pure logic | run 1 — **fail** | 115 | `findLeaf` unused; `Map` a reserved component name; `_`-prefixed unused vars |
| **M2 pure logic** | **PASS** | **115** | 9 modules ported, stylesheet 4072→3737 lines and prefix-complete, 10 rdd fixtures read faithfully. Found rdd defects D8/D9/D10. [M2 record](evidence/M2.md) |
| M3 store | run 1 — **fail** | 45 | `{ focus: false }` still stole the visible tab; one bad test |
| M3 store | run 2 — **fail** | 247 | `process.env` vs the build tsconfig; a writable-computed type; an inline `import()` type; api surface grew |
| **M3 store** | **PASS** | **247** | `createWorkspace` live before mount, one `activePanelId` resolution point (12 actions routed), D1–D4 fixed and pinned, **rdd layouts round-trip both ways**. [M3 record](evidence/M3.md) |
| M4 grid | run 1 — **fail** | 269 | browser gate: 0px-tall split divider (missing structural CSS); `dockPanel` trusted a stale `lastLeafId`; gate over-reached into M5's floating scope |
| M4 grid | run 2 — **fail** | 269 | eslint had no browser globals; api surface grew by `VddDesktop` |
| **M4 grid** | **PASS** | **269** | `<VddDesktop>`, recursive grid, tabs, split resize, persistence port. **Browser gate: one mount, video never restarts, scroll and focus restored at every visible step.** [M4 record](evidence/M4.md) |
| M5 floating | run 1 — **fail** | 294 | browser gate: corner handles did nothing (D5 clipping at window level); shadow read mid-transition |
| M5 floating | run 2 — **fail** | 295 | the gate found the same clipping in the `@media (pointer: coarse)` rules, which my own test had missed |
| **M5 floating** | **PASS** | **295** | drag, 8-way resize, maximise, anchored stacking (LTR+RTL), clamp. **Every handle measured exact in Chrome.** D5 rewritten — it is larger than catalogued. [M5 record](evidence/M5.md) |
| M6 drag-dock | run 1 — **fail** | 322 | gate matched its own comment about not using `:hover`; gates now strip comments |
| M6 drag-dock | run 2 — **fail** | 322 | inline `import()` type annotations; an unused test parameter |
| **M6 drag-dock** | **PASS** | **322** | every drop target driven with real pointer events, LTR + RTL + touch; reorder index correction; capture only on touch. [M6 record](evidence/M6.md) |
| M7 taskbar | runs 1–5 — **fail** | 342 | browser gate found: taskbar z-index and preview z-index missing (rdd had them inline); preview listeners bound to a `<Teleport>` root; the preview's function-ref teardown bypassed its own ownership check; two harness mismeasurements |
| **M7 taskbar** | **PASS** | **342** | three visibility modes, live previews (same node, scaled, still playing), touch tap-to-preview. Found D11 + D12. [M7 record](evidence/M7.md) |
| M8 menus | run 1 — **fail** | 373 | a non-`Node` event target crashed the dismiss handler — surfaced as an unhandled error *after* all tests passed |
| **M8 menus** | **PASS** | **373** | menu request as state, one builder for tab/window/taskbar menus, submenus, checkboxes, both dismissal paths. **D1 closed end to end.** [M8 record](evidence/M8.md) |
| M9 sidebar+toolbar | run 1 — **fail** | 506 | the api-surface gate held the new exports back until they were recorded; 21 type errors in my own test helpers (`ComponentMountingOptions` is the type to reach for, not `Parameters<typeof mount>`) |
| **M9 sidebar+toolbar** | **PASS** | **506** | 133 tests ported one-to-one, every rdd handle method mapped to a model. Found **D13** (unprefixed keyframes) and closed the sidebar half of **D12**. [M9 record](evidence/M9.md) |
| M10 overlays | run 1 — **fail** | 553 | api-surface held 23 new exports back until recorded; the M10 gate itself failed on a missing **D14** entry in PARITY.md and on one of its own regexes not matching a generic call |
| **M10 overlays** | **PASS** | **555** | one close sequence for four container kinds, the toast emitter deleted, dirty-close wired end to end. Found **D14** and a `containerType` bug. [M10 record](evidence/M10.md) |
| M11 overlay | run 1 — **fail** | 615 | ten tests died with "Maximum recursive updates": the stack-registration `watchEffect` read the state it wrote. Then the browser gate crashed on a null box (the second panel opened into the same leaf, hiding the overlay) and one lint error |
| M11 overlay | run 2 — **fail** | 615 | browser gate: my D5 corner probe aimed at a pixel outside the widget's painted shape; and the stacking assertion assumed an order the bucket does not guarantee |
| **M11 overlay** | **PASS** | **615** | **D5 measured** — 40 hit probes across 8 handles, visible-corner drag exact; stretch tracks a resizing panel; docked resize stops dead at a toolbar. Nine stale-closure refs deleted. [M11 record](evidence/M11.md) |
| M12 contributions+i18n | run 1 — **fail** | 673 | api-surface held 13 new exports; my own M12 gate rule rejected a parameter name it should have allowed; one union-type error and one reserved component name in my tests |
| **M12 contributions+i18n** | **PASS** | **673** | the milestone where the **D2 fix pays off** — a hidden panel's contribution is never surfaced, asserted three ways. i18n collapsed from three hooks to three workspace fields; `classes` ported with a stronger test than rdd's. [M12 record](evidence/M12.md) |
| M13 parity+docs | runs 1–12 — **fail** | 719 | the correspondence gate, mostly: five rdd suites missing from the test map, chapter 13 undrafted, four dead CSS rules, a dead `--vdd-z-base` hookup, a missing close-empty-group button, an infinite reactive loop in `<VddDesktop>`, a false-negative hole in the class scanner, and eleven rounds of the browser tour not reaching a state |
| **M13 parity+docs** | **PASS** | **719** | 26 suites accounted for, 54-state browser tour proves no rule is dead, `non-vacuity` sweep added (74 modules, 90.9% lines). Found **D15** and a real reactive loop. [M13 record](evidence/M13.md) |
| M14 demo | run 1 — **fail** | 719 | browser gate **hung with no output**: `page.evaluate` awaits its function's return, and `requestClosePanel` on a dirty panel only settles when answered |
| M14 demo | run 2 — **fail** | 719 | four reported failures, three of them the gate mis-modelling the app: its own `goto` counted as an unexpected navigation, a modal's curtain covers the panel that opened it, and the pre-save state snapshot was stale |
| **M14 demo** | **PASS** | **719** | 24 demo sources, 16 panel kinds, a 32-step walkthrough with no console errors. Found a Leaflet/overlay stacking conflict now documented in the manual. [M14 record](evidence/M14.md) |

## Decisions unlocked

- **0002** Proposed → **Accepted**. Zero unmount works in Vue; the cache-element strategy is chosen over reactive-target teleporting because its target can never become null.
- **0014** refined — preserved scroll/focus is owned per panel, not captured per move.
- **0015** added — TypeScript pinned to 5.x; `vue-tsc@3` cannot drive TS 7.
- **0013** (demo scope) carried out as written: Monaco, Leaflet and the whole `unified`
  pipeline kept; `react-bootstrap`, `react-intl` and `react-markdown` swapped. The library
  still has **zero runtime dependencies**, which the M14 gate asserts.
- **0004** again, and decisively: the i18n surface was three hooks in rdd
  (`useFormatMessage`, `usePredefinedMessages`, `useStyleClasses`) and is three fields on the
  workspace here, so a message can be resolved from a service.
- **0005** and **0007** together retire four props for two values: `defaultAnchor` +
  `defaultStretch` + `stretch` + `onPlacementChange` become one `v-model:placement`, which is
  rdd's own observation ("one gesture can change both") taken to its conclusion.
- **0006** again: nine refs that existed only to defeat stale closures in pointer handlers are
  deleted outright, since a Vue ref read in a handler is already current.
- **0004** (store outside components) applied to overlays: `<PanelProvider>` and
  `<ToolbarProvider>` both delete, and `openModal()` / `toast()` work from a service, a router
  guard or an error interceptor — which is where they are usually called from.
- **0006** (refs over subscriptions) exercised end to end: nine subscription/query members on
  rdd's panel contract become four refs and two hooks, with the one scheduling difference this
  exposes recorded as D14 rather than smoothed over.
- **0005** (v-model over imperative handles) exercised at full scale: eight handle methods across two components, all mapped. The mapping is recorded per test in the ported files' headers, so the vdd suite can be read against the React one.

## Findings fed back into the docs

- **D8, D9, D10** added to [PARITY.md](PARITY.md) §4 — rdd restyles the host page; a fourth
  dead CSS hookup (`.maximized` vs the rendered `vdd-maximized`); a third-party vendor class
  hard-coded in a framework-agnostic stylesheet.
- `api-surface` rewritten: it had been reporting a stale build's surface. Now reads `dist`,
  refuses a stale build, and covers type exports.
- **D13** added to [PARITY.md](PARITY.md) §4 — six of rdd's nine `@keyframes` are unprefixed
  (`fadeIn`, `scaleUp`, `slideInLeft`, `slideInRight`, `tooltipFadeIn`, `toolbar-flyout-in`).
  Keyframe names are global to the document exactly like class names, so any host stylesheet
  defining its own `fadeIn` silently replaces the library's animation. All nine are now
  `vdd-`-prefixed, and an M9 gate rule refuses an unprefixed one.
- **D12** widened — the sidebar's entire layout was inline in rdd's JSX (the row, the strip's
  collapse wrapper, the content wrapper's `flex-basis: 0`, the drawer's flex behaviour, each
  pane's box). Now in the stylesheet, with only the animating sizes left inline.
- **D14** added — a closing panel cannot observe its own deactivation with a default-flush
  watcher, because its component is unmounted in the same flush. rdd's synchronous ordering is
  still available via `flush: 'sync'`, and `onBeforeUnmount` is the deterministic hook; both
  are asserted, and the M10 gate fails if the divergence is dropped from the docs.
- A **`containerType` bug** found while measuring that ordering: a minimised *floating* panel
  reported `dockable-panel`, so one minimise/restore cycle looked like two container changes.
  A minimised panel now reports the container it will be restored to.
- **`demo:build` added to the standing gate** (M14), so the demo is proven to build the way a
  consumer would bundle it — and the runner learned a `// gate:app <name>` pragma, so a
  browser gate declares which app it needs rather than the runner keeping a list.
- **`non-vacuity` added as a standing sweep** (M13): coverage per module, so no source file
  can be carried along untested. Found seven unexercised modules, one of which (`core/rtl.ts`)
  had no importers at all and was deleted.
- **A false negative in `css-prefix`** (M13): the class scanner treated a ternary's `:` as an
  object separator, so a bare class in an else-branch was never checked. It had survived four
  earlier fixes, all driven by false positives. The scanner is now shared with the M13
  correspondence gate rather than duplicated.
- **`docs-api` added as a standing gate** (M12): a drafted manual chapter may only name
  `Vdd…` identifiers that are real exports, and may not mention a retired name outside its
  migration table. Generalises the narrow rule M11's gate needed. Makes the standing gate
  stricter, which integrity rule 2 permits — it is loosening that is forbidden.
- **A dead guard found by mutation.** The contribution store's "only withdraw my own
  registration" check was unreachable while the composable withdrew before publishing. That
  ordering also left a moment where a panel had published nothing; publishing first fixes both
  and makes the guard load-bearing. Two tests, two selftest cases.
- **`createWorkspace({ classes })`** added — rdd's `useStyleClasses()` had no vdd equivalent.
  Its tests assert the classes reach the rendered elements, which rdd's could not: they only
  checked that a hook returned its own input.
- **Leaflet paints over the panel overlay** (M14): its map panes are `z-index: 400`, higher
  than a floating widget's, so the overlay was present and invisible. The library cannot know
  what a panel renders, so the fix is a stacking context on the application's own element —
  now a section in manual chapter 7 rather than a one-line workaround in the demo.
- **D15** added — rdd's tab-bar overflow scroll buttons are not ported. Recorded as a known
  gap rather than discovered later; the three dead CSS rules they left behind were removed.
- **A dead hookup in vdd's own code** (M13): `zIndexBase` was configurable and the stylesheet
  read `--vdd-z-base`, but nothing wrote the variable — so the option did nothing at all.
- **A missing affordance found through its dead CSS** (M13): no button existed to close an
  empty split group, so `closeLeafGroup` had no caller and three rules matched nothing.
- **An infinite reactive loop** (M13): the floating-window clamp wrote on "a bound was
  exceeded" rather than "a value changed", and re-triggered its own deep watcher. Extracted as
  a pure function with a fixed-point test across 42 viewport/box combinations.
- **D5 is closed and measured**, on inner widgets as well as windows: every handle's full
  nominal area is hittable, and a press on the visible corner moves both edges by the exact
  pointer delta. The gate's first framing of that assertion was wrong and is documented in
  [M11 record](evidence/M11.md) — the pixel it probed lies outside the widget's
  painted shape, so it was never a defect.
- **A weak test inherited from rdd**, found by mutation: PO25 could not distinguish "clears
  both buckets of its edge" from "clears only its own corner", because rdd put the taller
  widget in the strip's own corner. Fixed, and the mutation is now caught.
- **Doc drift is gated**: two documents still described the two-model placement shape M11
  replaced, so the M11 gate now reads them and rejects the retired model names. Third finding
  from drafting a manual chapter against the shipped API rather than the plan.
- A **parity gap closed**: rdd's `ContextMenuAdapter` had no vdd equivalent and was recorded
  in no section — found while drafting the manual chapter that had promised it. It is a slot
  on `<VddContextMenu>` now, and PARITY.md gained a "Closed during the port" heading.

## Gate infrastructure

`npm run gate -- M<n>` runs: types · lint · tests (JSON captured once, reused by `counts`) ·
build · counts · css-prefix · api-surface · **docs-api** · the milestone's own gate · its
browser gate if one exists. `npm run gate:sweep` runs the **non-vacuity** coverage sweep,
whose result the M13 gate checks. A milestone with no gate script **cannot** pass. `npm run gate:selftest` proves
each rule catches its own violation.

## Listed skips

None. Any `it.skip` must appear here with a reason, or the gate fails.

## Environment notes

- `spike/` is the M0 throwaway. Kept as a working reference for the real persistence port; removed once M4 lands.
- The M0 gate needs `npx vite --port 5199` running in `spike/`, started **in the background** — a `( … &)` subshell does not survive the shell call.
