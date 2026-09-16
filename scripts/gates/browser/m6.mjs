/**
 * M6 browser gate — every drop target, with real pointer events.
 *
 * This is the milestone jsdom can say least about: a drop target is a *place on screen*, and
 * arriving at it means moving a real pointer there. jsdom measures every box as zero, so
 * `elementsFromPoint` finds nothing and no drag can be aimed at anything.
 *
 * Each case drags a tab to a target and asserts the resulting layout tree. Run in both
 * reading directions, and once with emulated touch to exercise the long-press path.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'http://localhost:5188/'
const OUT = 'artifacts/M6'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (step, msg) => failures.push(`[${step}] ${msg}`)
const record = []

const browser = await chromium.launch({ channel: 'chrome' })

/** Reset to a known two-leaf layout with a keeper in each leaf plus the panel to drag. */
const reset = (page, dir) => page.evaluate((d) => {
  const ws = window.__vdd
  ws.loadLayout(JSON.stringify({
    version: 2,
    gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
      { type: 'leaf', id: 'L', panels: [], activePanelId: null },
      { type: 'leaf', id: 'R', panels: [], activePanelId: null } ] },
    floating: [], minimized: [], panels: {},
  }))
  ws.setDirection(d)
  ws.openPanel('keepL', 'hostile')
  ws.openPanel('keepR', 'hostile')
  ws.dockPanelToGroup('keepR', 'R', 'center')
  ws.openPanel('drag', 'hostile')
  ws.dockPanelToGroup('drag', 'L', 'center')
}, dir)

const tree = (page) => page.evaluate(() => {
  const walk = (n) => n.type === 'leaf'
    ? { leaf: n.id, panels: n.panels }
    : { branch: n.orientation, children: n.children.map(walk) }
  return {
    tree: walk(window.__vdd.state.gridRoot),
    floating: window.__vdd.state.floating.map(w => ({ id: w.id, anchor: w.anchor ?? null })),
    active: window.__vdd.state.activePanelId,
  }
})

const leafOf = (t, id) => {
  const walk = (n) => n.leaf ? (n.panels.includes(id) ? n.leaf : null)
    : n.children.reduce((a, c) => a ?? walk(c), null)
  return walk(t.tree)
}

// ── mouse: drag a tab to each kind of target ────────────────────────────────
for (const dir of ['ltr', 'rtl']) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage()
  page.on('pageerror', e => fail(`${dir} pageerror`, e.message))
  await page.goto(APP, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__vdd, null, { timeout: 15000 })

  const dragTabTo = async (target, opts = {}) => {
    await reset(page, dir)
    await page.waitForTimeout(250)
    const tab = await page.locator('[data-vdd-tab="drag"]').boundingBox()
    if (!tab) { fail(`${dir} setup`, 'no tab to drag'); return null }
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2)
    await page.mouse.down()
    // Past the 5px threshold first, so the zones are rendered before aiming at one.
    await page.mouse.move(tab.x + tab.width / 2 + 30, tab.y + tab.height / 2 + 30, { steps: 4 })
    await page.waitForTimeout(120)
    if (target) {
      const box = await page.locator(target).first().boundingBox()
      if (!box) { await page.mouse.up(); fail(`${dir} ${target}`, 'target not found on screen'); return null }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 })
      await page.waitForTimeout(140)
    } else if (opts.to) {
      await page.mouse.move(opts.to.x, opts.to.y, { steps: 10 })
      await page.waitForTimeout(120)
    }
    await page.mouse.up()
    await page.waitForTimeout(220)
    return tree(page)
  }

  // centre of the other leaf: joins that tab group
  let t = await dragTabTo('[data-vdd-drop-zone="center"][data-vdd-leaf="R"]')
  if (t) {
    record.push({ dir, case: 'centre of R', leaf: leafOf(t, 'drag'), active: t.active })
    if (leafOf(t, 'drag') !== 'R') fail(`${dir} centre`, `landed in ${leafOf(t, 'drag')}, expected R`)
    if (t.active !== 'drag') fail(`${dir} centre`, `active is ${t.active}, expected drag`)
  }

  // a side of the other leaf: splits it
  t = await dragTabTo('[data-vdd-drop-zone="bottom"][data-vdd-leaf="R"]')
  if (t) {
    const leaf = leafOf(t, 'drag')
    record.push({ dir, case: 'bottom of R', leaf, tree: JSON.stringify(t.tree).length })
    if (!leaf || leaf === 'R' || leaf === 'L') fail(`${dir} split`, `expected a new leaf, got ${leaf}`)
    const nested = JSON.stringify(t.tree).match(/"branch":"vertical"/)
    if (!nested) fail(`${dir} split`, 'no vertical branch was created')
  }

  // workspace edge: full-width row, mirrored under RTL
  t = await dragTabTo('[data-vdd-edge="left"]')
  if (t) {
    const first = JSON.stringify(t.tree.children?.[0] ?? {})
    const second = JSON.stringify(t.tree.children?.[1] ?? {})
    const side = first.includes('"drag"') ? 'first' : second.includes('"drag"') ? 'second' : 'neither'
    record.push({ dir, case: 'edge left', side })
    // Physical left is the logical leading edge under LTR and the trailing one under RTL, so
    // the same gesture must produce opposite sides of the tree.
    const expected = dir === 'ltr' ? 'first' : 'second'
    if (side !== expected) fail(`${dir} edge`, `panel is the ${side} child, expected ${expected}`)
  }

  // corner: floats, pinned
  t = await dragTabTo('[data-vdd-corner="bottom-right"]')
  if (t) {
    const w = t.floating.find(f => f.id === 'drag')
    record.push({ dir, case: 'corner bottom-right', anchor: w?.anchor ?? null })
    if (!w) fail(`${dir} corner`, 'panel did not float')
    // The anchor is logical, so a physically bottom-right corner is bottom-LEFT under RTL.
    else if (w.anchor !== (dir === 'ltr' ? 'bottom-right' : 'bottom-left')) {
      fail(`${dir} corner`, `anchor is ${w.anchor} under ${dir}`)
    }
  }

  // released over nothing: free float
  t = await dragTabTo(null, { to: { x: 620, y: 420 } })
  if (t) {
    const w = t.floating.find(f => f.id === 'drag')
    record.push({ dir, case: 'free float', anchor: w?.anchor ?? null })
    if (!w) fail(`${dir} free`, 'panel did not float')
    else if (w.anchor !== null) fail(`${dir} free`, `anchor is ${w.anchor}, expected null`)
  }

  // reorder within a leaf: the insertion index must account for the removal
  await reset(page, dir)
  await page.evaluate(() => { window.__vdd.openPanel('third', 'hostile'); window.__vdd.dockPanelToGroup('third', 'L', 'center') })
  await page.waitForTimeout(220)
  const before = await page.evaluate(() => window.__vdd.state.gridRoot.children.find(c => c.id === 'L')?.panels ?? [])
  const src = await page.locator('[data-vdd-tab="drag"]').boundingBox()
  const dst = await page.locator('[data-vdd-tab="third"]').boundingBox()
  if (src && dst) {
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2)
    await page.mouse.down()
    await page.mouse.move(src.x + src.width / 2 + 20, src.y + src.height / 2, { steps: 4 })
    await page.mouse.move(dst.x + dst.width * 0.8, dst.y + dst.height / 2, { steps: 8 })   // right half
    await page.waitForTimeout(140)
    await page.mouse.up()
    await page.waitForTimeout(220)
    const after = await page.evaluate(() => window.__vdd.state.gridRoot.children.find(c => c.id === 'L')?.panels ?? [])
    record.push({ dir, case: 'reorder', before, after })
    if (after.indexOf('drag') !== after.indexOf('third') + 1) {
      fail(`${dir} reorder`, `order is ${after.join(',')} — "drag" should sit right after "third"`)
    }
    if (after.length !== before.length) fail(`${dir} reorder`, 'reordering changed the tab count')
  }

  if (dir === 'ltr') await page.screenshot({ path: `${OUT}/dragging.png` })
  await page.close()
}

