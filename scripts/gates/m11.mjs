/**
 * M11 gate — the panel overlay.
 *
 * Handle sets, stretch placement and snapping are covered by the 60 ported tests; hit areas
 * and real tracking are measured in scripts/gates/browser/m11.mjs. These pin the structural
 * decisions neither can see.
 */
import { readFileSync } from 'node:fs'
import { declarationsFor, rules, stripSourceComments } from './lib/css.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
const src = (p) => stripSourceComments(readFileSync(p, 'utf8'))

const css = readFileSync('src/index.css', 'utf8')
const core = src('src/core/panelOverlay.ts')
const store = src('src/core/overlayState.ts')
const widget = src('src/components/VddFloatingWidget.vue')
const toolbar = src('src/components/VddPanelToolbar.vue')
const root = src('src/components/VddPanelOverlay.vue')
const search = src('src/components/VddToolbarSearch.vue')

// ── 1. The geometry rules are pure ─────────────────────────────────────────
// Which handles a placement offers, and where a released axis re-pins, are the two things
// rdd got wrong. Both are decisions about two enum values, so neither needs a DOM — and as
// pure functions they are testable at every combination rather than the few a render reaches.
for (const fn of ['handleDirs', 'dockedBand', 'anchorAfterRelease', 'stackOffset', 'hoveredZone']) {
  must(new RegExp(`export function ${fn}\\(`).test(core), `${fn} must be a pure function in core`)
}
must(!/from 'vue'/.test(core), 'the geometry core must not import Vue — that is what keeps it testable')

// A docked widget must never render a handle on a pinned edge: dragging it moves the opposite
// edge instead, which is an inert stub wearing a resize cursor. rdd hardcoded five directions
// regardless of anchor, leaving every bottom-anchored widget with no vertical resize at all.
must(/const freeBlock: ResizeDir = anchor\.startsWith\('top-'\) \? 's' : 'n'/.test(core),
  'the free block edge must follow the anchor')
must(/const pinsPhysicalRight = anchor\.endsWith\('-right'\) !== isRtl/.test(core),
  'the free inline edge must account for reading direction — the pin is logical, the handle physical')
// A stretched axis has both ends pinned but both releasable, or the state is a dead end.
must(/inlineStretched \? \(\['e', 'w'\] as ResizeDir\[\]\) : \[freeInline\]/.test(core),
  'a stretched inline axis must offer both ends')
must(/blockStretched \? \(\['n', 's'\] as ResizeDir\[\]\) : \[freeBlock\]/.test(core),
  'a stretched block axis must offer both ends')
must(/if \(!inlineStretched && !blockStretched\) dirs\.push/.test(core),
  'the corner belongs only to the all-pinned state')

// ── 2. Stretch is two pins, not a width ────────────────────────────────────
// Setting both ends and writing no size is the whole mechanism: CSS then tracks the panel with
// no ResizeObserver and no JavaScript. Writing a measured width instead would need one.
must(/style\.insetInlineStart = `\$\{store\.insets\.inlineStart \+ DOCK_INSET\}px`/.test(widget),
  'an inline-stretched widget must pin inline-start')
must(/style\.insetInlineEnd = `\$\{store\.insets\.inlineEnd \+ DOCK_INSET\}px`/.test(widget),
  'an inline-stretched widget must pin inline-end')
