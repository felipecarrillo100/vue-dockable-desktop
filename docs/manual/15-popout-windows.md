# 15. Pop-out windows

From 1.14.0 (rdd 7.12.0 and 7.12.1) a panel can move into **its own browser window**, for a second
monitor, and come back. It is still the same panel: its component never remounts, so its state,
scroll offsets and a canvas's WebGL context go with it. A managed widget that left its panel
([chapter 14](14-widgets-out-of-the-panel.md)) can go into a window too.

Typical uses: a map on the second screen while the forms stay on the first; a chart or a results
table pulled out to sit beside another application; a video wall of camera feeds.

## Turning it on

Two switches, both off by default:

```ts
import { createWorkspace } from 'vue-dockable-desktop'

const workspace = createWorkspace({
  popOut: true,                                                            // the workspace allows windows
  panels: {
    map:   { component: MapPanel,   defaultOptions: { canPopOut: true } }, // this type may go
    notes: { component: NotesPanel },                                       // this one may not
  },
})
```

- **`createWorkspace({ popOut: true })`** is set once, at creation, and is not kept on
  `workspace.config`. With `popOut: false` nothing of it runs: no menu item, no listeners, no style
  copying, no wrapper, and `popOutPanel()` returns `{ ok: false, reason: 'disabled' }` (with a
  one-time console warning outside production builds).
- **`defaultOptions.canPopOut: true`** opts a panel type in. It gates the menu item and
  `popOutPanel()`, for new calls only: see [Things to know](#things-to-know).
- Outside production builds, a type in `panels` that sets `canPopOut` on a workspace without `popOut`
  gets a console warning when the workspace is created. So does a managed widget with `canPopOut`,
  once per widget, when it opens.

The user then gets **"Open in new window"** in those panels' tab menu and title-bar menu (after
Float), and at the top of the floating window's ⋮ menu. The window opens over the panel, at its size
(at least 320 × 240). A panel with no box on screen (a tab that isn't selected, a minimised panel)
can pop out too; its window opens at 640 × 480, 100 px from the main window's corner. The position
isn't clamped, so a monitor left of or above the main one works.

## From code: `popOutPanel()` and `returnPanel()`

```vue
<!-- PopOutButton.vue -->
<script setup lang="ts">
import { useWorkspace } from 'vue-dockable-desktop'

const props = defineProps<{ id: string }>()
const ws = useWorkspace()

function popOut() {
  const result = ws.popOutPanel(props.id)
  if (!result.ok && result.reason === 'blocked') showHint('Allow pop-ups for this site.')
}
</script>

<template>
  <button @click="popOut">Open in new window</button>
</template>
```

```ts
ws.returnPanel(id)   // → { ok: boolean }: back where it was; false when it wasn't in a window
```

`popOutPanel(id)` is **synchronous**, and must come **from a user's activation** (a click or a key
press): browsers only open a window then. The browser tells (`navigator.userActivation`): a call
made inside the click, or in an event-bus handler of an event published in it, works; one made long
after it (a slow promise, a timer) or not triggered by the user gives `'no-gesture'`. In a browser
that can't tell, the call is tried, and the pop-up blocker may answer `'blocked'`. When your code
decides later (an assistant that suggests moving the map), show a button and pop out from its click.

**A click in any of the app's windows counts, a pop-out's included** (rdd 7.12.1): a button in a
popped-out panel can pop out another panel, and the window the user clicked is the one that opens
the new window, so the browser allows it.

It returns a `PopOutResult`: `{ ok: true }`, or `{ ok: false, reason }`. The checks run in this order:

| `reason` | When |
|---|---|
| `disabled` | The workspace was created without `popOut: true` |
| `no-window` | No `<VddDesktop>` is mounted: nothing could show the panel in a window |
| `not-open` | No open panel has this id |
| `not-allowed` | The panel's type has no `canPopOut` (for a widget's panel, the widget's rules decide, [below](#widgets-in-their-own-window)) |
| `no-gesture` | The call didn't come from a user's activation, so nothing was opened |
| `blocked` | The browser's pop-up blocker refused the window |
| `no-window` | The window closed, or couldn't be used, before the panel moved in |
| `not-allowed` | A widget that couldn't leave its panel after all (its window closes again) |

