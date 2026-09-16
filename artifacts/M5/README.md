# M5 — Floating windows · **PASS**

`npm run gate -- M5` · raw: [gate.json](gate.json) · browser: [browser.json](browser.json) ·
screenshot: [floating.png](floating.png)

```
  ok  types · lint · tests · build · counts · css-prefix · api-surface · M5 · M5 browser
  tests: 295/295 across 17 files
M5 GATE: PASS
```

## Measured, in a real browser

```
  {"step":"drag","dx":180,"dy":120}
  {"step":"resize e","w":90,"h":0,"x":0,"y":0}
  {"step":"resize s","w":0,"h":70,"x":0,"y":0}
  {"step":"resize w","w":60,"h":0,"x":-60,"y":0}
  {"step":"resize n","w":0,"h":50,"x":0,"y":-50}
  {"step":"resize se","w":40,"h":40,"x":0,"y":0}
  {"step":"resize nw","w":30,"h":30,"x":-30,"y":-30}
  {"step":"maximize","radius":"0px","shadow":"none","border":"0px"}
  {"step":"anchor stack ltr","gap":8,"firstTop":8}
  {"step":"anchor stack rtl","gap":8,"firstTop":8}
  {"step":"D2 focus","active":"docked","focusedWindows":["docked"]}
  {"step":"survival","mounts":1,"unmounts":0,"glLost":false,"scrollTop":200}
```

Every number is the exact expected one: drag moves by the pointer delta, each handle moves
the edge under the cursor (and only that edge — `w` and `n` move position as well as size,
`e` and `s` do not), maximise fills the workspace to the pixel, anchored windows sit 8px in
and stack with an 8px gap in **both** reading directions, and the panel came through all of
it mounted once with its WebGL context alive and its scroll at 200.

## Divergences verified here

- **D2** — floating a docked panel resolves the active panel: `activePanelId` is `docked`
  and exactly one window carries focused chrome. rdd left it stale, so a newly floated
  window rendered unfocused despite being frontmost.
- **D9** — a maximized window really is squared off: radius `0px`, shadow `none`, border
  `0px`. rdd's rule targeted `.maximized` while its component rendered `rdd-maximized`, so
  a maximized window kept its rounded corners and drop shadow.

## D5 is bigger than I had catalogued

I had recorded D5 as clipped handles on *inner widgets*. The browser gate showed it applies
to **floating windows too**, and that it is worse than "half the grab area":

- handles sit at `-4px` inside an `overflow: hidden` box, so the outer half is clipped away;
- at a window's rounded corner, **nothing** is hit — `elementFromPoint` returns the grid
  *behind* the window, so a corner drag does nothing whatsoever. That is why `se` and `nw`
  measured `w:0 h:0` on the first run;
- the touch rules enlarge handles to 12px but position them at `-6px`, so the enlargement is
  half-clipped on exactly the devices that need a **bigger** target. Intent 12px, reality 6px.

Fixed by insetting every handle to 0, so its whole nominal area is live. The trade is that a
window can no longer be grabbed from just outside its edge; in exchange every pixel of the
handle works, which it did not before. PARITY §4 D5 rewritten accordingly.

**My own gate caught what my own test missed.** The vitest assertion matched only the *first*
rule for each handle and passed; the gate reads every rule, including the
`@media (pointer: coarse)` block, and failed. The test has been made as strict as the gate.

## What was built

`VddFloatingWindow.vue` — title bar with drag, eight resize handles, maximise/minimise/close,
corner anchors with stacking, focus and z-order — plus the workspace-resize clamp in
`VddDesktop`.

Positioning is deliberately split: a free window is placed by physical `left`/`top`, an
anchored one by CSS **logical** `insetInlineStart`/`insetInlineEnd` driven by its own `dir`.
So switching reading direction mirrors it with no JavaScript and no stored physical
coordinate — which is what lets a layout saved in one direction restore correctly in the
other. The gate asserts the anchored branch never sets `left`/`right`, and the browser
confirms the mirroring by measuring from the correct edge in each direction.

Also added: a development-mode diagnostic that names the ancestor which broke the
percentage-height chain when the workspace measures zero height — the failure that otherwise
presents as an invisible app with no error anywhere.

## Fixes during the milestone

- The clamp is a watcher, so it settles on the next tick; a test asserted synchronously.
- `@vue/test-utils` cannot assign `button` on a MouseEvent here, and `button` is what the
  drag handler checks — that test dispatches a real `PointerEvent`.
- `css-prefix` reported a `class="…"` occurrence inside a *diagnostic message* describing the
  application's own element. Class attributes only exist in markup, so the scanner now reads
  the template for attributes and the whole file for `classList` writes.
- The maximise assertion read a box-shadow mid-transition, where the computed value is an
  interpolated near-zero rather than the literal `none`.