// ── touch: the long press must arm before a drag begins ────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  page.on('pageerror', e => fail('touch pageerror', e.message))
  await page.goto(APP, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__vdd, null, { timeout: 15000 })
  await reset(page, 'ltr')
  await page.waitForTimeout(250)

  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  if (!coarse) fail('touch', 'device emulation did not report a coarse pointer')

  const tab = await page.locator('[data-vdd-tab="drag"]').boundingBox()

  // A quick flick must NOT drag: that is a scroll.
  await page.touchscreen.tap(tab.x + tab.width / 2, tab.y + tab.height / 2)
  await page.waitForTimeout(150)
  const afterTap = await tree(page)
  record.push({ dir: 'touch', case: 'tap does not drag', leaf: leafOf(afterTap, 'drag') })
  if (leafOf(afterTap, 'drag') !== 'L') fail('touch', 'a tap moved the panel')

  // A long press, then a move, must drag. Driven through CDP so the press can be held.
  const cdp = await ctx.newCDPSession(page)
  const touchPoint = (x, y) => [{ x, y, radiusX: 10, radiusY: 10, force: 1, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(tab.x + tab.width / 2, tab.y + tab.height / 2) })
  await page.waitForTimeout(420)                    // longer than the 300ms long press
  const armed = await page.evaluate(() => document.querySelector('.vdd-long-press-active') !== null)
  record.push({ dir: 'touch', case: 'long press arms', armed })
  if (!armed) fail('touch', 'a 420ms press did not arm the long-press state')

  // The drop zones only exist while a drag is in progress, so the target can only be located
  // now — after the long press has armed and a first move has begun the drag.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(tab.x + tab.width / 2 + 20, tab.y + tab.height / 2 + 20) })
  await page.waitForTimeout(150)
  const box = await page.locator('[data-vdd-drop-zone="center"][data-vdd-leaf="R"]').first().boundingBox().catch(() => null)
  if (!box) fail('touch', 'drop zones did not appear during a touch drag')
  if (box) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(box.x + box.width / 2, box.y + box.height / 2) })
    await page.waitForTimeout(200)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(260)
    const t = await tree(page)
    record.push({ dir: 'touch', case: 'long press drag', leaf: leafOf(t, 'drag') })
    if (leafOf(t, 'drag') !== 'R') fail('touch', `long-press drag landed in ${leafOf(t, 'drag')}, expected R`)
  }
  await page.close()
}

const passed = failures.length === 0
writeFileSync(`${OUT}/browser.json`, JSON.stringify({ passed, failures, record }, null, 2) + '\n')
console.log('M6 browser gate')
for (const r of record) console.log('  ' + JSON.stringify(r))
if (!passed) { console.log('FAILURES:'); failures.forEach(f => console.log('   ' + f)) }
console.log(passed ? 'M6 BROWSER: PASS' : 'M6 BROWSER: FAIL')
await browser.close()
process.exit(passed ? 0 : 1)
