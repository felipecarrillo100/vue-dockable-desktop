<script setup lang="ts">
/**
 * The workspace.
 *
 * Two jobs. It renders the layout — the recursive grid, and later floating windows and the
 * taskbar. And it owns the **persistence port**: every open panel is rendered here exactly
 * once, teleported into its own cache element, and that element is moved into whichever slot
 * currently shows the panel.
 *
 * Nothing in the port is ever conditionally rendered. That is the entire zero-unmount
 * guarantee, and why a panel keeps its WebGL context, its scroll position and its running
 * timers through every layout change.
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { clampFloatingRect } from '../core/anchorGeometry'
import { PanelDomCache } from '../core/panelDom'
import { providePanelDom } from '../composables/usePanelDom'
import { provideDragDock } from '../composables/useDragDock'
import type { Workspace } from '../core/workspace'
import { buildTaskbarMenu } from '../core/panelMenu'
import { useWorkspace } from '../composables/useWorkspace'
import VddWorkspaceGrid from './VddWorkspaceGrid.vue'
import VddPanelMount from './VddPanelMount.vue'
import VddFloatingWindow from './VddFloatingWindow.vue'
import VddEdgeZones from './VddEdgeZones.vue'
import VddDragGhost from './VddDragGhost.vue'
import VddTaskbar from './VddTaskbar.vue'
import type { TaskbarVisibility } from './VddTaskbar.vue'

const props = withDefaults(defineProps<{
  /** Built-in skin, or a name you scope your own tokens to. @default 'vscode' */
  skin?: string
  /** Enable the library's own transitions. Never affects the host app's animations. @default true */
  animations?: boolean
  /**
   * When the minimised-panel taskbar is shown.
   * - `'always'` — a permanent strip
   * - `'compact'` — only while something is minimised
   * - `'autohide'` — an overlay collapsed to an 8px peek strip, expanding on hover
   * @default 'always'
   */
  taskbar?: TaskbarVisibility
  /** Fallback icon for panels that register none. */
  defaultPanelIcon?: unknown
}>(), { skin: 'vscode', animations: true, taskbar: 'always' })

const emit = defineEmits<{
  /**
   * A right-click or long press on a taskbar icon, emitted *after* the library has opened its
   * own menu — so an application can observe it without having to rebuild the standard items.
   */
  taskbarContextMenu: [panelId: string, event: PointerEvent | MouseEvent]
}>()

const ws = useWorkspace()
const dom = new PanelDomCache()
providePanelDom(dom)
const drag = provideDragDock(ws as unknown as Workspace<never>)

/** Every panel that exists, so the port can render each exactly once. */
const mounted = computed(() => Object.keys(ws.state.panels))

// A closed panel's element is dropped, or the cache would grow for the session's lifetime.
watch(mounted, (now, before) => {
  for (const id of before ?? []) if (!now.includes(id)) dom.release(id)
})

/**
 * The workspace's own measured size.
 *
 * Measured, not read from the window: the workspace is usually only part of a page — a
 * sidebar may expand, a taskbar may appear — and floating windows are positioned inside it.
 */
/**
 * The two diagnostics that turn a silent black screen into a message.
 *
 * The stylesheet carries a `--vdd-styles-loaded: 1` sentinel; without the import the
 * workspace renders as an unstyled black rectangle with nothing in the console at all, which
 * is a genuinely hard first hour for someone new to the library. Checked once, on mount.
 */
onMounted(() => {
  if (process.env.NODE_ENV === 'production') return
  try {
    const sentinel = getComputedStyle(document.documentElement)
      .getPropertyValue('--vdd-styles-loaded').trim()
    if (sentinel !== '1') {
      console.error(
        '[vue-dockable-desktop] the stylesheet is not imported.\n' +
        'Add this to your entry file (main.ts):\n' +
        "  import 'vue-dockable-desktop/styles.css'\n" +
        'Without it the workspace renders as a black rectangle, with no other error.',
      )
    }
  } catch { /* no getComputedStyle: SSR, or a very old environment */ }
})

const viewportEl = useTemplateRef<HTMLDivElement>('viewport')
const viewport = ref({ width: 1024, height: 768 })
let observer: ResizeObserver | null = null
let warnedZeroHeight = false

