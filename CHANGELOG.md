# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every release states which `react-dockable-desktop` release it corresponds to, as a
**Parity** line. The two libraries version independently — a shared number would break the
first time either needed a breaking change the other did not — so this is where the
correspondence lives, alongside the feature-by-feature map in [docs/PARITY.md](docs/PARITY.md).

## [Unreleased]

**Parity: react-dockable-desktop 7.7.1.** Two desktops on one page no longer strip each other's
skin.

### Fixed

- **Unmounting one desktop stripped `<html>` of the other's skin, animations opt-out and stacking
  base** (`data-vdd-skin`, `vdd-no-animations`, `--vdd-z-base`), and each desktop overwrote the
  other's while both were mounted. The most recently mounted desktop now decides these, and
  unmounting it hands them back to the others instead of removing them. Teleported chrome (menus,
  toasts, flyouts, modals) therefore follows the newest desktop's skin when two desktops use
  different skins.

rdd 7.7.1 also fixed panel DOM, sizes and lifecycle handlers shared between workspaces. None of it
applied here: vdd's panel cache has been per desktop from the start.

### Internal

Faster checks, the same checks. Nothing in the published package changes.

- **`npm run verify`** — types, lint and the test suite, about a minute: the check to run while
  working. **`npm run gate:release`** — the coverage sweep, then every milestone gate M1–M17 in
  one call: the check to run before a release.
- **`npm run gate -- M13 M15 M16`** runs several milestones on one standing gate (types, lint,
  tests, build…) instead of repeating it for each. Each step's time is recorded in
  `artifacts/M<n>/gate.json`.
- **The branding gates wait for the page to be still instead of sleeping.** A scene, the overlays
  and each hover now wait until nothing is animating or changing, with the old sleep as the
  ceiling; the wait after the pointer leaves a control stays fixed, since the timers it starts are
  invisible to such a check. M16 checks its three corner scales on one page per scene, and no
  longer runs the hover walk for corners, which never read it. M15 captures a scene twice only
  for an unexpected difference. Rewriting both baselines with the new code gave byte-identical
  fixtures.
