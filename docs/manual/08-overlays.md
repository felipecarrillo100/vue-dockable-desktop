# 8. Modals, side panels and toasts

Three things that appear over the workspace rather than inside it. All three are driven from
plain function calls that work anywhere — a component, a store, a service, an HTTP
interceptor — because the state behind them lives on the workspace, not in a provider.

Mount the hosts once, at your app root:

```vue
<template>
  <VddDesktop />
  <VddSidePanels />
  <VddModals />
  <VddToasts position="top-right" />
</template>
```

Where you put them in the tree does not matter: all three position themselves and stack
themselves. What matters is that they are mounted — see "Mount `<VddModals>`" below for the
one case where forgetting has a visible consequence.

## Modals

```ts
const { open, close, closeAll, stack, topmost } = useModals()

const id = open(EditFeature, { featureId: 42 }, { title: 'Edit feature', size: 'medium' })
```

`open` returns the instance id, which is what `close(id)` takes. Modals stack, so opening one
never closes another, and a modal opened from inside a modal lands on top of it.

| Option | |
|---|---|
| `title` | Header title. A string or a message descriptor. |
| `icon` | A component, shown before the title. |
| `size` | `small` · `medium` · `large` · `fullscreen` · `auto` (default) |
| `closable` | `false` removes the × *and* dismissal by Escape or backdrop click. |
| `bodyPadding` | A number (px) or any CSS value. Unset by default, so content goes edge-to-edge. |

**Escape** goes to the topmost modal, one modal per press. A modal opened with
`closable: false` ignores it — which is how you make a dialog the user must answer.

Something open *inside* a modal takes Escape first: a context menu, a toolbar flyout or a
toolbar search closes, and the modal stays. Your own widgets can do the same — a combobox or
date picker that closes its popup on Escape calls `event.preventDefault()`, and the modal
leaves that press alone.

The component you pass receives its props plus `panelId`, and can use `usePanel()` to close
itself, rename its own header or mark itself dirty:

```vue
<script setup lang="ts">
const panel = usePanel()
panel.setTitle('Editing "Substation 4"')
function save() { panel.setDirty(false); panel.close() }
</script>
```

## Side panels

Two drawers, one per edge:

```ts
const { openLeft, openRight, close, left, right, closeAll } = useSidePanels()

await openLeft(LayerList, { layers }, { title: 'Layers', width: 320 })
```

Options are `title`, `icon`, `width` (a number in px, or any CSS string like `'30vw'`;
default 400) and `bodyPadding`.

`openLeft` and `openRight` are **async**, and this is worth understanding: each side holds one
panel, so opening is also closing whatever was there. If the occupant has registered a close
guard and it refuses, nothing opens and the call resolves to `null`:

```ts
const id = await openLeft(NewPanel, {})
if (id === null) {
  // the panel that was already there refused to go
}
```

A synchronous return would have to either ignore the guard or lie about the id.

**Escape** closes a drawer only when no modal is open. A modal is always on top of a drawer,
so it always gets the key first — whichever was opened first. With a drawer open on each side,
one press closes the one opened last, and the next press the other. As with modals, a menu,
flyout or search box inside the drawer takes the key first, and so does a widget of yours that
calls `event.preventDefault()`.

## Unsaved changes

Any panel — docked, floating, a drawer or a modal — can mark itself dirty:

```ts
const panel = usePanel()
watch(form, () => panel.setDirty(true))
```

A dirty panel shows an asterisk after its title, and closing it asks the user first, through
the library's own dialog:

> **Unsaved Changes**
> "Layers" has unsaved changes. Do you want to discard your changes and close?
> [No] [Yes]

Every close path goes through this: a tab's ×, a floating window's ×, the taskbar menu, a
drawer's ×, Escape, and `usePanel().close()`. You do not wire it up anywhere.

Customise the wording per panel:

```ts
panel.setDirty(true, {
  title: 'Discard measurements?',
  message: 'Three measurements have not been saved to the project.',
  alert: 'Depth field is still empty',
  alertType: 'warning',
})
```

Skip the question entirely with `close({ force: true })` — which also skips close guards, so
use it for "discard" buttons, not for ordinary closes.

### Close guards

For anything more than a dirty flag, veto the close yourself:

```ts
const panel = usePanel()
panel.onBeforeClose(async () => {
  if (!hasUnsyncedEdits.value) return true
  return await askOurOwnWay()
})
```

