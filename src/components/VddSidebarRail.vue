<script setup lang="ts">
/**
 * The activity strip: header entries, the tab buttons, footer entries.
 *
 * Its own component so the left and right arrangements share one implementation. Writing it
 * twice inside the parent is how the two sides drift apart.
 */
import type { SidebarRailEntry, SidebarTab } from '../core/sidebarTypes'
import { isActionButton, isCustomEntry } from '../core/sidebarTypes'

const props = defineProps<{
  tabs: SidebarTab[]
  header: SidebarRailEntry[]
  footer: SidebarRailEntry[]
  activeTabId: string | null
  position: 'left' | 'right'
  visible: boolean
}>()

const emit = defineEmits<{ select: [id: string] }>()

/** The strip's fixed width. The outer box animates between this and zero. */
const STRIP_PX = 56
const shownTabs = (list: SidebarTab[]) => list.filter(t => !t.hidden)
void props
</script>

<template>
  <div
    class="vdd-sidebar-strip-outer"
    :style="{ width: visible ? `${STRIP_PX}px` : '0px' }"
    data-vdd-sidebar-strip
  >
    <div
      class="vdd-sidebar-tabs-strip"
      :class="[`vdd-${position}`, {
        'vdd-sidebar-tabs-strip--has-header-action': header.length > 0,
        'vdd-sidebar-tabs-strip--has-footer-action': footer.length > 0,
      }]"
      :style="{ width: `${STRIP_PX}px` }"
    >
      <template v-for="area in (['header', 'tabs', 'footer'] as const)" :key="area">
        <div v-if="area === 'tabs'" class="vdd-sidebar-tabs-list">
          <button
            v-for="tab in shownTabs(tabs)"
            :key="tab.id"
            type="button"
            class="vdd-sidebar-tab-btn"
            :class="{ 'vdd-active': activeTabId === tab.id }"
            :title="tab.label"
            :aria-pressed="activeTabId === tab.id"
            :data-vdd-sidebar-tab="tab.id"
            @click="emit('select', tab.id)"
          ><component :is="tab.icon" /></button>
        </div>

        <div
          v-else-if="(area === 'header' ? header : footer).length"
          :class="area === 'header' ? 'vdd-sidebar-header-area' : 'vdd-sidebar-footer-area'"
        >
          <template v-for="(entry, index) in (area === 'header' ? header : footer)" :key="index">
            <!-- a caller-rendered entry goes out exactly as given, unwrapped -->
            <component :is="entry.component" v-if="isCustomEntry(entry)" v-bind="entry.props" />

            <button
              v-else-if="isActionButton(entry)"
              type="button"
              class="vdd-sidebar-tab-btn vdd-sidebar-header-action-btn"
              :disabled="entry.disabled"
              :title="entry.label"
              :aria-label="entry.label"
              :data-vdd-rail-action="entry.id ?? entry.label"
              @click="entry.onClick()"
            ><component :is="entry.icon" /></button>

            <!-- a tab pinned to an area behaves exactly like one from the main list -->
            <button
              v-else-if="!entry.hidden"
              type="button"
              class="vdd-sidebar-tab-btn"
              :class="{ 'vdd-active': activeTabId === entry.id }"
              :title="entry.label"
              :aria-pressed="activeTabId === entry.id"
              :data-vdd-sidebar-tab="entry.id"
              @click="emit('select', entry.id)"
            ><component :is="entry.icon" /></button>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
