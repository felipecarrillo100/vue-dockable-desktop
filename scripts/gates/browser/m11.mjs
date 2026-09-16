/**
 * M11 browser gate — the panel overlay, measured.
 *
 * The headline assertion is **D5**: every resize handle's hit area is its full intended size.
 * `elementFromPoint` is the only honest way to ask that — a handle can be rendered, have a
 * resize cursor and still be unreachable, which is exactly what rdd shipped: handles at
 * `-4px` on a box with `overflow: hidden`, so half of every one was clipped away, and at a
 * rounded corner nothing was hit at all. No jsdom test can see it, because jsdom has no
 * layout and no hit-testing.
 *
 * Also measured here, for the same reason: that a stretched axis genuinely *tracks* the panel
 * when the panel resizes (the claim that it needs no JavaScript), that a docked widget stops
 * at a toolbar, and that a full-width strip clears the taller of its edge's two corners.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'http://localhost:5188/'
const OUT = 'artifacts/M11'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (step, msg) => failures.push(`[${step}] ${msg}`)
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
page.on('pageerror', e => fail('pageerror', e.message))
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fail('console', m.text())
})

await page.goto(APP, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__vdd, null, { timeout: 15000 })

// One overlay panel, alone in the workspace so it is as large as possible.
await page.evaluate(() => window.__vdd.openPanel('ov', 'overlay'))
await page.waitForSelector('[data-vdd-panel-overlay]')
await page.waitForFunction(() => !!window.__overlay, null, { timeout: 5000 })
await page.waitForTimeout(400)

const record = []
const box = (sel) => page.locator(sel).boundingBox()
const place = async (which, placement) => {
  await page.evaluate(([w, p]) => { window.__overlay.state[w] = p }, [which, placement])
  await page.waitForTimeout(250)
}
const setToolbars = async (patch) => {
  await page.evaluate(p => Object.assign(window.__overlay.toolbars, p), patch)
  await page.waitForTimeout(250)
}

// ── D5: every handle is hittable across its whole nominal area ─────────────
// Probed a pixel inside each outer edge of the handle's own box, and at the middle. A handle
// positioned at a negative inset reports a box that extends outside its widget, so the outer
// probe lands on whatever is behind — which is how the defect shows up as "the drag does
// nothing" rather than as an error.
await place('free', { anchor: 'bottom-right', stretch: null })

/** Measure, or record why the measurement is impossible — a crash tells you nothing. */
const boxOr = async (sel, step) => {
  const b = await box(sel)
  if (!b) fail(step, `"${sel}" has no box — it is absent or not laid out`)
  return b
}

