/**
 * Gate self-test — proves each standing gate FAILS when its rule is broken.
 *
 * Integrity rule 5 (docs/IMPLEMENTATION_PLAN.md) demands non-vacuity: a check that cannot
 * fail proves nothing. This deliberately breaks each rule, asserts the gate catches it, and
 * restores the file. Run it whenever a gate is added or changed.
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const run = (cmd) => spawnSync(cmd, { shell: true, encoding: 'utf8' })
const results = []

function check(name, file, mutate, gate) {
  const backup = `${file}.selftest-backup`
  copyFileSync(file, backup)
  try {
    writeFileSync(file, mutate(readFileSync(file, 'utf8')))
    const r = run(`node ${gate}`)
    const caught = r.status !== 0
    results.push({ name, caught, output: (r.stderr || r.stdout).trim().split('\n').slice(0, 2).join(' | ') })
  } finally {
    copyFileSync(backup, file)
    unlinkSync(backup)
  }
}

check('css-prefix catches a bare class selector', 'src/index.css',
  s => s + '\n.bare-class { color: red; }\n', 'scripts/gates/css-prefix.mjs')

check('css-prefix catches an unprefixed custom property', 'src/index.css',
  s => s.replace('--vdd-styles-loaded: 1;', '--vdd-styles-loaded: 1;\n  --sidebar-bg: #123;'),
  'scripts/gates/css-prefix.mjs')

// api-surface reads the built output, so these mutate the source and rebuild first.
const rebuild = 'npm run build >/dev/null 2>&1'
check('css-prefix catches an unprefixed class in a dynamic binding', 'src/components/VddPanelSlot.vue',
  s => s.replace('class="vdd-panel-slot"', ":class=\"['vdd-panel-slot', 'sneaky-bare']\""),
  'scripts/gates/css-prefix.mjs')

check('css-prefix catches a bare class beside a comparison in a ternary', 'src/components/VddSidebarRail.vue',
  s => s.replace("area === 'header' ? 'vdd-sidebar-header-area' : 'vdd-sidebar-footer-area'",
                 "area === 'header' ? 'bare-header-area' : 'vdd-sidebar-footer-area'"),
  'scripts/gates/css-prefix.mjs')

check('css-prefix catches a bare class in a ternary\'s ELSE branch', 'src/components/VddSidePanelHost.vue',
  s => s.replace("position === 'left' ? 'vdd-side-panel-left' : 'vdd-side-panel-right'",
                 "position === 'left' ? 'vdd-side-panel-left' : 'bare-right'"),
  'scripts/gates/css-prefix.mjs')

check('css-prefix catches an unprefixed class in an object-syntax key', 'src/components/VddTaskbar.vue',
  s => s.replace("{ 'vdd-taskbar-expanded': visibility === 'autohide' && expanded }",
                 "{ 'bare-expanded': visibility === 'autohide' && expanded }"),
  'scripts/gates/css-prefix.mjs')

check('css-prefix catches an unprefixed class added via classList', 'src/core/panelDom.ts',
  s => s.replace("el.className = 'vdd-panel-store'", "el.classList.add('bare-store')"),
  'scripts/gates/css-prefix.mjs')

check('M1 catches the exported version drifting from package.json', 'src/index.ts',
  s => s.replace("export const version = '1.0.0'", "export const version = '0.9.0'"),
  'node scripts/gates/m1.mjs')

check('api-surface catches an undocumented export', 'src/index.ts',
  s => s + '\nexport const sneaky = 1\n', `${rebuild} && node scripts/gates/api-surface.mjs`)

check('api-surface catches a removed export', 'src/index.ts',
  s => s.replace("export const version = '1.0.0'", "const version = '1.0.0'\nvoid version"),
  `${rebuild} && node scripts/gates/api-surface.mjs`)

check('api-surface refuses a stale build', 'src/index.ts',
  s => s + '\n// touched without rebuilding\n', 'node scripts/gates/api-surface.mjs')

// counts: raise the recorded floor above reality and confirm the gate objects
check('counts catches a dropped test', 'test/baseline-counts.json',
  s => { const j = JSON.parse(s); const k = Object.keys(j)[0]; j[k] = (j[k] ?? 0) + 99; return JSON.stringify(j, null, 2) },
  'scripts/gates/counts.mjs')

// M3's central claim: only resolveActive may decide activePanelId. Break that and the gate
// must object, or divergence D2 could creep back one action at a time.
check('M3 catches a placement action deciding activePanelId for itself', 'src/core/workspace.ts',
  s => s.replace('function closeLeafGroup(leafId: string): void {',
                 'function closeLeafGroup(leafId: string): void {\n    state.activePanelId = null'),
  'npm run build >/dev/null 2>&1 && node scripts/gates/m3.mjs')

check('M3 catches the return of the pending-call handshake', 'src/core/workspace.ts',
  s => s.replace('function warn(message: string): void {',
                 'function _connect(): void { /* re-added */ }\n  function warn(message: string): void {'),
  'npm run build >/dev/null 2>&1 && node scripts/gates/m3.mjs')

