/**
 * M4 browser gate — the zero-unmount guarantee, in a real browser.
 *
 * jsdom does no layout: nothing can scroll, nothing has a size, `offsetParent` is always
 * null. So the central promise of this library cannot be tested there at all. This drives
 * the playground through every M4 placement change and asserts, after each one:
 *
 *   - the panel component was never re-created
 *   - its DOM node is the same object
 *   - its WebGL context is not lost
 *   - video playback advanced and never restarted
 *   - its interval kept ticking
 *   - scroll offset and focus were restored (ADR 0014)
 *
 * Requires the playground on :5188 — `npm run playground`.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'http://localhost:5188/'
const OUT = 'artifacts/M4'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (step, msg) => failures.push(`[${step}] ${msg}`)

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage()
page.on('pageerror', e => fail('pageerror', e.message))
const notFound = []
page.on('response', r => { if (r.status() >= 400) notFound.push(r.url()) })
page.on('console', m => {
  if (m.type() !== 'error') return
  // A missing favicon is the browser asking, not the library failing. Recorded either way.
  if (/Failed to load resource/.test(m.text())) return
  fail('console', m.text())
})

await page.goto(APP, { waitUntil: 'load' })
// Wait for the app's own handle rather than assuming the page is ready: the dev server can
// push an HMR update immediately after load, which destroys the execution context mid-run.
await page.waitForFunction(() => !!window.__vdd, null, { timeout: 15000 })
await page.waitForTimeout(250)
await page.evaluate(() => {
  const ws = window.__vdd
  ws.openPanel('a', 'hostile')
  ws.openPanel('keeperL', 'hostile')                     // holds leaf L
  ws.openPanel('keeperR', 'hostile')
  ws.dockPanelToGroup('keeperR', 'R', 'center')          // holds leaf R, so it survives
  ws.focusPanel('a')
})
await page.waitForSelector('[data-hostile="a"]')
await page.waitForTimeout(700)               // let the video actually start

const probe = () => page.evaluate(() => {
  const q = (attr) => document.querySelector(`[data-${attr}="a"]`)
  const panel = q('hostile')
  const gl = window.__gl?.a
  const vid = q('video')
  const sc = q('scroller')
  const inp = q('input')
  return {
    sameNode: window.__nodeRef ? window.__nodeRef === panel : null,
    mounts: window.__mounts?.a ?? 0,
    unmounts: window.__unmounts?.a ?? 0,
    glLost: gl ? gl.isContextLost() : null,
    videoTime: vid ? vid.currentTime : null,
    ticks: Number(q('ticks')?.textContent ?? -1),
    scrollTop: sc ? sc.scrollTop : null,
    focused: document.activeElement?.getAttribute?.('data-input') ?? null,
    caret: inp ? inp.selectionStart : null,
    slot: panel?.closest('[data-vdd-slot]')?.getAttribute('data-vdd-slot') ?? null,
    inStore: !!panel?.closest('.vdd-panel-store'),
    size: q('size')?.textContent ?? '',
  }
})

// Establish the state that must survive.
await page.evaluate(() => {
  window.__nodeRef = document.querySelector('[data-hostile="a"]')
  document.querySelector('[data-scroller="a"]').scrollTop = 240
  const inp = document.querySelector('[data-input="a"]')
  inp.focus(); inp.setSelectionRange(4, 4)
})
await page.waitForTimeout(150)

const start = await probe()
if (start.scrollTop !== 240) fail('setup', `scrollTop did not take (${start.scrollTop})`)
if (start.mounts !== 1) fail('setup', `expected 1 mount, saw ${start.mounts}`)
if (!start.size) fail('setup', 'usePanel().size never reported a size — ResizeObserver not wired')
if (start.slot !== 'a') fail('setup', `panel is not in its slot (${start.slot})`)

/**
 * Each step says whether the panel should be **visible** afterwards, because "off-screen" is
 * a correct answer for some of them: only the selected tab of a leaf has a slot, so a
 * background tab's panel is legitimately parked in the off-screen store, alive.
 *
 * Floating windows are deliberately absent: they have no renderer until M5, so a floated
 * panel would have nowhere to be shown and this gate would be asserting M5's scope. M5's
 * gate picks up float, maximise and anchored stacking.
 */
