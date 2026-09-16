# M4 — Persistence port + grid · **PASS**

`npm run gate -- M4` · raw: [gate.json](gate.json) · browser: [browser.json](browser.json) ·
screenshot: [desktop.png](desktop.png)

```
  ok  types · lint · tests · build · counts · css-prefix · api-surface · M4 · M4 browser
  tests: 269/269 across 16 files
M4 GATE: PASS
```

**The first milestone you can use.** A Vue app can now register panels, open them, split the
grid, drag a divider, switch tabs, minimise and restore — and a panel keeps everything.

## The browser gate is the real result

```
  start                      mounts=1 ticks=17 video=0.85 scroll=240 focus=a gl=alive
  switch away (tab)          mounts=1 ticks=23 video=1.12 scroll=0   focus=-  gl=alive
  switch back (tab)          mounts=1 ticks=28 video=1.39 scroll=240 focus=a gl=alive
  dock into the other leaf   mounts=1 ticks=33 video=1.65 scroll=240 focus=a gl=alive
  split that leaf            mounts=1 ticks=39 video=1.93 scroll=240 focus=a gl=alive
  re-dock into a shared leaf mounts=1 ticks=44 video=2.19 scroll=240 focus=a gl=alive
  minimise                   mounts=1 ticks=49 video=2.46 scroll=0   focus=-  gl=alive
  restore                    mounts=1 ticks=55 video=2.73 scroll=240 focus=a gl=alive
M4 BROWSER: PASS
```

One mount throughout. Ticks only ever rise. Video advances 0.85 → 2.73 and never restarts.
Scroll returns to exactly 240 and focus to the same input at every visible step. The two
`scroll=0` rows are correct: a background tab and a minimised panel are parked in the
off-screen store, where there is no layout to scroll — and the preserved record is what puts
it back, which is the whole of ADR 0014.

Also gated here: dragging a split divider 160px actually resizes the leaf by 160px (±24px),
without re-creating the panel or losing its scroll.

## Architecture

| | |
|---|---|
| `core/panelDom.ts` | one element per panel, for its lifetime; the off-screen store; scroll/focus preservation |
| `components/VddDesktop.vue` | the workspace, and the persistence port |
| `components/VddPanelMount.vue` | one panel, teleported into its own element, mounted once |
| `components/VddPanelSlot.vue` | a place a panel is shown; moves it in from a function ref |
| `components/VddWorkspaceGrid.vue` | recursive branches, leaves and dividers |
| `components/VddLeafGroup.vue` | tab bar and body |

The port renders **every** open panel, unconditionally, for as long as it is open. The M4
gate asserts that in the source — an unconditional `v-for`, no `v-if` on the `<Teleport>`,
and the ownership check in the slot — because these are easy to "tidy up" into a subtle
disaster and expensive to notice.

## A design improvement the tests forced

The slot originally reported its host element upwards through two components, and a watcher
in `VddDesktop` did the move. That worked but landed a tick late, so a panel was briefly
parked off-screen while its slot already existed. It now moves the element from a **function
ref**, which Vue calls during the patch with the element itself — placement is synchronous,
and two layers of event forwarding disappeared.

Worth being straight about: I refactored this twice while chasing a test that was simply
wrong (it asserted that a *background* tab's panel sits in a slot — it does not, and should
not). The refactor was an improvement, but it was not the fix.

## Two real bugs the browser found

| | |
|---|---|
| **Structural CSS was missing** | rdd carried `display:flex`, `flexDirection:column` and `height:100%` as **inline JSX styles** on its workspace, grid and panel elements. I ported the stylesheet but not those, so the percentage-height chain broke at `.vdd-workspace`: every descendant collapsed, a leaf was 132px tall, and a split divider in a row was **0px tall** — impossible to grab. Ported as real CSS and gated property by property |
| **`dockPanel` trusted a stale `lastLeafId`** | Emptying a leaf deletes it, so a remembered leaf id can name a leaf that no longer exists. Docking into a missing leaf silently put the panel *nowhere*: still in `panels`, so "open", but no slot would ever show it. Now validated with `leafExists`, falling back as `restorePanel` does. My own bug — rdd's `dockPanel` never consulted `lastLeafId` at all |

Neither is visible in jsdom, which has no layout: `.vdd-workspace` collapsing to 132px and a
0px divider both measure as 0 either way there.

## Gate infrastructure

- **The runner now starts the playground itself** for any milestone with a browser gate,
  polls until it answers, and stops it afterwards — so `npm run gate -- M4` is still one
  command.
- **`playground/`** is the app browser gates drive. It is not the demo (M14); it exists so a
  gate can exercise real layout, real pointer events and a real WebGL context. It drives the
  library through its public API, which the gate asserts.
- **A shared CSS reader** (`scripts/gates/lib/css.mjs`) replaced regexes over a 3,700-line
  stylesheet. It walks braces, flattens `@media` blocks, and answers "does this selector
  declare this property anywhere" — which the regexes got wrong in both directions. M13's
  class-versus-rule cross-check will reuse it.
- **`css-prefix` was over-reporting.** It tokenised Vue's dynamic `:class` *expressions* as
  class names. Now static attributes are checked strictly, dynamic bindings by their string
  literals, and `classList` calls too — stricter than before, and correct. Two new self-test
  cases cover both forms.
- **ESLint had no browser globals**, so `document` and `window` read as undefined. Added,
  with `no-undef` off for TypeScript only — TS resolves identifiers properly and `no-undef`
  reports false positives on type-only declarations.

## Fixes during the milestone

- Three test failures from missing cleanup: the tests query `document` directly, because
  panel DOM lives outside the component tree by design, so they must clean up or a later
  `querySelector` finds an earlier test's leftovers.
- The browser gate raced Vite's HMR and lost its execution context; it now waits for the
  app's own handle instead of assuming the page is ready.
- Two bugs in my own M4 gate: the `v-if` check caught the *inner* fallback rather than the
  Teleport, and the selector lookup only matched the first of several rules sharing a
  selector.
