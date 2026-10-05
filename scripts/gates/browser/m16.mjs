// gate:app playground
/**
 * M16 browser gate — brand surfaces and corner scale (1.4.0), in real Chrome. The port of
 * react-dockable-desktop 7.3.0's `radius.browser.ts` and the brand-surface cases of its
 * `branding.browser.ts`, on the 14 branding scenes M15 uses (scripts/gates/lib/branding-scenes.mjs).
 *
 *   corners    the four computed corner radii of every vdd- element and its ::before/::after match
 *              the 1.3.0 baseline with --vdd-radius-scale unset; at 0 every scaled corner is 0px, at
 *              1.5 every one is 1.5× its baseline; circles and pills (50%, 999px) never change
 *   surfaces   with --vdd-brand-surface / --vdd-brand-text set (navy dark, warm grey light), no
 *              colour of any skin's own surface palette remains — rendered, hovered or as a token —
 *              the workspace, panel and tab bar are three distinct colours, and text on the panel
 *              meets 4.5:1 (muted text 3:1)
 *   one input  only one of the two set leaves the scene exactly as M15's 1.2.0 baseline allows
 *
 * With nothing set, colours are M15's job: its baseline gate still has to pass unchanged.
 *
 *   node scripts/gates/browser/m16.mjs                     the gate (the playground on :5188)
 *   node scripts/gates/browser/m16.mjs --write-baseline    capture the corner fixture — only from
 *        a stylesheet known to be right; every scene is captured twice and the two must agree
 */
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SKINS, SCENE_PARTS, FROSTED, colours, diff, hoverSnapshots, intended, isRgb, lines, openBase, openOverlays, settle,
  rgbOf, snapshot, tokens,
} from '../lib/branding-scenes.mjs'

const ROOT = process.cwd()
const STYLES = join(ROOT, 'src/index.css')
const APP = process.env.VDD_APP_URL ?? 'http://localhost:5188/'
const OUT = 'artifacts/M16'
mkdirSync(OUT, { recursive: true })

const WRITE = process.argv.includes('--write-baseline')
const FIXTURE = join(ROOT, 'scripts/gates/browser/fixtures/m16-radius-baseline.json')
const COLOUR_FIXTURE = join(ROOT, 'scripts/gates/browser/fixtures/m15-branding-baseline.json')
const ONLY = process.env['VDD_M16_ONLY'] // development: `skin/cs` to run one scene; never set at a gate
const SCENES = SKINS.flatMap(skin => ['dark', 'light'].map(cs => ({ skin, cs }))).filter(s => !ONLY || `${s.skin}/${s.cs}` === ONLY)
const BRAND = { dark: { bs: '0b1f3a', bt: 'e8eef7' }, light: { bs: 'f4f1ec', bt: '2b2620' } }
const CORNERS = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']

const css = readFileSync(STYLES, 'utf8')
const declaredTokens = [...new Set(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/--vdd-[a-z0-9-]+(?=\s*:)/g) ?? [])]

/**
 * Every skin colour a brand surface replaces: the fallbacks written inside var(--vdd--b-…, <colour>).
 * Pure white and black are left out — they are also the neutral tints and shades every skin keeps.
 */
