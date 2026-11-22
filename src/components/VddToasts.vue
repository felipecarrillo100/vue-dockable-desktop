<script setup lang="ts">
/**
 * The notification host. Mount once, anywhere.
 *
 * `maxVisible` is a `computed` slice of the one queue, not a second array that has to be
 * shifted from. rdd kept the overflow in a separate `queueRef` and promoted from it
 * imperatively when a toast finished exiting; here a toast leaving the list means the next
 * one is simply inside the slice, so promotion is not code.
 */
import { computed, inject, onBeforeUnmount, toRaw, watch } from 'vue'
import { removeToast, setToastAdapter, toastDocument, toastQueue } from '../core/toast'
import type { ToastRecord } from '../core/toast'
import { isRegistered, onDocumentsChange } from '../core/documentRegistry'
import { popoutWrapperFor } from '../core/panelWindow'
import VddPopoutWrap from './popoutWrap'
import { useLibraryMessage } from '../composables/useLibraryMessage'
import type { ToastAdapter, ToastPosition } from '../core/toast'
import VddToastItem from './VddToastItem.vue'
import { WORKSPACE_KEY } from '../core/workspace'

/** The library's own strings, translated when a workspace is present. */
const message = useLibraryMessage()

const props = withDefaults(defineProps<{
  /** @default 'top-right' */
  position?: ToastPosition
  /** How many show at once. The rest wait. @default 3 */
  maxVisible?: number
  /** Auto-dismiss delay in ms; `0` makes every toast sticky. @default 5000 */
  defaultDuration?: number
  /** @default true */
  defaultClosable?: boolean
  /** Hold the timer while the pointer is over a toast. @default true */
  pauseOnHover?: boolean
  /** @default 'slide' */
  animation?: 'slide' | 'fade' | 'none'
  /** Put the newest toast at the top of the stack. @default false */
  newestOnTop?: boolean
  /** A countdown bar along the bottom of each toast. @default false */
  progressBar?: boolean
  /** Card width in pixels. @default 320 */
  width?: number
  /** Hand every `toast.*` call to another library instead. */
  adapter?: ToastAdapter
}>(), {
  position: 'top-right',
  maxVisible: 3,
  defaultDuration: 5000,
  defaultClosable: true,
  pauseOnHover: true,
  animation: 'slide',
  newestOnTop: false,
  progressBar: false,
  width: 320,
  adapter: undefined,
})

// An adapter is registered on the store, so `toast.*` reaches it even when called from
// outside any component — the whole point of the singleton.
watch(
  () => [props.adapter, props.defaultDuration, props.defaultClosable] as const,
  ([adapter, duration, closable]) => setToastAdapter(adapter ?? null, { duration, closable }),
  { immediate: true },
)
onBeforeUnmount(() => {
  if (props.adapter && toRaw(toastQueue.adapter) === toRaw(props.adapter)) {
    setToastAdapter(null, { duration: props.defaultDuration, closable: props.defaultClosable })
  }
})

/**
 * What is on screen: the oldest `maxVisible` toasts, with the ones still animating out kept
 * in place so they can finish rather than being yanked as the next one arrives.
 */
const visible = computed(() => {
  const result = []
  let shown = 0
  for (const item of toastQueue.items) {
    if (item.exiting) { result.push(item); continue }
    if (shown >= props.maxVisible) break
    result.push(item)
    shown++
  }
  return props.newestOnTop ? [...result].reverse() : result
})

/**
 * A toast dismissed while still queued has never been rendered, so nothing will ever report
 * its transition ending. Drop it here — this component is the only thing that knows whether
 * a given toast was on screen at all.
 */
watch(() => toastQueue.items.map(t => `${t.id}:${t.exiting}`).join(','), () => {
  const onScreen = new Set(visible.value.map(t => t.id))
  for (const item of [...toastQueue.items]) {
    if (item.exiting && !onScreen.has(item.id)) removeToast(item.id)
  }
}, { immediate: true })

const isLeft = computed(() => props.position.endsWith('left'))

