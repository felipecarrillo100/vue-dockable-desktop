/**
 * M2 gate — the framework-agnostic half is in place, and stays framework-agnostic.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }

// 1. The pure modules must not import Vue. This is the architectural claim of M2: the tree
//    maths, resize maths, stretch algebra and layout parsing are testable and reusable
//    without a framework, and cannot quietly acquire a dependency on one.
const PURE = ['dragResize', 'layoutTree', 'stretch', 'anchorGeometry', 'rtl', 'serialize']
for (const name of PURE) {
  const path = `src/core/${name}.ts`
  must(existsSync(path), `missing ${path}`)
  if (!existsSync(path)) continue
  const src = readFileSync(path, 'utf8')
  must(!/from\s+['"]vue['"]/.test(src), `${path} imports vue — the pure layer must stay framework-agnostic`)
}

// 2. Two modules legitimately touch Vue, and only these two.
for (const [name, why] of [['serializable', 'isVNode'], ['registry', 'markRaw + Component']]) {
  const src = readFileSync(`src/core/${name}.ts`, 'utf8')
  must(/from\s+['"]vue['"]/.test(src), `src/core/${name}.ts should import vue (${why})`)
}

// 3. The stylesheet is actually ported, not still a stub.
const css = readFileSync('src/index.css', 'utf8')
must(css.split('\n').length > 3000, `src/index.css has only ${css.split('\n').length} lines — not ported`)
for (const cls of ['.vdd-workspace', '.vdd-workspace-tab', '.vdd-floating-window',
                   '.vdd-taskbar-footer-container', '.vdd-side-panel', '.vdd-modal-overlay',
                   '.vdd-sidebar-tabs-strip', '.vdd-toolbar-strip', '.vdd-panel-float',
                   '.vdd-context-menu', '.vdd-toast']) {
  must(css.includes(cls), `stylesheet is missing ${cls}`)
}

// 4. rdd fixtures are present and were produced by rdd, not invented here.
const DIR = 'test/fixtures/rdd-6.2.0'
must(existsSync(DIR), `missing ${DIR}`)
if (existsSync(DIR)) {
  const fixtures = readdirSync(DIR).filter(f => f.endsWith('.json'))
  must(fixtures.length >= 10, `only ${fixtures.length} fixtures; expected at least 10`)
  let withVersion2 = 0
  for (const f of fixtures) {
    const raw = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
    must(raw.gridRoot && Array.isArray(raw.floating) && Array.isArray(raw.minimized) && raw.panels,
      `${f} is not a layout payload`)
    if (raw.version === 2) withVersion2++
  }
  must(withVersion2 >= 8, `only ${withVersion2} fixtures carry version 2`)
}

if (failures.length) {
  console.error('M2: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log(`M2: ok — ${PURE.length} pure modules vue-free, stylesheet ported (${css.split('\n').length} lines), rdd fixtures present`)
