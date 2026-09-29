# Bug-fix plan: 1.1.2 and 1.2.0

**Status:** Draft, awaiting approval
**Source:** a user bug report of 21 items (2026-09-24). Every item was checked against the code
and reproduced in jsdom or headless Chromium where possible; all 21 are real (8 and 11 only
partly as described). This plan carries the corrections found during verification, not the
report's original fix proposals where they were wrong or incomplete.

---

## 1. Decisions

These change what gets built. The proposed answer is used unless the owner says otherwise.

| # | Question | Proposed | Alternative |
|---|---|---|---|
| D1 | How Escape is routed between overlays and transient UI | **One central Escape dispatcher** in the overlays core; transient UI claims Escape first | Keep per-listener handlers, adding a `defaultPrevented` convention and capture phase |
| D2 | One Escape with a left and a right drawer open | **Close only the most recently opened drawer** | Keep closing both, as today |
| D3 | `#panel-actions` slot, documented but never built (21a) | **Remove it from the docs and PARITY.md** | Build the slot |
| D4 | `interface MyEvents {}` fails TS2344 (21c) | **Loosen the `createWorkspace` constraint** so interfaces work, and keep the docs | Change the docs to `type MyEvents = {}` |
| D5 | A close guard vs the built-in dirty question (21f) | **Fix the docs to match the code:** the guard runs first, and the dirty question is still asked | Change the code so a guard replaces the question (behaviour change) |
| D6 | Release split | **1.1.2** (behaviour fixes, no API change), then **1.2.0** (new keyboard behaviour, a new token, new message keys) | One 1.2.0 release |

Any decision that makes vdd behave differently from react-dockable-desktop (rdd) is recorded
in [PARITY.md](../PARITY.md) §4, as [ADR 0012](../decisions/0012-fix-known-defects.md) requires.
D1 and D2 need an ADR (`0016-escape-dispatch.md`).

---

## 2. How every step runs

1. Branch from `main` (`fix/…` or `feat/…`).
2. **Write the regression test first and watch it fail** for the reason the report gives.
3. Implement the fix.
4. Run `npm test`, `npm run typecheck`, `npm run lint`, and the standing gates (`npm run gate`).
5. For RTL, CSS and keyboard steps, check the result in the playground (`npm run playground`).
6. Update the affected `docs/manual/` pages and add an entry under `## [Unreleased]` in
   CHANGELOG.md, in the existing style: bold one-line symptom, then cause and fix.
7. Commit, then open a PR for review. One PR per step.

Steps 1 and 2 must go in that order. Steps 3 to 6 are independent. Step 7 depends on step 1.

---

## 3. Release 1.1.2: behaviour fixes

### Step 1: Escape dispatch (`fix/escape-stack`), items 3, 10, 1 and D2

**Problem.** Every overlay and transient widget adds its own `keydown` listener on `document`.
`stopPropagation()` never stops other listeners on the same node, so one Escape reaches all of
them. Outcomes depend on registration order and on whether a close guard makes `close` async:

- A drawer opened after a modal closes along with it (3).
- A context menu, toolbar flyout or toolbar search inside a modal or drawer closes its host too (10).
- Left and right drawers close together.

**Fix (D1).**
- `src/core/overlays.ts`: keep an open-order stack and install **one** `keydown` listener on
  `document` (bubble phase) while any overlay is open. On Escape, if the event is not
  `defaultPrevented`, it closes the topmost dismissible modal, or else the most recently opened
  drawer (D2), through `requestClose`.
- `src/composables/useOverlayHost.ts`: remove `onKeydown` and its listener; register
  `dismissible` with the core instead.
- `VddContextMenu.vue` and `VddToolbarGroupButton.vue`: register their Escape listener on
  `document` in the **capture** phase and call `preventDefault()`. Capture-phase listeners run
  before the dispatcher wherever focus is and whatever order they registered in.
- `VddToolbarSearch.vue:155`: change `@keydown.esc` to `@keydown.esc.prevent`.
- Document it: an application widget inside a modal can call `preventDefault()` on Escape to
  keep the modal open.

**Item 1 in the same PR (context-menu slot mode).** Wrap the default slot in
`<div ref="customRoot" data-vdd-menu-custom style="display: contents">` and treat it as inside
in `onOutside`. Library dismissal (outside press and Escape) stays on in slot mode. Rewrite
`08-overlays.md:283-285` and the JSDoc at `VddContextMenu.vue:30-32`: the slot owns positioning
and keyboard handling, and the library still dismisses on Escape and outside press.