// M9's claims. Each of these is a real defect vdd either inherited or narrowly avoided, so
// each mutation below is a shape the code has actually had at some point.
check('M9 catches sidebar layout moved back inline', 'src/index.css',
  s => s.replace('.vdd-sidebar-main {', '.vdd-sidebar-main-disabled {'),
  'node scripts/gates/m9.mjs')

check('M9 catches a second copy of the rail for the other side', 'src/components/VddSidebar.vue',
  s => s.replace('<VddSidebarRail', '<VddSidebarRail v-if="position === \'left\'"', 1)
        .replace('@select="toggleTab"\n      />', '@select="toggleTab"\n      />\n      <VddSidebarRail v-else :tabs="tabs" :header="headerEntries" :footer="footerEntries" :active-tab-id="activeTabId" :position="position" :visible="isStripVisible" @select="toggleTab" />', 1),
  'node scripts/gates/m9.mjs')

check('M9 catches a module-level resize flag shared by every sidebar', 'src/components/VddSidebar.vue',
  s => s.replace('const resizing = ref(false)', 'const resizing = sharedResizing'),
  'node scripts/gates/m9.mjs')

check('M9 catches a controlled toggle decided by truthiness instead of presence', 'src/components/VddToolbar.vue',
  s => s.replace('item.active !== undefined ? item.active', 'item.active ? item.active'),
  'node scripts/gates/m9.mjs')

check('M9 catches a controlled group decided by truthiness instead of presence', 'src/components/VddToolbarGroupButton.vue',
  s => s.replace('props.item.activeItemId !== undefined', '!!props.item.activeItemId'),
  'node scripts/gates/m9.mjs')

check('M9 catches an unprefixed keyframe the host page could redefine', 'src/index.css',
  s => s.replace('@keyframes vdd-fade-in', '@keyframes fadeIn').replace('animation: vdd-fade-in', 'animation: fadeIn'),
  'node scripts/gates/m9.mjs')

check('M9 catches the toolbar forcing its open size inline', 'src/components/VddToolbar.vue',
  s => s.replace("? {}\n  : isVertical.value", "? { width: '48px' }\n  : isVertical.value"),
  'node scripts/gates/m9.mjs')

check('M9 catches the secondary sidebar dropping $attrs (every v-model on it goes inert)', 'src/components/VddSecondarySidebar.vue',
  s => s.replace('v-bind="{ ...props, ...$attrs }"', 'v-bind="props"'),
  'node scripts/gates/m9.mjs')

// M10's claims. As with M9, each mutation is a shape rdd actually shipped or that vdd
// briefly had — the dirty-close path in particular was wired to nothing in rdd.
check('M10 catches a dirty close that discards instead of asking', 'src/core/workspace.ts',
  s => s.replace('const confirm = options?.onConfirm', 'const confirm = undefined ?? options?.onConfirm'),
  'node scripts/gates/m10.mjs')

check('M10 catches confirmDiscard defaulting to true with no renderer', 'src/core/overlays.ts',
  s => s.replace('confirmRenderer?.(request) ?? Promise.resolve(false)',
                 'confirmRenderer?.(request) ?? Promise.resolve(true)'),
  'node scripts/gates/m10.mjs')

check('M10 catches a host re-implementing its own Escape handler', 'src/components/VddModalHost.vue',
  s => s.replace('const sizeClass = computed',
                 "document.addEventListener('keydown', e => { if (e.key === 'Escape') close() })\nconst sizeClass = computed"),
  'node scripts/gates/m10.mjs')

