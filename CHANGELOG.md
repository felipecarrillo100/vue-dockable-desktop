# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Nothing has been published to npm yet, so everything below is still unreleased. This section
becomes `## [0.1.0]` with its date on the first publish.

## [Unreleased]

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
