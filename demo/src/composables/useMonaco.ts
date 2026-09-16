import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import * as monaco from 'monaco-editor'
// The worker entries go through monaco-editor's own exports map (`"./*.js": "./esm/vs/*.js"`),
// so the specifier omits `esm/vs` and keeps the `.js` — writing the physical path instead
// resolves to `esm/vs/esm/vs/…` and fails the build rather than warning.
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'

/**
 * Monaco in a Vue component.
 *
 * rdd's demo used `@monaco-editor/react`; ADR 0013 replaces it with this, because Monaco is
 * framework-agnostic — it takes a plain element and gives back a disposable. The React wrapper
 * exists to bridge React's lifecycle, and Vue's is a better fit for the job already: a
 * `watch` on the element, and `onBeforeUnmount` to dispose.
 *
 * The demo's editors live inside dockable panels, which is the interesting part: the panel is
 * moved between hosts without ever unmounting (ADR 0002), so the editor keeps its model, its
 * undo history, its cursor and its folded regions through every dock, float and minimise. It
 * only needs telling that its box changed.
 */
self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

export interface MonacoOptions {
  language?: string
  /** `vs-dark` or `vs`; the demo follows the workspace's own colour scheme. */
  theme?: Ref<string>
  readOnly?: boolean
  minimap?: boolean
}

export function useMonaco(
  host: Ref<HTMLElement | null>,
  value: Ref<string>,
  options: MonacoOptions = {},
) {
  const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  let applying = false

  watch(host, (element) => {
    editor.value?.dispose()
    editor.value = null
    if (!element) return

    const instance = monaco.editor.create(element, {
      value: value.value,
      language: options.language ?? 'typescript',
      theme: options.theme?.value ?? 'vs-dark',
      readOnly: options.readOnly ?? false,
      minimap: { enabled: options.minimap ?? false },
      automaticLayout: true,       // Monaco's own observer; the panel's box changes often
      fontSize: 12,
      scrollBeyondLastLine: false,
      tabSize: 2,
      renderWhitespace: 'selection',
    })

    // `applying` guards the round trip: writing the model from the ref would otherwise look
    // like the user typing, and echo back.
    instance.onDidChangeModelContent(() => {
      if (applying) return
      value.value = instance.getValue()
    })

    editor.value = instance
  }, { immediate: true })

  watch(value, (next) => {
    const instance = editor.value
    if (!instance || instance.getValue() === next) return
    applying = true
    // `pushEditOperations` rather than `setValue`, so an external change is undoable rather
    // than resetting the history the panel has been preserving all along.
    const model = instance.getModel()
    if (model) {
      instance.executeEdits('external', [{ range: model.getFullModelRange(), text: next }])
    }
    applying = false
  })

  if (options.theme) {
    watch(options.theme, (theme) => monaco.editor.setTheme(theme))
  }

  onBeforeUnmount(() => {
    editor.value?.dispose()
    editor.value = null
  })

  return { editor }
}
