# M6 — Drag-and-dock system · **PASS**

`npm run gate -- M6` · raw: [gate.json](gate.json) · browser: [browser.json](browser.json) ·
screenshot: [dragging.png](dragging.png)

```
  ok  types · lint · tests · build · counts · css-prefix · api-surface · M6 · M6 browser
  tests: 322/322 across 18 files
M6 GATE: PASS
```

## Every drop target, driven with real pointer events

```
  {"dir":"ltr","case":"centre of R","leaf":"R","active":"drag"}
  {"dir":"ltr","case":"bottom of R","leaf":"group-split-…"}
  {"dir":"ltr","case":"edge left","side":"first"}
  {"dir":"ltr","case":"corner bottom-right","anchor":"bottom-right"}
  {"dir":"ltr","case":"free float","anchor":null}
  {"dir":"ltr","case":"reorder","before":["keepL","drag","third"],"after":["keepL","third","drag"]}
  {"dir":"rtl","case":"edge left","side":"second"}
  {"dir":"rtl","case":"corner bottom-right","anchor":"bottom-left"}
  {"dir":"touch","case":"tap does not drag","leaf":"L"}
  {"dir":"touch","case":"long press arms","armed":true}
  {"dir":"touch","case":"long press drag","leaf":"R"}
M6 BROWSER: PASS
```

All 15 cases passed on the first run of the gate proper. This is the milestone jsdom can say
least about — a drop target is a *place on screen*, and aiming at one means moving a real
pointer there. jsdom measures every box as zero, so `elementsFromPoint` finds nothing and no
drag can be aimed at all.

**RTL is mirrored, not stored.** The same physical gesture produces opposite results by
reading direction: a drag to the physical left edge docks as the *first* child under LTR and
the *second* under RTL, and a drop on the physically bottom-right corner anchors
`bottom-right` under LTR and `bottom-left` under RTL. Nothing physical is persisted — the
anchor is logical and CSS does the mirroring.

**The tab-reorder index correction works**: `["keepL","drag","third"]` → `["keepL","third","drag"]`.
DOM indices are pre-removal, and `movePanelOrder` removes before inserting, so a panel
dragged rightwards within its own leaf would otherwise land one position short.

**Touch behaves as three distinct gestures**: a tap does *not* move anything (it is a
scroll), a 300ms press arms the long-press state, and a press-then-move drags and drops.
Driven through CDP `Input.dispatchTouchEvent`, since a press has to be *held*.

## What was built

| | |
|---|---|
| `composables/useDragDock.ts` | the gesture state machine: what is dragged, where the pointer is, which target is armed |
| `components/VddDropZones.vue` | a leaf's cross of five targets, plus the split preview |
| `components/VddEdgeZones.vue` | four workspace edges and four corners, plus the edge preview |
| `components/VddDragGhost.vue` | the label that follows a tab drag |

Two input paths, and the difference is the crux of the file:

- **mouse and pen** — listeners on `window` with **no** `setPointerCapture`. Capture would
  route every event to the capturing element, so the drop zones would never receive
  `pointerenter` and hover tracking would die. A 5px threshold separates a drag from a click.
- **touch** — a 300ms long press *with* capture, because a touch drag must not be mistaken
  for a scroll; 8px of travel abandons it. Since capture suppresses hover, the armed target
  is resolved by hit-testing the pointer position instead.

The gate asserts exactly that: no capture in the mouse path, capture *and* hit-testing in the
touch path, and the three thresholds pinned to their values — changing one is a product
decision, not a tidy-up.

**Drop resolution order is load-bearing** and gated as such: workspace edge, then a tab (a
precise intent), then a leaf's cross target, then a corner, then a free float. A leaf's cross
overlaps the edge zones beneath it, so arming the specific one disarms the coarse one — also
gated, in both directions.

A floating window dragged over a target docks there too. Since `startPointerDrag` holds
capture, the window's drag tracks its target by hit-testing, and the dragged window sets
`pointer-events: none` on itself so the zones beneath it are what the hit test finds.

## Gate infrastructure

**Gates now strip comments before asking about code.** This was the third time a pattern
check matched the explanatory comment beside the thing it was checking — a `class="…"` inside
a diagnostic message, a `.luciad` in a note about removing `.luciad`, and now a `:hover` in a
note about *not* using `:hover`. `stripSourceComments` lives in `scripts/gates/lib/` and the
lesson is recorded there.

## Fixes during the milestone

- The touch section of the gate looked up a drop zone *before* starting the drag, when no
  zones exist; and descendant selectors were ambiguous because a zone carries both its
  position and its leaf id on the same element.
- A sloppy expression in the floating-window drag (`drag?.pointer.value && (…)`) replaced
  with real pointer tracking through `trackPointer`.
- Inline `import('vue').Ref<…>` type annotations, and an unused parameter in a test helper.
