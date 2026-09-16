#!/usr/bin/env node
/**
 * The gate runner.  `npm run gate -- M3`
 *
 * Runs the standing gate — types, lint, tests, build, counts, css-prefix, api-surface,
 * docs-api — then the milestone's own gate, then records the result:
 * a row in docs/PROGRESS.md, a manifest in artifacts/M<n>/tree.txt, and the raw
 * outcome in artifacts/M<n>/gate.json.
 *
 * Exit code 0 only if every check passed. See docs/IMPLEMENTATION_PLAN.md for the
 * integrity rules that make that meaningful — in particular, this file is not to be
 * edited to make a milestone pass.
 */
import { execSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const milestone = (process.argv[2] ?? '').toUpperCase()
if (!/^M\d+$/.test(milestone)) {
  console.error('usage: npm run gate -- M<n>')
  process.exit(2)
}

const OUT = `artifacts/${milestone}`
mkdirSync(OUT, { recursive: true })
mkdirSync('artifacts', { recursive: true })

const run = (name, cmd) => {
  process.stdout.write(`\n── ${name}\n`)
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit' })
  return { name, cmd, ok: r.status === 0, status: r.status }
}

const steps = []
steps.push(run('types', 'npx vue-tsc --noEmit'))
steps.push(run('lint', 'npx eslint .'))
// One vitest run, JSON captured so the counts gate can read it without re-running.
steps.push(run('tests', 'npx vitest run --reporter=json --outputFile=artifacts/.vitest.json --reporter=default'))
steps.push(run('build', 'npm run build'))
steps.push(run('counts', 'node scripts/gates/counts.mjs'))
steps.push(run('css-prefix', 'node scripts/gates/css-prefix.mjs'))
steps.push(run('api-surface', 'node scripts/gates/api-surface.mjs'))
// Reads api-surface.json, so it has to follow the gate that writes it.
steps.push(run('docs-api', 'node scripts/gates/docs-api.mjs'))
// The demo builds as a consumer's application would. Only checked once the demo exists, so
// the earlier milestones' gates are unaffected.
if (existsSync('demo/vite.config.ts')) steps.push(run('demo:build', 'npm run demo:build'))

const milestoneGate = `scripts/gates/${milestone.toLowerCase()}.mjs`
if (existsSync(milestoneGate)) {
  steps.push(run(milestone, `node ${milestoneGate}`))
} else {
  steps.push({ name: milestone, cmd: milestoneGate, ok: false, status: 1, missing: true })
  console.error(`\n── ${milestone}\n  no gate script at ${milestoneGate} — a milestone without its own gate cannot pass`)
}

/**
 * Browser gates need an app served. Started here so the gate stays one command, and stopped
 * afterwards whether it passed or not.
 *
 * Which app is the gate's own decision, declared as `// gate:app <name>` on any line of it.
 * Most drive the playground; M14 drives the demo, which is a different app on a different
 * port. A pragma rather than a lookup table here, so adding a gate does not mean editing the
 * runner — which integrity rule 2 asks me not to do.
 */
const APPS = {
  playground: { root: 'playground', port: 5188 },
  demo: { root: 'demo', port: 5190 },
}

const browserGate = `scripts/gates/browser/${milestone.toLowerCase()}.mjs`
if (existsSync(browserGate)) {
  const declared = readFileSync(browserGate, 'utf8').match(/^\s*\/\/\s*gate:app\s+(\w+)/m)?.[1]
  const app = APPS[declared ?? 'playground']
  if (!app) {
    steps.push({ name: `${milestone} browser`, cmd: `unknown app "${declared}"`, ok: false, status: 1 })
    console.error(`\n── ${milestone} browser\n  gate:app "${declared}" is not one of ${Object.keys(APPS).join(', ')}`)
  } else {
    // Monaco makes the demo's first cold start slow, so the wait is generous and the gate
    // reports a timeout rather than failing on an empty page.
    const server = spawn('npx', ['vite', app.root, '--port', String(app.port), '--strictPort'], {
      stdio: 'ignore', detached: true,
    })
    try {
      const deadline = Date.now() + 90000
      let up = false
      while (Date.now() < deadline && !up) {
        try {
          const r = await fetch(`http://localhost:${app.port}/`)
          up = r.ok
        } catch { await new Promise(r => setTimeout(r, 400)) }
      }
      if (!up) {
        steps.push({ name: `${milestone} browser`, cmd: app.root, ok: false, status: 1 })
        console.error(`\n── ${milestone} browser\n  ${app.root} did not answer on :${app.port} within 90s`)
      } else {
        steps.push(run(`${milestone} browser`, `node ${browserGate}`))
      }
    } finally {
      try { process.kill(-server.pid) } catch { /* already gone */ }
    }
  }
}

const passed = steps.every(s => s.ok)

// Manifest of the source tree at this gate, so a later regression can be located
// without version control (docs/IMPLEMENTATION_PLAN.md § Version control).
try {
  const files = execSync(
    "find src test scripts docs -type f \\( -name '*.ts' -o -name '*.vue' -o -name '*.css' -o -name '*.mjs' -o -name '*.md' \\) | sort",
    { encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean)
  writeFileSync(`${OUT}/tree.txt`, execSync(`shasum ${files.map(f => `'${f}'`).join(' ')}`, { encoding: 'utf8' }))
} catch (e) {
  writeFileSync(`${OUT}/tree.txt`, `manifest unavailable: ${e.message}\n`)
}

let tests = null
try {
  const r = JSON.parse(readFileSync('artifacts/.vitest.json', 'utf8'))
  tests = { total: r.numTotalTests, passed: r.numPassedTests, failed: r.numFailedTests, files: r.testResults?.length ?? 0 }
} catch { /* tests step already failed */ }

writeFileSync(`${OUT}/gate.json`, JSON.stringify({
  milestone, passed, at: new Date().toISOString(), tests,
  steps: steps.map(({ name, ok, status, missing }) => ({ name, ok, status, ...(missing ? { missing } : {}) })),
}, null, 2) + '\n')

console.log('\n' + '─'.repeat(60))
for (const s of steps) console.log(`  ${s.ok ? 'ok  ' : 'FAIL'}  ${s.name}`)
if (tests) console.log(`  tests: ${tests.passed}/${tests.total} across ${tests.files} file(s)`)
console.log(`${milestone} GATE: ${passed ? 'PASS' : 'FAIL'}`)
process.exit(passed ? 0 : 1)
