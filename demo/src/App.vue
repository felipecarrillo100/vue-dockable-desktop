<script setup lang="ts">
/**
 * The demo's shell: a top bar, a sidebar, a toolbar, and the workspace inside them.
 *
 * Its whole purpose is to show what an application supplies versus what the library does.
 * The shell owns the chrome and the theme; the library owns the workspace. The two meet in
 * three places, all of them small: the merged toolbar items and sidebar tabs (panels
 * contribute to them), `formatMessage` (already wired in `main.ts`), and the four hosts
 * mounted at the bottom.
 */
import { computed, inject, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import {
  VddContextMenu, VddDesktop, VddModals, VddSecondarySidebar, VddSidePanels,
  VddSidebar, VddToasts, VddToolbar,
  useMergedSidebarTabs, useMergedToolbarItems, useWorkspace,
} from 'vue-dockable-desktop'
import type { SidebarTab, ToolbarItem } from 'vue-dockable-desktop'
import { ICONS } from './icons'
import { LOCALES, UI } from './i18n/messages'
import type { Locale } from './i18n/messages'
import PanelManagerForm from './forms/PanelManagerForm.vue'
import HelpPanel from './panels/HelpPanel.vue'
import LayerTreePanel from './panels/LayerTreePanel.vue'

const ws = useWorkspace()
/**
 * A ref, injected. The template auto-unwraps a ref held in `setup`, so it is bound as
 * `locale` there and read as `locale.value` only in script — writing `locale.value` in the
 * template read `.value` off a plain string and bound the select to `undefined`.
 */
const locale = inject<Ref<Locale>>('demo-locale')!

// ── what the shell owns ────────────────────────────────────────────────────
// `mono` is not the library's — it is defined in demo.css, as an application defines its own.
const SKINS = ['vscode', 'macos', 'chrome', 'slate', 'nord', 'obsidian', 'tokyo', 'mono'] as const
const skin = ref<(typeof SKINS)[number]>('vscode')
const scheme = ref<'dark' | 'light'>('dark')
const animations = ref(true)
const taskbar = ref<'always' | 'compact' | 'autohide'>('always')
const sidebarSide = ref<'left' | 'right'>('left')
const toolbarSide = ref<'left' | 'right' | 'top' | 'bottom'>('left')
const showSidebar = ref(true)
const showToolbar = ref(true)
const openTab = ref<string | null>(null)

/**
 * The colour scheme is the **application's** attribute, not the library's.
 *
 * The library reads `data-color-scheme` and styles itself from it; who sets it is the app's
 * decision, which is why `useColorScheme()` is a read-only ref.
 */
watch(scheme, (value) => {
  if (value === 'light') document.documentElement.setAttribute('data-color-scheme', 'light')
  else document.documentElement.removeAttribute('data-color-scheme')
}, { immediate: true })

// Picking a locale also picks its reading direction, which is the realistic case.
watch(locale, (next) => {
  ws.setDirection(LOCALES.find(l => l.id === next)?.dir ?? 'ltr')
})

const strings = computed(() => UI[locale.value]!)
const vertical = computed(() => toolbarSide.value === 'top' || toolbarSide.value === 'bottom')

// ── the shell's own chrome, merged with whatever the active panel contributes ──
const OWN_TOOLBAR: ToolbarItem[] = [
  { type: 'action', id: 'app-control', label: 'Control Center', icon: ICONS.rocket, onClick: () => ws.openPanel('control', 'control') },
  { type: 'action', id: 'app-manager', label: 'Panel manager', icon: ICONS.panel, onClick: () => ws.overlays.openLeftPanel(PanelManagerForm, {}, { title: 'Panel manager', width: 340 }) },
  { type: 'separator' },
  { type: 'toggle', id: 'app-taskbar', label: 'Compact taskbar', icon: ICONS.locator, active: taskbar.value === 'compact', onToggle: v => { taskbar.value = v ? 'compact' : 'always' } },
]
const OWN_TABS: SidebarTab[] = [
  { id: 'layers', label: 'Layers', icon: ICONS.layers, component: LayerTreePanel, preserveState: true },
  { id: 'search', label: 'Search', icon: ICONS.help, component: HelpPanel },
]

/**
 * `useMergedToolbarItems` and `useMergedSidebarTabs` append the active panel's contributions.
 *
 * Nothing is merged automatically: the library does not know what a contributed item means
 * for this application or where in its toolbar it belongs. Open the Markdown or Tools panel
 * and watch the toolbar grow; focus something else and it shrinks back.
 */
const toolbarItems = useMergedToolbarItems(() => OWN_TOOLBAR.map(item =>
  item.type === 'toggle' && item.id === 'app-taskbar'
    ? { ...item, active: taskbar.value === 'compact' }
    : item))
const sidebarTabs = useMergedSidebarTabs(OWN_TABS, ICONS.panel)

// A first layout, so the demo opens on something rather than on an empty grid.
onMounted(() => {
  ws.openPanel('mainMap', 'mainMap')
  ws.openPanel('control', 'control')
  ws.openPanel('editor', 'editor')
  ws.dockPanelToWorkspaceEdge('control', 'right')
  ws.focusPanel('mainMap')
})
</script>

<template>
  <div class="dd-shell" :dir="ws.state.dir">
    <header class="dd-topbar">
      <span class="dd-brand">vue-dockable-desktop <small>demo</small></span>

      <button type="button" data-demo-toggle-sidebar @click="showSidebar = !showSidebar">
        {{ showSidebar ? 'Hide' : 'Show' }} sidebar
      </button>
      <button type="button" @click="sidebarSide = sidebarSide === 'left' ? 'right' : 'left'">
        Sidebar: {{ sidebarSide }}
      </button>
      <button type="button" data-demo-toggle-toolbar @click="showToolbar = !showToolbar">
        {{ showToolbar ? 'Hide' : 'Show' }} toolbar
      </button>
      <select v-model="toolbarSide" data-demo-toolbar-side title="Toolbar edge">
        <option v-for="side in (['left', 'right', 'top', 'bottom'] as const)" :key="side" :value="side">
          Toolbar: {{ side }}
        </option>
      </select>

      <span class="dd-spacer" />

      <select v-model="taskbar" data-demo-taskbar title="Taskbar visibility">
        <option value="always">Taskbar: always</option>
        <option value="compact">Taskbar: compact</option>
        <option value="autohide">Taskbar: auto-hide</option>
      </select>
      <select v-model="skin" data-demo-skin title="Workspace skin">
        <option v-for="name in SKINS" :key="name" :value="name">{{ name }}</option>
      </select>
      <select v-model="locale" data-demo-locale title="Language">
        <option v-for="option in LOCALES" :key="option.id" :value="option.id">{{ option.label }}</option>
      </select>
      <label class="dd-row" style="cursor: pointer" title="The library's own transitions">
        <input v-model="animations" type="checkbox" data-demo-animations>
        <span>anim</span>
      </label>
      <button
        type="button"
        data-demo-theme
        :title="strings.theme"
        @click="scheme = scheme === 'dark' ? 'light' : 'dark'"
      >{{ scheme === 'dark' ? '☾' : '☀' }}</button>
    </header>

    <div class="dd-main" :class="{ 'dd-main--column': vertical }">
      <VddToolbar
        v-if="showToolbar && (toolbarSide === 'left' || toolbarSide === 'top')"
        :position="toolbarSide"
        :items="toolbarItems"
      />

      <VddSidebar
        v-model:active-tab-id="openTab"
        v-model:visible="showSidebar"
        class="dd-workspace"
        :position="sidebarSide"
        :tabs="sidebarTabs"
        :header-action="{
          id: 'hamburger', icon: ICONS.hamburger, label: 'Panel manager',
          onClick: () => ws.overlays.openLeftPanel(PanelManagerForm, {}, { title: 'Panel manager', width: 340 }),
        }"
        :footer-action="{
          id: 'help', icon: ICONS.help, label: 'Help',
          onClick: () => ws.openPanel('help', 'help'),
        }"
        show-close-button
      >
        <VddSecondarySidebar :tabs="[{ id: 'inspector', label: 'Inspector', icon: ICONS.eye, component: PanelManagerForm }]">
          <div class="dd-workspace">
            <VddDesktop
              :skin="skin"
              :animations="animations"
              :taskbar="taskbar"
              :default-panel-icon="ICONS.panel"
            />
          </div>
        </VddSecondarySidebar>
      </VddSidebar>

      <VddToolbar
        v-if="showToolbar && (toolbarSide === 'right' || toolbarSide === 'bottom')"
        :position="toolbarSide"
        :items="toolbarItems"
      />
    </div>

    <!-- The four hosts. Mount each once; where they sit in the tree does not matter. -->
    <VddContextMenu />
    <VddSidePanels />
    <VddModals />
    <VddToasts position="top-right" progress-bar />
  </div>
</template>
