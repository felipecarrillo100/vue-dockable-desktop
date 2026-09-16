/**
 * M13 browser gate — no rule in the shipped stylesheet is dead.
 *
 * The other half of the correspondence check, and the half that needs a browser. A third of
 * the library's class names are emitted from script-level constants — a class map in the
 * overlay frame, a `tabClass()` function, the toast entry classes, the drag `activeClasses`
 * arrays — none of which a static scan of templates can see. Guessing at them with regexes
 * produced a list of 34 "dead" rules that were all false positives, so this reads the live
 * DOM instead: tour every state, collect every class actually present, and compare.
 *
 * A dead rule is the defect this exists to catch, and the library has shipped it four times
 * (divergence D9: `.rdd-floating-window.maximized` against a rendered `rdd-maximized`, so a
 * maximized window kept its rounded corners and shadow). A rule that matches nothing looks
 * exactly like styling and does nothing at all.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { classNames } from '../lib/css.mjs'
import { CONSUMER_HOOKS, OPEN_ENDED_PREFIXES } from '../lib/emitted.mjs'

const APP = 'http://localhost:5188/'
const OUT = 'artifacts/M13'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (step, msg) => failures.push(`[${step}] ${msg}`)

/**
 * States a scripted tour genuinely cannot reach, each with the reason.
 *
 * Kept short and specific on purpose: "the tour cannot reach it" is the excuse a dead rule
 * would hide behind, so every entry has to say why rather than just appear.
 */
const UNREACHABLE = new Map([
  ['vdd-fill-viewport', 'an opt-in class the consumer puts on their own element, not one the library emits'],
  ['vdd-scrollbar-hidden', 'likewise — offered for a consumer to apply to their own scroller'],
  ['vdd-cursor-move', 'applied to the document body only while a pointer drag is mid-flight'],
  ['vdd-resizing-row-active', 'a row-split resize drag mid-flight'],
  ['vdd-resizing-col-active', 'a column-split resize drag mid-flight'],
  ['vdd-resizing-active', 'any resize drag mid-flight'],
  ['vdd-toast--fade-entering', 'only with animation="fade", which the tour does not set'],
  ['vdd-toast--entering-left', 'only with a left-hand toast container'],
  ['vdd-toast-container--newest-top', 'only with newestOnTop'],
  ['vdd-panel-float--snapping', 'armed only between a snap-range pointermove and its release'],
  ['vdd-long-press-active', 'only during a touch long-press, which m7 covers with CDP'],
])

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
page.on('pageerror', e => fail('pageerror', e.message))
page.on('console', m => {
  const text = m.text()
  if (m.type() !== 'error') return
  if (/Failed to load resource/.test(text)) return
  // The tour opens an unregistered panel on purpose, to render the placeholder. The library
  // warning that produces is the correct behaviour, not a gate failure.
  if (/no component is registered/i.test(text)) return
  fail('console', text)
})

/**
 * A page-side recorder for every class the document ever carries.
 *
 * Polling the DOM from the gate loses every transient class: an entry animation's class is
 * swapped for `--visible` one `requestAnimationFrame` later, which is sooner than a
 * round-trip to the page. A `MutationObserver` inside the page sees each one as it is added,
 * so a class that exists for a single frame is still observed — and the alternative was to
 * declare it unreachable, which would have been an exemption covering for a blind spot
 * rather than for a genuinely unreachable state.
 */
await page.addInitScript(() => {
  const seen = new Set()
  window.__vddSeen = seen
  const take = (el) => {
    if (el.classList) for (const cls of el.classList) if (cls.startsWith('vdd-')) seen.add(cls)
  }
  const sweep = (root) => {
    take(root)
    if (root.querySelectorAll) for (const el of root.querySelectorAll('*')) take(el)
  }
  const observe = () => {
    sweep(document.documentElement)
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') take(r.target)
        for (const node of r.addedNodes) if (node.nodeType === 1) sweep(node)
      }
    }).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class'],
    })
  }
  if (document.documentElement) observe()
  else document.addEventListener('DOMContentLoaded', observe)
})

await page.goto(APP, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__vdd && !!window.__app, null, { timeout: 15000 })
await page.waitForTimeout(400)

