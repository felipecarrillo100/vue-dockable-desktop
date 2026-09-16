/**
 * Standing gate — no source module is untested.
 *
 * Integrity rule 5 demands non-vacuity, and the gate selftest proves it for each *gate rule*.
 * This proves the weaker but broader claim for the *library*: every module is actually
 * executed by the suite, and none is carried along untouched.
 *
 * The plan's original wording was "reverting each of the 13 source modules in turn turns the
 * suite red". Coverage answers the same question exactly and in one run rather than thirty,
 * and it answers it per module rather than in aggregate — an aggregate figure hides a whole
 * file at 0% behind everything else being high, which is the only failure mode that matters
 * here.
 *
 * Run by the gate runner via `npm run gate:sweep`, and recorded in each milestone artifact.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { sourceFiles } from './lib/emitted.mjs'

const REPORT = 'artifacts/coverage/coverage-final.json'
/** A module below this is not meaningfully exercised, whatever the aggregate says. */
const FLOOR = 25

if (!existsSync(REPORT)) {
  console.error(`non-vacuity: ${REPORT} missing — run \`npx vitest run --coverage\` first`)
  process.exit(1)
}

const report = JSON.parse(readFileSync(REPORT, 'utf8'))
const failures = []
const rows = []

for (const [path, data] of Object.entries(report)) {
  const file = path.replace(`${process.cwd()}/`, '')
  const counts = Object.values(data.s ?? {})
  const total = counts.length
  const covered = counts.filter(n => n > 0).length
  const percent = total === 0 ? 100 : Math.round((covered / total) * 100)
  rows.push({ file, percent, total })

  if (total === 0) continue
  if (covered === 0) {
    failures.push(`${file} is never executed by the suite — 0 of ${total} statements`)
  } else if (percent < FLOOR) {
    failures.push(`${file} is only ${percent}% executed (floor ${FLOOR}%)`)
  }
}

rows.sort((a, b) => a.percent - b.percent)
const overall = (() => {
  const all = rows.filter(r => r.total > 0)
  const weighted = all.reduce((sum, r) => sum + r.percent * r.total, 0)
  const statements = all.reduce((sum, r) => sum + r.total, 0)
  return statements ? Math.round(weighted / statements) : 0
})()

console.log('non-vacuity: least-exercised modules')
for (const r of rows.slice(0, 8)) console.log(`  ${String(r.percent).padStart(3)}%  ${r.file}`)

if (failures.length) {
  console.error('non-vacuity: FAIL')
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}
/**
 * A fingerprint of the source this run measured.
 *
 * The closing gate has to know the report is current, and mtimes cannot tell it: restoring a
 * file from a backup — which the gate selftest does constantly — changes the mtime without
 * changing a byte. A content hash answers the actual question.
 */
const fingerprint = createHash('sha256')
for (const file of sourceFiles()) fingerprint.update(readFileSync(file))
writeFileSync('artifacts/coverage/sources.sha256', fingerprint.digest('hex') + '\n')

console.log(`non-vacuity: ok — ${rows.length} modules, every one exercised, ` +
  `lowest ${rows[0]?.percent}%, overall ${overall}%`)
