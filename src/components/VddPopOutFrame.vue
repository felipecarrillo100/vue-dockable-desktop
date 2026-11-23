<script setup lang="ts">
/**
 * One pop-out window's content (1.14.0, rdd's `PopOutWindow` in `PopOutWindows.tsx`): teleported
 * into the child's `<body>`, the library's frame (icon, title, "Return to desktop") around the
 * panel's ordinary slot. The slot is the one a tab or a floating window uses, so the panel's cached
 * element moves into the child window and back without remounting.
 *
 * Only the full-size layout is inline (rdd's `FRAME_STYLE`, `BODY_STYLE`, `fillWindow`, `fillSlot`),
 * so the content stays usable without any stylesheet in the window; the rest of the frame's look is
 * in `26a-popout.css`, which the window gets from the page. While the panel is shown,
 * `startPopOutStyles` (`core/popOutStyles.ts`) copies the page's stylesheets, `<html>` / `<body>`
 * and the workspace's scope into the window, and the frame stays hidden until they are ready.
 */
import { computed, onMounted, ref, useTemplateRef, watch, watchEffect } from 'vue'
import type { Component, CSSProperties } from 'vue'
import { useWorkspace } from '../composables/useWorkspace'
import { optionsFor } from '../core/panelOptions'
import { startPopOutStyles } from '../core/popOutStyles'
import { isHTMLElement } from '../core/domContext'
import { menuEventBelow } from '../core/contextMenu'
import VddPanelSlot from './VddPanelSlot.vue'
import VddPopoutWrap from './popoutWrap'

const props = defineProps<{
  id: string
  doc: Document
  /** The desktop's fallback icon for a panel that registers none. */
  defaultIcon?: unknown
  /** The workspace element whose scope (scheme, skin, no-animations) the frame repeats. */
  scope?: Element | null
  /**
   * The app's `popoutWrapper` (1.14.0), around the whole frame with this window: what the app hands
   * the frame (the icon) gets its CSS-in-JS rules here. The slot inside only moves DOM, so the
   * panel's content (wrapped by its own `VddPanelMount`) doesn't remount.
   */
  wrapper?: Component | null
}>()
const emit = defineEmits<{ return: [] }>()

// The window's minimum layout, inline: the frame fills the window and the panel fills the frame's
// body, so its content stays usable if the copied stylesheet never arrives.
const FRAME_STYLE: CSSProperties = { position: 'fixed', inset: '0', display: 'flex', flexDirection: 'column' }
/** ...hidden until the copied stylesheets have loaded, rather than flash unstyled. */
const HIDDEN_FRAME_STYLE: CSSProperties = { ...FRAME_STYLE, visibility: 'hidden' }
const BODY_STYLE: CSSProperties = { flex: 'auto', minHeight: '0', position: 'relative' }
/** The slot and the panel's own elements inside it fill the frame's body. */
const FILL = ':scope > .vdd-panel-slot, :scope > .vdd-panel-slot > .vdd-panel-mount, :scope > .vdd-panel-slot > .vdd-panel-mount > .vdd-panel-content'

const ws = useWorkspace()
const panel = computed(() => ws.state.panels[props.id])
const title = computed(() => (panel.value ? ws.format(panel.value.title) : ''))
const shown = computed(() => !!panel.value?.poppedOut && panel.value.state === 'floating')
/** A managed widget's panel (P5): its button goes back into its panel. */
const hosted = computed(() => !!panel.value?.owner)
/** The active panel: the frame carries `data-vdd-focused`, as a floating window does (rdd 7.12.0). */
const focused = computed(() => ws.state.activePanelId === props.id)
const returnLabel = computed(() => ws.format(hosted.value ? ws.messages.backIntoPanel : ws.messages.returnToDesktop))
const icon = computed(() => {
  const p = panel.value
  return p ? p.icon ?? optionsFor(ws.registry, p)?.icon ?? props.defaultIcon : undefined
})
/**
 * A managed widget's panel (P5): its title icon is a button opening the widget's `titleMenu` (the
 * items its overlay registered for the panel), when it has one.
 */
const widgetMenu = computed(() => hosted.value && ws.panelMenuItems(props.id).length > 0)

/**
 * Opens the widget's `titleMenu` in this window. The menu closes on a click that reaches its
 * window (and a press elsewhere): without the `stopPropagation`, the click that opens it closes it
 * (rdd's S7 bug). From the keyboard (Enter or Space: `detail` 0, no pointer position), it opens
 * below the icon on its first item, through a stand-in event placed at the icon's corner whose
 * target is the icon, so the menu still shows in this window's body.
 */
