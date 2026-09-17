// gate:app demo
/**
 * M14 browser gate — the demo, walked through end to end.
 *
 * The plan's condition: open every panel type, dock, float, minimise, restore, save, reload
 * and restore, asserting no console errors throughout.
 *
 * "No console errors throughout" is the part that earns its keep. The demo is the only place
 * the library meets Monaco, Leaflet, a markdown pipeline, six locales and every one of its
 * own components at once — and a library's integration failures show up as a console error in
 * an application long before they show up in a unit test. So the listener is armed before the
 * first navigation and every error is a failure, including one raised during the reload.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'http://localhost:5190/'
const OUT = 'artifacts/M14'
mkdirSync(OUT, { recursive: true })

const failures = []
const fail = (step, message) => failures.push(`[${step}] ${message}`)
const record = []

/** Errors the demo's own third-party dependencies raise, which are not the library's. */
const IGNORE = [
  /Failed to load resource/,                 // a tile that 404s, or a rate-limited source
  /favicon/i,
  /ResizeObserver loop/,                     // benign, and browser-specific
  /Unable to preventDefault inside passive/,  // Leaflet's own wheel listener
]

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } })
const page = await context.newPage()

let step = 'startup'
page.on('pageerror', (error) => fail(step, `page error: ${error.message}`))
page.on('console', (message) => {
  if (message.type() !== 'error') return
  const text = message.text()
  if (IGNORE.some(pattern => pattern.test(text))) return
  fail(step, `console error: ${text.slice(0, 220)}`)
})

const drive = (fn, ...args) => page.evaluate(fn, ...args)

/**
 * An unexpected navigation is itself a failure, and it used to be an unhandled crash.
 *
 * A form without `type="button"` on its buttons submits and reloads the page; the symptom is
 * "Execution context was destroyed", thrown from whatever ran next rather than from the click
 * that caused it. Recording navigations means the gate names the step instead of dying in it.
 */
let navigations = 0
let expectNavigation = false
page.on('framenavigated', (frame) => {
  if (frame !== page.mainFrame()) return
  navigations += 1
  if (!expectNavigation) fail(step, `the page navigated unexpectedly (a form submitting?)`)
})

const state = async () => {
  try {
    return await drive(() => {
      const ws = window.__demo?.workspace
      if (!ws) return { unavailable: true }
      return {
        open: Object.keys(ws.state.panels).sort(),
        active: ws.state.activePanelId,
        floating: ws.state.floating.map(w => w.id).sort(),
        minimized: ws.state.minimized.map(m => m.id).sort(),
      }
    })
  } catch (error) {
    // Reading state must never be what ends the run — the point is to report, not to crash.
    return { unreadable: error.message.split('\n')[0] }
  }
}

/** Run one step, naming it so any console error or navigation is attributed to it. */
async function walk(name, fn, settle = 350) {
  step = name
  try {
    await fn()
    await page.waitForTimeout(settle)
  } catch (error) {
    fail(name, error.message.split('\n')[0])
  }
  record.push({ step: name, ...(await state()) })
}

expectNavigation = true
await page.goto(APP, { waitUntil: 'load' })
expectNavigation = false
await page.waitForFunction(() => !!window.__demo, null, { timeout: 60000 })
// Monaco and Leaflet both finish asynchronously; the initial layout settles after them.
await page.waitForTimeout(3500)

// ── a widget opened from data keeps a placement gesture ────────────────────
/**
 * The 1.0.1 regression, driven as a user drives it.
 *
 * `<VddPanelOverlay>` bound `placement` — a `defineModel` — as a fresh object literal for
 * widgets opened through `useFloatingWidgets()`, and Vue re-syncs a model from its prop
 * whenever the prop's identity changes. So a drop reverted on the very render the drop
 * triggered (`draggingId` is cleared in the same function), and any other widget opening
 * reverted a stretched one (`managedVersion`).
 *
 * Nothing in the suite could see it: the playground's widgets are all `v-model:placement`,
 * and the M11 browser gate sets placement through a handle rather than by gesture. So this
 * is deliberately end to end — a real pointer drag onto a real drop zone, in the demo.
 */
