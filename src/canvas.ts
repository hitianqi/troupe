// A character canvas: the panel draws every part as cells of text, then reads
// them back as lines of styled runs, painted as ANSI or kept plain for the
// goldens.

/** The panel's theme, `dim` lighter so waiting items read. */
export const TONES = {
  bright: '#e8eaf0',
  accent: '#6fa8ff',
  accentBright: '#9ac2ff',
  chrome: '#4e6991',
  warn: '#f4be5c',
  ok: '#98c379',
  error: '#e06c75',
  dim: '#9aa3ad',
  coral: '#f08a7e',
  cyan: '#65cbd4',
} as const
export type Tone = keyof typeof TONES
export type Style = { tone?: Tone; bold?: true }
export type Run = Style & { text: string }
export type Line = Run[]

export const textOf = (line: Line) => line.map(run => run.text).join('')

const WIDE: [number, number][] = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3040, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff], [0x20000, 0x3fffd],
]
const ZERO: [number, number][] = [[0x300, 0x36f], [0x200b, 0x200d], [0x20d0, 0x20ff], [0xfe00, 0xfe0f]]
const within = (code: number, ranges: [number, number][]) => ranges.some(([lo, hi]) => code >= lo && code <= hi)

const cellOf = (ch: string) => {
  const code = ch.codePointAt(0) ?? 0

  return within(code, ZERO) ? 0 : within(code, WIDE) ? 2 : 1
}

/** Display width of `text` in terminal cells. */
export const cellsOf = (text: string) => [...text].reduce((sum, ch) => sum + cellOf(ch), 0)

/** The longest head of `text` within `width` cells, and the rest. */
const cut = (text: string, width: number): [string, string] => {
  let used = 0
  let head = ''
  const chars = [...text]
  for (const [index, ch] of chars.entries()) {
    if (used + cellOf(ch) > width) return [head, chars.slice(index).join('')]
    used += cellOf(ch)
    head += ch
  }

  return [head, '']
}

/** `text` in `width` cells: padded, or cut with `…`. */
export const fit = (text: string, width: number) => {
  if (width <= 0) return ''
  const size = cellsOf(text)
  if (size <= width) return text + ' '.repeat(width - size)
  const [head] = cut(text, width - 1)

  return `${head}…${' '.repeat(width - 1 - cellsOf(head))}`
}

/** Greedy wrap on spaces; a word longer than the width is cut into pieces. */
export const wrap = (text: string, width: number): string[] => {
  width = Math.max(1, width)
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word
    while (cellsOf(rest) > width) {
      if (line !== '') lines.push(line)
      let [head, tail] = cut(rest, width)
      if (head === '') [head, tail] = [[...rest][0] ?? '', [...rest].slice(1).join('')]
      lines.push(head)
      rest = tail
      line = ''
    }
    if (line === '') line = rest
    else if (cellsOf(line) + 1 + cellsOf(rest) <= width) line += ` ${rest}`
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
  private set(line: Cell[], col: number, cell: Cell) {
    const old = line[col]
    if (old !== undefined && old.ch === '' && col > 0) line[col - 1] = { ch: ' ' }
    if (old !== undefined && cellsOf(old.ch) === 2 && col + 1 < this.width) line[col + 1] = { ch: ' ' }
    line[col] = cell
  }
  /** Writes `text` from (row, col); what falls outside is dropped, a wide char that does not fit becomes a space. Returns the column after it, in cells. */
  put(row: number, col: number, text: string, style: Style = {}): number {
    const line = this.cells[row]
    let at = col
    for (const ch of text) {
      const size = cellOf(ch)
      if (line !== undefined && size === 0) {
        const prev = line[at - 1]
        if (prev !== undefined && prev.ch !== '' && at - 1 >= 0 && at - 1 < this.width) prev.ch += ch
      } else if (line !== undefined && size === 1) {
        if (at >= 0 && at < this.width) this.set(line, at, { ch, ...style })
      } else if (line !== undefined) {
        if (at >= 0 && at + 1 < this.width) {
          this.set(line, at, { ch, ...style })
          this.set(line, at + 1, { ch: '', ...style })
        } else {
          for (const c of [at, at + 1]) if (c >= 0 && c < this.width) this.set(line, c, { ch: ' ', ...style })
        }
      }
      at += size
    }

    return at
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
