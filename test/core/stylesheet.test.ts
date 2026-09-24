/**
 * Assertions against the stylesheet source.
 *
 * jsdom never loads the stylesheet, so a computed-style test would pass no matter which
 * class a component emitted — which is exactly how rdd shipped four rules that matched
 * nothing. These read the CSS text directly.
 *
 * Includes rdd's `sidePanelPositioning.test.ts` (1 test, name preserved).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(import.meta.dirname, '../../src/index.css'), 'utf8')
/** Rules only. Assertions must be about what the stylesheet *does*, never about its prose —
 *  a comment explaining why a selector was removed should not look like the selector. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector: string): string | null => {
  const m = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`))
  return m ? m[0] : null
}

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