await walk('open two camera widgets from data', async () => {
  // On the demo's own starting layout, deliberately: the bulk open below puts `dirtyForm` —
  // registered `initialTarget: 'floating'` — over the map, and a floating window intercepts
  // the marker clicks. Found by this gate on its first run.
  await drive(() => window.__demo.workspace.focusPanel('mainMap'))
  await page.waitForTimeout(400)
  const markers = page.locator('[data-vdd-slot="mainMap"] .leaflet-interactive')
  await markers.nth(0).click({ timeout: 4000 })     // cam-north, seeded top-right
  await markers.nth(1).click({ timeout: 4000 })     // cam-east, seeded top-left
}, 500)

{
  const cams = await drive(() => Array.from(document.querySelectorAll('[data-vdd-widget]'))
    .map(el => el.dataset.vddWidget).filter(id => id.startsWith('cam-')))
  record.push({ step: 'camera widgets', open: cams })
  if (cams.length < 2) fail('camera widgets', `expected two camera widgets, found ${cams.join(', ') || 'none'}`)
}

const insetsOf = (id) => drive((widgetId) => {
  const el = document.querySelector(`[data-vdd-widget="${widgetId}"]`)
  if (!el) return { missing: true }
  return {
    start: el.style.insetInlineStart, end: el.style.insetInlineEnd,
    top: el.style.top, bottom: el.style.bottom,
  }
}, id)

{
  const seeded = await insetsOf('cam-north')
  record.push({ step: 'cam-north seeded', ...seeded })
  if (seeded.end === '') fail('camera seed', `cam-north should start at its seeded top-right corner, got ${JSON.stringify(seeded)}`)
}

await walk('drag a camera widget to the opposite corner', async () => {
  const header = await page.locator('[data-vdd-widget="cam-north"] [data-vdd-widget-header]').boundingBox()
  const root = await page.locator('[data-vdd-slot="mainMap"] [data-vdd-panel-overlay]').boundingBox()
  if (!header || !root) throw new Error('the widget header or the overlay root has no box')
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2)
  await page.mouse.down()
  // Into the bottom-left drop zone — an 80px square at the overlay's own corner.
  await page.mouse.move(root.x + 20, root.y + root.height - 20, { steps: 12 })
  await page.waitForTimeout(120)
  await page.mouse.up()
}, 500)

const dropped = await insetsOf('cam-north')
record.push({ step: 'cam-north after drop', ...dropped })
if (dropped.start === '' || dropped.end !== '') {
  fail('widget re-anchor', `a dropped managed widget did not take the bottom-left corner: ${JSON.stringify(dropped)}`)
}
if (dropped.bottom === '' || dropped.top !== '') {
  fail('widget re-anchor', `a dropped managed widget kept its block edge: ${JSON.stringify(dropped)}`)
}

// The other half: opening another widget re-renders the list, which is what used to revert it.
await walk('open a third camera widget', async () => {
  await page.locator('[data-vdd-slot="mainMap"] .leaflet-interactive').nth(2).click({ timeout: 4000 })
}, 500)

{
  const after = await insetsOf('cam-north')
  record.push({ step: 'cam-north after another opens', ...after })
  if (after.start !== dropped.start || after.end !== dropped.end || after.bottom !== dropped.bottom) {
    fail('widget re-anchor', `another widget opening moved cam-north: ${JSON.stringify(dropped)} -> ${JSON.stringify(after)}`)
  }
}

await page.screenshot({ path: `${OUT}/01b-widget-reanchor.png` })

// Closing from the widget's own × runs the demo's write-back: the overlay drops the widget and
// the panel's camera list follows, so the two cannot drift.
await walk('close the camera widgets again', async () => {
  for (const id of ['cam-north', 'cam-east', 'cam-south']) {
    const close = page.locator(`[data-vdd-widget="${id}"] [data-vdd-widget-close]`)
    if (await close.count()) await close.first().click({ timeout: 4000 })
  }
}, 400)

