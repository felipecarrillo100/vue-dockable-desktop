# Pop-out windows port (rdd 7.12.1 → vdd 1.14.0): milestone report

Branch `feat/popout-windows`, uncommitted. Plan: rdd `docs/plan-widgets-out-of-the-panel.md` §10.

## Summary for the owner (2026-11-22)

**Status: done.** vdd 1.14.0 (parity: react-dockable-desktop 7.12.1). P1–P7 are complete and uncommitted on
`feat/popout-windows`: no commit, push, tag or publish.

- **Gates:**
  - `npm run gate:release` passes M1–M18, 1384/1384 tests in 61 files;
  - the browser gate M18 has 15 cases;
  - the demo was checked in real Chrome: the Leaflet map out and back through "Open in new window".
- **Needs your review:**
  1. **ADR 0023** (`docs/decisions/0023-popout-port-stale-rules.md`, "Accepted… owner to review"). Five old
     milestone rules (M3, M8–M11) read the source too literally for document-aware code and were updated, each
     with a selftest seed: M3 `focusPanel` → `activatePanel`; a computed Teleport to `docOf().body`; `isNode`;
     `resizeObserverFor`.
  2. **Two `gate:selftest` seeds are MISSED.** The M14 "managed widgets declaratively" seed on `CameraWidgets.vue`
     and the non-vacuity `contributions.test.ts` seed. Both miss on `main` too, checked in a scratch worktree, so
     they predate the port.
- **For rdd, an observation (P2 parity check below):** neighbours popped out beside an empty group come back the
  same odd way in rdd, because `commonAncestor` ignores an empty group. That is by design and locked here with
  XPO44. It could be refined in rdd later.
- **Your manual checks, as for rdd 7.12.0:** Safari, Firefox and Edge smoke tests; two monitors.
- **Try it:** `npx vite demo`, then Control Center → Layout → Leaflet Map, and right-click its tab → "Open in new
  window". Only the Leaflet map and the Cameras widget opt in with `canPopOut`.

## P1: document-aware internals (rdd S1, plus S6's per-document Escape rule)

**Built (internal, not exported from `src/index.ts`; no public API change):**
- `src/core/domContext.ts`: `isNode`, `isElement`, `isHTMLElement`, `docOf`, `winOf`, `rafOf`, `cancelRafOf`,
  `resizeObserverFor`, ported as is. The header lists what stays main-window-only.
- `src/core/documentRegistry.ts`: `registerDocument`, `listenOnDocuments`, `isRegistered`, `onDocumentsChange`,
  `focusedDocument` (7.12.1 form), plus `eventDocument(event)`, a vdd helper that gives the document a listener fired on.
