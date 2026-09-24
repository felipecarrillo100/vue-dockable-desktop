<script setup lang="ts">
/**
 * A collapsed tool family: one button, and a flyout listing its sub-tools.
 *
 * The flyout is teleported to `document.body` so the strip's own `overflow: hidden` cannot
 * clip it, then clamped back inside the viewport once it has a size.
 */
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import type { ToolbarGroupItem } from '../core/toolbarTypes'
import { flyoutPlacement, isSubItem } from '../core/toolbarTypes'
import { useWorkspace } from '../composables/useWorkspace'
import { claimEscape, isEscapeClaimed } from '../core/escape'
import { isRtlElement } from '../core/dragResize'

const props = defineProps<{
  item: ToolbarGroupItem
  position: 'left' | 'right' | 'top' | 'bottom'
}>()

const ws = useWorkspace()
const button = useTemplateRef<HTMLButtonElement>('button')
const flyout = useTemplateRef<HTMLDivElement>('flyout')
const open = ref(false)
const placement = ref<Record<string, number>>({})

/** Controlled when the prop is present at all — `null` means "nothing selected", not "unset". */
const controlled = computed(() => props.item.activeItemId !== undefined)
const activeId = computed(() => controlled.value
  ? props.item.activeItemId ?? null
  : ws.toolbar.activeInGroup(props.item.id))

const activeSub = computed(() => props.item.items.find(e => isSubItem(e) && e.id === activeId.value))
/** The button wears the selected tool's icon, so the strip shows the state while collapsed. */
const icon = computed(() => (activeSub.value && isSubItem(activeSub.value) ? activeSub.value.icon : props.item.defaultIcon))
const label = computed(() => (activeSub.value && isSubItem(activeSub.value) ? activeSub.value.label : props.item.label))

async function toggle(): Promise<void> {
  if (props.item.disabled) return
  if (open.value) { open.value = false; return }
  const rect = button.value?.getBoundingClientRect()
  if (rect) {
    // The strip's own direction, not the workspace's: the strip sits outside the workspace
    // and follows the host page, so the two can differ.
    placement.value = flyoutPlacement(rect, props.position,
      { width: window.innerWidth, height: window.innerHeight }, isRtlElement(button.value))
  }
  open.value = true
  await nextTick()
  clampIntoView()
  document.addEventListener('pointerdown', onOutside, { capture: true })
  document.addEventListener('keydown', onKey, { capture: true })
}

function close(): void {
  open.value = false
  document.removeEventListener('pointerdown', onOutside, { capture: true })
  document.removeEventListener('keydown', onKey, { capture: true })
}

/** Nudge the flyout back on screen. It is positioned before it has a size, so this is a second pass. */
function clampIntoView(): void {
  const el = flyout.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const pad = 8
  const next = { ...placement.value }
  if (rect.right > window.innerWidth - pad) { next.left = Math.max(pad, window.innerWidth - rect.width - pad); delete next.right }
  if (rect.left < pad) { next.left = pad; delete next.right }
  if (rect.bottom > window.innerHeight - pad) { next.top = Math.max(pad, window.innerHeight - rect.height - pad); delete next.bottom }
  if (rect.top < pad) { next.top = pad; delete next.bottom }
  placement.value = next
}

function onOutside(event: Event): void {
  const target = event.target
  if (!(target instanceof Node)) { close(); return }
  if (button.value?.contains(target) || flyout.value?.contains(target)) return
  close()
}
/**
 * Capture phase and a claim, so Escape closes the flyout and nothing else — a modal or drawer
 * the strip sits in listens on `document` too (see `../core/escape`).
 */
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !isEscapeClaimed(event)) { claimEscape(event); close() }
}

function select(id: string, onActivate?: (id: string) => void): void {
  if (controlled.value) props.item.onActiveItemChange?.(id)
  else ws.toolbar.setActiveInGroup(props.item.id, id)
  onActivate?.(id)
  close()
}

onBeforeUnmount(close)

const style = computed(() => {
  const css: Record<string, string> = { position: 'fixed' }
  for (const [key, value] of Object.entries(placement.value)) css[key] = `${value}px`
  return css
})
</script>

<template>
  <button
    ref="button"
    type="button"
    class="vdd-toolbar-btn vdd-toolbar-btn-group"
    :class="{ 'vdd-active': activeId !== null }"
    :title="label"
    :aria-label="label"
    :aria-expanded="open"
    aria-haspopup="menu"
    :disabled="item.disabled"
    :data-vdd-toolbar-item="item.id"
    @click="toggle"
  ><component :is="icon" /></button>

  <Teleport v-if="open" to="body">
    <div
      ref="flyout"
      class="vdd-toolbar-group-flyout"
      :class="`vdd-${position}`"
      :style="style"
      :dir="ws.state.dir"
      :data-vdd-flyout="item.id"
      role="menu"
    >
      <template v-for="(entry, index) in item.items" :key="index">
        <div v-if="!isSubItem(entry)" class="vdd-toolbar-group-flyout-sep" role="separator" />
        <button
          v-else
          type="button"
          class="vdd-toolbar-group-flyout-item"
          :class="{ 'vdd-active': activeId === entry.id }"
          :disabled="entry.disabled"
          role="menuitem"
          :aria-pressed="activeId === entry.id"
          :data-vdd-flyout-item="entry.id"
          @click="select(entry.id, entry.onActivate)"
        >
          <span class="vdd-toolbar-group-flyout-icon"><component :is="entry.icon" /></span>
          <span class="vdd-toolbar-group-flyout-label">{{ entry.label }}</span>
          <span v-if="entry.shortcut" class="vdd-toolbar-group-flyout-shortcut">{{ entry.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>
