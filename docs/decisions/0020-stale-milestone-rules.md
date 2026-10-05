# 0020 — Three milestone rules that outlived the code they described

**Status:** Accepted (2026-10-05, owner's decision, alongside the 1.8.x test tooling). Integrity
rule 1 asks for exactly this: a gate that is genuinely wrong is changed by a decision record, made
separately from any implementation change.

## Context

`npm run gate:release` (1.8.x) is the first thing to run every milestone gate together since the
port. Three failed on a library that is not broken. Each pins a detail that a later, deliberate
change moved, and none had been run since that change.

- **M2** requires `src/core/rtl.ts` to exist and stay framework-free. The module was deleted at M13
  as dead code with no importers (`docs/evidence/M13.md`), so the rule has failed since M13.
- **M5** requires the workspace-resize clamp in `VddDesktop.vue`, matching `view.width - 100` and
  `if (!w.anchor)`. The arithmetic moved into the pure `clampFloatingRect` in
  `src/core/anchorGeometry.ts` (`view.width - 100`, `if (!anchored)`), which `VddDesktop.vue` calls
  with `w.anchor != null`. The behaviour is unchanged; only where it is written moved.
- **M6's browser gate** drops a tab on the *right half* of another and expects it to land after it,
  in both directions. 1.1.2 fixed right-to-left tab drops ("a tab dropped on another tab's left half
  was inserted on its right, and vice versa"): in RTL the right half is the logical start, so the
  tab now — correctly — lands before. The gate still expected the pre-fix side. It has failed
  since at least 1.3.0.

## Decision

Each rule keeps its intent and checks today's code.

1. **M2** checks the pure modules that exist, without `rtl`. What it guards — the pure layer imports
   no Vue — is unchanged for every one of them.
2. **M5** checks `clampFloatingRect` for the two properties (part of the title bar stays grabbable;
   only a free-floating window is clamped), and that `VddDesktop.vue` keeps the windows clamped
   through it, passing whether each is anchored.
3. **M6** drops on the target tab's **logical end** half — the right half in LTR, the left half in
   RTL — and keeps the same assertion: the dragged tab sits right after the target. That still
   tests what the case is for (the insertion index accounts for the removal), now in both
   directions, and it would fail on the pre-1.1.2 behaviour.

The new M2 and M5 rules have seeded violations in the selftest, as rule 6 requires.

## Consequences

- `gate:release` covers every milestone, M1–M17, and the drag-and-dock and RTL checks run again at
  every release.
- A rule that pins *where* code lives is the kind that goes stale. A rule should state the
  behaviour, or the smallest code shape that implies it, and follow the code when it moves.