{
  const left = await drive(() => Array.from(document.querySelectorAll('[data-vdd-widget]'))
    .map(el => el.dataset.vddWidget).filter(id => id.startsWith('cam-')))
  if (left.length !== 0) fail('camera widgets', `${left.join(', ')} survived a close`)
}

// ── every panel type ───────────────────────────────────────────────────────
const KINDS = await drive(() => window.__demo.workspace.registry.keys())
record.push({ step: 'registry', kinds: KINDS })
if (KINDS.length < 15) fail('registry', `only ${KINDS.length} panel kinds registered, expected every demo panel`)

await walk('open every panel kind', async () => {
  await drive((kinds) => {
    for (const kind of kinds) window.__demo.workspace.openPanel(kind, kind)
  }, KINDS)
}, 2500)

{
  const now = await state()
  for (const kind of KINDS) {
    if (!now.open.includes(kind)) fail('open every panel kind', `"${kind}" did not open`)
  }
  // Each panel's content should actually have rendered, not merely been registered.
  const rendered = await drive(() => ({
    monaco: document.querySelectorAll('.monaco-editor').length,
    leaflet: document.querySelectorAll('.leaflet-container').length,
    markdown: document.querySelectorAll('[data-demo-md-preview] h1').length,
    overlay: document.querySelectorAll('[data-vdd-panel-overlay]').length,
  }))
  record.push({ step: 'content rendered', ...rendered })
  if (rendered.monaco < 1) fail('content', 'no Monaco editor rendered')
  if (rendered.leaflet < 1) fail('content', 'no Leaflet map rendered')
  if (rendered.overlay < 1) fail('content', 'no panel overlay rendered')
}

await page.screenshot({ path: `${OUT}/01-every-panel.png` })

// ── dock, split, float, anchor, maximise ───────────────────────────────────
await walk('split the grid', async () => {
  await drive(() => {
    const ws = window.__demo.workspace
    const leaf = ws.state.gridRoot.type === 'leaf' ? ws.state.gridRoot.id : null
    if (leaf) ws.dockPanelToGroup('table', leaf, 'right')
    ws.dockPanelToWorkspaceEdge('timeControl', 'bottom')
  })
})

await walk('float a panel', async () => {
  await drive(() => window.__demo.workspace.floatPanel('terminal', { x: 120, y: 120, width: 460, height: 300 }))
})
{
  const now = await state()
  if (!now.floating.includes('terminal')) fail('float a panel', 'terminal is not floating')
}

await walk('anchor it to a corner', async () => {
  await drive(() => window.__demo.workspace.updateFloatingPosition('terminal', { anchor: 'bottom-right' }))
})

await walk('maximise and restore it', async () => {
  await drive(() => window.__demo.workspace.maximizePanel('terminal'))
  await page.waitForTimeout(250)
  await drive(() => window.__demo.workspace.maximizePanel('terminal'))
})

await page.screenshot({ path: `${OUT}/02-floating.png` })

// ── minimise and restore ───────────────────────────────────────────────────
await walk('minimise three panels', async () => {
  await drive(() => {
    for (const id of ['preview', 'help', 'table']) window.__demo.workspace.minimizePanel(id)
  })
})
{
  const now = await state()
  for (const id of ['preview', 'help', 'table']) {
    if (!now.minimized.includes(id)) fail('minimise', `${id} is not minimised`)
  }
}

await walk('hover a taskbar icon for its live preview', async () => {
  const icon = page.locator('[data-vdd-taskbar-item="preview"]')
  if (await icon.count()) await icon.hover()
  const preview = await drive(() => {
    const host = document.querySelector('[data-vdd-preview-host]') ?? document.querySelector('.vdd-taskbar-item-preview-host')
    return { present: !!host, hasContent: !!host?.firstElementChild }
  })
  record.push({ step: 'preview', ...preview })
})

await walk('restore them', async () => {
  await drive(() => {
    for (const id of ['preview', 'help', 'table']) window.__demo.workspace.restorePanel(id)
  })
})
{
  const now = await state()
  if (now.minimized.length !== 0) fail('restore', `${now.minimized.length} panel(s) still minimised`)
  // restorePanel focuses by default, which is the 6.2.0 fix the port inherits.
  if (now.active !== 'table') fail('restore', `active is "${now.active}" after restoring table last`)
}