check('M10 catches Escape reaching every modal instead of the topmost', 'src/composables/useOverlayHost.ts',
  s => s.replace('if (overlays.topmostModal()?.id !== self.id) return', ''),
  'node scripts/gates/m10.mjs')

check('M10 catches an inline body padding default', 'src/components/VddOverlayFrame.vue',
  s => s.replace('bodyPadding != null ? { padding: bodyPadding } : undefined',
                 "{ padding: bodyPadding ?? '0px' }"),
  'node scripts/gates/m10.mjs')

check('M10 catches the toast queue reverting to an emitter', 'src/core/toast.ts',
  s => s.replace('export const toastQueue = reactive<', 'const listeners = new Set()\nexport const toastQueue2 = reactive<'),
  'node scripts/gates/m10.mjs')

check('M10 catches maxVisible becoming a second array instead of a slice', 'src/components/VddToasts.vue',
  s => s.replace('if (shown >= props.maxVisible) break', 'if (shown >= 999) break'),
  'node scripts/gates/m10.mjs')

check('M10 catches a queued-then-dismissed toast being left as an invisible record', 'src/components/VddToasts.vue',
  s => s.replace('if (item.exiting && !onScreen.has(item.id)) removeToast(item.id)', ''),
  'node scripts/gates/m10.mjs')

check('M10 catches the toast height cap read from offsetHeight', 'src/components/VddToastItem.vue',
  s => s.replace('el.scrollHeight', 'el.offsetHeight'),
  'node scripts/gates/m10.mjs')

check('M10 catches a minimised panel reporting the wrong container type', 'src/components/VddPanelMount.vue',
  s => s.replace("const effective = panel.state === 'minimized' ? panel.previousState ?? 'docked' : panel.state",
                 'const effective = panel.state'),
  'node scripts/gates/m10.mjs')

check('M10 catches caller props being able to shadow the injected panelId', 'src/components/VddPanelMount.vue',
  s => s.replace('v-bind="info?.props ?? {}"\n        :panel-id="panelId"',
                 ':panel-id="panelId"\n        v-bind="info?.props ?? {}"'),
  'node scripts/gates/m10.mjs')

check('M10 catches the D14 ordering divergence being dropped from the docs', 'docs/PARITY.md',
  s => s.replace('| D14 |', '| D14-removed |'),
  'node scripts/gates/m10.mjs')

// M11's claims. The first two are rdd's actual defects; the rest are shapes vdd had during
// the milestone, including the self-triggering effect the tests caught on the first run.
check('M11 catches a handle set that ignores the anchor', 'src/core/panelOverlay.ts',
  s => s.replace("const freeBlock: ResizeDir = anchor.startsWith('top-') ? 's' : 'n'",
                 "const freeBlock: ResizeDir = 's'"),
  'node scripts/gates/m11.mjs')

check('M11 catches a resize handle placed outside its own box (D5)', 'src/index.css',
  s => s.replace('.vdd-resize-se { bottom: 0; right: 0;', '.vdd-resize-se { bottom: -4px; right: -4px;'),
  'node scripts/gates/m11.mjs')

check('M11 catches a stretched axis offering only one end', 'src/core/panelOverlay.ts',
  s => s.replace("dirs.push(...(inlineStretched ? (['e', 'w'] as ResizeDir[]) : [freeInline]))",
                 'dirs.push(freeInline)'),
  'node scripts/gates/m11.mjs')

check('M11 catches a stretched axis that writes a measured width instead of two pins', 'src/components/VddFloatingWidget.vue',
  s => s.replace('style.insetInlineEnd = `${store.insets.inlineEnd + DOCK_INSET}px`',
                 'style.width = `${size.value.w}px`'),
  'node scripts/gates/m11.mjs')

check('M11 catches placement being written from more than one place', 'src/components/VddFloatingWidget.vue',
  s => s.replace('  mode.value = ref', '  mode.value = ref')
        .replace("      applyPlacement(zone, stretch.value)", "      placement.value = { anchor: zone, stretch: stretch.value }"),
  'node scripts/gates/m11.mjs')

