/** M1 gate — the toolchain and build output are real. */
import { existsSync, readFileSync } from 'node:fs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }

// Build output the exports map promises
for (const f of ['dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/styles.css']) {
  must(existsSync(f), `build did not emit ${f}`)
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
for (const [k, v] of Object.entries(pkg.exports)) {
  const targets = typeof v === 'string' ? [v] : Object.values(v)
  for (const t of targets) must(existsSync(t.replace(/^\.\//, '')), `exports["${k}"] points at missing ${t}`)
}

// ADR 0015: TypeScript must stay on 5.x, or vue-tsc cannot drive it
const tsVersion = JSON.parse(readFileSync('node_modules/typescript/package.json', 'utf8')).version
must(tsVersion.startsWith('5.'), `typescript is ${tsVersion}; ADR 0015 pins 5.x (vue-tsc@3 cannot drive TS 7)`)

// Vue must be external — bundling it would give consumers a second Vue instance
const esm = readFileSync('dist/index.js', 'utf8')
must(!/createElementBlock|reactivity/.test(esm) || /from ?["']vue["']/.test(esm) || esm.length < 5000,
  'dist/index.js looks like it bundled Vue instead of importing it')

// Peer range per ADR 0015
must(pkg.peerDependencies?.vue === '^3.4.0', `peerDependencies.vue is ${pkg.peerDependencies?.vue}, expected ^3.4.0`)

if (failures.length) {
  console.error('M1: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log(`M1: ok — build emits ESM+CJS+d.ts+styles.css, typescript ${tsVersion}, vue external`)