// ── the chrome ─────────────────────────────────────────────────────────────
await walk('open a drawer, a toast and a modal', async () => {
  await page.locator('[data-demo-cc-tab="overlays"]').first().click({ timeout: 4000 })
  await page.waitForTimeout(200)
  await page.locator('[data-demo-left-drawer]').first().click({ timeout: 4000 })
  await page.locator('[data-demo-toast]').first().click({ timeout: 4000 })
  // The modal goes last on purpose: its curtain covers the panel that opened it, so a click
  // on that panel afterwards cannot land — correct behaviour, and it failed this gate's own
  // first ordering rather than the library.
  await page.locator('[data-demo-modal]').first().click({ timeout: 4000 })
})
{
  const chrome = await drive(() => ({
    drawer: !!document.querySelector('[data-vdd-side-panel="left"]'),
    modal: document.querySelectorAll('.vdd-modal-overlay').length,
    toast: document.querySelectorAll('[data-vdd-toast]').length,
  }))
  record.push({ step: 'chrome', ...chrome })
  if (!chrome.drawer) fail('chrome', 'the left drawer did not open')
  if (chrome.modal < 1) fail('chrome', 'no modal opened')
  if (chrome.toast < 1) fail('chrome', 'no toast appeared')
}
await page.screenshot({ path: `${OUT}/03-chrome.png` })

await walk('dismiss them with Escape', async () => {
  await page.keyboard.press('Escape')   // the modal
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')   // then the drawer
})
{
  const chrome = await drive(() => ({
    drawer: !!document.querySelector('[data-vdd-side-panel="left"]'),
    modal: document.querySelectorAll('.vdd-modal-overlay').length,
  }))
  if (chrome.modal !== 0) fail('escape', 'Escape did not close the modal')
  if (chrome.drawer) fail('escape', 'the second Escape did not close the drawer')
}

// ── dirty state, end to end ────────────────────────────────────────────────
await walk('a dirty panel asks before closing', async () => {
  await drive(() => window.__demo.workspace.focusPanel('dirtyForm'))
  await page.waitForTimeout(250)
  await page.locator('[data-demo-dirty]').first().click({ timeout: 4000 })
  await page.waitForTimeout(200)
  /**
   * `void`, deliberately.
   *
   * `page.evaluate` awaits whatever the function returns, and `requestClosePanel` on a dirty
   * panel returns a promise that settles only when the user answers the question — so
   * returning it hangs the gate forever with no output at all. Discarding it starts the close
   * and lets the walkthrough answer the dialog itself, which is the point of the step.
   */
  await drive(() => { void window.__demo.workspace.requestClosePanel('dirtyForm') })
})
{
  const asked = await drive(() => ({
    modal: document.querySelectorAll('.vdd-modal-overlay').length,
    stillOpen: 'dirtyForm' in window.__demo.workspace.state.panels,
  }))
  record.push({ step: 'dirty close', ...asked })
  if (asked.modal !== 1) fail('dirty close', 'closing a dirty panel did not ask')
  if (!asked.stillOpen) fail('dirty close', 'the panel closed before the question was answered')
}

await walk('answering "No" keeps it open', async () => {
  await page.locator('[data-vdd-confirm-cancel]').first().click({ timeout: 4000 })
})
{
  const after = await drive(() => 'dirtyForm' in window.__demo.workspace.state.panels)
  if (!after) fail('dirty close', 'the panel closed even though the question was refused')
}

// ── locale and direction ───────────────────────────────────────────────────
await walk('switch to Arabic, which is read right-to-left', async () => {
  await page.selectOption('[data-demo-locale]', 'ar')
})
{
  const rtl = await drive(() => {
    const ws = window.__demo.workspace
    const close = document.querySelector('[data-vdd-close]')
    return {
      dir: ws.state.dir,
      // The library's own strings come from the demo's table through `formatMessage`.
      tooltip: close?.getAttribute('title') ?? '',
    }
  })
  record.push({ step: 'rtl', ...rtl })
  if (rtl.dir !== 'rtl') fail('locale', `direction is "${rtl.dir}" after choosing Arabic`)
  if (!/إغلاق/.test(rtl.tooltip)) fail('locale', `a tab's close tooltip is "${rtl.tooltip}", not the Arabic string`)
}
await page.screenshot({ path: `${OUT}/04-rtl.png` })

