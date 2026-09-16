# Architecture Decision Records

One file per decision. Each states the context, the decision, and — most importantly — the
consequences we are accepting. They are numbered in the order they were taken, not by
importance.

**Status legend:** `Proposed` (awaiting agreement) · `Accepted` · `Superseded by NNNN` ·
`Rejected`.

| # | Decision | Status |
|---|---|---|
| [0001](0001-vue-native-rewrite.md) | A Vue-native rewrite, not a transliteration | Accepted |
| [0002](0002-zero-unmount-via-teleport.md) | Zero unmount via `<Teleport>` over a cached element | Proposed — pending the P0 spike |
| [0003](0003-reactive-store.md) | A plain `reactive` store; no Pinia | Accepted |
| [0004](0004-store-outside-components.md) | The workspace is created outside the component tree | Accepted |
| [0005](0005-vmodel.md) | `v-model` for every two-way prop | Accepted |
| [0006](0006-refs-over-subscriptions.md) | Reactive refs instead of lifecycle subscriptions | Accepted |
| [0007](0007-slots-over-render-props.md) | Slots instead of render props | Accepted |
| [0008](0008-css-prefix.md) | `vdd-` classes and `--vdd-*` tokens | Accepted |
| [0009](0009-layout-json-compatibility.md) | Layout JSON stays compatible with rdd | Accepted — hard requirement |
| [0010](0010-naming.md) | Component and composable naming | Accepted |
| [0011](0011-tests-as-specification.md) | The rdd test suite is the specification | Accepted |
| [0012](0012-fix-known-defects.md) | Fix rdd's known defects in vdd, log the divergence | Accepted |
| [0013](0013-demo-scope.md) | Demo: same capabilities, lighter dependencies | Accepted |
| [0014](0014-preserve-scroll-and-focus.md) | Preserve scroll position and focus across re-parenting | Accepted |
| [0015](0015-toolchain-pins.md) | Toolchain pins (TypeScript 5.x, Vue peer ^3.4) | Accepted |
