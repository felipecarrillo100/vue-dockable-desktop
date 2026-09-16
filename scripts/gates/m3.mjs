/**
 * M3 gate — the store is live before any component, and `activePanelId` has exactly one
 * resolution point that every placement action routes through.
 */
import { readFileSync } from 'node:fs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
const src = readFileSync('src/core/workspace.ts', 'utf8')

// 1. The workspace must work with no Vue app and nothing mounted. Proven by running it.
const { createWorkspace } = await import('../../dist/index.js')
const w = createWorkspace({ panels: { map: { component: { render: () => null } } } })
w.openPanel('p1', 'map')
must(w.isOpen('p1'), 'openPanel did nothing with no app mounted')
must(w.state.activePanelId === 'p1', 'activePanelId was not resolved with no app mounted')
must(JSON.parse(w.saveLayout()).panels.p1 !== undefined, 'saveLayout did not include the panel')
must(w.loadLayout(w.saveLayout()) === true, 'loadLayout failed on its own output')

// 2. Exactly one resolution point. Divergence D2 exists because rdd resolved the active
//    panel action by action and five actions forgot to; one function is what makes that
//    unrepeatable rather than merely fixed.
const resolverDefs = src.match(/function resolveActive\b/g) ?? []
must(resolverDefs.length === 1, `expected exactly one resolveActive definition, found ${resolverDefs.length}`)

// Only resolveActive may assign activePanelId — with two documented exceptions: an explicit
// focusPanel() on a minimized panel (a deliberate caller decision, honoured as rdd does),
// and loadLayout, which takes the value the snapshot resolved.
const assignments = [...src.matchAll(/state\.activePanelId\s*=/g)].length
must(assignments === 3,
  `activePanelId is assigned in ${assignments} places; expected 3 (resolveActive, focusPanel's ` +
  `minimized case, loadLayout). A new assignment means a placement action is deciding for itself.`)

// 3. Every action that changes where a panel lives must end at the resolver.
const PLACEMENT = [
  'function openPanel', 'function closePanel', 'function minimizePanel', 'function restorePanel',
  'function floatPanel', 'function dockPanel', 'function dockPanelToGroup',
  'function dockPanelToWorkspaceEdge', 'function movePanelOrder', 'function maximizePanel',
  'function closeLeafGroup', 'function focusPanel',
]
for (const marker of PLACEMENT) {
  const start = src.indexOf(marker)
  must(start !== -1, `${marker} not found`)
  if (start === -1) continue
  // the function body ends at the next top-level `function ` declaration
  const rest = src.slice(start + marker.length)
  const end = rest.search(/\n {2}(?:async )?function /)
  const body = end === -1 ? rest : rest.slice(0, end)
  const routes = /resolveActive\(/.test(body) || /restorePanel\(|focusPanel\(/.test(body)
  must(routes, `${marker} does not route through resolveActive — activePanelId can go stale (D2)`)
}

// 4. The pending-call machinery rdd needed must not have crept back in.
for (const gone of ['_connect', '_pendingCalls', 'isConnected', '_disconnect']) {
  must(!src.includes(gone), `${gone} found — the store is live from creation and needs no handshake`)
}

if (failures.length) {
  console.error('M3: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log(`M3: ok — store live before mount, 1 resolveActive, ${PLACEMENT.length} placement actions route through it`)
