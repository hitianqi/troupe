// A character canvas in the OpenRig TUI's theme: the panel draws every part
// as cells of text, then reads them back as lines of styled runs, painted as
// ANSI or kept plain for the goldens. (The mod's view.ts and graph.ts keep
// their own copies until step 9 deletes them.)

/** OpenRig's theme (tui/dist/theme.js), `dim` lighter so waiting items read. */
export const TONES = {
  bright: '#e8eaf0',
  accent: '#6fa8ff',
  accentBright: '#9ac2ff',
  chrome: '#4e6991',
  warn: '#f4be5c',
  ok: '#98c379',
  error: '#e06c75',
  dim: '#9aa3ad',
} as const
export type Tone = keyof typeof TONES
export type Style = { tone?: Tone; bold?: true }
export type Run = Style & { text: string }
export type Line = Run[]

export const textOf = (line: Line) => line.map(run => run.text).join('')

/** `text` in `width` cells: padded, or cut with `…`. */
export const fit = (text: string, width: number) =>
  width <= 0 ? '' : text.length <= width ? text + ' '.repeat(width - text.length) : `${text.slice(0, Math.max(0, width - 1))}…`

/** Greedy wrap on spaces; a word longer than the width is cut into pieces. */
export const wrap = (text: string, width: number): string[] => {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word
    while (rest.length > width) {
      if (line !== '') lines.push(line)
      lines.push(rest.slice(0, width))
      rest = rest.slice(width)
      line = ''
    }
    if (line === '') line = rest
    else if (line.length + 1 + rest.length <= width) line += ` ${rest}`
    else {
      lines.push(line)
      line = rest
    }
  }

  return line === '' ? lines : [...lines, line]
}

type Cell = Style & { ch: string }

export const SINGLE = '┌─┐│└┘'
export const DOUBLE = '╔═╗║╚╝'

export class Canvas {
  readonly cells: Cell[][]
  readonly width: number
  readonly height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: ' ' })))
  }
  /** Writes `text` from (row, col); what falls outside is dropped. Returns the column after it. */
  put(row: number, col: number, text: string, style: Style = {}): number {
    const line = this.cells[row]
    ;[...text].forEach((ch, index) => {
      if (line !== undefined && col + index >= 0 && col + index < this.width) line[col + index] = { ch, ...style }
    })

    return col + [...text].length
  }
  /** Writes runs one after another from (row, col). */
  runs(row: number, col: number, line: Line): number {
    let at = col
    for (const run of line) at = this.put(row, at, run.text, { ...(run.tone && { tone: run.tone }), ...(run.bold && { bold: run.bold }) })

    return at
  }
  box(row: number, col: number, width: number, height: number, tone: Tone, set = SINGLE) {
    const [tl = '┌', h = '─', tr = '┐', v = '│', bl = '└', br = '┘'] = [...set]
    this.put(row, col, `${tl}${h.repeat(width - 2)}${tr}`, { tone })
    for (let r = row + 1; r < row + height - 1; r += 1) {
      this.put(r, col, v, { tone })
      this.put(r, col + width - 1, v, { tone })
    }
    this.put(row + height - 1, col, `${bl}${h.repeat(width - 2)}${br}`, { tone })
  }
  /** Lines of runs, equal styles merged, trailing blanks dropped. */
  lines(): Line[] {
    return this.cells.map(cells => {
      const line: Run[] = []
      for (const cell of cells) {
        const last = line[line.length - 1]
        if (last && last.tone === cell.tone && last.bold === cell.bold) last.text += cell.ch
        else line.push({ text: cell.ch, ...(cell.tone && { tone: cell.tone }), ...(cell.bold && { bold: true }) })
      }
      const tail = line[line.length - 1]
      if (tail && tail.tone === undefined && tail.bold === undefined) tail.text = tail.text.trimEnd()

      return line.filter(run => run.text !== '')
    })
  }
}

const sgr = (hex: string) => `\x1b[38;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`

/** A line as ANSI: each styled run in its tone, reset after. */
export const paint = (line: Line) =>
  line.map(run => (run.tone || run.bold ? `${run.tone ? sgr(TONES[run.tone]) : ''}${run.bold ? '\x1b[1m' : ''}${run.text}\x1b[0m` : run.text)).join('')
