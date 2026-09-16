<script setup lang="ts">
/**
 * Dirty state and close interception — every path a close can take.
 *
 * The four behaviours worth trying in order:
 *
 *  1. Mark it dirty, then close the tab. The library asks before discarding, through its own
 *     dialog, in whatever locale the demo is set to.
 *  2. Turn on the guard and close. `onBeforeClose` returns `false`, so nothing happens — a
 *     guard takes precedence over the dirty question.
 *  3. Type a title. The tab, the window title bar and the taskbar icon all follow.
 *  4. Force-close. Skips the guard *and* the question, which is what a "discard" button does.
 *
 * rdd needed `useFormContainer()` and an `onCloseRequested` subscription with its own cleanup
 * for this; here it is `usePanel()`, a ref, and a guard disposed with the component.
 */
import { ref, watch } from 'vue'
import { usePanel } from 'vue-dockable-desktop'

const panel = usePanel()
const dirty = ref(false)
const guarded = ref(false)
const title = ref('')
const blocked = ref(0)

watch(dirty, (value) => panel.setDirty(value))
watch(title, (value) => panel.setTitle(value || 'Intercept Form'))

/**
 * Registered once, and it reads `guarded` when it runs rather than when it was registered —
 * so the switch works without re-registering anything. rdd re-ran an effect to swap the
 * handler, and had to return its cleanup.
 */
panel.onBeforeClose(() => {
  if (!guarded.value) return true
  blocked.value += 1
  return false
})
</script>

<template>
  <div class="dd-panel dd-col" style="gap: 0.9rem">
    <div class="dd-section">
      <h5>1 · Unsaved changes</h5>
      <div class="dd-row">
        <button type="button" data-demo-dirty @click="dirty = !dirty">
          {{ dirty ? '🔴 Dirty' : '🟢 Clean' }}
        </button>
        <span class="dd-note" style="margin: 0">
          <code>usePanel().setDirty()</code> — the tab shows an asterisk
        </span>
      </div>
      <p class="dd-note">
        While dirty, closing asks first — the tab's ×, the taskbar menu, Escape on a drawer and
        <code>close()</code> all route through the same question, so none of them can discard
        silently.
      </p>
    </div>

    <div class="dd-section">
      <h5>2 · A close guard</h5>
      <label class="dd-row" style="cursor: pointer">
        <input v-model="guarded" type="checkbox" data-demo-guard>
        <span>Block closing entirely</span>
      </label>
      <p class="dd-note">
        <code>onBeforeClose()</code> returning <code>false</code>. Blocked
        <strong>{{ blocked }}</strong> attempt(s) so far. A guard wins over the dirty
        question, so the dialog never appears.
      </p>
    </div>

    <div class="dd-section">
      <h5>3 · A live title</h5>
      <input v-model="title" type="text" placeholder="Type a new panel title…" data-demo-title style="width: 100%">
      <p class="dd-note">The tab, a floating title bar and the taskbar icon all follow it.</p>
    </div>

    <div class="dd-section">
      <h5>4 · Closing programmatically</h5>
      <div class="dd-row">
        <button type="button" data-demo-close @click="panel.close()">Close</button>
        <button type="button" data-demo-force-close @click="panel.close({ force: true })">Force close</button>
      </div>
      <p class="dd-note">Force skips the guard and the dirty question both.</p>
    </div>
  </div>
</template>
