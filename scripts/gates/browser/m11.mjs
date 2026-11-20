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

const APP = process.env.VDD_APP_URL ?? 'http://localhost:5188/'
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
/**
 * A stretched inline axis is inset by the *toolbar band*, not only by the gutter.
 *
 * This gate asserted `overlay - 16` — the 8px gutter on each side — and the playground has a
 * `left` and a `right` panel toolbar, each claiming 48px. So a strip that tracked the panel
 * perfectly measured 96px narrower than the assertion demanded and was reported as "it stopped
 * tracking". Corrected in 1.0.1, on the maintainer's authorisation, after the arithmetic was
 * confirmed against a stashed working tree: the failure was identical at HEAD, so it was the
 * gate and not the library.
 *
 * Measured rather than assumed, so a change to the playground's toolbars cannot make this lie
 * again — and the tracking claim itself is now asserted as a *delta*, which no inset can skew.
 */
const inlineInset = (await box('[data-vdd-panel-overlay] .vdd-panel-toolbar--left'))?.width ?? 0
const inlineInsetEnd = (await box('[data-vdd-panel-overlay] .vdd-panel-toolbar--right'))?.width ?? 0
const GUTTERS = 16                                   // DOCK_INSET on each side
const expectedStrip = overlayAfter.width - inlineInset - inlineInsetEnd - GUTTERS
const overlayDelta = overlayAfter.width - overlayBefore.width
const stripDelta = stripAfter.width - stripBefore.width

