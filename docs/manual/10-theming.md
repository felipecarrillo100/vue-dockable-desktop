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

A skin is a preset, selected by prop:

```vue
<VddDesktop skin="vscode" />
```

Built in: `vscode` (default), `macos`, `chrome`, and others. The skin name is also mirrored
onto `document.documentElement` as `data-workspace-skin`, so teleported chrome and sibling
components pick up its variables too.

Define your own by scoping tokens to a skin name:

```css
[data-workspace-skin="mono"] {
  --vdd-accent-color: #ffffff;
  --vdd-tab-indicator-focused: #ffffff;
  --vdd-panel-float-radius: 0;
}
```

```vue
<VddDesktop skin="mono" />
```

## Light and dark

The workspace publishes its scheme as `data-color-scheme` on the root element, and panels
can read it reactively — useful for a map's tile layer or an embedded editor's theme:

```ts
import { useColorScheme } from 'vue-dockable-desktop'
const scheme = useColorScheme()            // Ref<'dark' | 'light'>
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
  windowClass: 'my-window', windowBodyClass: 'my-window-body',
  modalClass: 'my-modal',   modalBodyClass: 'my-modal-body',
  sidePanelClass: 'my-drawer', sidePanelBodyClass: 'my-drawer-body',
})
```
