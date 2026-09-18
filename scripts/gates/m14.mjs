/**
 * M14 gate — the demo.
 *
 * The walkthrough is in `scripts/gates/browser/m14.mjs`; this checks the things about the
 * demo that are true of its *source* rather than of a run.
 *
 * Chief among them: the demo must not leak into the library. rdd published its demo's `sb-*`
 * utility classes in the library's own stylesheet — a consumer downloaded styles for an
 * application they never saw. ADR 0008 closes that, and this is what keeps it closed.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { classNames } from './lib/css.mjs'
import { stripSourceComments } from './lib/css.mjs'
import { sourceFiles } from './lib/emitted.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }

const walk = (dir) => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

must(existsSync('demo/index.html'), 'the demo has no entry HTML')
must(existsSync('demo/vite.config.ts'), 'the demo has no vite config')
const files = existsSync('demo/src') ? walk('demo/src') : []
const sources = files.filter(f => /\.(ts|vue)$/.test(f))
must(sources.length > 0, 'the demo has no sources')

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

// ── 1. The demo is built, and buildable ────────────────────────────────────
must(pkg.scripts?.['demo:build'] === 'vite build --config demo/vite.config.ts',
  'npm run demo:build must build the demo')
must(pkg.scripts?.demo === 'vite demo', 'npm run demo must serve it')
// The build's own output is the gate runner's evidence, so it goes to artifacts.
must(/artifacts\/demo/.test(readFileSync('demo/vite.config.ts', 'utf8')),
  'the demo build must write to artifacts/demo, where the gate records it')

// ── 2. The demo does not leak into the library ─────────────────────────────
// Every class the demo renders is its own, prefixed `dd-`, and none of them appears in the
// library's published stylesheet. rdd shipped its demo's classes to every consumer.
const libraryClasses = classNames(readFileSync('src/index.css', 'utf8'))
for (const cls of libraryClasses) {
  must(!cls.startsWith('dd-'), `the library's stylesheet carries the demo class .${cls}`)
}
// ...and the demo's own stylesheet is not in the package.
must(!(pkg.files ?? []).some(entry => entry.includes('demo')),
  'the published package must not include the demo')

// The demo styles its own content and never redefines the library's classes, which would be
// a fork of the library's appearance hiding in an application.
const demoCss = existsSync('demo/src/demo.css') ? readFileSync('demo/src/demo.css', 'utf8') : ''
for (const cls of classNames(demoCss)) {
  const own = cls.startsWith('dd-')
  const leafletOrLibrary = cls.startsWith('leaflet-') || cls.startsWith('vdd-')
  must(own || leafletOrLibrary, `demo.css defines .${cls}, which is neither dd- nor a dependency's`)
}
// A `vdd-` selector in the demo is only allowed to reach *into* the library's chrome from a
// `dd-` ancestor — never to restyle it globally.
for (const line of demoCss.split('\n')) {
  const selector = line.match(/^\s*(\.[^{]*)\{/)?.[1]?.trim()
  if (!selector) continue
  for (const part of selector.split(',')) {
    const trimmed = part.trim()
    if (!/^\.vdd-/.test(trimmed)) continue
    failures.push(`demo.css restyles ${trimmed} globally — scope it under a dd- ancestor`)
  }
}

// ── 3. The demo uses the library as a consumer would ───────────────────────
// Imported by package name, not by a relative path into src: the alias is what makes the
// demo exercise the repository while still reading like an application.
const bad = sources.filter(f => /from '(\.\.\/)+src\//.test(readFileSync(f, 'utf8')))
must(bad.length === 0, `these demo files reach into src directly: ${bad.join(', ')}`)
const main = stripSourceComments(readFileSync('demo/src/main.ts', 'utf8'))
must(/from 'vue-dockable-desktop'/.test(main), 'the demo must import the library by name')
must(/import 'vue-dockable-desktop\/styles\.css'/.test(main),
  'the demo must import the stylesheet the way the manual tells a consumer to')

// ── 4. Every capability is represented ─────────────────────────────────────
// A capability with no panel demonstrating it is a capability nobody will find.
const all = sources.map(f => readFileSync(f, 'utf8')).join('\n')
const CAPABILITIES = {
  'zero-unmount state': /usePanel\(\)/,
  'dirty state': /setDirty\(/,
  'close guards': /onBeforeClose\(/,
  'saved panel state': /onSaveState\(/,
  'panel context menus': /usePanelContextMenu\(/,
  'contributions': /usePanelContribution\(/,
  'merged chrome': /useMergedToolbarItems|useMergedSidebarTabs/,
  'the event bus': /\.publish\(|\.subscribe\(/,
  'side panels': /openLeftPanel|openRightPanel|useSidePanels/,
  'modals': /useModals|openModal/,
  'toasts': /toast\./,
  'the panel overlay': /VddPanelOverlay/,
  'panel toolbars': /VddPanelToolbar/,
  'floating widgets': /VddFloatingWidget/,
  'stretch placement': /stretch: 'width'|stretch: 'height'|stretch: 'both'/,
  'the sidebar': /VddSidebar/,
  'a secondary sidebar': /VddSecondarySidebar/,
  'the workspace toolbar': /VddToolbar\b/,
  'skins': /:skin=/,
  'taskbar modes': /:taskbar=/,
  'i18n': /formatMessage/,
  'reading direction': /setDirection\(/,
  'the colour scheme': /useColorScheme\(/,
  'layout persistence': /saveLayout\(|loadLayout\(/,
  'drag primitives': /startPointerDrag\(/,
  // `@update:open` used to satisfy this too, which let the demo claim the capability while
  // rendering the widgets declaratively — so the managed path went undemonstrated and its
  // 1.0.0 defect undetected. The composable itself is the capability.
  'floating widgets from data': /useFloatingWidgets\(/,
}
for (const [capability, pattern] of Object.entries(CAPABILITIES)) {
  must(pattern.test(all), `no demo panel demonstrates ${capability}`)
}

// ── 4b. An object-valued model is never bound as a literal ─────────────────
// The 1.0.0 defect: `<VddPanelOverlay>` bound `placement` — a `defineModel` — as a fresh
// `{ anchor, stretch }` literal, and `useModel` re-syncs from the prop whenever its *identity*
// changes, so every render of the overlay threw away the user's gesture. These rules are
// structural because the symptom is not: the widget renders correctly and then reverts, which
// looks like a drag-handling bug anywhere but here.
const vueSources = [...walk('src'), ...walk('demo/src')].filter(f => /\.vue$/.test(f))
for (const file of vueSources) {
  const body = stripSourceComments(readFileSync(file, 'utf8'))
  must(!/:placement="\s*\{/.test(body),
    `${file} binds an object literal to :placement — hold it in a ref and bind v-model:placement, ` +
    `or the model resets on every render of this component`)
}

const overlayRoot = stripSourceComments(readFileSync('src/components/VddPanelOverlay.vue', 'utf8'))
must(/@update:placement/.test(overlayRoot),
  'VddPanelOverlay binds :placement for managed widgets, so it must also handle @update:placement — ' +
  'a bound model with no write-back discards every gesture')

// The other half of the fix: the writer must not touch the ref that re-renders the widget list,
// which is the render that used to destroy the gesture.
const overlayStore = readFileSync('src/core/overlayState.ts', 'utf8')
const setter = overlayStore.match(/setManagedPlacement:[\s\S]*?\n {4}\},/)?.[0] ?? ''
must(setter !== '', 'the overlay store must expose setManagedPlacement')
must(!/managedVersion/.test(setter),
  'setManagedPlacement must not bump managedVersion — that re-renders the widget list, which is ' +
  'what discarded the placement in 1.0.0')

// ── 4c. Every attribute the stylesheet keys on is one a component emits ────
// This is the rule that was missing. `<VddDesktop :skin>` shipped doing nothing for two
// releases because the stylesheet keyed 104 selectors on `data-workspace-skin` while the
// component emitted `data-vdd-skin` — a dead hookup of exactly the kind ADR 0008's prefix work
// was meant to end, invisible to the class/rule sweep because it is an *attribute*.
{
  const sheet = stripSourceComments(readFileSync('src/index.css', 'utf8'))
  const keyed = new Set(Array.from(sheet.matchAll(/\[(data-[a-z0-9-]+)/g), m => m[1]))
  const emitted = new Set()
  for (const file of sourceFiles()) {
    const body = readFileSync(file, 'utf8')
    for (const m of body.matchAll(/\b(data-[a-z0-9-]+)\b/g)) emitted.add(m[1])
  }
  for (const attribute of keyed) {
    must(emitted.has(attribute),
      `src/index.css keys on [${attribute}], which no component emits — the rules never match`)
  }
}

// ── 4d. The manual's token reference matches the stylesheet ────────────────
// A token nobody documents is a token nobody can theme with: the six skins' own knobs were
// reachable only by reading 3,900 lines of CSS. Checked in both directions so the table cannot
// drift — a new token needs a row, and a row cannot outlive its token.
{
  const sheet = stripSourceComments(readFileSync('src/index.css', 'utf8'))
  const rootBlock = sheet.match(/(?:^|\})\s*:root\s*\{([^{}]*)\}/m)?.[1] ?? ''
  const declared = Array.from(rootBlock.matchAll(/(--vdd-[\w-]+)\s*:/g), m => m[1])
  must(declared.length > 50, `only ${declared.length} tokens found on :root — the parse is wrong`)

  const chapter = readFileSync('docs/manual/10-theming.md', 'utf8')
  for (const token of new Set(declared)) {
    must(chapter.includes(token),
      `${token} is declared on :root but missing from the token reference in docs/manual/10-theming.md`)
  }
  const mentioned = new Set(Array.from(chapter.matchAll(/(--vdd-[\w-]+)/g), m => m[1]))
  for (const token of mentioned) {
    must(sheet.includes(token),
      `docs/manual/10-theming.md documents ${token}, which the stylesheet neither declares nor reads`)
  }
}

// ── 4e. No token's only home is a colour-scheme block ──────────────────────
// Dark is the base look, and an app signals it by *removing* `data-color-scheme` — so
// `[data-color-scheme="dark"]` matches nothing in the normal case. A token declared only there
// is therefore undefined exactly when it is needed, and the 15 of them read without a `var()`
// fallback took their whole declaration down with them: the sidebar, its drawer and the
// workspace toolbar rendered unstyled in dark mode for two releases. Base values belong on
// `:root`; a scheme block may only *override* them.
{
  const sheet = stripSourceComments(readFileSync('src/index.css', 'utf8'))
  const blockFor = (selector) => {
    const found = Array.from(sheet.matchAll(/([^{}]*)\{([^{}]*)\}/g))
      .find(m => m[1].replace(/\s+/g, ' ').trim() === selector)
    return found ? Array.from(found[2].matchAll(/(--vdd-[\w-]+)\s*:/g), m => m[1]) : []
  }
  const base = new Set(blockFor(':root'))
  for (const scheme of ['[data-color-scheme="dark"]', '[data-color-scheme="light"]']) {
    for (const token of blockFor(scheme)) {
      must(base.has(token),
        `${token} is declared in ${scheme} but not on :root — it is undefined in the other scheme`)
    }
  }
}

// ── 5. The dependencies are the ones ADR 0013 decided on ───────────────────
const deps = { ...pkg.dependencies, ...pkg.devDependencies }
for (const kept of ['monaco-editor', 'leaflet', 'unified', 'remark-gfm', 'remark-math', 'rehype-katex', 'rehype-highlight', 'rehype-raw', 'rehype-slug']) {
  must(kept in deps, `ADR 0013 keeps ${kept}, and it is not installed`)
}
for (const swapped of ['react', 'react-dom', 'react-bootstrap', 'react-bootstrap-submenu', 'react-intl', 'react-markdown', '@monaco-editor/react']) {
  must(!(swapped in deps), `${swapped} is a React dependency and must not be here`)
}
// The library itself depends on nothing but Vue: a demo dependency must never become one.
must(Object.keys(pkg.dependencies ?? {}).length === 0,
  `the library must have no runtime dependencies; found ${Object.keys(pkg.dependencies ?? {}).join(', ')}`)
must((pkg.peerDependencies ?? {}).vue !== undefined, 'vue must be a peer dependency')

// ── 6. The demo is a harness for the manual, not just a showcase ───────────
// ADR 0013 asks that the manual's examples be code that runs. The demo is where it runs.
must(/vue-dockable-desktop/.test(readFileSync('docs/manual/01-getting-started.md', 'utf8')),
  'the getting-started chapter must name the package the demo imports')

if (failures.length) {
  console.error('M14: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log(`M14: ok — ${sources.length} demo sources, ${Object.keys(CAPABILITIES).length} capabilities ` +
  `represented, no demo classes in the library, zero runtime dependencies`)
