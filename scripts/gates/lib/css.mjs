/**
 * A very small CSS reader for the gates.
 *
 * Not a parser — it walks braces and returns `{ selectors, body }` for every rule, including
 * rules nested inside `@media`/`@supports` blocks. Enough to ask "does this selector declare
 * this property anywhere", which regexes over a 3,700-line stylesheet get wrong in both
 * directions (and did).
 */

/** Strip comments, so prose about a selector is never mistaken for the selector. */
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Every rule in the stylesheet, flattened out of any at-blocks. */
export function rules(css) {
  const src = stripComments(css)
  const out = []
  let i = 0

  const parseBlock = (from, to) => {
    let cursor = from
    while (cursor < to) {
      const open = src.indexOf('{', cursor)
      if (open === -1 || open >= to) return
      const prelude = src.slice(cursor, open).trim()
      // find the matching close brace
      let depth = 1
      let j = open + 1
      while (j < to && depth > 0) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') depth--
        j++
      }
      const body = src.slice(open + 1, j - 1)
      if (prelude.startsWith('@')) {
        // at-rule: its body contains rules of its own (media, supports, layer)
        if (/^@(media|supports|layer|container)/.test(prelude)) parseBlock(open + 1, j - 1)
        else out.push({ selectors: [prelude], body, at: prelude })
      } else if (prelude) {
        out.push({ selectors: prelude.split(',').map(s => s.trim()).filter(Boolean), body })
      }
      cursor = j
    }
  }

  parseBlock(i, src.length)
  return out
}

/** The declarations of every rule whose selector list contains `selector` exactly. */
export function declarationsFor(css, selector) {
  return rules(css)
    .filter(r => r.selectors.includes(selector))
    .map(r => r.body)
    .join('\n')
}

/** Does `selector` declare `property` (as a `prop: value` substring) anywhere? */
export function declares(css, selector, property) {
  return declarationsFor(css, selector).includes(property)
}

/** Every class name the stylesheet mentions in a selector. */
export function classNames(css) {
  const names = new Set()
  for (const rule of rules(css)) {
    for (const sel of rule.selectors) {
      for (const m of sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(m[1])
    }
  }
  return names
}

/**
 * Source with comments removed — JS/TS block and line comments, and HTML comments.
 *
 * Gates ask questions about *code*. Three times now, a pattern check has matched the
 * explanatory comment next to the thing it was checking (a `class="…"` inside a diagnostic
 * message, a `.luciad` in a note about removing `.luciad`, a `:hover` in a note about not
 * using `:hover`). Strip first, then ask.
 */
export function stripSourceComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')
}