**Tests** (`test/components/overlays.test.ts`, `contextMenu.test.ts`, `toolbar.test.ts`):
- modal first, then a drawer, then Escape: only the modal closes (with and without a guard);
- a left and a right drawer, then Escape: only the later one closes;
- a context menu inside a modal, Escape on `document` and on `document.body`: only the menu closes;
- the same for a toolbar flyout, and for the search input inside a drawer;
- a widget that calls `preventDefault()` on Escape keeps its modal open;
- slot mode: `pointerdown` then `click` on a slot button runs the action; `pointerdown` on body
  dismisses.

**Docs:** 08-overlays.md (Escape behaviour, slot mode), ADR 0016, PARITY.md §4.

### Step 2: `usePanel()` inside a modal or side panel (`fix/overlay-panel-context`), item 5

**Problem.** `usePanel` reads all state from `ws.state.panels`, which holds no overlay
instances. Inside a modal or side panel:

- `onBeforeClose`, `onSaveState` and `minimize` register nothing and warn "rendered standalone";
- `title` returns the instance id;
- `dirty` stays `false` after `setDirty(true)`.

**Fix.**
- Extend `PanelContext` (`usePanel.ts:8-17`) with optional `title`, `dirty` (refs) and
  `onBeforeClose`.
- `useOverlayHost` supplies them from `current()`, with `onBeforeClose` calling
  `overlays.registerCloseGuard`.
- `usePanel` uses the context's values first and the workspace's second. It disposes the
  guard with `onScopeDispose`.
