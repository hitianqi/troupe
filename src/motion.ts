import { cellsOf, coloursOf, PAPER as PAPER_HEX } from './canvas.ts'
import { contextOf, count, effortOf, LOOK } from './draw.ts'
import type { Drawn, Point, Rect, Scene } from './draw.ts'
import { t as say } from './i18n.ts'
import type { PanelModel, RoleView } from './model.ts'
import { RGB, rgbOf } from './screen.ts'
import type { Cell, Rgb, Screen } from './screen.ts'
import type { RoleState } from './state.ts'

// The live panel's motion: what it remembers between reads (each role's
// tokens/s and when its state changed) and the effects drawn over a frame as
// a function of time. Only the live panel moves; --once and --plain never do.

/** `text` as the screen holds it, one entry per cell: a wide character, then an empty cell. */
const glyphs = (text: string): string[] => [...text].flatMap(ch => (cellsOf(ch) === 2 ? [ch, ''] : [ch]))

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

// The panel's paper and its plain text, for fading towards them, until the terminal tells its own.
const PAPER = rgbOf(PAPER_HEX)
const TEXT = rgbOf('#c9cfdb')
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map(i => Math.round(a[i]! + (b[i]! - a[i]!) * clamp(t))) as unknown as Rgb
const breath = (t: number, period: number, seed: number) => 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period + seed * 2.1)
/** 1 at `age` 0, falling with time constant `tau`; 0 before it and once it has faded. */
const decay = (age: number, tau: number) => (age >= 0 && age < tau * 6 ? Math.exp(-age / tau) : 0)

