<script setup lang="ts">
/**
 * A split markdown editor: Monaco on one side, a live preview on the other, with a divider
 * built on the library's own exported drag primitive.
 *
 * Four things worth noticing:
 *
 *  - **`startPointerDrag` is public.** The divider between the two halves uses exactly the
 *    mechanic the library uses for its own window edges and grid splits, so it behaves
 *    identically — including releasing the pointer capture correctly on cancel.
 *  - **It contributes to the application's chrome.** Six formatting actions appear in the
 *    app's toolbar and a table of contents appears in its sidebar, but only while this panel
 *    is the active one. The shell knows nothing about markdown.
 *  - **The pipeline is `unified`, unchanged from rdd's demo** — `remark-gfm`, `remark-math`,
 *    `rehype-katex`, `rehype-highlight`, `rehype-raw`, `rehype-slug`. Only the renderer
 *    differs, because those are plugins rather than React components (ADR 0013).
 *  - **The editor survives everything.** Dock this panel, float it, minimise it: Monaco keeps
 *    its undo history and its cursor, and the preview keeps its scroll position.
 */
import { computed, h, markRaw, ref, useTemplateRef } from 'vue'
import {
  startPointerDrag, useColorScheme, usePanelContribution,
} from 'vue-dockable-desktop'
import type { ToolbarItem } from 'vue-dockable-desktop'
import * as monaco from 'monaco-editor'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import { useMonaco } from '../composables/useMonaco'
import { useMarkdown } from '../composables/useMarkdown'
import type { Heading } from '../composables/useMarkdown'

const DEFAULT_MARKDOWN = `# Getting started

Welcome to the **markdown editor** panel. Edit the source on the left; the preview renders
live on the right — drag the divider between them.

## What this demonstrates

- A live preview through a \`unified\` pipeline
- GitHub-flavoured tables and task lists, via \`remark-gfm\`
- A table of contents contributed to the app's sidebar *while this panel is active*
- Six formatting actions contributed to the app's toolbar
- Maths, via \`remark-math\` and \`rehype-katex\`: $E = mc^2$
- Syntax highlighting, via \`rehype-highlight\`

## A table

| Capability | Where it lives |
| --- | --- |
| Zero-unmount panels | the library |
| Monaco's undo history | this panel |
| The divider you just dragged | \`startPointerDrag\`, exported |

## A task list

- [x] Port the pipeline unchanged
- [x] Keep the divider on the library's own primitive
- [ ] Notice that none of this re-mounts

## Some code

\`\`\`ts
const workspace = createWorkspace({ panels })
workspace.openPanel('notes', 'markdownEditor')
\`\`\`

> The editor keeps its cursor, selection and undo stack through every dock and float,
> because the panel's DOM is moved rather than re-created.

$$
\\int_{0}^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$
`

const source = ref(DEFAULT_MARKDOWN)
const container = useTemplateRef<HTMLDivElement>('container')
const editorHost = useTemplateRef<HTMLDivElement>('editorHost')
const preview = useTemplateRef<HTMLDivElement>('preview')
const scheme = useColorScheme()

const theme = computed(() => (scheme.value === 'light' ? 'vs' : 'vs-dark'))
const { editor } = useMonaco(editorHost, source, { language: 'markdown', theme })
const { html, headings } = useMarkdown(source)

// ── the divider ────────────────────────────────────────────────────────────
const ratio = ref(0.5)
const dragging = ref(false)

/**
 * The divider tracks an absolute ratio of the container rather than a delta from where the
 * drag started, so the pointer's live position is recovered from the reported delta.
 */
function onDividerDown(event: PointerEvent): void {
  event.preventDefault()
  const bar = event.currentTarget as HTMLElement
  const rect = container.value?.getBoundingClientRect()
  if (!rect) return
  dragging.value = true

  startPointerDrag({
    element: bar,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    captureStart: () => event.clientX,
    activeClasses: [{ el: document.body, classes: ['vdd-resizing-active', 'vdd-resizing-col-active'] }],
    onMove: (dx, _dy, startX) => {
      ratio.value = Math.min(0.85, Math.max(0.15, (startX + dx - rect.left) / rect.width))
    },
    onEnd: () => { dragging.value = false },
  })
}