check('M11 catches the drag threshold being removed before a detach', 'src/components/VddFloatingWidget.vue',
  s => s.replace('DRAG_THRESHOLD) return', 'DRAG_THRESHOLD) void 0'),
  'node scripts/gates/m11.mjs')

check('M11 catches a self-triggering watchEffect on the stacks', 'src/components/VddFloatingWidget.vue',
  s => s.replace('watch(\n  [() => open.value, mode, anchor, stretch],', 'watchEffect(\n  ['),
  'node scripts/gates/m11.mjs')

check('M11 catches the toolbar measuring only once', 'src/components/VddPanelToolbar.vue',
  s => s.replace('observer = new ResizeObserver(measure)', 'observer = null as unknown as ResizeObserver'),
  'node scripts/gates/m11.mjs')

check('M11 catches stacking that uses the anchor instead of the placement buckets', 'src/components/VddFloatingWidget.vue',
  s => s.replace('    bucketsFor(anchor.value, stretch.value),', '    [anchor.value],'),
  'node scripts/gates/m11.mjs')

check('M11 catches the search dropdown losing its teleport', 'src/components/VddToolbarSearch.vue',
  s => s.replace('<Teleport v-if="dropdown && results.length" to="body">', '<div v-if="dropdown && results.length">')
        .replace('</Teleport>', '</div>'),
  'node scripts/gates/m11.mjs')

check('M11 catches the geometry core importing Vue', 'src/core/panelOverlay.ts',
  s => "import { ref } from 'vue'\nvoid ref\n" + s,
  'node scripts/gates/m11.mjs')

check('M11 catches the manual documenting a model that does not exist', 'docs/manual/07-panel-overlay.md',
  s => s.replace('v-model:placement', 'v-model:anchor'),
  'node scripts/gates/m11.mjs')

// M12's claims. The first is rdd's D2 in the place it was most visible — the app's own
// toolbar showing a hidden panel's controls.
check('M12 catches a contribution read from insertion order instead of activePanelId (D2)', 'src/core/workspace.ts',
  s => s.replace('activeContributionRef(contributions, () => state.activePanelId)',
                 'activeContributionRef(contributions, () => Object.keys(state.panels)[0] ?? null)'),
  'node scripts/gates/m12.mjs')

check('M12 catches an unguarded withdrawal clearing a newer contribution', 'src/core/contributions.ts',
  s => s.replace('if (map.get(panelId) === stored) {', 'if (true) {'),
  'node scripts/gates/m12.mjs')

check('M12 catches withdraw-before-publish, which leaves a gap', 'src/composables/useContributions.ts',
  s => s.replace('const previous = withdraw\n    withdraw = ws.contributions.publish(id, next)\n    previous()',
                 'withdraw()\n    withdraw = ws.contributions.publish(id, next)'),
  'node scripts/gates/m12.mjs')

check('M12 catches a merge returning a fresh array when there is nothing to add', 'src/core/contributions.ts',
  s => s.replace('if (!contributed?.length) return staticItems', 'if (!contributed?.length) return [...staticItems]'),
  'node scripts/gates/m12.mjs')

check('M12 catches a consumer class that no element applies', 'src/components/VddFloatingWindow.vue',
  s => s.replace('ws.classes.windowBody', "''"),
  'node scripts/gates/m12.mjs')

check('M12 catches a consumer class replacing the library\'s own instead of adding to it', 'src/components/VddOverlayFrame.vue',
  s => s.replace(':class="[c.body, hostBodyClass]"', ':class="hostBodyClass"'),
  'node scripts/gates/m12.mjs')

check('M12 catches a stored widget title typed as a bare string', 'src/core/overlayState.ts',
  s => s.replace('title: Label', 'title: string'),
  'node scripts/gates/m12.mjs')

check('M12 catches a widget header interpolating its title instead of resolving it', 'src/components/VddFloatingWidget.vue',
  s => s.replace('{{ ws.format(title) }}', '{{ title }}'),
  'node scripts/gates/m12.mjs')

check('M12 catches an un-namespaced message id', 'src/core/messages.ts',
  s => s.replace("closeTab: { id: 'vdd.closeTab'", "closeTab: { id: 'closeTab'"),
  'node scripts/gates/m12.mjs')

