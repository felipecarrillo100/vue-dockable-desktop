/**
 * Standing gate — test counts are monotonic.
 *
 * Integrity rule 3 (docs/IMPLEMENTATION_PLAN.md): a ported test may not be quietly deleted
 * to make a gate pass. Each file has a recorded floor in test/baseline-counts.json; dropping
 * below it fails. Raising a floor is allowed and expected — that is progress — and is written
 * back automatically so the new level becomes the new floor.
 *
 * Also fails on any skipped/todo test not listed in docs/PROGRESS.md (integrity rule 4).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const RESULTS = 'artifacts/.vitest.json'
const BASELINE = 'test/baseline-counts.json'

if (!existsSync(RESULTS)) {
  console.error(`counts: ${RESULTS} missing — the gate runner must run vitest with --reporter=json first`)
  process.exit(1)
}

const report = JSON.parse(readFileSync(RESULTS, 'utf8'))
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}

const actual = {}
const skipped = []
for (const file of report.testResults ?? []) {
  const name = file.name.split('/').slice(-1)[0]
  actual[name] = (file.assertionResults ?? []).length
  for (const a of file.assertionResults ?? []) {
    if (a.status === 'pending' || a.status === 'todo' || a.status === 'skipped') {
      skipped.push(`${name} › ${a.fullName ?? a.title}`)
    }
  }
}

const failures = []
for (const [file, floor] of Object.entries(baseline)) {
  const now = actual[file]
  if (now === undefined) failures.push(`${file}: file disappeared (floor was ${floor})`)
  else if (now < floor) failures.push(`${file}: ${now} tests, floor is ${floor}`)
}

if (skipped.length) {
  const progress = existsSync('docs/PROGRESS.md') ? readFileSync('docs/PROGRESS.md', 'utf8') : ''
  for (const s of skipped) {
    const title = s.split('›').pop().trim()
    if (!progress.includes(title)) failures.push(`skipped test not listed in PROGRESS.md: ${s}`)
  }
}

const total = Object.values(actual).reduce((a, b) => a + b, 0)
if (failures.length) {
  console.error('counts: FAIL')
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}

// Ratchet the floors up to what we actually have now.
const next = { ...baseline }
let raised = 0
for (const [file, n] of Object.entries(actual)) {
  if ((next[file] ?? -1) < n) { next[file] = n; raised++ }
}
if (raised) writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n')
console.log(`counts: ok — ${total} tests across ${Object.keys(actual).length} files${raised ? `, ${raised} floor(s) raised` : ''}`)
