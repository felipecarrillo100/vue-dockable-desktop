/**
 * M15 gate — skin branding (1.3.0), ported from react-dockable-desktop 7.2.0 (ADR 0017), the
 * way angular-dockable-desktop 1.1.0's M16 ported it.
 *
 *   1  the release files agree: the package version equals `version` in src/index.ts and has
 *      its own CHANGELOG entry; the 1.3.0 entry, which introduced branding, states a parity line
 *      naming react-dockable-desktop 7.2.0 and has every section. Nothing here pins the current
 *      version, so a later release does not have to edit this gate.
 *   2  the decision is recorded: ADR 0017 exists and is indexed
 *   3  the manual documents the feature, and agrees with the stylesheet: the theming chapter has
 *      "Brand your app" with the variables, and its skin-font table carries, for every built-in
 *      skin, exactly the `--vdd-skin-font-family` stack the stylesheet declares (M14 already
 *      checks the token reference against :root, both ways)
 *   4  the browser minimum (CSS color-mix(): Chrome / Edge 111, Safari 16.2, Firefox 113) is
 *      stated in the README and chapter 1
 *   5  PARITY.md maps the rdd 7.2.0 names and tests to vdd's
 *   6  the browser gate's 1.2.0 baseline is in the repository, covering all 14 scenes
 *
 * The stylesheet contract itself (read-only brand variables, one accent source, the font token
 * on :root only, the on-accent rules) is unit-tested in test/core/stylesheet.test.ts, which the
 * standing gate runs; the rendered result is the M15 browser gate.
 */
import { existsSync, readFileSync } from 'node:fs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const SKINS = ['vscode', 'macos', 'chrome', 'slate', 'nord', 'obsidian', 'tokyo']

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
const entry = entryOf('1.3.0')
must(entry !== '', 'CHANGELOG.md has no 1.3.0 entry')
must(/\*\*Parity:[^*]*react-dockable-desktop\s+7\.2\.0/.test(entry),
  'the 1.3.0 entry must state its parity line, naming react-dockable-desktop 7.2.0')
for (const section of ['### Added', '### Changed', '### Fixed', '### Tests', '### Documentation']) {
  must(entry.includes(section), `the 1.3.0 entry has no "${section}" section`)
}

// ── 2. The decision ─────────────────────────────────────────────────────────
must(existsSync('docs/decisions/0017-brand-variables.md'), 'docs/decisions/0017-brand-variables.md is missing')
must(read('docs/decisions/README.md').includes('(0017-brand-variables.md)'), 'the ADR index does not list 0017')

// ── 3. The manual, against the stylesheet ───────────────────────────────────
const theming = read('docs/manual/10-theming.md')
must(/^## Brand your app$/m.test(theming), 'the theming chapter has no "Brand your app" section')
for (const v of ['--vdd-brand-accent', '--vdd-brand-on-accent', '--vdd-font-family', '--vdd-skin-font-family']) {
  must(theming.includes(`\`${v}\``), `the theming chapter does not document ${v}`)
}
const sheet = read('src/index.css').replace(/\/\*[\s\S]*?\*\//g, '')
const root = sheet.match(/--vdd-font-family:\s*var\(--vdd-skin-font-family,\s*([^;]+)\);/)?.[1]?.trim()
must(!!root, 'the stylesheet does not declare --vdd-font-family as var(--vdd-skin-font-family, …)')
for (const skin of SKINS) {
  const declared = sheet.match(new RegExp(`\\[data-vdd-skin="${skin}"\\]\\s*\\{[^}]*?--vdd-skin-font-family:\\s*([^;]+);`))?.[1]?.trim() ?? root
  const row = theming.match(new RegExp(`^\\| \`${skin}\` \\|.*$`, 'm'))?.[0] ?? ''
  must(row.includes(`\`${declared}\``), `the skin-font table's ${skin} row does not show the stylesheet's stack \`${declared}\``)
}

// ── 4. The browser minimum ──────────────────────────────────────────────────
const minimum = /color-mix\(\)`?[^.]*Chrome \/ Edge 111,\s+Safari 16\.2,\s+Firefox 113/
for (const doc of ['README.md', 'docs/manual/01-getting-started.md']) {
  must(minimum.test(read(doc)), `${doc} does not state the browser minimum (color-mix(): Chrome / Edge 111, Safari 16.2, Firefox 113)`)
}

// ── 5. PARITY ───────────────────────────────────────────────────────────────
const parity = read('docs/PARITY.md')
for (const [rdd, vdd] of [
  ['--rdd-brand-accent', '--vdd-brand-accent'],
  ['--rdd-brand-on-accent', '--vdd-brand-on-accent'],
  ['--rdd-skin-font-family', '--vdd-skin-font-family'],
  ['branding.browser.ts', 'scripts/gates/browser/m15.mjs'],
]) {
  must(parity.includes(rdd) && parity.includes(vdd), `PARITY.md does not map ${rdd} to ${vdd}`)
}

// ── 6. The baseline ─────────────────────────────────────────────────────────
const fixturePath = 'scripts/gates/browser/fixtures/m15-branding-baseline.json'
const fixture = existsSync(fixturePath) ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null
must(!!fixture, `the M15 browser baseline (${fixturePath}) is missing`)
if (fixture) {
  for (const skin of SKINS) for (const cs of ['dark', 'light']) {
    must(Object.keys(fixture.scenes?.[`${skin}/${cs}`] ?? {}).length > 400, `the baseline has no full ${skin}/${cs} scene`)
  }
  must((fixture.tokens?.length ?? 0) > 100, 'the baseline carries no token list')
}

if (failures.length) {
  console.error('M15: FAIL')
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}
console.log('M15: ok — release files, ADR 0017, manual ↔ stylesheet, browser minimum, PARITY, baseline')