must(/if \(stretchesInline\(stretch\.value\)\) \{[\s\S]{0,260}\} else \{[\s\S]{0,200}style\.width/.test(widget),
  'a width may only be written on the *unstretched* branch')
must(/if \(stretchesBlock\(stretch\.value\)\) \{\s*\n\s*style\.top[\s\S]{0,120}style\.bottom/.test(widget),
  'a block-stretched widget must pin both block ends')

// The stored size is deliberately left alone while an axis is stretched, so releasing it
// restores the size the user last chose — no snapshot, no bookkeeping.
must(/stretchesInline\(effective\) \? size\.value\.w : rect\.w/.test(widget),
  'a still-stretched axis must keep its stored size during a resize')
must(/w: armed\.inline \? from\.w : size\.value\.w/.test(widget),
  'snapping must restore the pre-drag size on the snapped axis')

// ── 3. One placement, reported once ────────────────────────────────────────
// A single gesture can change anchor and stretch together — releasing an axis re-pins — so
// reporting them separately would surface a state that is never valid.
must(/function applyPlacement\(/.test(widget), 'placement must have a single write path')
must((widget.match(/placement\.value = \{/g) ?? []).length === 1,
  'placement must be written in exactly one place')
must(/defineModel<PanelFloatPlacement>\('placement'/.test(widget),
  'anchor and stretch must be one model, not two props plus a callback')

// ── 4. A press is not a detach ─────────────────────────────────────────────
// Undocking on pointerdown meant a plain click tore the widget off its anchor: it looked
// unchanged, but its siblings reflowed and it stopped tracking the corner from then on.
must(/DRAG_THRESHOLD\) return/.test(widget), 'undocking must wait for the drag threshold')
must(!/onHeaderDown[\s\S]{0,700}mode\.value = 'free'/.test(widget),
  'the header press handler must not change mode — only a real drag may')

// ── 5. Self-triggering effects ─────────────────────────────────────────────
// Registering in a stack *reads* the stacks to skip a no-op write, so an effect tracking its
// own body would depend on the state it writes and recurse until Vue gave up. Found by the
// tests on the first run; the guard is that these use explicit sources.
must(!/watchEffect/.test(widget),
  'the widget must use watch with explicit sources — a watchEffect here recurses on its own writes')

// ── 6. The toolbar re-measures ─────────────────────────────────────────────
must(/new ResizeObserver\(measure\)/.test(toolbar),
  'the toolbar must re-measure, or a layout restore bakes in a wrong inset permanently')
must(/onCleanup\(\(\) => \{[\s\S]{0,200}unregisterToolbar/.test(toolbar),
  'a toolbar must release its inset when it goes away')
// Only position is inline; the strip's own metrics belong in CSS (D12).
const inlineKeys = [...toolbar.matchAll(/(?:top|bottom|insetInlineStart|insetInlineEnd):/g)].length
must(inlineKeys > 0 && !/padding|gap|backdrop/.test(toolbar),
  'only position may be inline on a toolbar — padding and the rest belong in the stylesheet')

// ── 7. Stacking buckets ────────────────────────────────────────────────────
// A strip spanning an edge overlaps whatever is stacked in *either* of that edge's corners,
// so it must clear the taller of the two rather than only its own.
must(/bucketsFor\(anchor\.value, stretch\.value\)/.test(widget),
  'stacking must use the placement\'s buckets, not just its anchor')
must(/offset = Math\.max\(offset, own\)/.test(core),
  'a widget must clear the tallest of the buckets it occupies')

// ── 8. One store, not three contexts ───────────────────────────────────────
// rdd split this across three React contexts purely so a toolbar would not re-render when a
// widget gained focus. Vue tracks each ref separately, so the isolation is a property of the
// reactivity rather than of how the state was carved up.
must(/createPanelOverlayStore/.test(store), 'the overlay state must be one store')
must((root.match(/provide\(/g) ?? []).length === 1, 'the overlay root must provide exactly one thing')
must(/markRaw\(widget\.component\)/.test(store),
  'a managed widget\'s component must be raw — proxying a component definition is waste')

// ── 9. Stacking and clipping in CSS ────────────────────────────────────────
must(declarationsFor(css, '.vdd-panel-float').length > 0, '.vdd-panel-float needs a rule')
must(/position:\s*absolute/.test(declarationsFor(css, '.vdd-panel-float')),
  'a widget must be absolutely positioned within its panel, not fixed to the viewport')
const dropdown = declarationsFor(css, '.vdd-panel-toolbar-search__dropdown')
must(/var\(--vdd-z-base/.test(dropdown),
  'the search dropdown must stack against --vdd-z-base so zIndexBase moves it')
must(/<Teleport v-if="dropdown && results\.length" to="body">/.test(search),
  'the dropdown must teleport out, or the toolbar\'s bounds clip it')
must(/own\.signal\.aborted/.test(search),
  'a superseded search result must be discarded — an abort cannot retract a resolved promise')

// D5: no handle may sit at a negative inset, on the widget as well as on a window. rdd put
// them at -4px to straddle the edge, and `overflow: hidden` then ate half of every one.
for (const rule of rules(css)) {
  for (const selector of rule.selectors) {
    if (!/\.vdd-resize-[a-z]{1,2}$/.test(selector.trim())) continue
    for (const m of rule.body.matchAll(/(top|right|bottom|left):\s*(-[\d.]+)/g)) {
      failures.push(`${selector} places its ${m[1]} at ${m[2]}px — outside its own box, so overflow clips it (D5)`)
    }
  }
}

// ── 10. The docs name the API that shipped ────────────────────────────────
// Placement went from two models to one late in the milestone, and two documents were left
// describing the old shape. A manual that documents a model the component does not declare is
// worse than no manual, so the names are checked rather than trusted.
const docs = ['docs/PARITY.md', 'docs/manual/05-persistence.md', 'docs/manual/07-panel-overlay.md']
  .map(f => ({ f, text: readFileSync(f, 'utf8') }))
for (const { f, text } of docs) {
  for (const stale of ['v-model:anchor', 'v-model:stretch']) {
    must(!text.includes(stale),
      `${f} still mentions \`${stale}\` — placement is one model, \`v-model:placement\``)
  }
}
must(/v-model:placement/.test(docs[2].text), 'the overlay chapter must document v-model:placement')
must(/defineModel<boolean>\('open'/.test(widget), 'open must be a model, as the chapter says')

if (failures.length) {
  console.error('M11: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log('M11: ok — geometry pure, stretch is two pins, one placement model, ' +
  'threshold before detach, explicit watch sources, handles inside their box')