/**
 * Every class seen so far: the recorder's accumulated set, unioned with what is on screen
 * right now. The live read is kept as a belt-and-braces check in case the observer is ever
 * installed too late.
 */
const snapshot = () => page.evaluate(() => {
  const found = new Set(window.__vddSeen ?? [])
  for (const el of document.querySelectorAll('*')) {
    for (const cls of el.classList) if (cls.startsWith('vdd-')) found.add(cls)
  }
  return [...found]
})

const seen = new Set()
const tour = []
/** Run one step, then fold whatever it rendered into the running set. */
const step = async (name, fn) => {
  try {
    await fn()
    await page.waitForTimeout(220)
  } catch (e) {
    fail(name, e.message)
  }
  const classes = await snapshot()
  const added = classes.filter(c => !seen.has(c))
  for (const c of classes) seen.add(c)
  tour.push({ step: name, total: seen.size, added: added.length })
}

/**
 * Click, with a short timeout.
 *
 * The default 30s turns one unreachable control into a five-minute gate run, and the useful
 * information — *which* control and why — arrives just as late. Three seconds is far longer
 * than any of this takes when it works.
 */
const act = (selector) => page.locator(selector).first().click({ timeout: 3000 })
const drive = (fn, ...args) => page.evaluate(fn, ...args)

// ── the tour ───────────────────────────────────────────────────────────────
await step('initial', async () => {})

await step('panels and tabs', async () => {
  await act('[data-act="open-a"]')
  await act('[data-act="open-b"]')
  await act('[data-act="open-ov"]')
  // A panel with an icon, so the tab's and titlebar's icon slots render.
  await act('[data-act="open-icon"]')
})

await step('a floating window with a title icon', async () => {
  await drive(() => window.__vdd.floatPanel('ico'))
})
await step('...docked back', async () => {
  await drive(() => window.__vdd.dockPanel('ico'))
})

await step('split and dock', async () => {
  await act('[data-act="dock-r"]')
  await act('[data-act="split"]')
})

await step('tab focus states', async () => {
  // Focused vs unfocused-but-selected is two different classes, and only reachable by
  // selecting a tab in one group while another group holds the active panel.
  await drive(() => {
    window.__vdd.focusPanel('b')
    window.__vdd.focusPanel('ov')
  })
})

await step('floating window', async () => { await act('[data-act="float"]') })
await step('anchored window', async () => { await act('[data-act="anchor"]') })
await step('maximized window', async () => { await act('[data-act="max"]') })
await step('restored window', async () => { await act('[data-act="max"]') })

await step('taskbar: always', async () => { await act('[data-act="min"]') })
await step('taskbar: compact', async () => { await drive(() => { window.__taskbar.value = 'compact' }) })
await step('taskbar: autohide', async () => { await drive(() => { window.__taskbar.value = 'autohide' }) })

await step('taskbar preview', async () => {
  const icon = page.locator('[data-vdd-taskbar-item]').first()
  if (await icon.count()) await icon.hover()
})

await step('taskbar overflow: scroll buttons', async () => {
  // The scroll buttons render only when the strip actually overflows.
  await drive(() => window.__app.fillTaskbar())
})

await step('taskbar preview: the letter fallback', async () => {
  // A panel with disableLivePreview shows its initial instead of a live thumbnail.
  const quiet = page.locator('[data-vdd-taskbar-item="quiet-1"]')
  if (await quiet.count()) {
    await quiet.hover()
    await page.waitForTimeout(200)
  }
})

await step('taskbar emptied again', async () => {
  await drive(() => window.__app.clearTaskbar())
})
await step('taskbar: back to always', async () => {
  await drive(() => { window.__taskbar.value = 'always' })
  await act('[data-act="restore"]')
})

await step('sidebar drawer', async () => { await drive(() => { window.__app.openTab.value = 'layers' }) })
await step('secondary sidebar drawer', async () => { await drive(() => { window.__app.secondaryTab.value = 'search' }) })

