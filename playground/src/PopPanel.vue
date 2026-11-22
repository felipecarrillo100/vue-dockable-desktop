<script setup lang="ts">
/**
 * `?po=1` (the M18 gate, 1.14.0): a panel that can pop out, with state, a scroll offset and a
 * WebGL context to keep. Inline layout, so it fills its slot whatever the window's stylesheets
 * (P3 copies the page's; its #po-fill also carries the gate's "sheet added later" marker). With `?po2=1`, `pp`'s #po-pop-q pops `pq` out: a click inside pp's
 * window once it is out (rdd 7.12.1).
 */
import { onMounted, ref, useTemplateRef } from 'vue'
import { toast, usePanel, useWorkspace } from 'vue-dockable-desktop'
import { rcIcon, useRcClass } from './runtimeCss'

defineProps<{ panelId?: string }>()

const { id } = usePanel()
const ws = useWorkspace()
const count = ref(0)
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const po2 = new URLSearchParams(location.search).get('po2') === '1'
const w = window as unknown as { __poLost: number; __poGl: WebGLRenderingContext | null; __poqResult: unknown; __poMounts?: number }
// ?rc=1 (P4): content styled by the runtime CSS-in-JS stand-in, a menu item's and a toast's icon too.
const rc = new URLSearchParams(location.search).get('rc') === '1'
const rcContent = useRcClass('content', 'color: rgb(10, 20, 30); letter-spacing: 3px; border-bottom: 2px solid rgb(40, 50, 60);')
const menuIcon = rcIcon('menu')
const toastIcon = rcIcon('toast')
function openMenu(event: MouseEvent): void {
  ws.showContextMenu({ event, items: [{ label: 'Rc item', icon: menuIcon, action: () => {} }] })
}
function raiseToast(): void {
  toast('from pp', { icon: toastIcon, duration: 0 })
}

onMounted(() => {
  if (id !== 'pp') return
  w.__poMounts = (w.__poMounts ?? 0) + 1
  w.__poLost = 0
  canvas.value!.addEventListener('webglcontextlost', () => { w.__poLost += 1 })
  w.__poGl = canvas.value!.getContext('webgl')
})
</script>

<template>
  <!-- Fills its slot, with a scroller taking the rest, as a map or a table would. -->
  <div :id="id === 'pp' ? 'po-fill' : undefined" style="height: 100%; display: flex; flex-direction: column">
    <div>
      <button :id="id === 'pp' ? 'po-inc' : undefined" @click="count++">+</button>
      <span :id="id === 'pp' ? 'po-count' : undefined">{{ count }}</span>
      <canvas ref="canvas" width="40" height="20" />
      <button v-if="id === 'pp' && po2" id="po-pop-q" @click="w.__poqResult = ws.popOutPanel('pq')">pop q</button>
      <template v-if="id === 'pp' && rc">
        <span id="po-rc" :class="rcContent">styled</span>
        <!-- `.stop`: the menu dismisses on a click reaching the window, this one included. -->
        <button id="po-menu" @click.stop="openMenu">menu</button>
        <button id="po-toast" @click="raiseToast">toast</button>
      </template>
    </div>
    <div :id="id === 'pp' ? 'po-sc' : undefined" style="flex: 1; min-height: 0; overflow: auto">
      <div style="height: 3000px">scroll</div>
    </div>
  </div>
</template>
