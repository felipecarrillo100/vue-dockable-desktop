/**
 * M18 gate — pop-out windows (1.14.0), ported from react-dockable-desktop 7.12.1 (ADR 0022).
 *
 *   1  the release files: the package version equals `version` in src/index.ts and has its own
 *      CHANGELOG entry; the 1.14.0 entry states a parity line naming react-dockable-desktop 7.12.1
 *      and has every section. No current-version pin.
 *   2  the decision is recorded: ADR 0022 exists and is indexed
 *   3  the manual documents it: chapter 15 exists, is in the manual's index and covers what rdd's
 *      guide does (the gesture rule, popoutUrl and why, the wrapper, the Playwright traps, the
 *      limits, the messages, the differences from rdd); the API reference names every new public name
 *   4  PARITY.md traces rdd 7.12.x: the API map, the test map with what is not ported, and the
 *      divergences
 *   5  the pieces the M18 browser gate drives exist: the windows registry and its frame, every
 *      ported test file (traced in PARITY and floored in the counts), and the playground's pop-out
 *      page and panel
 *
 * The behaviour is unit-tested in the nine pop-out test files named below; the real windows are the
 * M18 browser gate.
 */
import { existsSync, readFileSync } from 'node:fs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '')

// ── 1. Release files ────────────────────────────────────────────────────────
const pkg = JSON.parse(read('package.json') || '{}')
const exported = read('src/index.ts').match(/export const version = '([^']+)'/)?.[1]
must(exported === pkg.version, `src/index.ts exports version ${exported}, the package is ${pkg.version}`)
const changelog = read('CHANGELOG.md')
const entryOf = v => {
  const start = changelog.indexOf(`## [${v}]`)
  return start < 0 ? '' : changelog.slice(start, changelog.indexOf('\n## [', start + 1))
}
must(entryOf(pkg.version) !== '', `CHANGELOG.md has no entry for the package version ${pkg.version}`)
const entry = entryOf('1.14.0')
must(entry !== '', 'CHANGELOG.md has no 1.14.0 entry')
must(/\*\*Parity:[^*]*react-dockable-desktop[^*]*7\.12\.1/.test(entry), 'the 1.14.0 entry must state its parity line, naming react-dockable-desktop 7.12.1')
for (const section of ['### Added', '### Changed', '### Tests', '### Documentation']) {
  must(entry.includes(section), `the 1.14.0 entry has no "${section}" section`)
}

// ── 2. The decision ─────────────────────────────────────────────────────────
must(existsSync('docs/decisions/0022-popout-windows.md'), 'docs/decisions/0022-popout-windows.md is missing')
must(read('docs/decisions/README.md').includes('(0022-popout-windows.md)'), 'the ADR index does not list 0022')

