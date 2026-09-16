<script setup lang="ts">
/**
 * The Control Center: every capability of the library, driven from one panel.
 *
 * Its own point is that it is an ordinary panel. Everything it does — opening panels,
 * floating them, saving the layout, raising modals and toasts — it does through the same
 * `useWorkspace()` any component gets, with no privileged access and no provider.
 */
import { computed, ref } from 'vue'
import { markRaw } from 'vue'
import { toast, useModals, useSidePanels, useWorkspace } from 'vue-dockable-desktop'
import PanelManagerForm from '../forms/PanelManagerForm.vue'

type Tab = 'tour' | 'layout' | 'overlays' | 'events'

const ws = useWorkspace()
const modals = useModals()
const panels = useSidePanels()
const tab = ref<Tab>('tour')
const TABS: [Tab, string][] = [
  ['tour', 'Tour'], ['layout', 'Layout'], ['overlays', 'Overlays'], ['events', 'Events'],
]

// ── live state, read straight from the store ───────────────────────────────
const openIds = computed(() => Object.keys(ws.state.panels))
const floating = computed(() => ws.state.floating.length)
const minimized = computed(() => ws.state.minimized.length)
const active = computed(() => ws.state.activePanelId ?? '—')

// ── the event log ──────────────────────────────────────────────────────────
const log = ref<{ event: string; id: string }[]>([])
for (const event of ['panel:opened', 'panel:closed', 'panel:minimized', 'panel:restored', 'panel:activated', 'layout:changed'] as const) {
  // Subscribed in `setup`, so each is disposed with this panel — `useWorkspace()` wraps
  // `subscribe` for exactly that.
  ws.subscribe(event, (data: unknown) => {
    const id = (data as { id?: string }).id ?? ''
    log.value = [{ event, id }, ...log.value].slice(0, 14)
  })
}

// ── the tour checklist ─────────────────────────────────────────────────────
const done = ref<Record<string, boolean>>({})
const STEPS: [string, string][] = [
  ['drag', 'Drag a tab onto another group\'s edge to split it'],
  ['float', 'Drag a tab into the middle of the workspace to float it'],
  ['anchor', 'Drag a floating window into a corner to anchor it'],
  ['minimise', 'Minimise a panel, then hover its taskbar icon'],
  ['dirty', 'Mark the Intercept Form dirty, then close its tab'],
  ['drawer', 'Open a side drawer, then press Escape'],
  ['save', 'Save the layout, reload the page, restore it'],
]
const progress = computed(() => STEPS.filter(([id]) => done.value[id]).length)

// ── actions ────────────────────────────────────────────────────────────────
const KINDS = ['editor', 'markdownEditor', 'mainMap', 'leafletMap', 'layers', 'tools', 'table', 'terminal', 'preview', 'help', 'timeControl', 'overview', 'dirtyForm', 'dirtyEditor', 'rtl']

function openKind(kind: string): void {
  const existing = Object.values(ws.state.panels).filter(p => p.component === kind).length
  ws.openPanel(existing === 0 ? kind : `${kind}-${existing + 1}`, kind)
}

const LAYOUT_KEY = 'vdd-demo-layout'
function saveLayout(): void {
  localStorage.setItem(LAYOUT_KEY, ws.saveLayout())
  done.value.save = true
  toast.success('Layout saved to localStorage')
}
function restoreLayout(): void {
  const saved = localStorage.getItem(LAYOUT_KEY)
  if (!saved) { toast.warning('Nothing saved yet'); return }
  // Loaded once, into a variable. Calling `loadLayout` inside both halves of the message
  // expression loaded it twice — harmless-looking, and it applied the whole layout again.
  const ok = ws.loadLayout(saved)
  if (ok) toast.success('Layout restored')
  else toast.error('Could not restore that layout')
}
function clearLayout(): void {
  localStorage.removeItem(LAYOUT_KEY)
  toast.info('Saved layout cleared')
}

const Manager = markRaw(PanelManagerForm)
</script>

