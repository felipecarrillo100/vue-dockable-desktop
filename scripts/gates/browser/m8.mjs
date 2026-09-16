/**
 * M8 browser gate — context menus, measured.
 *
 * Three things here need real layout and cannot be checked in jsdom: a menu opened near an
 * edge must be pulled back inside the viewport (which needs the menu's own measured size), a
 * submenu must open beside its parent item and on the correct side for the reading
 * direction, and a menu must sit above everything else — the failure mode found twice in M7
 * was chrome being painted over by a split divider.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'http://localhost:5188/'
const OUT = 'artifacts/M8'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (step, msg) => failures.push(`[${step}] ${msg}`)
const record = []
const near = (a, b, tol = 4) => Math.abs(a - b) <= tol

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage()
page.on('pageerror', e => fail('pageerror', e.message))
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fail('console', m.text())
})

await page.goto(APP, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__vdd, null, { timeout: 15000 })
await page.evaluate(() => { window.__vdd.openPanel('a', 'hostile'); window.__vdd.openPanel('b', 'hostile') })
await page.waitForTimeout(350)

const show = (x, y, items) => page.evaluate(([px, py, defs]) => {
  window.__ran = []
  const build = (list) => list.map(d => d.separator
    ? { separator: true }
    : d.items
      ? { label: d.label, items: build(d.items) }
      : { label: d.label, disabled: d.disabled, checkbox: d.checkbox, action: () => window.__ran.push(d.label) })
  window.__vdd.showContextMenu({ x: px, y: py, items: build(defs) })
}, [x, y, items])

const menuBox = () => page.locator('[data-vdd-menu]').boundingBox()

// ── a menu near the right/bottom edge is pulled back inside ────────────────
for (const [label, at] of [
  ['near the right edge', { x: 980, y: 100 }],
  ['near the bottom edge', { x: 100, y: 690 }],
  ['in the corner', { x: 995, y: 695 }],
]) {
  await show(at.x, at.y, [{ label: 'One' }, { label: 'Two' }, { label: 'A longer label here' }])
  await page.waitForTimeout(150)
  const box = await menuBox()
  const viewport = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  record.push({ step: label, x: Math.round(box.x), right: Math.round(box.x + box.width), bottom: Math.round(box.y + box.height) })
  if (box.x + box.width > viewport.w) fail(label, `menu extends ${Math.round(box.x + box.width - viewport.w)}px past the right edge`)
  if (box.y + box.height > viewport.h) fail(label, `menu extends ${Math.round(box.y + box.height - viewport.h)}px past the bottom edge`)
  if (box.x < 0 || box.y < 0) fail(label, 'menu is off the top or left')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
}

// ── a menu sits above the workspace, including split dividers ──────────────
await page.evaluate(() => { window.__vdd.dockPanelToGroup('b', 'R', 'center') })
await page.waitForTimeout(200)
await show(480, 300, [{ label: 'Above everything' }])
await page.waitForTimeout(150)
const box = await menuBox()
const topmost = await page.evaluate(([x, y]) =>
  document.elementsFromPoint(x, y).slice(0, 2).map(e => String(e.className || e.tagName)),
[box.x + 20, box.y + 12])
record.push({ step: 'stacking', topmost })
if (!topmost.some(c => c.includes('vdd-context-menu'))) {
  fail('stacking', `something is painted over the menu: ${topmost.join(' / ')}`)
}
// and it is clickable, which is what stacking actually buys
await page.mouse.click(box.x + 20, box.y + 12)
await page.waitForTimeout(150)
const ran = await page.evaluate(() => window.__ran)
record.push({ step: 'clickable', ran })
if (!ran.includes('Above everything')) fail('stacking', 'the item did not run when clicked')

// ── a submenu opens beside its parent, on the right side for the direction ──
for (const dir of ['ltr', 'rtl']) {
  await page.evaluate((d) => { window.__vdd.setDirection(d) }, dir)
  await show(400, 200, [{ label: 'Parent', items: [{ label: 'Nested one' }, { label: 'Nested two' }] }])
  await page.waitForTimeout(150)
  const parent = await page.locator('[data-vdd-menu-submenu="Parent"]').boundingBox()
  await page.mouse.move(parent.x + parent.width / 2, parent.y + parent.height / 2)
  await page.waitForTimeout(350)                      // past the open delay
  const sub = await page.locator('[data-vdd-submenu]').boundingBox().catch(() => null)
  record.push({
    step: `submenu ${dir}`,
    opened: !!sub,
    ...(sub ? { gapFromParent: Math.round(dir === 'ltr' ? sub.x - (parent.x + parent.width) : parent.x - (sub.x + sub.width)), alignedTop: near(sub.y, parent.y, 6) } : {}),
  })
  if (!sub) { fail(`submenu ${dir}`, 'the submenu never opened'); continue }
  if (dir === 'ltr' && sub.x < parent.x) fail('submenu ltr', 'the submenu opened to the left under LTR')
  if (dir === 'rtl' && sub.x > parent.x) fail('submenu rtl', 'the submenu opened to the right under RTL')
  if (!near(sub.y, parent.y, 6)) fail(`submenu ${dir}`, `submenu top is ${Math.round(sub.y - parent.y)}px off its parent`)

  // travel into it and run a nested item
  await page.mouse.move(sub.x + sub.width / 2, sub.y + 14, { steps: 6 })
  await page.waitForTimeout(150)
  await page.mouse.down(); await page.mouse.up()
  await page.waitForTimeout(200)
  const nested = await page.evaluate(() => ({ ran: window.__ran, menuGone: document.querySelector('[data-vdd-menu]') === null }))
  record.push({ step: `submenu ${dir} click`, ...nested })
  if (!nested.ran.includes('Nested one')) fail(`submenu ${dir}`, 'the nested item did not run')
  if (!nested.menuGone) fail(`submenu ${dir}`, 'the menu stayed open after a nested item ran')
}
await page.evaluate(() => { window.__vdd.setDirection('ltr') })

// ── right-clicking a tab opens the real panel menu ─────────────────────────
// `locator.click` rather than raw coordinates: it waits for the element to be stable first.
// A coordinate measured while the taskbar was still appearing landed the click on empty
// space, and "no menu opened" is indistinguishable from "the menu was empty".
await page.locator('[data-vdd-tab="a"]').click({ button: 'right' })
await page.waitForTimeout(200)
const labels = await page.evaluate(() =>
  [...document.querySelectorAll('[data-vdd-menu-item]')].map(e => e.getAttribute('data-vdd-menu-item')))
record.push({ step: 'tab menu', labels })
if (!labels.includes('Minimize Panel')) fail('tab menu', `menu was ${JSON.stringify(labels)}`)

// clicking Minimize really minimises
await page.click('[data-vdd-menu-item="Minimize Panel"]')
await page.waitForTimeout(250)
const minimised = await page.evaluate(() => window.__vdd.state.panels.a.state)
record.push({ step: 'tab menu minimise', state: minimised })
if (minimised !== 'minimized') fail('tab menu', `panel is ${minimised}`)

// ── D1: the taskbar's Maximize works, on screen ────────────────────────────
await page.locator('[data-vdd-taskbar-item="a"]').click({ button: 'right' })
await page.waitForTimeout(250)
const taskbarLabels = await page.evaluate(() =>
  [...document.querySelectorAll('[data-vdd-menu-item]')].map(e => e.getAttribute('data-vdd-menu-item')))
record.push({ step: 'taskbar menu', labels: taskbarLabels })
if (!taskbarLabels.includes('Maximize Panel')) fail('D1', `taskbar menu was ${JSON.stringify(taskbarLabels)}`)
else {
  await page.click('[data-vdd-menu-item="Maximize Panel"]')
  await page.waitForTimeout(350)
  const after = await page.evaluate(() => {
    const w = window.__vdd.state.floating.find(f => f.id === 'a')
    const el = document.querySelector('[data-vdd-window="a"]')
    const r = el?.getBoundingClientRect()
    const view = document.querySelector('.vdd-workspace-viewport')?.getBoundingClientRect()
    return {
      state: window.__vdd.state.panels.a.state,
      maximized: w?.maximized ?? null,
      fillsWorkspace: !!r && !!view && Math.abs(r.width - view.width) < 3 && Math.abs(r.height - view.height) < 3,
    }
  })
  record.push({ step: 'D1 taskbar maximize', ...after })
  if (after.state !== 'floating') fail('D1', `panel is ${after.state} after Maximize`)
  if (after.maximized !== true) fail('D1', 'the window is not maximized')
  if (!after.fillsWorkspace) fail('D1', 'the maximized window does not fill the workspace')
}

await page.screenshot({ path: `${OUT}/menu.png` })
const passed = failures.length === 0
writeFileSync(`${OUT}/browser.json`, JSON.stringify({ passed, failures, record }, null, 2) + '\n')
console.log('M8 browser gate')
for (const r of record) console.log('  ' + JSON.stringify(r))
if (!passed) { console.log('FAILURES:'); failures.forEach(f => console.log('   ' + f)) }
console.log(passed ? 'M8 BROWSER: PASS' : 'M8 BROWSER: FAIL')
await browser.close()
process.exit(passed ? 0 : 1)
