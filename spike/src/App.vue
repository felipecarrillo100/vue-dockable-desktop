<script setup lang="ts">
import { computed, nextTick, reactive, ref, shallowReactive, watch } from 'vue'
import HostilePanel from './panels/HostilePanel.vue'
import { cacheEl, moveCacheEl, rememberIfVisible, applyRemembered, hiddenContainer, type Strategy } from './persistence'

const PANELS = ['p1', 'p2'] as const
type HostName = 'leafA' | 'leafB' | 'floating' | 'hidden'

const strategy = ref<Strategy>('cache')
/** Where each panel currently lives — the only state that drives placement. */
const placement = reactive<Record<string, HostName>>({ p1: 'leafA', p2: 'leafB' })
/** Which panel is "active" — ADR 0014 only refocuses the active one. */
const activeId = ref('p1')

/**
 * shallowReactive, not reactive: `reactive()` deep-proxies its values, and a Proxy of a DOM
 * element is not the element — `appendChild` on it throws, and identity comparisons fail.
 * Shallow keeps property access reactive while storing the raw nodes.
 */
const hostEls = shallowReactive<Record<HostName, HTMLElement | null>>({
  leafA: null, leafB: null, floating: null, hidden: null,
})

function hostElFor(name: HostName): HTMLElement | null {
  return name === 'hidden' ? hiddenContainer() : hostEls[name]
}

/** S2 target: the host element itself, so Vue moves the nodes when `to` changes. */
function teleportTarget(id: string): HTMLElement | null {
  return strategy.value === 'cache' ? cacheEl(id) : hostElFor(placement[id])
}

/**
 * S1: move the cache element whenever a panel's *resolved target element* changes.
 *
 * Watching `placement` alone is not enough: on the first (immediate) run the host `ref`
 * callbacks have not fired yet, so every target is null and every panel would be parked in
 * the hidden container with nothing left to re-trigger the move. Watching the resolved
 * elements means the refs arriving is itself a change.
 */
watch(
  () => PANELS.map(id => hostElFor(placement[id])),
  (next, prev) => {
    if (strategy.value !== 'cache') return
    PANELS.forEach((id, i) => {
      if (!prev || next[i] !== prev[i]) moveCacheEl(id, next[i], activeId.value === id)
    })
  },
  { immediate: true, flush: 'post' },
)

// S2: Vue moves the nodes; we still have to preserve scroll/focus around it (ADR 0014).
async function moveTeleport(id: string, to: HostName) {
  const el = document.querySelector(`[data-panel="${id}"]`) as HTMLElement | null
  if (el) rememberIfVisible(id, el)
  placement[id] = to
  await nextTick()
  const after = document.querySelector(`[data-panel="${id}"]`) as HTMLElement | null
  if (after) applyRemembered(id, after, activeId.value === id)
}

async function move(id: string, to: HostName) {
  if (strategy.value === 'teleport') await moveTeleport(id, to)
  else placement[id] = to
}

async function setStrategy(s: Strategy) {
  strategy.value = s
  // Re-home everything under the new strategy, then clear the other strategy's residue.
  await nextTick()
  if (s === 'cache') for (const id of PANELS) moveCacheEl(id, hostElFor(placement[id]), false)
  await nextTick()
}

const inLeafA = computed(() => PANELS.filter(id => placement[id] === 'leafA'))
const inLeafB = computed(() => PANELS.filter(id => placement[id] === 'leafB'))

// Exposed for the Playwright harness, so the gate drives the same code paths the UI does.
;(window as any).__spike = {
  move, setStrategy,
  setActive: (id: string) => { activeId.value = id },
  placement, strategy,
  get mounts() { return (window as any).__mounts ?? {} },
  get unmounts() { return (window as any).__unmounts ?? {} },
}
</script>

<template>
  <div>
    <div class="row" style="align-items:center">
      <b>M0 spike</b>
      <span>strategy:</span>
      <button v-for="s in (['cache','teleport'] as Strategy[])" :key="s"
              :disabled="strategy === s" @click="setStrategy(s)">{{ s }}</button>
      <span>active: {{ activeId }}</span>
      <button v-for="id in PANELS" :key="id" @click="activeId = id">activate {{ id }}</button>
    </div>

    <div class="row">
      <div class="host" :ref="el => hostEls.leafA = el as HTMLElement">
        <h4>leaf A — {{ inLeafA.join(', ') || 'empty' }}</h4>
      </div>
      <div class="host" :ref="el => hostEls.leafB = el as HTMLElement">
        <h4>leaf B — {{ inLeafB.join(', ') || 'empty' }}</h4>
      </div>
    </div>

    <div class="row">
      <div v-for="id in PANELS" :key="id">
        <span>{{ id }}:</span>
        <button v-for="h in (['leafA','leafB','floating','hidden'] as HostName[])" :key="h"
                :disabled="placement[id] === h" @click="move(id, h)">{{ h }}</button>
      </div>
    </div>

    <div class="floating" :ref="el => hostEls.floating = el as HTMLElement">
      <h4>floating</h4>
    </div>

    <!--
      The persistence port: every panel is rendered here exactly once, for the whole
      session, and teleported to wherever it currently belongs. Nothing here is ever
      conditionally rendered — that is the entire zero-unmount mechanism.
    -->
    <div style="display:none">
      <template v-for="id in PANELS" :key="id">
        <Teleport v-if="teleportTarget(id)" :to="teleportTarget(id)!">
          <HostilePanel :id="id" />
        </Teleport>
      </template>
    </div>
  </div>
</template>
