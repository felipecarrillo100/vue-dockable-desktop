<script setup lang="ts">
/**
 * Monaco in a dockable panel — the sharpest demonstration of zero-unmount preservation.
 *
 * An editor is expensive to create and holds a great deal of state a user would notice
 * losing: the model, the undo stack, the cursor, the selection, folded regions, the scroll
 * position. Drag this panel to another group, float it, minimise it and restore it: all of it
 * survives, because the panel's DOM is *moved* rather than re-rendered (ADR 0002).
 *
 * Type something, undo it after a dock — the undo history is still there.
 */
import { computed, ref, useTemplateRef } from 'vue'
import { useColorScheme, usePanel, usePanelContextMenu } from 'vue-dockable-desktop'
import { useMonaco } from '../composables/useMonaco'

const SAMPLE = `import { createApp } from 'vue'
import { createWorkspace, VddDesktop } from 'vue-dockable-desktop'
import 'vue-dockable-desktop/styles.css'

// The store is live before any component, so this is the whole setup.
const workspace = createWorkspace({
  panels: {
    editor: { component: CodeEditorPanel, defaultOptions: { title: 'Editor' } },
    map: { component: MapPanel, defaultOptions: { title: 'Map', canClose: false } },
  },
})

createApp(App).use(workspace).mount('#app')

// ...and from anywhere at all, including outside a component:
workspace.openPanel('editor-1', 'editor')
workspace.floatPanel('editor-1', { x: 80, y: 60, width: 520, height: 360 })
`

const source = ref(SAMPLE)
const host = useTemplateRef<HTMLDivElement>('host')
const scheme = useColorScheme()
const panel = usePanel()

// The editor follows the workspace's own colour scheme, read from the attribute the
// application sets. No prop threading.
const theme = computed(() => (scheme.value === 'light' ? 'vs' : 'vs-dark'))
useMonaco(host, source, { language: 'typescript', theme })

// The panel contributes to its own context menu — on its tab, its title bar and its taskbar
// icon — and the items are re-read every time the menu opens, so `disabled` tracks state.
usePanelContextMenu(() => [
  { label: 'Format document', action: () => { source.value = source.value.replace(/\s+$/gm, '') } },
  { label: 'Reset to sample', action: () => { source.value = SAMPLE }, disabled: source.value === SAMPLE },
  { separator: true },
  { label: 'Word wrap', checkbox: { value: wrap.value }, action: () => { wrap.value = !wrap.value } },
])

const wrap = ref(false)
const lines = computed(() => source.value.split('\n').length)
void panel
</script>

<template>
  <div class="dd-panel dd-panel--flush" style="display: flex; flex-direction: column">
    <div ref="host" class="dd-monaco" data-demo-monaco style="flex: 1; min-height: 0" />
    <div
      style="flex-shrink: 0; padding: 0.2rem 0.6rem; font: 0.68rem ui-monospace, monospace;
             opacity: 0.55; border-block-start: 1px solid rgba(255,255,255,0.08)"
    >
      TypeScript · {{ lines }} lines · undo history survives every dock
    </div>
  </div>
</template>
