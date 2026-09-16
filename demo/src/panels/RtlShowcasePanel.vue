<script setup lang="ts">
/**
 * What reverses under RTL, and what does not.
 *
 * The distinction the library draws: layout is expressed in **logical** properties, so it
 * mirrors for free; content direction is the application's business. An anchored window
 * records `top-left` meaning *inline-start*, which is why a layout saved in Arabic and
 * restored in English puts anchored windows on the mirror-image side — the correct reading of
 * "it was at the start of the line".
 */
import { computed } from 'vue'
import { useWorkspace } from 'vue-dockable-desktop'

const ws = useWorkspace()
const rtl = computed(() => ws.state.isRtl)

const MIRRORS = [
  ['Drop zones', 'The left target becomes the right one'],
  ['Tab order', 'And the overflow scroll direction with it'],
  ['Corner anchors', 'Stored logically, so they mirror on restore'],
  ['Resize handles', 'A pinned inline end frees the opposite physical side'],
  ['Sidebar and toolbar edges', 'Via inset-inline-start / -end'],
  ['Context menus and submenus', 'A submenu opens away from its parent'],
]
const STAYS = [
  ['The block axis', 'Top stays top; only the inline axis mirrors'],
  ['Panel content', 'Yours to lay out — the library sets dir and stops there'],
  ['Saved geometry', 'A free-floating window keeps its explicit x/y'],
]
</script>

<template>
  <div class="dd-panel">
    <div class="dd-section">
      <h5>Direction</h5>
      <div class="dd-row">
        <button type="button" data-demo-rtl @click="ws.setDirection(rtl ? 'ltr' : 'rtl')">
          Switch to {{ rtl ? 'LTR' : 'RTL' }}
        </button>
        <code>{{ ws.state.dir }}</code>
      </div>
      <p class="dd-note">
        Also switched by picking العربية in the top bar, which is the realistic case: the
        locale decides the direction.
      </p>
    </div>

    <div class="dd-section">
      <h5>Mirrors automatically</h5>
      <dl class="dd-kv">
        <template v-for="[what, why] in MIRRORS" :key="what">
          <dt>{{ what }}</dt><dd style="font-family: inherit; opacity: 0.8">{{ why }}</dd>
        </template>
      </dl>
    </div>

    <div class="dd-section">
      <h5>Deliberately does not</h5>
      <dl class="dd-kv">
        <template v-for="[what, why] in STAYS" :key="what">
          <dt>{{ what }}</dt><dd style="font-family: inherit; opacity: 0.8">{{ why }}</dd>
        </template>
      </dl>
    </div>

    <div
      class="dd-section"
      style="padding: 0.5rem 0.7rem; border-radius: 6px; border: 1px solid var(--vdd-border-color, rgba(255,255,255,0.12))"
    >
      <h5>Try it</h5>
      <p class="dd-note" style="margin: 0">
        Switch direction, then drag this panel's tab towards a workspace edge. The drop targets
        have swapped sides. Float a panel into a corner, save the layout, switch direction and
        restore it: the window is on the other side, because its anchor was stored logically.
      </p>
    </div>
  </div>
</template>
