import { h, markRaw } from 'vue'
import type { Component } from 'vue'

/**
 * The demo's icons, as components.
 *
 * `markRaw`, because a component definition is not reactive data — the library keeps them raw
 * internally for the same reason, and passing a reactive proxy of one is pure waste.
 */
export const icon = (paths: string[], stroke = 2): Component => markRaw({
  render: () => h('svg', {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': stroke,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    style: 'display: block',
  }, paths.map(d => h('path', { d }))),
})

export const ICONS = {
  /* Three bars, for the sidebar's header action — a hamburger is what a rail's top button
     conventionally is, and what that button's own id has always claimed it was. */
  hamburger: icon(['M4 6h16', 'M4 12h16', 'M4 18h16'], 2.2),
  code: icon(['m18 16 4-4-4-4', 'm6 8-4 4 4 4', 'm14.5 4-5 16']),
  document: icon(['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6']),
  map: icon(['m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z', 'M9 3v15', 'M15 6v15']),
  globe: icon(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3.6 9h16.8', 'M3.6 15h16.8', 'M12 3a15 15 0 0 1 0 18', 'M12 3a15 15 0 0 0 0 18']),
  layers: icon(['m12 2 9 5-9 5-9-5z', 'm3 12 9 5 9-5', 'm3 17 9 5 9-5']),
  tools: icon(['M14.7 6.3a4 4 0 1 0 5 5L20 21H4l7.7-7.7a4 4 0 0 1 3-7z']),
  table: icon(['M3 3h18v18H3z', 'M3 9h18', 'M3 15h18', 'M9 3v18']),
  terminal: icon(['m4 17 6-6-6-6', 'M12 19h8']),
  eye: icon(['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']),
  help: icon(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4', 'M12 17h.01']),
  clock: icon(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2']),
  locator: icon(['M3 3h18v18H3z', 'm8 8 8 8', 'm16 8-8 8']),
  warning: icon(['m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01']),
  pencil: icon(['M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z']),
  rtl: icon(['M8 3 4 7l4 4', 'M4 7h16', 'm16 13 4 4-4 4', 'M20 17H4']),
  rocket: icon(['M4.5 16.5c-1.5 1.3-2 5.5-2 5.5s4.2-.5 5.5-2c.7-.9.7-2.2-.1-3a2.2 2.2 0 0 0-3.3-.5z', 'M12 15 9 12a11 11 0 0 1 8-9c1.8 0 3 1.2 3 3a11 11 0 0 1-8 9z', 'M9 12H4s.5-2.8 2-4c1.7-1.3 5 0 5 0']),
  panel: icon(['M3 3h18v18H3z', 'M3 9h18']),
} as const