await walk('back to English', async () => {
  await page.selectOption('[data-demo-locale]', 'en')
})

// ── skins and the colour scheme ────────────────────────────────────────────
await walk('every skin, and the light scheme', async () => {
  for (const skin of ['macos', 'chrome', 'slate', 'nord', 'obsidian', 'tokyo', 'vscode']) {
    await page.selectOption('[data-demo-skin]', skin)
    await page.waitForTimeout(90)
  }
  await page.locator('[data-demo-theme]').first().click({ timeout: 4000 })
}, 500)
{
  const light = await drive(() => document.documentElement.getAttribute('data-color-scheme'))
  if (light !== 'light') fail('scheme', `data-color-scheme is "${light}" after toggling`)
}
await page.screenshot({ path: `${OUT}/05-light.png` })
await walk('back to dark', async () => {
  await page.locator('[data-demo-theme]').first().click({ timeout: 4000 })
})

// ── save, reload, restore ──────────────────────────────────────────────────
// The whole point of the format: a layout survives the page, and it is byte-compatible with
// react-dockable-desktop's own.
await walk('save the layout', async () => {
  await page.locator('[data-demo-cc-tab="layout"]').first().click({ timeout: 4000 })
  await page.waitForTimeout(200)
  await page.locator('[data-demo-save-layout]').first().click({ timeout: 4000 })
})
const saved = await drive(() => localStorage.getItem('vdd-demo-layout'))
if (!saved) fail('save', 'nothing was written to localStorage')
/**
 * What a restore has to reproduce is the *saved payload*, not a snapshot taken earlier.
 *
 * Clicking "save" focuses the Control Center, so the state before that click is already
 * stale — comparing against it reported a mismatch that was the gate's own bookkeeping.
 */
const before = JSON.parse(saved ?? '{}')
const expected = {
  open: Object.keys(before.panels ?? {}).sort(),
  active: before.activePanelId ?? null,
  floating: (before.floating ?? []).map(w => w.id).sort(),
}
record.push({ step: 'saved', bytes: saved?.length ?? 0, ...expected })

step = 'reload'
expectNavigation = true
await page.reload({ waitUntil: 'load' })
expectNavigation = false
await page.waitForFunction(() => !!window.__demo, null, { timeout: 60000 })
await page.waitForTimeout(3500)
record.push({ step: 'after reload', ...(await state()) })

await walk('restore the saved layout', async () => {
  await page.locator('[data-demo-cc-tab="layout"]').first().click({ timeout: 4000 })
  await page.waitForTimeout(200)
  await page.locator('[data-demo-restore-layout]').first().click({ timeout: 4000 })
}, 2500)

{
  const after = await state()
  record.push({ step: 'restored', ...after })

  // Same panels, same placement, same active tab — and the active one is a panel that is
  // actually visible, which is the invariant the whole port is built on.
  const missing = expected.open.filter(id => !after.open.includes(id))
  if (missing.length) fail('restore', `these panels did not come back: ${missing.join(', ')}`)
  if (after.floating.join() !== expected.floating.join()) {
    fail('restore', `the layout recorded floating [${expected.floating}] and restored [${after.floating}]`)
  }
  if (after.active !== expected.active) {
    fail('restore', `the layout recorded active "${expected.active}" and restored "${after.active}"`)
  }

  const visible = await drive(() => {
    const ws = window.__demo.workspace
    const id = ws.state.activePanelId
    if (!id) return { ok: false, why: 'no active panel' }
    const panel = ws.state.panels[id]
    if (!panel) return { ok: false, why: 'active panel is not open' }
    if (panel.state === 'minimized') return { ok: false, why: 'active panel is minimised' }
    // A docked panel must be the *selected* tab of its own group, not merely present in it.
    const walkTree = (node) => node.type === 'leaf'
      ? (node.panels.includes(id) ? node : null)
      : node.children.map(walkTree).find(Boolean) ?? null
    if (panel.state === 'docked') {
      const leaf = walkTree(ws.state.gridRoot)
      if (!leaf) return { ok: false, why: 'active panel is in no leaf' }
      if (leaf.activePanelId !== id) return { ok: false, why: 'active panel is a background tab' }
    }
    return { ok: true, id, state: panel.state }
  })
  record.push({ step: 'active is visible', ...visible })
  if (!visible.ok) fail('restore', `activePanelId names something the user cannot see: ${visible.why}`)

  // And the panel that contributed its own state got it back.
  const notes = await drive(() => {
    const parsed = JSON.parse(localStorage.getItem('vdd-demo-layout') ?? '{}')
    return parsed.panels?.dirtyEditor?.props ?? null
  })
  record.push({ step: 'onSaveState', props: notes })
  if (!notes || typeof notes.content !== 'string') {
    fail('restore', 'the notes panel did not contribute its content to the saved layout')
  }
}

