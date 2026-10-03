<script setup lang="ts">
/**
 * Review page for the toolbar button spec (1.6.0, from rdd 7.5.0): every buttonVariant in every
 * state, over light, dark and busy content, with live controls for the icon size tokens. The icons
 * deliberately keep width="16" height="16" attributes — the library's tokens must override them.
 */
import { h, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { VddPanelOverlay, VddPanelToolbar, VddToolbarButton, VddToolbarSeparator, VddToolbarToggle } from 'vue-dockable-desktop'
import type { ButtonVariant, ToolbarVariant } from 'vue-dockable-desktop'

const icon = (inner: string) => () => h('svg', {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', innerHTML: inner,
})
const SaveIcon = icon('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>')
const GridIcon = icon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>')
const LayersIcon = icon('<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>')
const RulerIcon = icon('<path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="m7.5 10.5 2 2M10.5 7.5l2 2M13.5 13.5l2 2M16.5 10.5l2 2"/>')
const ClockIcon = icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>')
const TrashIcon = icon('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>')

const VARIANTS: ButtonVariant[] = ['ghost', 'soft', 'outlined', 'filled']
const BACKGROUNDS: Record<string, string> = {
  light: '#eef1f4',
  dark: '#101217',
  busy:
    'radial-gradient(circle at 15% 30%, #f6d365 0 12%, transparent 13%),' +
    'radial-gradient(circle at 70% 60%, #3a6073 0 18%, transparent 19%),' +
    'repeating-linear-gradient(45deg, #fafafa 0 14px, #1d2b3a 14px 28px, #7fb069 28px 42px)',
}

const strip = ref<ToolbarVariant>('transparent')
const bg = ref('busy')
const panelIcon = ref(20)
const chromeIcon = ref(22)
const solidToggle = ref(false)
// One set of toggle states per variant row.
const states = reactive(Object.fromEntries(VARIANTS.map(v => [v, { grid: true, layers: false, ruler: true, clock: false, star: true }])))

/** Sets a token on every element that declares skin tokens, so the value wins over the skin's own. */
function setToken(name: string, value: string | null): void {
  const targets = [document.documentElement, ...Array.from(document.querySelectorAll<HTMLElement>('[data-vdd-skin]'))]
  for (const el of targets) {
    if (value === null) el.style.removeProperty(name)
    else el.style.setProperty(name, value)
  }
}
watch(panelIcon, v => setToken('--vdd-panel-toolbar-icon-size', `${v}px`), { immediate: true })
watch(chromeIcon, v => setToken('--vdd-chrome-icon-size', `${v}px`), { immediate: true })
watch(solidToggle, on => {
  // Alternative workspace-toggle "on" look, for comparison: the same solid chip the panel toolbar uses.
  setToken('--vdd-toolbar-btn-toggle-active-bg', on ? 'var(--vdd-panel-toolbar-btn-active-bg)' : null)
  setToken('--vdd-toolbar-btn-toggle-active-color', on ? 'var(--vdd-panel-toolbar-btn-active-color)' : null)
  setToken('--vdd-toolbar-btn-toggle-active-border', on ? 'transparent' : null)
})
// Leave the workspace as we found it when the panel closes.
onBeforeUnmount(() => {
  for (const t of ['--vdd-panel-toolbar-icon-size', '--vdd-chrome-icon-size', '--vdd-toolbar-btn-toggle-active-bg',
    '--vdd-toolbar-btn-toggle-active-color', '--vdd-toolbar-btn-toggle-active-border']) setToken(t, null)
})
</script>

<template>
  <div class="tb-review">
    <div class="tb-controls">
      <label>Strip
        <select v-model="strip">
          <option value="transparent">transparent</option>
          <option value="frosted">frosted</option>
          <option value="solid">solid</option>
        </select>
      </label>
      <label>Content
        <select v-model="bg">
          <option
            v-for="k in Object.keys(BACKGROUNDS)"
            :key="k"
            :value="k"
          >{{ k }}</option>
        </select>
      </label>
      <label>Panel icon {{ panelIcon }}px <input
        v-model.number="panelIcon"
        type="range"
        min="14"
        max="24"
      ></label>
      <label>Chrome icon {{ chromeIcon }}px <input
        v-model.number="chromeIcon"
        type="range"
        min="14"
        max="26"
      ></label>
      <label><input
        v-model="solidToggle"
        type="checkbox"
      > Workspace toggle "on": solid (instead of tint + edge)</label>
    </div>
    <div class="tb-grid">
      <div
        v-for="v in VARIANTS"
        :key="v"
      >
        <div class="tb-caption">
          button-variant="{{ v }}"
        </div>
        <div
          class="tb-stage"
          :style="{ background: BACKGROUNDS[bg] }"
        >
          <VddPanelOverlay>
            <VddPanelToolbar
              position="top"
              :variant="strip"
              :button-variant="v"
            >
              <VddToolbarButton title="Save (action)">
                <SaveIcon />
              </VddToolbarButton>
              <VddToolbarToggle
                v-model:active="states[v].grid"
                title="Grid (toggle)"
              >
                <GridIcon />
              </VddToolbarToggle>
              <VddToolbarToggle
                v-model:active="states[v].layers"
                title="Layers (toggle)"
              >
                <LayersIcon />
              </VddToolbarToggle>
              <VddToolbarToggle
                v-model:active="states[v].ruler"
                title="Ruler (toggle)"
              >
                <RulerIcon />
              </VddToolbarToggle>
              <VddToolbarToggle
                v-model:active="states[v].clock"
                title="Time (toggle)"
              >
                <ClockIcon />
              </VddToolbarToggle>
              <VddToolbarSeparator />
              <VddToolbarToggle
                v-model:active="states[v].star"
                title="Font glyph (toggle)"
              >
                <i
                  aria-hidden="true"
                  style="font-style: normal"
                >★</i>
              </VddToolbarToggle>
              <VddToolbarButton
                title="Delete (disabled)"
                disabled
              >
                <TrashIcon />
              </VddToolbarButton>
              <VddToolbarToggle
                :active="true"
                title="Toggle on, disabled"
                disabled
              >
                <GridIcon />
              </VddToolbarToggle>
            </VddPanelToolbar>
          </VddPanelOverlay>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tb-review { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.tb-controls { display: flex; flex-wrap: wrap; gap: 16px; padding: 8px 12px; align-items: center; font-size: 12px; }
.tb-controls label { display: flex; align-items: center; gap: 6px; }
.tb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 12px; padding: 12px; }
.tb-caption { font-size: 12px; opacity: 0.7; margin-bottom: 4px; }
.tb-stage { position: relative; height: 120px; border-radius: 6px; overflow: hidden; }
</style>