- Replace the misleading warnings with specific ones: `onSaveState` ("modals and side panels
  are not saved with the layout") and `minimize` ("modals and side panels cannot be minimised").

**Tests** (`test/composables/usePanel.test.ts`): inside a modal, a guard that returns `false`
blocks both Escape and `close()`; `title` and `dirty` show the overlay's values; no
"standalone" warning appears.

**Docs:** 08-overlays.md and 03-panels.md, which say what `usePanel()` offers inside an overlay.

### Step 3: toast adapter (`fix/toast-adapter`), items 2 and 15

**Problem.**
- `ToastAdapter.show` is never called; only a repeat of an existing id reaches the adapter
  (as `update`).
- In adapter mode every toast is still pushed to the built-in queue and never removed. When
  the adapter is later unset, all of them render at once.
- A dismissed id stays queued, so showing it again goes to `update` instead of `show`.

**Fix** (`src/core/toast.ts`, `VddToasts.vue`):
- In adapter mode, do not push to `items`. Track shown ids in a `Set`:
  - an unknown id goes to `show` and is added to the set;
  - a known id goes to `update`;
  - `dismiss` removes the id (or clears the set) and then calls `adapter.dismiss`.
- `VddToasts` registers its `defaultDuration` and `defaultClosable` on the store next to the
  adapter. `show` resolves `{ type: 'info', duration, closable, ...definedOptions, id }`,
  dropping keys whose value is `undefined` first. The report hard-coded `5000` and `true`,
  which would ignore these props.
- When an adapter is set, forward the toasts already queued to it and clear the queue.
- Clear the id set when the adapter changes and in `resetToasts`.
- `onClose` cannot fire in adapter mode, because the adapter has no way to report back.
  Document that; do not add a callback in a patch.

**Tests** (`test/components/toast.test.ts`):
- the call sequence is `show:x:a:info:<default>:<default>`, then `update:x:b`, then `dismiss`;
- dismissing `x` and showing it again calls `show`;
- the queue stays empty in adapter mode, and removing the adapter renders nothing stale;
- toasts queued before the adapter mounts are forwarded to it.

**Docs:** 08-overlays.md §toasts (the adapter contract and `onClose` in adapter mode).

### Step 4: `loadLayout` (`fix/load-layout`), item 4

**Problem.** A payload missing `floating`, `minimized` or `panels` makes `parseInitialState`
return an empty workspace. `loadLayout` then applies it and returns `true`, and every panel is gone.

**Fix** (`src/core/workspace.ts:828-853`): parse the JSON once and call `parseLayoutPayload`
directly. On invalid JSON or a `null` result, warn and return `false`, leaving state
unchanged. This loses nothing, because migration and repair live inside `parseLayoutPayload`,
and all rdd fixtures carry every field.

**Tests** (`test/compat/round-trip.test.ts`): each partial payload returns `false`, leaves
state unchanged, and warns once.

**Docs:** 05-persistence.md (what `loadLayout` rejects).

### Step 5: RTL direction (`fix/rtl-direction`), items 6, 7, 8 and 9

**Problem.** Pointer deltas are physical, while sizes, sides and tab indexes are logical, and
under RTL the flex rows reverse.

`VddSidebar` and `VddToolbar` sit *outside* `.vdd-workspace`, so `ws.state.isRtl` is the wrong
source for them. Only the element's computed direction is right everywhere.

**Fix.** Add a helper, `isRtlElement(el)` in `src/core/dragResize.ts`, that returns
`getComputedStyle(el).direction === 'rtl'`. Call it once per gesture.

| Item | File | Change |
|---|---|---|
| 6 | `VddWorkspaceGrid.vue:39-43` | negate `dx` for a row branch when the divider is RTL |
| 7 | `VddSidebar.vue:131-135` | `onRight = (position === 'right') !== isRtlElement(el)` |
| 8 | `VddToolbarGroupButton.vue:40-41` | pass the button's computed direction to `flyoutPlacement` and use the same value for the flyout's `dir` |
| 9 | `useDragDock.ts:157`, **`VddLeafGroup.vue:42`** (a second site the report missed) | one shared `tabSide(x, rect, rtl)` giving `physLeft !== rtl ? 'left' : 'right'` |

Also fix the comment at `index.css:2558`: it claims the sidebar inherits RTL from the
workspace root, but the sidebar is an ancestor of it.

**Tests** (jsdom, with `getComputedStyle` stubbed):
- under RTL, a +50px divider move shrinks `sizes[index]`;
- a `left` sidebar under RTL grows when dragged left;
- an RTL workspace inside an LTR strip places the flyout with `left`;
- under RTL, hovering a tab's left half gives `right` and inserts after it.

**Browser check** in the playground, in both directions.

**Docs:** 11-i18n.md (RTL section): the sidebar and toolbar follow the host's `dir`, not the
workspace's.

### Step 6: CSS, ARIA and docs (`fix/css-aria-docs`), items 11, 12, 13, 18 and 21

**Items 11 to 18:**

| Item | Change |
|---|---|
| 11 | Start `vdd-tooltip-fade-in` at `translateY(calc(-100% + 6px))`, and reduce the `::before` bridge to 8px so it no longer covers the top 4px of the icon (`index.css:590-641`) |
| 12 | Add the selector `.vdd-workspace.vdd-fill-viewport` to the rule at `index.css:197`; the zero-height warning (`VddDesktop.vue:144`) says the class can go on `<VddDesktop>` or a wrapper |
| 13 | Add a collapsed class to the strip with `border-width: 0`, and add `:inert="visible === false \|\| undefined"` (`VddToolbar.vue`, `index.css:2871`) |
| 18 | Flyout tools become `role="menuitemradio"` with `aria-checked`; context-menu checkbox items (and submenu items) become `menuitemcheckbox`; the toasts container gets `role="region"` |

**Item 21, the manual fixes:**

| Doc | Fix |
|---|---|
| 03-panels.md:144-154, PARITY.md:91 | remove `#panel-actions` (D3) |
| 04-layout.md:60 | the root path is `[]` |
| 04-layout.md:132 | keep `interface`, and loosen `createWorkspace<TEvents extends object>` in `workspace.ts:255` (D4); verify with `vue-tsc` that both `interface` and `type` compile |
| 12-migrating.md:96 | `widget-id="info"` |
| 10-theming.md:378-386 | fill the table with the seven tokens and their fallbacks, and correct the prose around it |
| 08-overlays.md:129-130 | the guard runs first, then the dirty question is still asked (D5) |
| 06-sidebar-toolbar.md:165 | only `useSidebar()` works from a workspace panel; `useSidebarTab()` throws there |

**Tests:**
- `stylesheet.test.ts` asserts the compound fill-viewport selector;
- a collapsed strip carries `inert`, and an expanded strip does not;
- the three ARIA fixes are asserted;
- a type test for D4.

### Release 1.1.2

- `package.json` and `src/index.ts` (`version`) go to `1.1.2`.
- In CHANGELOG.md, `## [Unreleased]` becomes `## [1.1.2] — <date>`. Its **Parity** line stays
  react-dockable-desktop 6.3.1 unless rdd has released since; check first.
- Regenerate `api-surface.json` if D4 changed the emitted `.d.ts` (`npm run build`, then the
  api-surface gate).
- Run `npm run gate -- M14` (the `prepublishOnly` gate) before tagging.

---

## 4. Release 1.2.0: new behaviour

### Step 7: keyboard accessibility (`feat/a11y-tabs-menu`), items 16 and 17

**Tabs** (`VddLeafGroup.vue`), following the WAI-ARIA tabs pattern with automatic activation:

- **Tab list:**
  - `role="tablist"` on `.vdd-tab-headers-container`;
  - a roving `tabindex` (0 on the selected tab, -1 on the others).
- **Keys:**
  - ArrowLeft/ArrowRight move between tabs and activate through `ws.focusPanel`; they swap
    under RTL;
  - Home and End go to the first and last tab;
  - Delete asks to close through `ws.requestClosePanel`, when `canClose !== false`.
- **Tab panel:**
  - `role="tabpanel"` and `aria-labelledby` on the group's single `.vdd-panel-body`;
  - `aria-controls` on each tab;
  - ids built from `useId()` and the leaf id, never from raw panel ids.
- **Close buttons:** the tab's × and the taskbar preview's × get `aria-hidden="true"`, since
  keyboard users close with Delete or the menu's Close item.

**Context menu** (`VddContextMenu.vue`), following the WAI-ARIA menu pattern:

- **Opening:** remember `document.activeElement`, then focus the first enabled item.
- **Moving:**
  - ArrowUp/Down move between items, wrapping and skipping disabled ones;
  - Home and End go to the first and last item.
- **Submenus** (their parents get `aria-haspopup="menu"`):
  - ArrowRight, Enter or Space opens a submenu and focuses its first item;
  - ArrowLeft returns to the parent;
  - Left and right swap under RTL.
- **Closing:**
  - Escape closes the submenu, or else the menu, and restores focus; it keeps step 1's
    capture phase and `preventDefault()`;
  - Tab closes the menu.
- **Activation:** activating an item closes the menu and restores focus.

**Tests:**
- roving tabindex, arrows and RTL, Home and End;
- Delete on a dirty tab asks first;
- the ARIA roles and ids are asserted;
- menu focus on open, the arrow keys, opening and closing submenus, focus restored after
  Escape and after activation, and Escape in a menu inside a modal.

Add an axe sweep with `axe-core` in jsdom over a desktop with tabs, an open menu and a
flyout, so these roles stay correct. This is a new dev dependency, so ask first (ADR 0015
pins the toolchain).

**Docs:** a keyboard section in 03-panels.md and 08-overlays.md.

### Step 8: theming, i18n and SSR (`feat/theming-i18n-ssr`), items 14, 19 and 20

**Item 14, the font token:**
- The four existing stacks become `font-family: var(--vdd-font-family, <one shared stack>)`
  (`index.css:207, 620, 797, 834`).
- The same declaration goes on the modal, side-panel, toast, flyout and search-dropdown
  roots, so chrome outside the workspace uses it too.
- Document it in 10-theming.md.
- This changes the default font of the context menu and of chrome outside the workspace;
  note that in the CHANGELOG.

**Item 19, message keys:**
- Add `notifications` and `closeNotification` to `defaultMessages`.
- `VddToasts`, `VddToastItem` and `VddSidebarDrawer` use `inject(WORKSPACE_KEY, null)`, with
  the English strings as the fallback.
- The drawer reuses the existing `close` key.
- In CHANGELOG.md and 11-i18n.md, warn that `Record<MessageKey, string>` tables need the two
  new keys.

**Item 20, SSR:**
- `useColorScheme` defaults to `'dark'` and creates its `MutationObserver` only on the client.
- `PanelDomCache` reads `document` lazily rather than in a parameter default, and uses
  `setAttribute('data-vdd-panel', …)`.
- Document `<ClientOnly>` as the supported way to use vdd under Nuxt or SSR.
- Add a `// @vitest-environment node` test that `renderToString(VddDesktop)` does not throw.

### Release 1.2.0

- Version `1.2.0`, in `package.json` and `src/index.ts`.
- CHANGELOG entries under `### Added` (keyboard support, the font token, the message keys,
  SSR-safe setup) and `### Changed` (default fonts, the `MessageKey` type), with the Parity line.
- Regenerate `api-surface.json`.
- Run the full gates.

---

## 5. Out of scope

- The Angular port (ndd) has the same defects for items 4, 5, 9 and 19, and for the Tab-order
  half of 13. That work belongs to its own repository.
- An `onClose` callback on `ToastAdapter` would be an API addition; consider it for a later
  minor release.
