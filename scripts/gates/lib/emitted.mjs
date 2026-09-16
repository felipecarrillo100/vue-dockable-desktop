/**
 * The class names the library's own components emit.
 *
 * Extracted from `css-prefix.mjs` in M13, so the prefix gate and the correspondence gate
 * cannot disagree about what "a class the library emits" means. Two gates with two scanners
 * is two chances to be wrong about the same question.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir) => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

/**
 * The class names a `:class` expression can emit.
 *
 * The expression is code, so only literals in a class-name *position* count:
 *
 *  - a literal beside `===`/`!==` is being **compared**, not emitted —
 *    `area === 'header' ? 'vdd-a' : 'vdd-b'` names two classes, not three.
 *  - inside an object, the **keys** are classes and the values are conditions —
 *    `{ 'vdd-x': mode === 'wide' }` names one class.
 *
 * Object values are therefore stripped, but **only inside braces**. Applying that strip to
 * the whole expression silently ate the else-branch of every ternary, because `? a : b`'s
 * colon looks exactly like an object separator — so a bare class after the colon was never
 * checked. That hole survived four earlier fixes to this function because each was driven by
 * a false *positive*; this one was a false negative, and only the M13 correspondence sweep
 * made it visible (`vdd-side-panel-right` looked like a rule nothing emitted).
 */