record.push({
  step: 'stretch tracks',
  overlay: `${Math.round(overlayBefore.width)} -> ${Math.round(overlayAfter.width)}`,
  strip: `${Math.round(stripBefore.width)} -> ${Math.round(stripAfter.width)}`,
  delta: `overlay ${Math.round(overlayDelta)} · strip ${Math.round(stripDelta)}`,
  band: `toolbars ${Math.round(inlineInset)}+${Math.round(inlineInsetEnd)} + gutters ${GUTTERS}`,
  expectedStrip: Math.round(expectedStrip),
})
if (!near(overlayAfter.width, overlayBefore.width - 160, 20)) {
  fail('stretch', `the overlay panel did not narrow as expected (${Math.round(overlayBefore.width)} -> ${Math.round(overlayAfter.width)})`)
}
// The claim itself: the strip followed the panel by the same amount. Two pins, no JavaScript.
if (!near(stripDelta, overlayDelta, 4)) {
  fail('stretch', `the panel changed by ${Math.round(overlayDelta)}px and the strip by ${Math.round(stripDelta)}px — it stopped tracking`)
}
// And it sits inside the toolbar band, not merely inside the panel.
if (!near(stripAfter.width, expectedStrip, 4)) {
  fail('stretch', `the strip is ${Math.round(stripAfter.width)} wide; spanning a ${Math.round(overlayAfter.width)} panel inside a ${Math.round(inlineInset)}+${Math.round(inlineInsetEnd)} toolbar band with ${GUTTERS}px of gutters is ${Math.round(expectedStrip)}`)
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


// ── 7.11 (M2): a managed widget's content sits in its own element and still fills the body ──
// Its content is no longer the body's own child but is inside `div.vdd-panel-float__content`.
// Content with `height: 100%` must fill the body exactly as before — at its first size and
// after a resize — and its state must survive a drag free and back.
await page.evaluate(() => {
  const w = window.__overlay.widgets
  w.api.open('wo', { title: 'Widget', component: w.content, anchor: 'top-right', width: 200, height: 160 })
})
await page.waitForSelector('[data-vdd-widget="wo"] #wo-fill')
await page.waitForTimeout(250)
const fillReport = () => page.evaluate(() => {
  const body = document.querySelector('[data-vdd-widget="wo"] .vdd-panel-float__body')
  const content = body?.firstElementChild
  const fill = document.querySelector('#wo-fill')
  return {
    bodyChildren: body?.children.length ?? -1,
    contentClass: content?.className ?? null,
    fillInContent: !!content && content.contains(fill),
    body: { w: body?.clientWidth ?? 0, h: body?.clientHeight ?? 0 },
    content: { w: content?.offsetWidth ?? 0, h: content?.offsetHeight ?? 0 },
    fill: { w: fill?.offsetWidth ?? 0, h: fill?.offsetHeight ?? 0 },
  }
})
const checkFill = (step, r) => {
  if (r.bodyChildren !== 1 || r.contentClass !== 'vdd-panel-float__content' || !r.fillInContent) {
    fail(step, `the body should hold exactly one .vdd-panel-float__content with the content inside: ${JSON.stringify(r)}`)
  }
  if (r.body.h <= 0) fail(step, 'the body has no height, so there is nothing to fill')
  for (const k of ['w', 'h']) {
    if (r.content[k] !== r.body[k]) fail(step, `the content element is ${r.content[k]}px on ${k}, the body ${r.body[k]}px`)
    if (r.fill[k] !== r.body[k]) fail(step, `height:100% content is ${r.fill[k]}px on ${k}, the body ${r.body[k]}px`)
  }
}
const fillFirst = await fillReport()
record.push({ step: 'managed content fills the body', ...fillFirst })
checkFill('content fill', fillFirst)

// Resize from the bottom edge, then measure again.
const woS = await boxOr('[data-vdd-widget="wo"] .vdd-resize-s', 'content fill after resize')
if (woS) {
  await page.mouse.move(woS.x + woS.width / 2, woS.y + woS.height / 2)
  await page.mouse.down()
  await page.mouse.move(woS.x + woS.width / 2, woS.y + woS.height / 2 + 60, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}
const fillResized = await fillReport()
record.push({ step: 'managed content fills the body after a resize', ...fillResized })
checkFill('content fill after resize', fillResized)
if (fillResized.body.h <= fillFirst.body.h) fail('content fill after resize', 'the widget did not grow, so the resize was not tested')

// State through a drag free and back onto the top-right corner.
await page.click('#wo-count')
await page.fill('#wo-text', 'kept')
await page.evaluate(() => { document.querySelector('[data-vdd-widget="wo"] .vdd-panel-float__content').__m2mark = true })
const woHeader = await boxOr('[data-vdd-widget="wo"] [data-vdd-widget-header]', 'content state')
const overlayBox = await boxOr('[data-vdd-panel-overlay]', 'content state')
if (woHeader && overlayBox) {
  const hx = woHeader.x + woHeader.width / 2
  const hy = woHeader.y + woHeader.height / 2
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  // The panel is narrow by now (the stretch check shrank it), so a short drag, kept inside it.
  await page.mouse.move(hx - 150, hy + 200, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const freed = await box('[data-vdd-widget="wo"]')
  if (!freed || Math.abs(freed.x - (woHeader.x - 150)) > 4 || Math.abs(freed.y - (woHeader.y + 200)) > 4) {
    fail('content state', `the drag free did not move the widget: ${JSON.stringify({ freed, header: woHeader })}`)
  }
  const freeState = await fillReport()
  checkFill('content fill when free', freeState)
  // And back: release over the top-right drop zone.
  const now = await box('[data-vdd-widget="wo"] [data-vdd-widget-header]')
  await page.mouse.move(now.x + now.width / 2, now.y + now.height / 2)
  await page.mouse.down()
  await page.mouse.move(overlayBox.x + overlayBox.width - 20, overlayBox.y + 20, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}
const kept = await page.evaluate(() => {
  const el = document.querySelector('[data-vdd-widget="wo"] .vdd-panel-float__content')
  const win = document.querySelector('[data-vdd-widget="wo"]')
  return {
    count: document.querySelector('#wo-count')?.textContent,
    text: document.querySelector('#wo-text')?.value,
    sameElement: el?.__m2mark === true,
    redocked: win?.style.insetInlineEnd !== '' && win?.style.left === '',
  }
})
record.push({ step: 'managed content keeps its state through a drag free and back', ...kept })
if (kept.count !== '1' || kept.text !== 'kept') fail('content state', `the content lost its state: ${JSON.stringify(kept)}`)
if (!kept.sameElement) fail('content state', 'the content element was replaced')
if (!kept.redocked) fail('content state', 'the widget did not dock back onto the corner')

// A press in the content brings the widget to the front.
const cardHeader = await boxOr('[data-vdd-widget="card"] [data-vdd-widget-header]', 'content focus')
if (cardHeader) await page.mouse.click(cardHeader.x + cardHeader.width / 2, cardHeader.y + cardHeader.height / 2)
await page.waitForTimeout(100)
const activeBefore = await page.evaluate(() => document.querySelector('[data-vdd-widget="wo"]').classList.contains('vdd-panel-float--active'))
const fillBox = await boxOr('#wo-fill', 'content focus')
if (fillBox) await page.mouse.click(fillBox.x + fillBox.width - 10, fillBox.y + fillBox.height - 10)
await page.waitForTimeout(100)
const activeAfter = await page.evaluate(() => document.querySelector('[data-vdd-widget="wo"]').classList.contains('vdd-panel-float--active'))
record.push({ step: 'a press in managed content raises the widget', activeBefore, activeAfter })
if (activeBefore) fail('content focus', 'the widget was already on top, so the press tested nothing')
if (!activeAfter) fail('content focus', 'a press in the content did not bring the widget to the front')
await page.evaluate(() => window.__overlay.widgets.api.close('wo'))

await page.screenshot({ path: `${OUT}/overlay.png` })

// ── 7.11 (M3): a managed widget out of its panel and back ──────────────────
// move() takes the widget's content element into a hosted panel ('ov/wo') docked beside the
// owner, tabbed in its group, or floating, and back into the panel. Through every move it must
// be the same element (a JS mark), keep its state (counter, field, a scroll offset) and its
// WebGL context, and fill the place that shows it: measured against the hosted panel's content
// box, not the slot, which would shrink to its content without its CSS and prove nothing.
const W = 'ov/wo'
const openWo = () => page.evaluate(() => {
  const w = window.__overlay.widgets
  w.api.open('wo', { title: 'Widget', component: w.content, anchor: 'top-right', width: 200, height: 160 })
})
const moveWo = async (to) => {
  const r = await page.evaluate(t => window.__overlay.widgets.api.move('wo', t), to)
  await page.waitForTimeout(300)
  return r
}
const woSnapshot = (hostedId) => page.evaluate((id) => {
  const el = document.querySelector('.vdd-panel-float__content')
  const parent = el?.parentElement
  const hostedBox = Array.from(document.querySelectorAll('[data-vdd-panel]')).find(e => e.getAttribute('data-vdd-panel') === id)
  const box = parent?.classList.contains('vdd-hosted-widget') ? hostedBox : parent
  const canvas = document.querySelector('#wo-gl')
  const gl = canvas?.__gl
  return {
    location: window.__overlay.widgets.api.location('wo'),
    same: el?.__m3mark === 'original',
    count: document.querySelector('#wo-count')?.textContent,
    text: document.querySelector('#wo-text')?.value,
    scroll: document.querySelector('#wo-scroll')?.scrollTop,
    glAlive: !!gl && canvas.getContext('webgl') === gl && !gl.isContextLost(),
    slot: parent?.classList.contains('vdd-hosted-widget') ? 'hosted'
      : parent?.classList.contains('vdd-panel-float__body') ? 'frame' : (parent?.className ?? null),
    frame: !!document.querySelector('[data-vdd-widget="wo"]'),
    fills: !!el && !!box && el.offsetWidth > 0 && el.offsetHeight > 0
      && el.offsetWidth === box.clientWidth && el.offsetHeight === box.clientHeight,
    size: el ? [el.offsetWidth, el.offsetHeight] : null,
    box: box ? [box.clientWidth, box.clientHeight] : null,
  }
}, hostedId)
const prepareWo = async () => {
  await openWo()
  await page.waitForSelector('[data-vdd-widget="wo"] #wo-gl')
  await page.waitForTimeout(200)
  await page.evaluate(() => {
    document.querySelector('.vdd-panel-float__content').__m3mark = 'original'
    const canvas = document.querySelector('#wo-gl')
    canvas.__gl = canvas.getContext('webgl')
    document.querySelector('#wo-scroll').scrollTop = 30
  })
  await page.click('#wo-count')
  await page.fill('#wo-text', 'typed')
  await page.waitForTimeout(100)
}
const woKept = { same: true, count: '1', text: 'typed', scroll: 30, glAlive: true, fills: true }
const expectWo = (step, got, want) => {
  record.push({ step, ...got })
  for (const [k, v] of Object.entries(want)) {
    if (got[k] !== v) fail(step, `${k} is ${JSON.stringify(got[k])}, expected ${JSON.stringify(v)}: ${JSON.stringify(got)}`)
  }
}

await prepareWo()
const glMade = await page.evaluate(() => !!document.querySelector('#wo-gl').__gl)
if (!glMade) fail('widget out', 'no WebGL context could be created, so its survival is not tested')
const journey = [
  [{ to: 'docked', position: 'bottom', size: 0.4 }, 'docked', 'hosted'],
  [{ to: 'tabbed' }, 'tabbed', 'hosted'],
  [{ to: 'floating', rect: { x: 80, y: 80, width: 320, height: 240 } }, 'floating', 'hosted'],
  [{ to: 'panel' }, 'panel', 'frame'],
  [{ to: 'floating' }, 'floating', 'hosted'],
]
for (const [to, where, slot] of journey) {
  const r = await moveWo(to)
  if (!r?.ok) fail('widget out', `move(${JSON.stringify(to)}) was refused: ${JSON.stringify(r)}`)
  expectWo(`widget out: ${JSON.stringify(to)}`, await woSnapshot(W), { ...woKept, location: where, slot, frame: slot === 'frame' })
}
// Minimised and restored by the user's workspace actions, then home.
await page.evaluate(id => window.__vdd.minimizePanel(id), W)
await page.waitForTimeout(300)
const minimized = await woSnapshot(W)
expectWo('widget out: minimised', minimized, { location: 'minimized', same: true })
await page.evaluate(id => window.__vdd.restorePanel(id), W)
await page.waitForTimeout(300)
expectWo('widget out: restored', await woSnapshot(W), { ...woKept, location: 'floating', slot: 'hosted' })
await moveWo({ to: 'panel' })
expectWo('widget out: home again', await woSnapshot(W), { ...woKept, location: 'panel', slot: 'frame', frame: true })

// The × on its tab closes the widget.
await moveWo({ to: 'tabbed' })
await page.click(`[data-vdd-tab="${W}"] .vdd-close-tab-x`)
await page.waitForTimeout(300)
const afterX = await page.evaluate(() => ({
  open: window.__overlay.widgets.api.isOpen('wo'),
  content: !!document.querySelector('.vdd-panel-float__content'),
}))
record.push({ step: 'widget out: the tab × closes it', ...afterX })
if (afterX.open || afterX.content) fail('widget out ×', `the tab's × did not close the widget: ${JSON.stringify(afterX)}`)

// The same under RTL.
await page.evaluate(() => window.__vdd.setDirection('rtl'))
await page.waitForTimeout(200)
await prepareWo()
await moveWo({ to: 'docked', position: 'bottom' })
expectWo('widget out (RTL): docked', await woSnapshot(W), { ...woKept, location: 'docked', slot: 'hosted' })
await moveWo({ to: 'panel' })
expectWo('widget out (RTL): home', await woSnapshot(W), { ...woKept, location: 'panel', slot: 'frame', frame: true })
await page.evaluate(() => window.__vdd.setDirection('ltr'))
await page.waitForTimeout(200)

// ── 7.11 (M4, M5): the widget's own menu, and the move callbacks ─────────
// The title icon of a widget with a titleMenu is a button: a press on it never starts the
// header's drag, and its click must not reach the context menu's window-click dismissal (jsdom
// can't show either: no pointer capture, no real click sequence). Out of the panel the hosted
// tab's icon and the floating title bar's icon open the same menus, and never drag either.
// onWillMove must see the element at its old size, onMoved at its new one.
await page.evaluate(() => window.__overlay.widgets.api.close('wo'))
await page.waitForTimeout(200)
await page.evaluate(() => {
  const w = window.__overlay.widgets
  w.calls = []
  w.api.open('wo', {
    title: 'Widget', component: w.content, icon: w.icon, anchor: 'top-right', width: 200, height: 160,
    canDock: true, canFloat: true,
    titleMenu: m => m.location === 'panel'
      ? [{ label: 'Dock below', action: () => m.move({ to: 'docked', position: 'bottom', size: 0.4 }) },
         { label: 'Float it', action: () => m.move({ to: 'floating' }) }]
      : [{ label: 'Back into the panel', action: () => m.move({ to: 'panel' }) }],
  })
})
await page.waitForSelector('[data-vdd-widget="wo"] button.vdd-panel-float__menu')
await page.waitForTimeout(200)
const menuLabels = () => page.evaluate(() => {
  const m = document.querySelector('.vdd-context-menu:not(.vdd-context-menu--submenu)')
  return m ? Array.from(m.children).map(c => c.tagName === 'HR' ? '---' : c.querySelector('.vdd-context-menu__label')?.textContent ?? '?') : null
})
const centre = b => [b.x + b.width / 2, b.y + b.height / 2]
const pressAndDrag = async (sel) => {
  const b = await box(sel)
  if (!b) return false
  const [x, y] = centre(b)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 90, y + 70, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  return true
}
const woSize = () => page.evaluate(() => {
  const el = document.querySelector('.vdd-panel-float__content')
  return [el?.offsetWidth ?? 0, el?.offsetHeight ?? 0]
})
const takeCalls = () => page.evaluate(() => { const c = window.__overlay.widgets.calls; window.__overlay.widgets.calls = []; return c })
const woLoc = () => page.evaluate(() => document.querySelector('#wo-loc')?.textContent)
const MENU_BTN = '[data-vdd-widget="wo"] button.vdd-panel-float__menu'

// In the panel: a drag from the button moves nothing.
const frameBefore = await box('[data-vdd-widget="wo"]')
if (!await pressAndDrag(MENU_BTN)) fail('title menu', 'the title icon is not a button')
const frameAfterDrag = await box('[data-vdd-widget="wo"]')
record.push({ step: 'title menu: a drag from the title icon', frameBefore, frameAfterDrag })
if (!frameBefore || !frameAfterDrag || !near(frameBefore.x, frameAfterDrag.x) || !near(frameBefore.y, frameAfterDrag.y)) {
  fail('title menu', `a drag from the title icon moved the widget: ${JSON.stringify({ frameBefore, frameAfterDrag })}`)
}
// A click opens the app's items, and the menu stays open after the click.
const btn = await box(MENU_BTN)
await page.mouse.click(...centre(btn))
await page.waitForTimeout(200)
const inPanelMenu = await menuLabels()
const frameAfterClick = await box('[data-vdd-widget="wo"]')
record.push({ step: 'title menu: a click on the title icon', inPanelMenu })
if (JSON.stringify(inPanelMenu) !== JSON.stringify(['Dock below', 'Float it'])) {
  fail('title menu', `the click did not leave the widget's menu open: ${JSON.stringify(inPanelMenu)}`)
}
if (!frameAfterClick || !near(frameBefore.x, frameAfterClick.x) || !near(frameBefore.y, frameAfterClick.y)) {
  fail('title menu', 'the click moved the widget')
}
// An item moves it out: onWillMove sees the in-panel size, onMoved the docked one.
const sizeInPanel = await woSize()
await takeCalls()
await page.click('[data-vdd-menu-item="Dock below"]')
await page.waitForTimeout(400)
const docked = { location: await page.evaluate(() => window.__overlay.widgets.api.location('wo')), loc: await woLoc(), size: await woSize(), calls: await takeCalls() }
record.push({ step: 'title menu: an item moves it out; the callbacks around it', sizeInPanel, ...docked })
if (docked.location !== 'docked' || docked.loc !== 'docked') fail('title menu', `the item did not dock the widget: ${JSON.stringify(docked)}`)
const callsOk = (step, calls, before, after) => {
  const kinds = (calls ?? []).map(c => c.kind).join(',')
  if (kinds !== 'will,moved') { fail(step, `expected one onWillMove then one onMoved, got ${kinds}: ${JSON.stringify(calls)}`); return }
  if (JSON.stringify(before) === JSON.stringify(after)) fail(step, `the sizes before and after are the same (${before}), so this tests nothing`)
  if (JSON.stringify(calls[0].size) !== JSON.stringify(before)) fail(step, `onWillMove saw ${calls[0].size}, the element was ${before} before the move`)
  if (JSON.stringify(calls[1].size) !== JSON.stringify(after)) fail(step, `onMoved saw ${calls[1].size}, the element is ${after} after the move`)
}
callsOk('move callbacks: panel to docked', docked.calls, sizeInPanel, docked.size)

// Out of the panel, in the grid: a drag from the hosted tab's icon moves nothing; a click opens its menu.
const TAB_ICON = `[data-vdd-tab="${W}"] .vdd-workspace-tab-icon--menu`
const gridBefore = await page.evaluate(() => JSON.stringify(window.__vdd.state.gridRoot))
if (!await pressAndDrag(TAB_ICON)) fail('tab icon', 'the hosted tab has no menu icon')
const gridAfter = await page.evaluate(id => ({ grid: JSON.stringify(window.__vdd.state.gridRoot), state: window.__vdd.state.panels[id]?.state }), W)
record.push({ step: 'tab icon: a drag from it', moved: gridAfter.grid !== gridBefore, state: gridAfter.state })
if (gridAfter.grid !== gridBefore || gridAfter.state !== 'docked') fail('tab icon', 'a drag from the hosted tab\'s icon moved the panel')
const tabIcon = await box(TAB_ICON)
if (tabIcon) await page.mouse.click(...centre(tabIcon))
await page.waitForTimeout(200)
const tabMenu = await menuLabels()
record.push({ step: 'tab icon: a click on it', tabMenu })
if (JSON.stringify(tabMenu) !== JSON.stringify(['Back into the panel', '---', 'Minimize Panel', '---', 'Close Tab'])) {
  fail('tab icon', `the hosted tab's icon did not open its menu: ${JSON.stringify(tabMenu)}`)
}
await page.keyboard.press('Escape')
await page.waitForTimeout(100)

// Floating: the title bar's icon likewise.
const sizeDocked = await woSize()
await takeCalls()
await moveWo({ to: 'floating', rect: { x: 60, y: 60, width: 300, height: 220 } })
const floatCalls = await takeCalls()
const sizeFloating = await woSize()
callsOk('move callbacks: docked to floating', floatCalls, sizeDocked, sizeFloating)
const TITLE_ICON = `[data-vdd-window="${W}"] .vdd-window-title-icon--menu`
const winBefore = await page.evaluate(id => JSON.stringify(window.__vdd.state.floating.find(f => f.id === id)), W)
if (!await pressAndDrag(TITLE_ICON)) fail('title-bar icon', 'the floating title bar has no menu icon')
const winAfter = await page.evaluate(id => JSON.stringify(window.__vdd.state.floating.find(f => f.id === id)), W)
record.push({ step: 'title-bar icon: a drag from it', before: winBefore, after: winAfter })
if (winAfter !== winBefore) fail('title-bar icon', `a drag from the title-bar icon moved the window: ${winBefore} → ${winAfter}`)
const titleIcon = await box(TITLE_ICON)
if (titleIcon) await page.mouse.click(...centre(titleIcon))
await page.waitForTimeout(200)
const winMenu = await menuLabels()
record.push({ step: 'title-bar icon: a click on it', winMenu })
if (JSON.stringify(winMenu) !== JSON.stringify(['Back into the panel', '---', 'Close Panel'])) {
  fail('title-bar icon', `the floating title-bar icon did not open the ⋮ menu: ${JSON.stringify(winMenu)}`)
}
// Its item brings it home: the callbacks see the floating size, then the in-panel one.
await page.click('[data-vdd-menu-item="Back into the panel"]')
await page.waitForTimeout(400)
const home = { location: await page.evaluate(() => window.__overlay.widgets.api.location('wo')), loc: await woLoc(), size: await woSize(), calls: await takeCalls() }
record.push({ step: 'title-bar icon: back into the panel', ...home })
if (home.location !== 'panel' || home.loc !== 'panel') fail('title-bar icon', `the item did not bring it home: ${JSON.stringify(home)}`)
callsOk('move callbacks: floating to panel', home.calls, sizeFloating, home.size)

// Minimised and restored by the user: onMoved after the restore sees the element's restored size.
await moveWo({ to: 'docked', position: 'bottom', size: 0.4 })
const sizeOut = await woSize()
await takeCalls()
await page.evaluate(id => window.__vdd.minimizePanel(id), W)
await page.waitForTimeout(400)
const minCalls = await takeCalls()
await page.evaluate(id => window.__vdd.restorePanel(id), W)
await page.waitForTimeout(400)
const restored = { size: await woSize(), calls: await takeCalls() }
record.push({ step: 'move callbacks: minimised and restored', sizeOut, minCalls, ...restored })
if ((minCalls ?? []).map(c => c.kind).join(',') !== 'will,moved') fail('move callbacks: minimise', `expected will,moved: ${JSON.stringify(minCalls)}`)
callsOk('move callbacks: restored', restored.calls, [0, 0], restored.size)
if (restored.size[0] === 0) fail('move callbacks: restored', 'the restored element has no size')
await moveWo({ to: 'panel' })
await takeCalls()

// From the keyboard, the in-panel menu opens on its first item.
await page.focus(MENU_BTN)
await page.keyboard.press('Enter')
await page.waitForTimeout(200)
const kbd = await page.evaluate(() => ({
  open: !!document.querySelector('.vdd-context-menu'),
  focused: document.activeElement?.getAttribute('data-vdd-menu-item') ?? document.activeElement?.className ?? null,
}))
record.push({ step: 'title menu: opened from the keyboard', ...kbd })
if (!kbd.open || kbd.focused !== 'Dock below') fail('title menu keyboard', `the keyboard-opened menu should focus its first item: ${JSON.stringify(kbd)}`)
await page.keyboard.press('Escape')
await page.waitForTimeout(100)

// ── 7.11 (M6): a managed widget's placement ─────────────────────────────────
// placement() is JSON to save; open(id, { placement }) puts it back. A free position the user
// dragged comes back where it was; saved while its panel is a background tab (0×0) it waits and
// is placed when the panel is shown; out of the panel, it docks again. Grab the header by its
// middle: its start is the title-menu button, which never drags.
const api = (fn, ...args) => page.evaluate(([f, a]) => {
  const w = window.__overlay.widgets
  return new Function('w', 'a', `return (${f})(w, a)`)(w, a)
}, [fn.toString(), args])
const openWoAt = (placement) => api((w, [p]) => {
  w.api.open('wo', { title: 'Widget', component: w.content, anchor: 'top-right', width: 200, height: 160, ...(p ? { placement: p } : {}) })
}, placement)
const closeWo = async () => { await api(w => w.api.close('wo')); await page.waitForTimeout(150) }
await closeWo()
await openWoAt(null)
await page.waitForSelector('[data-vdd-widget="wo"] [data-vdd-widget-header]')
await page.waitForTimeout(200)
const ph = await boxOr('[data-vdd-widget="wo"] [data-vdd-widget-header]', 'placement')
await page.mouse.move(ph.x + ph.width / 2, ph.y + ph.height / 2)
await page.mouse.down()
await page.mouse.move(ph.x + ph.width / 2 - 90, ph.y + ph.height / 2 + 130, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(250)
const dragged = await box('[data-vdd-widget="wo"]')
const freeSaved = await api(w => w.api.placement('wo'))
record.push({ step: 'placement: dragged free', dragged, freeSaved })
if (freeSaved?.mode !== 'free' || !freeSaved?.offset) fail('placement', `a drag did not leave a free position: ${JSON.stringify(freeSaved)}`)
await closeWo()
await openWoAt(freeSaved)
await page.waitForTimeout(250)
const reopened = await box('[data-vdd-widget="wo"]')
record.push({ step: 'placement: closed and re-opened at it', reopened })
if (!reopened || !near(reopened.x, dragged.x) || !near(reopened.y, dragged.y)) {
  fail('placement', `re-opened at its placement, the widget is not where it was dragged: ${JSON.stringify({ dragged, reopened })}`)
}

// While its panel is a background tab (the overlay measures 0×0): kept, then placed when shown.
await page.evaluate(() => window.__vdd.openPanel('bg', 'hostile', { dockTo: { panel: 'ov', position: 'center' } }))
await page.waitForTimeout(250)
await closeWo()
await openWoAt(freeSaved)
await page.waitForTimeout(250)
const hidden = await page.evaluate(() => ({
  root: document.querySelector('[data-vdd-panel="ov"] [data-vdd-panel-overlay]')?.clientWidth ?? null,
  active: window.__vdd.state.activePanelId,
}))
const whileHidden = await api(w => w.api.placement('wo'))
record.push({ step: 'placement: restored into a background tab', hidden, whileHidden })
if (hidden.root !== 0) fail('placement background', `the owner panel was not hidden, so this tests nothing: ${JSON.stringify(hidden)}`)
if (JSON.stringify(whileHidden) !== JSON.stringify(freeSaved)) fail('placement background', `placement() changed while waiting: ${JSON.stringify(whileHidden)}`)
await page.evaluate(() => window.__vdd.focusPanel('ov'))
await page.waitForTimeout(350)
const shown = await box('[data-vdd-widget="wo"]')
record.push({ step: 'placement: its panel shown', shown })
if (!shown || !near(shown.x, dragged.x) || !near(shown.y, dragged.y)) {
  fail('placement background', `shown again, the widget is not at its placement: ${JSON.stringify({ dragged, shown })}`)
}
await page.evaluate(() => window.__vdd.closePanel('bg'))
await page.waitForTimeout(200)

// Out of the panel: closed and re-opened at its placement, it docks again.
await moveWo({ to: 'docked', position: 'bottom', size: 0.35 })
const outSaved = await api(w => w.api.placement('wo'))
await closeWo()
await openWoAt(outSaved)
await page.waitForTimeout(300)
const redocked = await page.evaluate(id => ({
  location: window.__overlay.widgets.api.location('wo'),
  hosted: window.__vdd.state.panels[id]?.state ?? null,
  inGrid: !!document.querySelector(`[data-vdd-leaf] [data-vdd-panel="${id}"] .vdd-panel-float__content`),
}), W)
record.push({ step: 'placement: out of the panel, re-opened', outSaved, ...redocked })
if (outSaved?.at !== 'docked' || outSaved?.position !== 'bottom') fail('placement out', `placement() out of the panel: ${JSON.stringify(outSaved)}`)
if (redocked.location !== 'docked' || redocked.hosted !== 'docked' || !redocked.inGrid) fail('placement out', `re-opened, it did not dock again: ${JSON.stringify(redocked)}`)
await moveWo({ to: 'panel' })
await page.waitForTimeout(150)

// ── 7.11 (M7): preserveEmbeds ───────────────────────────────────────────────
// A real iframe counts its loads: one re-inserted reloads (load fires again, and the document,
// with a mark set in it, is a new one). A panel type with preserveEmbeds keeps its iframe
// through dock moves, the one without reloads; a widget with it keeps its iframe out of the
// panel, between places and back. Needs moveBefore(), which this Chrome must have.
const hasMoveBefore = await page.evaluate(() => typeof Element.prototype.moveBefore === 'function')
record.push({ step: 'preserveEmbeds: the browser has moveBefore', hasMoveBefore })
if (!hasMoveBefore) fail('preserveEmbeds', 'this Chrome has no Element.prototype.moveBefore, so nothing here can pass')
const embeds = (names) => page.evaluate((ns) => Object.fromEntries(ns.map(n => {
  const f = document.querySelector(`iframe[data-embed="${n}"]`)
  return [n, { loads: window.__embedLoads?.[n] ?? 0, marked: f?.contentWindow?.__mark === n, connected: !!f?.isConnected }]
})), names)
const markEmbeds = (names) => page.evaluate((ns) => {
  for (const n of ns) { const f = document.querySelector(`iframe[data-embed="${n}"]`); if (f?.contentWindow) f.contentWindow.__mark = n }
}, names)
await page.evaluate(() => {
  window.__vdd.openPanel('ek', 'embedKept', { props: { name: 'kept' }, dockTo: { panel: 'ov', position: 'right' } })
  window.__vdd.openPanel('eb', 'embedBare', { props: { name: 'bare' }, dockTo: { panel: 'ov', position: 'bottom' } })
})
await page.waitForTimeout(500)
await markEmbeds(['kept', 'bare'])
const embedFirst = await embeds(['kept', 'bare'])
for (const [step, fn] of [
  ['to the workspace edge', () => { window.__vdd.dockPanelToWorkspaceEdge('ek', 'left'); window.__vdd.dockPanelToWorkspaceEdge('eb', 'top') }],
  ['floated', () => { window.__vdd.floatPanel('ek'); window.__vdd.floatPanel('eb') }],
  ['docked again', () => { window.__vdd.dockPanel('ek'); window.__vdd.dockPanel('eb') }],
  ['minimised and restored', () => { window.__vdd.minimizePanel('ek'); window.__vdd.restorePanel('ek'); window.__vdd.minimizePanel('eb'); window.__vdd.restorePanel('eb') }],
]) {
  await page.evaluate(`(${fn.toString()})()`)
  await page.waitForTimeout(400)
  record.push({ step: `preserveEmbeds: panel types, ${step}`, ...(await embeds(['kept', 'bare'])) })
}
const embedAfter = await embeds(['kept', 'bare'])
record.push({ step: 'preserveEmbeds: panel types through dock moves', embedFirst, embedAfter })
if (embedFirst.kept.loads !== 1 || embedFirst.bare.loads !== 1) fail('preserveEmbeds panel', `the iframes did not load once to begin with: ${JSON.stringify(embedFirst)}`)
if (embedAfter.kept.loads !== 1 || !embedAfter.kept.marked) fail('preserveEmbeds panel', `the preserveEmbeds panel's iframe reloaded: ${JSON.stringify(embedAfter.kept)}`)
if (embedAfter.bare.loads <= 1 || embedAfter.bare.marked) fail('preserveEmbeds panel', `the control panel's iframe did not reload, so the harness can't see a reload: ${JSON.stringify(embedAfter.bare)}`)
await page.evaluate(() => { window.__vdd.closePanel('ek'); window.__vdd.closePanel('eb') })
await page.waitForTimeout(250)

const openEmbedWidget = (id, name, keep) => api((w, [i, n, k]) => {
  w.api.open(i, { title: n, component: w.embed, props: { name: n }, anchor: 'bottom-left', width: 220, height: 140, preserveEmbeds: k })
}, id, name, keep)
const moveEmbed = async (id, to) => {
  const r = await api((w, [i, t]) => w.api.move(i, t), id, to)
  await page.waitForTimeout(400)
  if (!r?.ok) fail('preserveEmbeds widget', `move(${id}, ${JSON.stringify(to)}) was refused: ${JSON.stringify(r)}`)
}
await openEmbedWidget('emk', 'wkept', true)
await openEmbedWidget('emb', 'wbare', false)
await page.waitForTimeout(500)
await markEmbeds(['wkept', 'wbare'])
for (const to of [
  { to: 'docked', position: 'bottom', size: 0.35 }, { to: 'floating', rect: { x: 40, y: 40, width: 300, height: 200 } },
  { to: 'tabbed' }, { to: 'docked', position: 'right' }, { to: 'panel' },
]) await moveEmbed('emk', to)
await moveEmbed('emb', { to: 'docked', position: 'bottom' })
await moveEmbed('emb', { to: 'panel' })
const widgetEmbeds = await embeds(['wkept', 'wbare'])
const homeAgain = await page.evaluate(() => !!document.querySelector('[data-vdd-widget="emk"] iframe[data-embed="wkept"]'))
record.push({ step: 'preserveEmbeds: a widget out of the panel, between places and back', widgetEmbeds, homeAgain })
if (widgetEmbeds.wkept.loads !== 1 || !widgetEmbeds.wkept.marked) fail('preserveEmbeds widget', `the preserveEmbeds widget's iframe reloaded: ${JSON.stringify(widgetEmbeds.wkept)}`)
if (!homeAgain) fail('preserveEmbeds widget', 'the widget is not back in its frame')
if (widgetEmbeds.wbare.loads <= 1) fail('preserveEmbeds widget', `the control widget's iframe did not reload, so the harness can't see a reload: ${JSON.stringify(widgetEmbeds.wbare)}`)
await api(w => { w.api.close('emk'); w.api.close('emb') })
await page.waitForTimeout(200)

// The owner closing removes its hosted panel, and the widget with it. Last: it closes 'ov'.
await moveWo({ to: 'docked', position: 'left' })
const ownerOut = await page.evaluate(id => id in window.__vdd.state.panels, W)
await page.evaluate(() => window.__vdd.closePanel('ov'))
await page.waitForTimeout(300)
const afterOwner = await page.evaluate(id => ({
  hosted: id in window.__vdd.state.panels,
  content: !!document.querySelector('.vdd-panel-float__content'),
  stores: document.querySelectorAll('.vdd-widget-store').length,
}), W)
record.push({ step: 'widget out: the owner closing removes it', ownerOut, ...afterOwner })
if (!ownerOut) fail('widget out owner', 'the widget was not out before the owner closed, so this tested nothing')
if (afterOwner.hosted || afterOwner.content || afterOwner.stores) {
  fail('widget out owner', `the owner closed but its widget remains: ${JSON.stringify(afterOwner)}`)
}
const passed = failures.length === 0
writeFileSync(`${OUT}/browser.json`, JSON.stringify({ passed, failures, record }, null, 2) + '\n')

console.log('M11 browser gate')
for (const r of record) console.log('  ' + JSON.stringify(r))
if (!passed) { console.log('FAILURES:'); failures.forEach(f => console.log('   ' + f)) }
console.log(passed ? 'M11 BROWSER: PASS' : 'M11 BROWSER: FAIL')
await browser.close()
process.exit(passed ? 0 : 1)
