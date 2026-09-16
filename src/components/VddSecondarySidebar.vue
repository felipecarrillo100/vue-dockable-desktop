<script setup lang="ts">
/**
 * A second, independent sidebar on the opposite edge — the same component, no forked code.
 *
 * Must be rendered inside a primary `<VddSidebar>`'s default slot; it takes whichever side
 * that primary is not using, so the side is never specified directly.
 */
import { computed, inject } from 'vue'
import { SIDEBAR_KEY } from '../core/sidebarTypes'
import type { SidebarProps } from '../core/sidebarTypes'
import VddSidebar from './VddSidebar.vue'

/** Everything the primary accepts, except the two it decides for itself. */
const props = defineProps<Omit<SidebarProps, 'position' | 'isSecondary'>>()

const primary = inject(SIDEBAR_KEY, null)
if (!primary) {
  throw new Error(
    '[vue-dockable-desktop] <VddSecondarySidebar> must be rendered inside a <VddSidebar>. ' +
    'It takes the edge the primary sidebar is not using, so it needs one to be nested in.',
  )
}
if (primary.isSecondary) {
  throw new Error(
    '[vue-dockable-desktop] <VddSecondarySidebar> cannot be nested inside another one. ' +
    'The library supports one primary and one secondary sidebar, nothing deeper.',
  )
}

const opposite = computed<'left' | 'right'>(() => (primary!.position === 'left' ? 'right' : 'left'))
</script>

<template>
  <!-- `$attrs` carries the model listeners (`onUpdate:activeTabId` and friends) through. -->
  <VddSidebar v-bind="{ ...props, ...$attrs }" :position="opposite" is-secondary>
    <template v-for="(_, name) in $slots" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </VddSidebar>
</template>
