// gate:app playground
/**
 * M15 browser gate — skin branding (1.3.0), in real Chrome. The port of react-dockable-desktop
 * 7.2.0's `branding.browser.ts` and the skin-font / brand-font cases of its `fonts.browser.ts`,
 * by way of angular-dockable-desktop 1.1.0's M16 browser gate, which it follows check for check.
 *
 * `--vdd-brand-accent` / `--vdd-brand-on-accent` set on :root must reach every built-in skin, a
 * skin's font must reach every piece of chrome, a consumer's `--vdd-font-family` must beat every
 * skin's font — and with none of them set, every skin must render exactly as 1.2.0 did.
 *
 *   baseline  the computed colours (color, backgrounds, borders, outline, box-shadow, fill,
 *             stroke) of every vdd- element and its ::before/::after, 8 hover states, and every
 *             --vdd-* token resolved inside the workspace, inside the toolbar (outside the
 *             workspace) and on <body> (where teleported chrome lives), in 14 scenes — 7 skins ×
 *             dark/light, with the chrome opened (active sidebar tab, radio, toggle, focused tab,
 *             a minimised panel, the toolbar flyout, a drawer, the confirm modal, a toast, the
 *             context menu, a floating window, a panel toolbar) — match the 1.2.0 baseline
 *             except exactly the intended fixes: a stale accent-family literal (for obsidian also
 *             its white/black) now drawn in the scene's own accent at the same alpha;
 *   brand     with `--vdd-brand-accent: #e4002b` no trace of the skin's own accent, nor of any
 *             stale literal, remains anywhere — rendered, hovered or as a token — and red is used
 *             many times;
 *   on-accent a yellow brand with `--vdd-brand-on-accent: #1a1a1a` puts #1a1a1a text on the
 *             yellow primary button, in dark and in light;
 *   fonts     each skin's font reaches every chrome root, teleported ones included (a custom skin
 *             and obsidian get the library stack); a consumer :root `--vdd-font-family`, in a
 *             stylesheet after the library's, wins in every skin.
 *
 *   node scripts/gates/browser/m15.mjs                     the gate (the playground on :5188)
 *   node scripts/gates/browser/m15.mjs --write-baseline    regenerate the fixture — only for an
 *        intended visual change, and only from a stylesheet known to be right; every scene is
 *        captured twice and the two must agree before either is written
 *   node scripts/gates/browser/m15.mjs --control           a planted defect (nord redeclares its
 *        accent without the brand hook and sets --vdd-font-family itself); the gate must reject it
 *   VDD_BRANDING_REPORT=file                               also append every difference found,
 *        intended ones included, to `file`
 *
 * Chrome reports BlinkMacSystemFont as "system-ui", and color-mix() results as color(srgb …);
 * colours are compared parsed, to ±1/255.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = process.cwd()
const STYLES = join(ROOT, 'src/index.css')
const APP = process.env.VDD_APP_URL ?? 'http://localhost:5188/'
const OUT = 'artifacts/M15'
mkdirSync(OUT, { recursive: true })

const WRITE = process.argv.includes('--write-baseline')
const CONTROL = process.argv.includes('--control')
const REPORT = process.env['VDD_BRANDING_REPORT']
const FIXTURE = join(ROOT, 'scripts/gates/browser/fixtures/m15-branding-baseline.json')

const SKINS = ['vscode', 'macos', 'chrome', 'slate', 'nord', 'obsidian', 'tokyo']
const ONLY = process.env['VDD_M15_ONLY']; // development: `skin/cs` to run one scene; never set at a gate
const SCENES = SKINS.flatMap(skin => ['dark', 'light'].map(cs => ({ skin, cs }))).filter(s => !ONLY || `${s.skin}/${s.cs}` === ONLY)
const RED = '#e4002b'

/** Every --vdd-* property the stylesheet declares. */
const declaredTokens = () => [...new Set(readFileSync(STYLES, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').match(/--vdd-[a-z0-9-]+(?=\s*:)/g) ?? [])]

// ── colours ─────────────────────────────────────────────────────────────────

/** Every colour in a computed value, as [r, g, b, a] with r/g/b in 0–255. */
function colours(value) {
  const out = []
  const re = /rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g
  for (let m; (m = re.exec(value));) {
    if (m[1]) {
      const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean)
      out.push([+r, +g, +b, +a])
    } else {
      const [r, g, b, a = '1'] = m[2].split(/[\s/]+/).filter(Boolean)
      out.push([+r * 255, +g * 255, +b * 255, +a])
    }
  }
  return out
}
const skeleton = value => value.replace(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g, 'C')
const close = (c, d) => c.every((v, j) => Math.abs(v - d[j]) <= (j === 3 ? 0.005 : 1))
function sameColours(a, b) {
  if (skeleton(a) !== skeleton(b)) return false
  const ca = colours(a), cb = colours(b)
  return ca.length === cb.length && ca.every((c, i) => close(c, cb[i]))
}
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const isRgb = (c, rgb) => rgb.every((v, i) => Math.abs(c[i] - v) <= 1)

/** Each scene's own accent in 1.3.0 (vscode light gained #0066cc, the blue its light tokens used). */
const ACCENT = {
  vscode: ['#38bdf8', '#0066cc'], macos: ['#38bdf8', '#0066cc'], chrome: ['#8ab4f8', '#1a73e8'],
  slate: ['#38bdf8', '#0078d4'], nord: ['#88c0d0', '#5e81ac'], obsidian: ['#ffffff', '#000000'], tokyo: ['#bb9af7', '#9854f1'],
}
const accentOf = (skin, cs) => rgbOf(ACCENT[skin][cs === 'light' ? 1 : 0])
/**
 * The only colours 1.3.0 may change without a brand: accent-family literals a skin showed instead
 * of its own accent — the default cyan and #0066cc left in other skins, the active-state blues of
 * slate and tokyo, obsidian's violet panel toolbar — and, in obsidian, its white/black glows.
 */
const STALE = [...new Set(Object.values(ACCENT).flat())].filter(h => h !== '#ffffff' && h !== '#000000').map(rgbOf)
  .concat([[96, 165, 250], [122, 162, 247], [56, 90, 246], [167, 139, 250]])
const staleIn = skin => (skin === 'obsidian' ? STALE.concat([[255, 255, 255], [0, 0, 0]]) : STALE)

/** True when `now` differs from `before` only by stale literals turned into the scene's accent at the same alpha. */
function intended(before, now, skin, cs) {
  if (skeleton(before) !== skeleton(now)) return false
  const cb = colours(before), cn = colours(now), acc = accentOf(skin, cs), stale = staleIn(skin)
  return cb.length === cn.length && cb.every((c, i) =>
    close(c, cn[i]) || (stale.some(s => isRgb(c, s)) && isRgb(cn[i], acc) && Math.abs(c[3] - cn[i][3]) <= 0.005))
}

// ── the scene ───────────────────────────────────────────────────────────────

const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'fill', 'stroke']

/** Opens a scene with the active states on: a selected sidebar tab, radio and toggle, a focused tab, a minimised panel. */
async function openBase(page, open, skin, cs, extra = '') {
  await open(`anim=0&skin=${skin}${cs === 'light' ? '&cs=light' : ''}${extra}`)
  await page.evaluate(() => {
    const ws = window.__vdd
    ws.openPanel('p1', 'hostile', { title: 'Panel One' })
    ws.openPanel('p2', 'hostile', { title: 'Panel Two' })
    ws.openPanel('p3', 'overlay', { title: 'Overlay' })
    ws.dockPanelToWorkspaceEdge('p3', 'right')
    ws.openPanel('p4', 'hostile', { title: 'Floating' })
    ws.floatPanel('p4', { x: 60, y: 300, width: 320, height: 200 })
    ws.openPanel('p5', 'hostile', { title: 'Minimised' })
    ws.minimizePanel('p5')
  })
  await page.waitForSelector('[data-vdd-tab="p1"]')
  await page.locator('.vdd-sidebar-tab-btn[title="Layers"]').first().click()
  await page.click('.vdd-toolbar-btn[aria-label="Select"]')
  await page.click('.vdd-toolbar-btn[aria-label="Snap"]')
  await page.click('[data-vdd-tab="p1"]')
  await page.mouse.move(1, 1)
  await page.waitForTimeout(300)
}

/** The overlays on top: the flyout, a drawer, the confirm modal (the primary button), a toast, the context menu. */
async function openOverlays(page) {
  await page.click('.vdd-toolbar-btn-group')
  await page.evaluate(() => {
    const app = window.__app
    app.openLeft()
    app.openModal()
    app.toast('hello', { duration: 600000 })
    app.menu(40, 40)
  })
  await page.waitForTimeout(700)
}

/** Colour-bearing computed properties of every vdd- element under `root` and its pseudo-elements, keyed by a DOM path. */
function snapshot(page, root = 'body', tag = '') {
  return page.evaluate(([props, rootSel, prefix]) => {
    const out = {}
    const seg = el => {
      const parent = el.parentElement
      const idx = parent ? Array.prototype.indexOf.call(parent.children, el) : 0
      return `${el.tagName.toLowerCase()}${[...el.classList].filter(c => c.startsWith('vdd-')).map(c => '.' + c).join('')}:${idx}`
    }
    const path = el => { const p = []; for (let e = el; e && e !== document.body; e = e.parentElement) p.unshift(seg(e)); return p.join('>'); }
    const rootEl = document.querySelector(rootSel)
    if (!rootEl) return { [`${prefix}MISSING ${rootSel}`]: {} }
    const els = [rootEl, ...rootEl.querySelectorAll('[class*="vdd-"]')].filter(e => e === rootEl || (typeof e.className === 'string' ? e.className : e.className.baseVal))
    for (const el of els) {
      const key = prefix + path(el)
      for (const pseudo of ['', '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo || null)
        if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue
        const rec = {}
        for (const p of props) rec[p] = cs.getPropertyValue(p)
        out[key + pseudo] = rec
      }
    }
    return out
  }, [PROPS, root, tag])
}

/**
 * Every token resolved as a colour and as a shadow — inside the workspace, inside the toolbar
 * (outside the workspace: it reads what <html> carries) and on <body> (teleported chrome). Covers
 * tokens no scene renders, including ones only consumers read (--vdd-sidebar-card-*).
 */
function tokens(page, names) {
  return page.evaluate(list => {
    const out = {}
    for (const [where, sel] of [['ws', '.vdd-workspace'], ['tb', '.vdd-toolbar-strip'], ['body', 'body']]) {
      const host = document.querySelector(sel)
      const probe = document.createElement('div')
      host.appendChild(probe)
      for (const n of list) {
        probe.style.cssText = `background-color: var(${n}); box-shadow: var(${n}); color: var(${n})`
        const cs = getComputedStyle(probe)
        out[`token ${n} @${where}`] = { 'background-color': cs.backgroundColor, 'box-shadow': cs.boxShadow, color: cs.color }
      }
      probe.remove()
    }
    return out
  }, names)
}

const HOVERS = [
  '.vdd-toolbar-btn[aria-label="Pan"]',
  '.vdd-toolbar-btn-group',
  '.vdd-sidebar-tab-btn[title="Search"]',
  '[data-vdd-tab="p2"]',
  '[data-vdd-tab="p3"]',
  '.vdd-floating-window-titlebar .vdd-custom-tab-btn',
  '.vdd-taskbar-glassmorphic-item',
  '.vdd-panel-toolbar-btn',
]

async function hoverSnapshots(page) {
  const out = {}
  for (const [i, sel] of HOVERS.entries()) {
    const loc = page.locator(sel).first()
    if (!(await loc.count())) { out[`hover ${sel} MISSING`] = {}; continue; }
    await loc.hover({ force: true })
    await page.waitForTimeout(350); // past the hover transitions
    await loc.evaluate((el, m) => el.setAttribute(m, ''), `data-m15-probe-${i}`)
    Object.assign(out, await snapshot(page, `[data-m15-probe-${i}]`, `hover ${sel} | `))
    await page.mouse.move(1, 1)
    await page.waitForTimeout(350)
  }
  return out
}

/** A planted defect for `--control`: nord's accent without the brand hook, and a skin-level font. */
const plantControl = page => page.evaluate(() => {
  const s = document.createElement('style')
  s.textContent = '[data-vdd-skin="nord"] { --vdd-accent-color: #88c0d0; --vdd-font-family: Georgia, serif; }'
  document.head.appendChild(s)
})

/**
 * A scene, captured whole. A scene whose chrome is not all on screen is loaded again, once, with
 * a warning naming what was missing and what the page looked like: a run of 14 scenes once lost
 * every piece of chrome in its last scene and passed when that scene was run alone.
 */
async function captureScene(page, open, skin, cs, names, brand = '') {
  try {
    return await captureOnce(page, open, skin, cs, names, brand)
  } catch (e) {
    if (!/the scene is incomplete/.test(e.message)) throw e
    const state = await page.evaluate(() => `${location.search}, ${document.querySelectorAll('.vdd-workspace').length} workspace(s), ${document.querySelectorAll('[data-vdd-tab]').length} tab(s)`).catch(err => `unreadable: ${err.message}`)
    console.warn(`  ${e.message} (${state}; ${navigations} navigations so far) — loading it again`)
    return captureOnce(page, open, skin, cs, names, brand)
  }
}

async function captureOnce(page, open, skin, cs, names, brand) {
  await openBase(page, open, skin, cs, brand)
  if (CONTROL) await plantControl(page)
  const hovers = await hoverSnapshots(page)
  await openOverlays(page)
  const snap = { ...await snapshot(page), ...await tokens(page, names), ...hovers }
  // A scene that silently lost a piece of chrome would still "match" a baseline missing it too.
  const missing = Object.keys(snap).filter(k => k.includes('MISSING'))
  const absent = await page.evaluate(sels => sels.filter(s => !document.querySelector(s)), SCENE_PARTS)
  if (missing.length || absent.length) throw new Error(`${skin}/${cs}: the scene is incomplete: ${[...missing, ...absent].join(', ')}`)
  return snap
}

/** Every piece of chrome a scene must show, so a baseline can never be captured without one. */
const SCENE_PARTS = ['.vdd-sidebar-tab-btn.vdd-active', '.vdd-toolbar-btn-radio.vdd-active', '.vdd-toolbar-btn-toggle.vdd-active',
  '.vdd-toolbar-group-flyout', '.vdd-side-panel', '.vdd-modal-overlay', '.vdd-btn-primary', '.vdd-toast', '.vdd-context-menu',
  '.vdd-floating-window', '.vdd-panel-toolbar', '.vdd-taskbar-glassmorphic-item']

/** `key prop` → "old -> new" for every colour that differs; keys missing on either side count too. */
function diff(base, snap) {
  const out = new Map()
  for (const key of new Set([...Object.keys(base), ...Object.keys(snap)])) {
    if (!base[key] || !snap[key]) { out.set(key, base[key] ? 'gone' : 'new'); continue; }
    for (const p of new Set([...Object.keys(base[key]), ...Object.keys(snap[key])])) {
      if (!sameColours(base[key][p] ?? '', snap[key][p] ?? '')) out.set(`${key} ${p}`, `${base[key][p]} -> ${snap[key][p]}`)
    }
  }
  return out
}
const lines = d => [...d].map(([k, v]) => `${k}: ${v}`)

// ── fonts ───────────────────────────────────────────────────────────────────

/**
 * Chrome inside the workspace, beside it (toolbar, sidebar) and teleported to <body>. Not listed:
 * the few elements the stylesheet sets in `monospace` on purpose (`.vdd-btn`, the sidebar header
 * title, the drag ghost tab, the placeholders).
 */
const FONT_ROOTS = [
  '.vdd-workspace', '.vdd-workspace-tab', '.vdd-floating-window-title', '.vdd-taskbar-glassmorphic-item',
  '.vdd-toolbar-strip', '.vdd-toolbar-btn', '.vdd-sidebar-tabs-strip', '.vdd-sidebar-tab-btn',
  '.vdd-sidebar-drawer-header', '.vdd-toolbar-group-flyout', '.vdd-toolbar-group-flyout-item',
  '.vdd-context-menu', '.vdd-context-menu__item', '.vdd-side-panel', '.vdd-side-panel-title',
  '.vdd-modal-overlay', '.vdd-modal-title', '.vdd-toast-container', '.vdd-toast', '.vdd-panel-toolbar',
]
const fontsOf = page => page.evaluate(sels => Object.fromEntries(sels.map(s => {
  const el = document.querySelector(s)
  return [s, el ? getComputedStyle(el).fontFamily : 'MISSING']
})), FONT_ROOTS)

/** The library stack (obsidian, custom skins) and each skin's own. Chrome reports BlinkMacSystemFont as "system-ui", quoted. */
const OUTFIT = /^Outfit, Inter, system-ui, -apple-system, sans-serif$/
const SKIN_FONT = {
  vscode: /^-apple-system, "system-ui", "Segoe WPC", "Segoe UI", system-ui, Ubuntu, "Droid Sans", sans-serif$/,
  macos: /^-apple-system, "system-ui", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif$/,
  chrome: /^"Google Sans Text", "Google Sans", Roboto, system-ui, -apple-system, "Segoe UI", sans-serif$/,
  slate: /^"Segoe UI Variable Text", "Segoe UI", -apple-system, "system-ui", Roboto, "Helvetica Neue", sans-serif$/,
  nord: /^"Avenir Next", Nunito, "Segoe UI", system-ui, sans-serif$/,
  tokyo: /^"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace$/,
  obsidian: OUTFIT,
  'my-brand': OUTFIT,
}
const BRAND_FONT = /^"Acme Sans", Georgia, serif$/

async function fontCheck(page, open, fail, skin, brandFont) {
  await openBase(page, open, skin, 'dark')
  if (CONTROL) await plantControl(page)
  if (brandFont) {
    // The way an application does it: its own stylesheet, after the library's.
    await page.evaluate(() => {
      const s = document.createElement('style')
      s.textContent = ":root { --vdd-font-family: 'Acme Sans', Georgia, serif; }"
      document.head.appendChild(s)
    })
  }
  await openOverlays(page)
  const want = brandFont ? BRAND_FONT : SKIN_FONT[skin]
  const fonts = await fontsOf(page)
  const wrong = Object.entries(fonts).filter(([, f]) => !want.test(f))
  if (wrong.length) fail(`fonts ${skin}${brandFont ? ' + brand font' : ''}: ${wrong.slice(0, 6).map(([s, f]) => `${s} = ${f}`).join(' | ')}`)
}

// ── the gate ────────────────────────────────────────────────────────────────

const fixture = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : null
if (!WRITE && !fixture) { console.error(`M15 browser: no baseline at ${FIXTURE} — run with --write-baseline from the 1.2.0 stylesheet`); process.exit(1); }

const failures = []
const fail = msg => failures.push(msg)
const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
page.setDefaultTimeout(60000)
page.on('pageerror', e => fail(`page error: ${e.message}`))
let navigations = 0
page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; })
page.on('console', m => { if (m.type() === 'error') console.warn(`  console error: ${m.text().slice(0, 200)}`); })
/** A fresh page load per scene, so no state leaks from one scene into the next. */
const open = async query => {
  await page.goto(`${APP}?${query}`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__vdd && !!window.__app, null, { timeout: 15000 })
}
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` })

/** The checks; returns the report written to artifacts/M15/branding.json. */
async function run() {
  if (WRITE) {
    const names = declaredTokens()
    const scenes = {}
    for (const { skin, cs } of SCENES) {
      const a = await captureScene(page, open, skin, cs, names)
      const b = await captureScene(page, open, skin, cs, names)
      const d = lines(diff(a, b))
      if (d.length) { fail(`${skin}/${cs}: two captures disagree (${d.length}), e.g. ${d.slice(0, 3).join(' | ')}`); continue; }
      scenes[`${skin}/${cs}`] = a
      console.log(`  captured ${skin}/${cs}: ${Object.keys(a).length} entries`)
    }
    if (ONLY) fail('VDD_M15_ONLY is set: a partial baseline is never written')
    else if (Object.keys(scenes).length === SCENES.length) {
      mkdirSync(dirname(FIXTURE), { recursive: true })
      writeFileSync(FIXTURE, JSON.stringify({ tokens: names, scenes }))
      console.log(`  wrote ${FIXTURE}`)
    } else fail('a scene was unstable; nothing written')
    return {}
  }

  const report = {}

  // ── baseline: no brand renders as 1.2.0, except the intended fixes ──
  for (const { skin, cs } of CONTROL ? [] : SCENES) {
    const base = fixture.scenes[`${skin}/${cs}`]
    const check = async () => diff(base, await captureScene(page, open, skin, cs, fixture.tokens))
    // A stylesheet change is deterministic; a hover or entrance caught mid-flight on a loaded
    // machine is not. A scene that differs is captured once more, and only differences both
    // captures agree on count. The transient ones are reported, never silently dropped.
    let d = await check()
    if (d.size) {
      const d2 = await check()
      const transient = [...d.keys(), ...d2.keys()].filter(k => !(d.has(k) && d2.has(k)))
      if (transient.length) console.warn(`  ${skin}/${cs}: ${transient.length} transient difference(s), e.g. ${transient[0]}`)
      d = new Map([...d].filter(([k]) => d2.has(k)))
    }
    const unexpected = [...d].filter(([, v]) => { const [before, now] = v.split(' -> '); return now === undefined || !intended(before, now, skin, cs); })
    if (REPORT) appendFileSync(REPORT, lines(d).map(l => `${skin}/${cs} ${l}`).join('\n') + '\n')
    report[`${skin}/${cs}`] = { changed: d.size, unexpected: unexpected.length }
    if (unexpected.length) fail(`baseline ${skin}/${cs}: ${unexpected.length} unintended difference(s): ${lines(new Map(unexpected)).slice(0, 8).join(' | ')}`)
  }

  // ── a red brand reaches everything ──
  const redScenes = CONTROL ? [{ skin: 'nord', cs: 'dark' }] : SCENES
  for (const { skin, cs } of redScenes) {
    const snap = await captureScene(page, open, skin, cs, declaredTokens(), `&ba=${RED.slice(1)}`)
    const own = accentOf(skin, cs)
    const neutral = own.every(v => v === 0) || own.every(v => v === 255); // obsidian: white/black stay as text
    const leftovers = []
    let branded = 0
    for (const [key, rec] of Object.entries(snap)) {
      for (const [p, v] of Object.entries(rec)) {
        for (const c of colours(v)) {
          if (c[3] === 0) continue
          if (isRgb(c, rgbOf(RED))) branded++
          else if (STALE.some(s => isRgb(c, s)) || (!neutral && isRgb(c, own))) leftovers.push(`${key} ${p}: ${v}`)
        }
      }
    }
    report[`brand ${skin}/${cs}`] = { branded, leftovers: leftovers.length }
    if (leftovers.length) fail(`brand ${skin}/${cs}: ${leftovers.length} trace(s) of the original accent: ${leftovers.slice(0, 6).join(' | ')}`)
    if (branded <= 40) fail(`brand ${skin}/${cs}: the brand colour is used only ${branded} times`)
    if (skin === 'tokyo' && cs === 'dark') await shot('brand-red-tokyo')
  }

  // ── on-accent, in both schemes ──
  if (!CONTROL) {
    for (const cs of ['dark', 'light']) {
      await openBase(page, open, 'vscode', cs, '&ba=facc15&bon=1a1a1a')
      await openOverlays(page)
      const btn = await page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('.vdd-btn-primary'))
        return { bg: s.backgroundColor, fg: s.color }
      })
      await shot(`on-accent-${cs}`)
      if (!isRgb(colours(btn.bg)[0] ?? [], [250, 204, 21])) fail(`on-accent ${cs}: the primary button is ${btn.bg}, not the yellow brand`)
      if (!isRgb(colours(btn.fg)[0] ?? [], [26, 26, 26])) fail(`on-accent ${cs}: the primary button's text is ${btn.fg}, not --vdd-brand-on-accent #1a1a1a`)
      report[`on-accent ${cs}`] = btn
    }
  }

  // ── fonts ──
  const fontSkins = CONTROL ? ['nord'] : Object.keys(SKIN_FONT)
  for (const skin of fontSkins) await fontCheck(page, open, fail, skin, false)
  for (const skin of CONTROL ? ['nord'] : SKINS) await fontCheck(page, open, fail, skin, true)
  return report
}

let report = {}
try {
  report = await run()
} catch (e) {
  fail(`the run crashed: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
}
if (!WRITE) writeFileSync(`${OUT}/branding${CONTROL ? '-control' : ''}.json`, JSON.stringify({ report, failures }, null, 2))

const label = CONTROL ? 'M15 browser --control' : WRITE ? 'M15 baseline' : 'M15 browser'
if (failures.length) {
  console.error(`\n${label}: FAIL`)
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}
console.log(`\n${label}: ok`)