check('M12 catches the stylesheet diagnostic losing its copy-pasteable fix', 'src/components/VddDesktop.vue',
  s => s.replace("import 'vue-dockable-desktop/styles.css'", 'the stylesheet'),
  'node scripts/gates/m12.mjs')

check('M12 catches the zero-height warning no longer naming where the chain breaks', 'src/components/VddDesktop.vue',
  s => s.replace('Zero height starts at:', 'Something is wrong:'),
  'node scripts/gates/m12.mjs')

check('M12 catches useColorScheme leaking its observer', 'src/composables/useColorScheme.ts',
  s => s.replace('onScopeDispose(() => observer.disconnect())', '// leaked'),
  'node scripts/gates/m12.mjs')

check('M12 catches the contribution store reaching into the workspace', 'src/core/contributions.ts',
  s => s.replace("import type { SidebarTab } from './sidebarTypes'",
                 "import { WORKSPACE_KEY } from './workspace'\nvoid WORKSPACE_KEY\nimport type { SidebarTab } from './sidebarTypes'"),
  'node scripts/gates/m12.mjs')

check('docs-api catches a copy-me example using a component it never imports', 'docs/manual/01-getting-started.md',
  s => s.replace("import { VddDesktop, VddModals, VddSidePanels, VddToasts } from 'vue-dockable-desktop'",
                 "import { VddDesktop } from 'vue-dockable-desktop'"),
  'node scripts/gates/docs-api.mjs')

check('docs-api catches the claim that app.use() registers the components', 'docs/manual/01-getting-started.md',
  s => s.replace('`app.use()` makes `useWorkspace()` available everywhere',
                 '`app.use()` registers the components globally and makes `useWorkspace()` available everywhere'),
  'node scripts/gates/docs-api.mjs')

check('docs-api catches a documented openPanel call with options where the key belongs', 'README.md',
  s => s.replace("ws.openPanel('overview', 'map', { title: 'Overview' })",
                 "ws.openPanel('map', { title: 'Overview' })"),
  'node scripts/gates/docs-api.mjs')

check('docs-api catches the manual naming a component that is not exported', 'docs/manual/06-sidebar-toolbar.md',
  s => s.replace('<VddSidebar', '<VddSidebarDeluxe'),
  'node scripts/gates/docs-api.mjs')

check('docs-api catches a retired name outside a migration table', 'docs/manual/09-contributions.md',
  s => s.replace('## From inside a panel', '## From inside a panel\n\nSee useStyleClasses.'),
  'node scripts/gates/docs-api.mjs')

// M13's claims. The first is the one the whole document exists to prevent: an rdd suite
// quietly dropped from the test map.
check('M13 catches an rdd suite dropped from the test map', 'docs/PARITY.md',
  s => s.replace('| `StyleHookups` (199) |', '| `StyleHookup` (199) |'),
  'node scripts/gates/m13.mjs')

check('M13 catches a TBD left in PARITY.md', 'docs/PARITY.md',
  s => s + '\nTBD: finish this section.\n',
  'node scripts/gates/m13.mjs')

check('M13 catches a gap in the divergence numbering', 'docs/PARITY.md',
  s => s.replace('| D14 |', '| D16 |'),
  'node scripts/gates/m13.mjs')

check('M13 catches a decision left Proposed', 'docs/decisions/0002-zero-unmount-via-teleport.md',
  s => s.replace(/Status:?\s*\**\s*Accepted/i, 'Status: Proposed'),
  'node scripts/gates/m13.mjs')

check('M13 catches a manual chapter reverting to an outline', 'docs/manual/09-contributions.md',
  s => s.replace('# 9. Panel contributions', '# 9. Panel contributions\n\n> **Outline only.** Drafted once the corresponding milestone lands.'),
  'node scripts/gates/m13.mjs')

check('M13 catches an emitted class with no rule and no declaration', 'src/components/VddDesktop.vue',
  s => s.replace('class="vdd-workspace"', 'class="vdd-workspace vdd-unstyled-hook"'),
  'node scripts/gates/m13.mjs')

check('M13 catches a consumer hook that has quietly gained a rule', 'src/index.css',
  s => s + '\n.vdd-row { color: red; }\n',
  'node scripts/gates/m13.mjs')

