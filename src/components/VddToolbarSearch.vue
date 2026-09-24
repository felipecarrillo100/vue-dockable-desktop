<script setup lang="ts">
/**
 * A debounced search field for a `<VddPanelToolbar>`: a compact icon button that expands into
 * an input, with results in a dropdown teleported to the body so the toolbar's own bounds
 * cannot clip it.
 *
 * `search` receives an `AbortSignal` and must honour it. Without that, a slow request for an
 * earlier query can land after a fast one for a later query and overwrite it — the classic
 * stale-result race, and the reason the signal is part of the signature rather than optional.
 */
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import type { Component } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import { claimEscape, isEscapeClaimed } from '../core/escape'

/** One row in the dropdown. */
export interface SearchResult {
  id: string
  label: string
  /** Secondary text, below the label. */
  description?: string
  /** Groups results under a heading. */
  group?: string
  icon?: Component
}

const props = withDefaults(defineProps<{
  placeholder?: string
  /** Called on each change, debounced. Return results, or a promise of them. */
  search: (query: string, signal: AbortSignal) => SearchResult[] | Promise<SearchResult[]>
  /** Debounce in ms. @default 300 */
  debounce?: number
}>(), { debounce: 300 })

const emit = defineEmits<{ select: [result: SearchResult] }>()

const ws = useWorkspace()
const root = useTemplateRef<HTMLDivElement>('root')
const input = useTemplateRef<HTMLInputElement>('input')

const expanded = ref(false)
const query = ref('')
const results = ref<SearchResult[]>([])
const dropdown = ref<{ top: number; left: number; width: number } | null>(null)

let controller: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | null = null

function reset(): void {
  controller?.abort()
  controller = null
  if (timer) { clearTimeout(timer); timer = null }
}

async function expand(): Promise<void> {
  expanded.value = true
  await nextTick()
  input.value?.focus({ preventScroll: true })
}

function collapse(): void {
  expanded.value = false
  query.value = ''
  results.value = []
  dropdown.value = null
  reset()
}

/** Escape collapses the field, and claims the key so a modal or drawer around it stays open. */
function onEscape(event: KeyboardEvent): void {
  if (isEscapeClaimed(event)) return
  claimEscape(event)
  collapse()
}

function place(): void {
  const node = root.value
  if (!node || results.value.length === 0) { dropdown.value = null; return }
  const r = node.getBoundingClientRect()
  const width = Math.max(r.width, 240)
  const left = Math.min(r.left, window.innerWidth - width - 8)
  dropdown.value = { top: r.bottom + 4, left: Math.max(8, left), width }
}

function onInput(): void {
  reset()
  if (!query.value.trim()) { results.value = []; dropdown.value = null; return }

  timer = setTimeout(async () => {
    const own = new AbortController()
    controller = own
    try {
      const found = await props.search(query.value, own.signal)
      // A result that arrives after its own request was superseded is discarded here as well
      // as in the caller's fetch, since an abort cannot retract a resolved promise.
      if (own.signal.aborted) return
      results.value = found
      place()
    } catch {
      // An abort, or the caller's own error. Either way there is nothing to show.
    }
  }, props.debounce)
}

function choose(result: SearchResult): void {
  emit('select', result)
  collapse()
}

/** Collapse when focus leaves the field entirely, but not when it moves inside it. */
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && root.value?.contains(next)) return
  collapse()
}

const grouped = computed(() => {
  const map = new Map<string, SearchResult[]>()
  for (const r of results.value) {
    const key = r.group ?? ''
    const list = map.get(key)
    if (list) list.push(r)
    else map.set(key, [r])
  }
  return Array.from(map, ([group, items]) => ({ group, items }))
})

onBeforeUnmount(reset)
</script>

<template>
  <div
    ref="root"
    class="vdd-panel-toolbar-search"
    :class="{ 'vdd-panel-toolbar-search--open': expanded }"
    data-vdd-toolbar-search
    @focusout="onFocusOut"
  >
    <button
      type="button"
      class="vdd-panel-toolbar-btn"
      :title="ws.format(ws.messages.search)"
      :aria-label="ws.format(ws.messages.search)"
      data-vdd-search-toggle
      @click="expanded ? collapse() : expand()"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6.5" cy="6.5" r="4.5" />
        <line x1="10" y1="10" x2="14" y2="14" />
      </svg>
    </button>

    <input
      v-if="expanded"
      ref="input"
      v-model="query"
      class="vdd-panel-toolbar-search__input"
      type="text"
      :placeholder="placeholder ?? ws.format(ws.messages.search)"
      autocomplete="off"
      data-vdd-search-input
      @input="onInput"
      @keydown.esc="onEscape"
    >

    <!--
      Teleported so the toolbar's bounds cannot clip the dropdown. Its z-index comes from the
      stylesheet, against --vdd-z-base, so `zIndexBase` moves it with everything else.
    -->
    <Teleport v-if="dropdown && results.length" to="body">
      <div
        class="vdd-panel-toolbar-search__dropdown"
        :style="{ position: 'fixed', top: `${dropdown.top}px`, left: `${dropdown.left}px`, width: `${dropdown.width}px` }"
        data-vdd-search-results
        @mousedown.prevent
      >
        <template v-for="{ group, items } in grouped" :key="group || '__default__'">
          <div v-if="group" class="vdd-panel-toolbar-search__group">{{ group }}</div>
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="vdd-panel-toolbar-search__item"
            :data-vdd-search-result="item.id"
            @click="choose(item)"
          >
            <span v-if="item.icon" class="vdd-panel-toolbar-search__item-icon"><component :is="item.icon" /></span>
            <span class="vdd-panel-toolbar-search__item-label">{{ item.label }}</span>
            <span v-if="item.description" class="vdd-panel-toolbar-search__item-desc">{{ item.description }}</span>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>
