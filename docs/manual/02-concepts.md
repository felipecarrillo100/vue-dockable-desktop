# 2. Core concepts

Seven words carry most of the meaning.

## Panel

A unit of content the user can move around: a map, an editor, a property sheet. A panel has

- a **component key** — what kind of panel it is (`'map'`), registered once;
- an **instance id** — which one it is (`'map-1'`), unique while open;
- a **state** — `'docked'`, `'floating'` or `'minimized'`.

Registering a component key once and opening many instances of it is the normal pattern.

## The grid

A tree. Two node types:

- a **branch** — splits its children horizontally or vertically, with relative `sizes`;
- a **leaf** — a tab group, holding an ordered list of panel ids and a selected one.

Dragging a panel onto another leaf's edge splits that leaf into a branch. Dragging onto its
centre adds a tab. Emptying a leaf removes it and collapses the branch, unless the leaf was
created with `keepOnEmpty`.

## Floating windows

A panel can leave the grid entirely and become a free window with its own title bar,
draggable and resizable on eight edges, and stackable by z-order. A floating window can be
**anchored** to one of the four workspace corners, in which case windows sharing that corner
stack with a gap instead of overlapping.

## Minimised and the taskbar

A minimised panel leaves the layout and appears as an icon in the taskbar. It remembers
where it came from, so restoring returns it to the same leaf, or to the same floating rect.
Hovering its icon shows a **live** thumbnail — not a screenshot, the actual running panel,
scaled.

The taskbar has three modes: `'always'`, `'compact'` (only when something is minimised), and
`'autohide'` (an 8px peek strip that expands on hover).

## Zero unmount

A minimised panel is off screen but **still running**. So is a panel in a background tab.
Nothing in this library unmounts a panel until it is closed.

The consequence worth internalising: background panels keep their timers, watchers and
subscriptions live. If a panel polls a server, it keeps polling while minimised unless you
stop it — and `usePanel()` gives you `isMinimized` precisely so you can.

The other consequence: Vue devtools shows every open panel in the component tree, wherever
it appears on screen. That is expected.

### What survives, and what the library restores

Moving a panel's DOM keeps almost everything, but not quite everything — detaching a subtree
makes the browser reset two things. The library handles those itself:

| | |
|---|---|
| Component state, refs, watchers, timers | survive — the component is never unmounted |
| WebGL / canvas contexts | survive |
| Media playback position | survives |
| `<input>` values, selection range, `<details open>` | survive |
| **Scroll offsets** | reset by the browser — **saved and restored by the library** |
| **Focus** | reset by the browser — **restored by the library**, but only when the panel becomes the active one, so it never steals your caret |
| `<iframe>` content | **reloads.** Nothing can prevent this; an iframe re-runs its document when re-parented |

Opt a panel out of scroll restoration with `defaultOptions.preserveScroll: false` if it
manages virtualised scrolling itself.

## The active panel

Exactly one panel is *active* — `activePanelId`. It is always a panel the user can actually
see: the selected tab of some leaf, or a floating window. Never a minimised one.

Active-ness drives three things:

1. focused chrome (the active tab and window are drawn differently);
2. `usePanel().isActive` inside the panel;
3. **panel contributions** — toolbar items and sidebar sections a panel publishes are
   surfaced only while it is active (see [chapter 9](09-contributions.md)).

That third point is why the library is strict about this: a contributed control bound to a
panel the user cannot see would look functional and act on the wrong thing.

## The workspace

The object returned by `createWorkspace()`. It owns the reactive state, the panel registry
and the event bus. It exists before your app mounts and outlives every component, which is
what makes it callable from non-component code.

Inside components, reach it with `useWorkspace()`:

```ts
const { activePanelId, panels, floating, minimized, openPanel, saveLayout } = useWorkspace()
```

State members are refs, so destructuring keeps them reactive. Actions are plain functions.

## Two layers of "floating"

A naming point that saves confusion later:

- a **floating window** is workspace-level — a panel detached from the grid;
- a **floating widget** (`<VddFloatingWidget>`) lives *inside* a single panel — a legend, an
  info card, a timeline strip, docked to that panel's corners.

They look similar and are unrelated. Chapter 7 covers widgets.