A panel that is already out stops after the first `not-allowed` check: its window comes forward and
the call returns `{ ok: true }`. On a refusal the panel stays where it was, and **nothing is shown to
the user**: your code decides what to say. Only the built-in "Open in new window" item shows a toast
(`toast.warning`, the `popOutBlocked` message), on `blocked`.

The windows belong to `<VddDesktop>`: it creates them and lends them to the workspace while it is
mounted. Before it mounts (a call in `main.ts`, say) the answer is `'no-window'`, after `'disabled'`.

## The page the window opens: `popoutUrl`

Without it, the window opens blank, which works. For a window with your own favicon, give the
desktop a page of your app, on the same origin:

```vue
<VddDesktop popout-url="popout.html" />
```

A relative URL is resolved against the main page's (`document.baseURI`), whichever window opens it.
The page needs nothing but a body. The library waits for it to load, adds its own base styles (no
margin, full height) and moves the panel in. Put it in your static folder (`public/` in Vite):

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>My App</title>
  </head>
  <body></body>
</html>
```

The window's title follows the panel's, with or without it: your page's `<title>` shows only until
the panel's replaces it. A page that can't be read (another origin, or a redirect off this one), or
that doesn't load within 10 seconds, sends the panel back and closes the window, with a console
warning outside production builds. That happens after `popOutPanel()` has returned `{ ok: true }` and `panel:popping-out` was
sent, so listen for `panel:returned` if you need to know.

With a base path (Vite's `base`), include it, or keep the URL relative as above:
`` :popout-url="`${import.meta.env.BASE_URL}popout.html`" ``. A relative `base: './'` works either way,
because the URL is resolved against the page's.

**When you need it:** some third-party embeds refuse to play in a blank window. A YouTube player,
for one, shows error 153: it checks the page that embeds it, and a blank window has no address of
its own. Set `popoutUrl` and they work.

## Coming back

A panel comes back when:

- the user closes the window, or clicks its **"Return to desktop"** button (the icon button at the
  end of the window's header bar, styled as a floating window's title-bar buttons; its label is the
  tooltip and the accessible name);
- your code calls `returnPanel(id)`;
- your code moves it: `minimizePanel`, `dockPanel`, `dockPanelToGroup` and `dockPanelToWorkspaceEdge`
  bring it back to its place first, then apply. `movePanelOrder(id, leafId, index)` is different: it
  takes the panel straight into that group, not through its old place;
- the main page unloads, or `<VddDesktop>` unmounts (a route change).

`closePanel(id)` closes its window with it, and `loadLayout()` closes every window and shows the
loaded layout.

### Where it comes back to

A panel that was floating floats at its rect again. One that was docked goes, in this order:

1. into the group of its tab-mates, among their tabs, when one of them is still docked;
2. into its own group, when that group was kept and waits empty;
3. beside the panels it was next to, on the same side and at the same size; if those are gone too,
   beside the nearest part of its old layout that is still docked;
4. into the grid, when no panel is docked there;
5. otherwise floating (or into the first group, for a type that can't float).

Several panels out at once come back, in any order, to the layout they left.

**The promise:** the place is exact when the rest of the layout is unchanged, and the closest place
when it changed.

### Saving the layout

`saveLayout()` writes a panel that is out **at the place it would come back to**: docked in its
place, or floating at its rect. So a saved layout is the one from before it left, and it loads in
react-dockable-desktop as any other ([chapter 5](05-persistence.md)).

Nothing reopens in a window after a reload: a window may only open from a user's click, and the
pop-up blocker would refuse it. The panel is in the page, and "Open in new window" takes it out
again in one click. (`PanelInfo.poppedOut` is runtime only; a loaded layout never has it.)

## Styles in the window

A pop-out looks like the page, with nothing to set up for plain CSS:

- every `<link rel="stylesheet">` and `<style>` of the page's `<head>` is copied, in order, and so are
  `document.adoptedStyleSheets` (as text). `<link>` and `<style>` tags added, removed or edited later
  follow. Adopted sheets are read again only when the page's `<head>` or `<html>`'s attributes change
  (they are not polled), so a sheet adopted or edited with no such change reaches the window at the
  next one;
- `<html>`'s and `<body>`'s attributes and classes (`dir`, `lang`, `.dark`, `data-bs-theme`, the
  skin, the colour scheme), their inline CSS variables (`--vdd-brand-*` included) and `color-scheme`
  are mirrored, and follow a change;
- the frame carries `.vdd-workspace` with the workspace's colour scheme, skin and animation switch,
  so rules scoped to the workspace apply inside it;
- the window stays hidden until the copied stylesheets have loaded (3 seconds at most), so nothing
  shows unstyled.

**Vue single-file components need nothing.** Their `<style>` blocks (scoped, modules or plain) are
`<style>` tags in the page's `<head>` in development, where Vite injects them and hot reload edits
them, and `<link rel="stylesheet">` tags in a production build, where they are extracted. Both are
copied. Scoped styles keep working because their `data-v-*` attributes are on the elements, which
move with the panel.

### CSS-in-JS needs `popoutWrapper`

> **Looks right in development, unstyled in production.** A library that adds its rules with
> `insertRule` (the CSSOM) leaves its `<style>` tags **empty**, so the head copy has nothing to copy.
> Several runtime CSS-in-JS libraries (Emotion's, styled-components' and their kind) do that in
> production and write text into the tags in development, so the window looks fine until you build.
> Test a production build.
>
> This covers more than the panel's content: what you hand the library is styled the same way. A
> panel's or a widget's `icon` (shown in the window's header), the `icon` of a menu item, a toast's
> content. An icon component without its rules may measure 0 × 0, and can't be clicked.

The fix is to give the library a style target per document. `<VddDesktop :popout-wrapper>` takes a
component that is rendered around every panel's content, given the `window` and `document` the panel
is in as props (`PopoutWrapperProps`), and rendering its default slot. It is in the tree for the
panel's whole life while the workspace has `popOut` (and never without it), so nothing remounts.
Its `window` and `document` switch to the pop-out's in the same render that moves the panel into it,
and back on return.

It is also around a managed widget's content, for the widget's whole life. In a pop-out it is
also rendered around the window's frame (the header with the icon and the title), around a context
menu shown there, and around the toasts shown there, with that window's `window` and `document`. In
the main window those stay as they are. `<VddContextMenu>` and `<VddToasts>` find the wrapper by the
document they show in, so it reaches them wherever you mount them. So the wrapper is rendered more
than once per window: keep **one cache per document**, as the `WeakMap` below does, not one per
wrapper instance.

**Emotion (`@emotion/css`):** one instance per document, given to the content by `provide`.

```ts
// popoutCss.ts
import createEmotion from '@emotion/css/create-instance'
import type { ComputedRef, InjectionKey } from 'vue'