- The routed sites:
  - `VddContextMenu`: Teleport into `request.container`, the body of the opening event's document, set per open in
    `showContextMenu` (a new optional `ContextMenuRequest.container`, an internal type); clamping and the submenu use
    the menu's window; opener and arrow keys use the menu's document; outside presses on the main document and the
    menu's own; Escape goes through `listenOnDocuments` and only that document's Escape counts.
  - `VddToolbarGroupButton`: Teleport into the button's body; placed and clamped in its window; outside presses in
    its document; Escape as for the menu.
  - `VddToolbarSearch`: the dropdown goes into the field's body and fits its window; `isNode`.
  - `VddPanelOverlay` (`resizeObserverFor`, `isHTMLElement`), `VddFloatingWidget` (drag/resize classes on the
    frame's own body), `dragResize.ts` (`startPointerDrag` uses the element's document and window, as rdd does;
    `isRtlElement` uses the element's window).
  - `domMove` (the slot's rAF), `panelDom` (focus record in the element's document, its rAF), `widgetContent`
    (`isElement`, the host's rAF), `useWidgetHosting`, `VddToastItem`, `VddPanelToolbar`, `VddPanelMount`
    (`resizeObserverFor` / `rafOf`), `useDragDock` (`isHTMLElement`).
  - `useOverlayHost` (modals and drawers): Escape goes through the registry, and only the main document's counts.
  - `VddDesktop`: click-to-activate on `pointerdown` through `listenOnDocuments` (P6 adds `focusin`).

**Tests:** `test/components/documentAware.test.ts`, 36 tests XDA1–XDA20 (rdd DA1–DA18 plus XDA19, a modal's
Escape, and XDA20, the toast observer and frame). Added to `test/baseline-counts.json` (36). Not ported, no vdd
counterpart:
- DA6's keyboard-open-at-target with the target's `dir`: vdd's menu opens where the caller says, with the workspace's `dir`.
- DA13's "focus back to the button": vdd's flyout never takes focus.
- DA14's `isElementRtl` document fallback: vdd has no such helper.

**Mutation checks:** 40 single-line mutations, each reverting one routed line (M1–M10 helpers and registry;
M11–M18 menu; M19–M22 panelDom and widgetContent; M23–M25 widget drag and `startPointerDrag`; M26–M31 flyout; M32
rtl; M33 domMove; M34 activation; M35–M36 search; M37 toolbar RO; M38 overlay Escape; M39–M40 toast). All 40 went
red, and every one was restored.

**Results:** `npm run verify` PASS (types, lint, 1114/1114 tests in 53 files); `npm run lint` and `npm run typecheck`
clean; `scripts/gates/counts.mjs` ok. No gate run (M18 comes with P2).

**Divergences / decisions:**
- Activation: in the main document vdd keeps its element handlers (`@pointerdown` on the group and the floating
  window). The registry listener acts only in other documents, which keeps the page's behaviour and avoids a
  double `focusPanel`. rdd uses one document listener for everything.
- Escape: vdd keeps ADR 0016's claims. Each listener goes through the registry and compares `eventDocument(event)`
  with its own document. Overlays are main-document only.
- The menu container lives on the workspace's menu request (vdd's menu is store state), where rdd keeps it in
  `MenuState`.

**Open for later milestones:**
- No test covers the `VddPanelMount`, `VddPanelOverlay` and `useWidgetHosting` observer sites, or the
  `isHTMLElement` / `isNode` guards in `VddPanelOverlay`, `useDragDock`, the search focusout and the menu's outside
  check. For main nodes they behave the same.
- An observer is built for the element's window at the time it is created. P2 should check whether `VddPanelMount`'s
  observer needs rebuilding when the element moves into a pop-out.
- A menu whose pop-out closes while it is open still points at the closed body (P2).
- P6: popped-out frame activation (`[data-vdd-popout]`) and `focusin`.

## P2a: the store side of pop-out windows (rdd S2 state model, return places, save)

**Built:**
- `src/types.ts`: `PanelInfo.poppedOut?: true`, `PopOutResult` (rdd's union exactly), exported from `src/index.ts`.
- `src/core/registry.ts`: `PanelDefaultOptions.canPopOut`.
- `src/core/workspace.ts`:
  - `WorkspaceConfig.popOut` (dropped from `workspace.config`), and the dev warning for `canPopOut` without `popOut`;
  - public `popOutPanel`, `returnPanel`, `focusPanelWindow` (rdd's JSDoc);
  - `@internal` `setPoppedOut`, `clearPoppedOut`, `onPopOutEnded(cb)`, `bindPopOutWindows(PopOutWindowsBinding)`;
  - `returnPlace`, `withReturnPlaces`, `endPopOut`, worked out on a plain snapshot copy and applied in one write;
  - `floatPanel` / `maximizePanel` ignored while out; minimize / dock / dockToGroup / dockToEdge call `endPopOut`
    first; `saveLayout` writes the return places, last out first; the cascade skips the hidden entry.
- `src/core/layoutTree.ts`: `PlaceBeside`, `placesBeside`, `returnBeside`, `groupOf`, `insertPanelAmongMates`
  (rdd's `insertPanelInLeaf`), `resolveActivePanelId`.
- `src/core/serialize.ts`: a loaded `poppedOut` flag is stripped.
- `VddDesktop` draws no frame for a popped-out panel and its clamp skips it; `VddFloatingWindow`'s anchor stack
  skips it too.
- `api-surface.json`: `PopOutResult` added (the only change).

**Tests:** `test/store/popOutStore.test.ts`, 105 tests:
- rdd's store cases: XPO1, 2, 4, 6, 8, 9, 16, 17, 20, 21, 22, 27, 27b, 28, 29, 30, 31, 33, 33b, 34, 35, 35b, 36,
  37, 38, 39, 40, 40b, 41, 42, 43;
- XPO37 is the full matrix: rdd has 13 layouts (not 8), 1,332 cases, and the count is asserted;
- vdd additions: XPO28b, XPO35c, XPO38b, XPO40c, XPOS1–XPOS4.

`baseline-counts.json` now includes `popOutStore.test.ts: 105`.

**Left for P2b (need a window or frame):**
- PO3, PO4's window name, title, lang and dir, PO5, PO7, PO10–PO15, PO18, PO19, PO23–PO26, PO32;
- the window halves of PO1 (the menu item), PO6 (the element back on the page) and PO8 (`close()` called, the
  frame gone).

**Mutation checks:**
- 54 mutations: M1–M53 plus M8b. Each changes one line or expression (every guard, every `endPopOut`, each
  return-place rule one at a time, standIn, out, the leaf-id sequence, the save order, the copy-based
  placement, and each tree-helper rule). Each was put back after its run.
- 53 went red. 6 survived the first round (save order, the own-group emptiness check, the empty-grid waiting
  filter, the preceding sibling first, the nearest mate, and the return activating the panel); each got a
  test and then went red.
- M26 (lastLeafId from the live tree instead of the put-back copy) is equivalent in vdd. A docked panel has
  the same group in both trees. A minimised panel can only differ for `canDrag: false` with its group gone, and
  that ends in the same group.

**Results:**
- `npm run verify` PASS: types, lint, 1219/1219 tests in 54 files;
- `npm run lint` and `npm run typecheck` clean;
- `npm run build`, then `api-surface.mjs` ok (52 runtime + 99 types, additions only) and `docs-api.mjs` ok.
- No gate run.

**Divergences / decisions:**
- `popOut` is in the `WorkspaceConfig` type, so `config`'s declared type lists it (its line can't be
  rewritten). The value never has it.
- The warnings use vdd's `warn` (outside production), where rdd warns in development only.
- A lone panel popped out of the root group leaves that group in place with its id, per vdd's `detach` rule.
  rdd puts a new `group-default` there. It comes back into the same id through the own-kept-group rule. The
  matrix gives the same shapes, and the JSON format is unchanged.
- The windows follow the store through `onPopOutEnded(id)`, a synchronous callback on every ending: a clear,
  an `endPopOut` action, `closePanel`, `removeHostedPanel`, `loadLayout`. rdd uses `subscribeToState` instead.
- `movePanelOrder` on a popped-out panel strips the flag and moves it, which is rdd's end state.
- `popOutPanel` checks `'disabled'` itself, with one warning, then hands off to the bound registry, or
  returns `'no-window'`. Until a registry is bound, `returnPanel` clears the flag with `restorePlace` itself.

**Open for P2b / later:**
- P2b: create the registry and bind it; register `onPopOutEnded` (`back(id, false)`, entry deleted first); the
  `canPopOut` rule (not `owner`); `popping-out` before `setPoppedOut`.
- P6: `focusPanel` on a popped-out panel doesn't focus its window yet.
- While out, `VddPanelMount` keeps the element parked, because there is no slot until P2b's frame.

## P2b: the windows registry, the frame, the menus and the browser gate (rdd S2 + 7.12.0 timing + 7.12.1)

**Built:**
- `src/core/popOutWindows.ts` (internal): rdd 7.12.1's registry, ported line for line. It covers
  `activeWindow()` over the main page and the open pop-outs, `opener.open`, `popoutUrl` resolved
  with `new URL(url, document.baseURI)`, blank as `''`, `featuresFor(id, rect, view)`, rdd's check
  order, `load` and poll-tick readiness, the 10 s limit, the 500 ms poll with `live()`, unique
  names `vdd-popout-<id>-<pageKey>-<n>` and no clamp. There is one `back()` for every way back
  (entry deleted first, synchronous park). It also has `whenPlaced` (epoch,
  `POPOUT_PLACED_TIMEOUT_MS`), `leaving`/`announced`, `registerHosted` hooks (used in P5),
  `subscribe`/`getSnapshot` and a `shallowRef` `entries`. `bind()` calls `bindPopOutWindows` and
  registers `onPopOutEnded → back(id, false)`. `canPopOut` excludes `owner`.
- The four events go in `BuiltInEvents` (4 appended lines), published from rdd's points. The 5
  message keys are in `defaultMessages`.
- `Workspace.popOutEnabled` (`@internal`, appended line). `PanelDomCache.isParked(id)`.
- `VddPopOutWindows.vue` + `VddPopOutFrame.vue`. The frame is a Teleport into the child body:
  `.vdd-workspace.vdd-popout-frame`, `data-vdd-popout`, `data-vdd-popout-kind`, icon, title, and
  the SVG return button `.vdd-custom-tab-btn.vdd-popout-frame__return` (title + aria-label). It
  contains `VddPanelSlot`. Inline `FRAME_STYLE`/`BODY_STYLE`/`fillWindow`/`fillSlot`. The window's
  title follows the panel's, `dir` is set when `<html>` has none, and `lang` is copied. **P3 hook:**
  `styled` (true for now) chooses the hidden style.
- `VddDesktop` creates the registry and provides it (`usePopOutWindows`). On mount it binds the
  registry and lends the host (`park`/`rectOf`/`element`/`isParked`); it unbinds first on unmount.
  New prop `popoutUrl` (`popoutWrapper` comes in P4).
- `VddPanelMount`: the ResizeObserver is rebuilt (post-flush) when the panel's pop-out entry changes.
- Menus: `popOutMenuItems` in `panelMenu.ts`. "Open in new window" comes after Float in the tab and
  title menus, and leads the floating ⋮ menu (which now shows for it). A `'blocked'` result from
  the item shows `toast.warning(popOutBlocked)`.
- A menu open in a pop-out closes in `back()` (P1's open item).
- `src/styles/26a-popout.css` (rdd's rules, `vdd-`), so every emitted class has a rule (M13).
- `scripts/gates/m18.mjs`: a placeholder that P7 fills. `scripts/gates/browser/m18.mjs`: 7 cases
  (out and back, closed, popoutUrl, neighbours ×2 orders, blocked, from a pop-out with 5.5 s and
  `opener.name`, events blank + popoutUrl with document and size). Playground: `?po=1`, `po2=1`,
  `pourl=1`, `PopPanel.vue`, `public/popout.html`. Not in `gate:release` yet.

**Tests:** `test/components/popOutWindows.test.ts` has 45 tests: XPO1 (menu), 3 ×6, 4 ×2, 5, 6 ×2, 7 ×5, 8 ×3,
10, 11, 12 ×5, 13 ×3, 14 ×2, 15, 18, 19, 23, 24, 25, 26, 32. It adds XPOE1 ×2, XPOE2, XPOM1 and
XPOR1. `test/components/popOutFromPopOut.test.ts` has XFP1–XFP7. Baseline: +45, +7. Not ported:
PO10's StrictMode case (no Vue equivalent). XFP6 goes through the registry's hosted path with
`view`; the widget-level case comes with P5.

**Mutation checks:** 51 unit mutations (M1–M51) and 2 in the browser.
- 49 went red.
- M28/M50/M51 (whenPlaced's placed check, the frame-visibility check, `isParked`) survived at
  first; XPOE2 was added, and all three then went red.
- M17 (the poll's `live()` guard) is equivalent: every way back calls `entry.stop()`. It is kept
  as rdd's safety net.
- Browser: `opener.open` → `window.open` went red (opener ""). Moving `popping-out` after
  `setPoppedOut` stayed green: still in the click, before Vue renders, so it is equivalent in vdd.

**Results:**
- `npm run verify`: PASS, 1271/1271.
- Lint and typecheck: clean.
- `npm run gate -- M18`: PASS (standing gate, M18, browser 7 cases).
- `api-surface.json`: no change this milestone.

**Divergences / decisions:**
- The registry belongs to the desktop (created in `VddDesktop`), not to the workspace, as P2a's
  `bindPopOutWindows` intends.
- `returnPanel` on a panel that is flagged but has no window still clears the flag
  (`restorePlace`). Only internal `setPoppedOut` can make that state. P2a's tests rely on it.
- `lang` is copied by the frame until P3's `<html>` mirror.
- Menu items have no icon (vdd's built-in items have none).
- Playground `?po=1` starts from one group. Finding for the owner: with a kept-empty sibling group
  (the playground's default L|R), two neighbours out and back come back beside `p1` only, not
  beside the `[p1 | R]` split. This is the return-place algorithm (P2a, rdd's rules); it was not
  checked against rdd.
- The jsdom rAF runs on its `setInterval`, so XPO7/XPO15 advance 100 ms before counting timers.

**Open:**
- P3: styles, and `styled` starting false.
- P4: wrapper.
- P5: widget routing through `registerHosted`, the title-icon menu, and `backIntoPanel` in use.
- P6: focus/`focusin`/`data-vdd-focused`, taskbar `inOwnWindow`.
- Toolbar flyouts/search dropdowns open in a closing pop-out are not closed (only the context menu is).

## P2 parity check: neighbours out beside an empty group

**Question (P2b finding):** in `H[L | R]` with R empty, two neighbours out and back come back beside `p1`
only, not beside the `[p1 | R]` split. Is that rdd's behaviour?

**rdd 7.12.1, run on its own core** (scratch vitest, `setPoppedOut` / `clearPoppedOut(id, true)`, rdd
untouched), R plain and R `keepOnEmpty`, both return orders:
- gate layout `H(0.8,0.2)[H[p1 | R] | V[pp / pq]]` → `H(0.5,0.5)[H(0.8,0.2)[p1 | V[pp / pq]] | R]`. They come
  back beside `p1` only. `returnBeside` wraps the smallest subtree that still holds the recorded panels
  that are docked (`commonAncestor`), and the empty R holds none, so that subtree is p1's own group;
- the tabs `[p1 pp pq] | R`, `H[p1 | V[pp/pq] | R]`, `H[H[p1 | V[pp/pq]] | R]` and `H[p1 | pp | pq | R]`
  all come back to the original.

**vdd:** the same results in every case. It matches rdd, so this is by design and nothing was changed in `src/`.

**Parity lock:** `XPO44` in `test/store/popOutStore.test.ts`, 8 tests (2 R kinds × 2 orders × {edge case, the
four originals}); baseline 105 → 113. Mutation: `commonAncestor` taking the outermost match
(`found === null &&` dropped) → 8/8 red; restored.

## P3: styles in pop-out windows (rdd S3)

**Built:**
- `src/core/popOutStyles.ts` (internal): rdd 7.12.1's module ported line for line, prefixes changed.
  `startPopOutStyles({ child, frame, scope, onReady, main?, timeoutMs? })` → stop;
  `POPOUT_STYLES_TIMEOUT_MS` = 3000. It covers the head copy (in order after the child's own content,
  absolute link `href`), the `MutationObserver` (nodes, style text, link `href`/`media`/`disabled`),
  `adoptedStyleSheets` as one `<style data-vdd-adopted>` (re-read on the same triggers, never polled),
  the `<html>`/`<body>` mirror (every attribute but `style`, inline `--*` and `color-scheme`, the
  child's own classes and layout kept), and the frame repeating `data-color-scheme`, `data-vdd-skin`
  and `vdd-no-animations` from the workspace element.
- `VddPopOutFrame.vue`: `styled` starts false; a post-flush watch on `[shown, frame]` starts the
  styles and stops them on return (the cleanup); `onReady` sets `styled`. New prop `scope`. The P2b
  `lang` copy is gone: the `<html>` mirror carries `lang` and `dir`, as in rdd.
- `VddPopOutWindows.vue` passes `scope`; `VddDesktop.vue` has a `root` template ref on
  `.vdd-workspace` and hands it down. No public API change. No inline non-layout style was left, so
  `26a-popout.css` is unchanged (`npm run css` run; the sheet is in step).
- Playground: only the `PopPanel.vue` comment.

**Tests:** `test/components/popOutStyles.test.ts`, 14 tests XPS1–XPS9 (rdd PS1–PS9, all ported;
XPS5 ×2, XPS7 ×3, XPS9 ×3). Baseline +14. Browser gate: a new `styles` case in
`scripts/gates/browser/m18.mjs` (dark and light under `nord`): the frame's and `#po-fill`'s computed
background, colour, `--vdd-accent-color` and font equal the page workspace's, through a scheme
switch (on `<html>`) and a skin switch (`__app.skin` → tokyo, frame's `data-vdd-skin` checked); a
`<style>` added later applies (`#po-fill` outline). The 7 P2b cases passed unchanged with the
hidden-until-ready frame (they wait on the element, which is laid out while hidden).

**Mutation checks:** 29 unit (M1–M29: sheet filter, absolute href, removal, reorder, style text,
attribute filter, adopted text and its re-read, the mirror's `style` skip, attribute/class/prop
removal, the custom-property filter, the body watch, scope attributes/classes/watch, settle count,
the error listener, the timer, ready at once, stop's disconnect, `copyAttributes` removal, the
frame's `styled` start, `onReady`, the stop cleanup, the scope prop, the desktop's root ref). All 29
went red and were restored. Browser: B1 frame without scope (skin attribute missing), B2 no head
observer (late sheet missing), B3 no `<html>` observer (scheme and skin switches diverge): all red,
restored.

**Results:** `npm run verify` PASS (types, lint, 1293/1293 in 57 files). `npm run gate -- M18`
PASS (browser: 8 cases).

**Divergences / decisions:**
- `documentMirror.ts` is not run for the child: it writes `data-vdd-skin`, `vdd-no-animations` and
  `--vdd-z-base` onto the main `<html>`, and the `<html>` mirror copies all three, which is rdd's
  observable result (rdd relies on the same path).
- The workspace element reaches the frame as a prop from a template ref (rdd's
  `panelHost.getWorkspaceElement()`).
- The frame is `.vdd-workspace.vdd-popout-frame` (one element), as rdd's
  `.rdd-workspace.rdd-popout-frame`. Its `class` is static in the template, so Vue never overwrites
  the `vdd-no-animations` toggle.

**Open:** P4's wrapper (CSS-in-JS rules inserted with `insertRule` are not copied); the docs note on
Vue SFC styles (P7).

## P4: the wrapper, the window composable, the frame chrome and toasts (rdd S4 + next.1 + 7.12.0 marker)

**Built:**
- Public: `VddDesktop` prop `popoutWrapper` (a `Component` given `window`, `document`, default slot),
  `usePanelWindow(): PanelWindow`, `usePanel().isPoppedOut` (an appended `ComputedRef<boolean>` line in
  `UsePanelReturn`), types `PanelWindow`, `PopoutWrapperProps`. `api-surface.json`: +1 runtime, +2 types.
- `src/core/panelWindow.ts`: the types, a stable `mainWindow()`, and an internal document → wrapper map.
  `src/composables/usePanelWindow.ts`: `usePanelWindowOf(id)` (from the registry's `entries` `doc`, the
  frame's store), `providePanelWindow`, `usePanelWindow`. `src/components/popoutWrap.ts`: an internal
  element-less "wrapper or just the slot".
- The wrapper sits around: every panel's `.vdd-panel-content` (`VddPanelMount`, popOut on only, for its
  whole life); the whole pop-out frame; a menu whose container is in another document; a pop-out's
  toast container.
- Toasts: each toast's document is recorded at its first `show` (`focusedDocument()`), in an internal
  map (not on the public `ToastRecord`); an update by id keeps it. `VddToasts` renders one container
  per document with visible toasts (the page's always), keyed per document; `maxVisible` still slices
  one queue. A document leaving removes its shown toasts and runs `onClose`; a queued one shows in the
  page. The adapter path is unchanged.
- Events (item 3) and the return button / `data-vdd-popout-kind` (item 4) were already right (P2b);
  confirmed by XPC3/XPC5 and the new browser case, no change.
- Playground `?rc=1`: `runtimeCss.ts` (a per-document cache inserting with `insertRule`), `RcWrapper.vue`,
  the `popper` icon, `#po-rc`, `#po-menu`, `#po-toast` in `PopPanel.vue`.

**Tests:** `test/components/popoutWrapper.test.ts` 17 (XPW1–XPW6; XPW6 ×10) and
`test/components/popOutChrome.test.ts` 18 (XPC1 ×3, XPC2 ×5 incl. the vdd addition "maxVisible across
windows, queued toast promoted into the page", XPC3 ×8, XPC4, XPC5). Baseline +17, +18. Browser
`m18.mjs`: `wrapper` (frame icon, menu item, toast from a click in the pop-out: 16 × 16 red there;
content styled there and after the return; no remount) and `returnButton` (default/nord × dark/light).

**Mutation checks:** unit, 27 single-line mutations: W1–W7 (content unwrapped, wrapper with popOut off,
window never switches, no provide, isPoppedOut false, wrapped only while out, window doc dropped), C1–C14
(frame, frame prop, document map, menu, toast doc, update moving, close keeping, onClose, queued in a
dead window, maxVisible per window, no main container, toast container unwrapped, kind), E1–E6 (registry
timing). 25 red. C13 (a re-read counter) was equivalent and removed; E3 (the epoch check in
`whenPlaced`'s `finish`, P2b code) survives: `tick` already drops a stale epoch and clears the limit.
Browser: frame / menu / toasts / content unwrapped each red at exactly its check; no wrapper at all → all
five red; toasts always in the page → red; the return button without `vdd-custom-tab-btn` → 4/4 red.
All restored.

**Results:** `npm run verify` PASS (1328/1328, 59 files); lint and types clean; build + `api-surface.mjs`
ok (53 runtime + 101 types); `npm run gate -- M18` PASS (10 browser cases).

**Divergences / decisions:**
- `<VddContextMenu>` / `<VddToasts>` are siblings of `<VddDesktop>`, so no provide reaches them: the
  desktop's `VddPopOutWindows` records its wrapper per open pop-out document and they look it up by their
  document (rdd moved its provider outside the menu's).
- `usePanelWindow()` returns an object whose `window` / `document` are live getters (typed `PanelWindow`,
  as rdd); destructuring in `setup` reads once (JSDoc says so).
- XPW2: in vdd the frame's patch moves the element and the wrapper re-renders in the same flush, before
  any app watcher; rdd commits the wrapper first. The test checks the flush.
- The JSDoc example spells the props out (`defineProps<{ window: Window; document: Document }>()`): the
  SFC compiler could not resolve an imported `PopoutWrapperProps` through the playground's alias. P7 docs
  should say so.
- Old `ms-playwright` crashpad handlers (2 days old, not test runs) matched the `ps` check; ignored.

**Open:** P5 (a widget's frame and `titleMenu` icon inside the wrapper; WG14's kind); P7 docs (the Vue
CSS-in-JS recipe, toasts across windows, Playwright's `hasFocus`); a menu opened from a plain `click`
closes on that click's bubble to `window` unless stopped (pre-existing, seen in the playground).

## P5: managed widgets in their own window (rdd S5 + 7.12.1 `view` + the S7 title-icon fix)

**Built (public additions only, rdd's shape):**
- `useFloatingWidgets().popOut(id): PopOutResult`, `ManagedWidget.canPopOut`,
  `WidgetHandle.isPoppedOut` (a `ComputedRef<boolean>`, as vdd's other handle state),
  `WidgetMenuContext.canPopOut` / `isPoppedOut` / `popOut()`. `backIntoPanel` was already in the
  messages. While out, `location` stays `'floating'`; `MoveResult` / `WidgetLocation` unchanged.
  `api-surface.json`: no new names (members only).
- `useWidgetHosting.ts`: `popOut` (checks first: `disabled` through `ws.popOutPanel` with its
  warning, `not-open`, `not-allowed` for no `canPopOut` / no workspace owner / hosted owner /
  `keepAlive: false`; then `popOuts.popOut(hostedId, { rect, view, prepare })`, nothing awaited
  before `open`; already out → its panel pops out), `isPoppedOut`, `opened` (the dev warning, once
  per widget), the `'floating|out'` container key, `registerHosted` (`returning` fires
  `onWillMove` and marks the entry, `returned` detaches), and the menu context.
- `VddPopOutFrame.vue`: a hosted panel with `titleMenu` items gets
  `button.vdd-popout-frame__icon.vdd-popout-frame__icon--menu` (`@pointerdown.stop`, click
  `stopPropagation`); Enter/Space open below the icon on the first item. CSS rule in
  `26a-popout.css`, `npm run css`.
- `VddWidgetScope.vue`: `isPoppedOut`, provides the content's `usePanelWindow()` (its own panel's
  window when out, else the owner's) and wraps it in the app's `popoutWrapper` for its whole life.
  `VddDesktop` provides the wrapper (internal `providePopoutWrapper`, `usePanelWindow.ts`).
- Playground: `?wo=1` (overlay `ov` beside p1 with widget `wo`, `canPopOut`, a `titleMenu` with
  the app's "Open in new window" and "Back into the panel"), `?opo=1` (overlay type `canPopOut`,
  `#wo-po-in` inside it), `#wo-po-btn` / `#ov-po-btn` in the bar. `ManagedContent` measures in
  `usePanelWindow().document`.

**Tests:** `test/components/popOutWidgets.test.ts` 36: XWG1 ×6, 2, 2b, 3 ×4, 4 ×4 (adds "from
docked and back"), 5 ×3, 6 ×4, 7, 8, 9 ×2, 9b, 10 ×4 (adds the click/press not reaching the
window, and the keyboard open in the window), 11, 12, 13, 14. `popOutFromPopOut.test.ts` +XFP6b
(widget-level: owner's window opens it, `left=150,top=290`, the widget lands there). Baseline
+36, 7 → 8. Browser `m18.mjs`: `widget` (out and back by closing, then by the return button: same
node, count, input, WebGL; one pair each way, `onMoved` at the window's and the panel's size;
kind `widget`; "Back into the panel"), `widgetMenu` (Enter and click open the menu in the window
and it stays; its item puts it back), `widgetFromOwner` (5.5 s wait, `opener.name` `vdd-popout-ov-*`,
screen origin = owner's `screenX/Y` + chrome + frame rect, back into its panel in the owner's window).

**Mutation checks:** unit U1–U27 + U19b (28): every one red, restored. Browser: click
`stopPropagation` dropped → Enter and click both red; `view` dropped → origin 30,286 vs 191,264;
`opener.open` → `window.open` → opener `""`; `returning` flag dropped → back calls
`will, will, moved`. All restored.

**Results:** `npm run verify` PASS (1365/1365, 60 files); build, `api-surface` (53 + 101),
`docs-api`, `css-prefix`, `css:check` ok; `npm run gate -- M18` PASS (13 browser cases).

**Divergences / decisions:**
- `returning` marks the entry "returning" (the sync watcher ignores its panel's steps until
  `returned`) where rdd sets the last key to `'floating'`: with a docked widget panel the return
  restores it docked first, which would fire a second `onWillMove` (XWG4's docked case).
- Keyboard open of the frame's menu: vdd's `menuPosition` doesn't place a 0,0 event at its target
  (P1, DA6), and `x`/`y` alone put the menu in the main body. The frame passes a stand-in
  `MouseEvent` of the child window at the icon's corner whose `target` is the icon. No API change.
- Without a `<VddDesktop>` (no registry) a widget's `popOut` returns `'no-window'`, as
  `popOutPanel` does; rdd always has its registry.
- Playground widget anchored top-left so the window fits headless Chrome's 800 px screen (Chrome
  moves a window back onto the screen, which hid the origin check at top-right).

**Open:** the in-panel widget title icon's keyboard open (`VddPanelOverlay.openTitleMenu`, x/y)
still opens in the main body when the owner panel is popped out (pre-existing, P1 scope); P6
focus; P7 docs (widget bullet, the app's own "Open in new window" item) and ADR/PARITY.

## P6: focus across windows (rdd S6) + P5's title-menu gap

**Built (no new exported names; `api-surface.json` unchanged, 53 + 101):**
- `src/core/workspace.ts`: `focusPanel(id)` on a popped-out panel also calls the registry's
  `focusWindow` (best effort; JSDoc added above the existing overload, its line untouched). The old
  body is now `activatePanel` (`@internal` member, appended), used by `focusPanelWindow`, by
  `openPanel` on an open panel (rdd's client forwards those to the core, which never focuses a
  window) and by activation inside a pop-out. `focusPanelWindow` was already complete from P2a.
- `VddDesktop.vue`: the registry's `pointerdown` listener checks `[data-vdd-popout]` first, and a new
  `focusin` listener (through `listenOnDocuments`) activates a pop-out's panel. In the page, focus
  alone still never activates.
- `VddPopOutFrame.vue`: `data-vdd-focused` (the floating window's attribute) while its panel is active.
- `VddTaskbar.vue`: popped-out panels after the minimised ones, `<button data-vdd-taskbar-popout>`
  with `.vdd-taskbar-item--popout` and the `.vdd-taskbar-item-popout-marker` SVG, label
  `"<title>: in its own window"` (`inOwnWindow`), click → `focusPanelWindow`; the taskbar shows (and
  scrolls) counting them. CSS in `06-taskbar.css`, `npm run css`.
- `src/core/contextMenu.ts`: internal `menuEventBelow(button)`, the stand-in event P5 built inline;
  `VddPopOutFrame` and `VddPanelOverlay.openTitleMenu` both use it, so a widget's in-panel title menu
  opened from the keyboard opens in the owner's window when that panel is out (P5's gap).
- Escape: already scoped per document (P1) for the menu and the flyout; confirmed, no change.
- Playground: `window.__toast` (main.ts) for the gate.

**Tests:** `test/components/popOutFocus.test.ts`, 19: XPF1 ×5, XPF2 ×2 (adds openPanel), XPF3 ×4,
XPF4 ×2, XPF4b (a flyout inside a real popped-out panel), XPF5 ×3 (adds compact mode), XPF6 ×2 (the
title-menu gap, and the page case). Baseline +19. Browser `m18.mjs`: `focusAcross` (click and focus
activate, `data-vdd-focused`, Escape both ways, taskbar entry, its marker placed, one `focus()`, gone on
return) and `focusWindow` (child/main `focus()` counts, active panel, `focusPanel`, unknown id; rdd's
`hasFocus` stub on the pop-out, toast lands in the page; without it, in the pop-out).

**Mutation checks:** unit 23: F1–F6, A1–A5, E1–E2, T1–T6, M1–M4. 21 red. T6 (the taskbar's own
`popOutEnabled` check) and M4 (the stand-in event built in the button's window) survived as
equivalent: the guard was removed (only `setPoppedOut` flags, and it refuses without `popOut`), and
the helper builds a plain `MouseEvent`, since only its position and `target` are read. Browser 10
(B1–B10: activation, focusin, the attribute, the menu's document check, the entry's click, the
marker's CSS, `focusPanel`, the main `focus()`, the child `focus()`, the recipe's stub): all red.
All restored.

**Results:** `npm run verify` PASS (1384/1384, 61 files); build, `api-surface`, `docs-api`,
`css-prefix`, `css:check` ok; `npm run gate -- M18` PASS (15 browser cases).

**Divergences / decisions:**
- `activatePanel` (internal) stands in for rdd's `setActivePanel` / core `focusPanel`, because vdd's
  components call the public `focusPanel`.
- The taskbar's pop-out entries are `<button>`s (as rdd); vdd's minimised items are `div`s, so the rule
  adds `position: relative; padding: 0; font: inherit`.
- The browser recipe stubs only the pop-out's `hasFocus` (vdd's `focusedDocument` checks pop-outs
  first, so a stub on the page is never read).

**Open:** P7 (docs: focus section, Playwright `hasFocus` recipe; ADR/PARITY).

## P7: docs, demo, release files and the M18 rules

**Built:**
- **Manual:** new `docs/manual/15-popout-windows.md`, mirroring rdd's guide section by section with
  vdd's names and Vue idioms, checked against vdd's code (turning it on and the warnings; the reasons
  in vdd's real order, with `'no-window'` right after `'disabled'` when no desktop is mounted; the
  gesture rule; `popoutUrl`, its page and YouTube's error 153; where a panel comes back; saving; styles
  and Vue SFC styles; the CSS-in-JS warning and an `@emotion/css` `popoutWrapper` recipe with the
  spelled-out `defineProps`; `usePanelWindow()` and its getters, Vue creating nodes with the main
  `document`; what reloads and the canvas pattern; widgets; focus and the taskbar; toasts; events;
  Playwright; the limits; messages; "Coming from react-dockable-desktop"). Short linked additions in
  chapters 03, 04, 05, 07, 08 (toasts), 10, 11, 12 (the five message keys, a table), 13 (every new
  public name; counts 53 + 101) and 14; the manual index and the root README.
- **PARITY.md:** §1 API map, §3 trace and test map (rdd file/ids → vdd file/X-ids, counts, and the
  rdd cases not ported with reasons: DA6, DA13, DA14, PO10's StrictMode case, and four browser
  cases covered elsewhere), §4 divergences (every one from P1–P6).
- **ADR 0022** (`docs/decisions/0022-popout-windows.md`), indexed: the registry owned by the desktop,
  the Teleport into the child body with the preserved slot, the wrapper looked up by document,
  Escape claims per document, `activatePanel`, the stand-in menu event, `returning`, `popOut` in the
  config type.
- **Demo:** `popOut: true`; `leafletMap` `canPopOut`; the Cameras widget `canPopOut` plus an "Open in
  new window" `titleMenu` item (`w.popOut()`); `demo/public/popout.html` (charset, title, the demo's
  favicon, empty body) as `` `${import.meta.env.BASE_URL}popout.html` `` (base `./`, resolved
  against the page).
- **M13 tour:** a last step on a second page (`?po=1&wo=1`) pops out `pp` and `wo` by real clicks
  and folds both windows' classes in. Finding: before it, M13's browser gate would have failed on
  the nine pop-out rules (the frame renders only in a child window); nobody had run M13 since P2b.
- **Release files:** version 1.14.0 (`package.json`, lock, `src/index.ts`); CHANGELOG `[1.14.0] —
  2026-11-22` with the parity line and Added / Changed / Tests / Documentation, and a fresh
  `[Unreleased]` (the file has no compare links). `api-surface.json` unchanged in P7 (53 + 101,
  additions only since 1.13.0).
- **Gate:** `scripts/gates/m18.mjs` replaces the placeholder, in M17's style (release files, ADR
  0022, chapter 15 and its key rules, the migration keys, the API reference names, PARITY's three
  sections and not-ported list, the pieces and the nine test files with count floors). Nine
  self-test mutations in `selftest.mjs`; M18 added to `gate:release`; the M18 entry in
  `IMPLEMENTATION_PLAN.md`; a PROGRESS row; `docs/evidence/M18.md`.

**Mutation checks (the new rules):** the nine self-test mutations, run one at a time against
`m18.mjs` with each file restored: 9/9 caught. The M13 step is load-bearing (it adds the nine
pop-out classes; the comparison fails without them).

**Demo check (real Chrome, `npm run demo` on :5190):** the Leaflet map out by its tab menu and back
by "Return to desktop", the same node, tiles loaded, taskbar entry; zoom works, drag-pan does not
(expected). The Cameras widget out by its menu and back by "Back into the panel", the same node; its
frame icon opens its menu in the window. No errors once the popout page had a favicon.

**Results:** `npm run verify` PASS (1384/1384, 61 files). `npm run gate -- M18` PASS (standing gate,
demo:build, M18, browser 15/15). `npm run gate:sweep` then `npm run gate -- M13` PASS (60 states,
254 rendered, 255 styled). `gate:release` and `gate:selftest` not run (the owner's).

**Open:** the independent docs review the plan calls for; `gate:release` and `gate:selftest`.

## Stale milestone rules (M3, M8, M9, M10, M11) — ADR 0023

- Code fixes: `applySnapshot` now resolves the active panel through `resolveActive` (M3: 3
  assignments again). `VddContextMenu.vue` names `window.addEventListener('click', …)` again (M8).
  The menu's and the flyout's `onKey` test `key === 'Escape'` (M8, M9). Behaviour is unchanged.
- Rules updated, intent kept: M3 checks `activatePanel` too and matches whole names. M9 and M11
  accept a Teleport into `docOf(...).body` and `isNode`. M10 and M11 accept `resizeObserverFor`,
  backed by its null fallback.
- Selftest: 13 new seeded checks; 3 stale anchors fixed (M11 toolbar and search, M10 panelId).
  Still MISSED, not part of these five rules: `non-vacuity … never executes`
  (contributions.test.ts blanked) and `M14 … managed widgets declaratively`.
- `npm run verify` PASS (1384 tests).

## 7.12.2 follow-up (2026-11-23)

MapEvolution tried the 1.14.0 tgz: everything worked except the pop-out frame's title icon, which had
no size, so an icon that takes its size from its box (their `mat-icon`, width/height auto) grew the
header to 309 px. rdd fixed it as 7.12.2, and 1.14.0 takes the same fix before it is published:

- `.vdd-popout-frame__icon` is a 14 × 14 box, as `.vdd-panel-float__icon`; in both boxes an `svg` or
  `img` is drawn at 14 × 14 (as a tab's icon slot does) and any other child is capped at the box, so
  a 16 × 16 icon shows at 14 × 14, not squeezed to 14 × 16 (the floating window did that before).
- M18's new `title icon` case; the `wrapper` case's frame icon now expects 14 × 14. Five CSS
  mutations, each caught (docs/evidence/M18.md).
- The parity line names rdd 7.12.2; M18's parity rule and its selftest seed moved with it, recorded
  in the pop-out ADR. PARITY's 7.12.x heading is unchanged.
- vdd only: chapter 02 explains that `useWorkspace()` inside a component returns a copy with a self-unsubscribing `subscribe` (MapEvolution's note).
