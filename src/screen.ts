import { cellsOf, coloursOf, rgbOf, TONES } from './canvas.ts'
import type { Line, Rgb } from './canvas.ts'

export { rgbOf } from './canvas.ts'
export type { Rgb } from './canvas.ts'

// The live panel's screen as cells with their own colours, so effects can
// shade any cell and give it a background. A screen is written whole only at
// start and on resize; after that only the cells that changed since the last
// one, and the panel wraps each write in a synchronized update.

/** `ch` is '' on the right half of a wide character. Without `fg` the terminal's own colour shows. */
export type Cell = { ch: string; fg?: Rgb; bg?: Rgb; bold?: boolean }

export const RGB = Object.fromEntries(Object.entries(TONES).map(([tone, hex]) => [tone, rgbOf(hex)])) as Record<keyof typeof TONES, Rgb>

export class Screen {
  readonly cells: Cell[][]
  readonly width: number
  readonly height: number
  constructor(width: number, height: number, cells?: Cell[][]) {
    this.width = width
    this.height = height
    this.cells = cells ?? Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: ' ' })))
  }
  /** The drawn lines as cells, washes and fades on `paper`; `plain` drops every style. Control characters never reach the terminal. */
  static of(lines: Line[], width: number, height: number, plain = false, paper?: Rgb): Screen {
    const screen = new Screen(width, height)
    lines.slice(0, height).forEach((line, row) => {
      const cells = screen.cells[row] ?? []
      let col = 0
      for (const run of line) {
        const style: Omit<Cell, 'ch'> = plain ? {} : { ...coloursOf(run, paper), ...(run.bold && { bold: true }) }
        for (const ch of run.text.replace(/[\x00-\x1f\x7f-\x9f]/g, '')) {
          const size = cellsOf(ch)
          const prev = cells[col - 1]
          if (size === 0) { if (prev !== undefined && prev.ch !== '') prev.ch += ch; continue }
          if (col + size > width) return
          cells[col] = { ch, ...style }
          if (size === 2) cells[col + 1] = { ch: '', ...style }
          col += size
        }
      }
    })

    return screen
  }
  clone(): Screen {
    return new Screen(this.width, this.height, this.cells.map(line => line.map(cell => ({ ...cell }))))
  }
  at(row: number, col: number): Cell | undefined {
    return this.cells[row]?.[col]
  }
}

const same = (a: Rgb | undefined, b: Rgb | undefined) => a === b || (a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1] && a[2] === b[2])
const equal = (a: Cell, b: Cell) => a.ch === b.ch && !!a.bold === !!b.bold && same(a.fg, b.fg) && same(a.bg, b.bg)
const RESET = '\x1b[0m'
const sgr = (cell: Cell) => `\x1b[0${cell.fg ? `;38;2;${cell.fg.join(';')}` : ''}${cell.bg ? `;48;2;${cell.bg.join(';')}` : ''}${cell.bold ? ';1' : ''}m`

/** Writes the given columns of each row: the cursor moves only over a gap, the style changes only when it differs. */
const write = (screen: Screen, columns: (row: number) => number[], start?: (row: number) => string) => {
  let out = ''
  let style = RESET
  for (let row = 0; row < screen.height; row += 1) {
    // A row that starts addressed and cleared has the cursor at its first column; it clears with no background.
    let cursor = -1
    if (start !== undefined) {
      out += `${style === RESET ? '' : RESET}${start(row)}`
      style = RESET
      cursor = 0
    }
    for (const col of columns(row)) {
      const cell = screen.at(row, col)
      if (cell === undefined || cell.ch === '') continue
      if (col !== cursor) out += `\x1b[${row + 1};${col + 1}H`
      const next = sgr(cell)
      if (next !== style) out += style = next
      out += cell.ch
      cursor = col + Math.max(1, cellsOf(cell.ch))
    }
  }

  return style === RESET ? out : out + RESET
}

/** The whole screen: every row addressed and cleared, then its cells up to the last one that shows; no newline can scroll it. */
export const full = (screen: Screen): string => '\x1b[?25l\x1b[?7l\x1b[H\x1b[2J' + write(screen, row => {
  const cells = screen.cells[row] ?? []
  let end = cells.length
  while (end > 0 && cells[end - 1]?.ch === ' ' && cells[end - 1]?.bg === undefined) end -= 1

  return Array.from({ length: end }, (_, col) => col)
}, row => `\x1b[${row + 1};1H\x1b[2K`)

/** Only the cells that differ from `prev`, a screen of the same size; '' when nothing changed. */
export const diff = (prev: Screen, next: Screen): string => write(next, row => {
  const before = prev.cells[row] ?? []
  const after = next.cells[row] ?? []
  const dirty = new Set<number>()
  for (let col = 0; col < next.width; col += 1) {
    const a = before[col]
    const b = after[col]
    if (a !== undefined && b !== undefined && equal(a, b)) continue
    dirty.add(col)
    // A wide character is written from its left half, and writing over either half clears both.
    if (b?.ch === '' || a?.ch === '') dirty.add(col - 1)
    if (a !== undefined && cellsOf(a.ch) === 2) dirty.add(col + 1)
  }

  const cols = [...dirty].filter(col => col >= 0).sort((x, y) => x - y)
  // A short run of unchanged cells costs less to rewrite than a cursor move over it.
  return cols.flatMap((col, index) => {
    const prior = cols[index - 1]
    const gap = prior === undefined || col - prior - 1 > GAP ? [] : Array.from({ length: col - prior - 1 }, (_, i) => prior + 1 + i)

    return [...gap, col]
  })
})
const GAP = 4
