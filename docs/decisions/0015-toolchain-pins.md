# 0015 — Toolchain pins

**Status:** Accepted

## Context

Discovered while running M0: `npm i -D typescript` now installs **TypeScript 7**, the native
(Go) port. `vue-tsc@3` resolves `typescript/lib/tsc` internally, and TS 7 removed that path
from its `exports` map, so type-checking fails immediately with
`ERR_PACKAGE_PATH_NOT_EXPORTED` — before any project code is even read.

## Decision

Pin the toolchain, and state why next to each pin so a future upgrade is a decision rather
than an accident:

| Package | Pin | Reason |
|---|---|---|
| `typescript` | `~5.9` | `vue-tsc@3` cannot drive TS 7. Revisit when vue-tsc supports it |
| `vue` (peer) | `^3.4` | `defineModel` is stable from 3.4 ([0005](0005-vmodel.md)) |
| `vue` (dev) | `^3.5` | `useTemplateRef` is 3.5; used internally only, never required of consumers |
| `vite` | `^8` | current major |
| `playwright-core` | `^1.63` | browser gates; launched with `channel: 'chrome'`, so no browser download |

The peer range stays at `^3.4` deliberately: nothing in the public API needs 3.5, so
consumers are not forced to upgrade for our internal convenience.

## Consequences

- `npm run gate` fails loudly rather than silently skipping type-checking if a pin drifts —
  the standing gate runs `vue-tsc --noEmit`, which is exactly what broke here.
- Renovate/Dependabot-style automatic major bumps on `typescript` will break the build. That
  is the intended outcome: it should break at the gate, not in someone's editor.
