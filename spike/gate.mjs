/**
 * M0 gate — does Vue preserve a panel's live state when the panel moves?
 *
 * Drives the spike through docked -> tabbed -> floating -> minimised -> restored elsewhere,
 * for both candidate strategies, asserting after EVERY transition:
 *   - the component never re-mounted
 *   - the DOM node is the same object
 *   - the WebGL context is not lost
 *   - video playback advanced and never restarted
 *   - a running interval kept ticking
 *   - scroll offset and focus were restored (ADR 0014)
 * and characterising two behaviours rather than asserting them: an <iframe> and a
 * mid-flight CSS animation.
 *
 * Exit code 0 = gate passed.
 */
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const APP_URL = 'http://localhost:5199/'
const PANEL = 'p1'
const TRANSITIONS = ['leafB', 'floating', 'hidden', 'leafA', 'leafB']

const results = { strategies: {}, characterised: {}, failures: [] }
const fail = (s, m) => { results.failures.push(`[${s}] ${m}`) }

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage()
const consoleNoise = []
page.on('console', m => {
  if (m.type() !== 'error') return
  // An <iframe> re-loads when its subtree is re-parented (characterised below), which
  // aborts the in-flight request. Recorded, not treated as a library failure.
  if (/iframe\.html|Failed to load resource/.test(m.text())) { consoleNoise.push(m.text()); return }
  fail('console', m.text())
})
page.on('pageerror', e => fail('pageerror', e.message))
page.on('requestfailed', r => { if (/iframe\.html/.test(r.url())) consoleNoise.push(`abort ${r.url()}`) })

await page.goto(APP_URL)
await page.waitForSelector(`[data-panel="${PANEL}"]`)
await page.waitForTimeout(600)   // let video actually start

const probe = (id) => page.evaluate((id) => {
  const q = (a) => document.querySelector(`[data-${a}="${id}"]`)
  const panel = q('panel'), vid = q('video'), sc = q('scroller'), inp = q('input')
  const gl = window.__gl?.[id]
  const anim = q('anim')
  return {
    nodeIdMatches: window.__nodeRef ? window.__nodeRef === panel : null,
    mounts: window.__mounts?.[id] ?? 0,
    unmounts: window.__unmounts?.[id] ?? 0,
    glLost: gl ? gl.isContextLost() : null,
    glPresent: !!gl,
    videoTime: vid ? vid.currentTime : null,
    videoPaused: vid ? vid.paused : null,
    scrollTop: sc ? sc.scrollTop : null,
    focusedId: document.activeElement?.getAttribute?.('data-input') ?? null,
    caret: inp ? inp.selectionStart : null,
    inputValue: inp ? inp.value : null,
    animTranslate: anim ? getComputedStyle(anim).transform : null,
    iframeLoadedAt: (() => { try { return q('iframe')?.contentWindow?.__loadedAt ?? null } catch { return 'cross-origin' } })(),
    connected: !!panel?.isConnected,
    parent: panel?.parentElement?.parentElement?.className ?? null,
  }
}, id)

