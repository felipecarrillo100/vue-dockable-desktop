import { computed, onBeforeUnmount, onMounted, ref, toValue } from 'vue'
import type { ComputedRef, Component, MaybeRefOrGetter } from 'vue'
import { useWorkspace } from './useWorkspace'
import { providePanel } from './usePanel'
import type { OverlayInstance } from '../core/overlays'

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
 * `isTopmost` in the other).
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
    const self = current()
    if (self.kind === 'modal') {
      // Only the topmost modal answers, and it stops the event so the drawers below —
      // which are listening on the same document — do not close as well.
      if (overlays.topmostModal()?.id !== self.id) return
      event.stopPropagation()
    } else if (overlays.state.modals.length > 0) {
      return
    }
    void close()
  }

  onMounted(() => document.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

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
