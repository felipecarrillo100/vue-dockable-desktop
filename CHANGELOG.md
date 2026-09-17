# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every release states which `react-dockable-desktop` release it corresponds to, as a
**Parity** line. The two libraries version independently — a shared number would break the
first time either needed a breaking change the other did not — so this is where the
correspondence lives, alongside the feature-by-feature map in [docs/PARITY.md](docs/PARITY.md).

## [Unreleased]

## [1.0.1] — 2026-09-17

**Parity: react-dockable-desktop 6.3.0.**

### Fixed

- **A widget opened through `useFloatingWidgets()` discarded every placement gesture.** Dropping
  a managed widget on another corner returned it to the corner `open()` named, and a stretched
  one lost its stretch as soon as any other widget opened or closed. Template-declared widgets
  and plain resizes were unaffected. Reported by a user.

  `<VddPanelOverlay>` bound `placement` — a `defineModel` — as a fresh `{ anchor, stretch }`
  literal with no `@update:placement`, and Vue re-syncs a model from its prop whenever the
  prop's *identity* changes. Every render of the overlay therefore reset the widget, and the
  overlay re-renders on exactly the wrong events: a drop clears `draggingId` in the same
  function that applies the placement, and opening a widget bumps `managedVersion`.

  The overlay now keeps a placement record per widget id and writes gestures straight back into
  it. `anchor`, `stretch`, `width` and `height` on `open()` are **initial values** — as rdd's
  `defaultAnchor`/`defaultStretch` are — so `open()` on an id that is already open refreshes its
  content and leaves the widget where the user put it, and `close()` then `open()` is what
  resets placement. No public API changed.

  A port regression: rdd never makes the anchor controllable, and the only placement value it
  lets a caller control is a primitive, so identity churn cannot arise there. Recorded as **R1**
  in [`docs/PARITY.md`](docs/PARITY.md), with the underlying `defineModel` constraint amended
  into [ADR 0005](docs/decisions/0005-vmodel.md). Pinned by PO31–PO35, four M14 gate rules, and
  a real pointer drag in the demo's browser walkthrough — the gesture path into an overlay-owned
  widget that no layer of either library's verification had ever driven.

- **In the demo, no camera marker on the main map could be clicked**, though the legend invited
  it: a decorative polygon added after the markers covered the whole cluster and swallowed every
  click. It is `interactive: false` now. Found by the new browser assertion trying to open a
  widget the way a user does.

### Changed

- The demo's camera widgets are opened through `useFloatingWidgets()` instead of a `v-for` over
  `<VddFloatingWidget>`, so the managed path — the one that regressed — is demonstrated and
  walked by the gate. The M14 capability rule now requires the composable itself rather than
  accepting `@update:open`, which is what let the demo claim the capability without exercising
  it.
- The M11 browser gate's stretch assertion was measuring the wrong thing: it expected a
  full-width strip to be `panel - 16` and ignored the inline panel toolbars beside it, so a
  strip that tracked its panel perfectly was reported as having stopped. It now asserts the
  tracking claim as a delta and measures the toolbar band. No library behaviour was involved —
  the failure reproduced identically against 1.0.0's source.

## [1.0.0] — 2026-09-16

**Parity: react-dockable-desktop 6.3.0.**

First release. 1.0.0 rather than 0.x because the API is not speculative: it is a deliberate
port of an API that has been through six majors of real use, and it is pinned by
`api-surface.json`, so it cannot drift by accident.

### Added

- **A Vue 3 port of [react-dockable-desktop](https://github.com/felipecarrillo100/react-dockable-desktop).**
  A window manager and dockable layout engine: split-docking grid, tabbed groups, workspace
  edge docking, floating resizable windows with corner anchoring and stacking, a taskbar with
  live previews, sidebars, toolbars, per-panel overlays with anchored toolbars and floating
  widgets, side panels, a modal stack, toasts, context menus, panel contributions, theming,
  and internationalisation with RTL.

  Written as a native Vue library rather than a transliteration: `createWorkspace()` is a
  plugin in the shape of `createPinia()`, two-way state is `v-model`, subscriptions are refs,
  render props are slots, and panel persistence is one cache element per panel plus a
  `<Teleport>`. The reasoning for each is recorded in [`docs/decisions/`](docs/decisions/).

- **Layout compatibility with rdd, in both directions.** `saveLayout()` output is byte-compatible
  with `react-dockable-desktop`'s `SerializedLayout`, so a layout saved by either library loads
  in the other. Asserted against fixtures captured from rdd, and exercised in the demo's
  browser walkthrough by restoring a layout written by hand in rdd's format.

- **A floating widget's title can be a message descriptor, not just a string.** `ManagedWidget.title`
  — the object `useFloatingWidgets().open()` stores — and `<VddFloatingWidget title>` are both
  `Label` (`string | MessageDescriptor`), resolved through `ws.format()` on every render. A
  descriptor therefore follows a locale change with no reopen, which a resolved string cannot:
  the library stores that object, so it has no way to resolve the text again.

  This closes the last gap in the rule that **every title the library stores is a `Label`** —
  panel titles, side panels, modals, context menus and the unsaved-changes dialog were already
  covered. Two M12 gate rules and PO28–PO30 keep it closed. The same defect was
  [reported against rdd 6.2.0](https://github.com/felipecarrillo100/react-dockable-desktop) and
  is fixed there in 6.3.0; recorded here as divergence **D16** in
  [`docs/PARITY.md`](docs/PARITY.md).

### Notes

- Sixteen behaviours deliberately differ from rdd 6.2.0 — fifteen of them defects vdd does not
  reproduce, each with a test and a gate rule. They are listed with their evidence in
  [`docs/PARITY.md`](docs/PARITY.md), which also carries the full API and test maps.
- The published surface is pinned by `api-surface.json`; the gate fails if an export appears or
  disappears without that file changing, so nothing can leak into the API by accident.