Return `false`, or a promise of `false`, to block. The guard is registered in `setup` and
disposed with the component — there is nothing to unsubscribe. It covers every way the overlay
can close: Escape, the backdrop, the × and `close()`.

The guard runs **before** the dirty check, not instead of it. If the guard allows the close
and the panel is dirty, the built-in question is still asked. To replace the question with
your own, keep the panel clean and ask in the guard.

### Mount `<VddModals>`

The unsaved-changes question is itself a modal, so it needs `<VddModals>` mounted to appear.
Without it, **a dirty close refuses instead of discarding** — the panel simply stays open.
That is deliberate: losing a user's edits because a host component was missing is not a
failure mode worth having. If closes are silently doing nothing, check that `<VddModals>` is
mounted.

## `<VddConfirm>`

The dialog body the library uses, available for your own confirmations:

```ts
const { open } = useModals()

open(VddConfirm, {
  message: 'Delete 4 selected features? This cannot be undone.',
  alert: 'Two of them are referenced by other layers',
  alertType: 'danger',
  yesNo: true,
  onOk: () => deleteSelection(),
}, { title: 'Delete features', size: 'small' })
```

`yesNo` labels the buttons Yes/No instead of OK/Cancel. `onSettled(ok)` fires exactly once
however the dialog goes away — button, Escape, backdrop or × — which is what you want when
you are awaiting an answer rather than reacting to a click.

## Toasts

```ts
import { toast } from 'vue-dockable-desktop'

toast.success('Layout saved')
toast.error('Upload failed', { duration: 0 })          // 0 = sticky
toast.info('Reprojecting…', { id: 'reproject' })       // same id updates in place
toast.dismiss('reproject')
toast.dismiss()                                        // all of them
```

`toast` is a plain import, not a hook — call it from a service, a store action, an error
handler, anywhere. Nothing needs to be injected.

Per-toast options: `type`, `duration`, `id` (for dedup), `closable`, `icon`, `content` (a
component, instead of the message string) and `onClose`.

### Tracking a promise

```ts
await toast.promise(saveProject(), {
  pending: 'Saving project…',
  success: p => `Saved ${p.name}`,
  error: e => `Could not save: ${(e as Error).message}`,
})
```

A sticky "pending" toast appears immediately and is updated in place when the promise
settles — the same card, not a second one. The promise is returned unchanged, so this drops
into an existing chain.

### `<VddToasts>`

| Prop | Default | |
|---|---|---|
| `position` | `'top-right'` | also `top-left`, `bottom-left`, `bottom-right` |
| `maxVisible` | `3` | extras wait their turn |
| `defaultDuration` | `5000` | `0` makes every toast sticky |
| `defaultClosable` | `true` | show the × |
| `pauseOnHover` | `true` | hold the timer while the pointer is over a toast |
| `animation` | `'slide'` | also `'fade'`, `'none'` |
| `newestOnTop` | `false` | |
| `progressBar` | `false` | countdown bar along the bottom |
| `width` | `320` | card width in px |

Beyond `maxVisible`, toasts queue and are promoted as the ones on screen leave. A queued
toast can still be dismissed by id before it is ever shown.

### Using your own notification UI

Pass an `adapter` to route every `toast.*` call to another library — Sonner, Vuetify's
snackbar, your own component — without changing a single call site:

```ts
const adapter: ToastAdapter = {
  show: (id, message, options) => mySnackbar.show({ id, message, severity: options.type }),
  update: (id, message, patch) => mySnackbar.update(id, { message, severity: patch.type }),
  dismiss: (id) => mySnackbar.dismiss(id),
  component: null,   // the adapter owns its own DOM
}
```

Give `component` a component instead of `null` and `<VddToasts>` renders it, with a
`position` prop, in place of the built-in list.

What the adapter receives:

- `show` for a toast it does not have yet, with every option filled in — `type`, and the
  container's `defaultDuration` and `defaultClosable` where the call left them out.
- `update` for a call that reuses the id of a toast it is showing, including the settled
  message of a `toast.promise()`. `patch` holds only what the call passed.
- `dismiss` for `toast.dismiss(id)`, or with no id for `toast.dismiss()`. An id dismissed and
  then used again arrives as a new `show`.

