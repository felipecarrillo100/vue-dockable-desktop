// @vitest-environment node
/**
 * Server rendering must not throw.
 *
 * vdd is a client-side DOM library — panels live in real elements that are moved between
 * hosts — so under Nuxt or any SSR setup the supported shape is `<ClientOnly>`. But rendering
 * `<VddDesktop>` on the server used to throw `document is not defined` from setup, which takes
 * the whole page render down with it rather than just leaving the workspace to the client.
 * This runs with no DOM at all.
 */
import { describe, it, expect } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createWorkspace } from '../../src/core/workspace'
import VddDesktop from '../../src/components/VddDesktop.vue'
import { useColorScheme } from '../../src/composables/useColorScheme'

const P = defineComponent({ name: 'MockPanel', setup: () => () => h('div', 'panel') })

describe('server rendering', () => {
  it('has no DOM in this environment', () => {
    expect(typeof document).toBe('undefined')
  })

  it('renders <VddDesktop> with an open panel without throwing', async () => {
    const ws = createWorkspace({ panels: { map: { component: P } } })
    ws.openPanel('a', 'map')
    const app = createSSRApp({ render: () => h(VddDesktop) })
    app.use(ws)
    const html = await renderToString(app)
    expect(html).toContain('vdd-workspace')
  })

  it('useColorScheme reads as dark with no document', async () => {
    let scheme: string | undefined
    const app = createSSRApp({ setup() { scheme = useColorScheme().value; return () => h('div') } })
    await renderToString(app)
    expect(scheme).toBe('dark')
  })
})