type Emotion = ReturnType<typeof createEmotion>
const instances = new WeakMap<Document, Emotion>()

export function emotionFor(doc: Document): Emotion {
  let emotion = instances.get(doc)
  if (!emotion) {
    // A key of your own for the pop-outs, so it doesn't clash with the page's.
    emotion = createEmotion({ key: doc === document ? 'css' : 'pop', container: doc.head })
    instances.set(doc, emotion)
  }
  return emotion
}

export const EMOTION = Symbol('emotion') as InjectionKey<ComputedRef<Emotion>>
```

```vue
<!-- PopoutWrapper.vue -->
<script setup lang="ts">
import { computed, provide } from 'vue'
import { EMOTION, emotionFor } from './popoutCss'

// PopoutWrapperProps, spelled out: see the note below.
const props = defineProps<{ window: Window; document: Document }>()
provide(EMOTION, computed(() => emotionFor(props.document)))
</script>

<template><slot /></template>
```

```vue
<!-- App.vue -->
<script setup lang="ts">
import { VddDesktop } from 'vue-dockable-desktop'
import PopoutWrapper from './PopoutWrapper.vue'
</script>

<template>
  <VddDesktop popout-url="popout.html" :popout-wrapper="PopoutWrapper" />
</template>
```

Content then builds its classes from the injected instance, inside a `computed` so they follow the
panel: `const emotion = inject(EMOTION)!` and `computed(() => emotion.value.css({ color: 'teal' }))`.

- **Spell the props out.** Write `defineProps<{ window: Window; document: Document }>()` rather than
  `defineProps<PopoutWrapperProps>()`. The SFC compiler has to resolve a props type at build time,
  and it can't resolve an imported one in every setup (it failed through the playground's path
  alias); `PopoutWrapperProps` is there to check yours against.
- **Pass a stable component:** one you import or define once, not one made in a render. Kept in
  reactive state, wrap it in `markRaw`.
- Your app's own `provide`s above `<VddDesktop>` still reach the panel: the panel's component never
  leaves the app's tree, only its element moves.

## Code in a pop-out window

A panel's content runs in the main page's JavaScript, but is shown in another window. Most code works
unchanged. What doesn't is code that reaches for the global `window` or `document`. Use
**`usePanelWindow()`**: the `window` and `document` the panel is in now (a `PanelWindow`). They change
when the panel pops out and when it returns.

**Its fields are live getters.** Read `panelWindow.window` inside a `watch` source, a `computed` or
the template, so code follows the change. Destructuring it in `setup`
(`const { window } = usePanelWindow()`) reads it once.

```vue
<script setup lang="ts">
import { watch } from 'vue'
import { usePanel, usePanelWindow } from 'vue-dockable-desktop'

