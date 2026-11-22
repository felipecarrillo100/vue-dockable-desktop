/**
 * `?rc=1` (the M18 gate, 1.14.0): a tiny stand-in for a runtime CSS-in-JS library (Emotion with
 * `speedy`, as in production; styled-components; vanilla-extract's runtime): one cache per
 * document, each inserting its rules with `sheet.insertRule` into a `<style>` of that document's
 * `<head>`. The `<style>` element has no text, so a pop-out's head copy carries it empty: without
 * the app's `popoutWrapper` handing the cache the pop-out's document, what is styled this way is
 * unstyled there. That is the production failure rdd's Emotion test caught (an MUI SvgIcon 0 x 0).
 */
import { computed, defineComponent, h, inject, markRaw } from 'vue'
import type { Component, ComputedRef, InjectionKey } from 'vue'

/** The document the content is rendered in, as the wrapper says; the page's without one. */
export const STYLE_DOCUMENT = Symbol('rc-document') as InjectionKey<ComputedRef<Document>>

const caches = new WeakMap<Document, { sheet: CSSStyleSheet; inserted: Set<string> }>()

/** Inserts `.name { rules }` into `doc`'s own cache, once; returns the class name. */
export function rcClass(doc: Document, name: string, rules: string): string {
  let cache = caches.get(doc)
  if (!cache) {
    const style = doc.createElement('style')
    style.setAttribute('data-rc', '')
    doc.head.appendChild(style)
    cache = { sheet: style.sheet!, inserted: new Set() }
    caches.set(doc, cache)
  }
  const cls = `rc-${name}`
  if (!cache.inserted.has(cls)) {
    cache.sheet.insertRule(`.${cls} { ${rules} }`, cache.sheet.cssRules.length)
    cache.inserted.add(cls)
  }
  return cls
}

/** The class for `rules`, inserted into the document the wrapper gives (or the page's). */
export function useRcClass(name: string, rules: string): ComputedRef<string> {
  const doc = inject(STYLE_DOCUMENT, null)
  return computed(() => rcClass(doc?.value ?? document, name, rules))
}

/** An icon whose size and colour come only from the cache, as an MUI SvgIcon's do. Its own rule each. */
export function rcIcon(name: string): Component {
  return markRaw(defineComponent({
    name: `RcIcon-${name}`,
    setup() {
      const cls = useRcClass(`icon-${name}`, 'display: inline-block; width: 16px; height: 16px; background-color: rgb(200, 30, 40);')
      return () => h('span', { 'data-rc-icon': name, class: cls.value })
    },
  }))
}
