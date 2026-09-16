/**
 * M6 gate — the drag-and-dock system's invariants.
 *
 * The behaviour is measured in scripts/gates/browser/m6.mjs. These are the decisions that
 * behaviour depends on, each of which is easy to break by refactoring and hard to notice.
 */
import { readFileSync } from 'node:fs'
import { stripSourceComments } from './lib/css.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
// Comments stripped: a gate must ask about code. The note explaining *why* `:hover` is not
// used would otherwise read as a use of `:hover`.
const src = stripSourceComments(readFileSync('src/composables/useDragDock.ts', 'utf8'))

// 1. The thresholds. Changing one is a product decision, not a tidy-up.
must(/LONG_PRESS_MS = 300/.test(src), 'the touch long press must stay 300ms')
must(/CANCEL_MOVE_PX = 8/.test(src), 'the touch cancel distance must stay 8px')
must(/DRAG_THRESHOLD_PX = 5/.test(src), 'the mouse drag threshold must stay 5px')

// 2. Mouse must NOT capture the pointer; touch must. This is the crux of the whole file:
//    capture routes every event to the capturing element, so with capture the drop zones
//    never receive pointerenter and hover tracking dies. Touch needs capture anyway, and
//    resolves its target by hit-testing instead.
const mousePath = src.slice(src.indexOf('// Mouse and pen'))
must(!/setPointerCapture/.test(mousePath),
  'the mouse path must not capture the pointer, or the drop zones stop receiving hover events')
const touchPath = src.slice(src.indexOf("if (event.pointerType === 'touch')"), src.indexOf('// Mouse and pen'))
must(/setPointerCapture/.test(touchPath), 'the touch path must capture the pointer')
must(/resolveFromPoint/.test(touchPath), 'the touch path must resolve its target by hit-testing')

// 3. Drop resolution order: edge, then tab, then leaf zone, then corner, then free float.
//    A leaf's cross overlaps the edge zones beneath it, and a tab is a more precise intent
//    than either, so the order is load-bearing rather than incidental.
const finish = src.slice(src.indexOf('function finishDrag'), src.indexOf('function startTabDrag'))
const order = ['armedEdge', 'armedTab', 'armedZone', 'armedCorner']
let cursor = -1
for (const name of order) {
  const at = finish.indexOf(`if (${name})`) >= 0 ? finish.indexOf(`if (${name})`) : finish.indexOf(`(${name})`)
  must(at > cursor, `drop resolution checks ${name} out of order — the order decides which target wins`)
  cursor = at
}
must(/floatPanel\(panelId, \{ x: event.clientX/.test(finish),
  'releasing over nothing must float the panel where the pointer let go')

// 4. The index correction. DOM indices are pre-removal; `movePanelOrder` removes before
//    inserting, so a panel dragged rightwards within its own leaf lands one short.
must(/current !== -1 && current < index/.test(finish),
  'the tab insertion index must be corrected for the panel\'s own removal')

// 5. RTL is handled by flipping logical sides, not by storing physical ones.
must(/flipZoneHorizontal/.test(src), 'corner anchors must be flipped for RTL')
must(/if \(!ws\.state\.isRtl\) return position/.test(src), 'drop sides must be flipped for RTL')

// 6. Armed state drives the visuals, never `:hover` — which is unreliable mid-drag and does
//    not exist on touch.
const zones = stripSourceComments(readFileSync('src/components/VddDropZones.vue', 'utf8'))
must(/vdd-dock-target-box--active.*isArmed|isArmed\(position\)/.test(zones),
  'the armed target must be state-driven')
must(!/:hover/.test(zones), 'drop zones must not depend on :hover')

// 7. A more specific target disarms the coarser ones it overlaps.
must(/if \(position\) \{ edge\.value = null; corner\.value = null \}/.test(src),
  'arming a leaf zone must clear the edge and corner beneath it')
must(/if \(value\) edge\.value = null/.test(src), 'arming a corner must clear the edge it overlaps')

if (failures.length) {
  console.error('M6: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log('M6: ok — thresholds pinned, capture only on touch, resolution order fixed, RTL logical')
