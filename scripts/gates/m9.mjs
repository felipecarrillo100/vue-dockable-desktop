/**
 * M9 gate — sidebar and toolbar.
 *
 * The 133 ported tests cover behaviour. These are the structural decisions behind that
 * behaviour, which a jsdom test cannot see: that the layout lives in the stylesheet rather
 * than inline, that the left and right arrangements come from one implementation, that each
 * sidebar owns its own resize flag, and that no keyframe the library animates can be
 * hijacked by a name the host page happens to define.
 */
import { readFileSync } from 'node:fs'
import { declarationsFor, rules, stripSourceComments } from './lib/css.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
const src = (p) => stripSourceComments(readFileSync(p, 'utf8'))

const css = readFileSync('src/index.css', 'utf8')
const sidebar = src('src/components/VddSidebar.vue')
const rail = src('src/components/VddSidebarRail.vue')
const drawer = src('src/components/VddSidebarDrawer.vue')
const secondary = src('src/components/VddSecondarySidebar.vue')
const toolbar = src('src/components/VddToolbar.vue')
const group = src('src/components/VddToolbarGroupButton.vue')
const toolbarState = src('src/core/toolbarState.ts')

// ── 1. Structure is in the stylesheet, not inline (D12) ─────────────────────
// rdd kept the sidebar's whole layout in `style={{…}}` objects on the JSX, so its stylesheet
// had no sidebar layout at all. Anything inline needs `!important` to override and is
// invisible to a stylesheet review — which is how four dead rules shipped.
const structural = {
  '.vdd-sidebar-layout': ['display: flex', 'height: 100%', 'overflow: hidden'],
  '.vdd-sidebar-strip-outer': ['overflow: hidden', 'flex-shrink: 0', 'transition: width'],
  '.vdd-sidebar-main': ['flex-basis: 0', 'min-width: 0', 'overflow: hidden'],
  '.vdd-sidebar-content-drawer': ['overflow: hidden', 'transition:'],
  '.vdd-sidebar-drawer-pane': ['flex-direction: column', 'height: 100%'],
}
for (const [selector, properties] of Object.entries(structural)) {
  const decl = declarationsFor(css, selector)
  must(decl.length > 0, `${selector} has no rule — the layout must be in CSS, not inline (D12)`)
  for (const p of properties) must(decl.includes(p), `${selector} must declare ${p}`)
}

// Only genuinely per-render values stay inline: the animating sizes and each pane's display.
// Anything else inline is a rule a consumer cannot reach.
const inlineStyleBlocks = [...sidebar.matchAll(/:style="\{([^}]*)\}"/g), ...rail.matchAll(/:style="\{([^}]*)\}"/g), ...drawer.matchAll(/:style="\{([^}]*)\}"/g)]
  .map(m => m[1])
const allowedInline = /^(width|height|flexBasis|minWidth|maxWidth|display|transition|cursor|flexShrink|zIndex|\.\.\.)/
for (const block of inlineStyleBlocks) {
  for (const decl of block.split(',')) {
    const key = decl.trim().split(':')[0].trim()
    if (!key) continue
    must(allowedInline.test(key), `inline style "${key}" belongs in the stylesheet (D12)`)
  }
}

// ── 2. One implementation for both sides ────────────────────────────────────
// The left and right arrangements are the same three pieces in opposite order. Writing the
// markup twice is exactly how two sides drift apart — so the rail, the drawer and the
// ordering each exist once.
must(/VddSidebarRail/.test(sidebar) && /VddSidebarDrawer/.test(sidebar),
  'the strip and drawer must be their own components, shared by both sides')
