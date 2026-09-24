import { computed, onScopeDispose, ref } from 'vue'
import type { ComputedRef } from 'vue'

/** What the workspace is currently rendering as. */
export type ColorScheme = 'dark' | 'light'

/** With no document — server rendering — there is no attribute to read, so: dark. */
const read = (): ColorScheme =>
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-color-scheme') === 'light' ? 'light' : 'dark'

/**
 * The workspace's current colour scheme, as a ref that follows it.
 *
 * `<VddDesktop>` mirrors the scheme onto `document.documentElement` as
 * `data-color-scheme`; this watches that attribute. For panel content that has to match —
 * a map's tile layer, an embedded editor's theme, a chart's palette.
 *
 * ```ts
 * const scheme = useColorScheme()
 * watch(scheme, s => map.setStyle(s === 'dark' ? darkStyle : lightStyle))
 * ```
 *
 * Anything other than `'light'` reads as `'dark'`, including a missing attribute, so there is
 * no third state to handle.
 */
export function useColorScheme(): ComputedRef<ColorScheme> {
  const scheme = ref<ColorScheme>(read())

  // A MutationObserver rather than a workspace subscription: the attribute is the contract,
  // so this works for a scheme set by the application itself, with no workspace involved.
  if (typeof document !== 'undefined') {
    const observer = new MutationObserver(() => { scheme.value = read() })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] })
    onScopeDispose(() => observer.disconnect())
  }

  // A computed rather than the raw ref: reading the scheme is the whole API, and writing it
  // would set an attribute nobody is watching for.
  return computed(() => scheme.value)
}