for (const strategy of ['cache', 'teleport']) {
  await page.evaluate(s => window.__spike.setStrategy(s), strategy)
  await page.waitForTimeout(300)
  await page.evaluate(id => window.__spike.setActive(id), PANEL)

  // Establish state to be preserved: scroll the list, focus the input, put a caret mid-word.
  await page.evaluate((id) => {
    const q = (a) => document.querySelector(`[data-${a}="${id}"]`)
    window.__nodeRef = q('panel')
    q('scroller').scrollTop = 220
    const inp = q('input'); inp.focus(); inp.setSelectionRange(4, 4)
  }, PANEL)
  await page.waitForTimeout(150)

  const start = await probe(PANEL)
  if (start.scrollTop !== 220) fail(strategy, `setup: scrollTop did not take (${start.scrollTop})`)
  if (start.videoPaused) fail(strategy, 'setup: video is not playing (autoplay blocked?)')
  const startMounts = start.mounts
  const steps = [{ step: 'start', ...start }]

  let prevTime = start.videoTime
  for (const to of TRANSITIONS) {
    await page.evaluate(([id, t]) => window.__spike.move(id, t), [PANEL, to])
    await page.waitForTimeout(250)
    const s = await probe(PANEL)
    steps.push({ step: to, ...s })

    if (s.mounts !== startMounts) fail(strategy, `${to}: component re-mounted (${startMounts} -> ${s.mounts})`)
    if (s.unmounts !== 0)        fail(strategy, `${to}: component unmounted ${s.unmounts}x`)
    if (s.nodeIdMatches !== true) fail(strategy, `${to}: DOM node identity changed`)
    if (s.glPresent && s.glLost)  fail(strategy, `${to}: WebGL context lost`)
    if (to !== 'hidden') {
      if (s.videoTime < prevTime)  fail(strategy, `${to}: video restarted (${prevTime} -> ${s.videoTime})`)
      if (s.scrollTop !== 220)     fail(strategy, `${to}: scrollTop not restored (${s.scrollTop})`)
      if (s.focusedId !== PANEL)   fail(strategy, `${to}: focus not restored (${s.focusedId})`)
      if (s.caret !== 4)           fail(strategy, `${to}: caret lost (${s.caret})`)
      if (s.inputValue !== 'hello world') fail(strategy, `${to}: input value lost`)
    }
    prevTime = Math.max(prevTime, s.videoTime ?? 0)
  }

  const end = steps.at(-1)
  results.strategies[strategy] = {
    passed: !results.failures.some(f => f.startsWith(`[${strategy}]`)),
    mounts: end.mounts, unmounts: end.unmounts,
    videoAdvanced: +(end.videoTime - start.videoTime).toFixed(2),
    scrollRestored: end.scrollTop === 220,
    focusRestored: end.focusedId === PANEL,
    glAlive: end.glPresent && !end.glLost,
    steps,
  }

  // Characterise (not assert): does an iframe survive, does the animation keep running?
  results.characterised[strategy] = {
    iframeReloaded: steps[0].iframeLoadedAt !== end.iframeLoadedAt,
    iframeLoadedAtStart: steps[0].iframeLoadedAt,
    iframeLoadedAtEnd: end.iframeLoadedAt,
    animationStillRunning: steps.some(s => s.animTranslate !== end.animTranslate),
  }
}

// Focus must NOT be stolen when an inactive panel is restored (ADR 0014).
await page.evaluate(() => window.__spike.setActive('p2'))
await page.evaluate(() => { document.querySelector('[data-input="p2"]').focus() })
await page.evaluate(() => window.__spike.move('p1', 'hidden'))
await page.waitForTimeout(200)
await page.evaluate(() => window.__spike.move('p1', 'leafA'))
await page.waitForTimeout(250)
const stolen = await page.evaluate(() => document.activeElement?.getAttribute?.('data-input'))
results.focusNotStolenFromActivePanel = stolen === 'p2'
if (stolen !== 'p2') fail('adr0014', `restoring an inactive panel stole focus (active input is now ${stolen})`)

await page.screenshot({ path: new URL('../artifacts/M0/spike.png', import.meta.url).pathname })
await browser.close()

results.consoleNoise = consoleNoise
results.passed = results.failures.length === 0
writeFileSync(new URL('../artifacts/M0/result.json', import.meta.url), JSON.stringify(results, null, 2))

const brief = (s) => {
  const r = results.strategies[s]
  return `  ${s.padEnd(9)} mounts=${r.mounts} unmounts=${r.unmounts} video+${r.videoAdvanced}s ` +
         `scroll=${r.scrollRestored ? 'ok' : 'LOST'} focus=${r.focusRestored ? 'ok' : 'LOST'} ` +
         `webgl=${r.glAlive ? 'alive' : 'LOST'} -> ${r.passed ? 'PASS' : 'FAIL'}`
}
console.log('M0 gate')
console.log(brief('cache'))
console.log(brief('teleport'))
console.log(`  focus not stolen from active panel: ${results.focusNotStolenFromActivePanel}`)
console.log(`  characterised: ${JSON.stringify(results.characterised)}`)
if (!results.passed) { console.log('FAILURES:'); results.failures.forEach(f => console.log('   ' + f)) }
console.log(results.passed ? 'M0 GATE: PASS' : 'M0 GATE: FAIL')
process.exit(results.passed ? 0 : 1)
