# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every release states which `react-dockable-desktop` release it corresponds to, as a
**Parity** line. The two libraries version independently — a shared number would break the
first time either needed a breaking change the other did not — so this is where the
correspondence lives, alongside the feature-by-feature map in [docs/PARITY.md](docs/PARITY.md).

## [Unreleased]

## [1.1.0] — 2026-09-18

**Parity: react-dockable-desktop 6.3.0.**

### Fixed

- **`<VddDesktop :skin>` did nothing at all.** The stylesheet keyed its 104 skin selectors on
  `data-workspace-skin` while the component emitted `data-vdd-skin`, so no skin rule had ever
  matched in any published version: all seven skins painted identically to the default. The
  stylesheet now uses the library's own `data-vdd-skin`, which is the name the component, its
  test and [ADR 0008](docs/decisions/0008-css-prefix.md) already agreed on.

  A consumer who wrote a custom skin against `[data-workspace-skin="…"]`, as the manual
  previously showed, must rename it to `[data-vdd-skin="…"]`. Nothing can break in practice:
  skins have never applied, so no such CSS was having any effect.

- **Skins would have been unusable in light mode**, which the rename alone would have shipped. A
  skin's token block matches the workspace element as well as the root, and the colour scheme was
  only on the root — so a skin's *dark* tokens were re-declared closer to the content than the
  root's light ones and shadowed them: dark panels with dark text. `<VddDesktop>` now mirrors
  `data-color-scheme` onto the workspace element beside the skin, which is how rdd has always done
  it. Measured across seven skins × two schemes on four surfaces; every surface now flips.

- **The sidebar, its drawer and the workspace toolbar were unstyled in dark mode.** Twenty-nine
  tokens — the whole `--vdd-sidebar-*` family, the rail's icon colours and the workspace toolbar's
  button states — had their dark values only inside `[data-color-scheme="dark"]`, and that selector
  never matches: dark is signalled by *removing* the attribute, as `useColorScheme()` documents. So
  they were undefined exactly when they were needed, and fifteen of them are read with no `var()`
  fallback, which drops the whole declaration instead of defaulting it. The strips had no
  background, the drawer inherited black text, and **the selected rail icon had no colour at all**,
  which is why it appeared not to render.

  Dark is the base look, so those values now live on `:root` and the dark block is gone —
  `[data-color-scheme="light"]` overrides them, which is all a scheme block should do. An
  application that sets `data-color-scheme="dark"` explicitly sees no change. Reported from the
  demo; it affects rdd too, whose own demo happens to set the attribute for both schemes and so
  never shows it.

- **The theming chapter documented three things that were not true**: the skin selector
  (`data-workspace-skin`), the claim that *"the workspace publishes its scheme as
  `data-color-scheme`"* — the library only ever reads it; your application sets it — and a
  `createWorkspace({ windowClass, modalClass, … })` config shape that has never existed (it is
  `classes: { window, modal, … }`).

### Added

- **A token reference**: all **119** tokens the library declares on `:root`, in sixteen groups,
  with defaults and what each paints ([ch. 10](docs/manual/10-theming.md#token-reference)). A gate
  checks it against the stylesheet in both directions, so a new token needs a row and a row cannot
  outlive its token.

- **`:root` is now a complete inventory.** Six measurements and off-by-default effects that
  existed only as `var()` fallbacks are declared at exactly those values, so nothing renders
  differently — `--vdd-tab-accent-bar-width`, `--vdd-tab-btn-active-glow/-radius/-width`,
  `--vdd-toolbar-accent-bar-width`, `--vdd-toolbar-btn-active-glow`. Together with the
  twenty-nine folded out of the dark block, everything a skin may override is declared and
  documented in one place.

- **Guidance for defining your own skin**, both of it learned by measurement: leave the selector
  unqualified (`[data-vdd-skin="mono"]`, not `html[…]`, which cannot match the workspace element
  and loses there), and import your stylesheet after the library's. The demo ships `mono` as a
  worked example in both schemes, and the browser gate measures it beside the seven built-ins.

### Changed

- The M14 browser gate's skin step used to cycle the seven skins and assert nothing — which is how
  this shipped. It now measures each skin in both schemes and fails if a surface does not change
  between them or if a skin paints identically to the default. Two new source rules join it: every
  `[data-*]` selector in the stylesheet must name an attribute a component emits (the rule that
  would have caught this on day one), and the token reference must match the stylesheet. A third
  rejects a token whose only declaration sits inside a colour-scheme block — the shape that left
  the sidebar unstyled. The browser gate also measures the chrome *outside* the workspace now: the
  first matrix sampled only inside it, and passed while the sidebar was unpainted. All are proven
  non-vacuous by `gate:selftest`, now 87 rules.

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
