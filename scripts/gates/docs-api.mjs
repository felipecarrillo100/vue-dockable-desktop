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

/**
 * Every documented `openPanel(` call must pass the panel key as its second argument.
 *
 * The signature is `openPanel(instanceId, panelKey, options?)`, and the shape that goes wrong
 * is `openPanel('map', { title })` — two arguments with the options where the key belongs. It
 * type-checks nowhere, but prose is not compiled, so the README shipped it until a consumer
 * smoke test caught it on the way to 1.0.0. Checked wherever examples live, the README
 * included: that file is the npm landing page.
 */
function checkOpenPanelCalls(label, text) {
  for (const match of text.matchAll(/openPanel\(\s*([^)]*)\)/g)) {
    const args = match[1]
    // Only the two-argument object form is wrong; a key as the second argument is fine, and
    // so is a call written across lines with an options object third.
    if (/^\s*['"`][^'"`]*['"`]\s*,\s*\{/.test(args)) {
      failures.push(`${label}: openPanel(${args.split('\n')[0]}…) passes options where the ` +
        'panel key belongs — the signature is openPanel(instanceId, panelKey, options?)')
    }
  }
}

/**
 * A document that shows a component in a template must show where it comes from.
 *
 * `install()` provides the workspace and nothing else — components are imported, so that a
 * build carries only the ones it uses. The manual and the README both claimed `app.use()`
 * registered them globally, and a reader who copied either got `<vdddesktop></vdddesktop>`
 * in the DOM: an unresolved custom element, silent in a production build. Caught by a
 * consumer smoke test on the way to 1.0.0, and pinned here so the examples stay runnable.
 *
 * Scoped to the two documents a reader copies *wholesale* — the README quick start and the
 * manual's first chapter. Everywhere else the examples are fragments illustrating one prop,
 * and demanding an SFC header in each would be noise for no gain. The claim itself is
 * checked everywhere instead, just below.
 */
function checkComponentImports(label, text) {
  const used = new Set([...text.matchAll(/<(Vdd[A-Z][A-Za-z]*)[\s/>]/g)].map(m => m[1]))
  if (!used.size) return
  const imported = new Set(
    [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'vue-dockable-desktop'/g)]
      .flatMap(m => m[1].split(',').map(x => x.trim())),
  )
  for (const name of used) {
    if (!imported.has(name)) {
      failures.push(`${label}: uses <${name}> in an example but never imports it from ` +
        "'vue-dockable-desktop' — app.use() does not register components globally")
    }
  }
}

const readme = readFileSync('README.md', 'utf8')
checkOpenPanelCalls('README.md', readme)
checkComponentImports('README.md', readme)
checkComponentImports('01-getting-started.md',
  readFileSync(join(MANUAL, '01-getting-started.md'), 'utf8'))

// And nowhere may claim the plugin registers them, which is how the wrong examples were
// justified in the first place.
for (const file of ['README.md', ...readdirSync(MANUAL).filter(f => f.endsWith('.md')).map(f => join(MANUAL, f))]) {
  const text = readFileSync(file, 'utf8')
  if (/use\([^)]*\)[^.]{0,40}registers the components|registers the components globally/.test(text)) {
    failures.push(`${file}: claims app.use() registers the components — install() only provides the workspace`)
  }
}

for (const file of files) {
  const path = join(MANUAL, file)
  const text = readFileSync(path, 'utf8')
  checkOpenPanelCalls(file, text)

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
