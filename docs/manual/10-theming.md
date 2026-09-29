# 10. Theming and skins

## The approach

Every class the library renders is prefixed `vdd-`, and every design token is a CSS custom
property named `--vdd-*`. There are no styles on your page, your `html`/`body`, or your own
elements — only on elements the library itself renders.

This matters because the library is meant to sit inside an app that already has a styling
framework. Vuetify, PrimeVue, Naive UI, Tailwind, or plain CSS: none of them collide with
`vdd-`, and nothing here redefines a generic class like `.active` or a bare element
selector.

To put your company's colour and font on a built-in skin you need no skin of your own — see
[Brand your app](#brand-your-app).

## Retheming

Override the tokens. Anywhere that wins the cascade will do:

```css
:root {
  --vdd-brand-accent:  #7c3aed;
  --vdd-bg-primary:    #0b0b12;
  --vdd-bg-workspace:  #12121c;
  --vdd-bg-panel:      #181826;
  --vdd-text-primary:  #ececf5;
  --vdd-border-color:  rgba(255, 255, 255, 0.07);
}
```

The chrome's font is a token too — one value for everything the library draws, including the
parts teleported to `<body>`, in every skin (see [Your brand font](#your-brand-font)):

```css
:root { --vdd-font-family: 'IBM Plex Sans', system-ui, sans-serif; }
/* or follow your page: */
:root { --vdd-font-family: inherit; }
```

Tokens are grouped by area, so you can retheme one part of the UI: `--vdd-window-*`,
`--vdd-modal-*`, `--vdd-side-panel-*`, `--vdd-taskbar-*`, `--vdd-tab-*`,
`--vdd-panel-toolbar-*`, `--vdd-panel-float-*`, `--vdd-scrollbar-*`.

The accent is set through `--vdd-brand-accent`, not `--vdd-accent-color`. Six of the seven
skins (all but `vscode`), and the light scheme, declare `--vdd-accent-color` themselves, with a
selector that also matches the workspace element, so a `:root` value of it is replaced there —
in every skin in light mode, and in all but `vscode` in dark. A skin's light block replaces it on
`<html>` as well, being more specific than `:root`. The same goes for any other token a skin
declares; a skin that should look different is the [skin of your own](#defining-your-own).

> Tokens live on `:root` by design, not by accident. The context menu, toasts, toolbar
> flyouts and the overlay search dropdown all teleport to `document.body`, and `<VddSidebar>`
> is normally an *ancestor* of `<VddDesktop>` — CSS variables only cascade downward, so
> scoping them to the workspace element would leave those parts unthemed.

## Brand your app

Every built-in skin, in dark and light, takes your company's colour and font from three
variables set on `:root` — and, if you want them, [your surfaces](#your-surfaces) and
[corner shape](#corners) from three more:

```css
/* your stylesheet, imported after vue-dockable-desktop/styles.css */
:root {
  --vdd-brand-accent: #e4002b;                 /* your brand colour */
  --vdd-brand-on-accent: #ffffff;              /* text on a brand-coloured fill (see below) */
  --vdd-font-family: 'Acme Sans', sans-serif;  /* your brand font */
}
```

That is all. Leave a variable unset and the skin keeps its own value.

| Variable | What follows it | Default |
|---|---|---|
| `--vdd-brand-accent` | Everything a skin draws in its accent: tab indicators, the active sidebar tab and toolbar button, hover and active tints, glows, the focused window's glow, the taskbar, the drop and snap highlights, the primary button. | Each skin's own accent |
| `--vdd-brand-on-accent` | Text drawn on a solid accent fill, in both schemes: the confirm dialog's primary button and the highlighted dock target while you drag. | `#090b11`; `#ffffff` on the primary button in light mode |
| `--vdd-font-family` | Every piece of chrome — tabs, title bars, toolbar, sidebar, menus, flyouts, toasts, drawers, modals — and panel content, which inherits the workspace font. | Each skin's own font |

Set them on `:root`, not on a wrapper around the workspace: the context menu, the toolbar
flyout, modals, drawers and toasts teleport to `document.body`, so a value set on a wrapper does
not reach them. And import your stylesheet after the library's, as for any token override: the
library's own `:root` block declares `--vdd-font-family`, and the tie is settled by order.

The library itself only ever *reads* `--vdd-brand-accent` and `--vdd-brand-on-accent`. Every
skin declares its accent as `var(--vdd-brand-accent, <its own colour>)`, and every tint of it —
hover fills, glows, the sidebar's card tokens — is a `color-mix()` of `--vdd-accent-color` at a
fixed percentage, so one colour drives them all.

> **Light brand colours.** The library cannot tell whether your colour is light or dark. With a
> light brand colour — yellow, lime, a pale cyan — set `--vdd-brand-on-accent` to a dark colour,
> so text on a brand-coloured button stays readable:
>
> ```css
> :root {
>   --vdd-brand-accent: #facc15;
>   --vdd-brand-on-accent: #1a1a1a;
> }
> ```
>
> It applies in both schemes. Unset, the defaults are as before: `#090b11`, and `#ffffff` on the
> primary button in light mode.

### A different brand colour for light mode

One brand colour applies to both schemes. If yours needs a darker shade on a light background,
scope a second value to the light scheme — the attribute your application already sets on
`<html>` (see [Light and dark](#light-and-dark)):

```css
:root                            { --vdd-brand-accent: #ff5a5f; }
:root[data-color-scheme="light"] { --vdd-brand-accent: #d93b40; }
```

### Your brand font

The library never loads a font. Load your company font the way you already do — an
`@font-face` rule, a `<link>` to your font provider in `index.html`, your design system's font
package imported in `main.ts` — and name it in `--vdd-font-family`, followed by fallbacks:

```css
@font-face {
  font-family: 'Acme Sans';
  src: url('/fonts/acme-sans.woff2') format('woff2');
  font-display: swap;
}
:root {
  --vdd-font-family: 'Acme Sans', system-ui, sans-serif;
}
```

It replaces every skin's own font. A skin never declares `--vdd-font-family` itself (it sets
`--vdd-skin-font-family`, which the `:root` value falls back to), so yours wins in every skin,
teleported chrome included.

To use your page's own font instead, set `--vdd-font-family: inherit` on `:root`, or
`--vdd-font-family: initial` on `<body>`. Both leave the token without a value, and the chrome
then inherits the page's font. (`inherit` works only on `:root`: below it, a custom property set
to `inherit` just copies the skin's stack down. `initial` on a wrapper reaches only the chrome
inside that wrapper.)

### Use your UI framework's theme

The library depends on no UI framework, so it cannot read your theme by itself — but most
frameworks' themes are already CSS variables on the page, so pointing the brand variables at
them is one line each, and the workspace then follows your theme, including when it changes at
runtime:

| Framework | Brand colour | Text on it | Font |
|---|---|---|---|
| PrimeVue 4 (styled mode) | `var(--p-primary-color)` | `var(--p-primary-contrast-color)` | your font |
| Bootstrap 5.3 | `var(--bs-primary)` | — | `var(--bs-body-font-family)` |
| Tailwind CSS v4 | a theme colour, e.g. `var(--color-indigo-600)` | — | `var(--font-sans)` |
| shadcn-vue | `var(--primary)` — or `hsl(var(--primary))` in versions that store it as HSL numbers | `var(--primary-foreground)` (same rule) | your font |

With PrimeVue, for example:

```css
/* your stylesheet, after the library's */
:root {
  --vdd-brand-accent: var(--p-primary-color);
  --vdd-brand-on-accent: var(--p-primary-contrast-color);
}
```

The variable you point at must be defined on `:root` (or `<html>`), where the brand variables
are read. A framework that declares its theme variables on an element of its own instead —
Vuetify's `.v-theme--light` / `.v-theme--dark` on `<v-app>` — cannot be followed this way from
`:root`; set the brand colour to the same value your theme uses.

### Your surfaces

Two more variables replace a skin's backgrounds and text with your own, per scheme: `--vdd-brand-surface` (the app background) and `--vdd-brand-text` (the main text colour). The library derives every other surface from those two — panels and the workspace a few percent towards the text, the tab bar and rail a little darker, borders and muted text as mixes of the two — so layers stay distinct and text stays readable:

```css
/* dark is the default: a missing data-color-scheme reads as dark */
:root:not([data-color-scheme="light"]) {
  --vdd-brand-surface: #0b1f3a;
  --vdd-brand-text: #e8eef7;
}
:root[data-color-scheme="light"] {
  --vdd-brand-surface: #f4f1ec;
  --vdd-brand-text: #2b2620;
}
```

- **Set both, or neither.** With only one of them set, every skin keeps its own surfaces — half a palette is the case most likely to be unreadable.
- **A scheme you leave out keeps the skin's surfaces.** Brand dark only, and light mode looks as it always did.
- **A skin keeps its shape and effects** — macOS's glass and window buttons, Chrome's tabs, the VS Code accent bar. Only the colours come from you, so with a brand surface set the skins differ by shape, not by colour. Each translucent surface (macOS panels, floating windows, modals) keeps the skin's own transparency.
- **Not affected:** the accent (that's `--vdd-brand-accent`), status colours (errors, warnings, the toast types), and shadows.

Pick a surface and a text colour with enough contrast between them — the text is used as-is on the panels. The M16 gate requires 4.5:1 for the main text on panels with the two colours above.

### Corners

`--vdd-radius-scale` multiplies every corner the library draws:

```css
:root { --vdd-radius-scale: 0; }    /* square corners, everywhere */
```

`1` (the default) is each skin's own shape, `0` is square, `1.5` is rounder; a skin keeps its own proportions at every scale, so macOS stays rounder than VS Code. Circles and pills stay round: macOS's window buttons and the taskbar's peek handle. It also scales the radius tokens you can set yourself (`--vdd-panel-float-radius`, `--vdd-panel-toolbar-btn-radius`, `--vdd-tab-btn-active-radius`).

### Your logo

The library draws no logo of its own — where one goes is your application's decision. Two
natural places:

- **Your own header or toolbar content**, outside the workspace — it is your markup, so anything
  goes.
- **The top of the `<VddSidebar>` rail**, where VS Code, Slack and Teams put theirs. A custom
  rail entry in `headerAction` renders your component as-is
  ([chapter 6](06-sidebar-toolbar.md#pinned-rail-entries)):

```vue
<script setup lang="ts">
import { VddDesktop, VddSidebar } from 'vue-dockable-desktop'
import type { SidebarRailEntry } from 'vue-dockable-desktop'
import AcmeLogo from './AcmeLogo.vue'   // <img src="/acme-mark.svg" alt="Acme" class="acme-logo" />

const logo: SidebarRailEntry = { id: 'logo', custom: true, component: AcmeLogo }
</script>

<template>
  <VddSidebar :tabs="[]" :header-action="logo">
    <VddDesktop class="vdd-fill-viewport" />
  </VddSidebar>
</template>
```

The rail is narrow, so a square mark fits better than a wide wordmark. Adjust its spacing with
`--vdd-sidebar-header-area-padding-top` and `--vdd-sidebar-header-area-padding-bottom` (both
`8px`).

### Browser support

Branding relies on CSS `color-mix()`, available since Chrome 111, Edge 111, Safari 16.2 and
Firefox 113 (all 2023). In an older browser the tinted hover and active highlights lose their
colour; layout and behaviour are unaffected.

## Skins

A skin is a preset of tokens, selected by prop:

```vue
<VddDesktop skin="vscode" />
```

Built in: `vscode` (the default), `macos`, `chrome`, `slate`, `nord`, `obsidian`, `tokyo`. Each
ships a dark and a light variant.

### Skin fonts

Each skin also brings its own font, the platform's UI font where it has a known one. They are
system font stacks — the library loads none of them, so each machine uses the first one it has —
and your `--vdd-font-family` replaces them all ([Your brand font](#your-brand-font)):

| Skin | Font (`--vdd-skin-font-family`) |
|---|---|
| `vscode` | VS Code's workbench font: `-apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, 'Ubuntu', 'Droid Sans', sans-serif` |
| `macos` | San Francisco: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif` |
| `chrome` | Google's UI fonts: `'Google Sans Text', 'Google Sans', Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif` |
| `slate` | Fluent's stack: `'Segoe UI Variable Text', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif` |
| `nord` | No official font; a softer humanist sans: `'Avenir Next', 'Nunito', 'Segoe UI', system-ui, sans-serif` |
| `obsidian` | The library's fallback stack: `'Outfit', 'Inter', system-ui, -apple-system, sans-serif` |
| `tokyo` | No official font; a terminal/editor feel: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` |

Panel content inherits the workspace font, so in `tokyo` your own panels turn monospace too
unless they set a font of their own.

A skin's font reaches the sidebar, the toolbar and everything teleported to `document.body` for
the same reason its colours do: `data-vdd-skin` is mirrored onto `<html>` (below), where `:root`
resolves `--vdd-font-family` from the skin's `--vdd-skin-font-family`, and every element inherits
the result.

The name is mirrored as `data-vdd-skin` onto **two** elements: `document.documentElement`, so the
chrome that teleports to `document.body` (menus, toasts, flyouts) picks up the skin's variables
too, and the workspace element itself, alongside `data-color-scheme` — see
[Light and dark](#light-and-dark) for why that pairing matters.

### Defining your own

Scope tokens to your skin's name and pass it as the prop. Nothing has to be registered:

```css
/* your stylesheet, imported after vue-dockable-desktop/styles.css */
[data-vdd-skin="mono"] {
  --vdd-bg-panel: #1a1a1a;
  --vdd-bg-tab-bar: #0f0f0f;
  --vdd-accent-color: var(--vdd-brand-accent, #e5e5e5);
  --vdd-accent-glow: color-mix(in srgb, var(--vdd-accent-color) 18%, transparent);
  --vdd-tab-indicator-focused: #ffffff;
  --vdd-panel-float-radius: 0;
}

[data-vdd-skin="mono"][data-color-scheme="light"] {
  --vdd-bg-panel: #ffffff;
  --vdd-bg-tab-bar: #e4e4e4;
  --vdd-accent-color: var(--vdd-brand-accent, #171717);
  --vdd-accent-glow: color-mix(in srgb, var(--vdd-accent-color) 12%, transparent);
  --vdd-tab-indicator-focused: #171717;
}
```

```vue
<VddDesktop skin="mono" />
```

Two rules worth following exactly, both learned by measurement:

**Leave the selector unqualified.** `html[data-vdd-skin="mono"]` looks stronger — and against
`:root` it is — but it cannot match the *workspace* element, where the library's own
`[data-color-scheme="light"]` block then re-declares the same tokens closer to your content and
wins. A bare `[data-vdd-skin="mono"]` matches both elements and outranks the scheme block at each,
which is exactly how the built-in skins are written.

**Import your stylesheet after the library's.** A bare attribute selector and the library's
`:root` block have identical specificity, so the tie is broken by order. The setup in
[chapter 1](01-getting-started.md) already imports `vue-dockable-desktop/styles.css` in your entry
file, so keeping your own CSS after it is enough.

A skin is tokens, which recolour everything. The built-ins also carry a little element-level CSS
for treatments tokens cannot express — macOS's backdrop blur, the accent bar on an active tab —
and your skin can add rules of that kind against `vdd-` classes if it wants them.

The demo ships `mono` as a worked example: see the bottom of `demo/src/demo.css`, and pick it from
the skin dropdown to see it in both schemes.

> **Let your skin take a brand, as the built-in ones do.** Four habits keep a skin brandable:
>
> - Declare the accent as `var(--vdd-brand-accent, <your colour>)`, never as a bare colour.
> - Write every tint of it as `color-mix(in srgb, var(--vdd-accent-color) N%, transparent)`
>   instead of an `rgba()` of the same colour — then one accent drives them all.
> - Give your skin a font with `--vdd-skin-font-family`, never `--vdd-font-family`: declared in a
>   skin, `--vdd-font-family` would override the one an application sets on `:root`. Likewise,
>   never declare a `--vdd-brand-*` variable in a skin — those belong to the application.
> - Write a corner radius your own rules add as `calc(6px * var(--vdd-radius-scale, 1))`, so
>   [`--vdd-radius-scale`](#corners) reaches it too.
>
> A skin of your own keeps its own surfaces: [brand surfaces](#your-surfaces) recolour the
> built-in skins, and a custom skin is where you choose every colour yourself.
>
> A skin that sets no accent of its own gets the default skin's (`#38bdf8` dark, `#0066cc` light),
> and one that sets no font gets the library's fallback stack. The library's own tints, the
> active tab icon and the sidebar's accent tokens all follow `--vdd-accent-color`, so a skin that
> sets only its accent is recoloured throughout.

## Light and dark

**Your application owns the scheme.** The library styles itself from a `data-color-scheme`
attribute on `document.documentElement`, and never writes it — which scheme is current is an
application decision, often tied to a user preference or `prefers-color-scheme`:

```ts
watch(scheme, (value) => {
  if (value === 'light') document.documentElement.setAttribute('data-color-scheme', 'light')
  else document.documentElement.removeAttribute('data-color-scheme')
}, { immediate: true })
```

Anything other than `'light'` reads as dark, including the attribute being absent, so there is no
third state to handle.

`<VddDesktop>` reads that attribute and mirrors it onto the workspace element, next to
`data-vdd-skin`. That is not redundant: a skin's token block matches the workspace element as well
as the root, so without the scheme there too, a skin's dark tokens would be re-declared closer to
your content than the root's light ones and shadow them — the workspace would paint dark panels
with dark text in light mode.

Panel content can read the scheme reactively — useful for a map's tile layer or an embedded
editor's theme:

```ts
import { useColorScheme } from 'vue-dockable-desktop'
const scheme = useColorScheme()            // ComputedRef<'dark' | 'light'>
watch(scheme, s => map.setTheme(s))
```

## Animations

```vue
<VddDesktop :animations="false" />
```

Disables the library's own transitions only — tab hovers, dock previews, drawer collapse.
Your app's animations are untouched. The setting is mirrored to teleported chrome so menus
and toasts match.

## Stacking against your own overlays

If your app's modals and the workspace fight over z-index, move the library's whole range in
one go:

```ts
createWorkspace({ zIndexBase: 3000 })
```

Floating windows and every piece of library chrome shift together, via `--vdd-z-base`. The
default is `1000`.

## Custom classes on library containers

For targeted styling without fighting the cascade:

```ts
createWorkspace({
  classes: {
    window: 'my-window',      windowBody: 'my-window-body',
    modal: 'my-modal',        modalBody: 'my-modal-body',
    sidePanel: 'my-drawer',   sidePanelBody: 'my-drawer-body',
  },
})
```

Your classes are *added* to the library's own, so `vdd-` styling stays and yours layers on top.
This is the way in for a utility framework — Tailwind, Bootstrap, MUI — on elements that live
inside the library's markup and that you otherwise cannot reach.


## Token reference

Every token the library declares on `:root`, with its default. This is the complete surface a
skin or a retheme can override — a gate checks this table against the stylesheet in both
directions, so a token cannot be added without a row here, and a row cannot outlive its token.
Where a default below is "the accent at N%", it is `color-mix(in srgb, var(--vdd-accent-color)
N%, transparent)`.

### Branding — set by your application

Never declared by the library, only read. See [Brand your app](#brand-your-app).

| Token | Default | What it paints |
|---|---|---|
| `--vdd-brand-accent` | *(unset)* | Replaces every skin's accent, in dark and light. |
| `--vdd-brand-on-accent` | *(unset — `#090b11`; `#ffffff` on the primary button in light mode)* | Text on a solid accent fill, in both schemes: the primary button, the active dock target. |
| `--vdd-brand-surface` | *(unset)* | With `--vdd-brand-text`, replaces every skin's backgrounds; see [Your surfaces](#your-surfaces). |
| `--vdd-brand-text` | *(unset)* | With `--vdd-brand-surface`, replaces every skin's text; borders and muted text are mixes of the two. |
| `--vdd-radius-scale` | *(unset — `1`)* | Multiplies every corner; see [Corners](#corners). |

A skin sets its own font as `--vdd-skin-font-family` — declared by each built-in skin (see
[Skin fonts](#skin-fonts)), never on `:root` — which `--vdd-font-family` falls back to.

### Surfaces

| Token | Default | What it paints |
|---|---|---|
| `--vdd-bg-primary` | `#090b11` | Backdrop behind the whole workspace. |
| `--vdd-bg-workspace` | `#0f111a` | The grid area behind panels and dividers. |
| `--vdd-bg-panel` | `#141722` | A docked panel's body. |
| `--vdd-bg-tab-bar` | `#0d0f16` | The strip behind a group's tabs. |
| `--vdd-bg-tab-inactive` | `#0c0d12` | An unselected tab. |
| `--vdd-bg-tab-hover` | `#171a22` | A tab under the pointer. |
| `--vdd-border-color` | `rgba(255, 255, 255, 0.08)` | Default hairline between chrome surfaces. |
| `--vdd-border-panel` | `rgba(255, 255, 255, 0.08)` | Border around a docked panel. |
| `--vdd-resizer-bg` | `rgba(255, 255, 255, 0.08)` | The split divider between panels. |

### Text

| Token | Default | What it paints |
|---|---|---|
| `--vdd-text-primary` | `#f1f5f9` | Default text colour inside library chrome. |
| `--vdd-text-secondary` | `#94a3b8` | Muted text - hints, counts, placeholders. |
| `--vdd-text-tab-active` | `#ffffff` | Label of the selected tab. |
| `--vdd-text-tab-inactive` | `#858b99` | Label of an unselected tab. |
| `--vdd-font-family` | `var(--vdd-skin-font-family, 'Outfit', 'Inter', system-ui, -apple-system, sans-serif)` | The font of all library chrome: the workspace, tabs and windows, the sidebar and toolbar, modals, side panels, toasts, menus and flyouts. Set it to `inherit` to use your page's font. |
| `--vdd-text-tab-hover` | `#e2e8f0` | Label of a tab under the pointer. |

### Accent

| Token | Default | What it paints |
|---|---|---|
| `--vdd-accent-color` | `var(--vdd-brand-accent, #38bdf8)` (light: `#0066cc`) | The one colour that carries selection and focus throughout. Every tint of it in the library is a `color-mix()` of this token. |
| `--vdd-accent-glow` | the accent at 15% | Translucent halo behind accented elements. |

### Tabs

| Token | Default | What it paints |
|---|---|---|
| `--vdd-tab-bg-active-focused` | `var(--vdd-bg-panel)` | Selected tab in the active group. |
| `--vdd-tab-bg-active-unfocused` | `rgba(20, 23, 34, 0.55)` | Selected tab in an inactive group. |
| `--vdd-tab-text-active-focused` | `var(--vdd-text-tab-active, #ffffff)` | Label of the selected tab in the active group. |
| `--vdd-tab-text-active-unfocused` | `rgba(255, 255, 255, 0.65)` | Label of the selected tab in an inactive group. |
| `--vdd-tab-indicator-focused` | `var(--vdd-accent-color, #38bdf8)` | Accent bar on the selected tab of the active group. |
| `--vdd-tab-indicator-unfocused` | `rgba(255, 255, 255, 0.3)` | Accent bar on the selected tab of an inactive group. |
| `--vdd-tab-accent-bar-width` | `3px` | Thickness of that accent bar. |
| `--vdd-tab-btn-active-glow` | `none` | Halo behind an active sidebar tab button. |
| `--vdd-tab-btn-active-radius` | `0px` | Corner radius of an active sidebar tab button. |
| `--vdd-tab-btn-active-width` | `100%` | Width of the selected rail button, as a share of the rail's tab container — which floors at 44px, a button's own size. |

### Buttons

| Token | Default | What it paints |
|---|---|---|
| `--vdd-close-btn-color` | `#858b99` | A close glyph at rest. |
| `--vdd-close-btn-hover-bg` | `rgba(255, 255, 255, 0.12)` | Its background on hover. |
| `--vdd-close-btn-hover-color` | `#ffffff` | Its glyph on hover. |
| `--vdd-close-btn-active-color` | `#e2e8f0` | Its glyph while pressed. |
| `--vdd-custom-btn-bg` | `rgba(255, 255, 255, 0.03)` | Title-bar and tab-bar action buttons. |
| `--vdd-custom-btn-border` | `rgba(255, 255, 255, 0.05)` | Their border. |
| `--vdd-custom-btn-hover-bg` | `rgba(255, 255, 255, 0.12)` | Their background on hover. |
| `--vdd-custom-btn-hover-color` | `#ffffff` | Their glyph on hover. |
| `--vdd-header-button-gap` | `4px` | Spacing between title-bar action buttons. |

### Floating windows

| Token | Default | What it paints |
|---|---|---|
| `--vdd-window-bg` | `rgba(20, 22, 28, var(--vdd-window-opacity, 0.85))` | A floating window body. Reads `--vdd-window-opacity` if you set one. |
| `--vdd-window-border` | `rgba(255, 255, 255, 0.08)` | A floating window border, unfocused. |
| `--vdd-window-border-focused` | `rgba(255, 255, 255, 0.28)` | A floating window border when it is the active panel. |
| `--vdd-window-header-bg` | `rgba(0, 0, 0, 0.25)` | A floating window's title bar. |
| `--vdd-window-text` | `#f8f9fa` | Title-bar text and icons. |
| `--vdd-window-shadow` | `0 16px 40px rgba(0, 0, 0, 0.4)` | Drop shadow, unfocused. |
| `--vdd-window-shadow-focused` | `0 24px 50px rgba(0, 0, 0, 0.55)` | Drop shadow when focused. |

### Modals

| Token | Default | What it paints |
|---|---|---|
| `--vdd-modal-curtain-bg` | `rgba(9, 11, 17, 0.65)` | The dimming layer behind a modal. |
| `--vdd-modal-bg` | `rgba(20, 23, 34, 0.95)` | A modal's window box. |
| `--vdd-modal-border` | `rgba(255, 255, 255, 0.08)` | A modal's border. |
| `--vdd-modal-header-bg` | `rgba(0, 0, 0, 0.15)` | A modal's header strip. |
| `--vdd-modal-header-border` | `rgba(255, 255, 255, 0.06)` | Hairline under a modal header. |
| `--vdd-modal-close-hover-color` | `#ffffff` | A modal's close button on hover. |

### Side panels

| Token | Default | What it paints |
|---|---|---|
| `--vdd-side-panel-bg` | `rgba(20, 23, 34, 0.88)` | A side panel (drawer) body. |
| `--vdd-side-panel-border` | `rgba(255, 255, 255, 0.08)` | A drawer's edge border. |
| `--vdd-side-panel-header-bg` | `rgba(0, 0, 0, 0.15)` | A drawer's header strip. |
| `--vdd-side-panel-header-border` | `rgba(255, 255, 255, 0.06)` | Hairline under a drawer header. |
| `--vdd-side-panel-close-hover-color` | `#ffffff` | A drawer's close button on hover. |

### Taskbar

| Token | Default | What it paints |
|---|---|---|
| `--vdd-taskbar-bg` | `rgba(0, 0, 0, 0.75)` | The minimised-panel strip. |
| `--vdd-taskbar-border` | `rgba(255, 255, 255, 0.1)` | The strip edge. |
| `--vdd-taskbar-nav-color` | `rgba(255, 255, 255, 0.5)` | Its overflow arrows. |
| `--vdd-taskbar-item-bg` | `rgba(15, 23, 42, 0.6)` | A minimised panel icon tile. |
| `--vdd-taskbar-item-hover-bg` | `rgba(15, 23, 42, 0.8)` | That tile on hover. |
| `--vdd-taskbar-item-border` | `rgba(255, 255, 255, 0.08)` | The tile border. |
| `--vdd-taskbar-item-text` | `var(--vdd-accent-color, #38bdf8)` | The tile icon colour. |

### Scrollbars

| Token | Default | What it paints |
|---|---|---|
| `--vdd-scrollbar-thumb` | `rgba(255, 255, 255, 0.1)` | Scrollbar thumb inside library chrome. |
| `--vdd-scrollbar-thumb-hover` | `rgba(255, 255, 255, 0.2)` | Thumb on hover. |
| `--vdd-scrollbar-track` | `rgba(255, 255, 255, 0.01)` | Scrollbar track. |

### Panel overlay - toolbars

| Token | Default | What it paints |
|---|---|---|
| `--vdd-panel-toolbar-padding` | `8px` | Padding inside a panel toolbar strip. |
| `--vdd-panel-toolbar-gap` | `4px` | Gap between its buttons. |
| `--vdd-panel-toolbar-btn-size` | `32px` | Button hit size (a coarse-pointer media rule enlarges it). |
| `--vdd-panel-toolbar-btn-radius` | `6px` | Button corner radius. |
| `--vdd-panel-toolbar-fg` | `rgba(255, 255, 255, 0.65)` | Button glyph at rest. |
| `--vdd-panel-toolbar-fg-hover` | `rgba(255, 255, 255, 0.95)` | Button glyph on hover. |
| `--vdd-panel-toolbar-btn-hover-bg` | `var(--vdd-toolbar-btn-hover-bg, rgba(255, 255, 255, 0.08))` | Button background on hover. |
| `--vdd-panel-toolbar-btn-active-bg` | `var(--vdd-toolbar-btn-radio-active-bg, rgba(56, 189, 248, 0.14))` | Background of a toggled or selected button. |
| `--vdd-panel-toolbar-btn-active-color` | `var(--vdd-tab-icon-active, #38bdf8)` | Glyph of a toggled or selected button. |
| `--vdd-panel-toolbar-separator-color` | `var(--vdd-toolbar-separator-color, rgba(255, 255, 255, 0.09))` | Separator inside a panel toolbar. |

### Panel overlay - floating widgets

| Token | Default | What it paints |
|---|---|---|
| `--vdd-panel-float-bg` | `rgba(22, 24, 34, 0.92)` | A floating widget inside a panel. |
| `--vdd-panel-float-border` | `rgba(255, 255, 255, 0.1)` | That widget border. |
| `--vdd-panel-float-radius` | `8px` | Its corner radius. |
| `--vdd-panel-float-shadow` | `0 4px 16px rgba(0, 0, 0, 0.35)` | Its shadow when not on top. |
| `--vdd-panel-float-shadow-active` | `0 8px 28px rgba(0, 0, 0, 0.55)` | Its shadow when on top. |
| `--vdd-panel-float-header-bg` | `var(--vdd-window-header-bg, rgba(0, 0, 0, 0.25))` | Its header, when not on top. |
| `--vdd-panel-float-header-bg-active` | `var(--vdd-window-header-bg, rgba(0, 0, 0, 0.25))` | Its header, when on top. |
| `--vdd-panel-float-title-color` | `var(--vdd-window-text, #f8f9fa)` | Its title text, when not on top. |
| `--vdd-panel-float-title-color-active` | `var(--vdd-window-text, #f8f9fa)` | Its title text, when on top. |

### For panel content

| Token | Default | What it paints |
|---|---|---|
| `--vdd-panel-card-bg` | `rgba(0, 0, 0, 0.2)` | Card surface offered to panel content that wants to match the chrome. |
| `--vdd-panel-card-border` | `rgba(255, 255, 255, 0.1)` | That card border. |
| `--vdd-panel-text` | `var(--vdd-text-primary)` | Text colour for the same. |
| `--vdd-panel-title-color` | `var(--vdd-accent-color, #38bdf8)` | Heading colour for the same. |

### Sidebar — rail and drawer

| Token | Default | What it paints |
|---|---|---|
| `--vdd-sidebar-tabs-bg` | `#141619` | The activity rail behind the tab buttons. |
| `--vdd-sidebar-bg` | `#1e2024` | The drawer's surface. |
| `--vdd-sidebar-border` | `rgba(255, 255, 255, 0.08)` | Rail and drawer edges. |
| `--vdd-sidebar-drawer-header-bg` | `rgba(0, 0, 0, 0.12)` | The drawer's header strip. |
| `--vdd-sidebar-text-title` | `#f8f9fa` | Headings inside the drawer. |
| `--vdd-sidebar-text-muted` | `#8a90a0` | Secondary text inside the drawer. |
| `--vdd-tab-icon-inactive` | `#9ea4b0` | Icon of an unselected rail button. |
| `--vdd-tab-icon-active` | `var(--vdd-accent-color)` | Icon of the selected rail button, and of an active toolbar button. |
| `--vdd-tab-btn-active-bg` | `#1e2024` | The selected rail button behind its icon. |
| `--vdd-tab-btn-active-shadow` | `none` | Shadow behind it. |
| `--vdd-sidebar-btn-hover-bg` | `rgba(255, 255, 255, 0.05)` | A rail button under the pointer. |
| `--vdd-sidebar-badge-bg` | `#2d3139` | Badge behind a count on a rail button. |
| `--vdd-sidebar-badge-text` | `#b0b5c0` | That badge text. |
| `--vdd-sidebar-card-bg` | `rgba(255, 255, 255, 0.03)` | Card surface offered to drawer content. |
| `--vdd-sidebar-card-border` | `rgba(255, 255, 255, 0.08)` | That card border. |
| `--vdd-sidebar-card-hover-bg` | `rgba(255, 255, 255, 0.04)` | That card on hover. |
| `--vdd-sidebar-card-hover-border` | the accent at 25% | Its border on hover. |
| `--vdd-sidebar-card-active-bg` | the accent at 6% | That card when selected. |
| `--vdd-sidebar-card-active-border` | the accent at 30% | Its border when selected. |
| `--vdd-sidebar-card-active-shadow` | the accent at 8% | Its glow when selected. |
| `--vdd-sidebar-btn-front-bg` | `transparent` | Primary-button style offered to drawer content. |
| `--vdd-sidebar-btn-front-border` | `var(--vdd-accent-color)` | Its border. |
| `--vdd-sidebar-btn-front-text` | `var(--vdd-accent-color)` | Its label. |
| `--vdd-sidebar-btn-front-hover-bg` | the accent at 10% | Its background on hover. |

### Workspace toolbar

| Token | Default | What it paints |
|---|---|---|
| `--vdd-toolbar-btn-hover-bg` | `rgba(255, 255, 255, 0.06)` | A workspace-toolbar button under the pointer. |
| `--vdd-toolbar-btn-radio-active-bg` | the accent at 14% | The selected radio button in a workspace toolbar. |
| `--vdd-toolbar-btn-toggle-active-bg` | the accent at 8% | An engaged toggle in a workspace toolbar. |
| `--vdd-toolbar-btn-active-glow` | `none` | Halo behind an active workspace-toolbar button. |
| `--vdd-toolbar-btn-active-shadow` | `none` | Shadow behind either of those. |
| `--vdd-toolbar-accent-bar-width` | `3px` | Thickness of the accent bar on an active workspace-toolbar button. |
| `--vdd-toolbar-separator-color` | `rgba(255, 255, 255, 0.09)` | Separator between workspace-toolbar groups. |

### Machinery

| Token | Default | What it paints |
|---|---|---|
| `--vdd-z-base` | `1000` | Base stacking level for floating windows and all chrome. Set it through `createWorkspace({ zIndexBase })`, not here. |
| `--vdd-styles-loaded` | `1` | Sentinel the library checks on mount to detect a missing stylesheet import. Do not override. |

### Knobs with no base value

These are read by the stylesheet but set nowhere — not on `:root`, not by any built-in skin.
Every rule that reads them supplies its own fallback, so leaving them unset is the supported
state; set one in your own skin to change it. `--vdd-window-opacity` is the reason they are
not given a base value: each skin reads it with a different fallback, so one value on `:root`
would repaint every skin.

| Token | Fallback | What it paints |
|---|---|---|
| `--vdd-window-opacity` | per skin, `0.7`–`1.0` (default skin `0.85`) | Alpha of a floating window's background |
| `--vdd-sidebar-header-area-padding-top` | `8px` | Space above the sidebar rail's header slot |
| `--vdd-sidebar-header-area-padding-bottom` | `8px` | Space below the sidebar rail's header slot |
| `--vdd-sidebar-footer-area-padding-top` | `8px` | Space above the sidebar rail's footer slot |
| `--vdd-sidebar-footer-area-padding-bottom` | `8px` | Space below the sidebar rail's footer slot |
| `--vdd-toast-offset-top` | `0px` | Distance of a top-positioned toast stack from the viewport's top edge |
| `--vdd-toast-offset-bottom` | `0px` | Distance of a bottom-positioned toast stack from the viewport's bottom edge |