// ── formatting, applied to Monaco's current selection ──────────────────────
function wrapSelection(before: string, after = before): void {
  const instance = editor.value
  const selection = instance?.getSelection()
  const model = instance?.getModel()
  if (!instance || !selection || !model) return
  const selected = model.getValueInRange(selection).trim() || 'text'
  instance.executeEdits('format', [{ range: selection, text: `${before}${selected}${after}` }])
  instance.focus()
}

function prefixLines(prefix: string): void {
  const instance = editor.value
  const selection = instance?.getSelection()
  if (!instance || !selection) return
  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = []
  for (let line = selection.startLineNumber; line <= selection.endLineNumber; line++) {
    edits.push({ range: new monaco.Range(line, 1, line, 1), text: prefix })
  }
  instance.executeEdits('format', edits)
  instance.focus()
}

// ── contributed chrome ─────────────────────────────────────────────────────
const glyph = (text: string) => markRaw({
  render: () => h('span', { style: 'font: 600 0.72rem/1 ui-monospace, monospace' }, text),
})

/**
 * A table of contents, contributed to the application's sidebar.
 *
 * Its own component so it can be handed over as a `component` rather than a rendered node —
 * a contribution is data, and the shell decides where it goes.
 */
const Toc = markRaw({
  setup: () => () => h('div', { class: 'dd-panel' }, [
    headings.value.length === 0
      ? h('p', { class: 'dd-note' }, 'No headings yet.')
      : h('div', { class: 'dd-col' }, headings.value.map((heading: Heading) => h('a', {
        href: `#${heading.id}`,
        'data-demo-toc': heading.id,
        style: `padding-inline-start:${(heading.depth - 1) * 0.7}rem; font-size:0.76rem; cursor:pointer; text-decoration:none; opacity:${1 - (heading.depth - 1) * 0.12}`,
        onClick: (event: MouseEvent) => { event.preventDefault(); scrollTo(heading.id) },
      }, heading.text))),
  ]),
})

const ACTIONS: ToolbarItem[] = [
  { type: 'action', id: 'md-bold', label: 'Bold', icon: glyph('B'), onClick: () => wrapSelection('**') },
  { type: 'action', id: 'md-italic', label: 'Italic', icon: glyph('I'), onClick: () => wrapSelection('*') },
  { type: 'action', id: 'md-code', label: 'Inline code', icon: glyph('</>'), onClick: () => wrapSelection('`') },
  { type: 'separator' },
  { type: 'action', id: 'md-h1', label: 'Heading 1', icon: glyph('H1'), onClick: () => prefixLines('# ') },
  { type: 'action', id: 'md-h2', label: 'Heading 2', icon: glyph('H2'), onClick: () => prefixLines('## ') },
  { type: 'action', id: 'md-list', label: 'Bullet list', icon: glyph('•—'), onClick: () => prefixLines('- ') },
]

// A getter, so the table of contents re-publishes as the document's headings change without
// the caller memoising anything.
usePanelContribution(() => ({
  toolbarItems: ACTIONS,
  sidebarSections: [{ id: 'md-toc', label: 'Contents', icon: glyph('¶'), component: Toc }],
}))

function scrollTo(id: string): void {
  preview.value?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div ref="container" class="dd-panel dd-panel--flush" style="display: flex; position: relative">
    <div ref="editorHost" class="dd-monaco" data-demo-md-editor :style="{ flex: `0 0 ${ratio * 100}%`, minWidth: 0 }" />

    <div
      class="vdd-resizer-bar"
      :class="{ 'vdd-active': dragging }"
      data-demo-md-divider
      style="flex: 0 0 4px; cursor: col-resize; align-self: stretch"
      @pointerdown="onDividerDown"
    />

    <!-- eslint-disable-next-line vue/no-v-html -- the pipeline's own sanitised output -->
    <div
      ref="preview"
      class="dd-markdown"
      data-demo-md-preview
      style="flex: 1; min-width: 0; overflow: auto"
      v-html="html"
    />
  </div>
</template>