const PALETTE = [...css.matchAll(/var\(--vdd--b-[\w-]+, (#[0-9a-fA-F]{6}|rgb\((\d+) (\d+) (\d+)\))\)/g)]
  .map(m => m[1].startsWith('#') ? rgbOf(m[1]) : [+m[2], +m[3], +m[4]])
  .filter(c => !c.every(v => v === 0) && !c.every(v => v === 255))

// ── corners ─────────────────────────────────────────────────────────────────

/** Every vdd- element's four corners, keyed by a DOM path; elements with no rounded corner are left out. */
const radii = page => page.evaluate(([corners, frostedSrc]) => {
  const frosted = new RegExp(frostedSrc)
  const out = {}
  // Keyed by library classes, not position (1.8.x): an element's key is its nearest
  // library-classed ancestor's key plus its own tag and library classes, numbered (#2, #3…)
  // only where two elements would otherwise share one. A wrapper without a library class, or a
  // sibling of a different kind, no longer renames everything after it.
  const keyOf = new Map()
  const seen = new Map()
  for (const e of document.querySelectorAll('[class*="vdd-"]')) {
    const own = [...e.classList].filter(c => c.startsWith('vdd-'))
    if (!own.length) continue
    let up = e.parentElement
    while (up && up !== document.body && !keyOf.has(up)) up = up.parentElement
    const raw = `${up && keyOf.has(up) ? keyOf.get(up) + '>' : ''}${e.tagName.toLowerCase()}${own.map(c => '.' + c).join('')}`
    const n = (seen.get(raw) ?? 0) + 1
    seen.set(raw, n)
    keyOf.set(e, n === 1 ? raw : `${raw}#${n}`)
  }
  const path = el => keyOf.get(el) ?? ''
  for (const el of document.querySelectorAll('[class*="vdd-"]')) {
    if (!(typeof el.className === 'string' ? el.className : el.className.baseVal)) continue
    for (const pseudo of ['', '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo || null)
      if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue
      const r = corners.map(c => cs.getPropertyValue(c))
      if (r.every(v => v === '0px')) continue
      // A frosted container's ::before (1.5.0) takes border-radius: inherit — its corners are its element's.
      if (pseudo === '::before' && frosted.test(path(el).split('>').pop() ?? '')) continue
      out[path(el) + pseudo] = r
    }
  }
  return out
}, [CORNERS, FROSTED.source])

const round = v => v === '50%' || v === '999px'
const px = v => /^-?[\d.]+px$/.test(v) ? parseFloat(v) : NaN
const matches = (base, v, scale) => (round(base) || Number.isNaN(px(base)) ? v === base : Math.abs(px(v) - px(base) * scale) <= 0.01)

function cornerMismatches(base, now, scale) {
  const out = []
  const none = ['0px', '0px', '0px', '0px']
  for (const key of new Set([...Object.keys(base), ...Object.keys(now)])) {
    const b = base[key] ?? none, n = now[key] ?? none
    b.forEach((v, i) => { if (!matches(v, n[i], scale)) out.push(`${key} ${CORNERS[i]}: ${v} -> ${n[i]} (scale ${scale})`) })
  }
  return out
}

// ── the harness ─────────────────────────────────────────────────────────────

const failures = []
const fail = msg => failures.push(msg)
const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
page.setDefaultTimeout(60000)
page.on('pageerror', e => fail(`page error: ${e.message}`))
const open = async (query) => {
  await page.goto(`${APP}?${query}`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__vdd && !!window.__app, null, { timeout: 15000 })
}

/** The scene's chrome all open, without the hover walk; throws a named failure when a piece is missing. */
async function chrome(skin, cs, extra = '') {
  await openBase(page, open, skin, cs, extra)
  await openOverlays(page)
  const absent = await page.evaluate(sels => sels.filter(s => !document.querySelector(s)), SCENE_PARTS)
  if (absent.length) throw new Error(`${skin}/${cs}${extra}: the scene is incomplete: ${absent.join(', ')}`)
}

/** A scene with every piece of chrome open, after the hover walk; returns the hover snapshots. */
async function scene(skin, cs, extra = '') {
  await openBase(page, open, skin, cs, extra)
  const hovers = await hoverSnapshots(page)
  await openOverlays(page)
  const absent = await page.evaluate(sels => sels.filter(s => !document.querySelector(s)), SCENE_PARTS)
  if (absent.length) throw new Error(`${skin}/${cs}${extra}: the scene is incomplete: ${absent.join(', ')}`)
  return hovers
}

async function run() {
  const report = {}
  const fixture = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : null

  if (WRITE) {
    const scenes = {}
    for (const { skin, cs } of SCENES) {
      await scene(skin, cs); const a = await radii(page)
      await scene(skin, cs); const b = await radii(page)
      const d = cornerMismatches(a, b, 1)
      if (d.length) { fail(`${skin}/${cs}: two captures disagree (${d.length}), e.g. ${d[0]}`); continue }
      if (Object.keys(a).length < 10) { fail(`${skin}/${cs}: only ${Object.keys(a).length} rounded elements captured`); continue }
      scenes[`${skin}/${cs}`] = a
      console.log(`  captured ${skin}/${cs}: ${Object.keys(a).length} rounded elements`)
    }
    if (ONLY) fail('VDD_M16_ONLY is set: a partial baseline is never written')
    else if (Object.keys(scenes).length === SCENES.length) { writeFileSync(FIXTURE, JSON.stringify({ scenes })); console.log(`  wrote ${FIXTURE}`) }
    return report
  }
  if (!fixture) { fail(`no corner baseline at ${FIXTURE} — run with --write-baseline from the 1.3.0 stylesheet`); return report }
  if (PALETTE.length < 100) fail(`the surface palette parsed to ${PALETTE.length} colours — the parse is wrong`)
  const colourBase = JSON.parse(readFileSync(COLOUR_FIXTURE, 'utf8'))

  for (const { skin, cs } of SCENES) {
    const base = fixture.scenes[`${skin}/${cs}`]
    // ── corners: unset, 0 and 1.5 ──
    // One page for the three scales. --vdd-radius-scale is a custom property on :root (the
    // playground's `rs` only sets it at start-up), so each scale is set on the open scene, which
    // settles before its corners are read. No hover walk: corners never read it.
    await chrome(skin, cs)
    for (const scale of [1, 0, 1.5]) {
      await page.evaluate((s) => {
        if (s === 1) document.documentElement.style.removeProperty('--vdd-radius-scale')
        else document.documentElement.style.setProperty('--vdd-radius-scale', String(s))
      }, scale)
      await settle(page, 700)
      const d = cornerMismatches(base, await radii(page), scale)
      report[`corners ${skin}/${cs} @${scale}`] = d.length
      if (d.length) fail(`corners ${skin}/${cs} at scale ${scale}: ${d.length} wrong, e.g. ${d.slice(0, 4).join(' | ')}`)
    }

    // ── surfaces ──
    const { bs, bt } = BRAND[cs]
    const hovers = await scene(skin, cs, `&bs=${bs}&bt=${bt}`)
    const snap = { ...await snapshot(page), ...await tokens(page, declaredTokens), ...hovers }
    const leftovers = []
    for (const [key, rec] of Object.entries(snap)) {
      for (const [p, v] of Object.entries(rec)) {
        // Text on a solid accent fill is --vdd-brand-on-accent's, not a surface.
        if (/vdd-btn-primary|vdd-dock-target-box--active/.test(key) && /^(color|outline-color)$/.test(p)) continue
        for (const c of colours(v)) if (c[3] > 0 && PALETTE.some(s => isRgb(c, s))) leftovers.push(`${key} ${p}: ${v}`)
      }
    }
    if (leftovers.length) fail(`surfaces ${skin}/${cs}: ${leftovers.length} skin colour(s) left: ${leftovers.slice(0, 5).join(' | ')}`)
    const token = n => colours(snap[`token ${n} @ws`]?.['background-color'] ?? '')[0] ?? [0, 0, 0, 0]
    const over = (top, under) => top.slice(0, 3).map((v, i) => v * top[3] + under[i] * (1 - top[3]))
    const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
    const ws = token('--vdd-bg-workspace'), panel = over(token('--vdd-bg-panel'), ws), bar = over(token('--vdd-bg-tab-bar'), ws)
    const layers = [ws.slice(0, 3), panel, bar].map(c => c.map(Math.round).join(','))
    if (new Set(layers).size !== 3) fail(`surfaces ${skin}/${cs}: workspace / panel / tab bar are not distinct: ${layers.join(' | ')}`)
    const main = contrast(token('--vdd-text-primary'), panel), muted = contrast(token('--vdd-text-secondary'), panel)
    if (main < 4.5) fail(`surfaces ${skin}/${cs}: text on the panel is ${main.toFixed(2)}:1, under 4.5:1`)
    if (muted < 3) fail(`surfaces ${skin}/${cs}: muted text on the panel is ${muted.toFixed(2)}:1, under 3:1`)
    report[`surfaces ${skin}/${cs}`] = { leftovers: leftovers.length, layers, contrast: +main.toFixed(2), muted: +muted.toFixed(2) }
    if (skin === 'nord' || skin === 'macos') await page.screenshot({ path: `${OUT}/surface-${skin}-${cs}.png` })
  }

  // ── both inputs, or neither ──
  for (const [skin, cs, only] of ONLY ? [] : [['vscode', 'dark', 'bs'], ['nord', 'light', 'bt']]) {
    const hovers = await scene(skin, cs, `&${only}=${BRAND[cs][only]}`)
    const snap = { ...await snapshot(page), ...await tokens(page, colourBase.tokens), ...hovers }
    const unexpected = [...diff(colourBase.scenes[`${skin}/${cs}`], snap)].filter(([, v]) => {
      const [before, now] = v.split(' -> ')
      return now === undefined || !intended(before, now, skin, cs)
    })
    report[`only ${only} ${skin}/${cs}`] = unexpected.length
    if (unexpected.length) fail(`only ${only} set, ${skin}/${cs}: ${unexpected.length} change(s): ${lines(new Map(unexpected)).slice(0, 4).join(' | ')}`)
  }
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
if (!WRITE) writeFileSync(`${OUT}/surfaces.json`, JSON.stringify({ report, failures }, null, 2))

const label = WRITE ? 'M16 baseline' : 'M16 browser'
if (failures.length) {
  console.error(`\n${label}: FAIL`)
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}
console.log(`\n${label}: ok`)
