/**
 * @internal The app's `popoutWrapper` around the default slot, with a window and document; just the
 * slot when there is no wrapper. It adds no element of its own, so the slot's tree keeps its shape
 * whether there is a wrapper or not.
 */
import { defineComponent, h } from 'vue'
import type { Component, PropType } from 'vue'

export default defineComponent({
  name: 'VddPopoutWrap',
  props: {
    /** The app's component, or null for none. */
    wrapper: { type: [Object, Function] as PropType<Component | null>, default: null },
    /** The window and document it gets (a Window is not a plain Object, so no runtime type). */
    win: { type: null as unknown as PropType<Window | null>, default: null },
    doc: { type: null as unknown as PropType<Document | null>, default: null },
  },
  setup(props, { slots }) {
    return () => (props.wrapper && props.win && props.doc
      ? h(props.wrapper, { window: props.win, document: props.doc }, { default: () => slots.default?.() })
      : slots.default?.())
  },
})