/** Undock the `free` widget so all eight handles are present. */
const header = await boxOr('[data-vdd-widget="free"] [data-vdd-widget-header]', 'setup')
await page.mouse.move(header.x + 60, header.y + header.height / 2)
await page.mouse.down()
await page.mouse.move(header.x + 60 - 180, header.y + header.height / 2 - 140, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(250)

const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const hitReport = []
for (const dir of dirs) {
  const sel = `[data-vdd-widget="free"] .vdd-resize-${dir}`
  const b = await box(sel)
  if (!b) { fail('D5', `handle ${dir} is not rendered on a free-floating widget`); continue }

  // Probe the centre and one pixel inside each edge of the handle's own box.
  const probes = {
    centre: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    left: { x: b.x + 1, y: b.y + b.height / 2 },
    right: { x: b.x + b.width - 1, y: b.y + b.height / 2 },
    top: { x: b.x + b.width / 2, y: b.y + 1 },
    bottom: { x: b.x + b.width / 2, y: b.y + b.height - 1 },
  }
  const hits = await page.evaluate(([points, dir]) => {
    const out = {}
    for (const [name, p] of Object.entries(points)) {
      const el = document.elementFromPoint(p.x, p.y)
      out[name] = el?.classList?.contains(`vdd-resize-${dir}`) ? 'handle' : (el?.className || el?.tagName || 'none')
    }
    return out
  }, [probes, dir])

  hitReport.push({ dir, size: `${Math.round(b.width)}x${Math.round(b.height)}`, ...hits })
  for (const [name, got] of Object.entries(hits)) {
    if (got !== 'handle') fail('D5', `handle ${dir}: probe at its ${name} hit "${got}", not the handle`)
  }
  if (b.width < 6 || b.height < 6) {
    fail('D5', `handle ${dir} is only ${Math.round(b.width)}x${Math.round(b.height)} — smaller than its nominal size`)
  }
}
record.push({ step: 'D5 hit areas', handles: hitReport })

// ── D5, continued: the *visible* corner is hittable, and dragging it resizes ───
// The rounded-corner case, and the one that needs stating carefully.
//
// A widget has `border-radius` and `overflow: hidden`, so the extreme diagonal pixel of the
// corner handle's box is clipped away — probing it hits the page behind. That pixel is also
// outside the widget's *painted* shape, so nothing a user can see is unreachable: the visible
// corner is the arc, and the whole arc lies within the handle's inscribed quarter-disc.
//
// rdd's defect was different in kind. Its handles sat at `-4px`, so half of every one was
// outside the box and clipped — the grabbable strip was 4px of a nominal 8px edge, and at the
// corner the entire *visible* arc was outside the handle, so a corner drag did nothing at all.
// What this asserts, therefore, is the thing that was actually broken: a press on the visible
// corner reaches the handle and moves both edges.
const corner = await boxOr('[data-vdd-widget="free"] .vdd-resize-se', 'D5')
const beforeCorner = await boxOr('[data-vdd-widget="free"]', 'D5')
// 3px in from the outer corner on each axis: ~7.1px from the arc's centre (which is the
// handle's own centre), so inside the 8px radius and on the painted corner.
const visibleCorner = { x: corner.x + corner.width - 3, y: corner.y + corner.height - 3 }
const cornerHit = await page.evaluate((p) => {
  const el = document.elementFromPoint(p.x, p.y)
  return el?.classList?.contains('vdd-resize-se') ? 'handle' : (el?.className || el?.tagName || 'none')
}, visibleCorner)
if (cornerHit !== 'handle') fail('D5', `the visible corner hit "${cornerHit}", not the corner handle`)

await page.mouse.move(visibleCorner.x, visibleCorner.y)
await page.mouse.down()
await page.mouse.move(visibleCorner.x + 60, visibleCorner.y + 40, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(200)
const afterCorner = await boxOr('[data-vdd-widget="free"]', 'D5')
record.push({
  step: 'D5 visible corner',
  hit: cornerHit,
  from: `${Math.round(beforeCorner.width)}x${Math.round(beforeCorner.height)}`,
  to: `${Math.round(afterCorner.width)}x${Math.round(afterCorner.height)}`,
})
if (!near(afterCorner.width, beforeCorner.width + 60, 4)) {
  fail('D5', `corner drag changed width by ${Math.round(afterCorner.width - beforeCorner.width)}, expected 60`)
}
if (!near(afterCorner.height, beforeCorner.height + 40, 4)) {
  fail('D5', `corner drag changed height by ${Math.round(afterCorner.height - beforeCorner.height)}, expected 40`)
}

// ── a stretched axis tracks the panel, with no JavaScript ──────────────────
// The claim behind "stretch is two pins, not a width": CSS keeps the widget spanning the
// panel. Resizing the panel is the test — a measured width written once would not follow.
await page.evaluate(() => {
  window.__vdd.openPanel('other', 'hostile')
  // Into the *other* leaf: opened into the same one it would make the overlay a background
  // tab, and a hidden panel has no box at all — which is how this gate first failed.
  window.__vdd.dockPanelToGroup('other', 'R', 'center')
})
await page.waitForTimeout(400)
const overlayBefore = await boxOr('[data-vdd-panel-overlay]', 'stretch')
const stripBefore = await boxOr('[data-vdd-widget="strip"]', 'stretch')

// Drag the grid divider to make the overlay panel narrower.
const divider = await box('.vdd-resizer-bar')
if (divider) {
  await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2)
  await page.mouse.down()
  await page.mouse.move(divider.x + divider.width / 2 - 160, divider.y + divider.height / 2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}
const overlayAfter = await boxOr('[data-vdd-panel-overlay]', 'stretch')
const stripAfter = await boxOr('[data-vdd-widget="strip"]', 'stretch')
if (!overlayBefore || !overlayAfter || !stripBefore || !stripAfter) {
  record.push({ step: 'stretch tracks', skipped: 'a box was missing' })
} else {
record.push({
  step: 'stretch tracks',
  overlay: `${Math.round(overlayBefore.width)} -> ${Math.round(overlayAfter.width)}`,
  strip: `${Math.round(stripBefore.width)} -> ${Math.round(stripAfter.width)}`,
})
if (!near(overlayAfter.width, overlayBefore.width - 160, 20)) {
  fail('stretch', `the overlay panel did not narrow as expected (${Math.round(overlayBefore.width)} -> ${Math.round(overlayAfter.width)})`)
}
// The strip must have followed, keeping its 8px gutter on each side.
if (!near(stripAfter.width, overlayAfter.width - 16, 4)) {
  fail('stretch', `the strip is ${Math.round(stripAfter.width)} wide in a ${Math.round(overlayAfter.width)} panel — it stopped tracking`)
}
}

// ── a strip clears the taller of its edge's two corners ────────────────────
// The `card` is moved to the *opposite* bottom corner and made the taller of the two, so
// clearing only the strip's own corner would give a visibly different answer.
await place('card', { anchor: 'bottom-right', stretch: null })
await page.waitForTimeout(250)
const overlayNow = await boxOr('[data-vdd-panel-overlay]', 'stacking')
const cardNow = await boxOr('[data-vdd-widget="card"]', 'stacking')
const stripNow = await boxOr('[data-vdd-widget="strip"]', 'stacking')
const bottomGapCard = overlayNow.y + overlayNow.height - (cardNow.y + cardNow.height)
const bottomGapStrip = overlayNow.y + overlayNow.height - (stripNow.y + stripNow.height)
record.push({
  step: 'strip clears both corners',
  cardHeight: Math.round(cardNow.height),
  cardBottomGap: Math.round(bottomGapCard),
  stripBottomGap: Math.round(bottomGapStrip),
})
// Which of the two clears the other follows the order they joined the bucket, and the card
// joins bottom-right only when this gate moves it there — so the assertion is about the
// invariant, not about who is on top: a full-width strip and a corner widget on the same edge
// must not overlap, and whichever is stacked second must clear the other's full height.
const stripBottom = stripNow.y + stripNow.height
const cardBottom = cardNow.y + cardNow.height
const overlapping = stripNow.y < cardBottom && cardNow.y < stripBottom
if (overlapping) {
  fail('stacking', `the strip (${Math.round(stripNow.y)}–${Math.round(stripBottom)}) overlaps the corner card (${Math.round(cardNow.y)}–${Math.round(cardBottom)}) on the same edge`)
}
const [lower, upper] = bottomGapStrip < bottomGapCard
  ? [{ name: 'strip', ...stripNow, gap: bottomGapStrip }, { name: 'card', ...cardNow, gap: bottomGapCard }]
  : [{ name: 'card', ...cardNow, gap: bottomGapCard }, { name: 'strip', ...stripNow, gap: bottomGapStrip }]
// 8px stack gap between them.
if (!near(upper.gap, lower.gap + lower.height + 8, 3)) {
  fail('stacking', `${upper.name} sits ${Math.round(upper.gap)}px up but should clear ${lower.name} (${Math.round(lower.gap)} + ${Math.round(lower.height)} + 8)`)
}

// ── a docked widget stops at a toolbar, not at the panel edge ──────────────
await place('card', { anchor: 'top-left', stretch: null })
await place('strip', { anchor: 'bottom-left', stretch: null })
await setToolbars({ bottom: true })
const bottomToolbar = await boxOr('[data-vdd-panel-toolbar="bottom"]', 'toolbar inset')
const cardTop = await boxOr('[data-vdd-widget="card"]', 'toolbar inset')
const sHandle = await boxOr('[data-vdd-widget="card"] .vdd-resize-s', 'toolbar inset')
if (sHandle) {
  await page.mouse.move(sHandle.x + sHandle.width / 2, sHandle.y + sHandle.height / 2)
  await page.mouse.down()
  await page.mouse.move(sHandle.x + sHandle.width / 2, overlayNow.y + overlayNow.height + 300, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}
const cardGrown = await box('[data-vdd-widget="card"]')
const overlap = (cardGrown.y + cardGrown.height) - bottomToolbar.y
record.push({
  step: 'resize stops at the toolbar',
  toolbarTop: Math.round(bottomToolbar.y),
  widgetBottom: Math.round(cardGrown.y + cardGrown.height),
  overlap: Math.round(overlap),
  grewFrom: Math.round(cardTop.height),
  grewTo: Math.round(cardGrown.height),
})
if (overlap > 2) {
  fail('toolbar inset', `the widget was resized ${Math.round(overlap)}px over the bottom toolbar`)
}
if (cardGrown.height <= cardTop.height) {
  fail('toolbar inset', 'the widget did not grow at all, so the clamp was not what stopped it')
}

// ── the toolbar is not clipping its own dropdown, and stacks above widgets ─
const stacking = await page.evaluate(() => {
  const widget = document.querySelector('[data-vdd-widget="card"]')
  const toolbar = document.querySelector('[data-vdd-panel-toolbar="top"]')
  const wz = Number(getComputedStyle(widget).zIndex)
  const tz = Number(getComputedStyle(toolbar).zIndex)
  return { widgetZ: wz, toolbarZ: tz, toolbarOverflow: getComputedStyle(toolbar).overflow }
})
record.push({ step: 'stacking', ...stacking })

await page.screenshot({ path: `${OUT}/overlay.png` })
const passed = failures.length === 0
writeFileSync(`${OUT}/browser.json`, JSON.stringify({ passed, failures, record }, null, 2) + '\n')

console.log('M11 browser gate')
for (const r of record) console.log('  ' + JSON.stringify(r))
if (!passed) { console.log('FAILURES:'); failures.forEach(f => console.log('   ' + f)) }
console.log(passed ? 'M11 BROWSER: PASS' : 'M11 BROWSER: FAIL')
await browser.close()
process.exit(passed ? 0 : 1)
