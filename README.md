# vue-dockable-desktop

A window manager and dockable layout engine for **Vue 3**. Fluid grid splits, tabbed
groups, floating resizable windows, zero-unmount state preservation, side panels and
modals, toasts, context menus, per-panel overlays, and internationalisation.

**[Live demo](https://felipecarrillo100.github.io/vue-dockable-desktop/demo/)** &nbsp;|&nbsp;
**[Users manual](docs/manual/)** &nbsp;|&nbsp;
**[Design decisions](docs/decisions/)** &nbsp;|&nbsp;
**[Parity with the React version](docs/PARITY.md)**

Written as a native Vue library — plugins, composables, `v-model`, slots — not as a
transliteration of its React sibling. It reads and writes the **same serialised layout
format** as [`react-dockable-desktop`](https://github.com/felipecarrillo100/react-dockable-desktop),
so a layout saved by either library loads in the other.

> **Status: 0.1.0, pre-release.** The public API is gated (`api-surface.json`) and covered
> by 725 tests. It is not on npm yet — it will be published as
> [`vue-dockable-desktop`](https://www.npmjs.com/package/vue-dockable-desktop), the same
> name as this repository.

## Install

```bash
npm install vue-dockable-desktop
```

Requires Vue 3.4+. No other runtime dependencies.

The [npm package](https://www.npmjs.com/package/vue-dockable-desktop) is not published yet,
so that command will not resolve until the first release; until then, clone the repository
and run the [demo](#documentation) or `npm run build` to produce `dist/`.

## Quick start

```ts
// main.ts
import { createApp } from 'vue'
import { createWorkspace } from 'vue-dockable-desktop'
import 'vue-dockable-desktop/styles.css'          // required
import App from './App.vue'
import MapPanel from './panels/MapPanel.vue'
import EditorPanel from './panels/EditorPanel.vue'

const workspace = createWorkspace({
  panels: {
    map:    { component: MapPanel,    defaultOptions: { title: 'Map' } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor' } },
  },
})

createApp(App).use(workspace).mount('#app')
```

```vue
<!-- App.vue -->
<template>
  <div class="app">
    <VddDesktop />
    <VddModals />
    <VddSidePanels />
    <VddToasts />
  </div>
</template>

<style>
.app { height: 100vh; overflow: hidden; }
</style>
```

`createWorkspace()` returns a Vue plugin — the same shape as `createPinia()` or
`createRouter()` — so `app.use(workspace)` registers the components and makes
`useWorkspace()` available anywhere:

```ts
import { useWorkspace } from 'vue-dockable-desktop'

const ws = useWorkspace()
ws.openPanel('map', { title: 'Overview' })
localStorage.setItem('layout', ws.saveLayout())
```

## Features

- **Split-docking grid** — drag a panel to any zone to split it into rows or columns, or
  drop it onto a tab strip to group it
- **Floating windows** — 8-direction resize, maximise, minimise, and corner anchoring with
  automatic stacking
- **Zero-unmount persistence** — panel DOM is moved, never destroyed, across docking,
  floating and tab switching, so maps, WebGL contexts and editors keep their state
- **Sidebar and toolbar** — primary and secondary sidebars, a declarative toolbar, and
  per-panel contributions that follow the active panel
- **Panel overlay** — anchored toolbars and floating widgets inside a single panel
- **Overlays** — side panels, a modal stack, dirty-close confirmation, and toasts
- **Layout serialisation** — save and restore the whole workspace as a JSON string
- **Theming** — built-in skins, light/dark colour schemes, all `--vdd-*` CSS variables
- **i18n and RTL** — every string is a message key; `dir="rtl"` flips the whole workspace
- **TypeScript-first** — complete types, no separate `@types` package

## Documentation

| | |
|---|---|
| [Live demo](https://felipecarrillo100.github.io/vue-dockable-desktop/demo/) | Every capability in one application — published from `demo/` by GitHub Pages on each push to `main` |
| [`docs/manual/`](docs/manual/) | Users manual — 13 chapters, start with [Getting started](docs/manual/01-getting-started.md) |
| [`docs/decisions/`](docs/decisions/) | ADRs — why the Vue design diverges from the React one |
| [`docs/PARITY.md`](docs/PARITY.md) | Feature-by-feature parity with `react-dockable-desktop`, and the 16 deliberate divergences |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | The milestone plan and its gates |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | One row per gate run |
| [`CHANGELOG.md`](CHANGELOG.md) | What has changed, newest first |

## Repository layout

```
src/            the library — core/ (framework-free logic), components/, composables/
test/           Vitest suites; the executable specification
demo/           full sample application (maps, Monaco, Markdown, 16 panels)
playground/     minimal harness used by the browser gates
docs/           manual, ADRs, parity and plan
scripts/gates/  the verification gates
docs/evidence/  a written record per milestone gate (the gate's own output is not committed)
```

## Development

```bash
npm install

npm test                # Vitest
npm run typecheck       # vue-tsc
npm run lint            # ESLint
npm run build           # library build + .d.ts + styles.css

npm run demo            # the demo app
npm run playground      # the minimal harness

npm run gate -- M14     # the full standing gate for a milestone
npm run gate:selftest   # prove every gate rule is non-vacuous
npm run gate:sweep      # coverage + non-vacuity sweep
```

`npm run gate -- M<n>` runs types, lint, tests, build, test counts, the CSS-prefix and
API-surface checks, the docs/API cross-check, the demo build, the milestone's own rules,
and a real-Chrome browser gate. Gates are never edited to make a run pass.

## Continuous integration

Two workflows, both on Node 22 (vitest 5 will not run on Node 20):

- [`.github/workflows/gate.yml`](.github/workflows/gate.yml) runs `npm run gate -- M14` on
  every push and pull request, browser gate included — the runner image already ships
  Chrome — and keeps the gate's evidence as a build artifact.
- [`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds the demo and publishes
  it to GitHub Pages on each push to `main`: the landing page at the site root, the demo
  under `/demo/`. The demo's `base` is relative, so no deployment path is baked into the build.

## License

MIT
