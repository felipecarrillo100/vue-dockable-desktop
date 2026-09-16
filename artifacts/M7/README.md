# M7 — Minimise, taskbar, live previews · **PASS**

`npm run gate -- M7` · raw: [gate.json](gate.json) · browser: [browser.json](browser.json) ·
screenshot: [preview.png](preview.png)

```
  ok  types · lint · tests · build · counts · css-prefix · api-surface · M7 · M7 browser
  tests: 342/342 across 19 files
M7 GATE: PASS
```

## The preview really is the running panel

```
  {"step":"preview","containsPanel":true,"sameNode":true,"copies":1,
   "frame":{"w":116,"h":140},"onScreen":true,"scale":"matrix(0.194175,…)",
   "glLost":false,"mounts":1,"pointerEvents":"none"}
  {"step":"still running","videoBefore":0.858995,"videoAfter":1.789087}
  {"step":"restore from preview","state":"docked","active":"a","scroll":150,"inSlot":true}
  {"step":"autohide","collapsed":{"visible":8},"open":{"visible":29,"expanded":true}}
  {"step":"compact","hiddenWhenEmpty":true,"shownWhenMinimised":true}
```

The same DOM node, one copy of it, on screen, scaled by 0.194 — which is exactly
`min(220/width, 140/height)` for the size the panel had while it was open, so the aspect
ratio is preserved rather than squeezed. Its WebGL context is intact, it was never
re-created, and **its video advanced from 0.86s to 1.79s while being previewed**: the
thumbnail is a running panel, not a picture of one.

Clicking it restores the panel into a slot with its scroll offset back at 150.

## Four bugs, three of them the same root cause

**rdd carries load-bearing values as inline JSX styles**, so porting its stylesheet silently
drops them. This milestone found the last two of three (the first was M4's height chain), and
all three are only visible in a browser:

| | |
|---|---|
| `zIndex: 100` on the taskbar footer | Without it a split divider's invisible 8px hit-box paints over the autohide peek strip, so **hovering it does nothing at all** — the mode appears broken |
| `zIndex: 999999` on the preview | Without it the preview has `z-index: auto`; a divider paints over it and **the pointer can never reach the preview**, so it cannot be clicked or closed |
| structural flex/height (M4) | A 0px-tall split divider |

Recorded together as divergence **D12**, because "the stylesheet is ported" is not the same
claim as "the styling is ported", and the difference cost three separate browser gates to
find.

The fourth was mine, and instructive: the preview's function ref parks the panel when Vue
calls it with `null` on teardown — which **bypassed the ownership check I had just added one
line above**. Restoring from a preview closes the preview *and* gives the panel a slot, in no
guaranteed order, so the closing preview stole the panel back from the slot that had just
claimed it: a docked panel, an empty slot for it, and nothing on screen. Both the slot and
the preview now make the same check before handing a panel back, and the gate asserts both.

Also fixed: **D11** — rdd marks the whole preview frame `pointer-events: none`, so a click
anywhere over the thumbnail (most of the preview) passes through and does nothing; only the
small header row responds. Here the frame takes the click while its contents stay inert, so
the live panel inside can never be clicked by accident.

## What was built

`VddTaskbar.vue` with three visibility modes, scroll arrows past four icons, and touch
handling; `VddTaskbarPreview.vue`, teleported to `document.body`; a size registry on
`PanelDomCache`, because a preview needs to know how big a panel *was* — by the time it is
previewed it is minimised and has no size of its own.

Touch is three gestures again: a tap opens the preview, a second tap restores, a long press
asks the host for a context menu (wired to a real menu in M8). And hovering a taskbar icon
never restores focus into the previewed panel — that would steal the caret from whatever the
user is actually typing in.

Also ported, with its name preserved: the taskbar half of rdd's `StyleHookups` suite. Its
`taskbarVisibility` prop did nothing whatsoever in 6.0.0, because the component emitted
`taskbar-mode-autohide` while every rule was keyed on `.rdd-taskbar-mode-autohide` — a class
of bug only an assertion on the *emitted class name* can catch, since jsdom never loads the
stylesheet.

## Gate infrastructure

`css-prefix`'s dynamic-binding check was reporting comparison values as class names: in
`{ 'vdd-x': mode === 'autohide' }` the key is a class and `'autohide'` is not. Object *values*
are now dropped before literals are extracted, leaving array elements and object keys — the
only places a class name can appear. A self-test case pins that a bare class in an object key
is still caught.

## Harness lessons

- A single `mouse.move` from an element that has just been removed does not reliably produce
  an enter event. Pointer travel is now simulated: away, then in, in steps.
- Autohide slides the bar off the bottom rather than shrinking it, so what matters is how
  much of it is *visible*, not how tall it is. Measuring the element height reported 29px in
  both states, and the naive hover point was below the viewport, where a pointer cannot go.
