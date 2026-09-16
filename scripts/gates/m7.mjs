/**
 * M7 gate — the taskbar and the live preview.
 *
 * Three of this milestone's four bugs were values react-dockable-desktop carried as **inline
 * JSX styles** rather than CSS, so porting the stylesheet silently dropped them. All three
 * were load-bearing, and all three were only findable in a browser. These checks exist so
 * they cannot be dropped again.
 */
import { readFileSync } from 'node:fs'
import { declarationsFor, stripSourceComments } from './lib/css.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
const css = readFileSync('src/index.css', 'utf8')

// 1. Stacking. rdd set both of these inline (`zIndex: 100` on the footer, `zIndex: 999999`
//    on the tooltip). Without them a split divider's invisible hit-box paints over the
//    autohide peek strip and over the preview, so neither can be hovered or clicked at all.
must(/z-index/.test(declarationsFor(css, '.vdd-taskbar-footer-container')),
  '.vdd-taskbar-footer-container needs a z-index, or workspace content covers the autohide strip')
must(/z-index/.test(declarationsFor(css, '.vdd-taskbar-item-tooltip')),
  '.vdd-taskbar-item-tooltip needs a z-index, or a split divider paints over the preview')
must(/var\(--vdd-z-base/.test(declarationsFor(css, '.vdd-taskbar-item-tooltip')),
  'the preview must stack against --vdd-z-base so zIndexBase moves it with the rest of the chrome')

// 2. D11: the thumbnail is clickable; its contents are not. rdd marks the whole frame
//    `pointer-events: none`, so a click over the thumbnail — most of the preview — passes
//    straight through and does nothing.
must(!/pointer-events:\s*none/.test(declarationsFor(css, '.vdd-taskbar-item-preview-frame')),
  'the preview frame must accept clicks, or the thumbnail is dead to the pointer (D11)')
must(/pointer-events:\s*none/.test(declarationsFor(css, '.vdd-taskbar-item-preview-host')),
  'the preview contents must stay inert, so the live panel inside cannot be interacted with')

// 3. Ownership. Both the slot and the preview borrow the same panel element, and the order
//    in which they mount and unmount is not guaranteed — so each must check it still holds
//    the panel before handing it back. A function ref is also called with `null` on
//    teardown, which is exactly where an unconditional hand-back does the damage.
const preview = stripSourceComments(readFileSync('src/components/VddTaskbarPreview.vue', 'utf8'))
must(/hostOf\(id\) !== mine/.test(preview),
  'the preview must check it still holds the panel before parking it')
must(/if \(element\) \{/.test(preview) && /releaseIfStillMine\(props\.panelId\)/.test(preview),
  'the preview\'s function ref must route its null case through the ownership check')
const slot = stripSourceComments(readFileSync('src/components/VddPanelSlot.vue', 'utf8'))
must(/hostOf\(props\.panelId\) === host/.test(slot), 'the slot must make the same ownership check')

// 4. The mode class the stylesheet is keyed on. rdd's `taskbarVisibility` prop did nothing at
//    all in 6.0.0 because the component emitted `taskbar-mode-autohide` while every rule was
//    keyed on `.rdd-taskbar-mode-autohide`.
const bar = stripSourceComments(readFileSync('src/components/VddTaskbar.vue', 'utf8'))
must(/`vdd-taskbar-mode-\$\{visibility\}`/.test(bar), 'the taskbar must emit vdd-taskbar-mode-<mode>')
// Only `autohide` has mode-specific CSS — it is the one that changes how the bar is
// positioned. `always` and `compact` differ in *whether* the bar renders, not in how, so
// they deliberately have no rules; rdd's own 6.0.1 notes say the same. The 6.0.0 bug was
// that `autohide`'s rules never matched, so that is the one worth asserting.
must(css.includes('vdd-taskbar-mode-autohide'),
  'no stylesheet rule is keyed on vdd-taskbar-mode-autohide — the mode would silently do nothing')
must(/visibility === 'compact'|items\.value\.length > 0/.test(bar),
  'compact mode must be expressed by whether the bar renders, since it has no CSS of its own')

// 5. Hovering a taskbar icon must never steal the caret from whatever the user is typing in.
must(/refocus: false/.test(preview), 'previewing a panel must not restore focus into it')

if (failures.length) {
  console.error('M7: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log('M7: ok — stacking in CSS, thumbnail clickable, panel ownership checked both ways')
