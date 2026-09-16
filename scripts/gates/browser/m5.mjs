/**
 * M5 browser gate — floating windows, measured.
 *
 * Every assertion here needs real layout, so none of it can live in jsdom: drag moves a
 * window by exactly the pointer delta, each of the eight handles resizes the edge under the
 * cursor, maximise fills the workspace, anchored windows stack by their own heights, and a
 * window's panel keeps its state through all of it.
 *
 * Also covers the two rdd defects that are only visible on screen: a floated panel must
 * render focused chrome (D2), and a maximized window must actually lose its rounded corners
 * and shadow (D9) — rdd's rule never matched the class its component rendered.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'http://localhost:5188/'
const OUT = 'artifacts/M5'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (step, msg) => failures.push(`[${step}] ${msg}`)
const near = (a, b, tol = 6) => Math.abs(a - b) <= tol

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage()
page.on('pageerror', e => fail('pageerror', e.message))
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fail('console', m.text())
})

await page.goto(APP, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__vdd, null, { timeout: 15000 })
await page.waitForTimeout(250)

const box = (sel) => page.locator(sel).boundingBox()
const drag = async (from, to, steps = 12) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
  await page.waitForTimeout(180)
}
const record = []

// ── drag moves the window by exactly the pointer delta ─────────────────────
await page.evaluate(() => {
  window.__vdd.openPanel('a', 'hostile')
  window.__vdd.floatPanel('a', { x: 80, y: 80, width: 420, height: 300 })
})
await page.waitForSelector('[data-vdd-window="a"]')
await page.waitForTimeout(500)

// State that must survive every gesture below.
await page.evaluate(() => {
  document.querySelector('[data-scroller="a"]').scrollTop = 200
})

const before = await box('[data-vdd-window="a"]')
const bar = await box('[data-vdd-titlebar="a"]')
await drag({ x: bar.x + 100, y: bar.y + bar.height / 2 }, { x: bar.x + 100 + 180, y: bar.y + bar.height / 2 + 120 })
const afterDrag = await box('[data-vdd-window="a"]')
record.push({ step: 'drag', dx: Math.round(afterDrag.x - before.x), dy: Math.round(afterDrag.y - before.y) })
if (!near(afterDrag.x - before.x, 180)) fail('drag', `moved ${Math.round(afterDrag.x - before.x)}px horizontally, expected 180`)
if (!near(afterDrag.y - before.y, 120)) fail('drag', `moved ${Math.round(afterDrag.y - before.y)}px vertically, expected 120`)
if (!near(afterDrag.width, before.width)) fail('drag', 'dragging changed the width')

// ── every handle resizes the edge under the cursor ─────────────────────────
// Grabbed two pixels inside the element's own edge: the outer half of a handle sits outside
// the window box, and hit-testing exactly on the border is ambiguous.
const cases = [
  ['e', { dx: 90, dy: 0 }, { w: +90, h: 0, x: 0, y: 0 }],
  ['s', { dx: 0, dy: 70 }, { w: 0, h: +70, x: 0, y: 0 }],
  ['w', { dx: -60, dy: 0 }, { w: +60, h: 0, x: -60, y: 0 }],
  ['n', { dx: 0, dy: -50 }, { w: 0, h: +50, x: 0, y: -50 }],
  ['se', { dx: 40, dy: 40 }, { w: +40, h: +40, x: 0, y: 0 }],
  ['nw', { dx: -30, dy: -30 }, { w: +30, h: +30, x: -30, y: -30 }],
]
for (const [dir, delta, expected] of cases) {
  await page.evaluate(() => { window.__vdd.updateFloatingPosition('a', { x: 300, y: 250, width: 420, height: 320 }) })
  await page.waitForTimeout(140)
  const start = await box('[data-vdd-window="a"]')
  const h = await box(`[data-vdd-handle="a:${dir}"]`)
  if (!h) { fail(`resize ${dir}`, 'handle not found'); continue }
  // Grab the middle of the handle's own box. Handles are fully inside the window (see the
  // note in index.css), so the centre is always live — and for a corner it also clears the
  // window's border-radius, where nothing is hit at all.
  const grab = { x: h.x + h.width / 2, y: h.y + h.height / 2 }
  await drag(grab, { x: grab.x + delta.dx, y: grab.y + delta.dy })
  const end = await box('[data-vdd-window="a"]')
  const got = {
    w: Math.round(end.width - start.width), h: Math.round(end.height - start.height),
    x: Math.round(end.x - start.x), y: Math.round(end.y - start.y),
  }
  record.push({ step: `resize ${dir}`, ...got })
  for (const key of ['w', 'h', 'x', 'y']) {
    if (!near(got[key], expected[key], 8)) {
      fail(`resize ${dir}`, `${key} changed by ${got[key]}, expected ${expected[key]}`)
    }
  }
}

// ── maximise fills the workspace, and squares the window off (D9) ──────────
await page.evaluate(() => { window.__vdd.maximizePanel('a') })
// Long enough for the box-shadow transition to finish: mid-flight, the computed value is an
// interpolated near-zero rather than the literal `none`, which is not what is being asked.
await page.waitForTimeout(700)
const viewport = await box('.vdd-workspace-viewport')
const maxed = await box('[data-vdd-window="a"]')
if (!near(maxed.width, viewport.width, 2) || !near(maxed.height, viewport.height, 2)) {
  fail('maximize', `window is ${Math.round(maxed.width)}x${Math.round(maxed.height)}, workspace is ${Math.round(viewport.width)}x${Math.round(viewport.height)}`)
}
const squared = await page.evaluate(() => {
  const el = document.querySelector('[data-vdd-window="a"]')
  const cs = getComputedStyle(el)
  return { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, border: cs.borderTopWidth }
})
record.push({ step: 'maximize', ...squared })
if (squared.radius !== '0px') fail('maximize', `rounded corners remain (${squared.radius}) — the D9 rule is not matching`)
const shadowVisible = squared.shadow !== 'none' &&
  !/^(?:rgba\(\d+,\s*\d+,\s*\d+,\s*0\)[^,]*,?\s*)+$/.test(squared.shadow)
if (shadowVisible) fail('maximize', `drop shadow remains (${squared.shadow})`)
if (squared.border !== '0px') fail('maximize', `border remains (${squared.border})`)
if ((await page.locator('[data-vdd-handle]').count()) !== 0) fail('maximize', 'resize handles are still live while maximized')

await page.evaluate(() => { window.__vdd.maximizePanel('a') })
await page.waitForTimeout(200)

// ── anchored windows stack by their own heights, mirrored under RTL ─────────
for (const dir of ['ltr', 'rtl']) {
  await page.evaluate((d) => {
    const ws = window.__vdd
    ws.setDirection(d)
    ws.updateFloatingPosition('a', { anchor: 'top-right', width: 260, height: 140 })
    ws.openPanel('s2', 'hostile', { initialTarget: 'floating', anchor: 'top-right' })
    ws.updateFloatingPosition('s2', { width: 260, height: 120 })
  }, dir)
  await page.waitForTimeout(300)
  const view = await box('.vdd-workspace-viewport')
  const first = await box('[data-vdd-window="a"]')
  const second = await box('[data-vdd-window="s2"]')
  const gap = Math.round(second.y - (first.y + first.height))
  record.push({ step: `anchor stack ${dir}`, gap, firstTop: Math.round(first.y - view.y) })
  if (!near(first.y - view.y, 8, 3)) fail(`anchor ${dir}`, `first window inset ${Math.round(first.y - view.y)}px from the top, expected 8`)
  if (!near(gap, 8, 3)) fail(`anchor ${dir}`, `gap between stacked windows is ${gap}px, expected 8`)
  // Anchored to the inline END: physically right under LTR, left under RTL, with no stored
  // physical coordinate — the anchor is logical and `dir` does the mirroring.
  const rightInset = Math.round((view.x + view.width) - (first.x + first.width))
  const leftInset = Math.round(first.x - view.x)
  if (dir === 'ltr' && !near(rightInset, 8, 3)) fail('anchor ltr', `expected 8px from the right, got ${rightInset}`)
  if (dir === 'rtl' && !near(leftInset, 8, 3)) fail('anchor rtl', `expected 8px from the left under RTL, got ${leftInset}`)
  await page.evaluate(() => { window.__vdd.closePanel('s2'); window.__vdd.setDirection('ltr') })
  await page.waitForTimeout(150)
}

// ── a floated panel renders focused chrome (D2) ─────────────────────────────
await page.evaluate(() => {
  const ws = window.__vdd
  ws.openPanel('docked', 'hostile')
  ws.focusPanel('a')
  ws.floatPanel('docked')                 // a placement action: must resolve the active panel
})
await page.waitForTimeout(250)
const focus = await page.evaluate(() => ({
  active: window.__vdd.state.activePanelId,
  focusedWindows: [...document.querySelectorAll('.vdd-floating-window.vdd-window-focused')]
    .map(el => el.getAttribute('data-vdd-window')),
}))
record.push({ step: 'D2 focus', ...focus })
if (focus.active !== 'docked') fail('D2', `activePanelId is ${focus.active} after floating "docked"`)
if (focus.focusedWindows.length !== 1 || focus.focusedWindows[0] !== 'docked') {
  fail('D2', `focused chrome is on ${JSON.stringify(focus.focusedWindows)}, expected ["docked"]`)
}

// ── the panel survived all of it ────────────────────────────────────────────
const survived = await page.evaluate(() => ({
  mounts: window.__mounts?.a ?? 0,
  unmounts: window.__unmounts?.a ?? 0,
  glLost: window.__gl?.a?.isContextLost?.() ?? null,
  scrollTop: document.querySelector('[data-scroller="a"]')?.scrollTop ?? null,
}))
record.push({ step: 'survival', ...survived })
if (survived.mounts !== 1) fail('survival', `panel "a" was created ${survived.mounts} times`)
if (survived.unmounts !== 0) fail('survival', `panel "a" unmounted ${survived.unmounts} times`)
if (survived.glLost !== false) fail('survival', 'WebGL context lost during floating-window work')
if (survived.scrollTop !== 200) fail('survival', `scroll is ${survived.scrollTop}, expected 200`)

await page.screenshot({ path: `${OUT}/floating.png` })
const passed = failures.length === 0
writeFileSync(`${OUT}/browser.json`, JSON.stringify({ passed, failures, record }, null, 2) + '\n')

console.log('M5 browser gate')
for (const r of record) console.log('  ' + JSON.stringify(r))
if (!passed) { console.log('FAILURES:'); failures.forEach(f => console.log('   ' + f)) }
console.log(passed ? 'M5 BROWSER: PASS' : 'M5 BROWSER: FAIL')
await browser.close()
process.exit(passed ? 0 : 1)
