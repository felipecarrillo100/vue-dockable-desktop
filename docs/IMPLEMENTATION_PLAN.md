# Implementation plan

One plan, executed straight through. Every milestone ends in a **gate**: a command whose
exit code decides pass or fail. Gates pass → the next milestone starts automatically. A gate
fails and cannot be fixed → execution stops and reports.

**Stack:** Vite (library mode for the package, plain Vite app for the demo) and TypeScript
end to end — `.ts` / `.vue` with `<script setup lang="ts">`, types emitted by `vue-tsc`, no
JavaScript sources anywhere in the repo.

Design rationale for everything here lives in [decisions/](decisions/); the parity
obligations are in [PARITY.md](PARITY.md).

---

## 1. Execution contract

### How a milestone runs

1. Implement the milestone's deliverables.
2. Run `npm run gate -- M<n>`.
3. On pass: append the result to [PROGRESS.md](PROGRESS.md), commit, start the next
   milestone.
4. On fail: diagnose and fix the *implementation*. Up to **3 attempts**, then stop and
   report with the failing output.

### Gate integrity — the rules that make this trustworthy

These are the point of the whole scheme. Without them, "all gates green" means nothing.

1. **A gate is never edited to make it pass.** Not loosened, not skipped, not deleted, not
   `.skip`-ed, not narrowed by changing a matcher. If a gate is wrong, that is a stop-and-ask
   event, not a fix.
2. **A ported test's expectations are never weakened** ([0011](decisions/0011-tests-as-specification.md)).
   If vdd cannot satisfy an rdd assertion, the outcome is either a bug fixed or a divergence
   recorded in [PARITY.md](PARITY.md) §4 — with the owner's agreement.
3. **Test counts are monotonic.** `scripts/gates/counts.mjs` holds a per-file expected
   minimum; the gate fails if any file drops below it. This is what stops quiet deletion.
4. **No skipped tests at a gate.** Any `it.skip` / `todo` fails the gate unless it is listed
   with a reason in `PROGRESS.md`.
5. **Non-vacuity is proven, not assumed.** At every milestone that ports tests: stash the
   implementation, confirm the new tests go red, restore. A test that passes against a
   reverted implementation proves nothing — this is the check rdd's own `6de3381` ran and
   documented.
6. **Fixed defects get a regression test that fails against rdd's behaviour**
   ([0012](decisions/0012-fix-known-defects.md)), so they cannot drift back to parity.

### Standing gate — runs at every milestone

| Check | Command |
|---|---|
| Types | `vue-tsc --noEmit` |
| Lint | `eslint .` |
| Tests | `vitest run` — zero failures, zero unlisted skips |
| Build | `vite build && vue-tsc --emitDeclarationOnly` — ESM + CJS + `.d.ts` + `styles.css` |
| Counts | `scripts/gates/counts.mjs` |
| Prefix | `scripts/gates/css-prefix.mjs` — zero unprefixed classes or tokens in `src/index.css` ([0008](decisions/0008-css-prefix.md)) |
| Public API | `scripts/gates/api-surface.mjs` — exports match the documented surface; an accidental addition or removal fails |

### Stop-and-ask conditions

Execution halts and reports, rather than improvising, when:

- a gate fails three times;
- passing a gate would require breaking any rule above;
- **M0's spike fails** — confirmed by the owner: I stop, present the evidence and a
  recommendation on the fallbacks in [0002](decisions/0002-zero-unmount-via-teleport.md),
  and wait. Choosing between them changes the architecture and, for one option, what panel
  authors have to do, so it is not mine to take;
- an implementation detail contradicts an accepted ADR, or needs a new one;
- rdd layout compatibility ([0009](decisions/0009-layout-json-compatibility.md)) cannot be
  met without a format change;
- a milestone's real scope turns out materially larger than described here.

### What the browser gates actually cover

Every capability below was proven in real Chrome before this plan was accepted, so no gate
here rests on an assumption. `playwright-core` + `chromium.launch({ channel: 'chrome' })` —
Chrome is already installed, so there is no browser download.

