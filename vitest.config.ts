import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.ts'],
    // Browser-level checks live in scripts/gates/browser/, driven by playwright-core from
    // the gate runner — jsdom does no layout, so geometry and hit-testing cannot live here.
    exclude: ['**/node_modules/**', 'spike/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      reportsDirectory: 'artifacts/coverage',
      // Only the library's own source. The playground and the gates are tooling.
      include: ['src/**/*.{ts,vue}'],
      // `index.ts` is re-exports and `types.ts` is type-only, so neither can be executed.
      // Report every matched file, not only the ones a test happened to import — a module
      // nothing imports is exactly what this is looking for.
      reportOnFailure: true,
    },
  },
})
