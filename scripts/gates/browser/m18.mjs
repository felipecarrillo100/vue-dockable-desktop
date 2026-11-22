// gate:app playground
/**
 * M18 browser gate — pop-out windows (1.14.0), in real Chrome: a panel moves into a real child
 * window and back. The port of react-dockable-desktop 7.12.1's `popout.browser.ts`, the cases of
 * stages P2–P6 (panels, styles, wrapper, widgets, focus).
 *
 * The panel's element is marked with a JS property, so "the same element" means the very node; the
 * WebGL context stands in for a map's. Playground `?po=1`: panel `pp` (canPopOut) a tab in p1's
 * group, and the bar's #po-btn calls workspace.popOutPanel('pp') inside a real click.
 *
 *   out and back     docked → popped out → "Return to desktop": the same node, counter, scroll and
 *                    WebGL context; a click works in the child; back in its group
 *   closed           floating → popped out → the user closes the child: back floating, the same node
 *   popoutUrl        `?pourl=1`: the app's page opens, and the panel moves in once it has loaded
 *   neighbours       two neighbours out at once, back in both orders: the grid is the original
 *   blocked          a blocked pop-up: the menu item shows a toast and the panel stays
 *   from a pop-out   (rdd 7.12.1) a button inside pp's window pops pq out: after 5.5 s without
 *                    touching the page (Playwright's own activation), the new window's opener is pp's
 *   events           the four events in order, with the element's document and size at each, blank
 *                    and with popoutUrl
 *   styles           (P3) under a skin, dark and light: the frame's and a panel element's computed
 *                    colours, accent and font in the window equal the page's workspace; they stay
 *                    equal through a scheme switch and a skin switch; a sheet added later applies
 *   wrapper          (P4) `?rc=1`: a runtime CSS-in-JS stand-in (one cache per document, rules added
 *                    with insertRule, so the head copy carries its <style> empty) and the app's
 *                    popoutWrapper: the frame's icon, a menu item's icon opened in the pop-out and a
 *                    toast's icon raised from a click there (it shows there) are 16 x 16 and red in
 *                    the window; the panel's content is styled there and after the return, unmounted
 *                    never
 *   return button    (P4) the frame's button looks like a floating window's title-bar button (default
 *                    skin and nord, dark and light); its label is the tooltip and the name
 *   widget           (P5) `?wo=1`: a managed widget out of its panel into a real window (#wo-po-btn,
 *                    useFloatingWidgets().popOut) and back by closing it, then again and back by the
 *                    frame's "Back into the panel": the same node, its state and WebGL context; one
 *                    onWillMove / onMoved pair each way, onMoved at the window's size and the panel's
 *   widget menu      (P5) the frame's title icon opens the widget's titleMenu in the window and it
 *                    stays open, by Enter and by a click; its "Back into the panel" item puts it back
 *   widget from owner  (P5, rdd 7.12.1) `?opo=1`: the owner panel in its own window, then (after
 *                    5.5 s without touching the page) #wo-po-in clicked inside it: the new window's
 *                    opener is the owner's window, it opens at that window's screen origin over the
 *                    widget's frame, and closing it puts the widget back into its panel there
 *
 *   focus            (P6, rdd S6) a click and a focus inside the pop-out activate its panel and the
 *                    frame carries data-vdd-focused; Escape scoped both ways (a menu in the pop-out and
 *                    one in the page); the taskbar's entry with its marker, whose click calls the
 *                    window's focus() once (counted: headless can't show which window is in front)
 *   focusPanelWindow (P6) focus() counted on the child or the page, the active panel, focusPanel on a
 *                    popped-out panel, an unknown id; with the recipe's hasFocus stub, a toast raised
 *                    from the page shows in the window in front
 *
 *   node scripts/gates/browser/m18.mjs     the gate (the playground on :5188, or VDD_APP_URL)
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.VDD_APP_URL ?? 'http://localhost:5188/'
const OUT = 'artifacts/M18'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (step, msg) => failures.push(`[${step}] ${msg}`)
const check = (step, cond, msg) => { if (!cond) fail(step, msg) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const report = {}
const browser = await chromium.launch({ channel: 'chrome' })
const wait = ms => new Promise(r => setTimeout(r, ms))

/** A fresh page on the playground with `query`, once its pop-out panels are open. */
async function openApp(query) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  context.on('page', p => p.on('pageerror', e => errors.push(`pop-out: ${e.message}`)))
  await page.goto(`${APP}?${query}`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__vdd && !!document.querySelector('[data-vdd-panel="pp"] #po-fill'))
  await wait(300)
  return { page, errors, close: () => context.close() }
}

const state = (page, path) => page.evaluate((p) => p.split('.').reduce((o, k) => o?.[k], window.__vdd.state), path)

/** Clicks #po-btn (a user gesture) and returns the window that opened. */
async function popOutByClick(page) {
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#po-btn')])
  await popup.waitForLoadState()
  await popup.waitForSelector('[data-vdd-panel="pp"] #po-fill')
  return popup
}

/** What must survive, read in the document the panel is in now (the opener's globals hold the GL context). */
const snapshot = p => p.evaluate(() => {
  const el = document.querySelector('[data-vdd-panel="pp"]')
  const main = window.opener ?? window
  return {
    here: !!el,
    same: el?.__mark === 'original',
    count: document.getElementById('po-count')?.textContent,
    scroll: document.getElementById('po-sc')?.scrollTop,
    glAlive: !!main.__poGl && !main.__poGl.isContextLost() && main.__poLost === 0,
    inFrame: !!el?.closest('.vdd-popout-frame'),
    // The panel fills its slot: in the window, without the stylesheet, too.
    fills: (document.getElementById('po-fill')?.offsetHeight ?? 0) > 150,
  }
})
const kept = { here: true, same: true, count: '2', scroll: 300, glAlive: true, fills: true }
const has = (got, want) => Object.entries(want).every(([k, v]) => got?.[k] === v)

