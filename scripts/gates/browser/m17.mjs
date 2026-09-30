// gate:app playground
/**
 * M17 browser gate — the field-report fixes (1.5.0), in real Chrome. The port of
 * react-dockable-desktop 7.4.0's `frost.browser.ts`, `motion.browser.ts` and `direction.browser.ts`.
 *
 *   frost      a `position: fixed; right: 0; bottom: 0` child of every frosted container — the
 *              floating window, the drawer, the overlay widget, the frosted panel toolbar and the
 *              macOS docked panel — lands on the viewport's corner (a backdrop-filter on the
 *              container itself makes it the containing block); and each container, screenshotted
 *              over stripes, matches the pre-1.5.0 rendering (the frost moved back onto the element)
 *   motion     with prefers-reduced-motion: reduce emulated, no library element transitions or
 *              animates; without it, some do; the page's own transitions are untouched
 *   direction  setDirection('rtl'), with no dir on <html>, mirrors the sidebar rail and the toasts,
 *              and setDirection('ltr') restores them; a page-level dir="rtl" still reaches them
 *
 *   node scripts/gates/browser/m17.mjs     the gate (the playground on :5188, or VDD_APP_URL)
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.VDD_APP_URL ?? 'http://localhost:5188/'
const OUT = 'artifacts/M17'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = msg => failures.push(msg)
const report = {}
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.on('pageerror', e => fail(`page error: ${e.message}`))

const open = async (query) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(`${APP}?${query}`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__vdd && !!window.__app, null, { timeout: 15000 })
  await page.evaluate(() => {
    const ws = window.__vdd
    ws.openPanel('ov', 'overlay', { title: 'Overlay' })
    ws.openPanel('f1', 'hostile', { title: 'Float' })
    ws.floatPanel('f1', { x: 520, y: 260, width: 360, height: 240 })
  })
  await page.waitForTimeout(500)
}

// ── frost ───────────────────────────────────────────────────────────────────

const FROSTED = [
  { name: 'floating window', query: 'anim=0', selector: '.vdd-floating-window' },
  { name: 'floating window, macos', query: 'anim=0&skin=macos', selector: '.vdd-floating-window' },
  { name: 'drawer', query: 'anim=0', selector: '.vdd-side-panel', drawer: true },
  { name: 'docked panel, macos', query: 'anim=0&skin=macos', selector: '.vdd-workspace-panel' },
  { name: 'overlay widget', query: 'anim=0', selector: '.vdd-panel-float' },
  { name: 'frosted panel toolbar', query: 'anim=0', selector: '.vdd-panel-toolbar[data-variant="frosted"]' },
  { name: 'frosted panel toolbar, light', query: 'anim=0&cs=light', selector: '.vdd-panel-toolbar[data-variant="frosted"]' },
]
// Stripes behind the frost, and nothing that changes between the two screenshots: the playground's
// hostile panels play a video, draw WebGL and animate, which would differ however the frost is drawn.
const STRIPES = '.vdd-workspace, .vdd-panel-content, .hostile, .vdd-panel-slot { background: repeating-linear-gradient(45deg, #e11 0 6px, #11e 6px 12px, #1b1 12px 18px) !important; }'
  + ' .hostile canvas, .hostile video, .hostile .anim, .hostile .meta { visibility: hidden !important; }'
  + ' *, *::before, *::after { animation-play-state: paused !important; caret-color: transparent !important; }'

/** How far a fixed right:0/bottom:0 child of `selector` lands from the viewport's corner. */
const probe = selector => page.evaluate((sel) => {
  const host = document.querySelector(sel)
  if (!host) return null
  const p = document.createElement('div')
  p.style.cssText = 'position:fixed;right:0;bottom:0;width:10px;height:10px'
  host.appendChild(p)
  const r = p.getBoundingClientRect()
  p.remove()
  return [Math.round(innerWidth - r.right), Math.round(innerHeight - r.bottom)]
}, selector)

/** Mean absolute channel difference and share of pixels off by more than 24, computed in Chrome. */
const compare = (a, b) => page.evaluate(async ([x, y]) => {
  const load = src => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src })
  const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data }
  const [da, db] = [px(await load(x)), px(await load(y))]
  let sum = 0, off = 0
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]))
    sum += d; if (d > 24) off++
  }
  return { mean: sum / (da.length / 4), off: off / (da.length / 4) }
}, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`])

async function frost() {
  for (const f of FROSTED) {
    await open(f.query)
    if (f.drawer) { await page.evaluate(() => window.__app.openLeft()); await page.waitForTimeout(500) }
    if (!(await page.locator(f.selector).count())) { fail(`frost ${f.name}: ${f.selector} is not in the scene`); continue }
    const frosted = await page.evaluate(sel => {
      const el = document.querySelector(sel)
      return [getComputedStyle(el).backdropFilter, getComputedStyle(el, '::before').backdropFilter].some(v => v && v !== 'none')
    }, f.selector)
    if (!frosted) fail(`frost ${f.name}: the container is not frosted at all — the check proves nothing`)
    const at = await probe(f.selector)
    report[`frost ${f.name}`] = { at }
    if (!at || at[0] !== 0 || at[1] !== 0) fail(`frost ${f.name}: a fixed child lands ${JSON.stringify(at)} from the viewport's corner, not [0,0]`)

    // Pixels: now, then with the ::before's frost moved back onto the element (the pre-1.5.0 rule).
    await page.addStyleTag({ content: STRIPES })
    await page.mouse.move(1, 1)
    await page.waitForTimeout(300)
    const el = page.locator(f.selector).first()
    // The container's padding box. Where a container clips its overflow (vdd's and ndd's floating
    // window and docked panel), its ::before cannot reach under the 1px border, so that band shows
    // the page through the translucent border untinted — the one known difference, left out here.
    const box = await el.boundingBox()
    const clip = { x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2 }
    const now = await page.screenshot({ clip })
    const moved = await page.evaluate((sel) => {
      const e = document.querySelector(sel)
      const before = getComputedStyle(e, '::before').backdropFilter
      if (!before || before === 'none') return false
      const s = document.createElement('style')
      s.textContent = `${sel}::before { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }`
      document.head.appendChild(s)
      e.style.setProperty('backdrop-filter', before, 'important')
      return true
    }, f.selector)
    await page.waitForTimeout(200)
    if (moved) {
      const d = await compare(now, await page.screenshot({ clip }))
      report[`frost ${f.name}`].pixels = d
      if (d.mean >= 1.5 || d.off >= 0.01) fail(`frost ${f.name}: the rendering changed (mean ${d.mean.toFixed(2)}, ${(d.off * 100).toFixed(2)}% of pixels off by > 24)`)
    }
  }
}

