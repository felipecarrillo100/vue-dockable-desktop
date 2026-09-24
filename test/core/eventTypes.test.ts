/**
 * An event map may be declared as an `interface`, the way the manual shows it.
 *
 * The constraint used to be `Record<string, unknown>`, which an interface does not satisfy (it
 * has no index signature), so the documented `interface MyEvents { … }` failed with TS2344.
 * This file is type-checked by `vue-tsc`; the runtime assertion only keeps vitest honest.
 */
import { describe, it, expect } from 'vitest'
import { createWorkspace } from '../../src/core/workspace'
import { EventBus } from '../../src/core/eventBus'

interface MyEvents { 'map:zoom': { level: number } }
type MyEventsAlias = { 'map:zoom': { level: number } }

describe('event maps', () => {
  it('accepts an interface as well as a type alias', () => {
    const viaInterface = createWorkspace<MyEvents>({ panels: {} })
    const viaAlias = createWorkspace<MyEventsAlias>({ panels: {} })
    const levels: number[] = []
    viaInterface.subscribe('map:zoom', ({ level }) => { levels.push(level) })
    viaInterface.publish('map:zoom', { level: 12 })
    viaAlias.publish('map:zoom', { level: 3 })
    // @ts-expect-error — the payload is still checked against the map
    viaInterface.publish('map:zoom', { level: 'high' })
    expect(levels).toEqual([12, 'high'])
    expect(new EventBus<MyEvents>()).toBeInstanceOf(EventBus)
  })
})
