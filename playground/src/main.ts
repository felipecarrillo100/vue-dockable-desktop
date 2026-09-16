import { createApp, h, markRaw } from 'vue'
import { createWorkspace } from 'vue-dockable-desktop'
import '../../src/index.css'
import App from './App.vue'
import HostilePanel from './HostilePanel.vue'
import OverlayPanel from './OverlayPanel.vue'

const workspace = createWorkspace({
  panels: {
    hostile: { component: HostilePanel, defaultOptions: { title: 'Hostile' } },
    overlay: { component: OverlayPanel, defaultOptions: { title: 'Overlay' } },
    // A panel with an icon: the tab's and the window titlebar's icon slots each have their
    // own rule, and neither renders for a panel that has no icon.
    // A panel that opts out of the live preview, so the taskbar's letter fallback renders.
    quiet: {
      component: HostilePanel,
      defaultOptions: { title: 'Quiet panel', disableLivePreview: true },
    },
    icony: {
      component: HostilePanel,
      defaultOptions: {
        title: 'With icon',
        icon: markRaw({ name: 'Glyph', render: () => h('svg', { width: 12, height: 12 }, [h('rect', { width: 12, height: 12 })]) }),
      },
    },
  },
  initialState: JSON.stringify({
    version: 2,
    gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
      { type: 'leaf', id: 'L', panels: [], activePanelId: null },
      { type: 'leaf', id: 'R', panels: [], activePanelId: null } ] },
    floating: [], minimized: [], panels: {},
  }),
})

// The gates drive the library through this handle, so they exercise the same public API an
// application would, not test-only shortcuts.
;(window as unknown as { __vdd: unknown }).__vdd = workspace

createApp(App).use(workspace).mount('#app')
