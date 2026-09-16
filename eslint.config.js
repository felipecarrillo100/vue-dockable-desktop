import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'spike/**', 'artifacts/**', 'coverage/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    // The library and the playground run in a browser.
    files: ['src/**/*.{ts,vue}', 'playground/**/*.{ts,vue}', 'demo/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
    rules: {
      // TypeScript already resolves every identifier, and does it better: `no-undef` cannot
      // see type-only declarations and reports false positives on them. Off for TS, per
      // typescript-eslint's own guidance — never off for plain JS.
      'no-undef': 'off',
    },
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-undef': 'off' },
  },
  {
    rules: {
      // The library renders nothing multi-word-named at the DOM level; component names are
      // Vdd-prefixed files, which this rule does not need to police.
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      // A leading underscore is the declaration that a binding is deliberately unused —
      // needed for the rest-destructure idiom that drops keys from an object.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true,
      }],
    },
  },
  {
    // Test files define throwaway components inline; one-per-file is a rule for source.
    files: ['test/**/*.ts'],
    rules: { 'vue/one-component-per-file': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]
