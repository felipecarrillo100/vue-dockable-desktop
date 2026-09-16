/**
 * M7 browser gate — the taskbar and its live previews.
 *
 * The preview's whole claim is that it shows a *running* panel, scaled. That needs real
 * layout to check: jsdom can prove the DOM node is the same one, but only a browser can show
 * it is on screen, at a sensible size, with its WebGL context intact and its video still
 * advancing while it is being previewed.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'http://localhost:5188/'
const OUT = 'artifacts/M7'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (step, msg) => failures.push(`[${step}] ${msg}`)
const record = []

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage()
page.on('pageerror', e => fail('pageerror', e.message))
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fail('console', m.text())
})

await page.goto(APP, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__vdd, null, { timeout: 15000 })
await page.waitForTimeout(250)

// A panel that has been on screen, so the preview has a real size to scale from.
await page.evaluate(() => {
  // `keeper` first, so that `a` ends up the selected tab and therefore actually on screen:
  // only a leaf's selected tab has a slot, and the preview needs a real size to scale from.
  window.__vdd.openPanel('keeper', 'hostile')
  window.__vdd.openPanel('a', 'hostile')
})
await page.waitForSelector('[data-hostile="a"]')
await page.waitForTimeout(600)

const onScreenSize = await page.evaluate(() => {
  const r = document.querySelector('[data-vdd-panel="a"]').getBoundingClientRect()
  return { width: Math.round(r.width), height: Math.round(r.height) }
})
await page.evaluate(() => { document.querySelector('[data-scroller="a"]').scrollTop = 150 })
await page.evaluate(() => { window.__nodeRef = document.querySelector('[data-hostile="a"]') })
await page.evaluate(() => { window.__vdd.minimizePanel('a') })
await page.waitForTimeout(250)

const icon = await page.locator('[data-vdd-taskbar-item="a"]').boundingBox()
if (!icon) fail('taskbar', 'no icon appeared for the minimised panel')

// ── hover: the preview is the live panel ───────────────────────────────────
if (icon) {
  const videoBefore = await page.evaluate(() => document.querySelector('[data-video="a"]')?.currentTime ?? null)
  await page.mouse.move(icon.x + icon.width / 2, icon.y + icon.height / 2)
  await page.waitForTimeout(400)

  const preview = await page.evaluate(() => {
    const tip = document.querySelector('[data-vdd-preview]')
    if (!tip) return null
    const panel = document.querySelector('[data-hostile="a"]')
    const host = tip.querySelector('.vdd-taskbar-item-preview-host')
    const frame = tip.querySelector('.vdd-taskbar-item-preview-frame')
    const fr = frame?.getBoundingClientRect()
    const pr = panel?.getBoundingClientRect()
    return {
      containsPanel: !!panel && tip.contains(panel),
      sameNode: window.__nodeRef === panel,
      copies: document.querySelectorAll('[data-hostile="a"]').length,
      frame: fr ? { w: Math.round(fr.width), h: Math.round(fr.height), top: Math.round(fr.top) } : null,
      onScreen: !!pr && pr.width > 0 && pr.height > 0,
      scale: host ? getComputedStyle(host).transform : null,
      glLost: window.__gl?.a?.isContextLost?.() ?? null,
      mounts: window.__mounts?.a ?? 0,
      pointerEvents: host ? getComputedStyle(host).pointerEvents : null,
    }
  })
  record.push({ step: 'preview', ...(preview ?? { missing: true }) })

  if (!preview) fail('preview', 'hovering the icon produced no preview')
  else {
    if (!preview.containsPanel) fail('preview', 'the preview does not contain the panel')
    if (!preview.sameNode) fail('preview', 'the preview contains a different node — it is a copy, not the panel')
    if (preview.copies !== 1) fail('preview', `${preview.copies} copies of the panel exist`)
    if (!preview.onScreen) fail('preview', 'the panel has no size inside the preview')
    if (preview.mounts !== 1) fail('preview', `the panel was re-created (${preview.mounts} mounts)`)
    if (preview.glLost !== false) fail('preview', 'the WebGL context was lost while previewing')
    if (!preview.frame || preview.frame.w > 221 || preview.frame.h > 141) {
      fail('preview', `thumbnail is ${preview.frame?.w}x${preview.frame?.h}, should fit 220x140`)
    }
    // The thumbnail must be a scaled-down version of the panel's real size, not a squeeze.
    const expected = Math.min(220 / onScreenSize.width, 140 / onScreenSize.height)
    const matrix = preview.scale?.match(/matrix\(([\d.]+)/)
    if (!matrix || Math.abs(Number(matrix[1]) - expected) > 0.02) {
      fail('preview', `scale is ${preview.scale}, expected about ${expected.toFixed(3)} for a ${onScreenSize.width}x${onScreenSize.height} panel`)
    }
    if (preview.pointerEvents !== 'none') {
      fail('preview', 'the preview contents must not be interactive — clicks belong to the preview itself')
    }
  }

  // Playback continues while previewed: the panel really is running, not frozen.
  await page.waitForTimeout(500)
  const videoAfter = await page.evaluate(() => document.querySelector('[data-video="a"]')?.currentTime ?? null)
  record.push({ step: 'still running', videoBefore, videoAfter })
  if (videoAfter !== null && videoBefore !== null && !(videoAfter > videoBefore)) {
    fail('preview', `video did not advance while previewed (${videoBefore} -> ${videoAfter})`)
  }

  await page.screenshot({ path: `${OUT}/preview.png` })

  // ── clicking the preview restores, with scroll intact ────────────────────
  const tip = await page.locator('[data-vdd-preview]').boundingBox()
  if (tip) {
    // Travel from the icon onto the thumbnail in steps: the pointer has to reach the preview
    // without the dismissal timer closing it on the way, which is what the invisible bridge
    // and the preview's own pointerenter are for.
    await page.mouse.move(tip.x + tip.width / 2, tip.y + tip.height - 20, { steps: 8 })
    await page.waitForTimeout(200)
    const reachable = await page.evaluate(() => ({
      stillOpen: document.querySelector('[data-vdd-preview]') !== null,
      under: document.elementsFromPoint(...(() => {
        const r = document.querySelector('[data-vdd-preview]')?.getBoundingClientRect()
        return r ? [r.x + r.width / 2, r.bottom - 20] : [0, 0]
      })()).slice(0, 2).map(e => String(e.className || e.tagName)),
    }))
    record.push({ step: 'preview reachable', ...reachable })
    if (!reachable.stillOpen) fail('restore', 'the preview closed before the pointer reached it')
    await page.mouse.down(); await page.mouse.up()
    await page.waitForTimeout(350)
    const restored = await page.evaluate(() => ({
      state: window.__vdd.state.panels.a.state,
      active: window.__vdd.state.activePanelId,
      scroll: document.querySelector('[data-scroller="a"]')?.scrollTop ?? null,
      previewGone: document.querySelector('[data-vdd-preview]') === null,
      inSlot: !!document.querySelector('[data-vdd-panel="a"]')?.closest('[data-vdd-slot]'),
    }))
    record.push({ step: 'restore from preview', ...restored })
    if (restored.state !== 'docked') fail('restore', `panel is ${restored.state}`)
    if (restored.active !== 'a') fail('restore', `active is ${restored.active}`)
    if (!restored.previewGone) fail('restore', 'the preview outlived the restore')
    if (!restored.inSlot) fail('restore', 'the panel is not back in a slot')
    if (restored.scroll !== 150) fail('restore', `scroll is ${restored.scroll}, expected 150 (ADR 0014)`)
  }
}

// ── autohide: translated off, expanding on hover ───────────────────────────
//
// Autohide does not shrink the bar — it slides it down past the bottom edge, leaving a peek
// strip. So what matters is how much of it is *visible*, not how tall the element is: its
// own height never changes. (Measuring the element height instead reported 29px both ways,
// and hovering `top + height` aimed the mouse below the viewport, where it cannot go.)
await page.evaluate(() => { window.__taskbar.value = 'autohide'; window.__vdd.minimizePanel('a') })
await page.waitForTimeout(2400)                  // let the minimise flash finish

const visibleHeight = () => page.evaluate(() => {
  const bar = document.querySelector('[data-vdd-taskbar]')
  const r = bar.getBoundingClientRect()
  return {
    visible: Math.round(Math.min(r.bottom, window.innerHeight) - r.top),
    height: Math.round(r.height),
    expanded: bar.classList.contains('vdd-taskbar-expanded'),
  }
})

const collapsed = await visibleHeight()
// Travel to the peek strip the way a pointer does: away first, then in, in steps. A single
// jump from an element that has just been removed does not always produce an enter event.
await page.mouse.move(600, 300)
await page.waitForTimeout(150)
await page.mouse.move(600, (await page.evaluate(() => window.innerHeight)) - 2, { steps: 5 })
await page.waitForTimeout(400)
const open = await visibleHeight()
record.push({ step: 'autohide', collapsed, open })
if (collapsed.expanded) fail('autohide', 'the bar was still expanded long after the flash')
if (collapsed.visible > 12) fail('autohide', `${collapsed.visible}px of the bar is visible while collapsed, expected a peek strip`)
if (!open.expanded) fail('autohide', 'hovering the peek strip did not expand the bar')
if (!(open.visible > collapsed.visible + 8)) {
  fail('autohide', `expanding revealed no more of the bar (${collapsed.visible} -> ${open.visible}px visible)`)
}

// ── compact: present only while something is minimised ─────────────────────
await page.mouse.move(600, 200)                  // off the taskbar
await page.evaluate(() => { window.__taskbar.value = 'compact'; window.__vdd.restorePanel('a') })
await page.waitForTimeout(250)
const compactEmpty = await page.evaluate(() => document.querySelector('[data-vdd-taskbar]') === null)
await page.evaluate(() => { window.__vdd.minimizePanel('a') })
await page.waitForTimeout(250)
const compactFull = await page.evaluate(() => document.querySelector('[data-vdd-taskbar]') !== null)
record.push({ step: 'compact', hiddenWhenEmpty: compactEmpty, shownWhenMinimised: compactFull })
if (!compactEmpty) fail('compact', 'the bar is present with nothing minimised')
if (!compactFull) fail('compact', 'the bar is absent with something minimised')

const passed = failures.length === 0
writeFileSync(`${OUT}/browser.json`, JSON.stringify({ passed, failures, record, onScreenSize }, null, 2) + '\n')
console.log('M7 browser gate')
for (const r of record) console.log('  ' + JSON.stringify(r))
if (!passed) { console.log('FAILURES:'); failures.forEach(f => console.log('   ' + f)) }
console.log(passed ? 'M7 BROWSER: PASS' : 'M7 BROWSER: FAIL')
await browser.close()
process.exit(passed ? 0 : 1)
