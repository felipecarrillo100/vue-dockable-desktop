# Roadmap

Each phase has an **exit criterion** — a demonstrable thing that is true when the phase is
done. Phases are ordered by risk, not by feature importance: the load-bearing unknown goes
first.

---

## P0 — Teleport spike *(throwaway)*

Everything in this library rests on zero-unmount panels. In React that is `createPortal`
into a cached `<div>` that gets imperatively re-parented. The Vue equivalent is
`<Teleport :to="cacheEl">` over the same cached element.

**This phase exists to prove that works before anything is built on it.**

A scratch Vue app with three hostile panels — a live WebGL canvas, a playing `<video>`, and
a long scrolled list — driven through: docked → tabbed (switch away and back) → floating →
minimised → restored → docked into a different leaf.

**Exit:** the WebGL context is not lost, the video keeps playing at its position, and the
scroll offset is unchanged, at every step. If any of that fails, stop and redesign
([0002](decisions/0002-zero-unmount-via-teleport.md) names the fallbacks).

## P1 — Scaffold and pure logic

Repo, Vite library build, `vue-tsc` declaration output, Vitest + `@vue/test-utils`, ESLint.
Then the framework-agnostic half of the library, which ports nearly unchanged:

- `dragResize.ts` (pointer-capture drag + 8-direction resize math)
- `serializable.ts` (`isValidElement` → `isVNode`)
- `anchorGeometry.ts`, `rtl.ts`, `predefinedMessages.ts`
- layout-tree helpers: `removePanelFromTree`, `addPanelToLeaf`, `splitLeafInTree`,
  `findFirstLeafId`, `isVisibleActiveTarget`, `deriveActivePanelId`
- the stretch algebra: `bucketsFor`, `addAxis`, `releaseAxis`
- `index.css`, renamed `rdd-` → `vdd-` ([0008](decisions/0008-css-prefix.md))

**Exit:** `npm run build` emits ESM + CJS + `.d.ts` + `styles.css`; the ported pure-logic
tests pass, including the rdd layout fixtures parsing correctly
([0009](decisions/0009-layout-json-compatibility.md)).

## P2 — Store, registry, persistence port, grid

`createWorkspace()`, the reactive store, the panel registry, the persistence port from P0,
and `<VddDesktop>` rendering splits, leaf groups and tabs. Split resizing.

**Exit — first demonstrable milestone.** A Vue app can register two panels, open them,
split the grid, drag a split, switch tabs, and a counter inside a panel keeps its value
across all of it.

## P3 — Floating, docking, taskbar

Floating windows (drag, 8-way resize, maximise, corner anchors with stacking), the full
drag-and-dock system (leaf cross targets, workspace edge zones, corner zones, tab reorder,
touch long-press), minimise/restore, the taskbar with live hover previews, context menus.

**Exit:** every interaction in the React demo's main workspace is reproducible by hand,
mouse and touch, LTR and RTL.

## P4 — Shell components

`<VddSidebar>` (+ secondary), `<VddToolbar>`, `<VddSidePanels>`, `<VddModals>`,
`<VddToasts>`, the confirmation dialog, dirty state and close guards.

**Exit:** a panel can mark itself dirty and block its own close behind a confirmation
dialog; sidebar and toolbar drive the workspace.

## P5 — Panel overlay

The inner-panel layer: `<VddPanelOverlay>`, `<VddPanelToolbar>` and its buttons/toggles/
search, `<VddFloatingWidget>` with corner docking, stacking, and the stretch/snap
mechanism. The most intricate 1,464 lines in the original.

**Exit:** a widget can be docked to a corner, dragged free, dropped back, stretched to span
either axis by resize-snap, and released from either end of a stretched axis.

## P6 — Contributions, i18n, persistence, tests, docs

`usePanelContribution` / active-contribution merge, the i18n formatter surface,
`saveLayout`/`loadLayout` including state providers and the serialisability pruning pass,
then the full test suite ([0011](decisions/0011-tests-as-specification.md)) and the API
reference.

**Exit:** the parity table in [PARITY.md](PARITY.md) has no unexplained gaps, and a layout
saved by rdd 6.2.0 round-trips through vdd unchanged.

## P7 — Demo

Port `/demo` — every panel type and capability, with the React-only UI dependencies
swapped out ([0013](decisions/0013-demo-scope.md)).

**Exit:** the demo runs, and a reviewer can reach every feature of the library from it.

---

## The plan is complete

All fifteen milestones (M0–M14) passed their gates. The record is in
[PROGRESS.md](PROGRESS.md), one row per run, with each milestone's account in
[evidence/](evidence/). The gate's own output — screenshots, `gate.json`, `browser.json` —
is written to `artifacts/M<n>/` and is not committed, since re-running the gate regenerates it.

| | |
|---|---|
| Tests | **730** across 32 files, against rdd's 468 |
| Gate rules proven non-vacuous | **75** (`npm run gate:selftest`) |
| Source modules, all exercised | **74**, 90.9% of lines |
| Public API | 49 runtime exports, 83 types, gated against `api-surface.json` |
| Divergences from rdd, each explained | **16** (D1–D16) |
| Decisions recorded | 15, all settled |
| Manual | 13 chapters, all drafted against the shipped API |
| Demo | 24 sources, 16 panel kinds, a 32-step browser walkthrough |

The standing gate runs on every milestone: types · lint · tests · build · counts ·
css-prefix · api-surface · docs-api · demo:build · the milestone's own gate · its browser
gate. `npm run gate:sweep` runs the per-module coverage sweep.

### What the port fixed

Fifteen of the sixteen divergences are defects vdd does not reproduce, each with a test and a
gate rule so it cannot come back. The four worth naming:

- **D2** — `activePanelId` could name a panel the user could not see, so an app's toolbar
  showed controls acting on a hidden panel. Every placement action now resolves it through one
  code path, and M12 and M14 both re-assert it at the end of the hardest paths there are.
- **D5** — `overflow: hidden` clipped half of every resize handle, and a rounded corner
  clipped all of one. Measured in Chrome with 40 hit probes in M11.
- **D6/D7** — scroll offsets and focus were lost on every transition, contradicting the
  headline zero-unmount claim. rdd's own suite could not see it, because jsdom does no layout.
- **D1** — a taskbar menu offered "Maximize" and the action did nothing at all.

### What Vue made smaller

Not a rewrite for its own sake: each of these is code that exists in rdd only to work around
something Vue does not have.

| rdd | vdd |
|---|---|
| `WorkspaceClient` + a pending-call queue + a connect handshake | `createWorkspace()` is live before any component |
| Six providers | one `app.use(workspace)` |
| Eleven imperative handle methods | four `v-model`s |
| Nine subscription methods on the panel contract | four refs and two hooks |
| Nine refs mirroring state to defeat stale closures | none |
| Three React contexts carved for render isolation | one store |
| A toast event emitter | module-level reactive state |
| `react-intl` in the demo | a twelve-line formatter |

### Known gaps

- **D15**: a tab bar that overflows has no scroll buttons. The container scrolls; the
  affordance is not ported.
- **A managed widget's geometry cannot be read**, so `useFloatingWidgets()` placement cannot be
  persisted and restored — a template widget's `v-model:placement` is the only route today.
  1.0.1 moved placement into a record the overlay owns, which is the half of that groundwork;
  size, free position and a public accessor are the rest.
- Six consumer hooks are emitted with no rule of their own, declared in the gate rather than
  accidental, matching rdd.
- iOS and Android were out of scope by agreement; touch behaviour is tested in jsdom and in
  desktop Chrome with synthesised touch events.