// ── 3. The manual ───────────────────────────────────────────────────────────
const chapter = read('docs/manual/15-popout-windows.md')
must(chapter !== '', 'docs/manual/15-popout-windows.md is missing')
must(read('docs/manual/README.md').includes('(15-popout-windows.md)'), 'the manual index does not list chapter 15')
const escape = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
for (const heading of [
  '## Turning it on', '## From code: `popOutPanel()` and `returnPanel()`', '## The page the window opens: `popoutUrl`',
  '### Where it comes back to', '### Saving the layout', '### CSS-in-JS needs `popoutWrapper`',
  '## Code in a pop-out window', '### What reloads', '## Widgets in their own window', '## Focus and activation',
  '## Toasts', '## Events', '## Testing pop-outs with Playwright', '## Things to know',
  '## Coming from react-dockable-desktop',
]) {
  must(new RegExp(`^${escape(heading)}$`, 'm').test(chapter), `chapter 15 has no "${heading}" section`)
}
// The rules a reader can't guess, each where rdd's guide states it.
must(chapter.includes("A click in any of the app's windows counts"), 'chapter 15 does not state the gesture rule for a click in a pop-out')
must(chapter.includes('error 153'), 'chapter 15 does not say why popoutUrl exists (YouTube error 153)')
must(chapter.includes('one cache per document'), 'chapter 15 does not say to keep one CSS-in-JS cache per document')
must(chapter.includes('defineProps<{ window: Window; document: Document }>()'), "chapter 15 does not spell out the wrapper's props")
must(chapter.includes('document.hasFocus = () => false'), 'chapter 15 does not show the hasFocus stub')
must(/about 5\s+seconds/.test(chapter), "chapter 15 does not warn about Playwright's 5 s user activation")
for (const limit of ['Leaflet', 'LuciadRIA', '`maximizePanel` and `floatPanel` are ignored', '`canPopOut` changing']) {
  must(chapter.includes(limit), `chapter 15 does not state the limit "${limit}"`)
}
const migrating = read('docs/manual/12-migrating.md')
for (const key of ['popOutWindow', 'returnToDesktop', 'backIntoPanel', 'popOutBlocked', 'inOwnWindow']) {
  must(chapter.includes(`\`${key}\``), `chapter 15 does not name the message key ${key}`)
  must(migrating.includes(`\`${key}\``), `the migration chapter does not name the message key ${key}`)
}
const reference = read('docs/manual/13-api-reference.md')
for (const name of [
  'popOutPanel', 'returnPanel', 'focusPanelWindow', 'usePanelWindow()', 'isPoppedOut', 'canPopOut', 'popOut',
  'popout-url', 'popout-wrapper', 'PopOutResult', 'PanelWindow', 'PopoutWrapperProps',
  'panel:popping-out', 'panel:popped-out', 'panel:returning', 'panel:returned',
]) {
  must(reference.includes(`\`${name}`), `the API reference does not name ${name}`)
}
must(reference.includes('(15-popout-windows.md'), 'the API reference does not link chapter 15')

// ── 4. PARITY ───────────────────────────────────────────────────────────────
const parity = read('docs/PARITY.md')
must(/^### Pop-out windows \(1\.14\.0, from rdd 7\.12\.0 and 7\.12\.1\)$/m.test(parity), 'PARITY.md §1 has no pop-out windows API map')
must(/^### rdd 7\.12\.0 and 7\.12\.1 pop-out windows, traced$/m.test(parity), 'PARITY.md does not trace rdd 7.12.x')
must(/^### Pop-out windows \(1\.14\.0\)$/m.test(parity), 'PARITY.md §4 has no pop-out windows divergences')
must(parity.includes('**rdd cases not ported, each with its reason:**'), 'PARITY.md does not list the rdd pop-out cases it did not port')

// ── 5. The pieces, and the new tests ────────────────────────────────────────
const TESTS = [
  'test/components/documentAware.test.ts', 'test/store/popOutStore.test.ts',
  'test/components/popOutWindows.test.ts', 'test/components/popOutStyles.test.ts',
  'test/components/popoutWrapper.test.ts', 'test/components/popOutChrome.test.ts',
  'test/components/popOutWidgets.test.ts', 'test/components/popOutFocus.test.ts',
  'test/components/popOutFromPopOut.test.ts',
]
for (const f of [
  'src/core/popOutWindows.ts', 'src/core/popOutStyles.ts', 'src/components/VddPopOutWindows.vue',
  'src/components/VddPopOutFrame.vue', ...TESTS,
  'playground/public/popout.html', 'playground/src/PopPanel.vue', 'scripts/gates/browser/m18.mjs',
]) must(existsSync(f), `${f} is missing`)
// Each new test file is traced in PARITY and floored in the counts.
const baseline = JSON.parse(read('test/baseline-counts.json') || '{}')
for (const f of TESTS) {
  const name = f.split('/').pop()
  must(parity.includes(name), `PARITY.md does not name ${name}`)
  must((baseline[name] ?? 0) > 0, `test/baseline-counts.json has no floor for ${name}`)
}
must(parity.includes('scripts/gates/browser/m18.mjs'), 'PARITY.md does not name the M18 browser gate')

if (failures.length) {
  console.error('M18: FAIL')
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}
console.log('M18: ok — release files, ADR 0022, manual chapter 15 and the API reference, PARITY, the pop-out pieces and tests')
