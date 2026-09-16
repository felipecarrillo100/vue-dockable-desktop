import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

/**
 * The playground: the app the browser gates drive.
 *
 * Not the demo (that is M14). This exists so `scripts/gates/browser/*.mjs` can assert things
 * jsdom cannot see — real layout, real pointer gestures, real WebGL, real scrolling — against
 * the library's own source rather than a build.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { 'vue-dockable-desktop': resolve(import.meta.dirname, '../src/index.ts') } },
  server: { port: 5188, strictPort: true },
})
