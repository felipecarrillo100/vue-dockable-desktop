/**
 * M12 gate — contributions and i18n.
 *
 * The headline rule is the one the plan names: **a contribution published by a hidden panel
 * is not surfaced.** That is not really a property of this feature — it is the
 * `activePanelId` invariant from M3, and this milestone is where it either pays off or is
 * revealed to have been pointless. A contribution read from anything other than the single
 * resolution point would reintroduce divergence D2 in the most visible place there is: the
 * app's own toolbar, showing controls that act on a panel behind another tab.
 */
import { readFileSync } from 'node:fs'
import { stripSourceComments } from './lib/css.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
const src = (p) => stripSourceComments(readFileSync(p, 'utf8'))

const contributions = src('src/core/contributions.ts')
const hook = src('src/composables/useContributions.ts')
const workspace = src('src/core/workspace.ts')
const messages = src('src/core/messages.ts')
const colorScheme = src('src/composables/useColorScheme.ts')
const desktop = src('src/components/VddDesktop.vue')
const frame = src('src/components/VddOverlayFrame.vue')
const overlayState = src('src/core/overlayState.ts')
const widget = src('src/components/VddFloatingWidget.vue')

// ── 1. The invariant ───────────────────────────────────────────────────────
// Read from `activePanelId` and nothing else. Not the first key of `panels` (which is
// insertion order, and is exactly how rdd surfaced a hidden panel's contribution after a
// restore), not a leaf's own selection, not the last-focused id.
must(/activeContributionRef\(contributions, \(\) => state\.activePanelId\)/.test(workspace),
  'the active contribution must be read from activePanelId, the single resolution point')
must(!/Object\.keys\(state\.panels\)\[0\]/.test(workspace),
  'nothing may seed or read an active panel from insertion order (that is divergence D2)')
// The store itself must not *work out* which panel is active — it is handed the answer. So
// it cannot reach the workspace at all, which is what makes "one resolution point" true
// rather than merely intended.
must(!/from '\.\/workspace'/.test(contributions),
  'the contribution store must not import the workspace — it is handed the active id')
