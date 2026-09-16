/**
 * Standing gate — the public API surface is exactly what is documented.
 *
 * Measures the **built output**, not the source: that is what a consumer actually imports,
 * and it covers both halves of the surface a TypeScript library has —
 *   - runtime exports, read from dist/index.js
 *   - type exports, read from dist/index.d.ts
 * A type-only export is invisible at runtime, so without the second half half the API could
 * change unnoticed.
 *
 * Refuses to run against a stale build. An earlier version of this gate fell back to an old
 * dist when it could not import the TypeScript source and cheerfully reported a surface
 * nobody ships.
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const EXPECTED = 'api-surface.json'
const ESM = 'dist/index.js'
const DTS = 'dist/index.d.ts'

for (const f of [ESM, DTS]) {
  if (!existsSync(f)) {
    console.error(`api-surface: ${f} missing — run the build first`)
    process.exit(1)
  }
}

// Staleness: the build must be newer than every source file it is built from.
const walk = (dir) => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const newestSrc = Math.max(...walk('src').map(f => statSync(f).mtimeMs))
const builtAt = Math.min(statSync(ESM).mtimeMs, statSync(DTS).mtimeMs)
if (newestSrc > builtAt) {
  console.error('api-surface: dist is older than src — the build did not run, so this would')
  console.error('            measure a surface nobody ships. Run the build first.')
  process.exit(1)
}

const runtime = Object.keys(await import(`../../${ESM}`)).sort()

// Exported type names from the declaration bundle. Covers both
// `export { type A }` / `export type { A, B }` lists and `export type X = …` declarations.
const dts = readFileSync(DTS, 'utf8')
const types = new Set()
for (const m of dts.matchAll(/export\s+type\s*\{([^}]*)\}/g)) {
  for (const part of m[1].split(',')) {
    const name = part.trim().split(/\s+as\s+/).pop()?.trim()
    if (name) types.add(name)
  }
}
for (const m of dts.matchAll(/export\s+(?:declare\s+)?(?:type|interface)\s+([A-Za-z_]\w*)/g)) types.add(m[1])
for (const m of dts.matchAll(/export\s*\{([^}]*)\}/g)) {
  for (const part of m[1].split(',')) {
    const t = part.trim()
    if (t.startsWith('type ')) {
      const name = t.slice(5).split(/\s+as\s+/).pop()?.trim()
      if (name) types.add(name)
    }
  }
}
const typeList = Array.from(types).sort()

const actual = { exports: runtime, types: typeList }

if (!existsSync(EXPECTED)) {
  writeFileSync(EXPECTED, JSON.stringify(actual, null, 2) + '\n')
  console.log(`api-surface: seeded ${EXPECTED} — ${runtime.length} runtime, ${typeList.length} type export(s)`)
  process.exit(0)
}

const expected = JSON.parse(readFileSync(EXPECTED, 'utf8'))
const failures = []
for (const [kind, now, before] of [
  ['runtime', runtime, (expected.exports ?? []).slice().sort()],
  ['type', typeList, (expected.types ?? []).slice().sort()],
]) {
  for (const x of now.filter(x => !before.includes(x))) failures.push(`+ ${kind} export "${x}" not in ${EXPECTED}`)
  for (const x of before.filter(x => !now.includes(x))) failures.push(`- ${kind} export "${x}" in ${EXPECTED} but no longer exported`)
}

if (failures.length) {
  console.error('api-surface: FAIL')
  failures.forEach(f => console.error('  ' + f))
  console.error(`  If intended, update ${EXPECTED}.`)
  process.exit(1)
}
console.log(`api-surface: ok — ${runtime.length} runtime + ${typeList.length} type export(s) as documented`)
