# 7. Inside a panel: overlay toolbars and floating widgets

Everything so far has been about arranging panels. This chapter is about the inside of one:
toolbars on its edges and small floating widgets over its content — a layer list on a map, a
timeline strip, an inspector card.

It is scoped to the panel. Each panel has its own toolbars, its own widget stacks and its own
z-order, and nothing here reaches outside the panel it belongs to.

```vue
<script setup lang="ts">
import {
  VddPanelOverlay, VddPanelToolbar, VddToolbarButton, VddToolbarToggle,
  VddToolbarSeparator, VddToolbarSpacer, VddFloatingWidget,
} from 'vue-dockable-desktop'

const grid = ref(false)
const layers = ref({ anchor: 'top-right', stretch: null })
</script>

<template>
  <VddPanelOverlay>
    <VddPanelToolbar position="top" variant="frosted">
      <VddToolbarButton title="Zoom to fit" @click="fitAll"><FitIcon /></VddToolbarButton>
      <VddToolbarSeparator />
      <VddToolbarToggle v-model:active="grid" title="Snap to grid"><GridIcon /></VddToolbarToggle>
      <VddToolbarSpacer />
      <VddToolbarButton title="Help" @click="help"><HelpIcon /></VddToolbarButton>
    </VddPanelToolbar>

    <MapCanvas />

    <VddFloatingWidget
      widget-id="layers" title="Layers"
      v-model:placement="layers" :width="260" :height="200"
    >
      <LayerList />
    </VddFloatingWidget>
  </VddPanelOverlay>
</template>
```

## Toolbars

`<VddPanelToolbar>` attaches to `top`, `bottom`, `left` or `right`. It claims space on that
edge, and docked widgets keep clear of it — both where they sit *and* how far they can be
resized. Left and right strips inset themselves past any top and bottom strips, so the corners
are never contested.

| Prop | |
|---|---|
| `position` | `top` · `bottom` · `left` · `right` |
| `variant` | `transparent` (default) · `frosted` · `solid` |
| `buttonVariant` | `ghost` (default) · `soft` · `outlined` · `filled` — inherited by its buttons |
| `buttonSize` | icon size in px; left to the stylesheet when unset |

The contents are yours. The library provides the pieces it styles consistently:

- `<VddToolbarButton title @click>` — an icon button. The icon is the slot.
- `<VddToolbarToggle v-model:active title>` — a two-state button; sets `aria-pressed`.
- `<VddToolbarSeparator>` — a divider.
- `<VddToolbarSpacer>` — pushes everything after it to the far end.
- `<VddToolbarCenter>` — centres its content regardless of what flanks it.
- `<VddToolbarItem>` — wraps a control that is not one of the above: a select, a badge.

### Search

`<VddToolbarSearch>` is a compact icon button that expands into a debounced field, with
results in a dropdown:

```vue
<VddToolbarSearch
  placeholder="Find a layer…"
  :search="(query, signal) => api.searchLayers(query, { signal })"
  @select="r => focusLayer(r.id)"
/>
```

`search` receives an `AbortSignal` and **must** honour it. Without that, a slow request for an
earlier query can land after a fast one for a later query and overwrite it — which is why the
signal is in the signature rather than optional. Results are `{ id, label, description?,
group?, icon? }`; a `group` buckets them under a heading.

## Floating widgets

`<VddFloatingWidget>` docks to a corner of the panel, can be dragged free of it, and dropped
back onto another corner. Widgets sharing a corner stack along the block axis with an 8px gap.

| | |
|---|---|
| `widget-id` | unique within this panel's overlay; drives z-order and stacking |
| `title`, `icon` | header content |
| `v-model:open` | whether it is mounted |
| `v-model:placement` | `{ anchor, stretch }` — see below |
| `width`, `height` | pixels. Ignored on a stretched axis, and returned to when it is released |
| `stretchable` | `false` disables resize-to-stretch snapping |

Clicking the header does **not** detach the widget — a drag past 4px does. That matters more
than it sounds: a widget torn off its anchor by a stray click looks unchanged, but its stacked
siblings close the gap and it stops tracking the corner from then on.

### Placement is one value

`anchor` and `stretch` travel together, as one model:

```ts
const placement = ref<PanelFloatPlacement>({ anchor: 'bottom-left', stretch: 'width' })
```

Not two, because a single gesture can change both: releasing a stretched axis also decides
which end the widget is now pinned to. Reporting them separately would let you observe a state
that is never valid.

Bind the model and you own placement — which is also **how you persist it**. The library
serialises nothing about inner widgets, by design: a widget's identity is whatever your app
says it is. Store what the model gives you, and hand it back on the next load.

### Stretch: spanning an axis

An axis can span the panel instead of carrying a size. `stretch` is `'width'`, `'height'`,
`'both'` or `null`.

The mechanism is worth knowing, because it explains the behaviour: a stretched axis pins
**both** ends and writes no size at all. "Full width" is not a width, it is a second pin — so
CSS keeps the widget spanning the panel as the panel resizes, with no observer and no
JavaScript.