| Capability | How it is asserted | Verified |
|---|---|---|
| DOM identity across re-parenting | the cached element is the *same object* after every transition | ✔ |
| WebGL context survival | `gl.isContextLost() === false` | ✔ |
| Media playback continuity | `video.currentTime` advanced, never reset | ✔ |
| Scroll + focus restoration | offsets and `activeElement` after a transition ([0014](decisions/0014-preserve-scroll-and-focus.md)) | ✔ |
| Real touch | genuine `touchstart`/`touchend` via `hasTouch` emulation, not synthetic pointer dispatch | ✔ |
| Coarse-pointer CSS branch | `matchMedia('(pointer: coarse)')` under device emulation | ✔ |
| Hit areas | `elementFromPoint` at a handle's outer edge — this already reproduced D5's shape | ✔ |
| Animation runs and completes | declared `transition-duration` read from computed style; geometry sampled per frame for monotonic progress to the final value | ✔ |
| Animation opt-out | `:animations="false"` produces zero transition duration | ✔ |
| Frame / layout cost | CDP `Performance.getMetrics` — `Frames`, `LayoutCount`, `RecalcStyleCount` | ✔ |
| CSS actually applies | computed styles read from a real stylesheet — the class-vs-rule cross-check jsdom cannot do | ✔ |

### Differential gates — the reference implementation is the oracle

This is a port of a working library, so "does it behave the same" need not be a judgement
call. Two gates exploit that:

- **Visual diff.** The same canonical states are screenshotted in the rdd demo and the vdd
  demo, *clipped to element bounds* (`locator.screenshot()`) — tab bars, title bars, the
  taskbar, menus, drawers. Clipping to library-rendered chrome sidesteps the deliberate
  demo-dependency differences ([0013](decisions/0013-demo-scope.md)) entirely. Pixel-diffed
  with a tolerance, animations disabled for capture, viewport and device scale pinned.
- **Behavioural diff.** One scripted gesture sequence is driven against *both* demos and the
  resulting `saveLayout()` JSON compared. Because the format is byte-compatible
  ([0009](decisions/0009-layout-json-compatibility.md)), the outputs must be equal. This
  turns feature parity from a claim into a diff, and it tests the two implementations against
  each other rather than each against itself.

### Scope: desktop browsers

Verification targets **desktop browsers**, by owner decision. Mobile and tablet behaviour is
assumed to work and is explicitly out of scope — no real-device pass, no iOS Safari, no
Android, no haptics verification.

Touch *logic* is still gated, because it is free to do and it is where the bugs are: Chrome's
`hasTouch` emulation produces genuine `touchstart`/`touchend` events, so the long-press
threshold (300 ms), the 8 px cancel distance, tap-then-tap on taskbar icons and the
`(pointer: coarse)` CSS branch are all asserted under desktop Chrome. What is *not* claimed
is that a real iPad behaves identically.

### What genuinely cannot be automated

Two things, both small:

- **First approval of the visual baselines.** Establishing what "correct" looks like is a
  one-time human act; every run afterwards is automated against it.
- **Aesthetic judgement on anything with no rdd counterpart** — very little, since almost
  everything has a reference implementation to diff against.

### Reporting cadence

One short report per gate: milestone, pass/fail, test delta, anything notable. No narration
between gates. `PROGRESS.md` is the durable record; the terminal is a summary.

### Version control