function openWidgetMenu(event: MouseEvent): void {
  event.stopPropagation()
  const items = ws.panelMenuItems(props.id)
  if (items.length === 0) return
  const button = event.currentTarget
  if (event.detail === 0 && isHTMLElement(button)) {
    ws.showContextMenu({ event: menuEventBelow(button), items, initialFocus: 'first-item' })
  } else {
    ws.showContextMenu({ event, items })
  }
}
const bodyEl = useTemplateRef<HTMLDivElement>('body')
const frameEl = useTemplateRef<HTMLDivElement>('frame')
/**
 * Whether the window's styles are ready: false until `startPopOutStyles`' `onReady`. The frame is
 * hidden meanwhile, and `panel:popped-out` waits for it (the registry's `placed` reads the frame's
 * `visibility`).
 */
const styled = ref(false)

/** The child page fills its window: no margin, full height. */
function fillWindow(doc: Document): void {
  for (const el of [doc.documentElement, doc.body]) {
    el.style.margin = '0'
    el.style.height = '100%'
  }
}

/** Sizes the slot and the panel's elements to the frame's body while they are in it; undone on return. */
function fillSlot(body: HTMLElement): () => void {
  const els = Array.from(body.querySelectorAll<HTMLElement>(FILL))
  for (const el of els) { el.style.width = '100%'; el.style.height = '100%' }
  return () => { for (const el of els) { el.style.removeProperty('width'); el.style.removeProperty('height') } }
}

/** The window's document: written to (its title, `<html>`), never replaced; a new window is a new frame. */
const childDoc = props.doc

// The window's title follows the panel's.
watchEffect(() => { childDoc.title = title.value })
// The workspace's direction on the window's `<html>` when the page's sets none. The page's own `dir`
// and `lang` come with the mirror of `<html>`'s attributes (`startPopOutStyles`).
watchEffect(() => {
  if (!document.documentElement.hasAttribute('dir')) childDoc.documentElement.dir = ws.state.dir
})
onMounted(() => { fillWindow(childDoc) })
// The page's styles, <html>/<body> and the workspace's scope, kept in step while it is out.
watch([shown, frameEl], ([isShown, frame], _, onCleanup) => {
  if (!isShown || !frame) return
  onCleanup(startPopOutStyles({ child: childDoc, frame, scope: props.scope ?? null, onReady: () => { styled.value = true } }))
}, { immediate: true, flush: 'post' })
// After the slot has moved the panel's element in (its function ref runs in the patch).
watch([shown, bodyEl], ([isShown, body], _, onCleanup) => {
  if (isShown && body) onCleanup(fillSlot(body))
}, { immediate: true, flush: 'post' })
</script>

<template>
  <Teleport :to="doc.body">
    <!-- The app's component from the desktop, stable across renders: not one made here. -->
    <VddPopoutWrap v-if="shown && panel" :wrapper="wrapper ?? null" :win="doc.defaultView" :doc="doc">
      <!-- `vdd-workspace` too: what is scoped to the workspace (its colours, scrollbars) applies here. -->
      <div
        ref="frame"
        class="vdd-workspace vdd-popout-frame"
        :data-vdd-popout="id"
        :data-vdd-popout-kind="hosted ? 'widget' : 'panel'"
        :data-vdd-focused="focused ? '' : undefined"
        :dir="ws.state.dir"
        :style="styled ? FRAME_STYLE : HIDDEN_FRAME_STYLE"
      >
        <div class="vdd-popout-frame__header">
          <!-- A press on the icon is not one on the frame (activation, a menu's dismissal): M4's guards. -->
          <button
            v-if="widgetMenu"
            type="button"
            class="vdd-popout-frame__icon vdd-popout-frame__icon--menu"
            aria-haspopup="menu"
            :aria-label="title"
            @pointerdown.stop
            @click="openWidgetMenu"
          >
            <component :is="icon" v-if="icon" />
          </button>
          <span v-else class="vdd-popout-frame__icon"><component :is="icon" v-if="icon" /></span>
          <span class="vdd-popout-frame__title">{{ title }}{{ panel?.dirty ? ' *' : '' }}</span>
          <!-- A title-bar button in the skin, as a floating window's: its label is the tooltip and the name. -->
          <button
            type="button"
            class="vdd-custom-tab-btn vdd-popout-frame__return"
            :title="returnLabel"
            :aria-label="returnLabel"
            @click="emit('return')"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 4L9 15" />
              <path d="M9 8v7h7" />
              <path d="M4 20h16" />
            </svg>
          </button>
        </div>
        <div ref="body" class="vdd-popout-frame__body" :style="BODY_STYLE">
          <VddPanelSlot :panel-id="id" />
        </div>
      </div>
    </VddPopoutWrap>
  </Teleport>
</template>
