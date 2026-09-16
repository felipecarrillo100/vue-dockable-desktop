# 0013 — Demo: same capabilities, lighter dependencies

**Status:** Accepted

## Context

rdd's `/demo` is 4,213 lines across four main files (`mockupPanels.tsx` 1,846,
`App.tsx` 1,203, `MarkdownEditorPanel.tsx` 745, `PanelManagerForm.tsx` 148) and pulls in
Monaco, Leaflet, a full remark/rehype markdown pipeline, React-Bootstrap (+ a submenu
add-on) and react-intl. Its purpose is to demonstrate every capability of the library.

## Decision

Port every capability; swap only the dependencies that are React-specific.

**Kept — these are framework-agnostic and mount into a plain element:**

- **Monaco** (`monaco-editor` directly; `@monaco-editor/react` is a thin wrapper we replace
  with a ~30-line composable)
- **Leaflet** (already imperative: hand it a div)
- **The markdown pipeline unchanged** — `remark-gfm`, `remark-math`, `rehype-katex`,
  `rehype-highlight`, `rehype-raw`, `rehype-slug` are `unified` plugins, not React
  components. Same plugin set, rendered to HTML.

**Swapped:**

| rdd demo | vdd demo | Why |
|---|---|---|
| `react-bootstrap`, `react-bootstrap-submenu` | Bootstrap CSS + our own markup | Avoids a Vue UI-kit dependency for what is mostly buttons, and the demo already has its own `sb-*` utility classes |
| `react-intl` | a plain formatter function | The library needs only `(descriptor) => string`; the 182-line message table ports as data. `vue-i18n` remains documented as a drop-in for real apps |
| `react-markdown` | `unified` pipeline → HTML | See above |

The demo's own styles keep their own prefix and stay in the demo — they do **not** go into
the library's stylesheet ([0008](0008-css-prefix.md) closes that rdd leak).

## Consequences

- The two demos will not be pixel-identical. Acceptable: the demo's job is to exercise the
  library, and every capability is still reachable.
- `MarkdownEditorPanel` (745 lines) is the single largest porting task in the demo and the
  most likely to need its own milestone.
- The demo doubles as the manual's example source — every snippet in
  [manual/](../manual/) should be lifted from code that actually runs there, so the
  documentation cannot drift from reality.