// ── Pop-out windows (1.14.0): each toast in the window it was raised in ──────
const mainDoc = typeof document === 'undefined' ? null : document
/**
 * The window a toast shows in: its own while that is open, else the page. Read again whenever the
 * shown toasts change, which a closing window's own toasts leaving does.
 */
const shownIn = (item: ToastRecord): Document | null => {
  const doc = toastDocument(item.id)
  return doc && doc !== mainDoc && isRegistered(doc) ? doc : mainDoc
}
/** A stable key per window's container, so one window's emptying doesn't remount another's. */
const containerKeys = new WeakMap<Document, string>()
let containerCount = 0
const keyOf = (doc: Document | null): string => {
  if (!doc || doc === mainDoc) return 'main'
  let key = containerKeys.get(doc)
  if (!key) { key = `vdd-toasts-${++containerCount}`; containerKeys.set(doc, key) }
  return key
}
/**
 * One container per window with toasts: the page's always, a pop-out's while it shows some, there
 * inside the app's `popoutWrapper`. `maxVisible` counts all windows together (`visible`).
 */
const containers = computed(() => {
  const docs: (Document | null)[] = [mainDoc]
  const byDoc = new Map<Document | null, ToastRecord[]>([[mainDoc, []]])
  for (const item of visible.value) {
    const doc = shownIn(item)
    if (!byDoc.has(doc)) { docs.push(doc); byDoc.set(doc, []) }
    byDoc.get(doc)!.push(item)
  }
  return docs.map(doc => ({
    doc,
    key: keyOf(doc),
    items: byDoc.get(doc)!,
    inPopOut: !!doc && doc !== mainDoc,
    wrapper: doc && doc !== mainDoc ? popoutWrapperFor(doc) : null,
  }))
})

/**
 * A pop-out window closing takes its toasts with it, and runs their `onClose`; one still waiting
 * for a place (beyond `maxVisible`) shows in the page instead when its turn comes (`shownIn`).
 */
const stopDocuments = onDocumentsChange(() => {
  if (props.adapter) return
  const onScreen = new Set(visible.value.map(t => t.id))
  for (const item of [...toastQueue.items]) {
    const doc = toastDocument(item.id)
    if (!doc || isRegistered(doc)) continue
    if (!onScreen.has(item.id)) continue
    removeToast(item.id)
    if (!item.exiting) item.options.onClose?.()
  }
})
onBeforeUnmount(stopDocuments)

// Toasts are teleported to <body>: they follow the workspace into RTL (1.5.0), and otherwise
// inherit the page's direction, as before.
const workspace = inject(WORKSPACE_KEY, null)
const workspaceDir = computed(() => (workspace?.state.dir === 'rtl' ? 'rtl' : undefined))
</script>

<template>
  <Teleport v-if="adapter" to="body">
    <component :is="adapter.component" v-if="adapter.component" :position="position" />
  </Teleport>

  <!-- One per window with toasts (1.14.0): the page's always, a pop-out's while it has some. -->
  <template v-else>
    <template v-for="c in containers" :key="c.key">
      <Teleport :to="c.inPopOut ? c.doc!.body : 'body'">
        <!-- The app's component from the desktop, stable across renders: not one made here. -->
        <VddPopoutWrap :wrapper="c.wrapper" :win="c.inPopOut ? c.doc!.defaultView : null" :doc="c.inPopOut ? c.doc : null">
          <div
            class="vdd-toast-container"
            :class="[
              `vdd-toast-container--${position}`,
              newestOnTop ? 'vdd-toast-container--newest-top' : 'vdd-toast-container--newest-bottom',
            ]"
            :style="{ width: `${width}px` }"
            :dir="workspaceDir"
            role="region"
            :aria-label="message('notifications')"
            aria-live="polite"
            data-vdd-toasts
          >
            <VddToastItem
              v-for="item in c.items"
              :key="item.id"
              :toast="item"
              :is-left="isLeft"
              :show-progress="progressBar"
              :pause-on-hover="pauseOnHover"
              :animation="animation"
              :default-duration="defaultDuration"
              :default-closable="defaultClosable"
              @exited="removeToast"
            />
          </div>
        </VddPopoutWrap>
      </Teleport>
    </template>
  </template>
</template>
