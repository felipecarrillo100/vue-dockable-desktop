import { createApp, h, markRaw } from 'vue'
import { createWorkspace, toast } from 'vue-dockable-desktop'
import '../../src/index.css'
import App from './App.vue'
import HostilePanel from './HostilePanel.vue'
import OverlayPanel from './OverlayPanel.vue'
import EmbedFrame from './EmbedFrame.vue'
import PopPanel from './PopPanel.vue'
import { rcIcon } from './runtimeCss'
import { unsizedIcon } from './unsizedIcon'

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

// The M18 gate (1.14.0): `?po=1` gives the workspace pop-out windows and opens `pp` (type
// `popper`, canPopOut) as a tab beside `p1`; `?po2=1` adds `pq`, another tab there. `?pourl=1` makes
// the playground's own popout.html the pop-out page (App.vue).
const POPOUT = params.get('po') === '1'
// `?rc=1` (P4): `popper`'s icon is styled only by the runtime CSS-in-JS stand-in (runtimeCss.ts), so
// the pop-out frame's icon shows whether the app's popoutWrapper is around the frame.
const RC = params.get('rc') === '1'
// `?poico=1` (rdd 7.12.2): `popper`'s icon takes its size from its box (unsizedIcon.ts).
const POICO = params.get('poico') === '1'
// `?wo=1` (P5): the overlay panel `ov` docked beside p1, with a managed widget `wo` (canPopOut, a
// titleMenu) opened in it (WidgetsProbe.vue); `?opo=1`: the overlay type can pop out too, and its
// #wo-po-in pops the widget out from inside the overlay (rdd 7.12.1's harness `opo=1`).
const WO = params.get('wo') === '1'
const OPO = params.get('opo') === '1'

const workspace = createWorkspace({
  popOut: POPOUT,
  panels: {
    popper: { component: PopPanel, defaultOptions: { title: 'Pop', canPopOut: true, ...(RC ? { icon: rcIcon('frame') } : POICO ? { icon: unsizedIcon } : {}) } },
    // M11 gate (7.11): an iframe in a panel type with preserveEmbeds, and one without.
    // The iframe's name comes from the panel's props.
    embedKept: { component: EmbedFrame, defaultOptions: { title: 'Kept', preserveEmbeds: true } },
    embedBare: { component: EmbedFrame, defaultOptions: { title: 'Bare' } },
    hostile: { component: HostilePanel, defaultOptions: { title: 'Hostile' } },
    overlay: { component: OverlayPanel, defaultOptions: { title: 'Overlay', ...(OPO ? { canPopOut: true } : {}) } },
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
  // `?po=1` starts from one group, as rdd's harness does: no kept-empty group in its splits.
  initialState: JSON.stringify({
    version: 2,
    gridRoot: POPOUT
      ? { type: 'leaf', id: 'L', panels: [], activePanelId: null }
      : { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
          { type: 'leaf', id: 'L', panels: [], activePanelId: null },
          { type: 'leaf', id: 'R', panels: [], activePanelId: null } ] },
    floating: [], minimized: [], panels: {},
  }),
})

// The gates drive the library through this handle, so they exercise the same public API an
// application would, not test-only shortcuts.
;(window as unknown as { __vdd: unknown }).__vdd = workspace
// The M18 gate's focus case (P6) raises a toast from the page: which window it shows in.
;(window as unknown as { __toast: unknown }).__toast = toast

createApp(App).use(workspace).mount('#app')

if (POPOUT) {
  workspace.openPanel('p1', 'hostile', { title: 'Panel One' })
  workspace.openPanel('pp', 'popper', { title: 'Pop', dockTo: { panel: 'p1', position: 'center' } })
  if (params.get('po2') === '1') workspace.openPanel('pq', 'popper', { title: 'Pop Q', dockTo: { panel: 'p1', position: 'center' } })
  if (WO) workspace.openPanel('ov', 'overlay', { title: 'Overlay', dockTo: { panel: 'p1', position: 'right' } })
}
