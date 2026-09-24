import { computed, onBeforeUnmount, onMounted, ref, toValue } from 'vue'
import type { ComputedRef, Component, MaybeRefOrGetter } from 'vue'
import { useWorkspace } from './useWorkspace'
import { providePanel } from './usePanel'
import type { OverlayInstance } from '../core/overlays'
import { claimEscape, isEscapeClaimed } from '../core/escape'

/**
 * When each rendered overlay was opened, by instance id — so that with a drawer on each side,
 * Escape can close the later one. Mount order is open order: a host mounts when its instance
 * appears. Kept here rather than on the overlay state, since it is only Escape's concern.
 */
const openedAt = new Map<string, number>()
let openSequence = 0

/**
 * Everything a rendered side panel or modal needs, in one place.
 *
 * rdd's `SidePanelRenderer` and `ModalStackRenderer` each carried their own copy of this —
 * the close sequence, the dirty-confirmation modal, the title asterisk, the `setDirty` and
 * `setTitle` plumbing, the Escape handler. Thirty-five of those lines were character-for-
 * character identical, which is how two containers come to disagree about what closing a
 * dirty panel does. Here the two components differ only in their chrome.
 *
 * **Escape routing** lives here too, and is the reason it can be stated once: Escape belongs
 * to the topmost modal, and reaches a drawer only when no modal is open. rdd expressed the
 * same rule twice, in two different shapes (`modals.length === 0` in one,
 * `isTopmost` in the other). With a drawer on each side and no modal, the one opened last
 * answers. Whoever answers claims the event (`../core/escape`), so one Escape closes one thing.
 */
export function useOverlayHost(
  instance: MaybeRefOrGetter<OverlayInstance>,
): {
  /** The instance's title, resolved through the formatter, with a trailing `*` when dirty. */
  displayTitle: ComputedRef<string>
  /** Whether Escape and a backdrop click should close this instance. */
  dismissible: ComputedRef<boolean>
  /** The icon to show in the header: the live one set from inside, else the open-time one. */
  icon: ComputedRef<Component | null>
  /** Close, honouring the close guard and dirty state. */
  close: (options?: { force?: boolean }) => Promise<void>
  /** `padding` for the body, or `undefined` to leave it to the stylesheet. */
  bodyPadding: ComputedRef<string | undefined>
} {
  const ws = useWorkspace()
  const { overlays } = ws
  const current = () => toValue(instance)

  /** Set from inside the panel via `usePanel().setIcon()`; falls back to the open-time icon. */
  const liveIcon = ref<Component | null>(null)

  const dismissible = computed(() =>
    current().kind === 'modal' ? current().options.closable !== false : true)

  /**
   * Closing asks the same unsaved-changes question a docked panel does — `<VddModals>` owns
   * the one implementation, so a drawer and a tab cannot answer differently. The question is
   * itself a modal, so it stacks on top of whatever is closing, including on top of another
   * question.
   */
  const close = (options?: { force?: boolean }): Promise<void> =>
    overlays.requestClose(current().id, {
      ...options,
      confirm: (target) => overlays.confirmDiscard({
        title: ws.format(target.options.title),
        dirtyOptions: target.dirtyOptions,
      }),
    })

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !dismissible.value) return
    // A menu, flyout or search box inside this overlay — or the application's own widget —
    // already answered it.
    if (isEscapeClaimed(event)) return
    const self = current()
    if (self.kind === 'modal') {
      // Only the topmost modal answers. `stopPropagation()` keeps the event from nodes above
      // `document`; it cannot stop the other listeners on `document` itself, which is what
      // the claim below is for — a drawer that registered after this modal would otherwise
      // find the stack already empty and close as well.
      if (overlays.topmostModal()?.id !== self.id) return
      event.stopPropagation()
    } else if (overlays.state.modals.length > 0) {
      return
    } else if (!isLatestDrawer(self.id)) {
      // Two drawers open: Escape closes the one opened last, then the other.
      return
    }
    claimEscape(event)
    void close()
  }

  let sequence = 0
  onMounted(() => {
    sequence = ++openSequence
    openedAt.set(current().id, sequence)
    document.addEventListener('keydown', onKeydown)
  })
  onBeforeUnmount(() => {
    if (openedAt.get(current().id) === sequence) openedAt.delete(current().id)
    document.removeEventListener('keydown', onKeydown)
  })

  /** Whether `id` is the most recently opened of the drawers still open. */
  function isLatestDrawer(id: string): boolean {
    const open = [overlays.state.leftPanel, overlays.state.rightPanel]
      .filter((d): d is OverlayInstance => d !== null && d.id !== id)
    const mine = openedAt.get(id) ?? 0
    return open.every(d => (openedAt.get(d.id) ?? 0) < mine)
  }

  // The panel inside gets the same `usePanel()` contract a docked panel gets, so one
  // component can be opened as a tab, a floating window or a modal without knowing which.
  providePanel({
    id: current().id,
    containerType: computed(() => current().kind),
    close,
    setTitle: (title) => overlays.updateInstance(current().id, {
      options: { ...current().options, title },
    }),
    setIcon: (component) => { liveIcon.value = (component ?? null) as Component | null },
    setDirty: (dirty, dirtyOptions) => overlays.setDirty(current().id, dirty, dirtyOptions),
    // An overlay's state lives on `ws.overlays`, not in `ws.state.panels`, so the container
    // supplies it — `usePanel()` would otherwise find nothing and treat this as standalone.
    title: computed(() => current().options.title ?? current().id),
    dirty: computed(() => current().dirty),
    onBeforeClose: (guard) => overlays.registerCloseGuard(current().id, guard),
    overlay: true,
  })

  return {
    displayTitle: computed(() => {
      const base = ws.format(current().options.title)
      return current().dirty ? `${base} *` : base
    }),
    dismissible,
    icon: computed(() => liveIcon.value ?? current().options.icon ?? null),
    close,
    bodyPadding: computed(() => {
      const value = current().options.bodyPadding
      if (value == null) return undefined
      return typeof value === 'number' ? `${value}px` : value
    }),
  }
}
