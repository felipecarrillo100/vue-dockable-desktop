<script setup lang="ts">
/**
 * A strip of tool buttons on any edge.
 *
 * rdd exposed `show`/`hide`/`toggle` through a ref; here visibility is a model. Items stay
 * data — a toolbar is configuration, not markup — so an rdd `items` array transfers verbatim
 * (docs/decisions/0007-slots-over-render-props.md).
 */
import { computed } from 'vue'
import type { ToolbarItem } from '../core/toolbarTypes'
import { useWorkspace } from '../composables/useWorkspace'
import VddToolbarGroupButton from './VddToolbarGroupButton.vue'

const props = withDefaults(defineProps<{
  /** Which edge to attach to; also decides the strip's orientation. @default 'left' */
  position?: 'left' | 'right' | 'top' | 'bottom'
  items: ToolbarItem[]
}>(), { position: 'left' })

/** Collapse the strip to nothing. State is kept — items are not unmounted. */
const visible = defineModel<boolean>('visible', { default: true })

const ws = useWorkspace()
const isVertical = computed(() => props.position === 'left' || props.position === 'right')

/**
 * Only the collapsed size is set inline.
 *
 * The open size belongs to the stylesheet, including its coarse-pointer override — hard-coding
 * it here would quietly undo the larger touch targets.
 */
const collapseStyle = computed(() => visible.value !== false
  ? {}
  : isVertical.value ? { width: '0px' } : { height: '0px' })

const isRadioActive = (group: string, id: string) => ws.toolbar.activeInGroup(group) === id

function activateRadio(group: string, id: string, onActivate?: (id: string) => void): void {
  ws.toolbar.setActiveInGroup(group, id)
  onActivate?.(id)
}

/** A toggle is controlled when `active` is present at all, `false` included. */
const isToggleOn = (item: Extract<ToolbarItem, { type: 'toggle' }>) =>
  item.active !== undefined ? item.active : ws.toolbar.isToggled(item.id)

function flipToggle(item: Extract<ToolbarItem, { type: 'toggle' }>): void {
  const next = !isToggleOn(item)
  if (item.active === undefined) ws.toolbar.setToggled(item.id, next)
  item.onToggle?.(next)
}
</script>

<template>
  <div
    class="vdd-toolbar-strip"
    :class="`vdd-${position}`"
    :style="collapseStyle"
    :data-vdd-toolbar="position"
    role="toolbar"
    :aria-orientation="isVertical ? 'vertical' : 'horizontal'"
  >
    <template v-for="(item, index) in items" :key="item.type === 'separator' ? `sep-${index}` : item.id">
      <div v-if="item.type === 'separator'" class="vdd-toolbar-separator" role="separator" />

      <button
        v-else-if="item.type === 'action'"
        type="button"
        class="vdd-toolbar-btn vdd-toolbar-btn-action"
        :title="item.label"
        :aria-label="item.label"
        :disabled="item.disabled"
        :data-vdd-toolbar-item="item.id"
        @click="item.onClick()"
      ><component :is="item.icon" /></button>

      <button
        v-else-if="item.type === 'radio'"
        type="button"
        class="vdd-toolbar-btn vdd-toolbar-btn-radio"
        :class="{ 'vdd-active': isRadioActive(item.group, item.id) }"
        :title="item.label"
        :aria-label="item.label"
        :aria-pressed="isRadioActive(item.group, item.id)"
        :disabled="item.disabled"
        :data-vdd-toolbar-item="item.id"
        @click="activateRadio(item.group, item.id, item.onActivate)"
      ><component :is="item.icon" /></button>

      <button
        v-else-if="item.type === 'toggle'"
        type="button"
        class="vdd-toolbar-btn vdd-toolbar-btn-toggle"
        :class="{ 'vdd-active': isToggleOn(item) }"
        :title="item.label"
        :aria-label="item.label"
        :aria-pressed="isToggleOn(item)"
        :disabled="item.disabled"
        :data-vdd-toolbar-item="item.id"
        @click="flipToggle(item)"
      ><component :is="item.icon" /></button>

      <VddToolbarGroupButton
        v-else-if="item.type === 'group'"
        :item="item"
        :position="position"
      />
    </template>
  </div>
</template>
