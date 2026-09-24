# 10. Theming and skins

## The approach

Every class the library renders is prefixed `vdd-`, and every design token is a CSS custom
property named `--vdd-*`. There are no styles on your page, your `html`/`body`, or your own
elements — only on elements the library itself renders.

This matters because the library is meant to sit inside an app that already has a styling
framework. Vuetify, PrimeVue, Naive UI, Tailwind, or plain CSS: none of them collide with
`vdd-`, and nothing here redefines a generic class like `.active` or a bare element
selector.

## Retheming

Override the tokens. Anywhere that wins the cascade will do:

```css
:root {
  --vdd-accent-color:  #7c3aed;
  --vdd-bg-primary:    #0b0b12;
  --vdd-bg-workspace:  #12121c;
  --vdd-bg-panel:      #181826;
  --vdd-text-primary:  #ececf5;
  --vdd-border-color:  rgba(255, 255, 255, 0.07);
}
```

Tokens are grouped by area, so you can retheme one part of the UI: `--vdd-window-*`,
`--vdd-modal-*`, `--vdd-side-panel-*`, `--vdd-taskbar-*`, `--vdd-tab-*`,
`--vdd-panel-toolbar-*`, `--vdd-panel-float-*`, `--vdd-scrollbar-*`.

> Tokens live on `:root` by design, not by accident. The context menu, toasts, toolbar
> flyouts and the overlay search dropdown all teleport to `document.body`, and `<VddSidebar>`
> is normally an *ancestor* of `<VddDesktop>` — CSS variables only cascade downward, so
> scoping them to the workspace element would leave those parts unthemed.

## Skins

A skin is a preset of tokens, selected by prop:

```vue
<VddDesktop skin="vscode" />
```

Built in: `vscode` (the default), `macos`, `chrome`, `slate`, `nord`, `obsidian`, `tokyo`. Each
ships a dark and a light variant.

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
  --vdd-accent-color: #e5e5e5;
  --vdd-tab-indicator-focused: #ffffff;
  --vdd-panel-float-radius: 0;
}

[data-vdd-skin="mono"][data-color-scheme="light"] {
  --vdd-bg-panel: #ffffff;
  --vdd-bg-tab-bar: #e4e4e4;
  --vdd-accent-color: #171717;
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
| `--vdd-text-tab-hover` | `#e2e8f0` | Label of a tab under the pointer. |

### Accent

| Token | Default | What it paints |
|---|---|---|
| `--vdd-accent-color` | `#38bdf8` | The one colour that carries selection and focus throughout. |
| `--vdd-accent-glow` | `rgba(56, 189, 248, 0.15)` | Translucent halo behind accented elements. |

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
| `--vdd-tab-icon-active` | `#38bdf8` | Icon of the selected rail button, and of an active toolbar button. |
| `--vdd-tab-btn-active-bg` | `#1e2024` | The selected rail button behind its icon. |
| `--vdd-tab-btn-active-shadow` | `none` | Shadow behind it. |
| `--vdd-sidebar-btn-hover-bg` | `rgba(255, 255, 255, 0.05)` | A rail button under the pointer. |
| `--vdd-sidebar-badge-bg` | `#2d3139` | Badge behind a count on a rail button. |
| `--vdd-sidebar-badge-text` | `#b0b5c0` | That badge text. |
| `--vdd-sidebar-card-bg` | `rgba(255, 255, 255, 0.03)` | Card surface offered to drawer content. |
| `--vdd-sidebar-card-border` | `rgba(255, 255, 255, 0.08)` | That card border. |
| `--vdd-sidebar-card-hover-bg` | `rgba(255, 255, 255, 0.04)` | That card on hover. |
| `--vdd-sidebar-card-hover-border` | `rgba(56, 189, 248, 0.25)` | Its border on hover. |
| `--vdd-sidebar-card-active-bg` | `rgba(56, 189, 248, 0.06)` | That card when selected. |
| `--vdd-sidebar-card-active-border` | `rgba(56, 189, 248, 0.3)` | Its border when selected. |
| `--vdd-sidebar-card-active-shadow` | `rgba(56, 189, 248, 0.08)` | Its glow when selected. |
| `--vdd-sidebar-btn-front-bg` | `transparent` | Primary-button style offered to drawer content. |
| `--vdd-sidebar-btn-front-border` | `#38bdf8` | Its border. |
| `--vdd-sidebar-btn-front-text` | `#38bdf8` | Its label. |
| `--vdd-sidebar-btn-front-hover-bg` | `rgba(56, 189, 248, 0.1)` | Its background on hover. |

### Workspace toolbar

| Token | Default | What it paints |
|---|---|---|
| `--vdd-toolbar-btn-hover-bg` | `rgba(255, 255, 255, 0.06)` | A workspace-toolbar button under the pointer. |
| `--vdd-toolbar-btn-radio-active-bg` | `rgba(56, 189, 248, 0.14)` | The selected radio button in a workspace toolbar. |
| `--vdd-toolbar-btn-toggle-active-bg` | `rgba(56, 189, 248, 0.08)` | An engaged toggle in a workspace toolbar. |
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
