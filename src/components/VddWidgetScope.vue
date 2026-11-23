<script setup lang="ts">
/**
 * Provides `useWidget()` to one managed widget's content (7.11), and calls its `onMoved`
 * callbacks whenever its element has landed in another container. Internal; rdd's
 * `WidgetScope`. Rendered inside the widget's Teleport, so it lives exactly as long as the
 * content does.
 *
 * Since 1.14.0 it also gives the content its window: its own panel's while it is out of its owner
 * panel (in the page, or in a pop-out window of its own), else its owner's. With pop-outs on, the
 * app's `popoutWrapper` is around it too, for its whole life, so a CSS-in-JS cache follows the
 * widget into its window. Its content is then inside two wrappers (the owner panel's and this
 * one); the inner one wins.
 */
import { computed, provide, watch } from 'vue'
import type { WidgetHostingPort, WidgetLocation } from '../core/overlayState'
import { WIDGET_KEY, scoped } from '../composables/useWidget'
import type { WidgetHandle } from '../composables/useWidget'
import { providePanelWindow, usePanelWindow, usePopoutWrapper } from '../composables/usePanelWindow'
import { usePopOutWindows } from '../composables/usePopOutWindows'
import { mainWindow } from '../core/panelWindow'
import type { PanelWindow } from '../core/panelWindow'
import VddPopoutWrap from './popoutWrap'

const props = defineProps<{
  widgetId: string
  hosting: WidgetHostingPort
}>()

// The id is the v-for key around this component: fixed for its life.
const id = props.widgetId
const key = computed(() => props.hosting.keyOf(id))

// After the render that moved the element: it is in its new container (or gone home).
watch(key, () => props.hosting.settled(id), { flush: 'post' })

// Its own panel's id while it is out of its panel; a widget in the panel has none.
const panelId = computed(() => props.hosting.hostedIds[id] ?? null)

const handle: WidgetHandle = {
  id,
  ownerPanelId: props.hosting.ownerPanelId,
  panelId,
  location: computed(() => key.value.split('|')[0] as WidgetLocation),
  isPoppedOut: computed(() => key.value === 'floating|out'),
  onWillMove: cb => scoped(props.hosting.listen(id, 'will', cb)),
  onMoved: cb => scoped(props.hosting.listen(id, 'moved', cb)),
}
provide(WIDGET_KEY, handle)

// The window its content is in (1.14.0): from the registry's entries, the store the pop-out's
// frame renders from, so it switches in the render that shows the hosted panel's slot there.
const ownerWindow = usePanelWindow()
const popOuts = usePopOutWindows()
const panelWindow = computed<PanelWindow>(() => {
  const own = panelId.value
  if (!own) return { window: ownerWindow.window, document: ownerWindow.document }
  const doc = popOuts?.enabled ? popOuts.entries.value.find(e => e.id === own)?.doc ?? null : null
  return doc?.defaultView ? { window: doc.defaultView, document: doc } : mainWindow()
})
providePanelWindow(panelWindow)
const wrapper = usePopoutWrapper()
</script>

<template>
  <!-- The app's component from the desktop, stable across renders: not one made here. -->
  <VddPopoutWrap
    :wrapper="wrapper"
    :win="panelWindow.window"
    :doc="panelWindow.document"
  >
    <slot />
  </VddPopoutWrap>
</template>
