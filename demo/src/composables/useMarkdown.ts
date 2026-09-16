import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'

/**
 * Markdown to HTML, with the same plugin set rdd's demo used.
 *
 * ADR 0013 keeps the pipeline unchanged: `remark-gfm`, `remark-math`, `rehype-katex`,
 * `rehype-highlight`, `rehype-raw` and `rehype-slug` are `unified` plugins, not React
 * components, so only the renderer had to change — `react-markdown` becomes a `unified`
 * processor producing HTML. Same tables, same footnotes, same maths, same syntax
 * highlighting, same heading anchors.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)                                   // tables, task lists, strikethrough
  .use(remarkMath)                                  // $inline$ and $$block$$
  .use(remarkRehype, { allowDangerousHtml: true })  // raw HTML passes through to rehype-raw
  .use(rehypeRaw)
  .use(rehypeSlug)                                  // heading ids, for the table of contents
  .use(rehypeKatex)
  .use(rehypeHighlight, { detect: true, ignoreMissing: true })
  .use(rehypeStringify, { allowDangerousHtml: true })

/** One-shot render, for content that is not reactive. */
export function renderMarkdown(source: string): string {
  return String(processor.processSync(source))
}

/** A heading in the rendered document, for a table of contents. */
export interface Heading {
  id: string
  text: string
  depth: number
}

/**
 * Rendered HTML plus the headings it contains, kept in step with the source.
 *
 * Debounced, because the demo renders while the user types in Monaco and the maths and
 * highlighting passes are not free. The headings are read from the *rendered* output rather
 * than the source, so the ids match the anchors `rehype-slug` produced.
 */
export function useMarkdown(source: Ref<string>, debounceMs = 180) {
  const html = ref(renderMarkdown(source.value))
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(source, (next) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { html.value = renderMarkdown(next) }, debounceMs)
  })

  const headings = computed<Heading[]>(() => {
    const found: Heading[] = []
    const pattern = /<h([1-6])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g
    for (const match of html.value.matchAll(pattern)) {
      found.push({
        depth: Number(match[1]),
        id: match[2]!,
        text: match[3]!.replace(/<[^>]+>/g, '').trim(),
      })
    }
    return found
  })

  return { html, headings }
}
