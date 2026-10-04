/**
 * Assertions against the stylesheet source.
 *
 * jsdom never loads the stylesheet, so a computed-style test would pass no matter which
 * class a component emitted — which is exactly how rdd shipped four rules that matched
 * nothing. These read the CSS text directly.
 *
 * Includes rdd's `sidePanelPositioning.test.ts` (1 test, name preserved).
 *
 * Since 1.7.1 `src/index.css` is generated from the area files in `src/styles/` by
 * `scripts/build-css.mjs`; the first test fails when it was not regenerated after an edit.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const css = readFileSync(resolve(import.meta.dirname, '../../src/index.css'), 'utf8')

describe('generated stylesheet', () => {
  it('src/index.css is exactly what src/styles/*.css give (run `npm run css` after an edit)', () => {
    const run = spawnSync('node', [resolve(import.meta.dirname, '../../scripts/build-css.mjs'), '--check'], { encoding: 'utf8' })
    expect(run.stderr.trim()).toBe('')
    expect(run.status).toBe(0)
  })
})
/** Rules only. Assertions must be about what the stylesheet *does*, never about its prose —
 *  a comment explaining why a selector was removed should not look like the selector. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector: string): string | null => {
  const m = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`))
  return m ? m[0] : null
}

// A <button> keeps the browser's own padding (1px 6px in Chrome) unless something resets it, and
// every vdd- element is border-box, so on a page without a CSS reset that padding came out of the
// toolbar's 36px and the rail's 44px and capped their icons at 24px / 32px (rdd 7.6.2).
describe('icon buttons do not depend on the host page\'s button padding (rdd 7.6.2)', () => {
  it('the workspace toolbar and sidebar rail buttons reset their padding', () => {
    for (const selector of ['.vdd-toolbar-btn', '.vdd-sidebar-tab-btn']) {
      expect(rule(selector)?.replace(/\/\*[\s\S]*?\*\//g, ''), selector).toMatch(/(^|[;{\s])padding:\s*0\s*;/)
    }
  })
})

describe('SP1: .vdd-side-panel stays position: fixed', () => {
  it('does not regress to position: absolute', () => {
    // position: absolute makes the panel's containing block whatever positioned ancestor the
    // app happens to have, which made it contribute real scrollable overflow while sliding
    // in — the browser then auto-scrolled on focus and dragged the ancestor's content
    // sideways in lockstep with the animation. Verified live in a browser for rdd 5.3.4.
    const r = rule('.vdd-side-panel')
    expect(r).not.toBeNull()
    expect(r!).toMatch(/position:\s*fixed/)
    expect(r!).not.toMatch(/position:\s*absolute/)
  })
})

describe('the maximized-window rule matches the class the component renders', () => {
  it('targets .vdd-maximized, not a bare .maximized (rdd D9)', () => {
    // rdd's rule said `.rdd-floating-window.maximized` while the component rendered
    // `rdd-maximized`, so a maximized window kept its rounded corners, border and shadow
    // while filling the workspace. docs/PARITY.md divergence D9.
    expect(rules).toMatch(/\.vdd-floating-window\.vdd-maximized\s*\{/)
    expect(rules).not.toMatch(/\.vdd-floating-window\.maximized\s*\{/)
  })
})

describe('the library does not style the host page', () => {
  it('has no html, body or #root rules (rdd D8)', () => {
    expect(rules).not.toMatch(/(^|[},\s])html\s*[,{]/)
    expect(rules).not.toMatch(/(^|[},\s])body\s*[,{]/)
    expect(rules).not.toMatch(/#root/)
  })

  it('offers .vdd-fill-viewport as the opt-in alternative', () => {
    expect(rules).toMatch(/\.vdd-fill-viewport\s*\{/)
  })
})

describe('resize handles are not clipped away (D5)', () => {
  it('positions every handle inside its box, never at a negative inset', () => {
    // rdd puts each handle at -4px to straddle the edge, but the elements carrying them are
    // `overflow: hidden`, so the outer half is clipped: an 8px edge handle leaves ~4px
    // hittable and a corner drag does nothing at all. Measured in Chrome, then fixed by
    // insetting to 0. The browser gate asserts the resulting behaviour; this asserts the rule.
    for (const dir of ['n', 's', 'e', 'w', 'ne', 'se', 'sw', 'nw']) {
      // Every rule for the handle, not just the first: the touch (`@media (pointer: coarse)`)
      // rules had the same defect, and checking only the first match missed it.
      const all = [...rules.matchAll(new RegExp(`\\.vdd-resize-${dir}\\b[^{]*\\{([^}]*)\\}`, 'g'))]
      expect(all.length, `.vdd-resize-${dir} has no rule`).toBeGreaterThan(0)
      for (const decl of all) {
        expect(decl[1], `.vdd-resize-${dir} is positioned outside its box`)
          .not.toMatch(/(top|bottom|left|right)\s*:\s*-\d/)
      }
    }
  })
})

describe('no third-party vendor classes are hard-coded', () => {
  it('does not target a specific mapping library\'s own class (rdd D10)', () => {
    expect(rules).not.toMatch(/\.luciad\b/)
  })
})

describe('the styles-loaded sentinel is present', () => {
  it('declares --vdd-styles-loaded so a missing import can be detected at mount', () => {
    expect(rules).toMatch(/--vdd-styles-loaded:\s*1/)
  })
})

describe('1.1.2 stylesheet fixes', () => {
  it('.vdd-fill-viewport also works on <VddDesktop> itself, where .vdd-workspace sets height: 100%', () => {
    // Same specificity, and `.vdd-workspace` comes later, so the bare class lost on the
    // component's own root. The compound selector outranks it.
    const m = rules.match(/([^{}]*)\{[^}]*height:\s*100vh[^}]*\}/)
    expect(m).not.toBeNull()
    expect(m![1]).toMatch(/\.vdd-workspace\.vdd-fill-viewport/)
  })

  it('a collapsed toolbar strip drops its edge border', () => {
    expect(rules).toMatch(/\.vdd-toolbar-strip\.vdd-toolbar-strip--collapsed\s*\{[^}]*border-width:\s*0/)
  })

  it('the taskbar preview fades in from above, never over its icon', () => {
    // It rests at translateY(-100%), 8px above the icon, with a bridge filling the gap.
    // Starting at -90% put its bottom edge ~18px lower — over the icon — for the first
    // frames, so a quick click hit the preview. Any start below rest drags the bridge over the
    // icon, so it must start above.
    const kf = rules.match(/@keyframes vdd-tooltip-fade-in\s*\{[\s\S]*?\n\}/)
    expect(kf).not.toBeNull()
    expect(kf![0]).not.toMatch(/translateY\(-90%\)/)
    expect(kf![0]).toMatch(/from\s*\{[^}]*translateY\(calc\(-100% - \d+px\)\)/)
    // The hover bridge spans the 8px gap and no more.
    expect(rule('.vdd-taskbar-item-tooltip::before')!).toMatch(/height:\s*8px/)
  })
})

describe('one font token for all chrome (1.2.0)', () => {
  // Four rules hard-coded three different stacks, and chrome rendered outside the workspace —
  // teleported menus, flyouts and toasts, and modals and drawers mounted beside it — set none,
  // so it took the host page's body font.
  it('declares --vdd-font-family on :root', () => {
    expect(rules).toMatch(/:root\s*\{[^}]*--vdd-font-family:/)
  })

  it("the library's own form controls inherit it; a consumer's are left alone (rdd 6.4.0)", () => {
    // A <button> does not inherit a font, so without this the rail and toolbar buttons kept the
    // browser's button font whatever the token said. Found by the M15 font check (1.3.0).
    expect(rules).toMatch(/:where\(button, input, select, textarea\)\[class\*="vdd-"\]\s*\{\s*font-family:\s*inherit;?\s*\}/)
  })

  it('no rule hard-codes a family other than monospace or inherit', () => {
    const families = Array.from(rules.matchAll(/(?<![\w-])font-family:\s*([^;]+);/g)).map(m => m[1]!.trim())
    const hardCoded = families.filter(f => !/^var\(--vdd-font-family\)$|^monospace$|^inherit$/.test(f))
    expect(hardCoded).toEqual([])
  })

  it.each([
    '.vdd-workspace', '.vdd-taskbar-item-tooltip', '.vdd-floating-window-title', '.vdd-context-menu',
    '.vdd-modal-overlay', '.vdd-side-panel', '.vdd-toast-container', '.vdd-toolbar-group-flyout',
    '.vdd-panel-toolbar-search__dropdown', '.vdd-toolbar-strip', '.vdd-sidebar-layout',
  ])('%s reads the token', (selector) => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[},])\\s*[^{}]*${esc}(?![\\w-])[^{}]*\\{[^}]*font-family:\\s*var\\(--vdd-font-family\\)`)
    expect(rules).toMatch(re)
  })
})

// ── Branding (1.3.0) ────────────────────────────────────────────────────────
// Ported from react-dockable-desktop 7.2.0 `StylesheetContract.test.ts`, "branding contract"
// (5 tests, names kept, `rdd-` → `vdd-`). A consumer sets --vdd-brand-accent /
// --vdd-brand-on-accent on :root and every built-in skin follows. Two things make that work, and
// both are easy to undo by accident: the library only ever *reads* the brand variables (a
// declaration here would override the consumer's :root value on the element that carries
// data-vdd-skin), and each skin's accent colour appears exactly once, in its --vdd-accent-color
// declaration. The rendered result is gated in real Chrome by scripts/gates/browser/m15.mjs.

describe('branding contract (index.css)', () => {
  /** Every skin accent, plus the active-state colours slate, tokyo and obsidian used before 1.3.0. */
  const ACCENT_FAMILY = ['#38bdf8', '#0066cc', '#8ab4f8', '#1a73e8', '#0078d4', '#88c0d0', '#5e81ac', '#bb9af7', '#9854f1']
    .map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))
    .concat([[96, 165, 250], [122, 162, 247], [56, 90, 246], [167, 139, 250]])

  it('every --vdd-accent-color declaration reads --vdd-brand-accent first', () => {
    const decls = [...rules.matchAll(/--vdd-accent-color\s*:\s*([^;]+);/g)].map(m => m[1]!.trim())
    expect(decls.length).toBeGreaterThanOrEqual(14) // :root, the light scheme, and 6 skins × 2
    expect(decls.filter(v => !/^var\(--vdd-brand-accent,\s*#[0-9a-f]{6}\)$/i.test(v))).toEqual([])
  })

  it('never declares a --vdd-brand-* variable (the consumer does)', () => {
    expect(rules.match(/--vdd-brand-[\w-]+\s*:/g) ?? []).toEqual([])
  })

  it('no accent colour is written as a literal outside its --vdd-accent-color declaration', () => {
    const literals: string[] = []
    for (const m of rules.matchAll(/#[0-9a-fA-F]{6}\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)[^)]*\)/g)) {
      const rgb = m[0].startsWith('#') ? [1, 3, 5].map(i => parseInt(m[0].slice(i, i + 2), 16)) : [m[1], m[2], m[3]].map(Number)
      if (!ACCENT_FAMILY.some(a => a.every((v, i) => v === rgb[i]))) continue
      const before = rules.slice(Math.max(0, m.index - 60), m.index)
      // A var() fallback — the skin's own colour inside var(--vdd-brand-accent, …), or a fallback
      // of a variable that is always defined — is the one place a literal belongs.
      if (/var\(--vdd-[\w-]+,\s*$/.test(before)) continue
      literals.push(`${m[0]} after …${before.slice(-40).replace(/\s+/g, ' ')}`)
    }
    expect(literals).toEqual([])
  })

  it('only :root declares --vdd-font-family; a skin sets --vdd-skin-font-family instead', () => {
    // A skin-level --vdd-font-family would override the consumer's :root font on the workspace.
    const declaring = [...rules.matchAll(/([^{}]+)\{[^{}]*--vdd-font-family\s*:/g)].map(m => m[1]!.trim())
    expect(declaring).toEqual([':root'])
    expect(rules).toMatch(/--vdd-font-family:\s*var\(--vdd-skin-font-family,/)
  })

  it('text on a solid accent fill reads --vdd-brand-on-accent', () => {
    for (const sel of ['.vdd-btn-primary', '[data-color-scheme="light"] .vdd-btn-primary', '.vdd-dock-target-box--active']) {
      const body = rules.match(new RegExp(`(^|\\})\\s*${sel.replace(/[.\-[\]"=]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[2] ?? ''
      expect(body, sel).toMatch(/(^|[;\s])color:\s*var\(--vdd-brand-on-accent,/)
    }
  })
})

// ── Brand surfaces and corners (1.4.0) ──────────────────────────────────────
// Ported from react-dockable-desktop 7.3.0 `StylesheetContract.test.ts`, "corner contract" and
// "surface contract" (names kept, `rdd-` → `vdd-`). The rendered result is gated in real Chrome by
// scripts/gates/browser/m16.mjs.

describe('corner contract (index.css)', () => {
  /** Kept as they are at every scale: circles and pills stay round, a zero is a zero. */
  const UNSCALED = /^(0|0px|50%|999px|inherit)$/

  it('every corner length is multiplied by --vdd-radius-scale', () => {
    const bare: string[] = []
    for (const m of rules.matchAll(/(border(?:-(?:top|bottom)-(?:left|right))?-radius)\s*:\s*([^;]+);/g)) {
      const parts = m[2]!.replace(/\s*!important\s*$/, '').match(/calc\([^()]*(?:\([^()]*\)[^()]*)*\)|var\([^)]*\)|[^\s]+/g) ?? []
      for (const p of parts) {
        if (UNSCALED.test(p)) continue
        if (/^calc\(.+ \* var\(--vdd-radius-scale, 1\)\)$/.test(p)) continue
        bare.push(`${m[1]}: ${m[2]!.trim()}`)
        break
      }
    }
    expect(bare).toEqual([])
  })

  it('never declares --vdd-radius-scale (the consumer does)', () => {
    expect(rules.match(/--vdd-radius-scale\s*:/g) ?? []).toEqual([])
  })
})

describe('surface contract (index.css)', () => {
  /** Tokens that are not surfaces: status colours and shadows. */
  const NOT_SURFACES = new Set(['danger-color', 'toast-info-color', 'toast-success-color', 'toast-warning-color',
    'toast-error-color', 'window-shadow', 'window-shadow-focused', 'panel-float-shadow', 'panel-float-shadow-active',
    'tab-btn-active-shadow', 'toolbar-btn-active-shadow'])
  /** Translucent pure white or black: a neutral tint or shade, right over any surface. */
  const NEUTRAL = /^rgba\(\s*(0|255)\s*,\s*\1\s*,\s*\1\s*,\s*0?\.\d+\s*\)$/

  it('every coloured surface declaration reads a --vdd--b-* value first', () => {
    const bare: string[] = []
    for (const m of rules.matchAll(/--vdd-([\w-]+)\s*:\s*([^;{}]+);/g)) {
      const [tok, value] = [m[1]!, m[2]!.trim()]
      if (tok.startsWith('-') || NOT_SURFACES.has(tok) || /accent|brand|--vdd--b-/.test(value) || value.startsWith('var(')) continue
      if (!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value) || NEUTRAL.test(value)) continue
      bare.push(`--vdd-${tok}: ${value}`)
    }
    expect(bare).toEqual([])
  })

  it('no element rule paints a coloured literal, outside status colours and macOS window buttons', () => {
    // A colour an element rule writes itself is one no token, brand or skin can reach. vdd also
    // allows the unregistered-panel message, drawn in the danger red (rdd reads a token there).
    const ALLOWED = /\.vdd-confirmation-alert-(danger|info|warning|success)$|\[data-vdd-skin="macos"\] \.vdd-btn-(close|minimize|maximize)-tab$|^\.vdd-unregistered-panel$/
    const bare: string[] = []
    for (const m of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1]!.replace(/\s+/g, ' ').trim()
      if (sel.startsWith('@') || /^(from|to|\d+%)/.test(sel) || ALLOWED.test(sel)) continue
      for (const d of m[2]!.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)) {
        if (d[1]!.startsWith('--')) continue // tokens: the rule above
        const value = d[2]!.replace(/var\(--vdd-[\w-]+,\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\)/g, 'V')
          .replace(/rgba\(\s*(0|255)\s*,\s*\1\s*,\s*\1\s*,[^)]*\)|#(?:fff|000)(?:fff|000)?\b/gi, 'N')
        if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value)) bare.push(`${sel} { ${d[1]}: ${d[2]!.trim()} }`)
      }
    }
    expect(bare).toEqual([])
  })

  it('declares the --vdd--b-* values in one :root block only, each built on --vdd--b-base', () => {
    const blocks = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(b => /--vdd--b-[\w-]+\s*:/.test(b[2]!))
    expect(blocks.map(b => b[1]!.trim())).toEqual([':root'])
    const defs = [...blocks[0]![2]!.matchAll(/(--vdd--b-[\w-]+)\s*:\s*([^;]+);/g)]
    expect(defs.length).toBeGreaterThan(30)
    // Built on the base, so that each is valid only while both brand inputs are set.
    const base = defs.find(d => d[1] === '--vdd--b-base')?.[2] ?? ''
    expect(base).toMatch(/var\(--vdd-brand-surface\).*var\(--vdd-brand-text\)/)
    expect(defs.filter(d => d[1] !== '--vdd--b-base' && !d[2]!.includes('var(--vdd--b-base)')).map(d => d[1])).toEqual([])
  })
})

// ── The field-report fixes (1.5.0) ──────────────────────────────────────────
// Ported from react-dockable-desktop 7.4.0 `StylesheetContract.test.ts`, "consumer content
// contract". The rendered result is gated by scripts/gates/browser/m17.mjs.

describe('consumer content contract (index.css)', () => {
  const CONTENT_HOSTS = /\.vdd-(floating-window|side-panel|workspace-panel|panel-float|panel-toolbar)(\.[\w-]+|\[[^\]]+\])*$/

  it('no container that hosts consumer content carries a backdrop-filter or filter itself (only its ::before)', () => {
    const offending: string[] = []
    for (const m of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = m[1]!.split(',').map(s => s.replace(/\s+/g, ' ').trim())
      if (!selectors.some(s => CONTENT_HOSTS.test(s))) continue
      if (/(^|[;\s])(-webkit-)?(backdrop-)?filter\s*:\s*(?!none)/.test(m[2]!)) offending.push(selectors.join(', '))
    }
    expect(offending).toEqual([])
  })

  it('honours prefers-reduced-motion for the library elements', () => {
    const block = rules.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*\}/)?.[1] ?? ''
    expect(block).toMatch(/\[class\*="vdd-"\]/)
    expect(block).toMatch(/transition:\s*none\s*!important/)
    expect(block).toMatch(/animation:\s*none\s*!important/)
  })
})
