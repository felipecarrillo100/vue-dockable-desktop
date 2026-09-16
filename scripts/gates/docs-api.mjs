/**
 * Standing gate — the manual only names APIs that exist.
 *
 * Added in M12, after M11's own gate caught two documents still describing a model that had
 * been replaced. A manual that promises an export the package does not have is worse than no
 * manual: it costs a reader their trust in all of it, and nothing else in the pipeline can
 * see the problem — the docs are not compiled and not imported.
 *
 * Two checks, both narrow enough to have no false positives:
 *
 *  1. Every `Vdd…` identifier the manual mentions is a real runtime export. The prefix is
 *     the library's own, so there is nothing else it could belong to.
 *  2. No chapter mentions a retired name outside a migration table, where naming the old API
 *     is the entire point.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MANUAL = 'docs/manual'
const SURFACE = 'api-surface.json'

if (!existsSync(SURFACE)) {
  console.error(`docs-api: ${SURFACE} missing — the api-surface gate must run first`)
  process.exit(1)
}

const surface = JSON.parse(readFileSync(SURFACE, 'utf8'))
const known = new Set([...(surface.exports ?? []), ...(surface.types ?? [])])

/**
 * Names that were part of the design at some point and are not any more. A chapter may only
 * mention these inside its migration table, where the row's other half names the replacement.
 */
const RETIRED = [
  'v-model:anchor',       // replaced by one v-model:placement (M11)
  'v-model:stretch',
  'usePanelFloatingWindow',  // rdd's; a ref plus v-model:open (M11)
  'useStyleClasses',         // rdd's; createWorkspace({ classes }) (M12)
]

/**
 * Headings that introduce a section whose purpose *is* to name the old API.
 *
 * "Coming from react-dockable-desktop" is the per-chapter migration table. "What is
 * deliberately absent" is the reference chapter's version of the same thing: a list of rdd
 * names paired with the reason each is gone. Both are exactly where a retired name belongs,
 * so keying the exemption on the heading rather than on the filename keeps the rule about
 * intent instead of about where the text happens to live.
 */
const MIGRATION_HEADINGS = [
  /^#+ Coming from react-dockable-desktop/m,
  /^#+ What is deliberately absent/m,
]

const failures = []
const files = readdirSync(MANUAL).filter(f => f.endsWith('.md')).sort()

for (const file of files) {
  const path = join(MANUAL, file)
  const text = readFileSync(path, 'utf8')

  // An outline chapter documents nothing yet, so it has nothing to get wrong.
  if (/^> \*\*Outline only\.\*\*/m.test(text)) continue

  // 1. Vdd… identifiers must exist.
  for (const match of text.matchAll(/\bVdd[A-Z][A-Za-z]*\b/g)) {
    const name = match[0]
    if (!known.has(name)) failures.push(`${file}: mentions "${name}", which is not exported`)
  }

  // 2. Retired names only inside a migration section — one that exists precisely to pair an
  //    old name with its replacement. Two headings introduce such a section, and both run to
  //    the end of their chapter, so the text before the first of them is what must be clean.
  //    The migration *chapter* is all migration, so it is exempt entirely.
  if (file.includes('migrating')) continue
  const starts = MIGRATION_HEADINGS
    .map(pattern => text.search(pattern))
    .filter(index => index !== -1)
  const body = starts.length ? text.slice(0, Math.min(...starts)) : text
  for (const retired of RETIRED) {
    if (body.includes(retired)) {
      failures.push(`${file}: mentions the retired "${retired}" outside its migration table`)
    }
  }
}

if (failures.length) {
  console.error('docs-api: FAIL')
  failures.forEach(f => console.error('  ' + f))
  console.error('  The manual is the promise; the package is the product. Fix whichever is wrong.')
  process.exit(1)
}

const drafted = files.filter(f => !/^> \*\*Outline only/m.test(readFileSync(join(MANUAL, f), 'utf8')))
console.log(`docs-api: ok — ${drafted.length} drafted chapter(s) name only real exports`)