The project now has a git home
([felipecarrillo100/vue-dockable-desktop](https://github.com/felipecarrillo100/vue-dockable-desktop)),
which changes what the record is. It was originally [PROGRESS.md](PROGRESS.md) plus the
artefacts under `artifacts/M<n>/`, including a `tree.txt` of file hashes so a regression could
be located *without history* — the reason those artefacts were kept at all.

History does that job now, so `artifacts/` is ignored: every file under it is regenerated by
`npm run gate` (screenshots, `gate.json`, `browser.json`, `tree.txt`, the demo build, coverage).
What survives is the written record — a row per run in [PROGRESS.md](PROGRESS.md) and the
per-milestone account in [evidence/](evidence/) — which is prose, not output, and cannot be
regenerated. Commits are still made only when asked for.

---

## 2. Verification harnesses

| Harness | Purpose | Used from |
|---|---|---|
| `vitest` + `@vue/test-utils` + jsdom | the ported suite | M2 |
| `vue-tsc` | types, and the `.d.ts` output consumers see | M1 |
| Layout fixtures `test/fixtures/rdd-6.2.0/*.json` | cross-implementation format compatibility | M2 |
| **Real Chrome via `playwright-core`** | everything jsdom cannot see | M0 |
| `scripts/gates/*.mjs` | counts, CSS prefix, API surface, per-milestone assertions | M1 |

The browser harness is not optional garnish. jsdom has no layout, so it cannot verify hit
areas, real pointer gestures, WebGL context survival, or whether a CSS rule applies at all —
and that last gap is exactly how rdd shipped three dead CSS hookups in 6.0.0, silently.
Browser gates cover:

- M0 — zero unmount with a live WebGL context, a playing video, and scroll position
- M4 — the same guarantee through every state transition
- M5/M6 — drag, dock, resize gestures with real pointer events
- M7 — the taskbar hover preview is *the same DOM node* as the running panel
- M11 — resize-handle hit areas (defect D5)
- M13 — every `vdd-` class the components emit is matched by a rule in the stylesheet

---

## 3. Milestones

Sizes are relative effort: **S** small, **M** medium, **L** large, **XL** largest.
"Tests" is the rdd suite this milestone must land, with its current test count.

### M0 — Teleport spike · S · *stop-or-go*

Throwaway Vue app: a WebGL canvas, a playing `<video>`, a scrolled list, each in a fake
panel, driven docked → tabbed → floating → minimised → restored → docked elsewhere, via
`<Teleport :to="cacheEl">` over an imperatively re-parented cache element.

**Gate** — browser, after every transition: `gl.isContextLost() === false`,
`video.currentTime` advanced and never reset, `el === elBefore` (same node identity), and
scroll offset + focus restored per [0014](decisions/0014-preserve-scroll-and-focus.md). Also
characterises two behaviours rather than asserting them: an `<iframe>` (expected to reload —
a documentable limitation) and a CSS animation caught mid-flight.

### M1 — Scaffold · S

Vite library build, `vue-tsc` declarations, vitest + `@vue/test-utils` + playwright-core,
eslint, `npm run gate`, the four standing-gate scripts, `git init`.

**Gate** — standing gate passes on a skeleton that exports nothing but a version constant.

### M2 — Pure logic + stylesheet · M

The framework-agnostic half, ported nearly unchanged: `dragResize`, `serializable`
(`isValidElement`→`isVNode`), `anchorGeometry`, `rtl`, `predefinedMessages`, the layout-tree
helpers, `isVisibleActiveTarget`/`deriveActivePanelId`, the stretch algebra. `index.css`
renamed to `vdd-` **and completed** — rdd still has ~35 unprefixed tokens and 4 bare classes
([0008](decisions/0008-css-prefix.md)).

**Tests:** `dragResize` (10), `serializable` (8), `anchorGeometry` (5), `PanelRegistry` (7),
`sidePanelPositioning` (1) = **31**. Plus the rdd fixtures parsing.

**Gate** — standing gate; every fixture in `test/fixtures/rdd-6.2.0/` parses to the expected
tree; `css-prefix.mjs` reports zero unprefixed names.

### M3 — Store, workspace, registry · M

`createWorkspace()` as a Vue plugin, the reactive store, `useWorkspace()`, the registry, the
event bus, i18n plumbing. No rendering yet.

**Tests:** `StateTransitions` (34), `EventBus` (9), `SpawnLifecycle` (5), the portable part
of `V2Features` (16 minus the pending-queue cases, which are moot per
[0004](decisions/0004-store-outside-components.md)) = **~55**.

**Gate** — standing gate; a test proves `workspace.openPanel()` works with **no app mounted
and no component created**; D2's single `activePanelId` resolution point exists and every
placement action routes through it.

### M4 — Persistence port + grid · L · *first demonstrable milestone*

`<VddDesktop>`: recursive grid, leaf groups, tab bars, split resizing, and the M0
architecture wired in for real.

**Tests:** `CoreLayout` (7), `TabOperations` (4), `DomStability` (3 → substituted with a
larger Teleport-stability suite) = **~14+**.

**Gate** — standing gate; browser: a counter and a scroll position inside a panel survive
tab switch, split, split-resize and re-dock; same-node-identity assertion at each step.

### M5 — Floating windows · M

Drag, 8-way resize, maximise, corner anchors with stacking, focus and z-order, the
off-screen clamp on workspace resize.

**Tests:** `FloatingWindows` (18).

**Gate** — standing gate; browser: drag and resize a window with real pointer events, assert
resulting geometry; a floated panel renders focused chrome (**D2 regression**).

### M6 — Drag-and-dock system · L

Leaf cross targets, workspace edge zones, corner zones, tab reordering with the index
correction, the drag ghost, touch long-press paths, RTL mirroring.

**Tests:** `TouchSupport` (15).

**Gate** — standing gate; browser: each drop target produces the expected tree, with mouse
and with emulated touch, LTR and RTL; long-press timing and the cancel threshold asserted.
Screenshots to `artifacts/M6/`.

### M7 — Minimise, taskbar, live previews · M

Minimise/restore with leaf and rect memory, the taskbar in all three visibility modes,
scroll arrows, hover previews, touch tap-then-tap.

**Tests:** the minimise/restore half of `StateTransitions`, already counted at M3, now
exercised through the DOM.

**Gate** — standing gate; browser: the hover preview contains *the same DOM node* as the
running panel; **D3** (both paths honour the original leaf) and **D4** (`openPanel` on a
minimised panel publishes `panel:restored` + `layout:changed`) regression tests.

### M8 — Context menus · S

`<VddContextMenu>`, `useContextMenu()`, item kinds, submenu timing, viewport clamping,
dismissal paths, custom renderers.

**Gate** — standing gate; **D1** regression test (taskbar "Maximize" restores then
maximises).

### M9 — Sidebar and toolbar · XL

`<VddSidebar>` + `<VddSecondarySidebar>` + `<VddToolbar>`, with handles replaced by models
([0005](decisions/0005-vmodel.md)) and render props by slots
([0007](decisions/0007-slots-over-render-props.md)).

**Tests:** `Sidebar` (91), `Toolbar` (42) = **133**. The largest test milestone.

**Gate** — standing gate; every handle-based rdd test has a `v-model` counterpart, mapped
one-to-one in the file header.

### M10 — Side panels, modals, toasts, dirty state · L

`<VddSidePanels>`, `<VddModals>`, `<VddToasts>`, `<VddConfirm>`, `useModals()`,
`useSidePanels()`, the toast singleton and adapter, dirty state and close guards end to end.

**Tests:** `PanelSystem` (6), `Toast` (16), `FormContainer` (24, rewritten as watcher tests
per [0006](decisions/0006-refs-over-subscriptions.md)) = **46**.

**Gate** — standing gate; the `FormContainer` rewrite documents its lifecycle **ordering**
guarantees explicitly — rdd's synchronous deactivate-then-activate ordering is not
automatic under Vue's watcher scheduling, so the gate pins whatever vdd actually offers.

### M11 — Panel overlay · XL

`<VddPanelOverlay>`, `<VddPanelToolbar>` and its controls, `<VddFloatingWidget>` with corner
docking, stacking buckets, the stretch mechanism and resize-to-stretch snapping,
`useFloatingWidgets()`.

**Tests:** `PanelOverlay` (59).

**Gate** — standing gate; browser: **D5** — every edge handle's hit area is its full intended
size, verified with `elementFromPoint` at the handle's outer edge.

### M12 — Contributions and i18n · M

`usePanelContribution`, `useActiveContribution`, the merge helpers; the i18n formatter
surface, `predefinedMessages` overrides, `dir`/`setDirection`.

**Tests:** `PanelContribution` (14), `Internationalization` (21), `useColorScheme` (5),
`V3Diagnostics` (7) = **47**.

**Gate** — standing gate; a contribution published by a hidden panel is **not** surfaced
(the invariant behind the whole `activePanelId` family).

### M13 — Parity, compatibility, docs · L

Close every gap: `StyleHookups` (12), `LayoutSerialization` (29) including the rdd fixture
round-trip, the full non-vacuity sweep, the API reference, and `PARITY.md` completed.

**Gate** — standing gate **plus**:
- full suite ≥ **468** equivalent assertions, with every moot/substituted case justified in
  `PARITY.md` §3;
- every rdd fixture round-trips byte-identically, both directions;
- browser: every `vdd-` class emitted by a component is matched by a rule in the shipped
  `styles.css`, and vice versa;
- non-vacuity: reverting each of the 13 source modules in turn turns the suite red;
- `PARITY.md` has no "TBD".

### M14 — Demo · L

Port `/demo` — every panel type and capability, dependencies swapped per
[0013](decisions/0013-demo-scope.md). `MarkdownEditorPanel` (745 lines) is the largest
single piece.

**Gate** — standing gate; `npm run demo:build` succeeds; browser: a scripted walkthrough
opens every panel type, docks, floats, minimises, restores, saves, reloads and restores,
asserting no console errors throughout. Screenshots to `artifacts/M14/`.

---

## 4. Totals

15 milestones. **468 assertions** to reach, of which ~31 are pure-logic (M2) and 133 land in
a single milestone (M9). Two milestones are stop-or-go on architecture (M0) or format
compatibility (M13).

The order is risk-first, not feature-first: the unknown that could invalidate the design
(M0) is resolved before anything is built on it, and the first thing a human can *use* (M4)
arrives before the largest test milestones.
