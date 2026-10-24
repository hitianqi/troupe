import type { TroupeMission } from '../types'
import { viewLines, viewport } from './lines.ts'
import { TONES, textOf } from './view.ts'
import type { Line } from './view.ts'

// One screen of bin/troupe-panel: the view (lines.ts) through its viewport
// for a terminal of `width` x `rows`, cut so nothing wraps, as ANSI or plain
// text; and the keys and wheel that scroll it.

const sgr = (hex: string) => `\x1b[38;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`

/** The line cut to `width` cells, the last one `…` when cut. */
export const clip = (line: Line, width: number): Line => {
  if (textOf(line).length <= width) return line
  const out: Line = []
  let left = width - 1
  for (const run of line) {
    if (left <= 0) break
    out.push({ ...run, text: run.text.slice(0, left) })
    left -= run.text.length
  }

  return [...out, { text: '…' }]
}

const paint = (line: Line) =>
  line.map(run => (run.tone || run.bold || run.strike ? `${run.tone ? sgr(TONES[run.tone]) : ''}${run.bold ? '\x1b[1m' : ''}${run.strike ? '\x1b[9m' : ''}${run.text}\x1b[0m` : run.text)).join('')

/** The panel's screen, scrolled `offset` rows: at most `rows` lines, and where the viewport settled. */
export function frame(m: TroupeMission | { missing: string }, width: number, rows: number, isColour: boolean, offset = 0): { lines: string[]; offset: number; maxOffset: number } {
  const all: Line[] = 'missing' in m ? [[{ text: 'TROUPE', tone: 'bright', bold: true }], [{ text: m.missing }]] : viewLines(m, width)
  const view = viewport(all, rows, offset)

  return { ...view, lines: view.lines.map(line => (isColour ? paint(clip(line, width)) : textOf(clip(line, width)).trimEnd())) }
}

export type Scroll = 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end' | 'wheelUp' | 'wheelDown' | 'quit'

const KEYS: [RegExp, Scroll | undefined][] = [
  [/^\x1b\[<64;\d+;\d+[Mm]/, 'wheelUp'],
  [/^\x1b\[<65;\d+;\d+[Mm]/, 'wheelDown'],
  [/^\x1b\[<\d+;\d+;\d+[Mm]/, undefined],
  [/^(\x1b\[A|\x1bOA|k)/, 'up'],
  [/^(\x1b\[B|\x1bOB|j)/, 'down'],
  [/^\x1b\[5~/, 'pageUp'],
  [/^\x1b\[6~/, 'pageDown'],
  [/^(\x1b\[H|\x1bOH|\x1b\[1~|\x1b\[7~)/, 'home'],
  [/^(\x1b\[F|\x1bOF|\x1b\[4~|\x1b\[8~)/, 'end'],
  [/^\x03/, 'quit'],
]

/** What a read from the terminal asks, in order: arrows, j/k, PgUp/PgDn, Home/End, the wheel (SGR mouse), ctrl+c; anything else is skipped. */
export function actionsOf(input: string): Scroll[] {
  const actions: Scroll[] = []
  let rest = input
  while (rest.length > 0) {
    const hit = KEYS.map(([pattern, action]) => [pattern.exec(rest)?.[0], action] as const).find(([match]) => match !== undefined)
    if (hit?.[1]) actions.push(hit[1])
    rest = rest.slice(hit?.[0]?.length ?? 1)
  }

  return actions
}

/** The offset after `action` in a window of `rows` rows. */
export const scrolled = (offset: number, action: Scroll, rows: number, maxOffset: number): number => {
  const page = Math.max(1, rows - 3)
  const by: Record<Scroll, number> = { up: -1, down: 1, wheelUp: -3, wheelDown: 3, pageUp: -page, pageDown: page, home: -Infinity, end: Infinity, quit: 0 }

  return Math.max(0, Math.min(maxOffset, offset + by[action]))
}
