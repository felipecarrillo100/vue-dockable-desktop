<script setup lang="ts">
/**
 * The app the browser gates drive. Not the demo — it exists to make every rendered state
 * reachable from a script, including the ones an application would rarely combine.
 *
 * M13's correspondence gate tours all of it, so a state that is not reachable here is a
 * state whose CSS cannot be shown to apply.
 */
import { markRaw, ref } from 'vue'
import {
  VddContextMenu, VddDesktop, VddModals, VddSidePanels, VddToasts,
  VddSidebar, VddSecondarySidebar, VddToolbar, VddConfirm,
  useWorkspace, toast,
} from 'vue-dockable-desktop'
import type { SidebarTab, ToolbarItem } from 'vue-dockable-desktop'
import HostilePanel from './HostilePanel.vue'

const ws = useWorkspace()
const taskbar = ref<'always' | 'compact' | 'autohide'>('always')
const Glyph = markRaw({ name: 'Glyph', template: '<svg width="16" height="16"><rect width="16" height="16" /></svg>' })

const sidebarTabs = ref<SidebarTab[]>([
  { id: 'layers', label: 'Layers', icon: Glyph, component: markRaw({ template: '<div class="pane">layers</div>' }) },
  { id: 'search', label: 'Search', icon: Glyph, component: markRaw({ template: '<div class="pane">search</div>' }) },
])
const openTab = ref<string | null>(null)
const secondaryTab = ref<string | null>(null)
const toolbarVisible = ref(true)
// The workspace toolbar's edge, and the animations opt-out: both have their own rules, and
// neither is reachable without being switchable from the outside.
const toolbarPosition = ref<'left' | 'right' | 'top' | 'bottom'>('left')
const animations = ref(true)
// The toast container's own options, so the gate can reach every position and the progress
// bar — one mount can only render one position at a time.
const toastPosition = ref<'top-right' | 'top-left' | 'bottom-left' | 'bottom-right'>('top-right')
const toastProgress = ref(false)
const toastMax = ref(3)

const toolbarItems = ref<ToolbarItem[]>([
  { type: 'action', id: 'save', label: 'Save', icon: Glyph, onClick: () => toast.success('Saved') },
  { type: 'separator' },
  { type: 'radio', id: 'pan', group: 'tool', label: 'Pan', icon: Glyph },
  { type: 'radio', id: 'select', group: 'tool', label: 'Select', icon: Glyph },
  { type: 'toggle', id: 'snap', label: 'Snap', icon: Glyph },
  {
    type: 'group', id: 'draw', label: 'Draw', defaultIcon: Glyph,
    items: [
      { id: 'line', label: 'Line', icon: Glyph, shortcut: 'L' },
      { type: 'separator' },
      { id: 'poly', label: 'Polygon', icon: Glyph },
    ],
  },
])

// Everything the gates drive, in one handle, so a tour reads as a script rather than as a
// sequence of clicks on coordinates.
;(window as unknown as Record<string, unknown>).__taskbar = taskbar
;(window as unknown as Record<string, unknown>).__app = {
  taskbar, sidebarTabs, openTab, secondaryTab, toolbarVisible, toolbarItems, Glyph,
  toastPosition, toastProgress, toastMax, toolbarPosition, animations,
  toast,
  // Each alert type has its own rule, so the gate needs to reach all four.
  openConfirm: (alertType: 'info' | 'warning' | 'success' | 'danger') => ws.overlays.openModal(
    VddConfirm,
    { message: `A ${alertType} confirmation.`, alert: 'Two fields are empty.', alertType, yesNo: true },
    { title: 'Confirm', size: 'small' },
  ),
  // A modal with an icon: the header's icon slot has its own rule.
  // Enough minimised panels to overflow the taskbar strip, which is the only thing that
  // renders its scroll buttons.
  fillTaskbar: () => {
    for (let i = 0; i < 14; i++) {
      ws.openPanel(`fill-${i}`, 'hostile', { title: `Filler panel number ${i}` })
      ws.minimizePanel(`fill-${i}`)
    }
    ws.openPanel('quiet-1', 'quiet')
    ws.minimizePanel('quiet-1')
  },
  clearTaskbar: () => {
    for (const id of ws.getOpenPanelIds()) if (id.startsWith('fill-') || id === 'quiet-1') ws.closePanel(id)
  },
  openIconModal: () => ws.overlays.openModal(
    VddConfirm, { message: 'With an icon.' }, { title: 'Icon', size: 'small', icon: Glyph },
  ),
  openModal: () => ws.overlays.openModal(
    VddConfirm,
    { message: 'Discard your changes?', alert: 'Two fields are empty.', alertType: 'danger', yesNo: true },
    { title: 'Unsaved Changes', size: 'small' },
  ),
  // Each modal size maps to its own max-width rule, so all five need reaching.
  openSized: (size: 'small' | 'medium' | 'large' | 'fullscreen' | 'auto') =>
    ws.overlays.openModal(VddConfirm, { message: `size: ${size}` }, { title: size, size }),
  // A side panel with an icon: the header's icon slot has its own rule.
  openLeft: () => ws.overlays.openLeftPanel(HostilePanel, {}, { title: 'Left drawer', icon: Glyph }),
  openRight: () => ws.overlays.openRightPanel(HostilePanel, {}, { title: 'Right drawer' }),
  menu: (x: number, y: number) => ws.showContextMenu({
    x, y,
    items: [
      { label: 'Simple', action: () => {} },
      { label: 'Disabled', action: () => {}, disabled: true },
      { label: 'With icon', icon: Glyph, action: () => {} },
      { label: 'Checked', checkbox: { value: true }, action: () => {} },
      { separator: true },
      { label: 'More', items: [{ label: 'Nested', action: () => {} }] },
    ],
  }),
}
</script>

