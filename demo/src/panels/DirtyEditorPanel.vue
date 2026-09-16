<script setup lang="ts">
/**
 * The ordinary case: an editor that is dirty while it has unsaved edits.
 *
 * Also the case for `onSaveState()`. A panel's open-time props cannot describe what the user
 * has typed since, so `saveLayout()` pulls this panel's *current* content from the provider
 * below — fresh on every save, not captured once.
 */
import { computed, ref, watch } from 'vue'
import { usePanel } from 'vue-dockable-desktop'

const DEFAULT = '# Notes\n\nType here. The tab goes dirty; Save clears it.\n'

const panel = usePanel()
const content = ref(DEFAULT)
const saved = ref(DEFAULT)

const dirty = computed(() => content.value !== saved.value)
watch(dirty, (value) => panel.setDirty(value))

/** Pulled on every `saveLayout()`, so a restored layout brings the text back. */
panel.onSaveState(() => ({ content: content.value }))

function save(): void {
  saved.value = content.value
}
</script>

<template>
  <div class="dd-panel dd-col" style="height: 100%">
    <div class="dd-row">
      <button type="button" data-demo-save :disabled="!dirty" @click="save">Save</button>
      <button type="button" @click="content = saved">Revert</button>
      <span class="dd-note" style="margin: 0">{{ dirty ? 'unsaved changes' : 'saved' }}</span>
    </div>
    <textarea
      v-model="content"
      data-demo-editor
      spellcheck="false"
      style="flex: 1; min-height: 120px; width: 100%; resize: none; font-family: ui-monospace, monospace; font-size: 0.78rem"
    />
    <p class="dd-note">
      Save the layout from the Control Center, reload the page and restore it — this text comes
      back, because <code>onSaveState()</code> contributed it.
    </p>
  </div>
</template>