await step('toolbar radio and toggle', async () => {
  await act('[data-vdd-toolbar-item="pan"]')
  await act('[data-vdd-toolbar-item="snap"]')
})
await step('toolbar group flyout', async () => { await act('[data-vdd-toolbar-item="draw"]') })
await step('toolbar flyout selection', async () => {
  const item = page.locator('[data-vdd-flyout-item="line"]')
  if (await item.count()) await item.click()
})
await step('toolbar hidden', async () => { await drive(() => { window.__app.toolbarVisible.value = false }) })
await step('toolbar shown', async () => { await drive(() => { window.__app.toolbarVisible.value = true }) })
await step('toolbar on every edge', async () => {
  // Each edge has its own rules — orientation, borders, the accent bar on an active item.
  for (const position of ['right', 'top', 'bottom', 'left']) {
    await drive((p) => { window.__app.toolbarPosition.value = p }, position)
    await page.waitForTimeout(140)
    const shot = await snapshot()
    for (const c of shot) seen.add(c)
  }
})
await step('animations opted out', async () => {
  await drive(() => { window.__app.animations.value = false })
})
await step('animations back on', async () => {
  await drive(() => { window.__app.animations.value = true })
})

await step('context menu with submenu', async () => {
  await drive(() => window.__app.menu(500, 300))
  const parent = page.locator('.vdd-context-menu__item--has-submenu').first()
  if (await parent.count()) await parent.hover()
})
await step('context menu dismissed', async () => { await page.keyboard.press('Escape') })

await step('tab context menu', async () => {
  const tab = page.locator('[data-vdd-tab]').first()
  if (await tab.count()) await tab.click({ button: 'right' })
})
await step('tab menu dismissed', async () => { await page.keyboard.press('Escape') })

await step('side panels', async () => {
  await drive(() => { window.__app.openLeft(); window.__app.openRight() })
})
await step('modal with alert banner', async () => { await drive(() => window.__app.openModal()) })
await step('modal dismissed', async () => { await page.keyboard.press('Escape') })

await step('every confirmation alert type', async () => {
  // Four types, four rules. Opened as a stack so all four banners are on screen at once.
  await drive(() => {
    for (const type of ['info', 'warning', 'success', 'danger']) window.__app.openConfirm(type)
  })
})
await step('a modal with an icon', async () => { await drive(() => window.__app.openIconModal()) })

await step('every modal size', async () => {
  // Five sizes, five max-width rules. `auto` is the default and the other four are opt-in.
  await drive(() => {
    for (const size of ['small', 'medium', 'large', 'fullscreen', 'auto']) window.__app.openSized(size)
  })
})

await step('confirmations and sized modals dismissed', async () => {
  await drive(() => window.__vdd.overlays.closeAllModals())
})

await step('an unregistered panel', async () => {
  // A saved layout can name a component the app no longer registers, so the library renders
  // a placeholder rather than an empty box — and says so in the console.
  await drive(() => window.__vdd.openPanel('gone', 'no-such-component'))
})

await step('clear the overlays before the panel-overlay section', async () => {
  // Teleported chrome from the sections above sits over the workspace, and a control under a
  // toast or a modal curtain is not clickable — which is exactly how the search step failed,
  // reported by this gate as a 30-second click timeout rather than as a wrong class.
  await drive(() => {
    window.__app.toast.dismiss()
    window.__vdd.overlays.closeAll()
    window.__vdd.closeContextMenu()
  })
  await page.keyboard.press('Escape')
})

await step('panel overlay', async () => {
  // The overlay panel has to be the visible tab for its own chrome to render.
  await drive(() => { window.__vdd.focusPanel('ov') })
})
await step('overlay widget drag and dropzones', async () => {
  const header = await page.locator('[data-vdd-widget="free"] [data-vdd-widget-header]').boundingBox()
  if (header) {
    await page.mouse.move(header.x + 40, header.y + header.height / 2)
    await page.mouse.down()
    await page.mouse.move(header.x + 40 - 120, header.y + header.height / 2 - 90, { steps: 8 })
    // Snapshot mid-drag: the drop zones and the dragging-active body class only exist now.
    const mid = await snapshot()
    for (const c of mid) seen.add(c)
    await page.mouse.up()
  }
})
await step('overlay panel toolbar states', async () => {
  // A toggle in the *panel* toolbar, which is a different component from the workspace one.
  const toggle = page.locator('[data-vdd-panel-toolbar="top"] button[aria-pressed]').first()
  if (await toggle.count()) await toggle.click()
})