must(/activeContributionRef\(\s*\n?\s*contributions: Contributions,\s*\n?\s*activePanelId: \(\) => string \| null/.test(contributions),
  'the active id must arrive as an argument, not be derived inside the store')

// ── 2. Withdrawal is guarded, and publishing comes first ───────────────────
// A republish hands back a new withdrawal; calling the previous one must do nothing, or every
// update clears the value it has just written depending only on call order.
must(/if \(map\.get\(panelId\) === stored\) \{/.test(contributions),
  'a withdrawal must only clear the registration it belongs to')
must(/const previous = withdraw\s*\n\s*withdraw = ws\.contributions\.publish\(id, next\)\s*\n\s*previous\(\)/.test(hook),
  'a republish must publish before withdrawing, so the contribution is never momentarily absent')

// A getter, not an object: rdd asked callers to memoise, and to call the hook every render.
must(/MaybeRefOrGetter<PanelContribution>/.test(hook),
  'usePanelContribution must take a getter or ref, so republishing is the framework\'s job')
must(/onScopeDispose\(\(\) => \{ stop\(\); withdraw\(\) \}\)/.test(hook),
  'a contribution must be withdrawn with its component, and its watcher stopped')

// ── 3. Components and icons stay raw ───────────────────────────────────────
// A contribution holds the application's components and callbacks; deep-proxying those is not
// the library's business, and reactive() on a component definition is pure waste.
must(/markRaw\(s\.component\)/.test(contributions), 'a section\'s component must be kept raw')
must(/shallowReactive\(new Map/.test(contributions),
  'the store must be shallow — a contribution changes by replacement, not by mutation')

// ── 4. Merging is a function first, a composable second ────────────────────
// rdd could only offer hooks, because reading its store needed useSyncExternalStore.
for (const fn of ['sectionToTab', 'mergeToolbarItems', 'mergeSidebarTabs']) {
  must(new RegExp(`export function ${fn}\\(`).test(contributions), `${fn} must be a plain function`)
}
// Returning the same array when there is nothing to add is what lets a caller treat the
// result as stable; a fresh copy every call would invalidate memoisation downstream.
must(/if \(!contributed\?\.length\) return staticItems/.test(contributions),
  'a merge with nothing to add must return the original array')
must(/if \(!sections\?\.length\) return staticTabs/.test(contributions),
  'the same, for tabs')
// `eagerMount`/`preserveState` have nothing to mean for a contributed section.
must(!/eagerMount|preserveState/.test(contributions),
  'a contributed section must not set eagerMount or preserveState — it lives only while active')

// ── 5. The i18n surface is reachable without a component ───────────────────
// rdd had useFormatMessage / usePredefinedMessages / useStyleClasses, so none of it could be
// used from a service. All three are fields on the workspace here.
must(/format\(label: Label \| undefined\): string/.test(workspace), 'format must be on the workspace')
must(/readonly messages: Record<keyof typeof defaultMessages, MessageDescriptor>/.test(workspace),
  'the message table must be on the workspace')
must(/readonly classes: Required<HostClasses>/.test(workspace),
  'the consumer classes must be on the workspace, with every field present')
// Namespaced ids, so an application's own message table cannot collide with the library's.
for (const m of messages.matchAll(/id: '([^']+)'/g)) {
  must(m[1].startsWith('vdd.'), `message id "${m[1]}" is not namespaced under vdd.`)
}

// Every title the library *stores* must be a Label, and must be resolved where it is rendered.
// A resolved string kept on the library's side can never be re-resolved, so a `string` here is
// a title that is permanently in whatever language was current when it was stored. This is the
// rdd 6.2.0 report; vdd shared the defect. PO28-PO30 cover the behaviour.
must(/title: Label\b/.test(overlayState),
  'ManagedWidget.title must be a Label — a stored string can never follow a locale change')
must(/\{\{ ws\.format\(title\) \}\}/.test(widget),
  'the widget header must resolve its title through ws.format on every render')
must(!/\{\{ title \}\}/.test(widget),
  'the widget header must not interpolate a raw title, which renders a descriptor as its own JSON')

// ── 6. The consumer classes actually reach an element ──────────────────────
// rdd's own test asserted only that its hook returned the config — true of any object, and
// unable to fail. The library has already shipped four CSS hookups that matched nothing.
must(/ws\.classes\.modalBody : ws\.classes\.sidePanelBody/.test(frame),
  'the frame must apply the configured body class')
must(/:class="\[c\.body, hostBodyClass\]"/.test(frame),
  'the configured class must be added alongside the library\'s own, not instead of it')
for (const [file, field] of [
  ['src/components/VddModalHost.vue', 'modal'],
  ['src/components/VddSidePanelHost.vue', 'sidePanel'],
  ['src/components/VddFloatingWindow.vue', 'window'],
  ['src/components/VddFloatingWindow.vue', 'windowBody'],
]) {
  must(new RegExp(`ws\\.classes\\.${field}\\b`).test(src(file)),
    `${file} must apply ws.classes.${field}`)
}

// ── 7. Diagnostics: development-only, and actionable ───────────────────────
// Both describe a failure that produces a black rectangle and no error anywhere, so each has
// to say what to do rather than that something is wrong.
must(/--vdd-styles-loaded/.test(desktop), 'the stylesheet sentinel must be checked')
must(/import 'vue-dockable-desktop\/styles\.css'/.test(desktop),
  'the sentinel message must contain the exact import to paste')
must(/if \(process\.env\.NODE_ENV === 'production'\) return[\s\S]{0,400}--vdd-styles-loaded/.test(desktop),
  'the sentinel check must be development-only')
must(/catch \{/.test(desktop), 'a missing getComputedStyle (SSR) must not throw')
must(/Zero height starts at:/.test(desktop),
  'the zero-height warning must name where the chain breaks, not just that it is broken')
must(/warnedZeroHeight/.test(desktop), 'the zero-height warning must fire once')

// ── 8. useColorScheme reads the attribute and cleans up ────────────────────
// The attribute is the contract, so this works for a scheme the application sets itself.
must(/data-color-scheme/.test(colorScheme), 'the scheme must be read from the attribute')
must(/new MutationObserver/.test(colorScheme), 'it must follow changes, not sample once')
must(/onScopeDispose\(\(\) => observer\.disconnect\(\)\)/.test(colorScheme),
  'the observer must be disconnected with the scope, or every mount leaks one for the page\'s life')
must(/=== 'light' \? 'light' : 'dark'/.test(colorScheme),
  'anything other than "light" must read as dark, so there is no third state to handle')

if (failures.length) {
  console.error('M12: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log('M12: ok — contributions read activePanelId only, withdrawal guarded, ' +
  'i18n reachable without a component, stored titles localisable, classes reach their elements, ' +
  'diagnostics actionable')
