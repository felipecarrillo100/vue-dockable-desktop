# 0010 — Component and composable naming

**Status:** Accepted — owner agreed to the rename, including `PanelFloatingWindow` → `<VddFloatingWidget>`

## Context

rdd's names carry React's framing. `WindowManager` is the central component, exported as
both `WindowManager` and a default; state and actions are split across
`useWindowManagerState` and `useWindowManagerActions` for re-render reasons that do not
exist in Vue; renderers are named `ModalStackRenderer` and `SidePanelRenderer`.

Vue convention is multi-word PascalCase components, conventionally prefixed for a library,
and `use*` composables.

## Decision

**Components** — `Vdd` prefix, so they are unmistakable in a template and cannot collide:

| Component | Replaces | Role |
|---|---|---|
| `<VddDesktop>` | `WindowManager` | The workspace: grid, floating windows, taskbar |
| `<VddSidebar>` / `<VddSecondarySidebar>` | `Sidebar` / `SecondarySidebar` | Activity bar + drawer |
| `<VddToolbar>` | `Toolbar` | App-level toolbar strip |
| `<VddSidePanels>` | `SidePanelRenderer` + `Left`/`Right` variants | Drawers; `side` prop instead of three components |
| `<VddModals>` | `ModalStackRenderer` | Modal stack host |
| `<VddToasts>` | `ToastContainer` | Notification host |
| `<VddContextMenu>` | `ContextMenu` + `ContextMenuProvider` | Menu host |
| `<VddConfirm>` | `ConfirmationForm` | Built-in confirm dialog |
| `<VddPanelOverlay>` | `PanelOverlayRoot` | Inner-panel overlay root |
| `<VddPanelToolbar>` | `PanelToolbar` | Toolbar attached to a panel edge |
| `<VddToolbarButton>` / `<VddToolbarToggle>` / `<VddToolbarSearch>` | same, unprefixed | Overlay toolbar controls |
| `<VddFloatingWidget>` | `PanelFloatingWindow` | Floating widget *inside* a panel |

`PanelFloatingWindow` → `VddFloatingWidget` is the one rename that changes vocabulary, and
deliberately: rdd's two "floating window" concepts (a workspace-level window holding a
panel, and a widget floating inside one panel) share a name and confuse readers of the
codebase. *Window* is now reserved for the workspace level, *widget* for the inner one.

**Composables:**

| Composable | Replaces |
|---|---|
| `useWorkspace()` | `useWindowManagerState` + `useWindowManagerActions` + `useRegistry` + `usePanelContext` |
| `usePanel()` | `useFormContainer` + `usePanelId` + `usePanelSize` |
| `usePanelContribution()` / `useActiveContribution()` | same / `useActivePanelContribution` |
| `useSidebar()` / `useSidebarTab()` | same |
| `useToolbar()` | same |
| `useContextMenu()` | `useShowContextMenu` |
| `useModals()` / `useSidePanels()` | `usePanelActions` (split by concern) |
| `useFloatingWidgets()` | `usePanelFloatingWindowManager` |
| `useColorScheme()` | same |
| `usePanelContextMenu()` | same |

**Unchanged:** `createWorkspace`, `toast`, every domain type
([PARITY.md](../PARITY.md) §1), and every action name.

## Consequences

- No name is shared with rdd at the component level, so the libraries cannot be confused in
  a codebase that has both.
- `usePanelActions` splitting into `useModals()` + `useSidePanels()` means a shell using
  both imports two composables. Judged clearer than one grab-bag.
- Agreed before implementation, which is when naming is cheapest to change.
