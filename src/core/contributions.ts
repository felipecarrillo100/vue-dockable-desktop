/**
 * Panel contributions: toolbar items and sidebar sections a panel publishes, surfaced only
 * while that panel is the active one.
 *
 * The rule that makes this feature safe is the one it shares with the rest of the library: a
 * contribution is read from `activePanelId`, and `activePanelId` never names a panel the user
 * cannot see. rdd's `activePanelId` *could* name an invisible panel (divergence D2), so the
 * shell's toolbar showed controls belonging to a panel behind another tab — controls that
 * looked functional and acted on something out of sight. That is the whole reason the D2 fix
 * came first: this feature is only as trustworthy as that invariant.
 *
 * Kept on the workspace rather than behind its own provider (ADR 0004), which also means the
 * merge helpers can be plain functions instead of hooks.
 */
import { computed, markRaw, ref, shallowReactive } from 'vue'
import type { Component, ComputedRef } from 'vue'
import type { SidebarTab } from './sidebarTypes'
import type { ToolbarItem } from './toolbarTypes'

/** One named section a panel contributes to the app's sidebar while it is active. */
export interface PanelSidebarSection {
  id: string
  label: string
  icon?: Component
  /** Rendered as the section's content. */
  component: Component
  props?: Record<string, unknown>
}

/**
 * What a panel publishes. Both fields are optional and independent — a panel may contribute
 * only toolbar items, only sections, both, or nothing.
 *
 * The library assigns no meaning to either: what "a toolbar item" is for is the application's
 * decision, and neither `<VddToolbar>` nor `<VddSidebar>` reads this on its own. The shell
 * merges it into its own `items`/`tabs`.
 */
export interface PanelContribution {
  toolbarItems?: ToolbarItem[]
  sidebarSections?: PanelSidebarSection[]
}

export interface Contributions {
  /**
   * Publish for one panel, replacing anything it published before. The returned function
   * withdraws it — but only if nothing has re-published for that id since, so a republish
   * during a component update cannot be undone by the previous registration's cleanup.
   */
  publish(panelId: string, contribution: PanelContribution): () => void
  /** What one panel has published, or `null`. */
  get(panelId: string): PanelContribution | null
  /** Every panel that has published something. */
  ids(): string[]
}

export function createContributions(): Contributions {
  // `shallowReactive`: the values hold components and caller callbacks, and deep-proxying an
  // application's own objects is not the library's business. A contribution changes by being
  // replaced, which a shallow map tracks.
  const map = shallowReactive(new Map<string, PanelContribution>())
  const version = ref(0)

  return {
    publish(panelId, contribution) {
      const stored: PanelContribution = {
        toolbarItems: contribution.toolbarItems,
        sidebarSections: contribution.sidebarSections?.map(s => ({
          ...s,
          component: markRaw(s.component),
          icon: s.icon ? markRaw(s.icon) : undefined,
        })),
      }
      map.set(panelId, stored)
      version.value++
      return () => {
        if (map.get(panelId) === stored) {
          map.delete(panelId)
          version.value++
        }
      }
    },
    get(panelId) {
      void version.value        // tracked, so a computed sees publishes and withdrawals
      return map.get(panelId) ?? null
    },
    ids() {
      void version.value
      return Array.from(map.keys())
    },
  }
}

// ── merge helpers ───────────────────────────────────────────────────────────

/**
 * Turn a contributed section into a sidebar tab.
 *
 * `eagerMount` and `preserveState` are deliberately left unset: a contribution exists only
 * while its panel is mounted *and* active, so neither has anything to mean here.
 */
export function sectionToTab(section: PanelSidebarSection, fallbackIcon?: Component): SidebarTab {
  return {
    id: section.id,
    label: section.label,
    icon: section.icon ?? fallbackIcon,
    component: section.component,
    props: section.props,
  }
}

/**
 * Append the active panel's contributed items to a static list, behind a separator.
 *
 * A plain function of a `computed`, not a hook — the state is on the workspace, so there is
 * nothing to subscribe to. rdd needed `useMergedToolbarItems()` because reading the store
 * required `useSyncExternalStore`.
 */
export function mergeToolbarItems(
  staticItems: ToolbarItem[],
  contribution: PanelContribution | null,
): ToolbarItem[] {
  const contributed = contribution?.toolbarItems
  if (!contributed?.length) return staticItems
  return [...staticItems, { type: 'separator' }, ...contributed]
}

/** Append the active panel's contributed sections to a static tab list. */
export function mergeSidebarTabs(
  staticTabs: SidebarTab[],
  contribution: PanelContribution | null,
  fallbackIcon?: Component,
): SidebarTab[] {
  const sections = contribution?.sidebarSections
  if (!sections?.length) return staticTabs
  return [...staticTabs, ...sections.map(s => sectionToTab(s, fallbackIcon))]
}

/** @internal — used by the workspace to expose the active contribution as a ref. */
export function activeContributionRef(
  contributions: Contributions,
  activePanelId: () => string | null,
): ComputedRef<PanelContribution | null> {
  return computed(() => {
    const id = activePanelId()
    return id ? contributions.get(id) : null
  })
}

