import { computed, inject, provide } from 'vue'
import type { Component, ComputedRef, InjectionKey } from 'vue'
import { mainWindow } from '../core/panelWindow'
import type { PanelWindow } from '../core/panelWindow'
import { usePopOutWindows } from './usePopOutWindows'

const PANEL_WINDOW_KEY = Symbol('vdd-panel-window') as InjectionKey<PanelWindow>

/**
 * @internal The window panel `panelId` is in (1.14.0, rdd's `usePanelWindowOf`): its pop-out's once
 * that window's page is ready, the main one otherwise. From the same store the pop-out's frame
 * renders from (the registry's entries), so the render that shows the panel's slot in the pop-out
 * already gives the pop-out's document.
 */
export function usePanelWindowOf(panelId: string): ComputedRef<PanelWindow> {
  const popOuts = usePopOutWindows()
  return computed(() => {
    const doc = popOuts?.enabled ? popOuts.entries.value.find(e => e.id === panelId)?.doc ?? null : null
    return doc?.defaultView ? { window: doc.defaultView, document: doc } : mainWindow()
  })
}

/**
 * @internal — `VddPanelMount` tells its panel which window it is in: an object whose two fields
 * read the live value.
 */
export function providePanelWindow(current: ComputedRef<PanelWindow>): void {
  provide(PANEL_WINDOW_KEY, {
    get window() { return current.value.window },
    get document() { return current.value.document },
  })
}

/**
 * The window and document the panel is shown in (1.14.0): the pop-out's while the panel is in its
 * own window, the main ones otherwise (and outside a workspace panel, or with `popOut` off). It
 * changes when the panel pops out and when it returns, so code that listens on the window, uses
 * its `requestAnimationFrame`, `devicePixelRatio` or `matchMedia`, or creates elements, can follow.
 *
 * Reactive: its `window` and `document` fields read the live value, so read them inside a
 * `watch`, a `computed` or the template, and don't destructure them in `setup` (that reads them
 * once).
 *
 * @example
 * ```ts
 * const panelWindow = usePanelWindow()
 * watch(() => panelWindow.window, (win, _, onCleanup) => {
 *   const onResize = () => redraw(win.devicePixelRatio)
 *   win.addEventListener('resize', onResize)
 *   onCleanup(() => win.removeEventListener('resize', onResize))
 * }, { immediate: true })
 * ```
 */
export function usePanelWindow(): PanelWindow {
  return inject(PANEL_WINDOW_KEY, null) ?? mainWindow()
}

const POPOUT_WRAPPER_KEY = Symbol('vdd-popout-wrapper') as InjectionKey<() => Component | null>

/**
 * @internal — `<VddDesktop>` shares its `popoutWrapper` (null while the workspace has no pop-outs)
 * with what renders app content outside a panel's own mount: a managed widget's content (P5).
 */
export function providePopoutWrapper(get: () => Component | null): void {
  provide(POPOUT_WRAPPER_KEY, get)
}

/** @internal The desktop's `popoutWrapper` while pop-outs are on; null otherwise, or outside a desktop. */
export function usePopoutWrapper(): ComputedRef<Component | null> {
  const get = inject(POPOUT_WRAPPER_KEY, null)
  return computed(() => get?.() ?? null)
}