<template>
  <div class="shell">
    <div class="bar">
      <button data-act="open-a" @click="ws.openPanel('a', 'hostile')">open a</button>
      <button data-act="open-b" @click="ws.openPanel('b', 'hostile')">open b</button>
      <button data-act="open-ov" @click="ws.openPanel('ov', 'overlay')">open overlay</button>
      <button data-act="open-icon" @click="ws.openPanel('ico', 'icony')">open with icon</button>
      <button data-act="dock-r" @click="ws.dockPanelToGroup('a', 'R', 'center')">a → R</button>
      <button data-act="split" @click="ws.dockPanelToGroup('a', 'R', 'bottom')">a → split R</button>
      <button data-act="float" @click="ws.floatPanel('a')">float a</button>
      <button data-act="min" @click="ws.minimizePanel('a')">minimise a</button>
      <button data-act="restore" @click="ws.restorePanel('a')">restore a</button>
      <button data-act="anchor" @click="ws.updateFloatingPosition('a', { anchor: 'top-right' })">anchor a</button>
      <button data-act="max" @click="ws.maximizePanel('a')">max a</button>
      <span data-active>{{ ws.state.activePanelId }}</span>
    </div>

    <VddSidebar
      v-model:active-tab-id="openTab"
      class="body"
      position="left"
      :tabs="sidebarTabs"
      :header-action="{ id: 'menu', icon: Glyph, label: 'Menu', onClick: () => {} }"
      :footer-action="{ id: 'settings', icon: Glyph, label: 'Settings', onClick: () => {} }"
      show-close-button
    >
      <VddSecondarySidebar v-model:active-tab-id="secondaryTab" :tabs="sidebarTabs">
        <div :class="toolbarPosition === 'top' || toolbarPosition === 'bottom' ? 'withToolbarV' : 'withToolbar'">
          <VddToolbar
              v-model:visible="toolbarVisible"
              :position="toolbarPosition"
              :items="toolbarItems"
            />
          <div class="workspace">
            <VddDesktop
              :taskbar="taskbar"
              :animations="animations"
            />
          </div>
        </div>
      </VddSecondarySidebar>
    </VddSidebar>

    <VddContextMenu />
    <VddSidePanels />
    <VddModals />
    <VddToasts :position="toastPosition" :progress-bar="toastProgress" :max-visible="toastMax" />
  </div>
</template>

<style>
html, body, #app { margin: 0; height: 100%; }
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.bar { display: flex; gap: 4px; padding: 6px; font: 11px system-ui; background: #1b1e28; color: #eee; flex-wrap: wrap; }
.body { flex: 1; min-height: 0; }
.withToolbar { display: flex; width: 100%; height: 100%; }
.withToolbarV { display: flex; flex-direction: column; width: 100%; height: 100%; }
.workspace { flex: 1; min-width: 0; }
.pane { padding: 8px; font: 12px system-ui; }
</style>
