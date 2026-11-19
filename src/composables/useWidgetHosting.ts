/**
 * Moving a panel overlay's managed widgets out of their owner panel and back (rdd 7.11.0).
 *
 * A widget out of its panel is shown by a **hosted panel**: a workspace panel of the reserved kind
 * `'vdd:widget'`, owned by this overlay, whose body shows the widget's content element. The
 * content itself stays rendered by the overlay, in the owner panel's tree (its `<Teleport>` into
 * the element never moves), so nothing remounts and it keeps every injection from its owner.
 *
 * This overlay owns its hosted panels: it opens and removes them, closes the widget when the user
 * closes one, and removes them all when it unmounts (the owner closed). A hosted panel that goes
 * without the overlay asking (only `loadLayout` does that) sends its widget home.
 *
 * rdd's `useWidgetHosting` hook; one instance per `<VddPanelOverlay>`. Internal.
 */
import { inject, nextTick, onBeforeUnmount, reactive, watch } from 'vue'
import { WORKSPACE_KEY } from '../core/workspace'
import { PANEL_KEY } from './usePanel'
import { usePanelDom } from './usePanelDom'
import { optionsFor } from '../core/panelOptions'
import { findLeafForPanel } from '../core/layoutTree'
import type { HostedPanelPlacement, Label, LayoutNode, PanelInfo } from '../types'
import type { ContextMenuItem } from '../core/contextMenu'
import type { OutTarget } from '../core/widgetPlacement'
import type {
  ManagedWidget, MoveResult, PanelOverlayStore, WidgetHostingPort, WidgetLocation, WidgetTarget,
} from '../core/overlayState'

type Rect = { x: number; y: number; width: number; height: number }

/**
 * Which container a widget is in, as a string that changes exactly when its element moves: the
 * location plus, in the grid, the group. `hostedId` is undefined while the widget is in the panel.
 * The location is its first part. M5's `onMoved` settles on a change of it.
 */
export function containerKey(
  state: { panels: Record<string, PanelInfo>; gridRoot: LayoutNode },
  hostedId: string | undefined,
  ownerId: string,
): string {
  const panel = hostedId ? state.panels[hostedId] : undefined
  if (!hostedId || !panel) return 'panel'
  if (panel.state === 'floating') return 'floating'
  if (panel.state === 'minimized') return 'minimized'
  const leaf = findLeafForPanel(state.gridRoot, hostedId)
  return `${leaf === findLeafForPanel(state.gridRoot, ownerId) ? 'tabbed' : 'docked'}|${leaf ?? ''}`
}

const num = (v: number | string | undefined): v is number => typeof v === 'number'

/** A widget's own capabilities, as its hosted panel's options (7.11, M4). Both `false` unless set. */
const capabilities = (widget: ManagedWidget): { canFloat: boolean; canDock: boolean } =>
  ({ canFloat: widget.canFloat ?? false, canDock: widget.canDock ?? false })

