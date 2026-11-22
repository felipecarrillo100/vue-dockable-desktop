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
import type { Component } from 'vue'
import { clampFloatingRect } from '../core/anchorGeometry'
import { PanelDomCache } from '../core/panelDom'
import { claimDocumentMirror, releaseDocumentMirror } from '../core/documentMirror'
import { providePanelDom } from '../composables/usePanelDom'
import { provideDragDock } from '../composables/useDragDock'
import type { Workspace } from '../core/workspace'
import { buildTaskbarMenu } from '../core/panelMenu'
import { useWorkspace } from '../composables/useWorkspace'
import { useColorScheme } from '../composables/useColorScheme'
import VddWorkspaceGrid from './VddWorkspaceGrid.vue'
import VddPanelMount from './VddPanelMount.vue'
import VddFloatingWindow from './VddFloatingWindow.vue'
import VddEdgeZones from './VddEdgeZones.vue'
import VddDragGhost from './VddDragGhost.vue'
import VddTaskbar from './VddTaskbar.vue'
import type { TaskbarVisibility } from './VddTaskbar.vue'
import type { TabContentProps } from '../types'
import { optionsFor } from '../core/panelOptions'
import { isElement } from '../core/domContext'
import { eventDocument, listenOnDocuments } from '../core/documentRegistry'
import { createPopOutWindows } from '../core/popOutWindows'
import { providePopOutWindows } from '../composables/usePopOutWindows'
import { providePopoutWrapper } from '../composables/usePanelWindow'
import VddPopOutWindows from './VddPopOutWindows.vue'

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
  /**
   * The page a pop-out window opens (1.14.0), for `createWorkspace({ popOut: true })`: a page of
   * this origin, resolved against the main page's URL. Without it a pop-out is a blank window.
   * The page must be of this origin; one that can't be read, or doesn't load in 10 s, sends the
   * panel back.
   */
  popoutUrl?: string
  /**
   * A component around every panel's content, given the window and document the panel is in
   * (1.14.0, `PopoutWrapperProps`): the main ones, then the pop-out's while it is in its own
   * window. It renders its default slot. For CSS-in-JS: a cache per document, so the panel's styles
   * are inserted where it is shown (a pop-out doesn't get rules inserted with `insertRule` from the
   * page). Rendered for every panel, for its whole life, while the workspace has `popOut: true`
   * (none otherwise), so nothing remounts when a panel moves. Pass a stable component (imported or
   * defined once), not one made in a render. In a pop-out it is also rendered around the window's
   * frame (the icon and title you give the panel), a context menu and the toasts shown there, with
   * that window: keep one cache per document, not per wrapper.
   *
   * @example
   * ```ts
   * // PopoutWrapper.vue, a `<script setup lang="ts">` whose template is `<slot />`:
   * import { computed, provide } from 'vue'
   * // `PopoutWrapperProps`: the window and document of what it is around.
   * const props = defineProps<{ window: Window; document: Document }>()
   * // Your CSS-in-JS library's per-document cache, for the document the content is shown in.
   * provide(STYLE_DOCUMENT, computed(() => props.document))
   * ```
   * Then `<VddDesktop :popout-wrapper="PopoutWrapper" />`.
   */
  popoutWrapper?: Component
}>(), { skin: 'vscode', animations: true, taskbar: 'always', defaultPanelIcon: undefined, popoutUrl: undefined, popoutWrapper: undefined })

defineSlots<{
  /** Your view while no panel is docked (1.9.0). */
  'empty-workspace'?: () => unknown
  /**
   * Your own content for each tab in the grid (1.11.0): it replaces the built-in icon, title and
   * dirty marker. The tab itself (dragging, keyboard, accessibility, its menu, the close button)
   * stays the library's. Branch on `tab.component` for a per-type look.
   */
  'tab-content'?: (tab: TabContentProps) => unknown
}>()

