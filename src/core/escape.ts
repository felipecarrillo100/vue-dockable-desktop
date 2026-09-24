/**
 * Who answers an Escape.
 *
 * Every overlay and every transient widget listens for Escape on `document`, and
 * `stopPropagation()` cannot arbitrate between them: it stops the event reaching *other
 * nodes*, never other listeners on the same one. So whoever acts on an Escape claims it, and
 * every other listener checks for a claim first. Transient UI — a context menu, a toolbar
 * flyout, a search box — listens earlier (capture phase, or on the focused element), so it
 * claims before any overlay sees the event. See docs/decisions/0016-escape-claiming.md.
 *
 * The claim is recorded twice. `preventDefault()` is what a browser's own keydown carries,
 * and it is how an application widget inside a modal — a combobox closing its own popup —
 * says "mine". The WeakSet covers the events `preventDefault()` cannot mark: a synthetic
 * `KeyboardEvent` is not cancelable unless its creator said so.
 */
const claimed = new WeakSet<Event>()

/** Mark an Escape as answered, so no other listener in the library acts on it. */
export function claimEscape(event: Event): void {
  claimed.add(event)
  event.preventDefault()
}

/** Whether a listener in the library, or the application via `preventDefault()`, already answered it. */
export function isEscapeClaimed(event: Event): boolean {
  return event.defaultPrevented || claimed.has(event)
}