await step('overlay toolbar search, expanded with results', async () => {
  /**
   * Dispatched rather than clicked, deliberately.
   *
   * This gate asks *which classes render*, not whether a control is hittable — that is what
   * the M8 and M11 gates measure, with `elementFromPoint`. Driving through a real click makes
   * this step fail whenever anything earlier in the tour happens to leave chrome over the
   * toolbar, which reports a stale-looking "dead rule" for a rule that is perfectly alive.
   * It cost a debugging session to learn that, so the tour now separates the two questions.
   */
  await drive(() => document.querySelector('[data-vdd-search-toggle]')?.click())
  await page.waitForTimeout(150)
  const input = page.locator('[data-vdd-search-input]')
  if (await input.count()) {
    await input.fill('road')
    // The field debounces for 300ms before it asks, then measures and places the dropdown.
    await page.waitForTimeout(700)
  }
})

await step('overlay widget dropped on a corner zone', async () => {
  const header = await page.locator('[data-vdd-widget="card"] [data-vdd-widget-header]').boundingBox()
  const root = await page.locator('[data-vdd-panel-overlay]').boundingBox()
  if (header && root) {
    await page.mouse.move(header.x + 40, header.y + header.height / 2)
    await page.mouse.down()
    // Into the bottom-right corner zone, so the zone renders its hovered state.
    await page.mouse.move(root.x + root.width - 30, root.y + root.height - 30, { steps: 10 })
    const mid = await snapshot()
    for (const c of mid) seen.add(c)
    await page.mouse.up()
  }
})

await step('toasts, all four types', async () => {
  // maxVisible defaults to 3, so a fourth toast is *queued* and renders nothing — which is
  // how `.vdd-toast--error` first looked like a dead rule.
  await drive(() => { window.__app.toastMax.value = 6; window.__app.toastProgress.value = true })
  await page.waitForTimeout(80)
  await drive(() => {
    window.__app.toast.info('info', { duration: 0 })
    window.__app.toast.success('success', { duration: 0 })
    window.__app.toast.warning('warning', { duration: 0 })
    window.__app.toast.error('error', { duration: 0 })
    // The progress bar and the paused state both belong to a toast that has a *timer*, so a
    // sticky one renders neither — which is how both first looked like dead rules. A long
    // duration keeps it on screen for the rest of the tour without expiring.
    window.__app.toast.info('timed', { id: 'timed', duration: 600000 })
  })
})

await step('a toast mid-entry', async () => {
  // The entry class lasts one frame — rAF swaps it for `--visible` — so this snapshots with
  // no settling wait at all rather than exempting it.
  await drive(() => { window.__app.toast.info('entering', { id: 'entering', duration: 0 }) })
  const mid = await snapshot()
  for (const c of mid) seen.add(c)
})

await step('a toast paused by hover', async () => {
  // Only the timed one can pause: the handler returns early for a sticky toast.
  const card = page.locator('[data-vdd-toast="timed"]')
  if (await card.count()) await card.hover()
})

await step('a toast mid-exit', async () => {
  await drive(() => { window.__app.toast.dismiss('entering') })
  const mid = await snapshot()
  for (const c of mid) seen.add(c)
})

await step('toast container, every position', async () => {
  for (const position of ['top-left', 'bottom-left', 'bottom-right', 'top-right']) {
    await drive((p) => { window.__app.toastPosition.value = p }, position)
    await page.waitForTimeout(120)
    const shot = await snapshot()
    for (const c of shot) seen.add(c)
  }
  await drive(() => { window.__app.toast.dismiss() })
})

