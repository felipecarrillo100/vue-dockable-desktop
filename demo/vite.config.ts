import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

/**
 * The demo: every capability of the library, in one application.
 *
 * Aliased to the library's **source** rather than its build, so the demo is always exercising
 * the code in the repository — `npm run demo:build` then proves the same code builds as a
 * consumer would import it.
 */
export default defineConfig({
  // Set explicitly so `vite build --config demo/vite.config.ts` resolves the entry HTML
  // relative to this file rather than to the directory the command was run from.
  root: import.meta.dirname,
  base: './',
  plugins: [vue()],
  resolve: {
    /**
     * Ordered, and the stylesheet comes first: the package alias is prefix-matched, so
     * `vue-dockable-desktop/styles.css` would otherwise resolve to `src/index.ts/styles.css`.
     * Both entries exist so the demo's imports read exactly as a consumer's would.
     */
    alias: [
      { find: 'vue-dockable-desktop/styles.css', replacement: resolve(import.meta.dirname, '../src/index.css') },
      { find: 'vue-dockable-desktop', replacement: resolve(import.meta.dirname, '../src/index.ts') },
    ],
  },
  server: { port: 5190, strictPort: true },
  build: { outDir: resolve(import.meta.dirname, '../artifacts/demo'), emptyOutDir: true },
})