const hash = (a: number, b: number, c = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453

  return x - Math.floor(x)
}

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const HEAVY: Record<string, string> = { '─': '━', '│': '┃', '├': '┣', '└': '┗', '┬': '┳', '┐': '┓', '┘': '┛', '┼': '╋', '┤': '┫', '┴': '┻', '┌': '┏' }
/** Cells a second the finishing light runs along a lane. */
const SPEED = 30
/** Seconds the front takes down a dependency edge. */
const UNLOCK = 0.8
const RAMP = ' ·:-=+*#'
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
const GRADIENT = [RGB.accent, RGB.cyan, RGB.accentBright, RGB.ok, RGB.accent]
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
const inside = (row: number, col: number, rect: Rect) => row >= rect.row && row < rect.row + rect.height && col >= rect.col && col < rect.col + rect.width
/** Distance from a cell to a rectangle, rows counted about twice as tall as columns. */
const distance = (row: number, col: number, rect: Rect) =>
  Math.hypot(Math.max(rect.col - col, 0, col - (rect.col + rect.width - 1)), Math.max(rect.row - row, 0, row - (rect.row + rect.height - 1)) * 2.1)
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
  /** When each log event was first read; those there as the panel opened count as old. */
  private arrived: number[] = []
  /** Whether the last page drawn still moves: its LIVE dot, or an event washing in. */
  private pageMoves = false
  /** Each role's packet speed, eased towards its tokens/s, and how far its packets have moved. */
  private readonly level = new Map<string, number>()
  private readonly phase = new Map<string, number>()
  private tick = -Infinity
  private intro: { at: number; end: number } | undefined
  private readonly gradient: boolean
  /** Whether the last frame drew the selected box, whose gradient turns. */
  private turning = false
  /** Whether the last frame drew the drafting spinner. */
  private spinning = false
  private paper: Rgb = PAPER
  private text: Rgb = TEXT
  constructor(options: { gradient?: boolean } = {}) {
    this.gradient = !!options.gradient
  }
  /** What light moves towards: bright on a dark paper, the text colour on a light one. */
  private strong(): Rgb {
    const [r, g, b] = this.paper

    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128 ? this.text : RGB.bright
  }
  /** The paper the panel's washes and fades sit on. */
  get background(): Rgb {
    return this.paper
  }
  /** The terminal's own text or background colour. */
  colour(which: 'text' | 'background', rgb: Rgb) {
    if (which === 'text') this.text = rgb
    else this.paper = rgb
  }
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
    if (model.log.length < this.arrived.length || model.mission !== this.model?.mission) this.arrived = []
    while (this.arrived.length < model.log.length) this.arrived.push(first || this.arrived.length < (this.model?.log.length ?? 0) ? -Infinity : now)
    this.model = model
  }
  /** Seconds since the role came to its state; Infinity when it was in it when the panel opened. */
  private since(name: string, now: number) {
    return (now - (this.states.get(name)?.at ?? -Infinity)) / 1000
  }
  private rateOf(name: string) {
    return this.rates.get(name)?.rates.at(-1) ?? 0
  }
  /** The frame with its effects at `now`, and the drafting spinner turning. */
  decorate(base: Screen, drawn: Drawn, selected: string, now: number): Screen {
    const screen = this.effects(base, drawn, selected, now)
    this.spinning = drawn.spin !== undefined
    if (drawn.spin === undefined) return screen
    const out = screen === base ? base.clone() : screen
    Object.assign(out.at(...drawn.spin) ?? {}, { ch: SPIN[Math.floor(now / 80) % SPIN.length] })

    return out
  }
  private effects(base: Screen, drawn: Drawn, selected: string, now: number): Screen {
    const scene = drawn.scene
    const model = this.model
    this.turning = false
    if (scene === undefined || model === undefined) return base
    const screen = base.clone()
    const t = now / 1000
    const dt = Math.max(0, Math.min(0.1, (now - this.tick) / 1000))
    this.tick = now
    for (const role of model.roles) {
      const target = role.state === 'working' ? levelOf(this.rateOf(role.name)) : 0
      const level = this.level.get(role.name) ?? target
      const next = level + (target - level) * (1 - Math.exp(-dt / 0.6))
      this.level.set(role.name, next)
      this.phase.set(role.name, (this.phase.get(role.name) ?? 0) + dt * (4 + 22 * next))
    }
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
        if (cell !== undefined && a > 0) cell.fg = mix(cell.fg ?? this.text, this.strong(), a * 0.9)
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
      if (glow > 0) for (let c = col; c < col + width; c++) tint(screen.at(row, c), mix(this.text, RGB.accentBright, glow))
    }
    for (const row of scene.waits) tint(screen.at(row, 0), mix(mix(RGB.warn, this.paper, 0.5), RGB.warn, breath(t, 1.4, 0)))
    if (scene.gate !== undefined) tint(screen.at(...scene.gate), mix(mix(RGB.warn, this.paper, 0.4), RGB.warn, breath(t, 1.4, 0)))
    // The gate's border breathes slowly between a faint and a full amber.
    if (scene.gateBox !== undefined) for (const point of outline(scene.gateBox)) { const cell = screen.at(...point); if (cell !== undefined && /[─│╭╮╰╯]/.test(cell.ch)) cell.fg = mix(mix(this.paper, RGB.warn, 0.45), RGB.warn, breath(t, 2.2, 0)) }
    this.pageMoves = false
    if (scene.page !== undefined) this.page(screen, scene.page, now, { shimmer, spark, spin })

    const column = scene.column
    this.turning = this.gradient && column !== undefined && column.boxes.some(box => box.name === selected && column.row + box.row < column.bottom && column.row + box.row + box.height > column.top)
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

    // The edges: each cell takes the strongest of what is offered to it, and moving light leaves heads that light the floor.
    const offers = new Map<string, { point: Point; ch: string; fg: Rgb; rank: number }>()
    const heads: { point: Point; fg: Rgb }[] = []
    const offer = (point: Point, heavy: boolean, fg: Rgb, rank: number) => {
      const ch = at(point)?.ch ?? ''
      const old = offers.get(`${point}`)
      if (old === undefined || rank >= old.rank) offers.set(`${point}`, { point, ch: heavy ? HEAVY[ch] ?? ch : ch, fg, rank })
    }
    for (const trunk of column.trunks) {
      if (roles.get(trunk.name)?.state !== 'working') continue
      // A packet leaves every 6 cells, fewer and slower as the role's tokens/s falls.
      const level = this.level.get(trunk.name) ?? 0
      const x = this.phase.get(trunk.name) ?? 0
      const tail = 1.5 + 2 * level
      trunk.path.forEach((point, i) => {
        const n = Math.floor((x - i) / 6)
        const d = x - i - n * 6
        if (hash(n, seedOf(trunk.name), 5) > 0.2 + 0.8 * level) return
        if (d < tail) offer(point, d < 1, mix(RGB.chrome, RGB.accentBright, 1 - d / tail), 2)
        if (d < 1) heads.push({ point, fg: RGB.accentBright })
      })
    }
    const reviewer = model.roles.find(role => role.touches.length === 0 && role.reviews.length > 0)
    const arrivals: number[] = []
    for (const lane of column.lanes) {
      if (roles.get(lane.name)?.state !== 'done') continue
      // A landed branch: green light runs to the reviewer and leaves a heavy green line.
      const front = this.since(lane.name, now) * SPEED
      arrivals.push(this.since(lane.name, now) - lane.path.length / SPEED)
      lane.path.forEach((point, i) => {
        if (i > front) return offer(point, false, RGB.chrome, 0)
        const d = front - i
        offer(point, true, d < 3 ? mix(RGB.ok, this.strong(), 1 - d / 3) : RGB.ok, d < 3 ? 3 : 1)
        if (d < 1) heads.push({ point, fg: RGB.ok })
      })
      if (reviewer?.state !== 'working' || front < lane.path.length) continue
      // The reviewer reading it: green packets along the line, at the reviewer's tokens/s.
      const level = this.level.get(reviewer.name) ?? 0
      const k = Math.floor((this.phase.get(reviewer.name) ?? 0) * 0.6)
      lane.path.forEach((point, i) => {
        const d = (((k - i) % 8) + 8) % 8
        if (hash(Math.floor((k - i) / 8), 7, 5) > 0.2 + 0.8 * level) return
        if (d < 2) offer(point, true, mix(RGB.ok, this.strong(), 0.55 - d * 0.25), 2)
        if (d === 0) heads.push({ point, fg: RGB.ok })
      })
    }
    // A prerequisite done: a green front runs down its edge to the role waiting on it.
    const unlocked = new Map<string, number>()
    for (const link of column.links) {
      const edge = link.edge
      if (edge === undefined || roles.get(edge.from)?.state !== 'done') continue
      const age = this.since(edge.from, now)
      unlocked.set(link.to, age - UNLOCK)
      const front = (age / UNLOCK) * edge.path.length
      edge.path.forEach((point, i) => {
        const d = front - i
        if (d < 0 || d >= 3) return
        offer(point, true, mix(RGB.ok, this.strong(), 1 - d / 3), 3)
        if (d < 1) heads.push({ point, fg: RGB.ok })
      })
    }
    for (const { point, ch, fg } of offers.values()) Object.assign(at(point) ?? {}, { ch, fg })
    // What joins a role to the ones it waits for lights up as the last of them finishes.
    for (const link of column.links) {
      if (!link.from.every(name => roles.get(name)?.state === 'done')) continue
      const glow = decay(Math.min(...link.from.map(name => this.since(name, now))), 0.4) * 1.4
      if (glow > 0) for (const point of link.cells) { const cell = at(point); if (cell !== undefined) cell.fg = mix(cell.fg ?? RGB.dim, RGB.ok, glow) }
    }

    for (const box of column.boxes) {
      const role = roles.get(box.name)
      const arrived = (box.name === reviewer?.name ? arrivals.reduce((sum, age) => sum + decay(age, 0.4), 0) : 0) + decay(unlocked.get(box.name) ?? -1, 0.4)
      if (role !== undefined) this.box(role, box, box.name === selected, seedOf(box.name), t, arrived, at, span, { shimmer, spark, spin })
    }

    // The floor: faint dots under the FLOW, lit through :-=+ near moving light, and a ring rippling out from a box that just finished.
    const rects = [column.orchestrator, ...column.boxes]
    const waves = column.boxes.map(box => ({ box, age: this.since(box.name, now) })).filter(({ box, age }) => roles.get(box.name)?.state === 'done' && age < 1.6)
    for (let row = 0; row < column.flow; row++) {
      for (let col = 0; col < column.width; col++) {
        const cell = at([row, col])
        if (cell === undefined || cell.ch !== ' ' || cell.bg !== undefined || rects.some(rect => inside(row, col, rect))) continue
        let level = 0
        let fg = RGB.chrome
        for (const head of heads) {
          const v = 7 * 0.55 * Math.max(0, 1 - Math.hypot(col - head.point[1], (row - head.point[0]) * 2.1) / 4.2) ** 1.5
          if (v > level) [level, fg] = [v, head.fg]
        }
        for (const { box, age } of waves) {
          const v = 7 * (1 - age / 1.6) * Math.max(0, 1 - Math.abs(distance(row, col, box) - age * 24) / 2.4)
          if (v > level) [level, fg] = [v, RGB.ok]
        }
        const q = Math.max(0, Math.min(7, Math.floor(level + (BAYER[row % 4]?.[col % 4] ?? 0) / 16 - 0.5)))
        if (q > 0) Object.assign(cell, { ch: RAMP[q], fg: mix(this.paper, fg, 0.35 + q * 0.08) })
        else if (col % 4 === 1 && row % 2 === 1) Object.assign(cell, { ch: '·', fg: mix(this.paper, RGB.chrome, 0.32) })
      }
    }

    const detail = column.detail
    const role = detail === undefined ? undefined : roles.get(detail.name)
    if (detail !== undefined && role !== undefined) {
      if (role.state === 'working') Object.assign(at([detail.row, 2]) ?? {}, { ch: spin(role.name) })
      const cells = Math.min(32, column.width - 22)
      if (role.state !== 'planned' && this.rates.has(role.name) && cells >= 8) {
        const rate = this.rateOf(role.name)
        const name = glyphs(say('tokens'))
        span(detail.spare, 1, 9).forEach((cell, i) => Object.assign(cell ?? {}, { ch: name[i] ?? ' ', fg: RGB.dim }))
        spark(span(detail.spare, 10, cells), role.name)
        const label = glyphs(rate > 0 ? `${count(Math.round(rate))} tok/s` : say('idle'))
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

    if (this.intro === undefined && column.boxes.length > 0) this.intro = { at: now, end: Infinity }
    if (this.intro !== undefined && now < this.intro.end) this.dispatch(screen, column, (now - this.intro.at) / 1000, model)

    return screen
  }
  /**
   * The intro, once as the panel opens: the orchestrator draws itself, light runs down the trunk,
   * each role's box draws itself where the light lands, the reviewer's lanes last. What has not
   * arrived yet is hidden; the rest of the screen fades in.
   */
  private dispatch(screen: Screen, column: NonNullable<Scene['column']>, e: number, model: PanelModel) {
    const when = new Map<string, number>()
    const set = ([row, col]: Point, time: number) => {
      const key = `${column.row + row},${column.col + col}`
      if ((when.get(key) ?? Infinity) > time) when.set(key, time)
    }
    const draws = (rect: Rect, t0: number) => {
      const ring = outline(rect)
      ring.forEach((point, i) => set(point, t0 + (i / ring.length) * 0.35))
      for (let row = rect.row + 1; row < rect.row + rect.height - 1; row++) for (let col = rect.col + 1; col < rect.col + rect.width - 1; col++) set([row, col], t0 + 0.3 + (col - rect.col) * 0.012)
    }
    draws(column.orchestrator, 0.15)
    const times = new Map<string, number>()
    for (const trunk of column.trunks) {
      trunk.path.forEach((point, i) => set(point, 0.5 + i / 32))
      times.set(trunk.name, 0.5 + trunk.path.length / 32)
    }
    const lanes = new Set(column.lanes.length > 0 ? model.roles.filter(role => role.touches.length === 0 && role.reviews.length > 0).map(role => role.name) : [])
    for (const box of column.boxes.filter(one => !lanes.has(one.name))) {
      if (!times.has(box.name)) {
        const link = column.links.find(one => one.to === box.name)
        // After the boxes it waits for, or after all so far when nothing joins it.
        const time = Math.max(0.66, ...(link === undefined ? times.values() : link.from.map(name => times.get(name) ?? 0.66))) + 0.6
        times.set(box.name, time)
        link?.cells.forEach((point, i) => set(point, time - 0.15 + i * 0.02))
      }
      draws(box, times.get(box.name) ?? 0)
    }
    const start = Math.max(0.66, ...times.values()) + 0.25
    for (const lane of column.lanes) lane.path.forEach((point, i) => set(point, start + i / 32))
    for (const box of column.boxes.filter(one => lanes.has(one.name))) draws(box, start + Math.max(0, ...column.lanes.map(lane => lane.path.length)) / 32)
    const last = Math.max(...when.values()) + 0.2
    const intro = this.intro
    if (intro !== undefined && intro.end === Infinity) intro.end = intro.at + (last + 0.55) * 1000
    const arrive = (cell: Cell, at: number) => {
      if (e < at) Object.assign(cell, { ch: cell.ch === '' ? '' : ' ', fg: undefined, bg: undefined, bold: undefined })
      else {
        if (e - at < 0.06) cell.ch = HEAVY[cell.ch] ?? cell.ch
        cell.fg = mix(cell.fg ?? this.text, this.strong(), decay(e - at, 0.12))
      }
    }
    for (let row = 0; row < screen.height; row++) {
      for (let col = 0; col < screen.width; col++) {
        const cell = screen.at(row, col)
        if (cell === undefined) continue
        const flow = row - column.row
        const at = when.get(`${row},${col}`)
        if (at !== undefined) arrive(cell, at)
        else if (flow >= 0 && flow < column.flow && row >= column.top && row < column.bottom && col >= column.col) arrive(cell, last + hash(row, col) * 0.4)
        else if (e < 0.35) {
          cell.fg = mix(this.paper, cell.fg ?? this.text, e / 0.35)
          if (cell.bg !== undefined) cell.bg = mix(this.paper, cell.bg, e / 0.35)
        }
      }
    }
  }
  /** ROLES, PLAN, LOG and DIFF: spinners, sweeps, breathing borders and bands, tokens/s lines, the LIVE dot, events washing in. */
  private page(screen: Screen, page: NonNullable<Scene['page']>, now: number, fx: { shimmer: (cells: (Cell | undefined)[], seed: number) => void; spark: (cells: (Cell | undefined)[], name: string) => void; spin: (name: string) => string }) {
    const model = this.model
    if (model === undefined) return
    const t = now / 1000
    const seedOf = (name: string) => model.roles.findIndex(role => role.name === name)
    const span = (row: number, col: number, width: number) => Array.from({ length: Math.max(0, width) }, (_, i) => screen.at(row, col + i))
    for (const one of page.spins) Object.assign(screen.at(...one.at) ?? {}, { ch: fx.spin(one.name) })
    for (const one of page.shimmers) fx.shimmer(span(one.row, one.col, one.width), seedOf(one.name) + one.row)
    for (const one of page.breathes) {
      const tone = RGB[one.tone]
      const level = mix(mix(this.paper, tone, one.bg ? 0.75 : 0.5), tone, breath(t, one.period, one.seed))
      for (const point of one.cells) {
        const cell = screen.at(...point)
        if (cell === undefined) continue
        if (one.bg) cell.bg = level
        else if (cell.ch.trim() !== '' && /[─│╭╮╰╯═║╔╗╚╝]/.test(cell.ch)) cell.fg = level
      }
    }
    // A working role's tokens line: its tokens/s, then the rate and what came in.
    for (const one of page.sparks) {
      if (!this.rates.has(one.name)) continue
      const rate = this.rateOf(one.name)
      fx.spark(span(one.row, one.col, 12), one.name)
      const label = glyphs(` ${rate > 0 ? `${count(Math.round(rate))} tok/s` : say('idle')}`)
      span(one.row, one.col + 12, label.length).forEach((cell, i) => Object.assign(cell ?? {}, { ch: label[i], fg: rate > 0 ? RGB.ok : RGB.dim, bold: undefined }))
      const tail = glyphs(`  ${one.tail}`)
      span(one.row, one.col + 12 + label.length, tail.length).forEach((cell, i) => Object.assign(cell ?? {}, { ch: tail[i], fg: RGB.dim, bold: undefined }))
    }
    if (page.live !== undefined) {
      Object.assign(screen.at(...page.live) ?? {}, { fg: mix(mix(this.paper, RGB.ok, 0.4), RGB.ok, breath(t, 1.2, 0)) })
      this.pageMoves = true
    }
    // A new event's row washes in its lane's hue and fades.
    for (const one of page.events) {
      const age = (now - (this.arrived[one.index] ?? -Infinity)) / 1000
      if (age < 0 || age >= 0.8) continue
      this.pageMoves = true
      for (const cell of span(one.row, one.col, one.width)) if (cell !== undefined) cell.bg = mix(cell.bg ?? this.paper, RGB[one.tone], 0.22 * (1 - age / 0.8))
    }
  }
  /** A role's box: its border breathes and flashes, its corners round, its state is a pill, its third row a sparkline. */
  private box(role: RoleView, box: Rect, selected: boolean, seed: number, t: number, arrived: number, at: (point: Point) => Cell | undefined, span: (row: number, col: number, width: number) => (Cell | undefined)[], fx: { shimmer: (cells: (Cell | undefined)[], seed: number) => void; spark: (cells: (Cell | undefined)[], name: string) => void; spin: (name: string) => string }) {
    const look = LOOK[role.state]
    const tone = RGB[look.tone]
    const moving = role.state === 'working' || role.state === 'waits'
    let border = selected || role.state !== 'planned' ? tone : RGB.chrome
    if (moving) border = mix(mix(tone, this.paper, 0.6), tone, breath(t, role.state === 'waits' ? 1.4 : 2.8, seed))
    const flash = this.flash(role.name, t * 1000) + arrived
    border = mix(border, this.strong(), flash)
    const ring = outline(box)
    ring.forEach((point, p) => {
      const cell = at(point)
      if (cell === undefined) return
      // The selected box's double line can carry a turning gradient instead.
      const u = ((p / ring.length + t * 0.18) % 1) * (GRADIENT.length - 1)
      const i = Math.floor(u)
      const fg = selected && this.gradient ? mix(mix(GRADIENT[i] ?? RGB.accent, GRADIENT[i + 1] ?? RGB.accent, u - i), this.strong(), flash) : border
      Object.assign(cell, { ch: selected ? cell.ch : ROUND[cell.ch] ?? cell.ch, fg })
    })
    const { row, col, width } = box
    if (role.state === 'working') {
      Object.assign(at([row + 1, col + 2]) ?? {}, { ch: fx.spin(role.name) })
      fx.shimmer(span(row + 1, col + 4, Math.min(cellsOf(role.name), width - 8)), seed)
    }
    if (role.state !== 'planned') {
      const pill = glyphs(` ${say(look.text)} `)
      const wash = mix(this.paper, tone, role.state === 'waits' ? 0.2 + 0.1 * breath(t, 1.4, seed) : 0.16)
      span(row + 1, col + width - 1 - pill.length, pill.length).forEach((cell, i) => Object.assign(cell ?? {}, { ch: pill[i], fg: tone, bg: wash, bold: undefined }))
      // The effort squares, then the sparkline, then the context share flush right.
      const squares = effortOf(role.effort).filter(run => run.text.startsWith('◼') || run.text.startsWith('◻'))
      const share = contextOf(role) === '—' ? '' : contextOf(role)
      const used = squares.reduce((n, run) => n + run.text.length, 0)
      const cells = Math.min(8, width - 4 - used - 1 - (share === '' ? 0 : share.length + 1))
      if (squares.length > 0 && cells >= 3) {
        span(row + 3, col + 2, width - 4).forEach(cell => Object.assign(cell ?? {}, { ch: ' ', fg: undefined }))
        let c = col + 2
        for (const run of squares) for (const ch of run.text) Object.assign(at([row + 3, c++]) ?? {}, { ch, fg: coloursOf(run).fg ?? RGB.dim })
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
    if (this.spinning) return true
    const model = this.model
    if (model === undefined) return false
    if ((this.intro !== undefined && now < this.intro.end) || this.turning || this.pageMoves) return true

    return model.gate !== undefined || (now - this.fresh.at) / 1000 < 4 || model.roles.some(role => role.state === 'working' || role.state === 'waits' || this.since(role.name, now) < 3)
  }
}
