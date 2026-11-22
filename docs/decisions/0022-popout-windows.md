# 0022 — Pop-out windows: the desktop owns them, a Teleport carries the panel

**Status:** Accepted (2026-11-22, for vdd 1.14.0, parity react-dockable-desktop 7.12.1). Ports a
design already settled in rdd (`docs/plan-widgets-out-of-the-panel.md` §10); this records only
where Vue made vdd choose. Builds on [0002](0002-zero-unmount-via-teleport.md) and
[0016](0016-escape-claiming.md), and changes neither.

## Context

rdd 7.12.0 and 7.12.1 let a panel, or a managed widget out of its panel, move into its own browser
window and come back without remounting. The family rule is that vdd and ndd follow, with the same
names and the same observable behaviour, and that saved layouts stay compatible.

The design was taken in rdd and is not reopened here: the store marks the panel
(`PanelInfo.poppedOut`), a windows registry outside the store opens the window synchronously in the
user's click, the page's styles are copied into the child, the four events are sent around each
move, and every way back ends in one function. The port builds the final 7.12.1 behaviour directly.

Eight places did not map one to one, because of how Vue renders and provides, and how vdd's own
earlier decisions (the cache element of 0002, the Escape claims of 0016) already work.

## Decision

1. **The registry is owned by `<VddDesktop>`, not by the workspace.** The desktop creates it
   (`createPopOutWindows(ws)`), provides it to its subtree, and on mount binds it to the workspace
   (`bindPopOutWindows`) and lends it the panel cache (park, rect, element). Unmounting brings every
   panel back first, while the cache can still take its element, and unbinds. The workspace keeps
   the state and the public actions (`popOutPanel`, `returnPanel`, `focusPanelWindow`); it checks
   `'disabled'` itself and returns `'no-window'` while no registry is bound. The windows follow the
   store through an internal synchronous `onPopOutEnded(id)`, never the other way round. `popoutUrl`
   and `popoutWrapper` are therefore desktop props, as rdd's are provider props.

2. **The frame is a `<Teleport>` into the child's `<body>`, holding the panel's ordinary preserved
   slot.** The cached element of 0002 moves into the slot as it moves into any other container, so
   nothing remounts and no new unmount path exists: zero unmount holds across windows. The child's
   `pagehide` handler parks the element back into the main document synchronously, before the
   child's document goes. `<html>` and `<head>` of the child are written by the styles module, not by
   Vue.

3. **The sibling menu and toasts find the wrapper by document.** `<VddContextMenu>` and
   `<VddToasts>` are mounted beside `<VddDesktop>`, so no `provide` from the desktop reaches them.
   The desktop records its `popoutWrapper` for each open pop-out's document in an internal map, and
   a menu or toast container shown in a pop-out looks it up by its document. Inside the desktop (the
   panel's content, the frame, a widget's content) the wrapper reaches them by `provide`.

4. **Escape stays a claim, scoped per document.** vdd has no single Escape stack to scope; ADR 0016's
   claims stay. Every Escape listener of a menu or a flyout goes through the document registry
   (`listenOnDocuments`) and acts only when the key fired in its own document. Modals and side
   panels are main-document only. Click-to-activate follows the same split: in the main document
   the elements' own `@pointerdown` handlers answer as before; the registry's `pointerdown` and
   `focusin` listeners act only in a pop-out.

5. **`activatePanel`, an internal action.** Public `focusPanel(id)` on a popped-out panel also
   brings its window forward (rdd 7.12.0). vdd's own components call `focusPanel` where rdd's call
   its core's `setActivePanel`, which never focuses a window. So the old body of `focusPanel` is now
   the `@internal` `activatePanel`, used by `focusPanelWindow`, by `openPanel` on an open panel and
   by activation inside a pop-out, where the window is already in front.

6. **A stand-in event opens a menu from the keyboard.** vdd's context menu places itself from its
   request's event, and a keyboard-made 0,0 event would put it at the main page's corner. The
   widget frame's title icon, and a widget's in-panel title icon whose owner is out, pass a
   `MouseEvent` of the icon's window at the icon's corner whose `target` is the icon (internal
   `menuEventBelow`), so the menu opens below the icon, in that window, on its first item.

7. **`returning` marks the hosted entry.** When a widget comes back from its window, rdd sets its
   last container key to `'floating'`. In vdd a docked widget's panel is restored docked first,
   which the hosting's sync watcher would see as a move and answer with a second `onWillMove`. The
   entry is marked `returning` instead, and the watcher ignores its panel's steps until `returned`:
   one `onWillMove` / `onMoved` pair each way, as in rdd.

8. **`popOut` is in the config type.** `createWorkspace({ popOut })` is read once and not kept on
   `workspace.config`. It is declared on `WorkspaceConfig`, so `config`'s declared type lists it:
   the API rule (additions only, no exported line rewritten) forbids narrowing that line's type.
   The value never carries it.

## Consequences

- With no `<VddDesktop>` mounted, `popOutPanel` returns `'no-window'` right after `'disabled'`
  (before `'not-open'`), and a widget's `popOut()` returns `'no-window'`. rdd always has its
  registry. Documented in [chapter 15](../manual/15-popout-windows.md) and
  [PARITY](../PARITY.md) §4.
- A wrapper is a component with `window` and `document` props and a default slot. The SFC compiler
  can't resolve an imported props type in every setup, so the manual spells them out in
  `defineProps` rather than using `PopoutWrapperProps` directly.
- `usePanelWindow()` returns live getters, not a re-rendered value; reading it inside a `watch` or
  `computed` is the Vue way to follow it (0006).
- Vue's renderer creates elements with the main `document`, so nodes made while a panel is out are
  adopted by the pop-out on insertion. The manual says to ask a node for its `ownerDocument` and to
  avoid `instanceof`.
- Saved layouts are unchanged: a popped-out panel is saved at its return place, without the flag
  ([0009](0009-layout-json-compatibility.md)).
- Pinned by the ported suites (`documentAware`, `popOutStore`, `popOutWindows`, `popOutStyles`,
  `popoutWrapper`, `popOutChrome`, `popOutWidgets`, `popOutFocus`, `popOutFromPopOut`), by the M18
  browser gate in real Chrome, and by the M18 rules.