const emit = defineEmits<{
  /**
   * A right-click or long press on a taskbar icon, emitted *after* the library has opened its
   * own menu — so an application can observe it without having to rebuild the standard items.
   */
  taskbarContextMenu: [panelId: string, event: PointerEvent | MouseEvent]
}>()

const ws = useWorkspace()
/**
 * The application's colour scheme, read back so it can be mirrored onto the workspace element.
 *
 * Not decoration: a skin's token block is written `[data-vdd-skin="macos"]`, which matches this
 * element as well as `<html>`. The scheme lives on `<html>`, so without repeating it here only
 * the skin's *dark* variant matches at this level — and those tokens, re-declared closer to the
 * content, shadow the light values inherited from the root. The workspace would then paint dark
 * panels with dark text in light mode, for every skin but the default.
 *
 * So the pair travels together, on both elements. rdd does the same on its own root div for the
 * same reason.
 */
const colorScheme = useColorScheme()
const dom = new PanelDomCache()
providePanelDom(dom)
const drag = provideDragDock(ws as unknown as Workspace<never>)

/**
 * This desktop's pop-out windows (1.14.0): created here, bound to the workspace on mount (its
 * `popOutPanel` / `returnPanel` / `focusPanelWindow` then reach them), and lent the panel cache.
 * Unmounting brings every panel back first, while the cache can still take its element.
 */
const popOuts = createPopOutWindows(ws)
providePopOutWindows(popOuts)
// A managed widget's content wears it too (P5): it is rendered by its overlay, not a panel mount.
providePopoutWrapper(() => (popOuts.enabled ? props.popoutWrapper ?? null : null))
watch(() => props.popoutUrl, url => popOuts.setUrl(url), { immediate: true })
let stopPopOuts: (() => void) | null = null
onMounted(() => {
  const unbind = popOuts.bind()
  const unbindHost = popOuts.bindHost({
    // Synchronous, so a child's `pagehide` handler has the element back before its document goes.
    park(id) { if (dom.has(id)) dom.moveTo(id, null) },
    rectOf(id) {
      if (!dom.has(id)) return null
      const r = dom.elementFor(id).getBoundingClientRect()
      return r.width > 0 && r.height > 0 ? r : null
    },
    element: id => (dom.has(id) ? dom.elementFor(id) : null),
    isParked: id => dom.isParked(id),
  })
  stopPopOuts = () => { unbindHost(); unbind() }
})

/**
 * Every panel that exists, so the port can render each exactly once.
 *
 * Empty while server-rendering: a panel lives in a real element that the port teleports into,
 * and there is no document to create one in. The panels mount on the client. The port itself
 * stays unconditional — only this list differs, and only where there is no DOM.
 */
const serverRendering = typeof document === 'undefined'
const mounted = computed(() => (serverRendering ? [] : Object.keys(ws.state.panels)))
/** The floating windows drawn here: a panel in its own browser window (1.14.0) keeps its entry, undrawn. */
const shownWindows = computed(() => ws.state.floating.filter(w => !ws.state.panels[w.id]?.poppedOut))

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
/** The workspace element: each pop-out's frame repeats its scope (scheme, skin, no-animations). */
const rootEl = useTemplateRef<HTMLDivElement>('root')
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
        `a flex column. The library deliberately does not style your page; for the simple case, ` +
        `the .vdd-fill-viewport class works on <VddDesktop> itself or on its container.`,
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
    // A panel in its own window (1.14.0) isn't on this page: nothing to keep on screen.
    if (ws.state.panels[w.id]?.poppedOut) continue
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
    const options = optionsFor(ws.registry, panel) ?? {}
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
 *
 * Through the document mirror, keyed by this desktop's panel cache: with several desktops on one
 * page the newest wins, and unmounting one hands `<html>` back to the others rather than clearing it.
 */
const syncDocument = () => {
  claimDocumentMirror(dom, {
    skin: props.skin,
    noAnimations: props.animations === false,
    zBase: ws.config.zIndexBase,
  })
}
watch(() => [props.skin, props.animations, ws.config.zIndexBase], syncDocument)
onMounted(syncDocument)

