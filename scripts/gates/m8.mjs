/**
 * M8 gate — context menus.
 *
 * Placement and stacking are measured in scripts/gates/browser/m8.mjs. These are the
 * decisions behind them.
 */
import { readFileSync } from 'node:fs'
import { declarationsFor, stripSourceComments } from './lib/css.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
const css = readFileSync('src/index.css', 'utf8')
const menu = stripSourceComments(readFileSync('src/components/VddContextMenu.vue', 'utf8'))
const builder = stripSourceComments(readFileSync('src/core/panelMenu.ts', 'utf8'))

// 1. Stacking belongs in CSS, against --vdd-z-base. rdd set the menu's z-index inline, which
//    is how `zIndexBase` silently failed to move it — and twice in M7 a divider painted over
//    chrome that had no z-index at all.
for (const selector of ['.vdd-context-menu', '.vdd-context-menu--submenu']) {
  const decl = declarationsFor(css, selector)
  must(decl.length > 0, `${selector} has no rule`)
  must(/z-index/.test(decl), `${selector} needs a z-index in CSS, not inline`)
  must(/var\(--vdd-z-base/.test(decl), `${selector} must stack against --vdd-z-base so zIndexBase moves it`)
}
must(!/zIndex|z-index/.test(menu), 'the menu must not set a z-index inline — that is what defeats zIndexBase')

// 2. Both dismissal paths. One is not enough: `pointerdown` in the capture phase runs before
//    a canvas gesture handler can swallow it, and a bubbled `click` survives a
//    `stopPropagation` on pointerdown, which WebGL canvases commonly do.
must(/addEventListener\('pointerdown', onOutside, \{ capture: true \}\)/.test(menu),
  'dismissal needs a capture-phase pointerdown listener')
must(/window\.addEventListener\('click', onOutside\)/.test(menu),
  'dismissal needs a bubbled window click listener as well')
must(/key === 'Escape'/.test(menu), 'Escape must dismiss the menu')

// 3. Submenu timing. Opening immediately makes the menu feel twitchy; closing immediately
//    makes a submenu unreachable, because the pointer has to travel across a gap to get in.
must(/SUBMENU_OPEN_MS = 150/.test(menu), 'the submenu open delay must stay 150ms')
must(/SUBMENU_CLOSE_MS = 200/.test(menu), 'the submenu close grace period must stay 200ms')

// 4. The submenu opens away from its parent, mirrored by reading direction.
must(/ws\.state\.isRtl/.test(menu), 'submenu placement must account for reading direction')

// 5. An action a panel has opted out of is absent, not disabled.
must(/canDrag !== false.*\n.*floatWindow|options\.canDrag !== false/.test(builder),
  'the panel menu must omit float when canDrag is false')
must(/if \(items\.length > 0 && options\.canClose !== false\) items\.push\(\{ separator: true \}\)/.test(builder),
  'the separator before Close must only appear when there is something above it')

// 6. D1: the taskbar's Maximize must do something. rdd offered the item and its action was a
//    no-op, because `maximizePanel` only mapped over floating windows.
must(/buildTaskbarMenu/.test(builder), 'there must be a dedicated taskbar menu builder')
must(/maximizePanel!, action: actions\.maximize/.test(builder), 'the taskbar menu must offer Maximize')
const workspace = stripSourceComments(readFileSync('src/core/workspace.ts', 'utf8'))
must(/state === 'minimized'\) restorePanel\(id\)/.test(workspace),
  'maximizePanel must restore a minimised panel first, or the taskbar item does nothing (D1)')

// 7. Contributed items are pulled fresh on every open, so state-driven changes work.
must(/panelMenus\.get\(id\)\?\.\(\)/.test(workspace), 'contributed menu items must be re-read on each open')
must(/panelMenuVersion/.test(workspace),
  'registrations must be trackable, or a computed asking "does this panel contribute?" caches a stale answer')

if (failures.length) {
  console.error('M8: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log('M8: ok — stacking in CSS, both dismissal paths, submenu timing pinned, D1 closed')
