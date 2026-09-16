# vue-dockable-desktop — documentation

`vue-dockable-desktop` (**vdd**) is a window manager and dockable layout engine for Vue 3:
fluid grid splits, tabbed groups, floating resizable windows, zero-unmount state
preservation, context menus, and internationalisation.

It is a **Vue-native rewrite** of [`react-dockable-desktop`](https://www.npmjs.com/package/react-dockable-desktop)
(**rdd**) — same feature set and same vocabulary, designed the way a Vue team would
design it rather than transliterated from React. See
[decisions/0001](decisions/0001-vue-native-rewrite.md) for what that means concretely.

> **Status: design phase.** Nothing here is implemented yet. These documents exist to be
> argued with *before* code is written. Every code sample describes the API as designed,
> not as shipped.

## How to read these docs

| Document | For | Contents |
|---|---|---|
| [decisions/](decisions/) | contributors | Architecture Decision Records — one file per decision, with the reasoning and the consequences |
| [ROADMAP.md](ROADMAP.md) | contributors | Phases P0–P7, each with an exit criterion |
| [PARITY.md](PARITY.md) | contributors, migrating users | rdd → vdd API map, test map, and the list of deliberate divergences |
| [manual/](manual/) | library users | The user manual |

## Non-negotiables

Three constraints shape everything else:

1. **Zero unmount.** A panel's DOM is created once and never destroyed while the panel is
   open. Docking, floating, tabbing, minimising and restoring re-parent it, so a WebGL map, a
   Monaco model and a playing video survive every layout change
   ([0002](decisions/0002-zero-unmount-via-teleport.md)). Scroll offsets and focus, which the
   browser resets on detach, are saved and restored explicitly
   ([0014](decisions/0014-preserve-scroll-and-focus.md)).
2. **Layout JSON is compatible with rdd.** A workspace saved by the React library loads in
   the Vue one and vice versa. A team migrating React → Vue does not throw away their
   users' saved layouts. ([0009](decisions/0009-layout-json-compatibility.md))
3. **It must feel like Vue.** Reactive state, `v-model`, slots, composables, automatic
   cleanup. If an API exists only because React needed it, it does not survive the port.
   ([0001](decisions/0001-vue-native-rewrite.md))
