# M0 — Teleport spike · **PASS**

Gate: `spike/gate.mjs` (run from `spike/`, with `npx vite --port 5199` serving).
Raw data: [result.json](result.json) · screenshot: [spike.png](spike.png)

```
  cache     mounts=1 unmounts=0 video+1.3s scroll=ok focus=ok webgl=alive -> PASS
  teleport  mounts=1 unmounts=0 video+1.3s scroll=ok focus=ok webgl=alive -> PASS
  focus not stolen from active panel: true
```

A panel containing a live WebGL context, a playing video, a scrolled list, a focused input
with a caret, a running interval, a CSS animation and an iframe was driven through
`leafA → leafB → floating → hidden → leafA → leafB`, asserting after **every** transition:
component never re-mounted, DOM node identity unchanged, WebGL context not lost, playback
advanced and never restarted, scroll offset restored, focus and caret restored.

## Both candidate strategies work

| | Mechanism | Result |
|---|---|---|
| **S1 `cache`** | `<Teleport :to="cacheEl">` onto a stable per-panel element, moved imperatively — rdd's approach | PASS |
| **S2 `teleport`** | `<Teleport :to="hostEl">`, target changed reactively, Vue moves the nodes | PASS |

Vue does not interfere with either. See [0002](../../docs/decisions/0002-zero-unmount-via-teleport.md)
for which was chosen and why.

## Characterised, not asserted

- **`<iframe>` reloads** on re-parent (`iframeReloaded: true`, load timestamp changes). Not
  preventable by any strategy — it is how iframes work. A documented limitation.
- **CSS animations keep running** through every transition.

## Findings that change the implementation

1. **TypeScript must be pinned to 5.x.** `vue-tsc@3` resolves `typescript/lib/tsc`, which
   TypeScript 7 removed from its exports map — `npm i -D typescript` installs 7.x and breaks
   type-checking immediately. See [0015](../../docs/decisions/0015-toolchain-pins.md).
2. **Never put DOM elements in `reactive()`.** It deep-proxies them, and a Proxy of an
   element is not the element: `appendChild` throws and identity comparisons fail. Use
   `shallowReactive` / `shallowRef`. This is the hazard [0003](../../docs/decisions/0003-reactive-store.md)
   predicted, now confirmed.
3. **Preserved scroll/focus must be owned per panel and outlive the hidden period.**
   Capturing at each move fails for minimise → restore: while a panel is in the
   `display:none` container it has no layout, so every scroller reports
   `scrollHeight === clientHeight === 0` and there is nothing to capture. The record is now
   refreshed only while the panel is laid out, and applied whenever it becomes laid out
   again. This was the one genuine implementation failure the gate caught.
4. **Watch the resolved target element, not just the placement state.** On the first
   (`immediate`) run, host template refs have not been assigned yet, so every target is
   `null`; watching placement alone parks every panel in the hidden container with nothing
   left to re-trigger the move.

## Gate attempts

Four runs. Three were defects in the harness or environment, one in the implementation:

| Run | Failure | Where |
|---|---|---|
| 1 | dev server died with its subshell | environment |
| 2 | `probe()` never forwarded `id` into `page.evaluate`, so every selector queried `data-panel="undefined"` | harness |
| 3 | `const URL = …` shadowed the global `URL` constructor | harness |
| 4 | scroll/focus not restored when returning from hidden | **implementation** (finding 3) |

The iframe's aborted request is excluded from the console-error check and reported under
"characterised" instead — the abort is the expected consequence of the re-parent this gate
exists to perform, not a library fault.
