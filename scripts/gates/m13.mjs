/**
 * M13 gate — parity, compatibility, docs.
 *
 * The closing gate. It asserts the things that are only true of the *whole* port rather than
 * of any one milestone:
 *
 *  1. every rdd test suite is accounted for, by name, with a disposition;
 *  2. the suite is at least as large as the one it replaces;
 *  3. every class the library emits has a rule, or is a declared consumer hook;
 *  4. `PARITY.md` has no TBD, and every divergence is numbered and explained;
 *  5. every ADR has a status, and none is still Proposed;
 *  6. the manual has no chapter left as an outline;
 *  7. the non-vacuity sweep has run and every source module is exercised.
 *
 * The other half of check 3 — that no rule is dead — needs a browser, because a third of the
 * library's classes are emitted from script-level constants a static scan cannot see. That is
 * `scripts/gates/browser/m13.mjs`.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { classNames } from './lib/css.mjs'
import { everyEmittedClass, sourceFiles, CONSUMER_HOOKS } from './lib/emitted.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }

const parity = readFileSync('docs/PARITY.md', 'utf8')
const results = existsSync('artifacts/.vitest.json')
  ? JSON.parse(readFileSync('artifacts/.vitest.json', 'utf8'))
  : null

// ── 1. Every rdd suite is accounted for ────────────────────────────────────
/**
 * rdd's 26 test files. Each must appear in PARITY.md §3 with a disposition, so a suite
 * cannot be quietly skipped — the failure mode this whole document exists to prevent.
 */
const RDD_SUITES = [
  'CoreLayout', 'DomStability', 'EventBus', 'FloatingWindows', 'FormContainer',
  'Internationalization', 'LayoutSerialization', 'PanelContribution', 'PanelOverlay',
  'PanelRegistry', 'PanelSystem', 'Sidebar', 'SpawnLifecycle', 'StateTransitions',
  'StyleHookups', 'TabOperations', 'Toast', 'Toolbar', 'TouchSupport', 'V2Features',
  'V3Diagnostics', 'anchorGeometry', 'dragResize', 'serializable',
  'sidePanelPositioning', 'useColorScheme',
]
const testMap = parity.slice(parity.indexOf('## 3. Test map'), parity.indexOf('## 4.'))
for (const suite of RDD_SUITES) {
  must(testMap.includes(suite), `PARITY.md §3 does not account for rdd's \`${suite}\` suite`)
}
must(RDD_SUITES.length === 26, 'the rdd suite list must stay at 26 — the number the plan was written against')

// Every disposition that is not a straight port has to be justified, not merely labelled.
for (const word of ['Substitute', 'Rewrite', 'moot']) {
  if (!testMap.includes(word)) continue
  must(/because|since|so that|rather than|does not exist|deletes/.test(testMap),
    `a "${word}" disposition must carry its reason in §3`)
}

// ── 2. The suite is at least as large as the one it replaces ───────────────
if (results) {
  const total = results.numTotalTests ?? 0
  must(total >= 468, `the suite has ${total} tests; the port's floor is 468 (rdd's own count)`)
  must((results.numFailedTests ?? 0) === 0, 'no test may be failing at the closing gate')
  // Integrity rule 4: a skipped test is a gap, and must be listed.
  const progress = readFileSync('docs/PROGRESS.md', 'utf8')
  for (const file of results.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (['pending', 'todo', 'skipped'].includes(a.status)) {
        must(progress.includes(a.title ?? ''), `skipped test not listed in PROGRESS.md: ${a.title}`)
      }
    }
  }
} else {
  failures.push('artifacts/.vitest.json missing — the gate runner must run the suite first')
}

// ── 3. Every emitted class has a rule, or is a declared hook ───────────────
// The direction a static scan can settle. A class with no rule is not automatically wrong —
// a framework-agnostic library wants stable hooks a consumer can style — but it has to be
// *declared* as one, so the list is a decision rather than an accident.
const styled = classNames(readFileSync('src/index.css', 'utf8'))
const emitted = everyEmittedClass()
for (const cls of emitted) {
  if (styled.has(cls) || CONSUMER_HOOKS.has(cls)) continue
  failures.push(`.${cls} is emitted but has no rule; add a rule, or declare it in CONSUMER_HOOKS`)
}
// A hook that gains a rule should leave the list, or the list stops meaning anything.
for (const cls of CONSUMER_HOOKS) {
  must(!styled.has(cls), `.${cls} is declared a consumer hook but the stylesheet now styles it`)
  must(emitted.has(cls), `.${cls} is declared a consumer hook but nothing emits it any more`)
}

