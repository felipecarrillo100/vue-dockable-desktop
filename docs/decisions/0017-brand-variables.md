# 0017 — Brand variables: read by the library, never declared by it

**Status:** Accepted (2026-09-29, M15, release 1.3.0). Ported from react-dockable-desktop 7.2.0,
which made the same decisions; angular-dockable-desktop 1.1.0 made them too (its ADR 0014), and
this port follows it — the three stylesheets agree on the conversion, prefix aside.

## Context

An application wants its own colour and font on a built-in skin. In 1.2.0 the only way was to
override tokens, and for the accent that did not work: every skin but `vscode` declares
`--vdd-accent-color` in a `[data-vdd-skin="…"]` block, and that block matches the workspace
element as well as `<html>` (the skin is mirrored onto both, see the theming chapter). A `:root`
override was therefore replaced on the workspace element, closer to every panel. Where it did
apply, it recoloured only half of the accent: 142 hover fills, active tints and glows were the
skin's accent copied by hand as fixed `rgba()` values, and some skins drew their active states in
colours that were not their accent at all (the default cyan left in other skins, `slate`'s and
`tokyo`'s separate blues, `obsidian`'s violet panel toolbar).

Fonts had half of the problem solved already: 1.2.0 made `--vdd-font-family` the one token every
chrome rule reads, declared on `:root`. But a skin had no way to bring a font without declaring
`--vdd-font-family` itself — which would override the application's value the same way skins
overrode the accent — and the library's own rail and toolbar buttons never used the token: a
`<button>` does not inherit a font, so they kept the browser's button font.

## Decision

1. **The brand variables are the application's.** `--vdd-brand-accent` and
   `--vdd-brand-on-accent` are set by the application on `:root`. The library only *reads* them;
   no rule in the stylesheet declares a `--vdd-brand-*` variable, since a declaration on the
   element carrying `data-vdd-skin` would override the application's value there.
2. **One accent source.** Every `--vdd-accent-color` declaration — `:root`, the light scheme, and
   each skin's dark and light blocks — is `var(--vdd-brand-accent, <that skin's colour>)`. Every
   tint of the accent is `color-mix(in srgb, var(--vdd-accent-color) N%, transparent)`, with N the
   old alpha × 100, so an unbranded skin renders exactly as before. The one place a literal
   accent colour may appear is a `var()` fallback. The accent-family literals a skin showed
   instead of its own accent are converted too, as intended visible fixes; in `obsidian`, whose
   accent is white/black, only the accent *roles* are (active states, glows, the focused window),
   and text, scrollbars and plain shadows stay neutral.
3. **Text on an accent fill** — the primary button and the armed dock target — reads
   `--vdd-brand-on-accent`, in both schemes, because the library cannot tell whether a brand
   colour is light or dark. The defaults are unchanged: `var(--vdd-brand-on-accent, #090b11)`,
   and `var(--vdd-brand-on-accent, #ffffff)` for the primary button in light mode.
4. **A skin's font is `--vdd-skin-font-family`.** `:root` declares
   `--vdd-font-family: var(--vdd-skin-font-family, <library stack>)`, and every chrome rule reads
   `var(--vdd-font-family)` with no fallback of its own. A skin sets `--vdd-skin-font-family` (in
   its dark block, which also applies in light mode) and never `--vdd-font-family`, so an
   application's `:root` value wins in every skin. The value resolves on `<html>`, which
   `<VddDesktop>` gives `data-vdd-skin` too; chrome outside the workspace and teleported to
   `document.body` inherits it from there. The library's own form controls
   (`:where(button, input, select, textarea)[class*="vdd-"]`) inherit it as well, as in rdd
   6.4.0; a consumer's controls inside a panel are left alone. No web font is loaded: every skin
   font is a system stack.
5. **Browser minimum: CSS `color-mix()`** — Chrome / Edge 111, Safari 16.2, Firefox 113.

## Consequences

- Three lines of CSS brand every built-in skin, dark and light, including chrome teleported to
  `<body>`; pointing them at a UI framework's variables (`--p-primary-color`, `--bs-primary`)
  makes the workspace follow that theme, without the library depending on the framework.
- The rules above are pinned by `test/core/stylesheet.test.ts` ("branding contract"); the
  rendered result by the M15 browser gate, which compares every skin and scheme with a 1.2.0
  baseline and allows only the intended fixes.
- Visible changes for existing users, listed in the 1.3.0 changelog: the default skin's font is no
  longer Outfit, the rail and toolbar buttons use the chrome font instead of the browser's,
  `vscode` light mode gains the accent `#0066cc`, the leftover colours now follow each skin's
  accent, and `tokyo` panels inherit a monospace font.
- A `:root` override of `--vdd-accent-color` is not supported; `--vdd-brand-accent` is. With the new
  light-scheme accent this now also holds for `vscode` in light mode.
- Custom skins stay brandable only if they follow the same three habits; the theming chapter says
  so, and the demo's `mono` skin does.
