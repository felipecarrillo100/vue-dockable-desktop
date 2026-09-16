/**
 * M10 gate — side panels, modals, toasts, dirty state.
 *
 * The 47 tests cover behaviour. These pin the structural decisions behind it: that the
 * close-with-guards-and-dirty-check sequence exists exactly once, that Escape routing is
 * stated once, that asking the user is the default rather than something each call site
 * remembers, and that the lifecycle ordering the plan flagged is written down.
 */
import { readFileSync } from 'node:fs'
import { declarationsFor, stripSourceComments } from './lib/css.mjs'

const failures = []
const must = (cond, msg) => { if (!cond) failures.push(msg) }
const src = (p) => stripSourceComments(readFileSync(p, 'utf8'))

const css = readFileSync('src/index.css', 'utf8')
const overlays = src('src/core/overlays.ts')
const workspace = src('src/core/workspace.ts')
const host = src('src/composables/useOverlayHost.ts')
const modals = src('src/components/VddModals.vue')
const modalHost = src('src/components/VddModalHost.vue')
const sidePanelHost = src('src/components/VddSidePanelHost.vue')
const frame = src('src/components/VddOverlayFrame.vue')
const confirm = src('src/components/VddConfirm.vue')
const toast = src('src/core/toast.ts')
const toasts = src('src/components/VddToasts.vue')
const toastItem = src('src/components/VddToastItem.vue')
const mount = src('src/components/VddPanelMount.vue')

// ── 1. One close sequence, not one per container ────────────────────────────
// rdd had thirty-five identical lines in SidePanelRenderer and again in ModalStackRenderer.
// Two copies is how two containers come to disagree about what closing a dirty panel does.
must(/async function requestClose\(/.test(overlays),
  'the close sequence must live in the store, once')
must(!/dirty\)/.test(modalHost) && !/dirty\)/.test(sidePanelHost),
  'neither host may re-implement the dirty check — that is what requestClose is for')
