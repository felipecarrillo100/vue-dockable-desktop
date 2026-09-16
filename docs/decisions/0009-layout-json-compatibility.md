# 0009 — Layout JSON stays compatible with rdd

**Status:** Accepted — **hard requirement**

## Context

`saveLayout()` produces a JSON string that applications persist — in `localStorage`, in a
user profile, on a server. It is user data with a long life.

A team migrating a React app to Vue will rewrite their call sites (that is inherent to
[0001](0001-vue-native-rewrite.md)). They should not also have to discard every workspace
their users have arranged and saved.

The project owner marked this *strongly desired*; it is recorded here as a hard
requirement.

## Decision

`SerializedLayout` is **byte-compatible in both directions**, at `version: 2`. A layout
saved by rdd 6.2.0 loads in vdd, and a layout saved by vdd loads in rdd 6.2.0.

That fixes the following as a contract rather than an implementation detail:

| Field | Contract |
|---|---|
| `version` | stays `2`. A change here is a breaking change for both libraries |
| `gridRoot` | identical tree shape — `{type:'branch', orientation, children, sizes}` / `{type:'leaf', id, panels, activePanelId, canClose?, keepOnEmpty?}`, including leaf id strings |
| `floating` | `{id, x, y, width, height, z, maximized?, anchor?}`, numbers or CSS strings as today |
| `minimized` | `{id, title, component}[]` |
| `panels` | `PanelInfo` including `props`, `dedupeKey`, `serializable`, `previousState`, `lastFloatingRect`, `lastLeafId`, `dirty`, `dirtyOptions` |
| `activePanelId` | optional; omitted when nothing is active or the active panel did not survive pruning |
| legacy `stickyRight`/`stickyBottom` | the pre-`anchor` migration is carried over verbatim |

Corollaries that constrain the rest of the design:

- The reactive store's serialisable subset must hold exactly these shapes. No renaming
  fields, no changing a leaf id scheme, no adding a required field.
- Anything vdd wants to persist that rdd does not know about must be **optional and
  ignorable**, and rdd's parser whitelists what it reads, so a newer field is safely
  dropped there. Inner-widget placement is the obvious candidate — rdd serialises nothing
  about `PanelFloatingWindow`, and vdd should not unilaterally start.
- `isSerializable`'s classification must agree with rdd's, or the same workspace would
  prune different panels in each library.

## Verification

By fixture, not by inspection:

1. Layouts captured from rdd 6.2.0 — covering nested splits, tabs, floating, anchored,
   maximised, minimised, `keepOnEmpty`, non-serialisable props, legacy `sticky*`, and a
   pre-`activePanelId` layout — are committed under `test/fixtures/rdd-6.2.0/`.
2. For each: load into vdd, assert the resulting state, `saveLayout()`, assert the output
   is deep-equal to the input.
3. The same fixtures are contributed to rdd's suite, so neither library can drift the
   format without turning a test red on both sides.

## Consequences

- Any future format change must be designed for both libraries at once. This is a real
  ongoing cost and is accepted deliberately.
- vdd inherits rdd's format warts, including `version` never having been bumped for the
  additive `activePanelId` field.
- The upside beyond migration: these fixtures are genuine cross-implementation tests, which
  catch tree-manipulation bugs that self-consistent round-trip tests cannot.