export function classNamesInExpression(expression) {
  const withoutComparisons = expression
    .replace(/[^\s(]+\s*[=!]==?\s*(?:'[^']*'|"[^"]*"|`[^`]*`)/g, '')
    .replace(/(?:'[^']*'|"[^"]*"|`[^`]*`)\s*[=!]==?\s*[^\s)?]+/g, '')

  // Strip each object's values in place, leaving everything outside braces untouched.
  const expr = withoutComparisons.replace(/\{[^{}]*\}/g, (block) =>
    block.replace(/((?:'[^']*'|"[^"]*"|`[^`]*`|[\w$.[\]]+)\s*):\s*[^,}]+/g, '$1:'))

  const found = new Set()
  for (const lit of expr.matchAll(/'([^']*)'|`([^`$]*)`/g)) {
    for (const cls of (lit[1] ?? lit[2] ?? '').split(/\s+/)) if (cls) found.add(cls)
  }
  return found
}

/** Every `.vue`/`.ts` file under `src`. */
export function sourceFiles(root = 'src') {
  return existsSync(root) ? walk(root).filter(f => /\.(vue|ts)$/.test(f)) : []
}

/**
 * Class names one source file emits, as a Set.
 *
 * Two forms, scanned differently on purpose:
 *
 *  - a **static** `class="a b"` attribute: every token is a class name.
 *  - a **dynamic** `:class="expr"` binding: the expression is code, not class names, so only
 *    literals in a class-name *position* count. Object values are comparison values, and a
 *    literal beside `===` is being compared — both are dropped before literals are read.
 *    Four false positives were fixed here over M6–M9, each with a selftest case.
 *
 * A name assembled at runtime cannot be seen from the source at all; the M13 browser gate
 * cross-checks what is actually rendered, which is where that case is covered.
 */
export function emittedClasses(file) {
  const src = readFileSync(file, 'utf8')
  const found = new Set()

  // Class attributes only exist in markup, so only the template is scanned for them —
  // scanning the whole file once reported a `class="…"` inside a diagnostic message string.
  const template = file.endsWith('.vue')
    ? (src.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? '')
    : src

  for (const m of template.matchAll(/(^|[^:\w-])class=(?:"([^"]*)"|'([^']*)')/g)) {
    for (const cls of (m[2] ?? m[3] ?? '').split(/\s+/)) if (cls) found.add(cls)
  }

  for (const m of template.matchAll(/(?::|v-bind:)class=(?:"([^"]*)"|'([^']*)')/g)) {
    for (const cls of classNamesInExpression(m[1] ?? m[2] ?? '')) found.add(cls)
  }

  for (const m of src.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)) {
    for (const lit of m[1].matchAll(/'([^']*)'|"([^"]*)"/g)) {
      const cls = lit[1] ?? lit[2] ?? ''
      if (cls) found.add(cls)
    }
  }
  for (const m of src.matchAll(/className\s*=\s*(?:'([^']*)'|"([^"]*)"|`([^`$]*)`)/g)) {
    for (const cls of (m[1] ?? m[2] ?? m[3] ?? '').split(/\s+/)) if (cls) found.add(cls)
  }

  return found
}

/** Every class name the library emits, mapped to the files that emit it. */
export function allEmittedClasses(root = 'src') {
  const byClass = new Map()
  for (const file of sourceFiles(root)) {
    for (const cls of emittedClasses(file)) {
      if (!byClass.has(cls)) byClass.set(cls, [])
      byClass.get(cls).push(file)
    }
  }
  return byClass
}

/**
 * Classes the library composes at runtime, enumerated exactly.
 *
 * `` `vdd-resize-${dir}` `` emits eight classes no static scan can read, so they have to be
 * declared. A *prefix* wildcard was the first attempt and was worse than useless: two
 * expressions compose `` `vdd-${position}` ``, whose prefix is the bare `vdd-`, which
 * matches every class in the stylesheet — so the dead-rule half of the correspondence check
 * silently passed everything. An exact enumeration means a new composed class has to be
 * declared here, which is the behaviour worth having.
 *
 * Each entry names the expression it stands for, so the list can be checked against the
 * source rather than trusted.
 */
export const COMPOSED_CLASSES = {
  // `vdd-${position}` — VddToolbar, VddToolbarGroupButton, VddSidebarRail, VddSidebarDrawer
  'vdd-${position}': ['vdd-left', 'vdd-right', 'vdd-top', 'vdd-bottom'],
  // `vdd-resize-${dir}` — VddFloatingWindow, VddFloatingWidget
  'vdd-resize-${dir}': ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map(d => `vdd-resize-${d}`),
  // `vdd-taskbar-mode-${visibility}` — VddTaskbar
  'vdd-taskbar-mode-${visibility}': ['always', 'compact', 'autohide'].map(m => `vdd-taskbar-mode-${m}`),
  // `vdd-toast--${type}` — VddToastItem
  'vdd-toast--${type}': ['info', 'success', 'warning', 'error'].map(t => `vdd-toast--${t}`),
  // `vdd-toast-container--${position}` — VddToasts
  'vdd-toast-container--${position}': ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    .map(p => `vdd-toast-container--${p}`),
  // `vdd-confirmation-alert-${alertType}` — VddConfirm
  'vdd-confirmation-alert-${alertType}': ['info', 'warning', 'success', 'danger']
    .map(t => `vdd-confirmation-alert-${t}`),
  // `vdd-modal-size-${size}` — VddModalHost
  'vdd-modal-size-${size}': ['small', 'medium', 'large', 'fullscreen', 'auto']
    .map(s => `vdd-modal-size-${s}`),
  // `vdd-panel-float-dropzone--${zone}` — VddPanelOverlay
  'vdd-panel-float-dropzone--${zone}': ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    .map(z => `vdd-panel-float-dropzone--${z}`),
  // `vdd-panel-toolbar--${position}` — VddPanelToolbar
  'vdd-panel-toolbar--${position}': ['top', 'bottom', 'left', 'right']
    .map(p => `vdd-panel-toolbar--${p}`),
  // `vdd-dock-target-${position}` — VddDropZones
  'vdd-dock-target-${position}': ['left', 'right', 'top', 'bottom', 'center']
    .map(p => `vdd-dock-target-${p}`),
  // `vdd-edge-trigger-${e}` — VddEdgeZones
  'vdd-edge-trigger-${e}': ['left', 'right', 'top', 'bottom'].map(e => `vdd-edge-trigger-${e}`),
  // `vdd-corner-zone--${c}` — VddEdgeZones
  'vdd-corner-zone--${c}': ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    .map(c => `vdd-corner-zone--${c}`),
}

/**
 * `vdd-context-menu--${theme}` takes a caller-supplied string, so the set is open. Only the
 * library's own default can be enumerated; a consumer's own theme name is theirs to style.
 */
export const OPEN_ENDED_PREFIXES = ['vdd-context-menu--']

/** Every class the library emits: statically readable plus enumerated-composed. */
export function everyEmittedClass(root = 'src') {
  const all = new Set(allEmittedClasses(root).keys())
  for (const list of Object.values(COMPOSED_CLASSES)) for (const cls of list) all.add(cls)
  return all
}

/**
 * Classes emitted with no rule anywhere, and deliberately so: stable names a consumer can
 * hang their own styling on. A framework-agnostic library wants these; what it must not have
 * is the reverse — a *rule* nothing emits, which is dead weight that looks like styling.
 *
 * rdd emits all six of these with no rule of its own either, so this is inherited intent
 * rather than an omission. Documented in docs/manual/10-theming.md.
 */
export const CONSUMER_HOOKS = new Set([
  'vdd-taskbar-mode-always',         // the default bar; only autohide needs rules
  'vdd-taskbar-mode-compact',        // likewise — rdd has no rule for either either
  'vdd-btn-more-actions',            // the floating window's overflow button
  'vdd-panel-toolbar-search--open',  // the search field's expanded state
  'vdd-row',                         // a grid branch's row wrapper
  'vdd-column',                      // ...and its column wrapper
  'vdd-sidebar-header-action-btn',   // a pinned rail button, vs a tab button
  'vdd-toolbar-btn-action',          // an action button, vs a radio or a toggle
  'vdd-tooltip-title-text',          // the taskbar preview's title
])
