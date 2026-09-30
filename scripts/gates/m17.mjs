/**
 * M17 gate — the field-report fixes (1.5.0), ported from react-dockable-desktop 7.4.0 (ADR 0019).
 *
 *   1  the release files: the package version equals `version` in src/index.ts and has its own
 *      CHANGELOG entry; the 1.5.0 entry states a parity line naming react-dockable-desktop 7.4.0's
 *      fixes and has every section. No current-version pin.
 *   2  the decision is recorded: ADR 0019 exists and is indexed
 *   3  the manual documents each fix: frost in the theming chapter, reduced motion, title
 *      functions and the sidebar/toast direction in the i18n chapter, the reactivity notes in
 *      the panels chapter — and no longer says `setDirection` misses the sidebar
 *   4  PARITY.md traces the rdd 7.4.0 fixes
 *
 * The stylesheet contract is unit-tested in test/core/stylesheet.test.ts, the title functions and
 * finite geometry in test/components/fieldReport.test.ts; the rendered result is the M17 browser gate.
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
const entry = entryOf('1.5.0')
must(entry !== '', 'CHANGELOG.md has no 1.5.0 entry')
must(/\*\*Parity:[^*]*react-dockable-desktop[^*]*7\.4\.0/.test(entry), 'the 1.5.0 entry must state its parity line, naming react-dockable-desktop 7.4.0')
for (const section of ['### Added', '### Fixed', '### Tests', '### Documentation']) {
  must(entry.includes(section), `the 1.5.0 entry has no "${section}" section`)
}

// ── 2. The decision ─────────────────────────────────────────────────────────
must(existsSync('docs/decisions/0019-frost-on-a-pseudo-element.md'), 'docs/decisions/0019-frost-on-a-pseudo-element.md is missing')
must(read('docs/decisions/README.md').includes('(0019-frost-on-a-pseudo-element.md)'), 'the ADR index does not list 0019')

// ── 3. The manual ───────────────────────────────────────────────────────────
const theming = read('docs/manual/10-theming.md')
const i18n = read('docs/manual/11-i18n.md')
const panels = read('docs/manual/03-panels.md')
must(/^## Frosted glass and your own overlays$/m.test(theming), 'the theming chapter has no "Frosted glass and your own overlays" section')
must(theming.includes('prefers-reduced-motion'), 'the theming chapter does not mention prefers-reduced-motion')
must(/^### A function, for your own translation function$/m.test(i18n), 'the i18n chapter does not document title functions')
must(i18n.includes('string | MessageDescriptor | (() => string)'), 'the i18n chapter states the old Label type')
must(!/the workspace's `dir` does not reach them\. They follow the direction of the page/.test(i18n), 'the i18n chapter still says setDirection does not reach the sidebar')
must(/^### Objects that cross into Vue's reactivity$/m.test(panels), "the panels chapter has no \"Objects that cross into Vue's reactivity\" section")
for (const api of ['markRaw', 'shallowRef']) must(panels.includes(`\`${api}`), `the panels chapter does not name ${api}`)

// ── 4. PARITY ───────────────────────────────────────────────────────────────
const parity = read('docs/PARITY.md')
must(/^### rdd 7\.4\.0 field-report fixes, traced$/m.test(parity), 'PARITY.md does not trace the rdd 7.4.0 fixes')
for (const name of ['frost.browser.ts', 'scripts/gates/browser/m17.mjs', 'fieldReport.test.ts']) must(parity.includes(name), `PARITY.md does not name ${name}`)

if (failures.length) {
  console.error('M17: FAIL')
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}
console.log('M17: ok — release files, ADR 0019, manual, PARITY')
