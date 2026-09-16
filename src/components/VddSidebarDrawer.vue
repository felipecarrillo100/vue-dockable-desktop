<script setup lang="ts">
/**
 * The drawer: one pane per mounted tab, only the open one displayed.
 *
 * Panes are hidden with `display: none` rather than unmounted, which is what makes
 * `preserveState` mean anything — and why a tab that asked for neither `eagerMount` nor
 * `preserveState` is dropped from the mounted set when the drawer closes.
 */
import type { SidebarTab } from '../core/sidebarTypes'
import VddSidebarTabScope from './VddSidebarTabScope.vue'

const props = defineProps<{
  tabs: SidebarTab[]
  activeTabId: string | null
  position: 'left' | 'right'
  open: boolean
  width: number
  minWidth: number
  maxWidth: number
  /** Suppress the library's own header for every tab. */
  headerOverridden: boolean
  showCloseButton: boolean
  /** No transition while a resize drag is in flight, or the drawer lags the pointer. */
  resizing: boolean
}>()

const emit = defineEmits<{ close: []; open: [id: string] }>()
void props
</script>

<template>
  <div
    class="vdd-sidebar-content-drawer"
    :class="`vdd-${position}`"
    data-vdd-sidebar-drawer
    :style="{
      flexBasis: open ? `${width}px` : '0px',
      minWidth: open ? `${minWidth}px` : '0px',
      maxWidth: open ? `${maxWidth}px` : '0px',
      ...(resizing ? { transition: 'none' } : {}),
    }"
  >
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="vdd-sidebar-drawer-pane"
      :style="{ display: activeTabId === tab.id ? 'flex' : 'none' }"
      :data-vdd-sidebar-pane="tab.id"
    >
      <slot v-if="headerOverridden" name="header" :tab="tab" :close="() => emit('close')" :open="() => emit('open', tab.id)" />
      <div v-else class="vdd-sidebar-drawer-header">
        <span class="vdd-sidebar-header-title">{{ tab.label }}</span>
        <button
          v-if="showCloseButton"
          type="button"
          class="vdd-sidebar-drawer-close-button"
          data-vdd-sidebar-close
          title="Close"
          aria-label="Close"
          @click="emit('close')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!--
        Each pane provides its own tab context, so `useSidebarTab()` inside a tab's content
        knows which tab it is without being told. A wrapper component is needed because
        `provide` is per component instance, and these panes are siblings in one.
      -->
      <VddSidebarTabScope
        class="vdd-sidebar-drawer-body"
        :tab-id="tab.id"
        @close="emit('close')"
        @open="emit('open', $event)"
      >
        <slot
          :name="`tab-${tab.id}`"
          :tab="tab"
          :close="() => emit('close')"
          :open="() => emit('open', tab.id)"
        >
          <component :is="tab.component" v-if="tab.component" v-bind="tab.props" />
        </slot>
      </VddSidebarTabScope>
    </div>
  </div>
</template>