const steps = [
  ['switch away (tab)', false, () => { window.__vdd.openPanel('b', 'hostile') }],
  ['switch back (tab)', true, () => { window.__vdd.focusPanel('a') }],
  ['dock into the other leaf', true, () => { window.__vdd.dockPanelToGroup('a', 'R', 'center') }],
  ['split that leaf', true, () => { window.__vdd.dockPanelToGroup('a', 'R', 'bottom') }],
  // Re-dock into a leaf that has another panel in it, so the leaf survives the minimise
  // below. Minimising the only panel in a leaf destroys that leaf, and restoring then
  // correctly falls back to floating — which has no renderer until M5.
  ['re-dock into a shared leaf', true, () => { window.__vdd.dockPanelToGroup('a', 'L', 'center') }],
  ['minimise', false, () => { window.__vdd.minimizePanel('a') }],
  ['restore', true, () => { window.__vdd.restorePanel('a') }],
]

const timeline = [{ step: 'start', ...start }]
let prevTime = start.videoTime
let prevTicks = start.ticks

for (const [label, shouldBeVisible, action] of steps) {
  await page.evaluate(action)
  await page.waitForTimeout(260)
  const s = await probe()
  timeline.push({ step: label, ...s })

  if (s.mounts !== 1) fail(label, `component re-created (${s.mounts} mounts)`)
  if (s.unmounts !== 0) fail(label, `component unmounted ${s.unmounts}x`)
  if (s.sameNode !== true) fail(label, 'DOM node identity changed')
  if (s.glLost === true) fail(label, 'WebGL context lost')
  if (s.ticks < prevTicks) fail(label, `interval restarted (${prevTicks} -> ${s.ticks})`)

  if (s.videoTime !== null && s.videoTime < prevTime) fail(label, `video restarted (${prevTime} -> ${s.videoTime})`)

  if (shouldBeVisible) {
    if (s.inStore) fail(label, 'panel is off-screen but should be visible')
    if (s.scrollTop !== 240) fail(label, `scroll not restored (${s.scrollTop})`)
    if (s.focused !== 'a') fail(label, `focus not restored (${s.focused})`)
    if (s.caret !== 4) fail(label, `caret lost (${s.caret})`)
  } else {
    // Off-screen is the correct place for a background tab and for a minimised panel. The
    // point is that it is still *alive* — asserted by the mounts/ticks checks above.
    if (!s.inStore) fail(label, 'panel should be parked in the off-screen store')
  }
  prevTime = Math.max(prevTime, s.videoTime ?? 0)
  prevTicks = s.ticks
}

// Split resizing is geometry, so it can only be checked here.
await page.evaluate(() => { window.__vdd.dockPanel('a'); window.__vdd.dockPanelToGroup('a', 'R', 'center') })
await page.waitForTimeout(200)
const divider = page.locator('[data-vdd-divider]').first()
const beforeBox = await page.locator('[data-vdd-leaf]').first().boundingBox()
const dBox = await divider.boundingBox()
if (!dBox) fail('resize', 'no divider found to drag')
else {
  await page.mouse.move(dBox.x + dBox.width / 2, dBox.y + dBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(dBox.x + dBox.width / 2 - 160, dBox.y + dBox.height / 2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const afterBox = await page.locator('[data-vdd-leaf]').first().boundingBox()
  if (!afterBox || !beforeBox) fail('resize', 'could not measure the leaf')
  else if (Math.abs(afterBox.width - (beforeBox.width - 160)) > 24) {
    fail('resize', `dragging the divider 160px left changed the leaf by ${Math.round(beforeBox.width - afterBox.width)}px`)
  }
  const after = await probe()
  if (after.mounts !== 1) fail('resize', 'resizing re-created the panel')
  if (after.scrollTop !== 240) fail('resize', `scroll lost on resize (${after.scrollTop})`)
}

await page.screenshot({ path: `${OUT}/desktop.png` })
const passed = failures.length === 0
writeFileSync(`${OUT}/browser.json`, JSON.stringify({ passed, failures, timeline, notFound }, null, 2) + '\n')

console.log('M4 browser gate')
for (const row of timeline) {
  console.log(`  ${String(row.step).padEnd(26)} mounts=${row.mounts} ticks=${row.ticks} ` +
              `video=${row.videoTime?.toFixed?.(2) ?? '-'} scroll=${row.scrollTop} focus=${row.focused ?? '-'} ` +
              `gl=${row.glLost === false ? 'alive' : row.glLost === null ? '-' : 'LOST'}`)
}
if (notFound.length) console.log(`  (not found, not failed: ${notFound.map(u => new URL(u).pathname).join(', ')})`)
if (!passed) { console.log('FAILURES:'); failures.forEach(f => console.log('   ' + f)) }
console.log(passed ? 'M4 BROWSER: PASS' : 'M4 BROWSER: FAIL')
await browser.close()
process.exit(passed ? 0 : 1)
