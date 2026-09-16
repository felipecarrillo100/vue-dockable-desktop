import type { Label, MessageDescriptor, MessageFormatter } from '../types'

/**
 * The library's own UI strings.
 *
 * Each `id` is the key an application defines in its i18n message table; `defaultMessage`
 * is the fallback when no formatter is supplied. Override any subset via
 * `createWorkspace({ messages })` — the object is merged, so partial overrides work.
 */
export const defaultMessages = {
  floatWindow: { id: 'vdd.floatWindow', defaultMessage: 'Float Window' },
  minimizePanel: { id: 'vdd.minimizePanel', defaultMessage: 'Minimize Panel' },
  closeTab: { id: 'vdd.closeTab', defaultMessage: 'Close Tab' },
  restorePanel: { id: 'vdd.restorePanel', defaultMessage: 'Restore Panel' },
  maximizePanel: { id: 'vdd.maximizePanel', defaultMessage: 'Maximize Panel' },
  closePanel: { id: 'vdd.closePanel', defaultMessage: 'Close Panel' },
  dockWindow: { id: 'vdd.dockWindow', defaultMessage: 'Dock Window' },
  minimize: { id: 'vdd.minimize', defaultMessage: 'Minimize' },
  maximize: { id: 'vdd.maximize', defaultMessage: 'Maximize' },
  restoreSize: { id: 'vdd.restoreSize', defaultMessage: 'Restore Size' },
  close: { id: 'vdd.close', defaultMessage: 'Close' },
  closeEmptyGroup: { id: 'vdd.closeEmptyGroup', defaultMessage: 'Close empty split group' },
  emptyGroup: { id: 'vdd.emptyGroup', defaultMessage: 'Empty workspace section' },
  unsavedChangesTitle: { id: 'vdd.unsavedChangesTitle', defaultMessage: 'Unsaved Changes' },
  unsavedChangesMessage: {
    id: 'vdd.unsavedChangesMessage',
    defaultMessage: '"{title}" has unsaved changes. Do you want to discard your changes and close?',
  },
  discardChanges: { id: 'vdd.discardChanges', defaultMessage: 'Discard Changes' },
  cancel: { id: 'vdd.cancel', defaultMessage: 'Cancel' },
  yes: { id: 'vdd.yes', defaultMessage: 'Yes' },
  no: { id: 'vdd.no', defaultMessage: 'No' },
  ok: { id: 'vdd.ok', defaultMessage: 'OK' },
  closeTooltip: { id: 'vdd.closeTooltip', defaultMessage: 'Close' },
  scrollTabsLeft: { id: 'vdd.scrollTabsLeft', defaultMessage: 'Scroll tabs left' },
  scrollTabsRight: { id: 'vdd.scrollTabsRight', defaultMessage: 'Scroll tabs right' },
  moreActions: { id: 'vdd.moreActions', defaultMessage: 'More actions' },
  search: { id: 'vdd.search', defaultMessage: 'Search' },
} as const satisfies Record<string, MessageDescriptor>

/**
 * Every message key. Import it in your own message table to get a compile-time guarantee
 * that all keys are present and none are misspelled.
 */
export type MessageKey = keyof typeof defaultMessages

/** Resolve a label with a formatter, falling back to its `defaultMessage` then its `id`. */
export function formatLabel(
  label: Label | undefined,
  format?: MessageFormatter,
): string {
  if (label === undefined || label === null) return ''
  if (typeof label === 'string') return label
  if (format) return format(label)
  let text = label.defaultMessage ?? label.id
  if (label.values) {
    for (const [key, value] of Object.entries(label.values)) {
      text = text.replace(`{${key}}`, String(value))
    }
  }
  return text
}