await step('grid drag: drop targets, edge zones and a hovered corner', async () => {
  const tab = await page.locator('[data-vdd-tab]').first().boundingBox()
  const viewport = await page.locator('.vdd-workspace-viewport').boundingBox()
  if (tab && viewport) {
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2)
    await page.mouse.down()
    await page.mouse.move(tab.x + 260, tab.y + 220, { steps: 10 })
    const mid = await snapshot()
    for (const c of mid) seen.add(c)
    // Rest on a drop-target box: armed and the preview highlight only exist while the
    // pointer is actually over one, not merely while a drag is in flight.
    const target = await page.locator('.vdd-dock-target-box').first().boundingBox()
    if (target) {
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 })
      await page.waitForTimeout(120)
      const armed = await snapshot()
      for (const c of armed) seen.add(c)
    }
    // A workspace edge, which arms a different set of zones.
    await page.mouse.move(viewport.x + 6, viewport.y + viewport.height / 2, { steps: 8 })
    const edge = await snapshot()
    for (const c of edge) seen.add(c)
    // Onto a tab's right half, which is the only way the right-hand insertion indicator
    // renders — the left-hand one is what hovering the left half gives.
    const other = await page.locator('[data-vdd-tab]').nth(1).boundingBox()
    if (other) {
      await page.mouse.move(other.x + other.width - 3, other.y + other.height / 2, { steps: 6 })
      const right = await snapshot()
      for (const c of right) seen.add(c)
      await page.mouse.move(other.x + 3, other.y + other.height / 2, { steps: 6 })
      const left = await snapshot()
      for (const c of left) seen.add(c)
    }
    // ...and a corner, which is the only way a corner zone reports itself hovered.
    await page.mouse.move(viewport.x + 10, viewport.y + viewport.height - 10, { steps: 8 })
    await page.mouse.move(viewport.x + 6, viewport.y + viewport.height - 6, { steps: 4 })
    const corner = await snapshot()
    for (const c of corner) seen.add(c)
    await page.mouse.up()
  }
})

await step('empty group', async () => {
  await drive(() => {
    for (const id of window.__vdd.getOpenPanelIds()) window.__vdd.closePanel(id)
  })
})

await step('light colour scheme', async () => {
  // App-owned: the library reads the attribute, it does not set it.
  await drive(() => document.documentElement.setAttribute('data-color-scheme', 'light'))
})

// ── the comparison ─────────────────────────────────────────────────────────
const styled = classNames(readFileSync('dist/styles.css', 'utf8'))
const openEnded = (cls) => OPEN_ENDED_PREFIXES.some(p => cls.startsWith(p))

const dead = [...styled].filter(c => !seen.has(c) && !openEnded(c) && !UNREACHABLE.has(c))
// An open-ended prefix is the consumer's to style — `vdd-context-menu--${theme}` takes a
// caller-supplied name, and neither library styles the default. So it counts as declared in
// this direction too, not only when deciding whether a *rule* is dead.
const unstyled = [...seen].filter(c => !styled.has(c) && !CONSUMER_HOOKS.has(c) && !openEnded(c))

for (const cls of dead) {
  fail('dead rule', `.${cls} has a rule in the shipped stylesheet but nothing rendered it`)
}
for (const cls of unstyled) {
  fail('unstyled', `.${cls} was rendered but has no rule and is not a declared consumer hook`)
}
// An entry that has become reachable should leave the list, or the list stops meaning anything.
for (const [cls, why] of UNREACHABLE) {
  if (seen.has(cls)) fail('stale exemption', `.${cls} is listed unreachable ("${why}") but the tour rendered it`)
  if (!styled.has(cls)) fail('stale exemption', `.${cls} is listed unreachable but no rule needs it any more`)
}

await page.screenshot({ path: `${OUT}/tour.png` })
const passed = failures.length === 0
writeFileSync(`${OUT}/browser.json`, JSON.stringify({
  passed, failures,
  counts: { rendered: seen.size, styled: styled.size, exempt: UNREACHABLE.size },
  tour,
  rendered: [...seen].sort(),
}, null, 2) + '\n')

console.log('M13 browser gate — class/rule correspondence')
console.log(`  toured ${tour.length} states; ${seen.size} classes rendered, ${styled.size} styled, ${UNREACHABLE.size} exempt`)
if (!passed) { console.log('FAILURES:'); failures.forEach(f => console.log('   ' + f)) }
console.log(passed ? 'M13 BROWSER: PASS' : 'M13 BROWSER: FAIL')
await browser.close()
process.exit(passed ? 0 : 1)