watch(viewportEl, (el) => {
  observer?.disconnect()
  if (!el || typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (!rect) return
    viewport.value = { width: Math.max(100, rect.width), height: Math.max(100, rect.height) }

    // A zero-height workspace is invisible with no error anywhere, and the cause is always
    // the same: a percentage-height chain broken by an ancestor with `height: auto`. Say so,
    // and name the ancestor, rather than letting the app look broken.
    if (process.env.NODE_ENV !== 'production' && rect.height < 10 && !warnedZeroHeight) {
      warnedZeroHeight = true
      let culprit: Element = el
      let cursor = el.parentElement
      while (cursor && cursor !== document.documentElement) {
        if (cursor.getBoundingClientRect().height < 10) culprit = cursor
        else break
        cursor = cursor.parentElement
      }
      const describe = culprit === el
        ? 'the workspace element itself'
        : `<${culprit.tagName.toLowerCase()}${culprit.id ? ` id="${culprit.id}"` : ''}${culprit.className ? ` class="${culprit.className}"` : ''}>`
      console.warn(
        `[vue-dockable-desktop] The workspace has no height, so it is invisible.\n\n` +
        `Zero height starts at: ${describe}\n\n` +
        `In CSS, height: 100% only resolves when every ancestor has a real height. If any one ` +
        `of them is height: auto (a div's default), the chain breaks.\n\n` +
        `Give the workspace's container a height — 100vh, or flex: 1 with min-height: 0 inside ` +
        `a flex column. The library deliberately does not style your page; .vdd-fill-viewport ` +
        `is available if you want the simple case.`,
      )
    }
  })
  observer.observe(el)
}, { immediate: true, flush: 'post' })

/**
 * Keep floating windows reachable when the workspace shrinks.
 *
 * The arithmetic is `clampFloatingRect`, which returns the same object when nothing changed —
 * this watcher is deep on the very list it writes to, so a write that changes nothing would
 * re-trigger it forever.
 */
watch([viewport, () => ws.state.floating], ([view, windows]) => {
  for (const w of windows) {
    const num = (v: number | string) => (typeof v === 'number' ? v : Number.parseFloat(String(v)))
    const current = { x: num(w.x), y: num(w.y), width: num(w.width), height: num(w.height) }
    const next = clampFloatingRect(current, view, w.anchor != null)
    if (next !== current) ws.updateFloatingPosition(w.id, next)
  }
}, { deep: true })

/** The menu for a minimised panel: restore, maximise (which rdd's never did), close. */
function onTaskbarMenu(panelId: string, event: PointerEvent | MouseEvent): void {
  const panel = ws.state.panels[panelId]
  if (panel) {
    const options = ws.registry.get(panel.component)?.defaultOptions ?? {}
    const items = buildTaskbarMenu(ws, panelId, options, {
      float: () => ws.floatPanel(panelId),
      minimize: () => ws.minimizePanel(panelId),
      close: () => ws.requestClosePanel(panelId),
      restore: () => ws.restorePanel(panelId),
      maximize: () => ws.maximizePanel(panelId),
    })
    if (items.length > 0) ws.showContextMenu({ event, items })
  }
  emit('taskbarContextMenu', panelId, event)
}

/**
 * Skin, animation state and the stacking base are mirrored onto the document element, so
 * chrome that teleports to `document.body` — menus, toasts, flyouts, modals — inherits the
 * same tokens as the workspace itself.
 *
 * `--vdd-z-base` is the one that is easy to leave out and impossible to notice: every piece
 * of teleported chrome stacks with `calc(var(--vdd-z-base, 1000) + n)`, so without this the
 * fallback silently applies and `createWorkspace({ zIndexBase })` has no effect at all. The
 * option would exist, the stylesheet would read the variable, and nothing would connect them
 * — the same shape as the four dead CSS hookups this library has already shipped.
 */
const syncDocument = () => {
  const root = document.documentElement
  root.setAttribute('data-vdd-skin', props.skin)
  root.classList.toggle('vdd-no-animations', props.animations === false)
  root.style.setProperty('--vdd-z-base', String(ws.config.zIndexBase))
}
watch(() => [props.skin, props.animations, ws.config.zIndexBase], syncDocument)
onMounted(syncDocument)

onBeforeUnmount(() => {
  observer?.disconnect()
  const root = document.documentElement
  root.removeAttribute('data-vdd-skin')
  root.classList.remove('vdd-no-animations')
  root.style.removeProperty('--vdd-z-base')
  dom.dispose()
})
</script>

<template>
  <div
    class="vdd-workspace"
    :class="{ 'vdd-no-animations': animations === false }"
    :data-vdd-skin="skin"
    :dir="ws.state.dir"
  >
    <div ref="viewport" class="vdd-workspace-viewport">
      <VddEdgeZones v-if="drag.dragging.value" />

      <VddWorkspaceGrid :node="ws.state.gridRoot" :path="[]" />

      <VddFloatingWindow
        v-for="w in ws.state.floating"
        :key="w.id"
        :window="w"
        :viewport="viewport"
      />
    </div>

    <VddTaskbar
      :visibility="taskbar"
      :cache="dom"
      :default-icon="defaultPanelIcon"
      @context-menu="onTaskbarMenu"
    />

    <VddDragGhost />

    <!--
      The persistence port. Every open panel is rendered here once, for as long as it is
      open, and teleported into its own cache element. Never conditional, never keyed on
      placement — that is the whole mechanism.
    -->
    <div class="vdd-panel-port" aria-hidden="true">
      <VddPanelMount v-for="id in mounted" :key="id" :panel-id="id" :cache="dom" />
    </div>
  </div>
</template>
