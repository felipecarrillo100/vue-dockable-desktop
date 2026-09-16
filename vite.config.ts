import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    // Vue stays external: the consumer's own copy must be used, or reactivity and
    // provide/inject break across two instances.
    rollupOptions: { external: ['vue'], output: { globals: { vue: 'Vue' } } },
    sourcemap: true,
    emptyOutDir: true,
  },
})
