import { cellsOf } from './canvas.ts'
import { contextOf, count, effortOf, LOOK } from './draw.ts'
import type { Drawn, Point, Rect } from './draw.ts'
import type { PanelModel, RoleView } from './model.ts'
import { RGB, rgbOf } from './screen.ts'
import type { Cell, Rgb, Screen } from './screen.ts'
import type { RoleState } from './state.ts'

// The live panel's motion: what it remembers between reads (each role's
// tokens/s and when its state changed) and the effects drawn over a frame as
// a function of time. Only the live panel moves; --once and --plain never do.

/** A role's output count at its last read, and its tokens/s between reads, oldest first. */
export type Rates = { at: number; output: number; rates: number[] }
const KEEP = 64

/** The next rates after reading `output` at `at` (ms); a count that drops (a new session) starts again from it. */
export const sample = (prev: Rates | undefined, output: number, at: number): Rates => {
  if (prev === undefined || output < prev.output) return { at, output, rates: prev?.rates ?? [] }
  const seconds = (at - prev.at) / 1000
  if (seconds < 1) return prev

  return { at, output, rates: [...prev.rates, (output - prev.output) / seconds].slice(-KEEP) }
}

/** tokens/s as 0..1: 40 tok/s is half. */
const levelOf = (rate: number) => rate / (rate + 40)

// The panel's paper and its plain text, for fading towards them.
const PAPER = rgbOf('#151821')
const TEXT = rgbOf('#c9cfdb')
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map(i => Math.round(a[i]! + (b[i]! - a[i]!) * clamp(t))) as unknown as Rgb
const breath = (t: number, period: number, seed: number) => 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period + seed * 2.1)
/** 1 at `age` 0, falling with time constant `tau`; 0 before it and once it has faded. */
const decay = (age: number, tau: number) => (age >= 0 && age < tau * 6 ? Math.exp(-age / tau) : 0)

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const ROUND: Record<string, string> = { '┌': '╭', '┐': '╮', '└': '╰', '┘': '╯' }
const LEFT_DOTS = [0x40, 0x04, 0x02, 0x01]
const RIGHT_DOTS = [0x80, 0x20, 0x10, 0x08]
/** Two levels 0..1 as one braille cell, a column of dots each, at least one dot. */
const brailleOf = (a: number, b: number) => {
  let bits = 0
  for (let i = 0; i < Math.max(1, Math.round(a * 4)); i++) bits |= LEFT_DOTS[i] ?? 0
  for (let i = 0; i < Math.max(1, Math.round(b * 4)); i++) bits |= RIGHT_DOTS[i] ?? 0

  return String.fromCharCode(0x2800 + bits)
}
/** Each cell of a rectangle's outline, clockwise from its top left. */
const outline = ({ row, col, width, height }: Rect): Point[] => [
  ...Array.from({ length: width }, (_, i) => [row, col + i] as Point),
  ...Array.from({ length: height - 2 }, (_, i) => [row + 1 + i, col + width - 1] as Point),
  ...Array.from({ length: width }, (_, i) => [row + height - 1, col + width - 1 - i] as Point),
  ...Array.from({ length: height - 2 }, (_, i) => [row + height - 2 - i, col] as Point),
]