- **The baselines key elements by library class, not position**, so a new wrapper element no
  longer renames everything after it (this release's dialog row renamed a whole modal). Both
  fixtures were regenerated once: every scene has the same entries with identical values, under
  the new keys.
- **`gate:selftest` leaves the tree fresh**: it rebuilds `dist/` and re-runs the coverage sweep at
  the end, so a following M13 never reads the report a seeded violation left behind.
- **Three stale milestone rules updated** ([0020](docs/decisions/0020-stale-milestone-rules.md)):
  M2 still required `src/core/rtl.ts`, deleted at M13 as dead code; M5 looked for the window clamp
  where it no longer lives; M6 expected the pre-1.1.2 side for an RTL tab drop. Each keeps its
  intent and checks today's code, and the new M2 and M5 rules have seeded violations in the
  selftest (100 rules).

| | before | after |
|---|---|---|
| every gate, M1–M17 | ≈26 min (17 standing gates) | ≈9 min (one) |
| M16 browser gate | 435 s | 137–145 s |
| M15 browser gate | 236 s | 173–183 s |
| while working | a gate run | `npm run verify`, ≈1 min |

## [1.8.0] — 2026-10-05

**Parity: react-dockable-desktop 7.7.0.** Ready-made dialogs: the confirmation shows an icon,
a new alert dialog, and both as promises.

### Added

- **`<VddConfirm>` shows an icon left of its message**: a question mark, coloured by
  `alertType` (info, success, warning, danger) with the toast colour tokens. The new `icon` prop
  replaces it with your own component; `icon: null` hides it.
- **`<VddAlert>`**: a message with a single OK button, for telling rather than asking. Its icon
  follows `alertType`, with the same `icon` override. Props: `message`, `alertType`, `icon`,
  `okLabel`, `onSettled`. Focus starts on OK and Enter presses it; Escape, the backdrop and the ×
  acknowledge it too, unless the modal is `closable: false`. Button hook: `data-vdd-alert-ok`.
- **`useModals().confirm(options)` and `useModals().alert(options)`** open those dialogs (size
  `small`) and return a promise: `confirm` resolves `true` for the confirm button and `false` for
  cancel or any dismissal; `alert` resolves once it is closed. Option types: `ConfirmOptions`,
  `AlertOptions`.
- **Message keys `confirmTitle`** ("Confirmation") **and `alertTitle`** ("Information"), the
  helpers' default titles. A table typed `Record<MessageKey, string>` needs the two new keys.
- New classes: `vdd-dialog-content`, `vdd-dialog-icon`, `vdd-dialog-icon-{info|success|warning|danger}`.

rdd 7.7.0 also fixed an `RddConfirm` that never answered when dismissed, and one that overwrote
the modal's header icon. Neither applied here: `<VddConfirm>` already settled on unmount and
never set a header icon.

### Upgrading

- A confirmation now draws a question mark beside its message. Pass `icon: null` to keep the
  old look.
- The line under a confirmation's message is now the border of the new icon row,
  `.vdd-dialog-content`, so it spans the icon too; it was `.vdd-confirmation-message`'s own
  `border-bottom`. A stylesheet that restyled that border should target `.vdd-dialog-content`.

### Tests

- `test/components/dialogs.test.ts`: settle-once for every exit of both dialogs (Escape,
  backdrop, ×, `closeAllModals`, `close(id)`, the buttons); default, custom and hidden icons;
  the header icon left alone; alert focus, label and `closable: false`; both promise helpers.
  Each assertion was seen failing with its code removed.
- M10 checks that `<VddAlert>` settles on unmount and only once (with a selftest mutation). The
  non-vacuity selftest now blanks `contributions.test.ts`: `useOverlays.ts` is reached by the new
  dialog tests too, so blanking `useOverlays.test.ts` no longer leaves a module unexecuted.
- `test/core/stylesheet.test.ts`: every dialog-icon class has a rule coloured from a toast token,
  and the separator is the icon row's border, not the message's (seen failing with each removed).
- The M15 colour baseline (`scripts/gates/browser/fixtures/m15-branding-baseline.json`, which M16
  also reads) is regenerated on purpose: its scenes include a confirmation, whose message now sits
  in the icon row. Nothing outside that modal changed.

## [1.7.2] — 2026-10-04

**Parity: react-dockable-desktop 7.6.2.**

### Fixed

- **Workspace toolbar and sidebar rail buttons relied on the browser's own button padding**
  (`1px 6px` in Chrome) on a page without a CSS reset. With the library's `border-box` sizing that
  padding came out of their 36px and 44px, which capped their icons at 24px and 32px, so a
  `--vdd-chrome-icon-size` above 24px squeezed toolbar icons. Both set `padding: 0`; nothing changes
  at the default icon size, or on a page that already resets button padding.
- rdd 7.6.2 also fixed a squashed × in the taskbar preview; vdd's × is a `<span>`, so it was never
  affected.

### Tests

- `test/core/stylesheet.test.ts`: the toolbar and rail button rules declare `padding: 0` (seen
  failing with either removed).

## [1.7.1] — 2026-10-04

**Parity: react-dockable-desktop 7.6.1** (internal restructuring). No behaviour, API or visual
change.

### Internal

- **The stylesheet is built from area files.** `src/styles/NN-area.css` (tokens, base, tabs, grid,
  taskbar, floating windows, context menu, drop zones, one file per skin, sidebar, modals, drawers,
  RTL, toolbar, panel overlay, toasts, the Vue port's own structure…) are concatenated in file-name
  order into `src/index.css`, which is generated and committed, and published as
  `dist/styles.css`. The published stylesheet is byte-identical to 1.7.0 apart from a header
  comment. To change a style, edit the area file and run `npm run css` (or `npm run css:watch`);
  `npm run css:check` and a unit test fail if `src/index.css` is out of date. The gates read
  `src/index.css` as before.

### Tests

- The M15 colour baseline (`scripts/gates/browser/fixtures/m15-branding-baseline.json`, which M16
  also reads) is regenerated for 1.6.0's intended toolbar changes (toggle "on" colours and edge,
  the new tokens, the vscode/macos light-mode hover), which 1.6.0 shipped without refreshing it.
  Nothing in this release changes a colour.

## [1.7.0] — 2026-10-04

**Parity: react-dockable-desktop 7.6.0.** Context menus open with nothing highlighted, the same
every time.

### Changed

- **A context menu opens with focus on the menu itself, no item highlighted.** It used to focus
  its first item, and whether the browser then drew a focus ring depended on the user's previous
  interaction: a menu opened from script (a map library's right-click calling `showContextMenu`,
  say) showed a ring after a page load or a key press and none after a mouse click. ArrowDown
  reaches the first item and ArrowUp the last.
- **A keyboard `contextmenu` event** (the ContextMenu key or Shift+F10, which report no pointer
  position) **still opens on the first item**, and so does `initialFocus: 'first-item'`.

### Added

- **`initialFocus?: 'menu' | 'first-item'`** on `ShowContextMenuOptions`
  (`ws.showContextMenu`, `useContextMenu()`).
- **Home and End** in context menus, as in rdd.
- **`--vdd-context-menu-focus-ring`**: the outline on a menu item with keyboard focus, by default
  `--vdd-focus-ring` (the skin's accent). Both are now documented in the theming chapter; they are
  read with a fallback rather than declared, so they follow the skin's or your brand's accent.

### Fixed

- **Menu items drew the browser's default focus ring** instead of the skin's.
- **ArrowUp from a menu with nothing highlighted would have gone to the second-to-last item**; it
  goes to the last.

### Upgrading

- Nothing to change for menus opened with the mouse or from script. If you open a menu from your
  own keyboard shortcut, pass `initialFocus: 'first-item'` so it starts on an item.
- Tests that expected the first item to have focus right after `showContextMenu` should press
  ArrowDown first, or open the menu with `initialFocus: 'first-item'`.

### Tests

- `test/components/contextMenu.test.ts`: the menu itself is focused on open; `initialFocus`;
  keyboard and mouse `contextmenu` events; ArrowDown/ArrowUp from the menu; Home and End. Each was
  seen failing with its part of the fix removed.

### Documentation

- Overlays chapter: initial focus, the option, keys, the focus ring. Theming chapter: a "Focus
  rings" table with `--vdd-focus-ring` and `--vdd-context-menu-focus-ring`.

## [1.6.0] — 2026-10-04

**Parity: react-dockable-desktop 7.5.0.** Toolbar buttons: the library sizes the icon inside its
own buttons, and a toggle that is on can be told from one that is off at a glance, on chrome and
over panel content alike. No props were added or removed; everything new is a CSS custom property.

### Added

- **Icon size tokens.** `--vdd-panel-toolbar-icon-size` (`20px`) sizes icons in
  `<VddPanelToolbar>` buttons and toggles; `--vdd-chrome-icon-size` (`22px`) sizes them in the
  workspace toolbar and the sidebar rail. Icon fonts follow the button's `font-size`; SVG icons
  follow the token's width and height, even when the SVG has its own `width`/`height` attributes.
- **`soft` chip tokens**: `--vdd-panel-toolbar-btn-bg`, `--vdd-panel-toolbar-btn-bg-hover`,
  `--vdd-panel-toolbar-btn-border`.
- **Workspace toolbar toggle tokens**: `--vdd-toolbar-btn-toggle-active-color` and
  `--vdd-toolbar-btn-toggle-active-border`.

### Changed

- **Panel toolbar "on" state** is a solid chip with a white icon, the same in every
  `buttonVariant`: in dark the accent mixed 65% with black, in light the plain accent. The icon is
  `--vdd-brand-on-accent` when a brand sets it. It clears WCAG's 3:1 non-text contrast. Before, it
  was a 14–15% accent tint.
- **`buttonVariant="soft"`** is a near-opaque chip with a hairline edge, readable over panel
  content. Before, it was a 6% (dark) / 4% (light) wash.
- **Workspace toolbar toggle "on"**: the accent tint goes from 6–8% to 22% (dark) / 16% (light),
  with a 1px accent edge and the accent icon.
- **Icons in toolbar and rail buttons are larger by default**: 20px in panel toolbars, 22px in
  the workspace toolbar and rail.

### Fixed

- **Keyboard focus was invisible on toolbar and rail buttons**: `.vdd-toolbar-btn` and
  `.vdd-sidebar-tab-btn` removed the outline with nothing in its place. They, and panel toolbar
  buttons, show a focus ring for keyboard focus now (`--vdd-focus-ring`, default a 2px accent
  outline), as rdd does.
- **`filled` toggles looked the same on and off**; it now rests on an accent tint with an accent
  edge, and "on" is the solid chip.
- **vscode and macos painted a white hover tint in light mode** on panel toolbar buttons; it now
  applies in dark only.
- **`buttonSize` was documented as the icon size.** It sets the button size.
- The theming chapter no longer claims a coarse-pointer rule enlarges panel toolbar buttons.

### Upgrading

- Remove per-icon sizes inside toolbar and rail buttons (`width`/`height` props, inline sizes):
  set `--vdd-panel-toolbar-icon-size` / `--vdd-chrome-icon-size` instead. An inline `style` size
  still wins over the tokens.
- If you added shadows to keep toolbar icons readable over panel content, remove them and use
  `button-variant="soft"` or a `frosted`/`solid` toolbar.
- To restyle "on", set `--vdd-panel-toolbar-btn-active-bg` and `--vdd-panel-toolbar-btn-active-color`
  (recipes in the panel overlay chapter).

### Documentation

- Panel overlay chapter: "Styling toolbar buttons" (what the library owns, icon sizes, variants,
  the "on" tokens, recipes); corrected `buttonSize`.
- Theming chapter: new icon and toggle tokens; panel toolbar defaults updated.

### Demo

- "Toolbar Buttons" panel (Control Center → open): every `buttonVariant` in every state over
  light, dark and busy content, with icon-size sliders.

## [1.5.1] — 2026-10-01

**Parity: react-dockable-desktop 7.4.1 fixes.** From a review of 1.5.0. No API changes.

### Fixed

- **A message's placeholder was replaced only once**: `'{n} of {n}'` read `'2 of {n}'`. The
  default formatter replaces every `{key}` now, and the workspace's `format` uses the same
  function instead of a copy of it.
- **The window losing focus mid-drag left the drag armed.** After an alt-tab, the pointer
  listeners, the drop target and `vdd-dragging-active` stayed, and the next release docked the
  panel into the target it had been over. A `blur` now ends a tab drag (mouse or touch) and a
  floating window's title-bar drag as a `pointercancel` does. `startPointerDrag` ends on `blur`
  too, and takes an optional `onCancel`; the floating window's title bar uses it, so a cancel
  no longer docks the window into the target it was over.
- **Layout repair** drops a group's panel id that the layout's `panels` doesn't have, and gives
  a split whose sizes don't match its children, or aren't finite positive numbers, even sizes
  (they reached the style as `flex-basis: NaN%`). Each is named in the development warning.
- **A throwing event subscriber stopped delivery to the others**, and threw into the action
  that published — `loadLayout`, `openPanel`, a close. Each subscriber's error is logged with
  `console.error`, naming the event, and delivery goes on.

### Tests

- `test/store/reviewFixes.test.ts` (placeholders, layout repair, the event bus) and
  `test/components/dragBlur.test.ts` (mouse, touch and title-bar drags, with uninterrupted
  drags as controls), ported from rdd 7.4.1's `Patch741.test.ts` and `DragBlur.test.tsx`. Each
  seen failing before its fix and with it removed.

## [1.5.0] — 2026-09-30

**Parity: react-dockable-desktop 6.3.1, plus react-dockable-desktop 7.2.0–7.4.0's skin branding
and field-report fixes.** From a consumer's field report: fixed dropdowns inside frosted windows,
direction for the sidebar and toasts, translated titles, and a quieter restore.

### Added

- **Title functions**: a title (a panel's, a window's, a drawer's, a modal's, a widget's) can be
  `() => string`. The library calls it each time it renders the title, so a function that reads
  your locale ref follows a language change on its own — a translated *string* is fixed in the
  language active when the panel opened. A function isn't saved in a layout: the restored panel
  takes the title its type is registered with. `Label` is now
  `string | MessageDescriptor | (() => string)`.
- **Reduced motion**: the library's own transitions and animations stop when the user has asked
  the system for reduced motion (`prefers-reduced-motion: reduce`), as with
  `:animations="false"`. Your own are untouched.

### Fixed

- **A `position: fixed` element inside a frosted container was positioned against the
  container, not the viewport** — so a dropdown, popover or date picker of yours inside a
  floating window, a drawer, an overlay widget, a frosted panel toolbar or (in `macos`) a docked
  panel opened in the wrong place, in some skins and not others. A `backdrop-filter` makes its
  element the containing block for fixed content; the frost now sits on each container's
  `::before` (with the background it tints, where the frost saturates). What is drawn is unchanged.
- **`setDirection('rtl')` did not mirror the sidebar or the toasts**: they followed only the
  page's `dir`. They follow the workspace into RTL now, and so does everything inside the sidebar
  (a toolbar, your own chrome); while the workspace is left-to-right they still follow the page,
  as before.
- **A saved window with unusable geometry reached the window's style**: a `NaN` saved as `null`,
  an `Infinity` or a missing size. Such values are replaced on load by the default a new floating
  window gets, with a warning naming the window.

### Tests

- **M17 browser gate** (`scripts/gates/browser/m17.mjs`, real Chrome): a fixed child of each of
  the 7 frosted cases lands on the viewport, and each renders as before within a small tolerance;
  reduced motion stops every library transition and leaves the page's; the sidebar and toasts
  follow `setDirection` and still follow the page while LTR.
- `test/components/fieldReport.test.ts` (title functions, finite geometry) and
  `test/core/stylesheet.test.ts` (the consumer content contract), ported from rdd 7.4.0.
- The M15 colour and M16 corner baselines compare a frosted container's `::before` as its
  element: where it is drawn changed, what is drawn did not.
- M17 rules (`scripts/gates/m17.mjs`) and two selftest cases.

### Documentation

- Theming: Frosted glass and your own overlays; reduced motion under Animations. i18n: title
  functions; the sidebar and toasts follow `setDirection`. Panels: objects that cross into Vue's
  reactivity (`markRaw`, `shallowRef`, getters). ADR 0019; PARITY.md; the plan's M17.

## [1.4.0] — 2026-09-30

**Parity: react-dockable-desktop 6.3.1, plus react-dockable-desktop 7.2.0 and 7.3.0's skin
branding.** Branding, part two: your own surfaces and corner shape on any built-in skin. See
[Your surfaces](docs/manual/10-theming.md#your-surfaces) and [Corners](docs/manual/10-theming.md#corners).

### Added

- **`--vdd-brand-surface`** and **`--vdd-brand-text`**: set per scheme on `:root`, they replace
  every built-in skin's backgrounds and text — the workspace, panels, tab bar, sidebar, floating
  windows, modals, drawers, the taskbar, toasts, borders and muted text are all derived from the
  two. Set both or neither: with only one set, every skin keeps its own surfaces. A skin keeps
  its shape and effects (macOS's glass, Chrome's tabs, the VS Code accent bar) and each
  translucent surface keeps the skin's own transparency; the accent, status colours and shadows
  are not affected.
- **`--vdd-radius-scale`**: multiplies every corner the library draws — `0` square, `1` each
  skin's own (the default), `1.5` rounder. Circles and pills stay round. It also scales the
  radius tokens you set yourself (`--vdd-panel-float-radius`, `--vdd-panel-toolbar-btn-radius`,
  `--vdd-tab-btn-active-radius`).
- Manual: **Your surfaces** and **Corners** under Brand your app, the corner habit for custom
  skins, and the three variables in the token reference.

### Fixed

- **The workspace-edge drop preview was Bootstrap blue** (`#007bff`) in every skin, instead of
  the skin's accent. It follows `--vdd-accent-color` and `--vdd-brand-accent` now. It shows only
  while you drag a panel to a workspace edge.
- **Colours no token reached**: the dock-target chips, the light-mode outline button (the
  confirm dialog's Cancel) and the frosted panel toolbar painted literal colours in their own
  rules. They read the surface tokens now, and follow a brand surface; unbranded they are
  unchanged.

### Tests

- **M16 browser gate** (`scripts/gates/browser/m16.mjs`, real Chrome): the corner radii of every
  library element and pseudo-element, in all 7 skins × dark/light, match a 1.3.0 baseline with
  the scale unset, are `0px` at scale `0` and 1.5× at `1.5`, with circles and pills unchanged;
  with a brand surface set, no colour of any skin's own palette remains — rendered, hovered or as
  a token — the workspace, panel and tab bar stay distinct, and text on panels meets 4.5:1
  (muted 3:1); with only one of the two set, a scene matches M15's baseline. M15's gate still
  holds with no brand set.
- `test/core/stylesheet.test.ts`, ported from rdd 7.3.0: every corner length is scaled and the
  library never declares the scale; every coloured surface reads a derived value first, declared
  only on `:root` and built on the guarded base; no element rule paints a colour of its own.
- M16 rules (`scripts/gates/m16.mjs`) and two selftest cases. The M15 browser gate's scene
  helpers moved to `scripts/gates/lib/branding-scenes.mjs`, shared with M16. The playground
  takes `?bs=`, `?bt=` and `?rs=`.

### Documentation

- Theming chapter: Your surfaces, Corners, the fourth brandable-skin habit, token rows; README
  snippet; ADR 0018; PARITY.md; the plan's M16.

## [1.3.0] — 2026-09-29

**Parity: react-dockable-desktop 6.3.1, plus react-dockable-desktop 7.2.0's skin branding**
(the same port angular-dockable-desktop 1.1.0 made). Put your company's colour and font on any
built-in skin with a few CSS variables — no skin of your own needed. See
[Brand your app](docs/manual/10-theming.md#brand-your-app).

### Added

- **`--vdd-brand-accent`**: set on `:root`, it replaces the accent of every built-in skin in dark
  and light — tab indicators, active sidebar tabs and toolbar buttons, hover and active tints,
  glows, the focused window's glow, the taskbar, the drop and snap highlights, the primary
  button. Unset, each skin keeps its own accent.
- **`--vdd-brand-on-accent`**: the text colour on a solid accent fill (the confirm dialog's
  primary button, the highlighted dock target), for light brand colours such as yellow — in both
  schemes. Defaults as before: `#090b11`, and `#ffffff` on the primary button in light mode.
- **Per-skin fonts** through `--vdd-skin-font-family`: `vscode` uses VS Code's workbench font,
  `macos` San Francisco, `chrome` Google's UI fonts, `slate` Fluent's Segoe UI stack, `nord` a
  humanist sans (Avenir Next) and `tokyo` a monospace (JetBrains Mono); `obsidian` keeps the
  library stack. All are system font stacks — the library still loads no fonts — and your own
  `--vdd-font-family` replaces them all, teleported chrome included. `:root` now declares
  `--vdd-font-family` as `var(--vdd-skin-font-family, 'Outfit', 'Inter', system-ui,
  -apple-system, sans-serif)`.
- Manual: **Brand your app** — the brand variables, a per-scheme brand colour, loading your own
  font, following a UI framework's theme (PrimeVue, Bootstrap, Tailwind, shadcn-vue), where to
  put a logo (a custom `headerAction` entry on `<VddSidebar>`), and how to keep a custom skin
  brandable.

### Changed

- **Browser minimum**: CSS `color-mix()` — Chrome / Edge 111, Safari 16.2, Firefox 113 (all
  2023). In an older browser the tinted hover and active highlights lose their colour; layout and
  behaviour are unaffected.
- **The default skin's font** is VS Code's workbench stack (`-apple-system, BlinkMacSystemFont,
  'Segoe WPC', 'Segoe UI', …`) instead of `'Outfit', 'Inter', …`, which is now the fallback for
  skins that set no font (`obsidian`, and custom skins). If you loaded Outfit for the library,
  set `--vdd-font-family` to it. In `tokyo`, `nord`, `macos`, `chrome` and `slate` the font changes
  too — and panel content inherits it, so in `tokyo` your panels turn monospace unless they set a
  font of their own.
- **Every tint of the accent is derived from it** (`color-mix()` of `--vdd-accent-color`) instead
  of a hand-copied `rgba()`. With the built-in skins and no brand set, the look is unchanged
  except for the fixes below.
- `vscode` light mode has an accent of its own, `#0066cc` — the blue its light-mode tokens
  already used. The primary button, the taskbar's peek handle and the other accent uses, which
  were cyan on a light background, are that blue now. A custom skin that sets no accent gets it
  in light mode too.
- **Set the accent with `--vdd-brand-accent`, not `--vdd-accent-color`.** Every skin and the light
  scheme declare `--vdd-accent-color` with a selector that also matches the workspace element, so
  a `:root` override of it is replaced inside the workspace — now in `vscode` light mode as well,
  where 1.2.0 had no light accent to replace it with.

### Fixed

- **Overriding `--vdd-accent-color` on `:root` had no effect in 6 of the 7 skins**: each skin
  redeclared it on the workspace element. `--vdd-brand-accent`, which every skin reads first, is
  the supported way to rebrand.
- **Changing the accent left the old colour behind**: 142 hover, active and glow colours were
  copies of a skin's accent written as fixed `rgba()` values. They follow the accent now.
- **Skins showed colours that weren't theirs**: the default cyan (and `#0066cc` in light mode)
  left in other skins — the taskbar hover glow, the dock preview and corner-snap highlights, the
  floating-widget drop zones, the light-mode focused-tab indicator and taskbar text, the
  `--vdd-sidebar-card-*` and `--vdd-sidebar-btn-front-*` tokens — now show each skin's own
  accent. `slate` and `tokyo` drew their active states in a blue that wasn't their accent, and
  `obsidian`'s panel toolbar in a violet; they use their accent now. `obsidian`'s dark-mode white
  glows no longer show in light mode, where its accent is black.
- **The rail and toolbar buttons ignored `--vdd-font-family`**: a `<button>` does not inherit a
  font, so they drew their labels and badges in the browser's button font (Arial in Chrome) in
  every skin. The library's own form controls inherit the chrome font now, as in rdd 6.4.0; your
  own inputs and buttons inside a panel are left alone. Found by the M15 font check.

### Tests

- **M15 browser gate** (`scripts/gates/browser/m15.mjs`, real Chrome): with no brand set, the
  computed colours of every library element, its pseudo-elements, 8 hover states and every token
  (inside the workspace, in the toolbar outside it, and on `<body>`), in all 7 skins × dark/light
  with the chrome opened, match a 1.2.0 baseline — except exactly the fixes above; with a brand
  set, no trace of any original accent remains; a light brand with a dark on-accent colour is
  readable on the primary button in dark and light; each skin's font reaches every piece of
  chrome, and a brand font set on `:root` wins in every skin, teleported chrome included. Its
  `--control` run (a skin that redeclares its accent and its font) is rejected.
- `test/core/stylesheet.test.ts`, ported from rdd 7.2.0's branding contract: every
  `--vdd-accent-color` reads `--vdd-brand-accent` first, nothing in the library declares a
  `--vdd-brand-*` variable, no accent colour is written as a literal outside its one declaration,
  only `:root` declares `--vdd-font-family`, and text on accent fills reads
  `--vdd-brand-on-accent`.
- M15 rules (`scripts/gates/m15.mjs`): the release files, ADR 0017, the manual's skin-font table
  against the stylesheet, the browser minimum in the README and chapter 1, and PARITY.md.
- The playground takes `?skin=`, `?cs=light`, `?ba=` / `?bon=` (brand variables before mount)
  and `?anim=0`.
- **The gate runner no longer mistakes another app for its own**: with another dev server on
  the demo's port, `--strictPort` stopped vdd's demo from starting, the runner took the other
  app's answer as ready, and M14 timed out waiting for the demo. It now waits for its own Vite's
  ready line, moves to the next free port when the usual one is taken, and passes the URL to the
  browser gates (`VDD_APP_URL`; the usual ports stay the default when a gate is run by hand).

### Documentation

- Theming chapter: **Brand your app**, **Skin fonts**, brandable custom skins (the demo's `mono`
  skin now reads `--vdd-brand-accent` too), and the token reference (a branding table; tints
  listed as "the accent at N%").
- The browser minimum in the README and chapter 1; a Branding item in the README's features;
  the rdd 7.2.0 names in the migration chapter; ADR 0017; PARITY.md.

## [1.2.0] — 2026-09-24

**Parity: react-dockable-desktop 6.3.1.**

The remaining items from the user bug report that 1.1.2 left for a minor release: they add
behaviour, change a default, or extend a public type.

### Added

- **Tabs work from the keyboard.** Each tab group is one stop in the Tab order — its selected
  tab. ArrowLeft and ArrowRight move to the previous or next tab and show it, wrapping, and
  mirrored under RTL; Delete closes the focused tab, asking first if it has unsaved changes.
  The tab strip is a `tablist` and the body a `tabpanel`; a tab's close × is hidden from
  assistive technology, since Delete and the menu's Close cover it. A focus ring shows for
  keyboard focus only.

- **The context menu works from the keyboard.** It takes focus when it opens; ArrowDown and
  ArrowUp move between enabled items, Enter or Space runs one, and Tab or Escape closes it.
  Closing from the keyboard, or by running an item, hands focus back to whatever had it. A
  submenu now also opens on click, which helps on touch screens. A custom menu slot manages
  its own focus.

- **`--vdd-font-family`, one token for the font of all library chrome.** Set it to change the
  font of the workspace, sidebar, toolbar, modals, side panels, toasts, menus and flyouts in
  one place, or to `inherit` to use your page's font. See the theming chapter.

- **Two message keys: `notifications` and `closeNotification`.** The toast region's
  accessible name and a toast's close button were hard-coded English, as was the sidebar
  drawer's close button (now the existing `close` key). They go through the message table and
  formatter like every other string, and fall back to English where there is no workspace.

- **`<VddDesktop>` can be set up without a DOM.** Server-rendering it threw
  `document is not defined` and took the whole page render down. It now renders the chrome and
  leaves the panels to the client. `<ClientOnly>` remains the supported setup under Nuxt or
  other SSR, and the getting-started chapter says so.

### Changed

- **The chrome's default font.** The context menu used the system font stack while the rest of
  the chrome used the workspace's, and everything rendered outside the workspace — the sidebar
  and toolbar around it, modals, side panels, toasts, menus and flyouts — took the host page's
  body font. All of it now uses `--vdd-font-family`, which defaults to the workspace's stack.
  To keep the page's font, set `--vdd-font-family: inherit`.

- **`MessageKey` has two more keys.** A table typed `Record<MessageKey, string>`, as the i18n
  chapter recommends, fails to compile until it adds `notifications` and `closeNotification`.
  That is the check doing its job; partial `messages` overrides are unaffected.

## [1.1.2] — 2026-09-24

**Parity: react-dockable-desktop 6.3.1.**

Fixes from a user bug report. Every item was reproduced before it was fixed, and each fix has a
regression test that fails against 1.1.1. No public API changes: the export list in
`api-surface.json` is unchanged.

### Fixed

- **One Escape could close several things.** Modals, drawers, the context menu, the toolbar
  flyout and the toolbar search all listen for Escape, most of them on `document`, and the
  answering modal's `stopPropagation()` never stopped the other listeners there. So a drawer
  opened *after* a modal closed along with it; a context menu, toolbar flyout or toolbar search
  inside a modal or drawer closed its host too; and with a drawer on each side, one press
  closed both. Whoever acts on Escape now claims the event, and every other listener checks for
  a claim first. Transient UI answers before overlays: the menu and flyout listen in the
  capture phase, and the search claims on its own input. With two drawers open, the one opened
  last closes first. An application widget inside a modal can keep the modal open by calling
  `event.preventDefault()` on its own Escape. [ADR 0016](docs/decisions/0016-escape-claiming.md),
  divergence D17 in [PARITY.md](docs/PARITY.md). Covered by `test/components/escapeRouting.test.ts`.

- **A custom context-menu slot closed before its items could be clicked.** In slot mode the
  outside-press check had no element for the slot, so the `pointerdown` of any click inside it
  counted as outside and closed the menu; the `click` then never reached the item. The slot is
  now wrapped in a `display: contents` element that counts as inside. The docs said dismissal
  "becomes yours" in slot mode; it does not — Escape and an outside press still close the menu.

- **`usePanel()` did not work inside a modal or side panel.** It looked the panel up in the
  docked-panel state, which holds no overlays. So `onBeforeClose` registered nothing, and Escape
  or `close()` closed the overlay regardless; `onSaveState` and `minimize` warned that the panel
  was "rendered standalone"; `title` returned the instance id, and `dirty` stayed `false` after
  `setDirty(true)`. The overlay now supplies its title, dirty state and guard registration, and
  `onSaveState` and `minimize` say accurately why they do nothing there.

- **A toast adapter's `show` was never called.** A new toast only went into the built-in queue;
  only a repeat of its id reached the adapter, as `update`. The queued records were never
  removed either, so they piled up and all appeared at once if the adapter was later unset.
  In adapter mode nothing is queued now: a new id goes to `show` — with `type` and the
  container's `defaultDuration` and `defaultClosable` filled in — a repeated id to `update`,
  and a dismissed id used again is a new `show`. Toasts raised before the adapter mounts are
  handed to it. A toast's `onClose` is not called in adapter mode, and the docs now say so.

- **`loadLayout` accepted a partial layout and cleared the workspace.** Valid JSON with a
  `gridRoot` but without `floating`, `minimized` or `panels` parsed to an *empty* workspace,
  which `loadLayout` applied and reported as success — every open panel closed, and `true`
  returned. It now returns `false` with a warning and leaves the layout unchanged.

- **Right-to-left gestures went the wrong way.** A pointer delta is physical, while the sizes,
  sides and tab indexes it changes are logical, and a flex row reverses under RTL:
  - a horizontal split divider moved away from the pointer;
  - a sidebar resizer shrank the drawer when dragged away from its edge;
  - a toolbar flyout was placed by the workspace's direction, though the strip sits outside the
    workspace and follows the page — so an RTL workspace in an LTR page opened a left strip's
    flyout off-screen, and the viewport clamp pulled it back over the strip;
  - a tab dropped on another tab's left half was inserted on its right, and vice versa.

  Each gesture now reads its own element's computed direction when it starts. The manual's RTL
  section says that `<VddSidebar>` and `<VddToolbar>` follow the page's `dir`, not the
  workspace's.

- **`.vdd-fill-viewport` did nothing on `<VddDesktop>` itself.** There the class shares an
  element with `.vdd-workspace`, whose `height: 100%` has equal specificity and comes later. A
  compound selector now outranks it. The zero-height warning, which recommends the class, says
  where it can go.

- **A quick click on a taskbar icon could land on its preview.** The preview rose into place
  from below — starting at 90% of its lift, over the icon — so for its first frames a click or
  right-click meant for the icon hit the preview; and its hover bridge reached 4px past the gap
  even at rest. It now drifts down into place from just above, so neither the preview nor its
  bridge ever covers the icon, and the bridge spans exactly the 8px gap. Measured frame by
  frame in Chrome: a start below the resting place, even by 6px, still put the bridge over the
  top of the icon.

- **A collapsed toolbar left a 1px line and kept its buttons in the Tab order.** Collapsing only
  set the strip's size to zero. It now also removes the edge border and makes the strip `inert`.

- **Invalid ARIA.** Toolbar flyout tools were `role="menuitem"` with `aria-pressed`; they are
  now `menuitemradio` with `aria-checked`. Checkbox context-menu items carried `aria-checked` on
  a plain `menuitem`; they are now `menuitemcheckbox`. The toast container's `aria-label` sat on
  a `<div>` with no role, where it is ignored; it now has `role="region"`.

- **An event map declared as an `interface` failed to compile.** The manual shows
  `interface MyEvents { … }`, but the type parameter was constrained to
  `Record<string, unknown>`, which an interface does not satisfy (TS2344). The constraint on
  `createWorkspace`, `Workspace`, `useWorkspace` and `EventBus` is now `object`, so interfaces
  and type aliases both work. Payloads are still checked against the map.

### Documentation

- Removed the `#panel-actions` slot on `<VddDesktop>`, which was documented but never existed
  (manual and PARITY.md); the manual now says where a panel's own actions belong.
- `updateSplitSizes`: the root branch's path is `[]`; `[0]` is its first child.
- `<VddFloatingWidget>` takes `widget-id`, not `id`, in the migration guide.
- A close guard does not replace the unsaved-changes question: it runs first, and a dirty panel
  is still asked about.
- Only `useSidebar()` works from a panel in the workspace; `useSidebarTab()` needs a drawer tab.
- Filled in the empty table of theme tokens that have no base value, and corrected the prose
  around it: every rule that reads them has a fallback, and no built-in skin sets them.

## [1.1.1] — 2026-09-19

**Parity: react-dockable-desktop 6.3.1.**

### Fixed

- **Dragging the only docked panel onto its own group made it disappear.** With one panel in
  the workspace, dropping it on its own drop cross — any side, the centre, or its own tab
  strip — left the panel `docked` but in **no group**: no tab, nothing rendered, and still
  listed as open. Re-opening it did nothing, because an already-open panel is only focused;
  the only way back was to minimise and restore it, which returned it as a floating window.
  Dropping it on a workspace edge left an empty group holding half the width instead.

  The cause: the dock actions detach the panel before resolving the target, and detaching the
  only panel of a group **deletes that group** — so the drop destroyed the very target it
  named, and `splitLeafInTree` then had nothing to find. Dropping a lone panel onto its own
  group is now a no-op, since the result would be the layout it already has. Guarded in the
  store rather than in the drag layer, so `dockPanelToGroup`, `movePanelOrder` and
  `dockPanelToWorkspaceEdge` are safe for any caller, not just the mouse. The same bug, in a
  different shape, was [reported against react-dockable-desktop](https://github.com/felipecarrillo100/react-dockable-desktop)
  and fixed there in 6.3.1 — there it duplicated the panel into two groups instead.

- **A dock into a group that no longer exists no longer loses the panel.** Emptying a group
  removes it, so an id held across a layout change can name one that is gone; placing into it
  left the panel in no group. `dockPanelToGroup` and `movePanelOrder` now ignore such a call
  with a development warning.

- **Layouts already saved in the broken state are repaired when read.** `saveLayout()` wrote
  the corrupted tree out, so the fault came back on every reload and a stored layout stayed
  broken. Reading one now drops a panel listed in more than one group from all but the first,
  prunes a group emptied by that unless it set `keepOnEmpty`, collapses a branch left with one
  child, and puts a panel the layout calls docked but that no group lists back into the first
  group, naming each repair in a development warning. Only what is *read* changes — the saved
  format is untouched, so every rdd fixture still round-trips byte-identically.

- **`openPanel` recovers a panel that is in no group** instead of only focusing it — a safety
  net, now that nothing should produce that state.

- **An emptied root group keeps its own identity.** Removing the last panel replaced the root
  leaf with a fresh `group-default`, so a leaf the application had named, or had marked
  `keepOnEmpty` or `canClose: false`, silently lost all three.

Covered by `test/store/selfDrop.test.ts` (20), the repair and the guard as pure functions in
`test/core/layoutTree.test.ts`, and three compatibility tests for layouts written by 1.1.0.
New M6 rules keep the guard in the store rather than in the drag layer, and new M4 rules keep
the repair on the shared read path.

### Fixed — the gate harness itself

- **`npm run gate:selftest` was proving almost nothing.** It ran each gate as `node ${gate}`
  while 77 of its 89 checks passed a gate that already began with `node`, so the command
  executed was `node node scripts/gates/mN.mjs` — which fails whatever the mutation did, and a
  failing gate is exactly what the harness reads as "this rule caught its violation". Those
  rules were reported as proven without their gate ever running. The command is now used as
  given, and a mutation that changes no bytes is reported as a miss in its own right, since a
  stale anchor is the other way a check quietly stops testing anything.

  With the harness honest, four checks were failing: two pinned `version = '1.0.0'`, stale
  since 1.0.1, and now match any version; and two M14 capability checks were satisfied by
  *prose* — the capability scan read whole files, so a doc comment or a `<code>onBeforeClose()`
  in a paragraph counted as a demonstration. Capabilities that are called are now looked for in
  script blocks with comments stripped, and the two that are bound in markup are matched on a
  `<Vdd…>` tag. All 89 rules now genuinely fail when their rule is broken.

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

- **The sidebar rail did not fill its own column.** `.vdd-sidebar-strip-outer` is full height,
  but it is a block wrapper — added in this port to own the width-collapse transition — and a
  block does not stretch its child the way rdd's flex row did. So the strip inside it shrank to
  its buttons, 216px of a 915px column, and its background covered only the icons while the rest
  showed the host page through. It has `height: 100%` now.

- **A rail holding one tab collapsed that tab to its icon.** An active rail button takes
  `width: var(--vdd-tab-btn-active-width, 100%)`, and that percentage resolves against the
  shrink-to-fit tabs list; with a single tab there is no sibling to hold the list open, so button
  and list both shrank to 26px against a normal 44px, putting the accent border 15px inboard of
  the rail's edge. `.vdd-sidebar-tabs-list` now carries the same `min-width: 44px` floor that
  `.vdd-sidebar-header-area` and `.vdd-sidebar-footer-area` already had for exactly this reason.
  A rail with several tabs hid it, because the inactive buttons' own 44px kept the list open.

- **Text in a side panel was black on a dark background.** `.vdd-side-panel` set a background
  and no foreground, so content teleported into a drawer inherited the host page's text colour —
  the user agent's black. Measured at **1.18:1** in the demo's own Panel manager, against the
  16.31:1 of the library's title beside it. `.vdd-modal-window`, `.vdd-workspace` and
  `.vdd-sidebar-content-drawer` all set a colour; the drawer was simply missed. rdd has the same
  omission, hidden in its demo by Bootstrap's page-wide theme, which this demo deliberately does
  not import. An application that wants its own colour still sets it on its content or through
  `createWorkspace({ classes: { sidePanelBody } })`.

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
