#!/usr/bin/env node
/**
 * The gate runner.  `npm run gate -- M3`, or several: `npm run gate -- M13 M15 M16`
 *
 * Runs the standing gate — types, lint, tests, build, counts, css-prefix, api-surface,
 * docs-api — then each milestone's own gate and browser gate, then records the result:
 * a manifest in artifacts/M<n>/tree.txt and the raw outcome, with each step's time, in
 * artifacts/M<n>/gate.json.
 *
 * Several milestones in one call share one standing gate: it runs once, not once per milestone.
 * Each milestone's own gate and browser gate still run in full. `npm run gate:release` is the
 * whole set, once.
 *
 * Exit code 0 only if every check passed. See docs/IMPLEMENTATION_PLAN.md for the
 * integrity rules that make that meaningful — in particular, this file is not to be
 * edited to make a milestone pass.
 */
import { execSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const milestones = process.argv.slice(2).map(a => a.toUpperCase())
if (milestones.length === 0 || !milestones.every(m => /^M\d+$/.test(m))) {
  console.error('usage: npm run gate -- M<n> [M<n> …]')
  process.exit(2)
}

mkdirSync('artifacts', { recursive: true })

const run = (name, cmd) => {
  process.stdout.write(`\n── ${name}\n`)
  const t = Date.now()
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit' })
  return { name, cmd, ok: r.status === 0, status: r.status, seconds: Math.round((Date.now() - t) / 1000) }
}

const prelude = []
const steps = prelude
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

/**
 * Starts the app on its usual port, or the next free one, and resolves once *this* server says
 * it is ready.
 *
 * It used to poll the port with `fetch` and take any answer as ready. With another project's
 * dev server already on 5190, `--strictPort` made vdd's own demo exit at once, the poll got the
 * other app's page, and M14 then waited 60s for a `window.__demo` that was never coming — a
 * timeout that pointed at the demo, not at the port. Readiness now comes from the spawned Vite's
 * own "ready" line, and a server that exits first means the port was taken.
 */
async function startApp(app) {
  for (let port = app.port; port < app.port + 10; port++) {
    const server = spawn('npx', ['vite', app.root, '--port', String(port), '--strictPort'], {
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    })
    // Monaco makes the demo's first cold start slow, so the wait is generous.
    const outcome = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), 90000)
      let seen = ''
      server.stdout.on('data', (chunk) => {
        if (seen === null) return // ready already: keep draining, stop collecting
        seen += chunk
        if (/ready in/.test(seen)) { seen = null; clearTimeout(timer); resolve('ready') }
      })
      server.stderr.resume()
      server.on('exit', () => { clearTimeout(timer); resolve('exited') })
    })
    if (outcome === 'ready') {
      if (port !== app.port) console.log(`\n  :${app.port} is in use by another process; ${app.root} is served on :${port}`)
      return { server, port }
    }
    try { process.kill(-server.pid) } catch { /* already gone */ }
    if (outcome === 'timeout') return { reason: `${app.root} did not report ready on :${port} within 90s` }
  }
  return { reason: `${app.root} could not start: ports ${app.port}–${app.port + 9} are all in use` }
}

let tests = null
try {
  const r = JSON.parse(readFileSync('artifacts/.vitest.json', 'utf8'))
  tests = { total: r.numTotalTests, passed: r.numPassedTests, failed: r.numFailedTests, files: r.testResults?.length ?? 0 }
} catch { /* tests step already failed */ }

// Manifest of the source tree, so a later regression can be located without version control
// (docs/IMPLEMENTATION_PLAN.md § Version control). Taken once: the tree does not change mid-run.
let manifest
try {
  const files = execSync(
    "find src test scripts docs -type f \\( -name '*.ts' -o -name '*.vue' -o -name '*.css' -o -name '*.mjs' -o -name '*.md' \\) | sort",
    { encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean)
  manifest = execSync(`shasum ${files.map(f => `'${f}'`).join(' ')}`, { encoding: 'utf8' })
} catch (e) {
  manifest = `manifest unavailable: ${e.message}\n`
}

const results = []
for (const milestone of milestones) {
  const OUT = `artifacts/${milestone}`
  mkdirSync(OUT, { recursive: true })
  const steps = [...prelude]

  const milestoneGate = `scripts/gates/${milestone.toLowerCase()}.mjs`
  if (existsSync(milestoneGate)) {
    steps.push(run(milestone, `node ${milestoneGate}`))
  } else {
    steps.push({ name: milestone, cmd: milestoneGate, ok: false, status: 1, missing: true })
    console.error(`\n── ${milestone}\n  no gate script at ${milestoneGate} — a milestone without its own gate cannot pass`)
  }

  const browserGate = `scripts/gates/browser/${milestone.toLowerCase()}.mjs`
  if (existsSync(browserGate)) {
    const declared = readFileSync(browserGate, 'utf8').match(/^\s*\/\/\s*gate:app\s+(\w+)/m)?.[1]
    const app = APPS[declared ?? 'playground']
    if (!app) {
      steps.push({ name: `${milestone} browser`, cmd: `unknown app "${declared}"`, ok: false, status: 1 })
      console.error(`\n── ${milestone} browser\n  gate:app "${declared}" is not one of ${Object.keys(APPS).join(', ')}`)
    } else {
      const { server, port, reason } = await startApp(app)
      try {
        if (!server) {
          steps.push({ name: `${milestone} browser`, cmd: app.root, ok: false, status: 1 })
          console.error(`\n── ${milestone} browser\n  ${reason}`)
        } else {
          // The browser gates default to the app's usual port; this tells them where it really is.
          process.env.VDD_APP_URL = `http://localhost:${port}/`
          steps.push(run(`${milestone} browser`, `node ${browserGate}`))
        }
      } finally {
        if (server) try { process.kill(-server.pid) } catch { /* already gone */ }
      }
    }
  }

  const passed = steps.every(s => s.ok)
  writeFileSync(`${OUT}/tree.txt`, manifest)
  writeFileSync(`${OUT}/gate.json`, JSON.stringify({
    milestone, passed, at: new Date().toISOString(), tests,
    steps: steps.map(({ name, ok, status, missing, seconds }) => ({ name, ok, status, seconds, ...(missing ? { missing } : {}) })),
  }, null, 2) + '\n')
  results.push({ milestone, passed, steps })
}

console.log('\n' + '─'.repeat(60))
for (const s of prelude) console.log(`  ${s.ok ? 'ok  ' : 'FAIL'}  ${s.name} (${s.seconds}s)`)
for (const { steps } of results) {
  for (const s of steps.slice(prelude.length)) console.log(`  ${s.ok ? 'ok  ' : 'FAIL'}  ${s.name}${s.seconds !== undefined ? ` (${s.seconds}s)` : ''}`)
}
if (tests) console.log(`  tests: ${tests.passed}/${tests.total} across ${tests.files} file(s)`)
for (const { milestone, passed } of results) console.log(`${milestone} GATE: ${passed ? 'PASS' : 'FAIL'}`)
process.exit(results.every(r => r.passed) ? 0 : 1)
