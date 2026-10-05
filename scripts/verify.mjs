#!/usr/bin/env node
/**
 * The fast check, for while you work.   npm run verify
 *
 * Types, lint and the unit suite — about a minute. It is not a gate and replaces none: before a
 * release, `npm run gate:release` runs the coverage sweep and every milestone gate.
 */
import { spawnSync } from 'node:child_process'

const steps = []
const run = (name, cmd, args) => {
  process.stdout.write(`\n── ${name}\n`)
  const t = Date.now()
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  steps.push({ name, ok: r.status === 0, seconds: Math.round((Date.now() - t) / 1000) })
}

run('types', 'npx', ['vue-tsc', '--noEmit'])
run('lint', 'npx', ['eslint', '.'])
run('tests', 'npx', ['vitest', 'run'])

console.log('\n' + '─'.repeat(60))
for (const s of steps) console.log(`  ${s.ok ? 'ok  ' : 'FAIL'}  ${s.name} (${s.seconds}s)`)
const passed = steps.every(s => s.ok)
console.log(`VERIFY: ${passed ? 'PASS' : 'FAIL'}${passed ? ' — run `npm run gate:release` before a release' : ''}`)
process.exit(passed ? 0 : 1)