const panelWindow = usePanelWindow()
const { isPoppedOut } = usePanel()

watch(() => panelWindow.window, (win, _old, onCleanup) => {
  const redraw = () => draw(win.devicePixelRatio)
  const dark = win.matchMedia('(prefers-color-scheme: dark)')
  win.addEventListener('resize', redraw)
  dark.addEventListener('change', redraw)
  let frame = win.requestAnimationFrame(function tick() { animate(); frame = win.requestAnimationFrame(tick) })
  onCleanup(() => {
    win.removeEventListener('resize', redraw)
    dark.removeEventListener('change', redraw)
    win.cancelAnimationFrame(frame)
  })
}, { immediate: true })
</script>

<template>
  <canvas :title="isPoppedOut ? 'In its own window' : undefined" />
</template>
```

- **Its own `requestAnimationFrame`.** A browser may slow down or pause the frames of a window that is
  hidden. The main page's frames stop when the main window is minimised, while the pop-out is on
  screen. Use the panel's window's.
- **Libraries that listen on the global `document`** don't hear the pointer or the keyboard in a
  pop-out either. Leaflet 1.9, for one, follows a map drag with listeners on `document`: in a pop-out
  its map zooms (wheel and buttons) but doesn't pan by dragging. LuciadRIA's keyboard navigation
  listens on the main `document` too, so its keys do nothing in a pop-out. Check your map, chart or
  grid library in a pop-out before you turn on `canPopOut` for its panel.
- **`devicePixelRatio` and `matchMedia`** are per window: the second monitor may have another scale.
- **Listeners** for keys, pointer moves and resizes go on the panel's window or document. A drag that
  listens on the global `document` never hears the pointer in the pop-out.
- **No `instanceof` for DOM nodes.** Each window has its own `HTMLElement`, so
  `node instanceof HTMLElement` is `false` for a node the pop-out made. Check `node.nodeType === 1`.
  Vue's own nodes make this worse, not better: the next point.
- **Nodes created while out belong to the child window's document.** Vue's renderer creates every
  element with the main page's `document`; inserted into the pop-out, the pop-out's document adopts
  it, so its `ownerDocument` is the pop-out's, and it comes back with the panel. Its prototype stays
  the main window's, while a node the pop-out's document made itself has the pop-out's, so
  `instanceof` gives a different answer for two nodes side by side. Ask the node:
  `node.ownerDocument`, `node.ownerDocument.defaultView`.
- **Portals of your UI library** (menus, tooltips, dialogs) go to the global `document.body` by
  default, so they would open in the main window. Give them a container in the panel's document: a
  `<Teleport :to="panelWindow.document.body">` of your own, or your library's equivalent prop. The
  library's own context menus, the toolbar flyout and the toolbar search's dropdown already open in
  the window they were opened from.

`usePanel().isPoppedOut` (a `ComputedRef<boolean>`) says whether the panel is in its own window.
`isFloating` is also true then: the panel is a floating panel whose window the workspace doesn't
draw. Outside a workspace panel (a modal, a side panel), `usePanelWindow()` is the main window and
`isPoppedOut` is false.

### What reloads

Moving an element into another document can't use `moveBefore()`, so:

- **An `<iframe>` reloads** on pop-out and on return, even with `preserveEmbeds`.
- **A `<video>` may reload**, depending on the browser.
- **A `<canvas>` keeps its drawing and its WebGL context.**

For media, keep the source out of the moved element and paint it: a `<video>` element that stays in
the main document (not shown) and a `<canvas>` in the panel that draws its frames, with the panel's
window's `requestAnimationFrame`. The canvas moves; the video never does.

```vue
<!-- CameraFeed.vue -->
<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { usePanelWindow } from 'vue-dockable-desktop'

