/**
 * Standing gate — every class and custom property the library owns is `vdd-` prefixed.
 *
 * docs/decisions/0008-css-prefix.md. rdd's own migration was left unfinished (~35 unprefixed
 * tokens and 4 bare classes still shipped in its published stylesheet at 6.2.0); this gate
 * exists so the same thing cannot happen here.
 *
 * Checks the stylesheet's own selectors and declarations, and the class names components
 * actually emit — a rule whose class no component renders is dead, and a class no rule
 * matches is unstyled. Both were real rdd bugs.
 */
import { readFileSync, existsSync } from 'node:fs'
import { emittedClasses, sourceFiles } from './lib/emitted.mjs'

const CSS = 'src/index.css'
const failures = []

const css = existsSync(CSS) ? readFileSync(CSS, 'utf8') : ''
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

// 1. class selectors in the stylesheet
for (const m of withoutComments.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
  const cls = m[1]
  if (!cls.startsWith('vdd-')) failures.push(`${CSS}: unprefixed class selector ".${cls}"`)
}

// 2. custom property *declarations* (a var() read of a consumer's token is fine)
for (const m of withoutComments.matchAll(/(^|[;{]\s*)(--[\w-]+)\s*:/gm)) {
  const prop = m[2]
  if (!prop.startsWith('--vdd-')) failures.push(`${CSS}: unprefixed custom property "${prop}"`)
}

// 3. class names emitted by components
//
// The scanner lives in lib/emitted.mjs, shared with the M13 correspondence gate: two gates
// asking the same question with two scanners is two chances to be wrong about it.
const sources = sourceFiles()
const ALLOW = new Set(['', 'true', 'false'])

for (const file of sources) {
  for (const cls of emittedClasses(file)) {
    if (!ALLOW.has(cls) && !cls.startsWith('vdd-')) {
      failures.push(`${file}: emits unprefixed class "${cls}"`)
    }
  }
}

if (failures.length) {
  console.error('css-prefix: FAIL')
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}
console.log(`css-prefix: ok — ${CSS} and ${sources.length} source file(s) clean`)
