import { h, markRaw } from 'vue'

/**
 * `?poico=1` (rdd 7.12.2): an icon that takes its size from its box: an inline-block span with
 * width/height auto around an <svg> with only a viewBox, as an Angular Material mat-icon set to auto.
 */
export const unsizedIcon = markRaw({
  name: 'UnsizedIcon',
  render: () => h('span', { 'data-po-icon': '', style: 'display:inline-block;width:auto;height:auto' }, [
    h('svg', { viewBox: '0 0 24 24' }, [h('path', { d: 'M4 4h16v16H4z', fill: 'currentColor' })]),
  ]),
})
