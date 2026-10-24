import type { TroupeMission } from '../types'
import { graph } from './graph.ts'
import { compactOrders, compactRoles, detail, headerLine } from './view.ts'
import type { Line } from './view.ts'

// The view top to bottom, as lines of styled runs: what bin/troupe-panel
// paints as ANSI through a viewport of its own. No engine import, so plain
// Node runs it.

/** The whole view, most important first: the header (the goal on one line), the GRAPH, compact ROLES, compact ORDERS, then DETAIL. */
export function viewLines(m: TroupeMission, width: number): Line[] {
  return [headerLine(m, width), [], ...graph(m, width), [], ...compactRoles(m, width), [], ...compactOrders(m, width), ...detail(m, width)]
}

/** What `viewport` shows: at most `rows` lines, the offset it settled on, and the largest offset there is. */
export type Viewport = { lines: Line[]; offset: number; maxOffset: number }

/**
 * A window of `rows` rows over `all` (troupe-panel's), scrolled `offset` rows
 * down: the first line (the header) stays on top; `↑ N more` takes the next
 * row while scrolled, and `↓ N more rows · ↑↓ PgUp PgDn` the last while there
 * is more below. The offset is held between 0 and the end. Never more than
 * `rows` lines.
 */
export function viewport(all: Line[], rows: number, offset: number): Viewport {
  if (all.length <= rows) return { lines: all, offset: 0, maxOffset: 0 }
  const [header = [], ...body] = all
  const room = rows - 1
  // At the end the top hint takes a row, and the last body line shows on the last row.
  const maxOffset = Math.max(1, body.length - Math.max(1, room - 1))
  const at = Math.max(0, Math.min(maxOffset, Math.round(offset)))
  const top: Line[] = at > 0 ? [[{ text: `↑ ${at} more`, tone: 'dim' }]] : []
  const left = room - top.length
  const below = body.length - at - left
  const shown = below > 0 ? Math.max(0, left - 1) : left
  const bottom: Line[] = below > 0 ? [[{ text: `↓ ${body.length - at - shown} more rows · ↑↓ PgUp PgDn`, tone: 'dim' }]] : []

  return { lines: [header, ...top, ...body.slice(at, at + shown), ...bottom].slice(0, Math.max(0, rows)), offset: at, maxOffset }
}
