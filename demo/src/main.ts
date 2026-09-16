import { createApp, ref } from 'vue'
import { createWorkspace } from 'vue-dockable-desktop'
import 'vue-dockable-desktop/styles.css'
import './demo.css'

import App from './App.vue'
import { ICONS } from './icons'
import { createFormatter } from './i18n/messages'
import type { Locale } from './i18n/messages'

import CodeEditorPanel from './panels/CodeEditorPanel.vue'
import MarkdownEditorPanel from './panels/MarkdownEditorPanel.vue'
import MainMapPanel from './panels/MainMapPanel.vue'
import LeafletMapPanel from './panels/LeafletMapPanel.vue'
import LayerTreePanel from './panels/LayerTreePanel.vue'
import ToolPanel from './panels/ToolPanel.vue'
import TablePanel from './panels/TablePanel.vue'
import TerminalPanel from './panels/TerminalPanel.vue'
import PreviewPanel from './panels/PreviewPanel.vue'
import HelpPanel from './panels/HelpPanel.vue'
import TimeControlPanel from './panels/TimeControlPanel.vue'
import OverviewMapPanel from './panels/OverviewMapPanel.vue'
import ControlCenterPanel from './panels/ControlCenterPanel.vue'
import DirtyFormPanel from './panels/DirtyFormPanel.vue'
import DirtyEditorPanel from './panels/DirtyEditorPanel.vue'
import RtlShowcasePanel from './panels/RtlShowcasePanel.vue'

/**
 * The locale lives outside the workspace, because the workspace only needs a *formatter* —
 * `(descriptor) => string`. Holding the locale in a ref and closing over it is the whole
 * integration: the library re-reads through the function on every render, so switching locale
 * needs nothing else.
 */
const locale = ref<Locale>('en')

const workspace = createWorkspace({
  formatMessage: createFormatter(() => locale.value),

  panels: {
    control: { component: ControlCenterPanel, defaultOptions: { title: 'Control Center', icon: ICONS.rocket } },
    editor: { component: CodeEditorPanel, defaultOptions: { title: 'Code Editor', icon: ICONS.code } },
    markdownEditor: { component: MarkdownEditorPanel, defaultOptions: { title: 'Markdown', icon: ICONS.document } },

    // The workspace's primary view: not closable, and not worth scaling into a thumbnail.
    mainMap: {
      component: MainMapPanel,
      defaultOptions: { title: 'Main Map', icon: ICONS.map, canClose: false, disableLivePreview: true },
    },
    leafletMap: {
      component: LeafletMapPanel,
      defaultOptions: { title: 'Leaflet Map', icon: ICONS.globe, disableLivePreview: true },
    },

    layers: { component: LayerTreePanel, defaultOptions: { title: 'Layers', icon: ICONS.layers } },
    tools: { component: ToolPanel, defaultOptions: { title: 'Tools', icon: ICONS.tools } },
    table: { component: TablePanel, defaultOptions: { title: 'Assets', icon: ICONS.table } },
    terminal: { component: TerminalPanel, defaultOptions: { title: 'Terminal', icon: ICONS.terminal } },
    preview: { component: PreviewPanel, defaultOptions: { title: 'Preview', icon: ICONS.eye } },
    help: { component: HelpPanel, defaultOptions: { title: 'Help', icon: ICONS.help } },
    timeControl: { component: TimeControlPanel, defaultOptions: { title: 'Timeline', icon: ICONS.clock } },
    overview: { component: OverviewMapPanel, defaultOptions: { title: 'Locator', icon: ICONS.locator } },

    dirtyForm: {
      component: DirtyFormPanel,
      defaultOptions: { title: 'Intercept Form', icon: ICONS.warning, initialTarget: 'floating' },
    },
    dirtyEditor: { component: DirtyEditorPanel, defaultOptions: { title: 'Notes', icon: ICONS.pencil } },
    rtl: { component: RtlShowcasePanel, defaultOptions: { title: 'RTL', icon: ICONS.rtl } },
  },
})

// The demo's own handle, so a browser gate can drive it the way a user would — through the
// public API rather than through test-only shortcuts.
;(window as unknown as Record<string, unknown>).__demo = { workspace, locale }

createApp(App).use(workspace).provide('demo-locale', locale).mount('#app')