/**
 * Click-to-activate in the other documents that hold panel content (1.14.0): a pop-out window's,
 * once it registers. Through the document registry, `pointerdown` on each document.
 *
 * In the main document the elements answer for themselves — the group's and the floating
 * window's own `@pointerdown` — exactly as before, so this listener leaves that document alone.
 * Elsewhere the press makes the panel it lands in the active one: a floating window's, or the
 * selected tab of the group it is in.
 */
function onPointerDownElsewhere(event: PointerEvent): void {
  if (event.button !== 0) return
  if (eventDocument(event) === document) return
  const target = event.target
  if (!isElement(target)) return
  // Inside a pop-out window's frame (rdd 7.12.0): that panel becomes the active one. Its window is
  // already in front, so it isn't focused again.
  const popOutId = popOutPanelOf(target)
  if (popOutId) { activate(popOutId); return }
  const id = target.closest('[data-vdd-window]')?.getAttribute('data-vdd-window')
    || target.closest('.vdd-workspace-panel')?.getAttribute('data-active-panel-id')
  if (id && ws.state.panels[id]) ws.focusPanel(id)
}
/** The panel whose pop-out frame holds `target`, or null (1.14.0). */
function popOutPanelOf(target: unknown): string | null {
  return isElement(target) ? target.closest('[data-vdd-popout]')?.getAttribute('data-vdd-popout') ?? null : null
}
function activate(id: string): void {
  if (ws.state.panels[id]) ws.activatePanel(id)
}
/**
 * Focus moving into a pop-out (a Tab, a click on a field, the window coming forward on its element)
 * activates its panel too (rdd 7.12.0). Only there: in the page, focus alone never activates.
 */
function onFocusInElsewhere(event: FocusEvent): void {
  const id = popOutPanelOf(event.target)
  if (id) activate(id)
}
let stopActivate: (() => void) | null = null
onMounted(() => {
  const offPointer = listenOnDocuments('pointerdown', onPointerDownElsewhere)
  const offFocus = listenOnDocuments('focusin', onFocusInElsewhere)
  stopActivate = () => { offPointer(); offFocus() }
})

onBeforeUnmount(() => {
  stopPopOuts?.()
  stopPopOuts = null
  stopActivate?.()
  observer?.disconnect()
  releaseDocumentMirror(dom)
  dom.dispose()
})
</script>

<template>
  <div
    ref="root"
    class="vdd-workspace"
    :class="{ 'vdd-no-animations': animations === false }"
    :data-vdd-skin="skin"
    :data-color-scheme="colorScheme"
    :dir="ws.state.dir"
  >
    <div ref="viewport" class="vdd-workspace-viewport">
      <VddEdgeZones v-if="drag.dragging.value" />

      <VddWorkspaceGrid :node="ws.state.gridRoot" :path="[]">
        <!-- Your view while no panel is docked (1.9.0); forwarded to the root group only. -->
        <template v-if="$slots['empty-workspace']" #empty-workspace><slot name="empty-workspace" /></template>
        <!-- Your tab content (1.11.0); forwarded to every group. -->
        <template v-if="$slots['tab-content']" #tab-content="tab"><slot name="tab-content" v-bind="tab" /></template>
      </VddWorkspaceGrid>

      <VddFloatingWindow
        v-for="w in shownWindows"
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

    <!-- Pop-out windows (1.14.0): each one's frame, teleported into its own document. -->
    <VddPopOutWindows :windows="popOuts" :default-icon="defaultPanelIcon" :scope="rootEl" :wrapper="popoutWrapper ?? null" />

    <!--
      The persistence port. Every open panel is rendered here once, for as long as it is
      open, and teleported into its own cache element. Never conditional, never keyed on
      placement — that is the whole mechanism.
    -->
    <div class="vdd-panel-port" aria-hidden="true">
      <VddPanelMount v-for="id in mounted" :key="id" :panel-id="id" :cache="dom" :wrapper="popOuts.enabled ? popoutWrapper ?? null : null" />
    </div>
  </div>
</template>