must((host.match(/overlays\.requestClose\(/g) ?? []).length === 1,
  'both hosts must reach the close through the one shared composable')
must(/useOverlayHost/.test(modalHost) && /useOverlayHost/.test(sidePanelHost),
  'both hosts must use the shared composable rather than their own logic')

// A refusal must be the default when nothing can ask. Discarding a user's edits because no
// host happened to be mounted is the one outcome that is never acceptable.
must(/if \(!options\?\.confirm\) return/.test(overlays),
  'a dirty overlay with no way to ask must stay open')
must(/confirmRenderer\?\.\(request\) \?\? Promise\.resolve\(false\)/.test(overlays),
  'confirmDiscard must resolve false when no renderer is registered, never true')

// ── 2. Asking is the default, not a thing each call site remembers ──────────
// rdd wired the question into each container and never wired it into the docked-panel path,
// so closing a dirty tab discarded the edits without asking.
must(/const confirm = options\?\.onConfirm[\s\S]{0,200}overlays\.confirmDiscard/.test(workspace),
  'requestClosePanel must default to the built-in question')
must(/onMounted\(\(\) => overlays\.setConfirmRenderer\(confirmDiscard\)\)/.test(modals),
  'VddModals must register the question renderer')
must(/onBeforeUnmount\(\(\) => overlays\.setConfirmRenderer\(null\)\)/.test(modals),
  'unmounting the host must deregister it, or a dirty close awaits a modal nothing renders')
// Every dismissal is a refusal, so the promise must settle on unmount too.
must(/onBeforeUnmount\(\(\) => settle\(false\)\)/.test(confirm),
  'the question must resolve when dismissed by Escape, the backdrop or the x')
must(/if \(settled\) return/.test(confirm), 'it must resolve exactly once')

// ── 3. Escape routing, stated once ─────────────────────────────────────────
// rdd expressed the same rule twice in two shapes: `modals.length === 0` in the drawer and
// `isTopmost` in the modal.
must(/function onKeydown/.test(host), 'Escape routing belongs in the shared composable')
must(!/Escape/.test(modalHost) && !/Escape/.test(sidePanelHost),
  'neither host may carry its own Escape handler')
must(/overlays\.topmostModal\(\)\?\.id !== self\.id/.test(host),
  'only the topmost modal may answer Escape')
must(/overlays\.state\.modals\.length > 0/.test(host),
  'a drawer must ignore Escape while any modal is open')
must(/event\.stopPropagation\(\)/.test(host),
  'the answering modal must stop the event, or the drawers below close as well')

// ── 4. Shared chrome, with literal class names ─────────────────────────────
must(/VddOverlayFrame/.test(modalHost) && /VddOverlayFrame/.test(sidePanelHost),
  'the header and body chrome must be shared')
for (const name of ['vdd-modal-header', 'vdd-modal-body', 'vdd-side-panel-header', 'vdd-side-panel-body']) {
  must(frame.includes(`'${name}'`),
    `${name} must appear as a literal, so it is findable in the source and to the gates`)
}

// Stacking against the variable, so `zIndexBase` moves the modals with everything else.
must(/var\(--vdd-z-base/.test(modalHost), 'modal stacking must be relative to --vdd-z-base')

// The confirmation's own layout is CSS, not inline. rdd set three properties inline and drew
// its separator with an <hr> that existed only to be a line (divergence D12).
const message = declarationsFor(css, '.vdd-confirmation-message')
must(message.length > 0, '.vdd-confirmation-message needs a rule')
must(/font-size/.test(message) && /line-height/.test(message), 'its type must be styled in CSS')
must(!/<hr/.test(confirm), 'the separator must be a border, not a presentational <hr>')

// ── 5. Body padding: nothing inline unless asked ───────────────────────────
// An inline default would need !important to override and is invisible to a review.
must(/bodyPadding != null \? \{ padding: bodyPadding \} : undefined/.test(frame),
  'body padding must be set only when supplied')

// ── 6. The toast queue is state, not an emitter ────────────────────────────
must(/export const toastQueue = reactive</.test(toast),
  'the queue must be module-level reactive state, so toast() works outside components')
must(!/subscribe|emitter|listeners/.test(toast),
  'there must be no emitter: the store is the state (ADR 0004)')
// maxVisible as a computed slice, so promotion is not imperative bookkeeping.
must(/const visible = computed\(/.test(toasts),
  'the visible set must be derived, not a second array shifted from')
must(/shown >= props\.maxVisible/.test(toasts), 'maxVisible must bound that slice')
must(/if \(item\.exiting\) \{ result\.push\(item\); continue \}/.test(toasts),
  'a toast animating out must keep its place, or the next one yanks it off screen')
// A toast dismissed while still queued has nothing to animate, so something must drop it.
must(/if \(item\.exiting && !onScreen\.has\(item\.id\)\) removeToast\(item\.id\)/.test(toasts),
  'a queued toast that is dismissed must be removed, not left as an invisible record')

// The height re-sync, which is the whole of rdd's T13 regression.
must(/scrollHeight/.test(toastItem),
  'the height cap must be read from scrollHeight — offsetHeight returns the stale cap')
must(/observer\.observe\(body\.value\)/.test(toastItem),
  'the observer must watch the inner body: the card holds its own height and never resizes')
must(/typeof ResizeObserver !== 'undefined'/.test(toastItem),
  'the height sync is a browser refinement and must not be required for the toast to work')
must(/setTimeout\(\(\) => emit\('exited', props\.toast\.id\), 520\)/.test(toastItem),
  'a transition that never runs must not strand the record')

// ── 7. The lifecycle divergence is written down ────────────────────────────
// Minimising does not move a panel between containers. Reporting the docked type for a
// minimised floating window made one cycle look like two container changes.
must(/panel\.state === 'minimized' \? panel\.previousState \?\? 'docked' : panel\.state/.test(mount),
  'a minimised panel must report the container it will be restored to')
const parity = readFileSync('docs/PARITY.md', 'utf8')
must(/\| D14 \|/.test(parity),
  'the watcher-ordering difference must be recorded as a divergence, not left implicit')

// A panel can always trust its own id, whatever the caller passed.
must(/v-bind="info\?\.props \?\? \{\}"[\s\S]{0,80}:panel-id="panelId"/.test(mount),
  'the injected panelId must be bound after the caller props, so it cannot be shadowed')

if (failures.length) {
  console.error('M10: FAIL'); failures.forEach(f => console.error('  ' + f)); process.exit(1)
}
console.log('M10: ok — one close sequence, one Escape rule, asking by default, ' +
  'queue as state, lifecycle divergence recorded')
