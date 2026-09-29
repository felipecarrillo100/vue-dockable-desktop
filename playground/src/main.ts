import { createApp, h, markRaw } from 'vue'
import { createWorkspace } from 'vue-dockable-desktop'
import '../../src/index.css'
import App from './App.vue'
import HostilePanel from './HostilePanel.vue'
import OverlayPanel from './OverlayPanel.vue'

// Set before mount, as an application would (the M15 branding gate): `?cs=light` puts
// `data-color-scheme="light"` on <html> (dark is the attribute's absence); `?ba=HEX` / `?bon=HEX`
// set `--vdd-brand-accent` / `--vdd-brand-on-accent` on :root (hex without `#`).
const params = new URLSearchParams(location.search)
if (params.get('cs') === 'light') document.documentElement.setAttribute('data-color-scheme', 'light')
if (params.get('ba')) document.documentElement.style.setProperty('--vdd-brand-accent', `#${params.get('ba')}`)
if (params.get('bon')) document.documentElement.style.setProperty('--vdd-brand-on-accent', `#${params.get('bon')}`)
// The M16 gate: `?bs=HEX` / `?bt=HEX` set --vdd-brand-surface / --vdd-brand-text, `?rs=N` --vdd-radius-scale.
if (params.get('bs')) document.documentElement.style.setProperty('--vdd-brand-surface', `#${params.get('bs')}`)
if (params.get('bt')) document.documentElement.style.setProperty('--vdd-brand-text', `#${params.get('bt')}`)
if (params.get('rs')) document.documentElement.style.setProperty('--vdd-radius-scale', params.get('rs')!)

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