check('non-vacuity catches a module the suite never executes', 'test/composables/useOverlays.test.ts',
  _s => 'import { describe, it } from \'vitest\'\ndescribe(\'disabled\', () => { it(\'placeholder\', () => {}) })\n',
  'npx vitest run --coverage --silent >/dev/null 2>&1 && node scripts/gates/non-vacuity.mjs')

// M14's claims. The first is rdd's actual leak: its demo's utility classes shipped in the
// library's published stylesheet, so every consumer downloaded styles for an app they never saw.
check('M14 catches a demo class leaking into the library stylesheet', 'src/index.css',
  s => s + '\n.dd-leaked { color: red; }\n',
  'node scripts/gates/m14.mjs')

check('M14 catches the demo restyling the library globally', 'demo/src/demo.css',
  s => s + '\n.vdd-workspace-tab { color: red; }\n',
  'node scripts/gates/m14.mjs')

check('M14 catches the demo reaching into src instead of importing the package', 'demo/src/main.ts',
  s => s.replace("from 'vue-dockable-desktop'", "from '../../src/index'"),
  'node scripts/gates/m14.mjs')

check('M14 catches a capability no demo panel demonstrates', 'demo/src/panels/DirtyFormPanel.vue',
  s => s.replace('panel.onBeforeClose(', 'noSuchGuard('),
  'node scripts/gates/m14.mjs')

check('M14 catches a React dependency creeping back in', 'package.json',
  s => s.replace('"leaflet"', '"react-intl": "^6.0.0",\n    "leaflet"'),
  'node scripts/gates/m14.mjs')

check('M14 catches the library gaining a runtime dependency', 'package.json',
  s => s.replace('"peerDependencies"', '"dependencies": { "leaflet": "^1.9.4" },\n  "peerDependencies"'),
  'node scripts/gates/m14.mjs')

// The 1.0.1 rules. Each mutation below is a shape the code actually shipped in 1.0.0, so these
// are regression proofs rather than hypotheticals.
check('M14 catches an object literal bound to a placement model', 'src/components/VddPanelOverlay.vue',
  s => s.replace(':placement="placement"',
                 ':placement="{ anchor: widget.anchor ?? \'top-right\', stretch: widget.stretch ?? null }"'),
  'node scripts/gates/m14.mjs')

check('M14 catches the overlay binding placement with no write-back', 'src/components/VddPanelOverlay.vue',
  s => s.replace('      @update:placement="(next: PanelFloatPlacement) => store.setManagedPlacement(id, next)"\n', ''),
  'node scripts/gates/m14.mjs')

check('M14 catches setManagedPlacement re-rendering the widget list', 'src/core/overlayState.ts',
  s => s.replace('      if (id in managedPlacements) managedPlacements[id] = placement',
                 '      if (id in managedPlacements) managedPlacements[id] = placement\n      managedVersion.value++'),
  'node scripts/gates/m14.mjs')

check('M14 catches the demo demonstrating managed widgets declaratively', 'demo/src/panels/CameraWidgets.vue',
  s => s.replace('const widgets = useFloatingWidgets()', 'const widgets = fakeWidgets()'),
  'node scripts/gates/m14.mjs')

// M1: hide a build artefact the exports map promises
const hidden = 'dist/styles.css'
if (existsSync(hidden)) {
  copyFileSync(hidden, `${hidden}.selftest-backup`)
  unlinkSync(hidden)
  const r = run('node scripts/gates/m1.mjs')
  results.push({ name: 'M1 catches a missing build artefact', caught: r.status !== 0,
                 output: (r.stderr || r.stdout).trim().split('\n').slice(0, 2).join(' | ') })
  copyFileSync(`${hidden}.selftest-backup`, hidden)
  unlinkSync(`${hidden}.selftest-backup`)
}

const failed = results.filter(r => !r.caught)
for (const r of results) console.log(`  ${r.caught ? 'caught' : 'MISSED'}  ${r.name}`)
if (failed.length) {
  console.error(`\nselftest: FAIL — ${failed.length} gate(s) did not catch their own violation`)
  process.exit(1)
}
console.log(`\nselftest: ok — all ${results.length} gate rules are non-vacuous`)