must(/position === 'left' \? \[/.test(sidebar),
  'the piece order must be one list keyed on position, not two branches of duplicated markup')
must((sidebar.match(/<VddSidebarRail/g) ?? []).length === 1,
  'the rail must be rendered exactly once — a second copy for the other side will drift')
must((sidebar.match(/<VddSidebarDrawer/g) ?? []).length === 1,
  'the drawer must be rendered exactly once')

// A pane needs its own component to provide its own tab context: `provide` is per instance,
// and the drawer renders every mounted pane inside one.
must(/VddSidebarTabScope/.test(drawer),
  'each pane must provide its own tab context through a wrapper component')

// ── 3. The secondary is the same component, typed ───────────────────────────
must(/import VddSidebar from '\.\/VddSidebar\.vue'/.test(secondary),
  'the secondary must render the primary component, not a fork of it')
must(/\$attrs/.test(secondary),
  'the secondary must forward $attrs, or every v-model on a secondary is inert')
must(/SidebarProps/.test(secondary),
  'the secondary must forward declared props, not just attrs — otherwise the types are gone')
must(/primary\.isSecondary/.test(secondary), 'nesting a secondary in a secondary must be refused')

// ── 4. Resize state is per instance ─────────────────────────────────────────
// A module-level flag would work in every single-sidebar test and fail only with two on
// screen, suppressing the wrong drawer's transition (SB47).
must(/const resizing = ref\(false\)/.test(sidebar),
  'each sidebar instance must own its resizing flag')
must(/:resizing="resizing"/.test(sidebar), 'the flag must be passed to that instance\'s own drawer')
must(/resizing \? \{ transition: 'none' \} : \{\}/.test(drawer),
  'only the resizing drawer may drop its transition')

// ── 5. Toolbar state needs no provider ──────────────────────────────────────
// rdd needed a <ToolbarProvider> in the tree; here it is on the workspace, so a panel can
// read or set the active tool without the toolbar passing anything down (ADR 0004).
must(/useWorkspace\(\)\.toolbar/.test(src('src/composables/useToolbar.ts')),
  'useToolbar() must read the workspace, not a provider of its own')
must(!/provide\(/.test(toolbar), 'the toolbar must not introduce a provider')
must(/createToolbarState/.test(src('src/core/workspace.ts')),
  'the workspace must create the toolbar state, so it is live before any component')

// A controlled item is one whose prop is *present*, `false`/`null` included. Testing
// truthiness instead silently makes `active: false` and `activeItemId: null` uncontrolled,
// which is how two instances of one panel type end up sharing state.
must(/item\.active !== undefined/.test(toolbar),
  'a toggle is controlled when `active` is present at all, including false')
must(/props\.item\.activeItemId !== undefined/.test(group),
  'a group is controlled when `activeItemId` is present at all, including null')

// ── 6. The flyout escapes the strip and is dismissible ──────────────────────
must(/<Teleport v-if="open" to="body">/.test(group),
  'the flyout must teleport out, or the strip\'s overflow: hidden clips it')
must(/addEventListener\('pointerdown', onOutside, \{ capture: true \}\)/.test(group),
  'the flyout needs a capture-phase pointerdown to dismiss')
must(/key === 'Escape'/.test(group), 'Escape must dismiss the flyout')
must(/onBeforeUnmount\(close\)/.test(group),
  'unmounting with the flyout open must remove its document listeners')
must(/target instanceof Node/.test(group),
  'the dismiss handler must guard non-Node targets — contains() throws on them')

// ── 7. Collapsed size only, never the open size ─────────────────────────────
// The open size belongs to the stylesheet, including its coarse-pointer override; hard-coding
// it inline would quietly undo the larger touch targets.
must(/visible\.value !== false\s*\n?\s*\? \{\}/.test(toolbar),
  'a visible toolbar must set no inline size at all')
const coarse = rules(css).some(r => r.selectors.some(s => s.includes('.vdd-toolbar-btn')))
must(coarse, 'the toolbar button size must be in CSS, where a media query can override it')

// ── 8. No keyframe name the host page can hijack ────────────────────────────
// @keyframes names are global to the document, like classes. An unprefixed `fadeIn` is
// overridden by any host stylesheet that defines its own — silently, with no error.
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])
must(keyframes.length > 0, 'expected the stylesheet to define keyframes')
for (const name of keyframes) {
  must(name.startsWith('vdd-'), `@keyframes ${name} is unprefixed — the host page can redefine it`)
}
for (const name of [...css.matchAll(/animation:\s*([\w-]+)/g)].map(m => m[1])) {
  must(name.startsWith('vdd-') || /^(none|inherit|initial|unset)$/.test(name),
    `animation "${name}" names an unprefixed keyframe`)
}

// ── 9. Rail entries stay distinguishable ────────────────────────────────────
// A tab, an action button and a caller-rendered entry all arrive through one union, and two
// of the three carry a `component` field. The discriminators have to be checked in an order
// that cannot confuse them.
must(/'custom' in entry && entry\.custom === true/.test(src('src/core/sidebarTypes.ts')),
  'a custom entry must be identified by an explicit marker, not by carrying a component')
must(/!isCustomEntry\(entry\) && 'onClick' in entry/.test(src('src/core/sidebarTypes.ts')),
  'an action button must be distinguished from a custom entry, not merely from a tab')
must(/toggles\[id\] === true/.test(toolbarState),
  'an unset toggle must read as false, not undefined')

if (failures.length) {
  console.error('M9: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log('M9: ok — layout in CSS, one implementation per side, per-instance resize, ' +
  'controlled-means-present, keyframes prefixed')