Toasts raised before `<VddToasts>` mounts its adapter are handed to it when it does. While an
adapter is set, nothing is kept in the built-in queue: the adapter owns the toasts, their
timers and their removal. Since it has no way to report a toast it removed by itself, a toast's
`onClose` callback is not called in adapter mode.

## Context menus

Mount `<VddContextMenu>` once, then open a menu from anywhere:

```ts
const showMenu = useContextMenu()

function onRightClick(event: MouseEvent, feature: Feature) {
  showMenu({
    event,
    items: [
      { label: 'Zoom to', icon: Target, action: () => zoomTo(feature) },
      { label: 'Snapping', checkbox: { value: snapping.value }, action: toggleSnapping },
      { separator: true },
      { label: 'Export as', items: [
        { label: 'GeoJSON', action: () => exportAs('geojson') },
        { label: 'Shapefile', action: () => exportAs('shp'), disabled: !canShp.value },
      ] },
      { separator: true },
      { label: 'Delete', action: () => remove(feature), disabled: feature.locked },
    ],
  })
}
```

Pass `event` and the menu appears at the pointer, clamped to stay on screen; pass `x`/`y`
instead to place it yourself. It closes on Escape, on an outside click, and when an item
runs.

Four item kinds:

| | |
|---|---|
| **simple** | `label`, optional `icon`, `title` (tooltip), `action`, `disabled` |
| **checkbox** | a simple item with `checkbox: { value }`; `active: false` hides the column |
| **separator** | `{ separator: true }` |
| **submenu** | `label` plus `items`. One level deep. |

A submenu opens after the pointer rests on its parent briefly, and stays open long enough for
the pointer to travel into it. Both timings are deliberate: opening instantly makes the menu
twitchy, closing instantly makes a submenu unreachable.

To contribute items to a *panel's own* menu — the one on its tab, its window title bar and
its taskbar icon — see [Panels](03-panels.md#panel-context-menu).

### Rendering the menu yourself

Give `<VddContextMenu>` a default slot and it hands you the pending menu instead of drawing
one:

```vue
<VddContextMenu v-slot="{ items, x, y, close }">
  <MyMenu :items="items" :style="{ left: `${x}px`, top: `${y}px` }" @dismiss="close" />
</VddContextMenu>
```

Positioning and keyboard navigation become yours — the built-in viewport clamping belongs to
the markup you are replacing. Dismissal does not: Escape and a press outside your markup still
close the menu, and a press inside it does not, so your items receive their clicks. Call
`close` when an item has run. This is what rdd's `ContextMenuAdapter` did, minus the adapter
object, the provider and the ref handshake.

## Coming from react-dockable-desktop

| rdd | vdd |
|---|---|
| `<PanelProvider>` | nothing — the state is on the workspace |
| `usePanelActions().openModal(C, p, o)` | `useModals().open(C, p, o)`, or `workspace.overlays.openModal` |
| `usePanelActions().openLeftPanel` | `useSidePanels().openLeft` |
| `usePanelState().modals` | `useModals().stack` |
| `close(id)` (immediate) | `close(id)` asks; `close(id, { force: true })` does not |
| `closeAll()` | `useSidePanels().closeAll()` (drawers) / `useModals().closeAll()` (stack) |
| `registerCloseHandler` | `usePanel().onBeforeClose` |
| `<SidePanelRenderer>` | `<VddSidePanels>` |
| `<LeftPanelRenderer>` / `<RightPanelRenderer>` | `<VddSidePanels sides="left" />` / `"right"` |
| `<ModalStackRenderer>` | `<VddModals>` |
| `<ToastContainer>` | `<VddToasts>` |
| `<ConfirmationForm>` | `<VddConfirm>` — `useYesNoTitles` is now `yesNo`, `onOK` is `onOk` |
| `<ContextMenuProvider>` / `useShowContextMenu` | `useContextMenu()` — no provider |
| `ContextMenuAdapter` / `DefaultContextMenuAdapter` | `<VddContextMenu>`'s default slot |

Two behavioural differences:

- **`close(id)` asks.** rdd's `close(id)` removed the instance outright and its containers
  called it only after their own dirty check; vdd's goes through the guard and the dirty
  question. Pass `{ force: true }` for the old behaviour.
- **Closing a dirty *docked* panel now asks.** rdd wired its confirmation into the drawer and
  modal renderers and never into the workspace, so closing a dirty tab discarded the edits
  without a word.