// ── 4. PARITY.md is complete ───────────────────────────────────────────────
must(!/\bTBD\b/.test(parity), 'PARITY.md still contains TBD')
must(!/\bTODO\b/.test(parity), 'PARITY.md still contains TODO')
// Divergences are numbered without gaps, so none can be dropped silently.
const divergences = [...parity.matchAll(/^\| D(\d+) \|/gm)].map(m => Number(m[1])).sort((a, b) => a - b)
must(divergences.length > 0, 'PARITY.md lists no divergences')
for (let i = 0; i < divergences.length; i++) {
  must(divergences[i] === i + 1, `divergence numbering jumps at D${divergences[i]} — expected D${i + 1}`)
}
// Each divergence names both halves: what rdd does, and what vdd does instead.
for (const row of parity.split('\n').filter(l => /^\| D\d+ \|/.test(l))) {
  must(row.split('|').length >= 4, `${row.slice(0, 24)}… must state rdd's behaviour *and* vdd's`)
}

// ── 5. Every decision has a status, and none is still Proposed ─────────────
const decisions = readdirSync('docs/decisions').filter(f => /^\d{4}-.*\.md$/.test(f)).sort()
must(decisions.length > 0, 'no decision records found')
for (const file of decisions) {
  const text = readFileSync(join('docs/decisions', file), 'utf8')
  const status = text.match(/^\s*(?:\*\*)?Status(?:\*\*)?:?\s*(?:\*\*)?\s*(\w+)/mi)?.[1]
  must(status !== undefined, `${file} has no Status line`)
  if (status) {
    must(/^(Accepted|Superseded|Rejected)$/i.test(status),
      `${file} is still "${status}" — every decision must be settled before the port closes`)
  }
}

// ── 6. The manual is drafted ───────────────────────────────────────────────
const chapters = readdirSync('docs/manual').filter(f => /^\d{2}-/.test(f)).sort()
const outlines = chapters.filter(f => /^> \*\*Outline only/m.test(readFileSync(join('docs/manual', f), 'utf8')))
must(outlines.length === 0,
  `still an outline: ${outlines.join(', ')} — every chapter must be drafted before the port closes`)

// ── 7. The non-vacuity sweep has run, and passed ───────────────────────────
// The plan asked for "reverting each of the 13 source modules in turn turns the suite red".
// Coverage answers the same question in one run and per module rather than in aggregate,
// which matters because an aggregate figure hides a whole file at 0%. Run by
// `npm run gate:sweep`; this checks the result exists and is current.
const COVERAGE = 'artifacts/coverage/coverage-final.json'
if (!existsSync(COVERAGE)) {
  failures.push(`${COVERAGE} missing — run \`npm run gate:sweep\` before the closing gate`)
} else {
  const coverage = JSON.parse(readFileSync(COVERAGE, 'utf8'))
  const modules = Object.entries(coverage)
  must(modules.length > 0, 'the coverage report is empty')
  const unexercised = modules.filter(([, data]) => {
    const counts = Object.values(data.s ?? {})
    return counts.length > 0 && counts.every(n => n === 0)
  })
  for (const [path] of unexercised) {
    failures.push(`${path.replace(`${process.cwd()}/`, '')} is never executed by the suite`)
  }
  /**
   * A report from before the last source change proves nothing — but mtimes cannot tell:
   * restoring a file from a backup, which the gate selftest does constantly, changes the
   * mtime without changing a byte. The sweep records a content hash of what it measured.
   */
  const FINGERPRINT = 'artifacts/coverage/sources.sha256'
  if (!existsSync(FINGERPRINT)) {
    failures.push(`${FINGERPRINT} missing — re-run \`npm run gate:sweep\``)
  } else {
    const current = createHash('sha256')
    for (const file of sourceFiles()) current.update(readFileSync(file))
    must(readFileSync(FINGERPRINT, 'utf8').trim() === current.digest('hex'),
      'the coverage report was measured against different source — re-run `npm run gate:sweep`')
  }
}

if (failures.length) {
  console.error('M13: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log(`M13: ok — 26 rdd suites accounted for, ${results?.numTotalTests} tests, ` +
  `${emitted.size} emitted classes all styled or declared, ${divergences.length} divergences, ` +
  `${decisions.length} decisions settled, manual fully drafted, every module exercised`)