await page.screenshot({ path: `${OUT}/06-restored.png` })

// ── the layout the *other* library wrote ───────────────────────────────────
// Byte compatibility is a headline claim, so the gate loads a layout produced by
// react-dockable-desktop 6.2.0 rather than one this demo wrote.
await walk('load a layout saved by react-dockable-desktop', async () => {
  const rdd = JSON.stringify({
    version: 2,
    gridRoot: {
      type: 'branch', orientation: 'horizontal', sizes: [0.6, 0.4],
      children: [
        { type: 'leaf', id: 'rdd-left', panels: ['editor', 'terminal'], activePanelId: 'terminal' },
        { type: 'leaf', id: 'rdd-right', panels: ['help'], activePanelId: 'help' },
      ],
    },
    floating: [],
    minimized: [],
    activePanelId: 'terminal',
    panels: {
      editor: { id: 'editor', title: 'Code Editor', component: 'editor', state: 'docked', serializable: true },
      terminal: { id: 'terminal', title: 'Terminal', component: 'terminal', state: 'docked', serializable: true },
      help: { id: 'help', title: 'Help', component: 'help', state: 'docked', serializable: true },
    },
  })
  await drive((json) => window.__demo.workspace.loadLayout(json), rdd)
}, 1200)
{
  const after = await state()
  record.push({ step: 'rdd layout', ...after })
  if (after.open.join() !== ['editor', 'help', 'terminal'].join()) {
    fail('rdd layout', `open panels are [${after.open}], expected the three the layout names`)
  }
  if (after.active !== 'terminal') fail('rdd layout', `active is "${after.active}", not the layout's own`)
}

await page.screenshot({ path: `${OUT}/07-rdd-layout.png` })

// ── the panels that were moved through all of that are still alive ─────────
{
  step = 'survival'
  const alive = await drive(() => ({
    monaco: document.querySelectorAll('.monaco-editor').length,
    terminalLines: document.querySelector('[data-demo-terminal] pre')?.textContent?.split('\n').length ?? 0,
  }))
  record.push({ step: 'survival', ...alive })
  if (alive.monaco < 1) fail('survival', 'no Monaco editor survived the walkthrough')
  // The terminal appends a line every 1.2s and has been running the whole time, so a
  // re-created panel would show only the three it starts with.
  if (alive.terminalLines <= 3) {
    fail('survival', `the terminal shows ${alive.terminalLines} lines — it was re-created rather than moved`)
  }
}

const passed = failures.length === 0
writeFileSync(`${OUT}/browser.json`, JSON.stringify({ passed, failures, navigations, record }, null, 2) + '\n')

console.log('M14 browser gate — the demo, walked through')
for (const entry of record) console.log('  ' + JSON.stringify(entry))
if (!passed) { console.log('FAILURES:'); failures.forEach(f => console.log('   ' + f)) }
console.log(passed ? 'M14 BROWSER: PASS' : 'M14 BROWSER: FAIL')
await browser.close()
process.exit(passed ? 0 : 1)
