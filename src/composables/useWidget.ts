/**
 * `useWidget()`: what a managed widget's own content knows about the widget (rdd 7.11.0, M5).
 *
 * `usePanel()` inside a widget's content is still the **owner** panel, so content bound to its
 * owner (a table bound to its map) keeps working wherever the widget is. This is the widget's
 * own side: where it is, and a heads-up around each move of its element.
 */
import { getCurrentScope, inject, onScopeDispose } from 'vue'
import type { ComputedRef, InjectionKey } from 'vue'
import type { WidgetLocation } from '../core/overlayState'

/**
 * What `useWidget()` returns inside a managed widget's content (7.11).
 *
 * As with `usePanel()`, what describes *state* is a ref (`location`, `panelId`), so a template
 * or a `watch` follows it; what never changes for the widget's life is a plain value.
 */
export interface WidgetHandle {
  /** The widget's id, as given to `useFloatingWidgets().open()`. */
  id: string
  /** The workspace panel that owns it, or `null` when its overlay isn't in one. */
  ownerPanelId: string | null
  /**
   * The id of the widget's own panel while it is out of its owner panel, for workspace calls
   * such as `updatePanelTitle`; `null` while it is in the panel.
   */
  panelId: ComputedRef<string | null>
  /** Where it is shown now. */
  location: ComputedRef<WidgetLocation>
  /**
   * It is in its own browser window (`useFloatingWidgets().popOut`, 1.14.0); `location` is then
   * `'floating'`. Its content's `usePanelWindow()` gives that window.
   */
  isPoppedOut: ComputedRef<boolean>
  /**
   * Called just before the widget's content element moves to another container: into or out of
   * its panel, between docked, tabbed and floating, minimised or restored, by your code, the
   * user, or a layout load. Save what a move would disturb here, such as a map's view.
   * Returns the unsubscribe function; called during `setup`, it is also disposed with the
   * component.
   */
  onWillMove(cb: () => void): () => void
  /**
   * Called once the element is in its new container and has its new size (or, with no size, as
   * when minimised, on the next frames), after every move that called `onWillMove`. Returns the
   * unsubscribe function; called during `setup`, it is also disposed with the component.
   *
   * Neither callback runs for a close, a refused move, or `move({ to: 'panel' })` while the
   * widget is already in the panel.
   */
  onMoved(cb: () => void): () => void
}

/** @internal Provided by the overlay around each managed widget's content. */
export const WIDGET_KEY = Symbol('vdd-widget') as InjectionKey<WidgetHandle>

/** @internal A subscription that is also disposed with the current scope, when there is one. */
export function scoped(off: () => void): () => void {
  if (getCurrentScope()) onScopeDispose(off)
  return off
}

/**
 * The managed widget this component is rendered in, or `null` outside one (7.11).
 *
 * ```ts
 * const widget = useWidget()
 * widget?.onWillMove(() => saveView())
 * widget?.onMoved(() => grid.value?.resize())
 * const compact = computed(() => widget?.location.value === 'panel')
 * ```
 */
export function useWidget(): WidgetHandle | null {
  return inject(WIDGET_KEY, null)
}
