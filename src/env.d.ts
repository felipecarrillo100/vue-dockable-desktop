/**
 * The one ambient declaration the library needs.
 *
 * Development-only warnings are guarded with `process.env.NODE_ENV !== 'production'`, which
 * is the convention every bundler understands — Vite, webpack and Rollup all replace it at
 * build time, so the warnings and their strings disappear from a production bundle. Vue's
 * own source does the same.
 *
 * Declared narrowly instead of adding `@types/node` to the build: a browser library has no
 * business depending on Node's type surface, and `NODE_ENV` is the only thing referenced.
 * `import.meta.env.DEV` was considered and rejected — it is Vite-specific, and this library
 * must build under whatever bundler a consumer already has.
 */
declare const process: {
  env: {
    NODE_ENV?: string
  }
}