export function useWidgetHosting(store: PanelOverlayStore): WidgetHostingPort {
  const ws = inject(WORKSPACE_KEY, null)
  const dom = usePanelDom()
  // The owner panel's id. A modal or side panel provides a panel context too, but its id is not
  // in the layout, so move() refuses there as it does outside any panel.
  const ownerId = inject(PANEL_KEY, null)?.id ?? null

  const hostedIds = reactive<Record<string, string>>({})
  /**
   * The same record, read synchronously, with each hosted panel's close-handler unregister, the
   * container it was put in (`key`, for M5: a replace that lands in the same container still has
   * to settle `onMoved` itself), and the last move's target (`target`, for `placement()`: what
   * the grid alone can't say, which side and how big).
   */
  const hosted = new Map<string, { panelId: string; unregister: () => void; key: string; target: WidgetTarget }>()
  /** Each widget's `onWillMove` / `onMoved` callbacks (7.11, M5). */
  const listeners = new Map<string, { will: Set<() => void>; moved: Set<() => void> }>()
  const fire = (id: string, kind: 'will' | 'moved'): void => {
    listeners.get(id)?.[kind].forEach(cb => cb())
  }

  /** `onMoved`, once: on the element's first size in its new container, else after two frames. */
  const settled = (id: string): void => {
    const el = store.content.get(id)
    if (!el) return
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      observer?.disconnect()
      fire(id, 'moved')
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      if (entries.some(e => e.contentRect.width > 0 && e.contentRect.height > 0)) finish()
    })
    observer?.observe(el)
    const frame = typeof requestAnimationFrame === 'undefined'
      ? (cb: () => void) => setTimeout(cb, 16)
      : requestAnimationFrame
    frame(() => frame(finish))
  }

  /** Forgets a widget's hosted panel; removes it from the workspace unless it is already gone. */
  const detach = (id: string, remove: boolean): void => {
    const entry = hosted.get(id)
    if (!entry) return
    hosted.delete(id)
    entry.unregister()
    if (remove) ws?.removeHostedPanel(entry.panelId)
    dom?.setHostedContent(entry.panelId, null)
    delete hostedIds[id]
  }

  /**
   * Where the widget is on screen, in workspace pixels: where `'floating'` opens by default. Out
   * of the panel, its own panel (a floating one stays where it is); in it, its frame.
   */
  const frameRect = (id: string, widget: ManagedWidget): Rect => {
    const hostedId = hosted.get(id)?.panelId
    if (hostedId && ws) {
      const win = ws.state.floating.find(w => w.id === hostedId)
      if (win && num(win.x) && num(win.y) && num(win.width) && num(win.height)) {
        return { x: win.x, y: win.y, width: win.width, height: win.height }
      }
    }
    const root = store.container.value
    const frame = hostedId
      ? (dom?.has(hostedId) ? dom.elementFor(hostedId) : undefined)
      : root
        ? Array.from(root.querySelectorAll<HTMLElement>('[data-vdd-widget]')).find(el => el.getAttribute('data-vdd-widget') === id)
        : undefined
    const viewport = (frame ?? root)?.closest('.vdd-workspace-viewport')
    const f = frame?.getBoundingClientRect()
    const v = viewport?.getBoundingClientRect()
    return {
      x: f && v ? Math.round(f.left - v.left) : 0,
      y: f && v ? Math.round(f.top - v.top) : 0,
      width: f && f.width > 0 ? Math.round(f.width) : (widget.width ?? 320),
      height: f && f.height > 0 ? Math.round(f.height) : (widget.height ?? 240),
    }
  }

  const move = (id: string, to: WidgetTarget): MoveResult => {
    const widget = store.managed.get(id)
    const el = store.content.get(id)
    if (!widget || !el) return { ok: false, reason: 'not-open' }
    const current = hosted.get(id)
    if (to.to === 'panel') {
      // Already in the panel: a no-op, which moves nothing and so calls nothing.
      if (current) fire(id, 'will')
      detach(id, true)
      return { ok: true }
    }
    const owner = ws && ownerId ? ws.state.panels[ownerId] : undefined
    // An overlay in a modal, a drawer or outside any workspace has no workspace panel to move beside.
    if (!ws || !dom || !ownerId || !owner || owner.owner) return { ok: false, reason: 'no-workspace' }
    if (optionsFor(ws.registry, owner)?.keepAlive === false) return { ok: false, reason: 'owner-not-kept-alive' }
    if (to.to !== 'floating' && owner.state !== 'docked') return { ok: false, reason: 'owner-not-docked' }

    const at: HostedPanelPlacement = to.to === 'floating'
      ? { kind: 'float', rect: to.rect ?? frameRect(id, widget) }
      : to.to === 'tabbed'
        ? { kind: 'dock', dockTo: { panel: ownerId, position: 'center' } }
        : { kind: 'dock', dockTo: { panel: ownerId, position: to.position, ...(to.size !== undefined ? { size: to.size } : {}) } }
    // Synchronously, before anything below touches the DOM: the element hasn't moved yet.
    fire(id, 'will')
    // Already out: the hosted panel is replaced rather than moved, so every target takes one path.
    // The content stays rendered throughout; only the element moves. The new panel keeps the title
    // the old one had, which the app may have set with updatePanelTitle (rdd 7.11.0).
    const title: Label = (current && ws.state.panels[current.panelId]?.title) ?? widget.title
    // The container it was in, for the same-container replace below (rdd 7.11.0).
    const wasIn = current?.key
    if (current) detach(id, true)
    const panelId = `${ownerId}/${id}`
    dom.setHostedContent(panelId, { el, cache: store.content })
    if (!ws.openHostedPanel(panelId, { panelId: ownerId, widgetId: id, options: capabilities(widget) }, title, at)) {
      dom.setHostedContent(panelId, null)
      return { ok: false, reason: 'owner-not-docked' }
    }
    if (widget.icon !== undefined) ws.setPanelIcon(panelId, widget.icon)
    // An in-page close of the hosted panel (×, the menu's Close, closePanel) closes the widget;
    // going back is move({ to: 'panel' }).
    const unregisterClose = ws.registerHostedCloseHandler(panelId, () => {
      detach(id, false)
      store.closeManaged(id)
    }, () => fire(id, 'will'))   // a layout load is about to drop it: the watcher below sends it home
    // The app's titleMenu items lead the hosted panel's own menus (M4). The getter reads the
    // widget's config each time, so a re-open with a new titleMenu applies at once.
    const unregisterMenu = ws.registerPanelMenu(panelId, () => menuItems(id))
    const unregister = (): void => { unregisterClose(); unregisterMenu() }
    const nowIn = containerKey(ws.state, panelId, ownerId)
    // Its hosted panel's element moves the content wherever the user takes it: it keeps embeds too.
    if (widget.preserveEmbeds) dom.preserveEmbeds(panelId)
    const target: WidgetTarget = to.to === 'floating' ? { to: 'floating', rect: at.kind === 'float' ? at.rect : undefined } : to
    hosted.set(id, { panelId, unregister, key: nowIn, target })
    hostedIds[id] = panelId
    // Floating to floating, or a tab to a tab in the same group: the container's key doesn't
    // change, so the widget's scope won't see the move. It is one all the same (onWillMove ran):
    // settle it here (rdd 7.11.0).
    if (wasIn !== undefined && wasIn === nowIn) settled(id)
    return { ok: true }
  }

  const location = (id: string): WidgetLocation | null => {
    if (!store.managed.has(id)) return null
    const entry = hosted.get(id)
    if (!entry || !ws || !ownerId) return 'panel'
    return containerKey(ws.state, entry.panelId, ownerId).split('|')[0] as WidgetLocation
  }

  const refresh = (id: string, widget: ManagedWidget): void => {
    const entry = hosted.get(id)
    if (!entry || !ws) return
    ws.updatePanelTitle(entry.panelId, widget.title)
    ws.setPanelIcon(entry.panelId, widget.icon ?? null)
    ws.setHostedOptions(entry.panelId, capabilities(widget))
  }

  const menuItems = (id: string): ContextMenuItem[] => {
    void store.managedVersion.value      // tracked: a re-open with a new titleMenu re-renders a menu button
    const widget = store.managed.get(id)
    if (!widget?.titleMenu) return []
    return widget.titleMenu({
      id,
      location: location(id) ?? 'panel',
      ...capabilities(widget),
      move: to => move(id, to),
      close: () => store.closeManaged(id),
    })
  }

  const listen = (id: string, kind: 'will' | 'moved', cb: () => void): (() => void) => {
    let entry = listeners.get(id)
    if (!entry) { entry = { will: new Set(), moved: new Set() }; listeners.set(id, entry) }
    entry[kind].add(cb)
    const set = entry[kind]
    return () => { set.delete(cb) }
  }

  /**
   * Where a widget out of its panel is, as a saved placement's target (7.11). Floating: the
   * window's current rect. Tabbed: `tabbed`. Docked: the side and size of the last `move()` (a
   * user's drag elsewhere in the grid keeps them). Minimised: where it was before, from what the
   * workspace recorded as it minimised it (`previousState`, `lastFloatingRect`, `lastLeafId`).
   */
  const outTarget = (id: string): OutTarget | null => {
    const entry = hosted.get(id)
    const panel = entry && ws ? ws.state.panels[entry.panelId] : undefined
    if (!entry || !panel || !ws || !ownerId) return null
    const n = (v: number | string) => (typeof v === 'number' ? v : parseFloat(v) || 0)
    const where = containerKey(ws.state, entry.panelId, ownerId).split('|')[0]
    const t = entry.target
    const docked = (): OutTarget => (t.to === 'docked'
      ? { at: 'docked', position: t.position, ...(t.size !== undefined ? { size: t.size } : {}) }
      : { at: 'docked', position: 'bottom' })
    if (where === 'floating') {
      const win = ws.state.floating.find(w => w.id === entry.panelId)
      if (win) return { at: 'floating', rect: { x: n(win.x), y: n(win.y), width: n(win.width), height: n(win.height) } }
    }
    if (where === 'tabbed') return { at: 'tabbed' }
    if (where === 'docked') return docked()
    // Minimised: where it was before.
    const r = panel.lastFloatingRect
    if (panel.previousState === 'floating' && r) return { at: 'floating', rect: { x: r.x, y: r.y, width: r.width, height: r.height } }
    if (panel.previousState === 'docked' && panel.lastLeafId) {
      return panel.lastLeafId === findLeafForPanel(ws.state.gridRoot, ownerId) ? { at: 'tabbed' } : docked()
    }
    if (t.to === 'floating' && t.rect) return { at: 'floating', rect: t.rect }
    return t.to === 'docked' ? docked() : { at: 'tabbed' }
  }

  /** Marks the owner panel's element to move with moveBefore() (`preserveEmbeds`, 7.11). */
  const preserveOwner = (): void => {
    if (dom && ownerPanelId) dom.preserveEmbeds(ownerPanelId)
  }

  const keyOf = (id: string): string =>
    ws && ownerId ? containerKey(ws.state, hostedIds[id], ownerId) : 'panel'

  // The owner's id when it is a workspace panel. Fixed for the overlay's life: it is mounted
  // inside that panel.
  const ownerPanelId = ws && ownerId && ws.state.panels[ownerId] ? ownerId : null

  // A hosted panel that left the workspace without this overlay asking (only loadLayout does: a
  // layout never holds one) sends its widget back into the panel. A close runs the close handler
  // synchronously, so that case is already gone from `hosted` by the time this runs.
  if (ws) {
    watch(() => ws.state.panels, (panels) => {
      for (const [id, entry] of Array.from(hosted)) {
        if (!(entry.panelId in panels)) detach(id, false)
      }
    })
  }

  // The user moving a hosted panel (a drag to another group, floating, docking, minimising,
  // restoring): a **sync** watcher runs inside the workspace's own state change, before any
  // component re-renders, so the element hasn't moved yet. A 'pre' watcher is not enough: it is
  // queued by this component's id, after the workspace components above it, which would already
  // have moved the DOM. The overlay's own moves are fired by move() itself: during one, the
  // entry is out of `hosted`, and its `key` is the new container's by the time it is back.
  //
  // A sync watcher sees every step of an action that writes several fields. A docked panel in no
  // group is such a step (a close, a float or a minimise takes it out of the tree before it
  // changes the rest; a dock sets the state before inserting it): in transit, not a container,
  // so it is skipped, and a close then finds the panel gone. Otherwise the first change fires
  // onWillMove and the rest of that tick is one move. If the container ends where it began (the
  // steps undid each other), the widget's scope sees no change, so it is settled here.
  if (ws && ownerId) {
    const moving = new Map<string, string>()   // widget id → the container it was in before this tick
    watch(
      () => Object.entries(hostedIds).map(([id, panelId]) => `${id}=${containerKey(ws.state, panelId, ownerId)}`).join('\n'),
      () => {
        for (const [id, entry] of hosted) {
          if (!(entry.panelId in ws.state.panels)) continue   // gone: a close, or a layout load
          const key = containerKey(ws.state, entry.panelId, ownerId)
          if (key === entry.key || key.endsWith('|')) continue
          if (!moving.has(id)) {
            moving.set(id, entry.key)
            fire(id, 'will')
            // After this tick's render: a container that ended where it began still settles.
            void Promise.resolve().then(() => nextTick(() => {
              const from = moving.get(id)
              moving.delete(id)
              if (from !== undefined && hosted.has(id) && keyOf(id) === from) settled(id)
            }))
          }
          entry.key = key
        }
      },
      { flush: 'sync' },
    )
  }

  // The owner closed, or its overlay unmounted: its widgets go with it, and so do their panels.
  onBeforeUnmount(() => {
    for (const id of Array.from(hosted.keys())) detach(id, true)
  })

  return {
    hostedIds, move, location, release: id => detach(id, true), refresh,
    menuItems, ownerPanelId, keyOf, listen, settled, outTarget, preserveOwner,
  }
}