// ── motion ──────────────────────────────────────────────────────────────────

const moving = () => page.evaluate(() => {
  const out = []
  const dur = v => v.split(',').some(t => parseFloat(t) > 0)
  for (const el of document.querySelectorAll('[class*="vdd-"]')) {
    for (const pseudo of ['', '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo || null)
      if (dur(cs.transitionDuration) || (cs.animationName !== 'none' && dur(cs.animationDuration))) out.push(`${el.className}${pseudo}`)
    }
  }
  return out
})

async function motion() {
  await open('')
  const before = await moving()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const after = await moving()
  const own = await page.evaluate(() => {
    const d = document.createElement('div'); d.style.transition = 'opacity 0.3s'; document.body.appendChild(d)
    const v = getComputedStyle(d).transitionDuration; d.remove(); return v
  })
  report.motion = { before: before.length, after: after.length, own }
  if (before.length <= 5) fail(`motion: only ${before.length} library elements animate — the check proves nothing`)
  if (after.length) fail(`motion: ${after.length} library element(s) still move under reduced motion, e.g. ${after.slice(0, 3).join(' | ')}`)
  if (own !== '0.3s') fail(`motion: the page's own transition became ${own}`)
}

// ── direction ───────────────────────────────────────────────────────────────

const readDir = () => page.evaluate(() => {
  const layout = document.querySelector('.vdd-sidebar-layout')
  const strip = document.querySelector('.vdd-sidebar-tabs-strip')?.getBoundingClientRect()
  const box = layout?.getBoundingClientRect()
  const toasts = document.querySelector('.vdd-toast-container')
  return {
    sidebar: layout ? getComputedStyle(layout).direction : 'missing',
    railOnRight: strip && box ? strip.left + strip.width / 2 > box.left + box.width / 2 : null,
    toasts: toasts ? getComputedStyle(toasts).direction : 'missing',
  }
})

async function direction() {
  await open('anim=0')
  await page.evaluate(() => window.__app.toast('hello', { duration: 600000 }))
  await page.waitForTimeout(300)
  const ltr = await readDir()
  await page.evaluate(() => window.__vdd.setDirection('rtl'))
  await page.waitForTimeout(300)
  const rtl = await readDir()
  await page.evaluate(() => window.__vdd.setDirection('ltr'))
  await page.waitForTimeout(300)
  const back = await readDir()
  const htmlDir = await page.evaluate(() => document.documentElement.dir)
  report.direction = { ltr, rtl, back, htmlDir }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  if (htmlDir !== '') fail(`direction: the page set dir="${htmlDir}" on <html>; the check needs none`)
  if (!same(ltr, { sidebar: 'ltr', railOnRight: false, toasts: 'ltr' })) fail(`direction: LTR start state is ${JSON.stringify(ltr)}`)
  if (!same(rtl, { sidebar: 'rtl', railOnRight: true, toasts: 'rtl' })) fail(`direction: after setDirection('rtl') ${JSON.stringify(rtl)}`)
  if (!same(back, ltr)) fail(`direction: after setDirection('ltr') ${JSON.stringify(back)}`)

  // A page-level dir="rtl" still reaches them while the workspace is LTR.
  await open('anim=0')
  await page.evaluate(() => { document.documentElement.dir = 'rtl'; window.__app.toast('hello', { duration: 600000 }) })
  await page.waitForTimeout(300)
  const page_ = await readDir()
  report.direction.pageRtl = page_
  if (page_.sidebar !== 'rtl' || page_.toasts !== 'rtl') fail(`direction: with <html dir="rtl"> and an LTR workspace, ${JSON.stringify(page_)}`)
}

try {
  await frost()
  await motion()
  await direction()
} catch (e) {
  fail(`the run crashed: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
}
writeFileSync(`${OUT}/field-report.json`, JSON.stringify({ report, failures }, null, 2))
if (failures.length) {
  console.error('\nM17 browser: FAIL')
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}
console.log('\nM17 browser: ok')
