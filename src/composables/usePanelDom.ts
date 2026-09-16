import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { PanelDomCache } from '../core/panelDom'

export const PANEL_DOM_KEY = Symbol('vdd-panel-dom') as InjectionKey<PanelDomCache>

/** @internal — `<VddDesktop>` owns the cache and shares it with the slots inside it. */
export function providePanelDom(cache: PanelDomCache): void {
  provide(PANEL_DOM_KEY, cache)
}

/** @internal */
export function usePanelDom(): PanelDomCache | null {
  return inject(PANEL_DOM_KEY, null)
}