const props = defineProps<{ src: string }>()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const panelWindow = usePanelWindow()

// The main document's <video>, never attached, so it never moves.
const video = Object.assign(document.createElement('video'), { src: props.src, muted: true, loop: true, playsInline: true })
video.play().catch(() => {})
onBeforeUnmount(() => video.pause())

watch([() => panelWindow.window, canvas], ([win, el], _old, onCleanup) => {
  if (!el) return
  const ctx = el.getContext('2d')!
  let frame = win.requestAnimationFrame(function paint() {
    ctx.drawImage(video, 0, 0, el.width, el.height)
    frame = win.requestAnimationFrame(paint)
  })
  onCleanup(() => win.cancelAnimationFrame(frame))
}, { immediate: true })
</script>

<template>
  <canvas ref="canvas" width="640" height="360" style="width: 100%" />
</template>
```

## Widgets in their own window

A managed widget opts in with `canPopOut`, and goes with `useFloatingWidgets().popOut(id)`:

```ts
const cameras: ManagedWidget = {
  title: 'Cameras',
  component: CamerasTable,
  canDock: true, canFloat: true,
  canPopOut: true,                                   // may go into its own window
  titleMenu: w => [
    ...(w.location === 'panel'
      ? [{ label: 'Dock below', action: () => w.move({ to: 'docked', position: 'bottom', size: 0.3 }) }]
      : [{ label: 'Back into the map', action: () => w.move({ to: 'panel' }) }]),
    ...(w.canPopOut && !w.isPoppedOut
      ? [{ label: 'Open in new window', action: () => w.popOut() }]
      : []),
  ],
}
```

- **There is no built-in menu item for a widget.** Offer it in your `titleMenu`, as above:
  `WidgetMenuContext` has `canPopOut` (its `canPopOut`, on a workspace with `popOut`), `isPoppedOut`
  and `popOut()`. A menu item's action runs inside the click, so it counts as the user's gesture.
- **`popOut(id)`** returns a `PopOutResult`, with the same reasons as `popOutPanel`. From inside its
  panel the widget leaves the panel and goes into the window as one move (one `onWillMove` /
  `onMoved` pair); from docked, tabbed, floating or minimised, its panel moves. The window opens over
  the widget, at its size. A refusal changes nothing: every check runs before the window opens, and
  the widget moves only once it has.
- **`'not-allowed'`** without `canPopOut`, outside a workspace panel (a modal, a side panel), in an
  overlay inside a widget's own panel, or when its owner panel's type has `keepAlive: false` (the
  owner unmounts while hidden, and would take the widget with it). **`'disabled'`** on a workspace
  without `popOut`, or for an overlay outside any workspace. **`'no-window'`** with no `<VddDesktop>`
  mounted.
- **While out, `location` stays `'floating'`**, and `useWidget().isPoppedOut` (a `ComputedRef`) is
  true. There is no `'window'` location.
- **Back:** closing the window, or its **"Back into the panel"** button, puts the widget back into its
  panel where it was. `move()` to any place brings it back and moves it, as one move.
- **In the window,** the frame's title icon opens your `titleMenu` (by a click, or Enter or Space,
  which open it on its first item).
- **From its owner's window:** a widget can pop out while its panel is in a window of its own (rdd
  7.12.1). Its window opens over it, on that window's screen; closing it puts the widget back into
  its panel there.
- **`placement()`** while out gives a placement that reopens it floating: at its rect from before the
  window when it went from the panel or from floating; at a default floating rect when it went from
  docked or tabbed (its panel floats while it is out).
- **The owner closing** closes the window and the widget. The widget's panel id doesn't change.
- `ws.popOutPanel(id)` and `ws.returnPanel(id)` on the widget's panel id (`useWidget().panelId.value`) do
  the same, with the widget's rules. `usePanelWindow()` and the `popoutWrapper` follow the widget into
  its window.

## Focus and activation

- **`ws.focusPanelWindow(id)`** brings forward the window that holds a panel and makes it the active
  panel: its pop-out, or the main window for a panel in the page. From a widget in its own window,
  `ws.focusPanelWindow(useWidget()!.ownerPanelId!)` brings its owner forward. `ok` is false for an id
  that isn't open.
- **`focusPanel(id)`** on a panel in its own window brings that window forward too.
- **Best effort.** Browsers decide which window is in front. Firefox ignores `focus()` from a page by
  default (`dom.disable_window_flip`), and others may too when the user is busy elsewhere.
- **A click or focus inside a pop-out** makes its panel the active one, so the page's sidebar and
  toolbar show its contributions. In the page, as before, a click activates and focus alone doesn't.
  The frame carries `data-vdd-focused` as a floating window does.
- **Escape is per window.** It closes the topmost menu or flyout of the window it was pressed in, and
  is still claimed as [chapter 8](08-overlays.md) describes. Modals and side panels stay in the main
  window, and so does their Escape.
- **The taskbar** lists the panels in their own window, after the minimised ones, with a small marker
  ("in its own window"); a click brings the window forward. It shows when only such panels are
  there.

## Toasts

A toast shows in the window the user is in: one raised while a pop-out has focus (from a click in it,
say) shows in that window, otherwise in the main one. It stays in the window it was shown in (an
update by its id too), and goes when that window closes, with its `onClose`. `<VddToasts>` renders the page's
container, and one in each pop-out while it has a toast, with the same position and options (and
inside your `popoutWrapper` there); `maxVisible` counts
the toasts of every window together; a queued toast whose window has closed shows in the page. With a
`ToastAdapter` (another notification library), that library decides where its toasts go.

## Events

```ts
ws.subscribe('panel:popping-out', ({ id }) => saveView(id))                  // still in the page
ws.subscribe('panel:popped-out',  ({ id, window }) => maps.get(id)?.resize()) // laid out in the window
ws.subscribe('panel:returning',   ({ id }) => saveView(id))                  // still in the window
ws.subscribe('panel:returned',    ({ id }) => maps.get(id)?.resize())        // laid out in the page
```

- **`panel:popping-out`** is sent in the user's click, just before the panel leaves the page. The
  panel is still in its place, at its size.
- **`panel:popped-out`** follows once the panel is in the window and laid out (a frame has passed),
  so a `resize()` or a measure there sees the window's size. Its `window` is the one
  `usePanelWindow()` now gives the panel.
- **`panel:returning`** is sent just before the panel leaves the window, whatever brings it back. It
  is still in the window, at its size.
- **`panel:returned`** follows once the panel is back in its place in the page and laid out. A panel
  that comes back as a tab that isn't selected, or minimised, is 0 × 0 then: nothing shows it.

Use the first of each pair to save what a move might lose, such as a map's view, and the second to
restore it or resize.

Every `panel:popping-out` is followed by `panel:popped-out`, or by `panel:returned` when the panel
comes back before it got there: its page can't be read or doesn't load in time, or the window closes,
`returnPanel()`, the return button or the desktop unmounting brings it back first. Then there is no
`panel:returning`. The exceptions: a panel closed meanwhile gets `panel:closed` only, and one popped
out or brought back again within that wait gets the events of the newer move only. If the window's
frame doesn't show (its styles still loading), the event is sent anyway after about 4 seconds.

None of them is sent for a refused pop-out. A panel closed while out sends `panel:closed`, not
`panel:returning` or `panel:returned`. All four are sent for a widget's panel too. Docking and
floating send none: the panel stays in the same document, and the move is a resize. Popping out also
publishes `layout:changed`, and so does coming back into the grid. The four are in `BuiltInEvents`,
so their payloads are typed.

## Testing pop-outs with Playwright

The window is a new page for Playwright. Wait for it while you click:

```ts
const [popup] = await Promise.all([
  page.waitForEvent('popup'),
  page.getByRole('menuitem', { name: 'Open in new window' }).click(),
])
await popup.waitForSelector('.vdd-popout-frame')
await popup.getByRole('button', { name: 'Return to desktop' }).click()
```

- Query the window's elements on `popup`, not on `page`.
- To check that an element is the same one after the move, mark it with a `data-` attribute. A
  JavaScript property set on it isn't visible from the other page's `evaluate`.
- `panel:popped-out` and `panel:returned` arrive a frame after the move. Wait for them (with
  `waitForFunction` or `expect.poll`), not for the click.
- **Playwright's `evaluate` and its waits count as a user activation in that page for about 5
  seconds.** A test of a click inside a pop-out can then pass even if only the main page was
  activated. To be sure the click in the pop-out is what counts, leave the main page untouched for
  about 5 seconds (5.5 s is safe) before that click, and check the new window's `opener`.

### Which window a toast goes to

Playwright reports `document.hasFocus()` as true in every page, so while a pop-out is open a toast
shows in it, even one raised from the main page. Turning Chrome's focus emulation off
(`Emulation.setFocusEmulationEnabled`) doesn't fix that: headless, nothing changes; headed, the
result depends on the order of clicks and window raises.

Instead, make the pop-out say it doesn't have focus, before you raise the toast:

```ts
// The user is in the main page: the pop-out doesn't have focus.
await popup.evaluate(() => { document.hasFocus = () => false })
await page.getByRole('button', { name: 'Save' }).click()   // raises a toast
await expect(page.locator('.vdd-toast')).toBeVisible()
await expect(popup.locator('.vdd-toast')).toHaveCount(0)
```

Without the stub, a toast raised while the pop-out is open shows in the pop-out. The pop-outs are
asked first, so stubbing the main page's `hasFocus` changes nothing.

### Which window is in front

The operating system decides which window is in front, and Playwright can't see it. Test that your
code asks for it: spy on `ws.focusPanelWindow`, or count calls to the pop-out's `window.focus`.
Check real focus by hand, with two windows on screen.

## Things to know

- **`maximizePanel` and `floatPanel` are ignored** while a panel is in its own window.
- **`canPopOut` changing** (a type's option, or a widget's on a re-open) doesn't close a window that
  is open: it only gates the menu item and new calls. Call `returnPanel(id)` (or, for a widget,
  `move()`) to bring it back.
- **Workspace chrome stays in the main window:** tab drags, the grid's splitters, the taskbar, modals
  and side panels. A panel in a window can't be dragged back onto the grid; "Return to desktop"
  brings it back.
- **No device detection.** The library doesn't decide which screens suit windows. On a phone or a
  tablet a "window" is usually a new tab. Decide in your app, with `popOut` at creation (or
  `canPopOut` per type):

  ```ts
  // Windows only with a mouse and a wide screen.
  const roomForWindows =
    window.matchMedia('(pointer: fine)').matches && window.matchMedia('(min-width: 1024px)').matches

  export const workspace = createWorkspace({ popOut: roomForWindows, panels })
  ```

- **A toolbar flyout or a search dropdown** left open in a pop-out that closes is not closed with it
  (a context menu is): it goes with the window's document.
- **Messages:** `popOutWindow` ("Open in new window"), `returnToDesktop` ("Return to desktop", the
  header button's tooltip and accessible name), `backIntoPanel` ("Back into the panel", the same for a
  widget), `popOutBlocked` (the blocked toast) and `inOwnWindow` ("in its own window"). The taskbar
  joins `inOwnWindow` to the panel's title as its tooltip and accessible name, "Map: in its own
  window", so translate it as the end of that phrase. Their ids are `vdd.popOutWindow` and so on. An
  app that types its table as `Record<MessageKey, string>` must add them; see
  [chapter 11](11-i18n.md) and [chapter 12](12-migrating.md).
- **CSS:** the frame is `.vdd-popout-frame` (with `data-vdd-popout="<panel id>"`), its parts
  `__header`, `__icon`, `__title`, `__return` and `__body`; a widget's title icon that opens its
  `titleMenu` is also `.vdd-popout-frame__icon--menu`. The title icon is a 14 × 14 box, as a
  floating window's: an `svg` or `img` in it is drawn at 14 × 14, as in a tab, and any other icon
  bigger than the box is scaled down to fit it. The return button is also
  `.vdd-custom-tab-btn`, so it takes the skin's title-bar button look; style it with
  `.vdd-popout-frame__return`. In the taskbar, a panel in its own window is
  `.vdd-taskbar-item--popout` (with `data-vdd-taskbar-popout="<panel id>"`), and its marker
  `.vdd-taskbar-item-popout-marker`.
- **A panel's window or a widget's:** the frame carries `data-vdd-popout-kind="panel"` or
  `"widget"`. Use it to style the two apart, or to find a widget's window in a test, rather than the
  panel id: a widget's panel id format is not part of the API.

  ```css
  .vdd-popout-frame[data-vdd-popout-kind="widget"] .vdd-popout-frame__return { color: var(--my-accent); }
  ```

- **These classes and attributes are styling hooks**, as every `.vdd-*` class and `data-vdd-*`
  attribute is ([chapter 10](10-theming.md)).

## API summary

| | |
|---|---|
| `createWorkspace({ popOut })` | Allows windows. Default `false` |
| `defaultOptions.canPopOut` | A panel type may go into a window. Default `false` |
| `ws.popOutPanel(id)` | → `PopOutResult`, inside a user's click |
| `ws.returnPanel(id)` | → `{ ok: boolean }` |
| `ws.focusPanelWindow(id)` | → `{ ok: boolean }`, best effort |
| `<VddDesktop popout-url>` | The app's same-origin page for the window |
| `<VddDesktop :popout-wrapper>` | A component given `PopoutWrapperProps` (`window`, `document`), rendering its default slot |
| `usePanelWindow()` | `PanelWindow`: the `window` and `document` of the panel's window, as live getters |
| `usePanel().isPoppedOut` | `ComputedRef<boolean>`: in its own window now |
| `useFloatingWidgets().popOut(id)` | → `PopOutResult`, for a managed widget |
| `ManagedWidget.canPopOut` | A widget may go into a window. Default `false` |
| `useWidget().isPoppedOut` | `ComputedRef<boolean>`: the widget is in its own window |
| `WidgetMenuContext.canPopOut`, `.isPoppedOut`, `.popOut()` | For your `titleMenu` item |
| `panel:popping-out`, `panel:returning` | Events, just before the move: `{ id }` |
| `panel:popped-out`, `panel:returned` | Events, once laid out in the new place: `{ id, window }`, `{ id }` |
| `PanelInfo.poppedOut` | `true` while out; runtime only |
| `PopOutResult`, `PanelWindow`, `PopoutWrapperProps` | The types above |
| `.vdd-popout-frame`, `data-vdd-popout`, `data-vdd-popout-kind` | The window's frame, its panel id, `"panel"` or `"widget"`; its parts `__header`, `__icon` (`__icon--menu`), `__title`, `__return`, `__body` |
| `.vdd-taskbar-item--popout`, `data-vdd-taskbar-popout`, `.vdd-taskbar-item-popout-marker` | A panel in its own window, in the taskbar; its marker |
| Messages `popOutWindow`, `returnToDesktop`, `backIntoPanel`, `popOutBlocked`, `inOwnWindow` | See [Things to know](#things-to-know) |

See also: [Widgets out of the panel](14-widgets-out-of-the-panel.md), [Layout](04-layout.md),
[Theming](10-theming.md), [API reference](13-api-reference.md).

## Coming from react-dockable-desktop

The same feature and the same names; these are the differences.

| rdd 7.12.1 | vdd 1.14.0 |
|---|---|
| `<DockableDesktopProvider popoutUrl popoutWrapper>` | `<VddDesktop popout-url :popout-wrapper>`: the windows belong to the desktop |
| `popoutWrapper`: `ComponentType<PopoutWrapperProps>` with `{ window, document, children }` | a component with the props `window` and `document` and a default slot; spell the props out in `defineProps` |
| `usePanelWindow()` re-renders its component on a change | an object whose `window` and `document` are live getters: read them in a `watch` or a `computed`, don't destructure them in `setup` |
| `usePanel().isPoppedOut`, `useWidget().isPoppedOut`: booleans | `ComputedRef<boolean>`s |
| `popOutPanel` with no provider mounted: `'no-window'` after `'no-gesture'` | with no `<VddDesktop>` mounted: `'no-window'` right after `'disabled'`, since the desktop owns the windows |
| a widget's `popOut()` outside a `DockableDesktopProvider`: `'disabled'` | `'disabled'` outside a workspace; `'no-window'` without a mounted `<VddDesktop>` |
| the development warnings | outside production builds, as every vdd warning |
| React creates the nodes of a panel that is out in the pop-out's document | Vue creates them with the main `document`; the pop-out adopts them on insertion (see [Code in a pop-out window](#code-in-a-pop-out-window)) |
| a `<RddContextMenu>` of your own, above the provider, is outside the wrapper | `<VddContextMenu>` and `<VddToasts>` find the wrapper by the document they show in, wherever they are mounted |
| the taskbar's entries are buttons | the same for a popped-out panel's; vdd's minimised entries stay `div`s |
| `.rdd-popout-frame`, `data-rdd-popout`, `data-rdd-focused`, `.rdd-taskbar-item--popout` | the same with `vdd` |

Everything else (the check order after `not-open`, where a panel returns, the events and their
timing, the styles copy, the saved layout) is rdd's. [PARITY.md](../PARITY.md) has the full
trace, and [ADR 0022](../decisions/0022-popout-windows.md) the reasons.
