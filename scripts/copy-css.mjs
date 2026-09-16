import { copyFileSync, mkdirSync } from 'node:fs'
mkdirSync('dist', { recursive: true })
copyFileSync('src/index.css', 'dist/styles.css')
console.log('copied src/index.css -> dist/styles.css')