<template>
  <div class="dd-panel dd-col" style="gap: 0.7rem">
    <div class="dd-row" role="tablist">
      <button
        v-for="[id, label] in TABS"
        :key="id"
        type="button"
        role="tab"
        :aria-selected="tab === id"
        :data-demo-cc-tab="id"
        :style="{ opacity: tab === id ? 1 : 0.55 }"
        @click="tab = id"
      >{{ label }}</button>
    </div>

    <!-- ── Tour ───────────────────────────────────────────────────────── -->
    <template v-if="tab === 'tour'">
      <div class="dd-section">
        <h5>Try these — {{ progress }}/{{ STEPS.length }}</h5>
        <div class="dd-col" style="gap: 0.2rem">
          <label v-for="[id, text] in STEPS" :key="id" class="dd-row" style="cursor: pointer">
            <input v-model="done[id]" type="checkbox">
            <span :style="{ opacity: done[id] ? 0.5 : 1, textDecoration: done[id] ? 'line-through' : 'none' }">
              {{ text }}
            </span>
          </label>
        </div>
      </div>
      <p class="dd-note">
        Every one of these is also a method call — this panel makes them from the same
        <code>useWorkspace()</code> your own components get.
      </p>
    </template>

    <!-- ── Layout ─────────────────────────────────────────────────────── -->
    <template v-else-if="tab === 'layout'">
      <div class="dd-section">
        <h5>Open a panel</h5>
        <div class="dd-grid">
          <button
            v-for="kind in KINDS"
            :key="kind"
            type="button"
            :data-demo-open="kind"
            @click="openKind(kind)"
          >{{ ws.format(ws.registry.get(kind)?.defaultOptions?.title) || kind }}</button>
        </div>
        <p class="dd-note">Opening the same kind again gives a second instance, with its own state.</p>
      </div>

      <div class="dd-section">
        <h5>Place the active panel</h5>
        <div class="dd-row">
          <button type="button" data-demo-float :disabled="active === '—'" @click="ws.floatPanel(active); done.float = true">Float</button>
          <button type="button" :disabled="active === '—'" @click="ws.dockPanel(active)">Dock</button>
          <button type="button" data-demo-minimise :disabled="active === '—'" @click="ws.minimizePanel(active); done.minimise = true">Minimise</button>
          <button type="button" :disabled="active === '—'" @click="ws.maximizePanel(active)">Maximise</button>
        </div>
        <div class="dd-row" style="margin-top: 0.3rem">
          <button v-for="edge in (['left', 'right', 'top', 'bottom'] as const)" :key="edge" type="button" :disabled="active === '—'" @click="ws.dockPanelToWorkspaceEdge(active, edge)">
            → {{ edge }} edge
          </button>
        </div>
      </div>

      <div class="dd-section">
        <h5>Persistence</h5>
        <div class="dd-row">
          <button type="button" data-demo-save-layout @click="saveLayout">Save layout</button>
          <button type="button" data-demo-restore-layout @click="restoreLayout">Restore</button>
          <button type="button" @click="clearLayout">Clear</button>
        </div>
        <p class="dd-note">
          Saved as JSON to <code>localStorage</code>. Reload the page and restore it: the grid,
          the floating rects, the minimised set, the active tab and each panel's own saved
          state all come back — and the format is byte-compatible with
          react-dockable-desktop's, so a layout saved there loads here.
        </p>
      </div>
    </template>

    <!-- ── Overlays ───────────────────────────────────────────────────── -->
    <template v-else-if="tab === 'overlays'">
      <div class="dd-section">
        <h5>Drawers</h5>
        <div class="dd-row">
          <button type="button" data-demo-left-drawer @click="panels.openLeft(Manager, {}, { title: 'Panel manager', width: 340 }); done.drawer = true">
            Left drawer
          </button>
          <button type="button" data-demo-right-drawer @click="panels.openRight(Manager, {}, { title: 'Panel manager', width: 340 })">
            Right drawer
          </button>
          <button type="button" @click="panels.closeAll()">Close drawers</button>
        </div>
        <p class="dd-note">Escape closes a drawer — but only when no modal is open above it.</p>
      </div>

      <div class="dd-section">
        <h5>Modals</h5>
        <div class="dd-row">
          <button type="button" data-demo-modal @click="modals.open(Manager, {}, { title: 'Panel manager', size: 'medium' })">Modal</button>
          <button type="button" @click="modals.open(Manager, {}, { title: 'Stacked', size: 'small' })">Stack another</button>
          <button type="button" @click="modals.closeAll()">Close all</button>
        </div>
      </div>

      <div class="dd-section">
        <h5>Toasts</h5>
        <div class="dd-row">
          <button type="button" data-demo-toast @click="toast.info('An informational message')">info</button>
          <button type="button" @click="toast.success('Saved successfully')">success</button>
          <button type="button" @click="toast.warning('Check the highlighted fields')">warning</button>
          <button type="button" @click="toast.error('Upload failed', { duration: 0 })">error (sticky)</button>
          <button
            type="button"
            @click="toast.promise(new Promise(r => setTimeout(r, 1400)), { pending: 'Uploading…', success: 'Uploaded', error: 'Failed' })"
          >promise</button>
        </div>
        <p class="dd-note">
          <code>toast</code> is a plain import, not a hook — callable from a service or an
          error handler, with nothing injected.
        </p>
      </div>
    </template>

    <!-- ── Events ─────────────────────────────────────────────────────── -->
    <template v-else>
      <div class="dd-section">
        <h5>Workspace state</h5>
        <dl class="dd-kv">
          <dt>active</dt><dd data-demo-active>{{ active }}</dd>
          <dt>open</dt><dd>{{ openIds.length }}</dd>
          <dt>floating</dt><dd>{{ floating }}</dd>
          <dt>minimised</dt><dd>{{ minimized }}</dd>
          <dt>direction</dt><dd>{{ ws.state.dir }}</dd>
        </dl>
        <p class="dd-note">
          Read from the store directly. <code>activePanelId</code> never names a panel you
          cannot see — every action that could invalidate it resolves it through one path.
        </p>
      </div>

      <div class="dd-section">
        <h5>Event bus</h5>
        <div class="dd-col" style="gap: 0.1rem; font: 0.7rem ui-monospace, monospace">
          <div v-for="(entry, index) in log" :key="index" class="dd-row" style="gap: 0.5rem">
            <span style="opacity: 0.55; min-width: 9.5rem">{{ entry.event }}</span>
            <span>{{ entry.id }}</span>
          </div>
          <p v-if="log.length === 0" class="dd-note">Open or close a panel to see events here.</p>
        </div>
      </div>
    </template>
  </div>
</template>
