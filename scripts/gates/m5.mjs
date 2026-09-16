/**
 * M5 gate — floating windows.
 *
 * The measurable behaviour is in scripts/gates/browser/m5.mjs. This half pins the two
 * structural decisions that make it work, both of which were rdd defects.
 */
import { readFileSync } from 'node:fs'
import { declarationsFor } from './lib/css.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }

const css = readFileSync('src/index.css', 'utf8')
const win = readFileSync('src/components/VddFloatingWindow.vue', 'utf8')

// 1. D5: handles must be fully inside their window. Any negative inset is clipped away by
//    `overflow: hidden`, which halves an edge handle's grab area and kills a corner drag
//    outright — measured in Chrome before this was fixed.
for (const dir of ['n', 's', 'e', 'w', 'ne', 'se', 'sw', 'nw']) {
  const decl = declarationsFor(css, `.vdd-resize-${dir}`)
  must(decl.length > 0, `.vdd-resize-${dir} has no rule`)
  const negative = decl.match(/(top|bottom|left|right)\s*:\s*-\d/g)
  must(!negative, `.vdd-resize-${dir} is positioned outside its box (${negative?.join(', ')}) — it will be clipped`)
}

// 2. An anchored window is positioned by CSS *logical* properties, so switching reading
//    direction mirrors it with no JavaScript and no stored physical coordinate. That is what
//    lets a layout saved in one direction restore correctly in the other.
must(/insetInlineEnd/.test(win) && /insetInlineStart/.test(win),
  'anchored windows must use insetInlineStart/insetInlineEnd, not left/right')
const anchorBlock = win.slice(win.indexOf('if (w.anchor)'), win.indexOf('return { ...base, left:'))
must(!/\bleft:|\bright:/.test(anchorBlock),
  'the anchored branch must not set physical left/right — that defeats the mirroring')

// 3. Resizing a workspace must not leave a window unreachable.
const desktop = readFileSync('src/components/VddDesktop.vue', 'utf8')
must(/view\.width - 100/.test(desktop), 'the clamp must keep part of the title bar grabbable')
must(/if \(!w\.anchor\)/.test(desktop),
  'position must be clamped only for free-floating windows: an anchored window is placed by its anchor')

// 4. All eight handles, and none while maximized.
must((win.match(/'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'/) ?? []).length === 1,
  'a floating window offers all eight resize directions')
must(/v-if="!window.maximized"/.test(win), 'handles must not be rendered while maximized')

if (failures.length) {
  console.error('M5: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log('M5: ok — handles unclipped (D5), anchors logical, clamp keeps windows reachable')
