import { describe, it, expect } from 'vitest'
import { version } from '../src/index'

describe('package entry', () => {
  it('exports a version string matching package.json', async () => {
    const pkg = (await import('../package.json', { with: { type: 'json' } })).default
    expect(version).toBe(pkg.version)
  })
})