export class Motion {
  private readonly rates = new Map<string, Rates>()
  private readonly states = new Map<string, { state: RoleState; at: number }>()
  private model: PanelModel | undefined
  private fresh = { text: '', at: -Infinity }
  /** Remembers each role's tokens/s and when its state last changed. */
  observe(model: PanelModel, now: number) {
    const first = this.model === undefined
    for (const role of model.roles) {
      if (role.tokens !== undefined) this.rates.set(role.name, sample(this.rates.get(role.name), role.tokens.output, now))
      if (this.states.get(role.name)?.state !== role.state) this.states.set(role.name, { state: role.state, at: first ? -Infinity : now })
    }
    const newest = model.activity[0]
    const text = newest === undefined ? '' : `${newest.at} ${newest.text}`
    if (text !== this.fresh.text) this.fresh = { text, at: first ? -Infinity : now }
    this.model = model
  }
  /** Seconds since the role came to its state; Infinity when it was in it when the panel opened. */
  private since(name: string, now: number) {
    return (now - (this.states.get(name)?.at ?? -Infinity)) / 1000
  }
  private rateOf(name: string) {
    return this.rates.get(name)?.rates.at(-1) ?? 0
  }
  /** The frame with its effects at `now`. */
  decorate(base: Screen, drawn: Drawn, selected: string, now: number): Screen {
    const scene = drawn.scene
    const model = this.model
    if (scene === undefined || model === undefined) return base
    const screen = base.clone()
    const t = now / 1000
    const roles = new Map(model.roles.map(role => [role.name, role]))
    const seedOf = (name: string) => model.roles.findIndex(role => role.name === name)
    const tint = (cell: Cell | undefined, fg: Rgb) => { if (cell !== undefined) cell.fg = fg }
    const spin = (name: string) => SPIN[Math.floor(t / 0.08 + seedOf(name) * 3) % SPIN.length] ?? '●'
    /** A highlight sweeping along `cells` of text, from their own colour to bright. */
    const shimmer = (cells: (Cell | undefined)[], seed: number) => {
      const speed = 18
      const period = (cells.length + 12) / speed + 1.4
      const x = ((t + seed * 0.7) % period) * speed - 6
      cells.forEach((cell, i) => {
        const a = clamp(1 - Math.abs(i - x) / 3.2)
        if (cell !== undefined && a > 0) cell.fg = mix(cell.fg ?? TEXT, RGB.bright, a * 0.9)
      })
    }
    /** A braille sparkline of a role's last tokens/s, two reads a cell. */
    const spark = (cells: (Cell | undefined)[], name: string) => {
      const levels = (this.rates.get(name)?.rates ?? []).slice(-cells.length * 2).map(levelOf)
      const padded = [...Array<number>(cells.length * 2 - levels.length).fill(0), ...levels]
      cells.forEach((cell, i) => {
        const a = padded[i * 2] ?? 0
        const b = padded[i * 2 + 1] ?? 0
        if (cell !== undefined) Object.assign(cell, { ch: brailleOf(a, b), fg: mix(RGB.chrome, RGB.ok, Math.max(a, b) * 1.15), bg: undefined, bold: undefined })
      })
    }

    for (const one of scene.list) if (roles.get(one.name)?.state === 'working') Object.assign(screen.at(one.row, one.col) ?? {}, { ch: spin(one.name) })
    if (scene.activity !== undefined && scene.activity.text === this.fresh.text) {
      const glow = decay((now - this.fresh.at) / 1000, 0.6)
      const { row, col, width } = scene.activity
      if (glow > 0) for (let c = col; c < col + width; c++) tint(screen.at(row, c), mix(TEXT, RGB.accentBright, glow))
    }
    for (const row of scene.waits) tint(screen.at(row, 0), mix(mix(RGB.warn, PAPER, 0.5), RGB.warn, breath(t, 1.4, 0)))
    if (scene.gate !== undefined) tint(screen.at(...scene.gate), mix(mix(RGB.warn, PAPER, 0.4), RGB.warn, breath(t, 1.4, 0)))

    const column = scene.column
    if (column === undefined) return screen
    /** A cell of the right column, if it is on screen. */
    const at = ([row, col]: Point): Cell | undefined => {
      const on = column.row + row
      return on >= column.top && on < column.bottom ? screen.at(on, column.col + col) : undefined
    }
    const span = (row: number, col: number, width: number) => Array.from({ length: width }, (_, i) => at([row, col + i]))

    // The orchestrator in the accent tone, its corners round.
    for (const point of outline(column.orchestrator)) {
      const cell = at(point)
      if (cell !== undefined) Object.assign(cell, { ch: ROUND[cell.ch] ?? cell.ch, fg: RGB.accent })
    }
    Object.assign(at([1, 2]) ?? {}, { ch: '◉', fg: RGB.accentBright })
    for (const cell of span(1, 4, 12)) if (cell !== undefined) Object.assign(cell, { fg: RGB.bright, bold: true })

    for (const box of column.boxes) {
      const role = roles.get(box.name)
      if (role !== undefined) this.box(role, box, box.name === selected, seedOf(box.name), t, at, span, { shimmer, spark, spin })
    }

    const detail = column.detail
    const role = detail === undefined ? undefined : roles.get(detail.name)
    if (detail !== undefined && role !== undefined) {
      if (role.state === 'working') Object.assign(at([detail.row, 2]) ?? {}, { ch: spin(role.name) })
      const cells = Math.min(32, column.width - 22)
      if (role.state !== 'planned' && this.rates.has(role.name) && cells >= 8) {
        const rate = this.rateOf(role.name)
        span(detail.spare, 1, 9).forEach((cell, i) => Object.assign(cell ?? {}, { ch: 'tokens'[i] ?? ' ', fg: RGB.dim }))
        spark(span(detail.spare, 10, cells), role.name)
        const label = rate > 0 ? `${count(Math.round(rate))} tok/s` : 'idle'
        span(detail.spare, 11 + cells, label.length).forEach((cell, i) => Object.assign(cell ?? {}, { ch: label[i], fg: rate > 0 ? RGB.ok : RGB.dim }))
      }
      const window = detail.window
      if (window !== undefined) {
        const frame = { row: window.row, col: 0, width: column.width, height: window.rows + 2 }
        for (const point of outline(frame)) {
          const cell = at(point)
          if (cell !== undefined) Object.assign(cell, { ch: ROUND[cell.ch] ?? cell.ch, ...(role.state === 'waits' && { fg: RGB.warn }) })
        }
        // The agent's own status line, `✻ Writing… (esc to interrupt)`, in coral with the sweep while it works.
        for (let row = window.row + 1; row <= window.row + window.rows; row++) {
          const cells = span(row, 2, column.width - 4)
          const text = cells.map(cell => cell?.ch ?? ' ').join('')
          if (!/^\s*[^\s\w]\s.*esc to interrupt/.test(text)) continue
          const end = Math.max(1, text.indexOf('(') - 1)
          for (const cell of cells) if (cell !== undefined) cell.fg = RGB.coral
          if (role.state === 'working') shimmer(cells.slice(0, end), seedOf(role.name) + 2)
        }
      }
    }

    return screen
  }
  /** A role's box: its border breathes and flashes, its corners round, its state is a pill, its third row a sparkline. */
  private box(role: RoleView, box: Rect, selected: boolean, seed: number, t: number, at: (point: Point) => Cell | undefined, span: (row: number, col: number, width: number) => (Cell | undefined)[], fx: { shimmer: (cells: (Cell | undefined)[], seed: number) => void; spark: (cells: (Cell | undefined)[], name: string) => void; spin: (name: string) => string }) {
    const look = LOOK[role.state]
    const tone = RGB[look.tone]
    const moving = role.state === 'working' || role.state === 'waits'
    let border = selected || role.state !== 'planned' ? tone : RGB.chrome
    if (moving) border = mix(mix(tone, PAPER, 0.6), tone, breath(t, role.state === 'waits' ? 1.4 : 2.8, seed))
    border = mix(border, RGB.bright, this.flash(role.name, t * 1000))
    for (const point of outline(box)) {
      const cell = at(point)
      if (cell !== undefined) Object.assign(cell, { ch: selected ? cell.ch : ROUND[cell.ch] ?? cell.ch, fg: border })
    }
    const { row, col, width } = box
    if (role.state === 'working') {
      Object.assign(at([row + 1, col + 2]) ?? {}, { ch: fx.spin(role.name) })
      fx.shimmer(span(row + 1, col + 4, Math.min(cellsOf(role.name), width - 8)), seed)
    }
    if (role.state !== 'planned') {
      const pill = ` ${look.text} `
      const wash = mix(PAPER, tone, role.state === 'waits' ? 0.2 + 0.1 * breath(t, 1.4, seed) : 0.16)
      span(row + 1, col + width - 1 - pill.length, pill.length).forEach((cell, i) => Object.assign(cell ?? {}, { ch: pill[i], fg: tone, bg: wash, bold: undefined }))
      // The effort squares, then the sparkline, then the context share flush right.
      const squares = effortOf(role.effort).filter(run => run.text.startsWith('◼') || run.text.startsWith('◻'))
      const share = contextOf(role) === '—' ? '' : contextOf(role)
      const used = squares.reduce((n, run) => n + run.text.length, 0)
      const cells = Math.min(8, width - 4 - used - 1 - (share === '' ? 0 : share.length + 1))
      if (squares.length > 0 && cells >= 3) {
        span(row + 3, col + 2, width - 4).forEach(cell => Object.assign(cell ?? {}, { ch: ' ', fg: undefined }))
        let c = col + 2
        for (const run of squares) for (const ch of run.text) Object.assign(at([row + 3, c++]) ?? {}, { ch, fg: RGB[run.tone ?? 'dim'] })
        fx.spark(span(row + 3, c + 1, cells), role.name)
        span(row + 3, col + width - 2 - share.length, share.length).forEach((cell, i) => Object.assign(cell ?? {}, { ch: share[i], fg: RGB.dim }))
      }
    }
  }
  /** How bright a role's border flashes at `now`: as it starts and as it finishes. */
  private flash(name: string, now: number) {
    const state = this.states.get(name)
    const age = this.since(name, now)

    return state?.state === 'done' ? decay(age, 0.35) : state?.state === 'working' ? decay(age, 0.4) : 0
  }
  /** Whether anything still moves at `now`; when not, the panel stops its frames until the next read. */
  moving(now: number): boolean {
    const model = this.model
    if (model === undefined) return false
    return model.gate !== undefined || (now - this.fresh.at) / 1000 < 4 || model.roles.some(role => role.state === 'working' || role.state === 'waits' || this.since(role.name, now) < 3)
  }
}
