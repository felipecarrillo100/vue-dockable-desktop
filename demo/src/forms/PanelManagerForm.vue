<script setup lang="ts">
/**
 * A panel manager, as a side panel or a modal.
 *
 * Lists every registered panel kind and every open instance, and drives each with the same
 * API a click on a tab uses. Its point in the demo is that it is *not* a panel: it is a form
 * opened into a drawer or a modal, and it reaches the workspace through `useWorkspace()`
 * exactly as a panel does — there is no second API for chrome.
 */
import { computed, ref } from 'vue'
import { usePanel, useWorkspace } from 'vue-dockable-desktop'

const ws = useWorkspace()
const panel = usePanel()
const query = ref('')

interface Row {
  kind: string
  title: string
  openIds: string[]
}

const rows = computed<Row[]>(() => {
  const term = query.value.trim().toLowerCase()
  return ws.registry.keys()
    .map((kind) => {
      const entry = ws.registry.get(kind)
      return {
        kind,
        title: ws.format(entry?.defaultOptions?.title) || kind,
        openIds: Object.values(ws.state.panels).filter(p => p.component === kind).map(p => p.id),
      }
    })
    .filter(row => !term || row.kind.toLowerCase().includes(term) || row.title.toLowerCase().includes(term))
})

const openCount = computed(() => Object.keys(ws.state.panels).length)

/** Opening the same kind twice gives a second instance, with its own id. */
function open(kind: string): void {
  const existing = Object.values(ws.state.panels).filter(p => p.component === kind).length
  ws.openPanel(`${kind}-${existing + 1}`, kind)
}
</script>

<template>
  <div class="dd-panel dd-col" style="gap: 0.7rem">
    <div class="dd-row" style="justify-content: space-between">
      <strong style="font-size: 0.85rem">Panel manager</strong>
      <span class="dd-note" style="margin: 0">
        {{ ws.registry.keys().length }} registered · {{ openCount }} open
      </span>
    </div>

    <input v-model="query" type="text" placeholder="Filter…" data-demo-manager-filter style="width: 100%">

    <div class="dd-col" style="gap: 0.35rem">
      <div
        v-for="row in rows"
        :key="row.kind"
        style="padding: 0.4rem 0.5rem; border-radius: 5px;
               border: 1px solid var(--vdd-border-color, rgba(255,255,255,0.1))"
      >
        <div class="dd-row" style="justify-content: space-between">
          <span>
            <strong style="font-size: 0.78rem">{{ row.title }}</strong>
            <code style="opacity: 0.5; font-size: 0.68rem; margin-inline-start: 0.35rem">{{ row.kind }}</code>
          </span>
          <button type="button" :data-demo-open-kind="row.kind" @click="open(row.kind)">Open</button>
        </div>

        <div v-if="row.openIds.length" class="dd-row" style="margin-top: 0.3rem">
          <span
            v-for="id in row.openIds"
            :key="id"
            class="dd-row"
            style="gap: 0.15rem; font-size: 0.7rem; font-family: ui-monospace, monospace"
          >
            <code>{{ id }}</code>
            <button type="button" title="Focus" @click="ws.focusPanel(id)">◎</button>
            <button type="button" title="Float" @click="ws.floatPanel(id)">⧉</button>
            <button type="button" title="Minimise" @click="ws.minimizePanel(id)">▁</button>
            <button type="button" title="Close" @click="ws.requestClosePanel(id)">×</button>
          </span>
        </div>
      </div>
    </div>

    <div class="dd-row">
      <button type="button" data-demo-manager-close @click="panel.close()">Close this form</button>
    </div>
    <p class="dd-note">
      Opened as a drawer or a modal, this form uses the same <code>useWorkspace()</code> a
      panel does, and <code>usePanel()</code> to close itself without knowing which kind of
      container it is in.
    </p>
  </div>
</template>