```vue
<!-- A full-width status strip along the bottom, tracking the panel's width. -->
<VddFloatingWidget
  widget-id="timeline" title="Timeline"
  :placement="{ anchor: 'bottom-left', stretch: 'width' }"
  :width="240" :height="120"
>
```

`width` still matters there: it is what the inline axis **returns to** if the user releases it.
The stored size is deliberately left untouched while an axis is stretched, so releasing
restores the size the user last chose rather than the full-bleed value.

A `'height'` or `'both'` widget spans the axis that stacking uses to separate siblings, so it
cannot stack — it will overlap anything anchored to the same side, with z-order deciding. You
get a development warning if that situation arises; give it a fixed height, or move the others
to the opposite side.

A full-width strip *does* stack, and against **both** corners of its edge — it overlaps
whatever is in either, so it clears the taller of the two.

### Which resize handles appear

Not a cosmetic decision. A handle on a pinned edge would move the *opposite* edge instead of
the one under the cursor, and stop almost immediately — an inert stub wearing a resize cursor.

- **Free-floating:** all eight. Nothing is pinned.
- **Docked:** the two free edges and their corner. A `top-left` widget offers `e`, `s`, `se`.
- **Stretched axis:** *both* of its ends, either of which releases it — the edge you drag
  becomes the moving one and the opposite end becomes the new pin, so it reads like an ordinary
  resize. This is also what stops a fully-stretched widget from being a dead end with nothing
  to grab.
- **No corner** while anything is stretched: it would mix a resize and a release into one
  gesture.

Under RTL the inline half mirrors, because the pin is logical (`inset-inline-end`) while the
handles are physical.

### Resize-to-stretch snapping

Drag a free edge out to where a stretched axis would sit and the axis converts to stretched on
release. The widget is already visually at its target — the resize clamps stop exactly
there — so the cue is an outline rather than a ghost preview.

The thresholds are asymmetric on purpose: it arms within 16px of the full extent but only
disarms once the drag pulls back past 40px. Without that hysteresis, releasing a stretched
axis by dragging a few pixels inward immediately re-arms and snaps straight back, which makes
the gesture feel broken. `stretchable: false` turns snapping off for content that only makes
sense at a bounded size.

## Panel content with its own stacking

One thing to know before you put a map, a chart library or a video player under an overlay.

A floating widget stacks at a z-index the overlay assigns it. Some libraries give their own
internal layers a much higher one — Leaflet, for instance, puts its map panes at `z-index:
400`. If your panel's content does that, it paints **over** the overlay: the toolbar and the
widgets are in the DOM, laid out correctly, and invisible.

The library cannot prevent it, because it does not know what a panel renders. The fix is one
line, on your own element:

```css
.my-map { isolation: isolate; }
```

That contains the library's stacking inside your element instead of letting it compete with
the overlay's. Any wrapper works — `isolation: isolate`, `position: relative; z-index: 0`, or
a `transform` — as long as your content sits in its own stacking context.

The demo hits this exactly, with Leaflet, and fixes it this way.

## Widgets from data

When the widgets are data — one per selected feature, one per running job — there is no
template to write them in:

```ts
const widgets = useFloatingWidgets()

widgets.open(`feature-${id}`, {
  title: `Feature ${id}`,
  component: FeatureInfo,
  props: { id },
  anchor: 'top-right',
  width: 300,
  height: 220,
})
widgets.close(`feature-${id}`)
widgets.closeAll()
```

`openIds` is a reactive list of what is open, and `isOpen(id)` asks about one. A widget
written in the template is the simpler option and behaves identically otherwise.

## Coming from react-dockable-desktop

| rdd | vdd |
|---|---|
| `<PanelOverlayRoot>` | `<VddPanelOverlay>` |
| `<PanelToolbar>` | `<VddPanelToolbar>` |
| `<ToolbarButton icon={…}>` | `<VddToolbarButton>` with the icon as the slot |
| `<ToolbarToggle active onToggle>` | `<VddToolbarToggle v-model:active>` |
| `<ToolbarSearchInput onSearch onSelect>` | `<VddToolbarSearch :search @select>` |
| `<ToolbarSeparator>` / `<ToolbarSpacer>` / `<ToolbarCenter>` / `<ToolbarItem>` | `Vdd`-prefixed, same behaviour |
| `<PanelFloatingWindow>` | `<VddFloatingWidget>` |
| `open` + `onClose` | `v-model:open` |
| `defaultAnchor` + `defaultStretch` + `stretch` + `onPlacementChange` | one `v-model:placement` |
| `usePanelFloatingWindow()` | a `ref` plus `v-model:open` — there is no hook |
| `usePanelFloatingWindowManager()` | `useFloatingWidgets()`, with `open`/`close` rather than `openManaged`/`closeManaged` |

Two things behave better rather than differently:

- **A docked widget can no longer be resized over a toolbar** on the far side. rdd bounded
  growth by the panel's edge, so it could.
- **Every resize handle is grabbable across its whole area.** rdd positioned them at `-4px` to
  straddle the edge, and `overflow: hidden` clipped half of each one away; at a rounded corner
  nothing was hittable at all, so a corner drag silently did nothing.
