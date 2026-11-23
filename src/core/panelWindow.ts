/**
 * The window a panel is in (1.14.0, rdd 7.12.0's `panelWindow.tsx`): the main one, or its pop-out's.
 * Panel code reads it with `usePanelWindow()`; the app's `popoutWrapper` gets it as props, so a
 * CSS-in-JS cache can follow the panel into the pop-out's document.
 *
 * Also the pop-out documents' wrapper (internal): `<VddContextMenu>` and `<VddToasts>` are mounted
 * beside `<VddDesktop>`, not inside it, so no provide/inject reaches them from the desktop. Each
 * desktop records its `popoutWrapper` here for the documents of its open pop-outs, and a menu or a
 * toast container shown in one of them looks it up by its document.
 */
import { shallowReactive } from 'vue'
import type { Component } from 'vue'

/** The window and document a panel is shown in. See {@link usePanelWindow}. (1.14.0) */
export interface PanelWindow {
  window: Window
  document: Document
}

/**
 * The props of `<VddDesktop :popout-wrapper>`'s component (1.14.0): the window and document of what
 * it is around. The component renders its default slot.
 */
export interface PopoutWrapperProps {
  window: Window
  document: Document
}

let main: PanelWindow | null = null
/** The main window, as one stable object (on the server, where there is none, empty). */
export function mainWindow(): PanelWindow {
  if (typeof window === 'undefined') return {} as PanelWindow
  if (!main || main.window !== window) main = { window, document }
  return main
}

/** Each open pop-out's document, with the wrapper of the desktop that owns it. */
const wrappers = shallowReactive(new Map<Document, Component>())

/**
 * @internal Records `wrapper` for a pop-out's document; returns the function that removes it (only
 * if it is still this one).
 */
export function setPopoutWrapper(doc: Document, wrapper: Component): () => void {
  wrappers.set(doc, wrapper)
  return () => { if (wrappers.get(doc) === wrapper) wrappers.delete(doc) }
}

/**
 * @internal The app's `popoutWrapper` for `doc`, a pop-out's document; null for the main document,
 * or a document no desktop with a wrapper has open. Reactive.
 */
export function popoutWrapperFor(doc: Document | null | undefined): Component | null {
  if (!doc || (typeof document !== 'undefined' && doc === document)) return null
  return wrappers.get(doc) ?? null
}