async function prepare(page) {
  await page.evaluate(() => { document.querySelector('[data-vdd-panel="pp"]').__mark = 'original' })
  await page.click('#po-inc')
  await page.click('#po-inc')
  await page.evaluate(() => { document.getElementById('po-sc').scrollTop = 300 })
  await wait(200)
}

/** The grid's shape: panels per group and sizes (rounded), without the generated group ids. */
const gridShape = page => page.evaluate(() => {
  const shape = n => n.type === 'leaf' ? n.panels.filter(Boolean)
    : { o: n.orientation, sizes: n.sizes.map(x => Math.round(x * 1000) / 1000), c: n.children.map(shape) }
  return shape(JSON.parse(JSON.stringify(window.__vdd.state.gridRoot)))
})
const leafOf = (page, id) => page.evaluate(i => document.querySelector(`[data-vdd-tab="${i}"]`)?.getAttribute('data-vdd-tab-leaf') ?? null, id)

async function outAndBack() {
  const step = 'out and back'
  const { page, errors, close } = await openApp('po=1')
  const group = await leafOf(page, 'pp')
  check(step, group !== null, 'pp has no tab in a group')
  await prepare(page)
  const popup = await popOutByClick(page)
  const result = await page.evaluate(() => window.__poResult.value)
  check(step, same(result, { ok: true }), `popOutPanel returned ${JSON.stringify(result)}`)
  const out = await snapshot(popup)
  report[`${step}: out`] = out
  check(step, has(out, { ...kept, inFrame: true }), `in the window: ${JSON.stringify(out)}`)
  check(step, (await popup.title()) === 'Pop', `the window's title is "${await popup.title()}"`)
  check(step, (await page.$('[data-vdd-panel="pp"]')) === null, 'the panel\'s element is still in the main page')
  check(step, (await page.$('[data-vdd-window="pp"]')) === null, 'the page still draws a floating window for it')
  check(step, (await state(page, 'panels.pp.poppedOut')) === true, 'the store does not say poppedOut')
  // It works in the child: a click there updates the panel.
  await popup.click('#po-inc')
  check(step, (await popup.textContent('#po-count')) === '3', 'a click in the window does not reach the panel')
  await Promise.all([popup.waitForEvent('close'), popup.click('.vdd-popout-frame__return')])
  await wait(300)
  const backHome = await snapshot(page)
  report[`${step}: back`] = backHome
  check(step, has(backHome, { ...kept, count: '3', inFrame: false }), `back on the page: ${JSON.stringify(backHome)}`)
  check(step, (await state(page, 'panels.pp.state')) === 'docked', 'not docked after its return')
  check(step, (await leafOf(page, 'pp')) === group, 'not back in its own group')
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

async function closedByUser() {
  const step = 'closed'
  const { page, errors, close } = await openApp('po=1')
  await page.evaluate(() => window.__vdd.floatPanel('pp'))
  await wait(300)
  await prepare(page)
  const popup = await popOutByClick(page)
  check(step, has(await snapshot(popup), { ...kept, inFrame: true }), 'the panel is not in the window, as it was')
  await popup.close()
  await page.waitForSelector('[data-vdd-window="pp"]')
  await wait(300)
  const backHome = await snapshot(page)
  report[step] = backHome
  check(step, has(backHome, { ...kept, inFrame: false }), `back on the page: ${JSON.stringify(backHome)}`)
  check(step, (await state(page, 'panels.pp.state')) === 'floating', 'not floating after the window closed')
  check(step, (await state(page, 'panels.pp.poppedOut')) === undefined, 'still flagged poppedOut')
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

async function withPopoutUrl() {
  const step = 'popoutUrl'
  const { page, errors, close } = await openApp('po=1&pourl=1')
  await prepare(page)
  const popup = await popOutByClick(page)
  check(step, new URL(popup.url()).pathname === '/popout.html', `the window shows ${popup.url()}`)
  check(step, has(await snapshot(popup), { ...kept, inFrame: true }), 'the panel is not in the window, as it was')
  await Promise.all([popup.waitForEvent('close'), popup.click('.vdd-popout-frame__return')])
  await wait(300)
  check(step, has(await snapshot(page), { ...kept, inFrame: false }), 'not back on the page as it was')
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

async function neighbours() {
  for (const order of [['pp', 'pq'], ['pq', 'pp']]) {
    const step = `neighbours ${order.join(' then ')}`
    const { page, errors, close } = await openApp('po=1&po2=1')
    // [[p1 | R] | [pp / pq]]: pp and pq the two sides of one split, at the workspace's edge.
    await page.evaluate(() => window.__vdd.dockPanelToWorkspaceEdge('pp', 'right'))
    await wait(300)
    const ppLeaf = await leafOf(page, 'pp')
    await page.evaluate(l => window.__vdd.dockPanelToGroup('pq', l, 'bottom'), ppLeaf)
    await wait(300)
    const before = await gridShape(page)
    report[`${step}: before`] = before
    const right = before?.c?.[1]
    check(step, right?.o === 'vertical' && same(right.c, [['pp'], ['pq']]), `pp and pq are not one split at the edge: ${JSON.stringify(before)}`)

    const [first] = await Promise.all([page.waitForEvent('popup'), page.click('#po-btn')])
    const [second] = await Promise.all([page.waitForEvent('popup'), page.click('#po-btn-q')])
    await first.waitForSelector('[data-vdd-panel="pp"]')
    await second.waitForSelector('[data-vdd-panel="pq"]')
    const windows = { pp: first, pq: second }
    for (const id of order) {
      await Promise.all([windows[id].waitForEvent('close'), windows[id].click('.vdd-popout-frame__return')])
      await wait(300)
      check(step, (await state(page, `panels.${id}.state`)) === 'docked', `${id} is not docked after its return`)
    }
    const after = await gridShape(page)
    report[`${step}: after`] = after
    check(step, same(after, before), `the grid is not the original: ${JSON.stringify(after)}`)
    check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
    await close()
  }
}

async function blocked() {
  const step = 'blocked'
  const { page, errors, close } = await openApp('po=1')
  await page.evaluate(() => { window.open = () => null })
  await page.click('[data-vdd-tab="pp"]', { button: 'right' })
  await page.click('.vdd-context-menu__item:has-text("Open in new window")')
  await page.waitForSelector('.vdd-toast--warning')
  check(step, (await page.textContent('.vdd-toast--warning')).includes('blocked'), 'the toast does not say the pop-up was blocked')
  check(step, (await state(page, 'panels.pp.state')) === 'docked', 'the panel moved')
  check(step, (await state(page, 'panels.pp.poppedOut')) === undefined, 'the panel is flagged poppedOut')
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

/**
 * Playwright runs page.evaluate (and its waits) as a user gesture, so the main page holds a
 * transient activation for a while after any call into it (5 s in Chrome): wait that out, without
 * touching the main page, so the click inside the pop-out is the only activation, as for a user.
 */
async function fromPopOut() {
  const step = 'from a pop-out'
  const { page, errors, close } = await openApp('po=1&po2=1')
  const pp = await popOutByClick(page)
  await pp.waitForSelector('#po-pop-q')
  await wait(5500)
  const [pq] = await Promise.all([page.context().waitForEvent('page'), pp.click('#po-pop-q')])
  await pq.waitForLoadState()
  await pq.waitForSelector('[data-vdd-panel="pq"]')
  const result = await page.evaluate(() => window.__poqResult)
  check(step, same(result, { ok: true }), `popOutPanel('pq') from pp's window returned ${JSON.stringify(result)}`)
  const opener = await pq.evaluate(() => window.opener?.name ?? null)
  report[step] = { result, opener }
  check(step, /^vdd-popout-pp-/.test(opener ?? ''), `pq's window was opened by "${opener}", not pp's window`)
  check(step, (await state(page, 'panels.pq.poppedOut')) === true, 'pq is not poppedOut')
  check(step, (await page.$('[data-vdd-panel="pq"]')) === null, 'pq\'s element is still in the main page')
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

/** Records, at each of the four events, the panel element's document and size (in `window.__poSeen`). */
const recordEvents = page => page.evaluate(() => {
  window.__poSeen = []
  const el = document.querySelector('[data-vdd-panel="pp"]')
  for (const type of ['panel:popping-out', 'panel:popped-out', 'panel:returning', 'panel:returned']) {
    window.__vdd.subscribe(type, () => {
      window.__poSeen.push({ type, where: el.ownerDocument === document ? 'page' : 'window', w: el.offsetWidth, h: el.offsetHeight })
    })
  }
  return { w: el.offsetWidth, h: el.offsetHeight }
})
const seenEvents = page => page.evaluate(() => window.__poSeen)
/** The size of the pop-out's slot, which the panel fills. */
const slotSize = p => p.evaluate(() => {
  const slot = document.querySelector('.vdd-popout-frame__body')
  return { w: slot.offsetWidth, h: slot.offsetHeight }
})

async function events() {
  for (const [name, query] of [['a blank window', 'po=1'], ['popoutUrl', 'po=1&pourl=1']]) {
    const step = `events, ${name}`
    const { page, errors, close } = await openApp(query)
    const inPage = await recordEvents(page)
    check(step, inPage.w > 100 && inPage.h > 100, `the panel is ${inPage.w} x ${inPage.h} in the page`)
    const popup = await popOutByClick(page)
    await page.waitForFunction(() => window.__poSeen.length >= 2)
    await wait(300)
    const inWindow = await slotSize(popup)
    check(step, inWindow.w > 100, `the window's slot is ${inWindow.w} wide`)
    const out = await seenEvents(page)
    report[`${step}: out`] = out
    check(step, same(out, [
      { type: 'panel:popping-out', where: 'page', ...inPage },
      { type: 'panel:popped-out', where: 'window', ...inWindow },
    ]), `on the way out: ${JSON.stringify(out)} (page ${JSON.stringify(inPage)}, window ${JSON.stringify(inWindow)})`)
    await Promise.all([popup.waitForEvent('close'), popup.click('.vdd-popout-frame__return')])
    await page.waitForFunction(() => window.__poSeen.length >= 4)
    const home = (await seenEvents(page)).slice(2)
    report[`${step}: back`] = home
    check(step, same(home, [
      { type: 'panel:returning', where: 'window', ...inWindow },
      { type: 'panel:returned', where: 'page', ...inPage },
    ]), `on the way back: ${JSON.stringify(home)}`)
    check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
    await close()
  }
}

// P3 (rdd S3): styles in the pop-out. The window gets the page's stylesheets, <html>'s attributes and
// the workspace's scheme and skin, so what is drawn there looks as it does in the page.

/** Waits until the window's frame is shown: it stays hidden until the copied stylesheets are ready. */
const frameShown = p => p.waitForFunction(() => {
  const f = document.querySelector('.vdd-popout-frame')
  return !!f && getComputedStyle(f).visibility === 'visible'
})

/** Computed colours of the workspace (the frame's counterpart) and a panel element, in `p`. */
const colours = (p, frameSelector) => p.evaluate((sel) => {
  const frame = document.querySelector(sel)
  const panel = document.getElementById('po-fill') ?? document.querySelector('.vdd-panel-content')
  const f = getComputedStyle(frame)
  return {
    background: f.backgroundColor,
    color: f.color,
    accent: f.getPropertyValue('--vdd-accent-color').trim(),
    font: f.fontFamily,
    panelColor: panel ? getComputedStyle(panel).color : null,
    marker: panel ? getComputedStyle(panel).outlineColor : null,
  }
}, frameSelector)

async function styles() {
  for (const scheme of ['dark', 'light']) {
    const step = `styles, ${scheme}`
    const { page, errors, close } = await openApp(`po=1&skin=nord${scheme === 'light' ? '&cs=light' : ''}`)
    const popup = await popOutByClick(page)
    await frameShown(popup)
    const compare = async (label) => {
      await wait(200)
      const main = await colours(page, '.vdd-workspace:not(.vdd-popout-frame)')
      const out = await colours(popup, '.vdd-popout-frame')
      report[`${step}: ${label}`] = { main, out }
      for (const k of ['background', 'color', 'accent', 'font']) {
        check(step, out[k] === main[k], `${label}: the frame's ${k} is ${out[k]}, the page's ${main[k]}`)
      }
      // A panel element inherits the workspace's colour.
      check(step, out.panelColor === main.color, `${label}: the panel's colour is ${out.panelColor}, the page's ${main.color}`)
      return { main, out }
    }
    const first = await compare('at first')
    check(step, !!first.main.accent, 'the page has no --vdd-accent-color: nothing was compared')

    // A scheme switch, as the app does it: on <html>.
    await page.evaluate(s => document.documentElement.setAttribute('data-color-scheme', s), scheme === 'dark' ? 'light' : 'dark')
    const switched = await compare('after a scheme switch')
    check(step, switched.main.background !== first.main.background, `the scheme switch changed nothing (${switched.main.background})`)

    // A skin switch.
    await page.evaluate(() => { window.__app.skin.value = 'tokyo' })
    const reskinned = await compare('after a skin switch')
    check(step, !same(reskinned.main, switched.main), 'the skin switch changed nothing')
    const skinOut = await popup.getAttribute('.vdd-popout-frame', 'data-vdd-skin')
    check(step, skinOut === 'tokyo', `the frame's skin is ${skinOut}`)

    // A sheet added to the page after the pop-out applies there too.
    await page.evaluate(() => {
      const s = document.createElement('style')
      s.textContent = '#po-fill { outline: 1px solid rgb(1, 2, 3); }'
      document.head.appendChild(s)
    })
    await wait(200)
    const marker = (await colours(popup, '.vdd-popout-frame')).marker
    check(step, marker === 'rgb(1, 2, 3)', `a sheet added later does not apply in the window: ${marker}`)
    check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
    await close()
  }
}

// P4 (rdd S4 + next.1): the app's popoutWrapper around the content, the frame, a menu and toasts in a
// pop-out. The playground's runtime CSS-in-JS stand-in (runtimeCss.ts) inserts its rules into the
// document its cache is given, with insertRule: without the wrapper they never reach the window.

/** Size and colour of the stand-in's icon at `sel` in `p`, or null when it isn't there. */
const rcLook = (p, sel) => p.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(el).backgroundColor }
}, sel)
const RC_LOOK = { w: 16, h: 16, bg: 'rgb(200, 30, 40)' }
/** The panel content's styled element. */
const rcContent = p => p.evaluate(() => {
  const el = document.getElementById('po-rc')
  if (!el) return null
  const s = getComputedStyle(el)
  return { color: s.color, letterSpacing: s.letterSpacing, border: s.borderBottomColor }
})
const RC_CONTENT = { color: 'rgb(10, 20, 30)', letterSpacing: '3px', border: 'rgb(40, 50, 60)' }
/** Whether a document's stand-in <style> holds its rules only through insertRule (the production path). */
const insertedOnly = p => p.evaluate(() => Array.from(document.querySelectorAll('style[data-rc]'))
  .some(s => (s.textContent ?? '') === '' && (s.sheet?.cssRules.length ?? 0) > 0))

async function wrapper() {
  const step = 'wrapper'
  const { page, errors, close } = await openApp('po=1&rc=1')
  // In the page: the content, the tab's icon and a menu item's icon.
  check(step, same(await rcContent(page), RC_CONTENT), `the content in the page: ${JSON.stringify(await rcContent(page))}`)
  check(step, await insertedOnly(page), 'the page\'s rules are not inserted with insertRule only')
  check(step, same(await rcLook(page, '[data-vdd-tab="pp"] [data-rc-icon="frame"]'), RC_LOOK), `the tab's icon: ${JSON.stringify(await rcLook(page, '[data-vdd-tab="pp"] [data-rc-icon="frame"]'))}`)
  await page.click('#po-menu')
  await page.waitForSelector('.vdd-context-menu')
  check(step, same(await rcLook(page, '.vdd-context-menu [data-rc-icon="menu"]'), RC_LOOK), 'a menu item\'s icon in the page')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.vdd-context-menu', { state: 'detached' })
  const mounts = await page.evaluate(() => window.__poMounts)

  const popup = await popOutByClick(page)
  popup.setDefaultTimeout(5000)
  await frameShown(popup)
  const out = {}
  out.frame = await rcLook(popup, '.vdd-popout-frame__icon [data-rc-icon="frame"]')
  check(step, same(out.frame, RC_LOOK), `the frame's icon in the window: ${JSON.stringify(out.frame)}`)
  out.content = await rcContent(popup)
  check(step, same(out.content, RC_CONTENT), `the content in the window: ${JSON.stringify(out.content)}`)
  check(step, await insertedOnly(popup), 'the window\'s rules are not inserted into its own <style> with insertRule')

  // A menu opened from inside the window: there, its item's icon styled, and it can be clicked.
  await popup.click('#po-menu')
  await popup.waitForSelector('.vdd-context-menu')
  check(step, (await page.$('.vdd-context-menu')) === null, 'the menu opened in the page')
  out.menu = await rcLook(popup, '.vdd-context-menu [data-rc-icon="menu"]')
  check(step, same(out.menu, RC_LOOK), `a menu item's icon in the window: ${JSON.stringify(out.menu)}`)
  await popup.click('.vdd-context-menu__item:has-text("Rc item")')
  await popup.waitForSelector('.vdd-context-menu', { state: 'detached' })

  // A toast raised by a click in the window shows in the window, its icon styled; not in the page.
  await popup.click('#po-toast')
  await popup.waitForSelector('.vdd-toast:has-text("from pp")')
  check(step, (await page.$('.vdd-toast:has-text("from pp")')) === null, 'the toast shows in the page too')
  out.toast = await rcLook(popup, '.vdd-toast [data-rc-icon="toast"]')
  check(step, same(out.toast, RC_LOOK), `a toast's icon in the window: ${JSON.stringify(out.toast)}`)
  report[step] = out

  // Its window closing takes the toast away; the content is back, styled, never remounted.
  await Promise.all([popup.waitForEvent('close'), popup.click('.vdd-popout-frame__return')])
  await wait(300)
  check(step, (await page.$('.vdd-toast:has-text("from pp")')) === null, 'the window\'s toast came to the page')
  check(step, same(await rcContent(page), RC_CONTENT), `the content after the return: ${JSON.stringify(await rcContent(page))}`)
  check(step, (await page.evaluate(() => window.__poMounts)) === mounts, 'the panel remounted')
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

/** The look of a button in `p`. */
const buttonLook = (p, sel) => p.evaluate((s) => {
  const el = document.querySelector(s)
  const c = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height), bg: c.backgroundColor, border: c.borderTopColor, color: c.color, radius: c.borderTopLeftRadius }
}, sel)

async function returnButton() {
  for (const [skin, scheme] of [['', 'dark'], ['', 'light'], ['nord', 'dark'], ['nord', 'light']]) {
    const step = `return button, ${skin || 'default skin'}, ${scheme}`
    const { page, errors, close } = await openApp(`po=1${scheme === 'light' ? '&cs=light' : ''}${skin ? `&skin=${skin}` : ''}`)
    await page.evaluate(() => window.__vdd.openPanel('p4', 'hostile', { title: 'Four', initialTarget: 'floating' }))
    await page.waitForSelector('[data-vdd-window="p4"] .vdd-btn-minimize-tab')
    await wait(200)
    const inPage = await buttonLook(page, '[data-vdd-window="p4"] .vdd-btn-minimize-tab')
    const popup = await popOutByClick(page)
    await frameShown(popup)
    await wait(200)
    const back = '.vdd-popout-frame__return'
    const look = await buttonLook(popup, back)
    report[step] = { inPage, look }
    check(step, same(look, inPage), `the button is ${JSON.stringify(look)}, a floating window's ${JSON.stringify(inPage)}`)
    check(step, (await popup.getAttribute(back, 'title')) === 'Return to desktop', 'its title is not the label')
    check(step, (await popup.getAttribute(back, 'aria-label')) === 'Return to desktop', 'its aria-label is not the label')
    check(step, ((await popup.textContent(back)) ?? '').trim() === '', 'it has visible text')
    check(step, (await popup.$(`${back} svg`)) !== null, 'it has no icon')
    check(step, (await popup.getAttribute('.vdd-popout-frame', 'data-vdd-popout-kind')) === 'panel', 'no data-vdd-popout-kind="panel" on the frame')
    check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
    await close()
  }
}

/** `?wo=1`: the managed widget `wo`, its state and WebGL context, read in the document it is in now. */
const woSnapshot = p => p.evaluate(() => {
  const fill = document.getElementById('wo-fill')
  const main = window.opener && window.opener.__woGl !== undefined ? window.opener : (window.opener?.opener ?? window)
  const top = window.__woGl !== undefined ? window : main
  return {
    here: !!fill,
    same: fill?.__mark === 'original',
    count: document.getElementById('wo-count')?.textContent ?? null,
    input: document.getElementById('wo-text')?.value ?? null,
    glAlive: !!top.__woGl && !top.__woGl.isContextLost() && top.__woLost === 0,
    size: fill ? `${fill.offsetWidth}x${fill.offsetHeight}` : null,
    inPanelFrame: !!document.querySelector('[data-vdd-widget="wo"] #wo-fill'),
  }
})
/** Marks the widget's node, types into it and makes its WebGL context (held in the page's globals). */
async function prepareWidget(page) {
  await page.waitForSelector('[data-vdd-widget="wo"] #wo-fill')
  await page.evaluate(() => {
    document.getElementById('wo-fill').__mark = 'original'
    const canvas = document.getElementById('wo-gl')
    window.__woLost = 0
    canvas.addEventListener('webglcontextlost', () => { window.__woLost += 1 })
    window.__woGl = canvas.getContext('webgl')
  })
  await page.click('#wo-count')
  await page.fill('#wo-text', 'typed')
  await wait(300)
}
/** The widget's onWillMove / onMoved calls since the last take: `will` / `moved WxH` (the content's size). */
const takeWoCalls = page => page.evaluate(() => {
  const c = window.__overlay.widgets.calls ?? []
  window.__overlay.widgets.calls = []
  return c.map(x => (x.kind === 'will' ? 'will' : `moved ${x.size[0]}x${x.size[1]}`))
})
const woContentSize = p => p.evaluate(() => {
  const el = document.getElementById('wo-fill')?.closest('.vdd-panel-float__content')
  return el ? `${el.offsetWidth}x${el.offsetHeight}` : null
})
const woKept = { here: true, same: true, count: '1', input: 'typed', glAlive: true }

async function widget() {
  const step = 'widget'
  const { page, errors, close } = await openApp('po=1&wo=1')
  await prepareWidget(page)
  const inPanel = await woSnapshot(page)
  check(step, has(inPanel, { ...woKept, inPanelFrame: true }), `in the panel: ${JSON.stringify(inPanel)}`)
  const panelSize = await woContentSize(page)
  await takeWoCalls(page)
  for (const way of ['closed', 'back button']) {
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#wo-po-btn')])
    await popup.waitForLoadState()
    await popup.waitForSelector('#wo-fill')
    await frameShown(popup)
    await wait(400)
    const result = await page.evaluate(() => window.__woPopResult)
    check(step, same(result, { ok: true }), `${way}: popOut returned ${JSON.stringify(result)}`)
    const out = await woSnapshot(popup)
    const outSize = await woContentSize(popup)
    report[`${step} ${way}: out`] = { out, outSize }
    check(step, has(out, { ...woKept, inPanelFrame: false }), `${way}: in the window: ${JSON.stringify(out)}`)
    check(step, (await page.$('#wo-fill')) === null, `${way}: the widget's node is still in the page`)
    check(step, (await popup.getAttribute('.vdd-popout-frame', 'data-vdd-popout-kind')) === 'widget', `${way}: no data-vdd-popout-kind="widget"`)
    check(step, (await popup.getAttribute('.vdd-popout-frame__return', 'aria-label')) === 'Back into the panel', `${way}: the return button is not "Back into the panel"`)
    check(step, (await page.evaluate(() => window.__overlay.widgets.api.location('wo'))) === 'floating', `${way}: location is not 'floating'`)
    let calls = await takeWoCalls(page)
    check(step, same(calls, ['will', `moved ${outSize}`]), `${way}: out: calls ${JSON.stringify(calls)}, the window's size ${outSize}`)
    check(step, outSize !== panelSize, `${way}: the same size in the window as in the panel (${outSize})`)
    if (way === 'closed') await popup.close()
    else await Promise.all([popup.waitForEvent('close'), popup.click('.vdd-popout-frame__return')])
    await page.waitForSelector('[data-vdd-widget="wo"] #wo-fill')
    await wait(400)
    const back = await woSnapshot(page)
    report[`${step} ${way}: back`] = back
    check(step, has(back, { ...woKept, inPanelFrame: true }), `${way}: back in the panel: ${JSON.stringify(back)}`)
    check(step, (await woContentSize(page)) === panelSize, `${way}: back at ${await woContentSize(page)}, not ${panelSize}`)
    calls = await takeWoCalls(page)
    check(step, same(calls, ['will', `moved ${panelSize}`]), `${way}: back: calls ${JSON.stringify(calls)}`)
  }
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

async function widgetMenu() {
  const step = 'widget menu'
  const { page, errors, close } = await openApp('po=1&wo=1')
  await page.waitForSelector('[data-vdd-widget="wo"] #wo-fill')
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#wo-po-btn')])
  await popup.waitForSelector('#wo-fill')
  await frameShown(popup)
  await wait(300)
  const icon = '.vdd-popout-frame__icon--menu'
  check(step, (await popup.$(icon)) !== null, 'the frame\'s title icon is not a menu button')
  // Enter on the focused icon: the menu opens there and is still open a moment later.
  await popup.focus(icon)
  await popup.keyboard.press('Enter')
  await popup.waitForSelector('.vdd-context-menu', { timeout: 3000 }).catch(() => {})
  await wait(300)
  check(step, (await popup.$('.vdd-context-menu')) !== null, 'Enter: no menu open in the window')
  if (await popup.$('.vdd-context-menu')) {
    await popup.keyboard.press('Escape')
    await popup.waitForSelector('.vdd-context-menu', { state: 'detached', timeout: 3000 }).catch(() => fail(step, 'Escape did not close the menu'))
  }
  // A click: the same, in the window only, and its item runs.
  await popup.click(icon)
  await wait(300)
  check(step, (await popup.$('.vdd-context-menu')) !== null, 'click: no menu open in the window (closed by its own click?)')
  check(step, (await page.$('.vdd-context-menu')) === null, 'click: a menu opened in the page')
  if (await popup.$('.vdd-context-menu')) {
    await Promise.all([popup.waitForEvent('close'), popup.click('.vdd-context-menu >> text=Back into the panel')])
    await page.waitForSelector('[data-vdd-widget="wo"] #wo-fill')
    check(step, (await page.evaluate(() => window.__overlay.widgets.api.location('wo'))) === 'panel', 'not back in the panel')
  }
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

async function widgetFromOwner() {
  const step = 'widget from owner'
  const { page, errors, close } = await openApp('po=1&wo=1&opo=1')
  await prepareWidget(page)
  // The owner panel into its window, from the page's own button.
  const [owner] = await Promise.all([page.waitForEvent('popup'), page.click('#ov-po-btn')])
  await owner.waitForLoadState()
  await owner.waitForSelector('[data-vdd-widget="wo"] #wo-fill')
  await frameShown(owner)
  await wait(300)
  // Where the widget's frame is in the owner's window, and that window's screen origin.
  const at = await owner.evaluate(() => {
    const r = document.querySelector('[data-vdd-widget="wo"]').getBoundingClientRect()
    return { left: r.left, top: r.top, screenX, screenY, chrome: Math.max(0, outerHeight - innerHeight) }
  })
  // Playwright's own calls into the page activate it for about 5 s: none until the click.
  await wait(5500)
  const [win] = await Promise.all([page.context().waitForEvent('page'), owner.click('#wo-po-in')])
  await win.waitForLoadState()
  await win.waitForSelector('#wo-fill')
  await frameShown(win)
  await wait(300)
  const result = await page.evaluate(() => window.__woPopResult)
  check(step, same(result, { ok: true }), `popOut from the owner's window returned ${JSON.stringify(result)}`)
  const opener = await win.evaluate(() => window.opener?.name ?? null)
  const origin = await win.evaluate(() => ({ screenX, screenY }))
  const main = await page.evaluate(() => ({ screenX, screenY }))
  const marked = await woSnapshot(win)
  report[step] = { result, opener, at, origin, main, marked }
  check(step, /^vdd-popout-ov-/.test(opener ?? ''), `the widget's window was opened by "${opener}", not the owner's window`)
  check(step, has(marked, woKept), `in its window: ${JSON.stringify(marked)}`)
  check(step, (await owner.$('#wo-fill')) === null && (await page.$('#wo-fill')) === null, 'the widget\'s node is still in the owner\'s window or the page')
  check(step, (await state(page, 'panels.ov.poppedOut')) === true, 'the owner is not poppedOut')
  // On the owner's window's screen, over the widget's frame there (rdd 7.12.1's `view`). The widget
  // sits top-left in its panel, so the window fits the (headless) screen and is not moved onto it.
  const wantX = Math.round(at.screenX + at.left)
  const wantY = Math.round(at.screenY + at.chrome + at.top)
  check(step, Math.abs(origin.screenX - wantX) <= 2 && Math.abs(origin.screenY - wantY) <= 2,
    `the window is at ${origin.screenX},${origin.screenY}, not ${wantX},${wantY} (the owner's window at ${at.screenX},${at.screenY}; the page at ${main.screenX},${main.screenY})`)
  // Closing it: back into its panel, inside the owner's window.
  await win.close()
  await owner.waitForSelector('[data-vdd-widget="wo"] #wo-fill')
  await wait(300)
  const home = await woSnapshot(owner)
  check(step, has(home, { ...woKept, inPanelFrame: true }), `back in its panel in the owner's window: ${JSON.stringify(home)}`)
  check(step, (await page.$('#wo-fill')) === null, 'the widget came back into the page, not the owner\'s window')
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

// P6 (rdd S6): focus across windows. Headless Chrome can't show which OS window is in front, so a
// window coming forward is checked by the call it makes (its focus() is counted), and activation by
// the page's active panel.

/** Counts `window.focus()` calls in `p` from now on, in `window.__focusCalls`. */
const countFocus = p => p.evaluate(() => {
  window.__focusCalls = 0
  const original = window.focus.bind(window)
  window.focus = () => { window.__focusCalls += 1; original() }
})
const focusCalls = p => p.evaluate(() => window.__focusCalls)
const activeId = page => state(page, 'activePanelId')
/** Selects p1's tab in the page, so another panel than pp is the active one. */
async function activateP1(page) {
  await page.click('[data-vdd-tab="p1"]')
  await wait(200)
}
/** Opens a one-item menu from `p`'s document, through the page's workspace. */
const menuFrom = (p, label) => p.evaluate((l) => {
  const ws = (window.opener ?? window).__vdd
  ws.showContextMenu({ event: { target: document.body, clientX: 20, clientY: 20 }, items: [{ label: l, action: () => {} }] })
}, label)

async function focusAcross() {
  const step = 'focus'
  const { page, errors, close } = await openApp('po=1')
  const popup = await popOutByClick(page)
  await frameShown(popup)
  await wait(300)

  // A click inside the pop-out, on something that takes no focus: the pointerdown activates pp.
  await activateP1(page)
  check(step, (await activeId(page)) === 'p1', `p1 is not active after a click on its tab (${await activeId(page)})`)
  check(step, (await popup.getAttribute('.vdd-popout-frame', 'data-vdd-focused')) === null, 'the frame says focused while p1 is active')
  await popup.click('#po-count')
  await wait(200)
  check(step, (await activeId(page)) === 'pp', `a click in the pop-out did not activate pp (${await activeId(page)})`)
  check(step, (await popup.getAttribute('.vdd-popout-frame', 'data-vdd-focused')) === '', 'the frame does not carry data-vdd-focused')
  // Focus moving in, with no pointer: activates it too.
  await activateP1(page)
  await popup.focus('#po-inc')
  await wait(200)
  check(step, (await activeId(page)) === 'pp', `a focus in the pop-out did not activate pp (${await activeId(page)})`)

  // Escape, both ways: a menu in the pop-out stays through the page's Escape and closes on its own.
  await menuFrom(popup, 'In the window')
  await popup.waitForSelector('.vdd-context-menu')
  check(step, (await page.$('.vdd-context-menu')) === null, 'the pop-out\'s menu also shows in the page')
  await page.keyboard.press('Escape')
  await wait(200)
  check(step, (await popup.$('.vdd-context-menu')) !== null, 'an Escape in the page closed the pop-out\'s menu')
  await popup.keyboard.press('Escape')
  await popup.waitForSelector('.vdd-context-menu', { state: 'detached', timeout: 3000 }).catch(() => fail(step, 'an Escape in the pop-out did not close its menu'))
  // ...and a menu in the page stays through the pop-out's Escape and closes on the page's.
  await menuFrom(page, 'In the page')
  await page.waitForSelector('.vdd-context-menu')
  check(step, (await popup.$('.vdd-context-menu')) === null, 'the page\'s menu also shows in the pop-out')
  await popup.keyboard.press('Escape')
  await wait(200)
  check(step, (await page.$('.vdd-context-menu')) !== null, 'an Escape in the pop-out closed the page\'s menu')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.vdd-context-menu', { state: 'detached', timeout: 3000 }).catch(() => fail(step, 'an Escape in the page did not close its menu'))

  // The taskbar lists pp with its marker while it is out; a click brings its window forward.
  const entry = '[data-vdd-taskbar-popout="pp"]'
  const look = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const marker = el?.querySelector('.vdd-taskbar-item-popout-marker')
    return el && {
      label: el.getAttribute('aria-label'),
      marker: !!marker,
      markerPosition: marker ? getComputedStyle(marker).position : null,
      itemPosition: getComputedStyle(el).position,
      w: Math.round(el.getBoundingClientRect().width),
    }
  }, entry)
  report[`${step}: taskbar entry`] = look
  check(step, look !== null, 'no taskbar entry for pp')
  check(step, look?.label === 'Pop: in its own window', `the entry's label is ${JSON.stringify(look?.label)}`)
  check(step, look?.marker && look.markerPosition === 'absolute' && look.itemPosition === 'relative', `the marker is not placed in the entry's corner: ${JSON.stringify(look)}`)
  await activateP1(page)
  await countFocus(popup)
  await page.evaluate(sel => document.querySelector(sel).click(), entry)
  await wait(200)
  check(step, (await focusCalls(popup)) === 1, `the entry's click called the window's focus() ${await focusCalls(popup)} times`)
  check(step, (await activeId(page)) === 'pp', `the entry's click did not activate pp (${await activeId(page)})`)

  await Promise.all([popup.waitForEvent('close'), popup.click('.vdd-popout-frame__return')])
  await wait(300)
  check(step, (await page.$(entry)) === null, 'the taskbar entry stays after the return')
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

/**
 * workspace.focusPanelWindow, with the guide's recipe: Playwright reports document.hasFocus() true
 * in every page, so the page that should not have focus (the pop-out, once the main window comes
 * forward) says so with a stub. A toast raised from the page shows in the window that has focus.
 */
async function focusWindow() {
  const step = 'focusPanelWindow'
  const { page, errors, close } = await openApp('po=1')
  const popup = await popOutByClick(page)
  await frameShown(popup)
  await wait(300)
  await activateP1(page)
  await countFocus(page)
  await countFocus(popup)

  // pp's window comes forward: its focus() once, the page's never; pp is the active panel.
  const toPp = await page.evaluate(() => window.__vdd.focusPanelWindow('pp'))
  await wait(200)
  const out = { result: toPp, child: await focusCalls(popup), main: await focusCalls(page), active: await activeId(page) }
  report[`${step}: pp`] = out
  check(step, same(out, { result: { ok: true }, child: 1, main: 0, active: 'pp' }), `focusPanelWindow('pp'): ${JSON.stringify(out)}`)
  // (Both pages say hasFocus() here, and a pop-out that has focus comes first: no stub needed.)
  await page.evaluate(() => window.__toast('to the window in front', { duration: 0 }))
  await popup.waitForSelector('.vdd-toast:has-text("to the window in front")', { timeout: 3000 }).catch(() => fail(step, 'with the page stubbed unfocused, the toast is not in the pop-out'))
  check(step, (await page.$('.vdd-toast:has-text("to the window in front")')) === null, 'the toast shows in the page too')

  // The main window comes forward for p1, which is in the page; the pop-out now says it lost focus.
  await popup.evaluate(() => { document.hasFocus = () => false })
  const toP1 = await page.evaluate(() => window.__vdd.focusPanelWindow('p1'))
  await wait(200)
  const home = { result: toP1, child: await focusCalls(popup), main: await focusCalls(page), active: await activeId(page) }
  report[`${step}: p1`] = home
  check(step, same(home, { result: { ok: true }, child: 1, main: 1, active: 'p1' }), `focusPanelWindow('p1'): ${JSON.stringify(home)}`)
  await page.evaluate(() => window.__toast('to the page', { duration: 0 }))
  await page.waitForSelector('.vdd-toast:has-text("to the page")', { timeout: 3000 }).catch(() => fail(step, 'with the pop-out stubbed unfocused, the toast is not in the page'))
  check(step, (await popup.$('.vdd-toast:has-text("to the page")')) === null, 'the toast shows in the pop-out too')

  // focusPanel on a popped-out panel brings its window forward too; an unknown id is not ok.
  await page.evaluate(() => window.__vdd.focusPanel('pp'))
  await wait(200)
  check(step, (await focusCalls(popup)) === 2, `focusPanel('pp') called the window's focus() ${(await focusCalls(popup)) - 1} times`)
  const unknown = await page.evaluate(() => window.__vdd.focusPanelWindow('nope'))
  check(step, same(unknown, { ok: false }), `focusPanelWindow('nope') returned ${JSON.stringify(unknown)}`)
  check(step, errors.length === 0, `errors: ${errors.join('; ')}`)
  await close()
}

const cases = { outAndBack, closedByUser, withPopoutUrl, neighbours, blocked, fromPopOut, events, styles, wrapper, returnButton, widget, widgetMenu, widgetFromOwner, focusAcross, focusWindow }
// `M18_CASES=wrapper,styles` runs only those cases (while working); the gate runs them all.
const only = process.env.M18_CASES?.split(',')
const selected = Object.keys(cases).filter(name => !only || only.includes(name))
try {
  for (const [name, run] of Object.entries(cases)) {
    if (only && !only.includes(name)) continue
    try { await run() } catch (e) { fail(name, `crashed: ${e.message.split('\n')[0]}`) }
  }
} finally {
  await browser.close()
}
writeFileSync(`${OUT}/popout.json`, JSON.stringify({ report, failures }, null, 2))
if (failures.length) {
  console.error('\nM18 browser: FAIL')
  failures.forEach(f => console.error('  ' + f))
  process.exit(1)
}
console.log(`\nM18 browser: ok — ${selected.length} of ${Object.keys(cases).length} cases: the same node, state and WebGL context out and back, closing, popoutUrl, neighbours, blocked, from a pop-out, events, styles, wrapper, return button, widget, widget menu, widget from owner, focus, focusPanelWindow`)
