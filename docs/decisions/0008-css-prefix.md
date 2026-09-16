# 0008 — `vdd-` classes and `--vdd-*` tokens

**Status:** Accepted

## Context

rdd prefixes every class and custom property it renders with `rdd-` / `--rdd-`, chosen
because it maps to the npm package name and cannot collide with a host framework's generic
names (Bootstrap defines a bare global `.active`). The rationale is recorded in rdd's
`CLAUDE.md`: the library is deliberately agnostic to the consumer's styling framework, and
its primary users are Material UI, React-Bootstrap, Tailwind and shadcn/ui shops.

The same reasoning applies to Vue shops (Vuetify, PrimeVue, Naive UI, Tailwind).

## Decision

`vdd-` for classes, `--vdd-*` for custom properties. The package is
`vue-dockable-desktop`, colloquially *vdd*, so the prefix is recognisable on sight in
devtools — the exact property that made `rdd-` the right choice.

The stylesheet is ported by mechanical rename and then **completed**, because rdd's own
migration is unfinished. In rdd 6.2.0 `src/index.css` still contains ~35 unprefixed custom
properties (`--sidebar-*`, `--tab-*`, `--toolbar-*`, declared inside the
`[data-color-scheme]` blocks and read from 74 `var()` sites) and bare classes
`.desktop-workspace`, `.hover-bg`, `.btn-pill-outline`, `.badge-pill-dark`, plus 30 `.sb-*`
demo-only rules shipped inside the published `styles.css`. In vdd:

- every token is `--vdd-*`, with no exceptions;
- no bare class appears in the stylesheet;
- demo styling lives in the demo, not in the library's stylesheet.

One global stylesheet, not scoped styles or CSS modules: the context menu, toasts, toolbar
flyouts and the overlay search dropdown all teleport to `document.body`, and `<VddSidebar>`
is documented to be an *ancestor* of `<VddDesktop>` — so component-scoped styles could not
reach them. Tokens stay on `:root` for the same reason (CSS variables only cascade
downward), which is the constraint rdd discovered and documented.

## Consequences

- No shared theme between rdd and vdd. A shop running both during a migration themes each
  once. Judged acceptable: identical class names across two libraries in one page would
  make them interfere, which is worse.
- The `styles.css` import requirement and its dev-mode sentinel carry over as
  `--vdd-styles-loaded`.
- A `StyleHookups`-equivalent test suite is mandatory, not optional. rdd shipped three
  dead CSS hookups in 6.0.0 — rules whose class the component never emitted, silent
  because jsdom never loads the stylesheet. Those tests assert emitted class names.
