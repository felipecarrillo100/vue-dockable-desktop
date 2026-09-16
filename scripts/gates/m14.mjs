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
  'floating widgets from data': /useFloatingWidgets|@update:open/,
}
for (const [capability, pattern] of Object.entries(CAPABILITIES)) {
  must(pattern.test(all), `no demo panel demonstrates ${capability}`)
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
