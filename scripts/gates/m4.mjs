/**
 * M4 gate — the persistence port and the grid.
 *
 * The behavioural guarantee lives in the browser gate (scripts/gates/browser/m4.mjs), which
 * is the only place it *can* live: jsdom has no layout, so nothing scrolls, nothing has a
 * size and `offsetParent` is always null. This half asserts the structure that guarantee
 * rests on.
 */
import { existsSync, readFileSync } from 'node:fs'
import { declares } from './lib/css.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }

// 1. The port's own invariants, read from the source, because they are easy to break by
//    well-meaning refactoring and expensive to notice.
const desktop = readFileSync('src/components/VddDesktop.vue', 'utf8')
must(/v-for="id in mounted"/.test(desktop),
  'VddDesktop must render every open panel, unconditionally — a conditional port is not a port')
must(!/v-if=".*mounted/.test(desktop),
  'the persistence port must not be conditionally rendered')

const mount = readFileSync('src/components/VddPanelMount.vue', 'utf8')
must(/<Teleport :to="target">/.test(mount), 'VddPanelMount must teleport into the panel\'s own cache element')
// The *Teleport itself* must be unconditional — a Teleport with no target renders nothing,
// which unmounts the panel and destroys the state this design exists to protect. A `v-if`
// on content *inside* it is fine (the unregistered-panel fallback uses one), so the check is
// scoped to the Teleport tag rather than the whole template.
const teleportTag = mount.match(/<Teleport[^>]*>/)?.[0] ?? ''
must(!/v-if|v-show|:disabled/.test(teleportTag),
  `the Teleport must not be conditional, found: ${teleportTag}`)

const slot = readFileSync('src/components/VddPanelSlot.vue', 'utf8')
must(/:ref="setHost"/.test(slot),
  'the slot must place the panel from a function ref, so it lands during the patch rather than a tick later')
must(/hostOf\(props\.panelId\) === host/.test(slot),
  'the slot must check ownership before parking a panel, or a hand-off between leaves yanks it back')

// 2. The structural CSS rdd carried as inline JSX styles. Without an unbroken percentage
//    height chain every descendant collapses — the M4 browser gate caught a 0px-tall split
//    divider that could not be grabbed at all.
const css = readFileSync('src/index.css', 'utf8')
for (const [sel, prop] of [
  ['.vdd-workspace', 'height: 100%'],
  ['.vdd-workspace', 'display: flex'],
  ['.vdd-workspace-viewport', 'flex-grow: 1'],
  ['.vdd-workspace-panel', 'height: 100%'],
  ['.vdd-panel-body', 'flex-grow: 1'],
  ['.vdd-panel-slot', 'height: 100%'],
]) {
  must(declares(css, sel, prop), `${sel} is missing "${prop}" — the height chain breaks`)
}
// Panel content must stay selectable even though the workspace suppresses selection.
must(declares(css, '.vdd-panel-content', 'user-select: text'),
  '.vdd-panel-content must re-enable text selection inside panels')

// 3. The playground the browser gate drives must exist and use the public API.
must(existsSync('playground/src/main.ts'), 'playground is missing')
const pg = readFileSync('playground/src/main.ts', 'utf8')
must(/createWorkspace/.test(pg) && /window\).__vdd|__vdd/.test(pg),
  'the playground must drive the library through its public API, not test-only hooks')

/**
 * A layout saved by an affected version is repaired when it is read.
 *
 * `saveLayout()` wrote out the corrupted tree the self-drop bug produced, so the fault
 * returned on every reload: a stored layout stayed broken for good. The repair has to sit at
 * the *shared* parse point, or `initialState` and `loadLayout()` would disagree about what a
 * layout means — which they did once before, over the floating-anchor migration.
 */
const serialize = readFileSync('src/core/serialize.ts', 'utf8')
must(/repairLayoutTree\(/.test(serialize), 'the read path must repair a corrupted saved layout')
must(/export function repairLayoutTree/.test(readFileSync('src/core/layoutTree.ts', 'utf8')),
  'the repair must be a pure tree function, testable without a workspace')
must(serialize.indexOf('repairLayoutTree(') < serialize.indexOf('const scope'),
  'the repair must run before anything reads the tree, or activePanelId resolves against a broken one')
must(/export function parseLayoutPayload/.test(serialize) && !/repairLayoutTree/.test(readFileSync('src/core/workspace.ts', 'utf8')),
  'the repair must live at the one shared parse point, not in loadLayout alone')

if (failures.length) {
  console.error('M4: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log('M4: ok — port unconditional, slot places during patch, height chain intact, ' +
  'saved layouts repaired on read')
