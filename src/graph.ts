import type { TroupeMission } from '../types'
import { STEPS } from './old-plan.ts'
import { fit, ORDER_GLYPH } from './view.ts'
import type { Line, Run, Tone } from './view.ts'

// The GRAPH, drawn as OpenRig draws its topology: a character canvas. Like
// OpenRig it shows the roles and the human checkpoints only: the orchestrator,
// the builder and the reviewer as "≡ role" boxes holding what each is on,
// and ◆ Plan OK?, ◆ MR OK?, ◆ Merged? where they sit in the flow. The
// engine's Box has no border titles and no free lines, so all of it, the
// double box "▦ MISSION", the ━━▶ arrows and the "fix ≤ 2" loop included,
// is cells of text in the theme's tones.

type Style = { tone?: Tone; bold?: true; strike?: true }
type Cell = Style & { ch: string }
type Box = { lines: Line[]; border: Tone }
type Item = { kind: 'role'; name: string; boxes: Box[] } | { kind: 'gates'; boxes: Box[] }

/** A role box's width side by side, and a checkpoint's: three roles, two checkpoint columns and four arrows fit 107 columns. */
const GW = 19
const CW = 14
const ARROW = ' ━━▶ '
const LOOP = ' fix ≤ 2 '
/** The width below which the flow stacks top to bottom. */
const ROW_MIN = 107

class Canvas {
  readonly cells: Cell[][]
  readonly width: number
  constructor(width: number, height: number) {
    this.width = width
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: ' ' })))
  }
  put(row: number, col: number, text: string, style: Style = {}) {
    ;[...text].forEach((ch, index) => {
      const line = this.cells[row]
      if (line !== undefined && col + index >= 0 && col + index < this.width) line[col + index] = { ch, ...style }
    })
  }
  runs(row: number, col: number, line: Line) {
    let at = col
    for (const run of line) {
      this.put(row, at, run.text, { tone: run.tone, bold: run.bold, strike: run.strike })
      at += run.text.length
    }
  }
  box(row: number, col: number, width: number, height: number, tone: Tone, set = '┌─┐│└┘') {
    const [tl, h, tr, v, bl, br] = [...set]
    this.put(row, col, `${tl}${(h ?? '─').repeat(width - 2)}${tr}`, { tone })
    for (let r = row + 1; r < row + height - 1; r += 1) {
      this.put(r, col, v ?? '│', { tone })
      this.put(r, col + width - 1, v ?? '│', { tone })
    }
    this.put(row + height - 1, col, `${bl}${(h ?? '─').repeat(width - 2)}${br}`, { tone })
  }
  /** Lines of runs, equal styles merged, trailing blanks dropped. */
  lines(): Line[] {
    return this.cells.map(cells => {
      const line: Run[] = []
      for (const cell of cells) {
        const last = line[line.length - 1]
        if (last && last.tone === cell.tone && last.bold === cell.bold && last.strike === cell.strike) last.text += cell.ch
        else line.push({ text: cell.ch, ...(cell.tone && { tone: cell.tone }), ...(cell.bold && { bold: true }), ...(cell.strike && { strike: true }) })
      }
      const tail = line[line.length - 1]
      if (tail && tail.tone === undefined) tail.text = tail.text.trimEnd()

      return line.filter(run => run.text !== '')
    })
  }
}

const at = (label: string) => STEPS.findIndex(step => step.label === label)

/** A box for one thing in the flow: done green ✓, now orange and bold, else waiting grey. */
const stepBox = (label: string, index: number, current: number, inner: number, mark: string): Box => {
  const isNow = index === current
  const isDone = index < current
  const glyph = isDone ? '✓' : isNow ? mark || '●' : mark
  const text = fit(glyph === '' ? label : `${glyph} ${label}`, inner)

  return {
    lines: [[isNow ? { text, tone: 'warn', bold: true } : { text, tone: isDone ? 'ok' : 'dim' }]],
    border: isNow ? 'warn' : 'chrome',
  }
}

/** The flow left to right: the roles with what each is on, and the checkpoints where they sit. */
function flow(m: TroupeMission, inner: number, gateInner: number): Item[] {
  const gate = (label: string) => stepBox(label, at(label), m.step, gateInner, '◆')
  const orders: Box[] = m.orders.map(order => {
    const tone: Tone = order.state === 'planned' ? 'dim' : 'ok'
    const model = inner >= 22 && order.model ? `  ${order.model}` : ''

    return {
      lines: [[{ text: ORDER_GLYPH[order.state], tone }, { text: fit(` ${order.id}${model}  ${order.state}`, inner - 1), tone }]],
      border: 'chrome',
    }
  })
  const reviewing = m.orders.find(order => order.state === 'done')
  const review: Box = reviewing
    ? { lines: [[{ text: fit(`● review ${reviewing.id}`, inner), tone: 'warn', bold: true }]], border: 'warn' }
    : { lines: [[{ text: fit('idle', inner), tone: 'dim' }]], border: 'chrome' }

  return [
    { kind: 'role', name: 'orchestrator', boxes: [stepBox('plan', at('Plan'), m.step, inner, ''), stepBox('MR', at('Open MR'), m.step, inner, '')] },
    { kind: 'gates', boxes: [gate('Plan OK?')] },
    { kind: 'role', name: 'builder', boxes: orders },
    { kind: 'role', name: 'reviewer', boxes: [review] },
    { kind: 'gates', boxes: [gate('MR OK?'), gate('Merged?')] },
  ]
}

const heightOf = (boxes: Box[]) => boxes.reduce((sum, box) => sum + box.lines.length + 2, 0)

function boxes(canvas: Canvas, list: Box[], row: number, col: number, width: number, gap = 0) {
  let y = row
  for (const box of list) {
    canvas.box(y, col, width, box.lines.length + 2, box.border)
    box.lines.forEach((line, index) => canvas.runs(y + 1 + index, col + 2, line))
    y += box.lines.length + 2 + gap
  }
}

/** A role's box: its steps one line each, no box of their own. */
function role(canvas: Canvas, name: string, list: Box[], row: number, col: number, width: number, height: number, isNow: boolean) {
  canvas.box(row, col, width, height, 'chrome')
  canvas.put(row, col + 2, ' ')
  canvas.put(row, col + 3, `≡ ${name}`, isNow ? { tone: 'warn', bold: true } : { tone: 'accentBright' })
  canvas.put(row, col + 5 + name.length, ' ')
  list.flatMap(box => box.lines).forEach((line, index) => canvas.runs(row + 1 + index, col + 2, line))
}

/** A role's height: its border and one line per step. */
const roleHeight = (list: Box[]) => list.reduce((sum, box) => sum + box.lines.length, 0) + 2

export function graph(m: TroupeMission, width: number): Line[] {
  const isBuilding = STEPS[m.step]?.label === 'Build'
  const isRow = width >= ROW_MIN
  const roleWidth = isRow ? GW : Math.min(40, width - 6)
  const items = flow(m, roleWidth - 4, CW - 4)
  const title = ` ▦ MISSION ${m.name} `
  const widthOf = (item: Item) => (item.kind === 'role' ? roleWidth : CW)

  if (isRow) {
    // The checkpoint columns stack their boxes with a ▼ between.
    const heightOfItem = (item: Item) => (item.kind === 'role' ? roleHeight(item.boxes) : heightOf(item.boxes) + item.boxes.length - 1)
    const gh = Math.max(...items.map(heightOfItem))
    const canvas = new Canvas(width, gh + 5)
    canvas.box(0, 0, width, gh + 5, 'chrome', '╔═╗║╚╝')
    canvas.put(0, 2, title, { tone: 'accentBright' })
    const total = items.reduce((sum, item) => sum + widthOf(item), 0) + ARROW.length * (items.length - 1)
    let x = 2 + Math.floor((width - 4 - total) / 2)
    const centers: number[] = []
    items.forEach((item, index) => {
      if (item.kind === 'role') {
        role(canvas, item.name, item.boxes, 1, x, roleWidth, gh, item.name === 'builder' && isBuilding)
        centers.push(x + Math.floor(roleWidth / 2))
      } else {
        boxes(canvas, item.boxes, 1, x, CW, 1)
        item.boxes.slice(1).forEach((_, below) => canvas.put(4 + below * 4, x + Math.floor(CW / 2), '▼', { tone: 'accent' }))
      }
      if (index < items.length - 1) canvas.put(2, x + widthOf(item), ARROW, { tone: 'accent' })
      x += widthOf(item) + ARROW.length
    })
    const [cb = 0, cr = 0] = [centers[1], centers[2]]
    canvas.put(1 + gh, cb, '▲', { tone: 'chrome' })
    canvas.put(1 + gh, cr, '│', { tone: 'chrome' })
    canvas.put(2 + gh, cb, `└${'─'.repeat(cr - cb - 1)}┘`, { tone: 'chrome' })
    canvas.put(2 + gh, cb + Math.floor((cr - cb - LOOP.length) / 2), LOOP, { tone: 'chrome' })

    return canvas.lines()
  }

  // Too narrow for the flow side by side: it stacks top to bottom, joined by
  // ▼, and the fix loop is one line under the reviewer.
  const rows = items.map(item => (item.kind === 'role' ? roleHeight(item.boxes) : heightOf(item.boxes) + item.boxes.length - 1))
  const total = 1 + rows.reduce((sum, h) => sum + h, 0) + (items.length - 1) + 1 + 2
  const canvas = new Canvas(width, total)
  canvas.box(0, 0, width, total, 'chrome', '╔═╗║╚╝')
  canvas.put(0, 2, title, { tone: 'accentBright' })
  const middle = 2 + Math.floor((width - 4) / 2)
  let y = 1
  items.forEach((item, index) => {
    const gx = middle - Math.floor(widthOf(item) / 2)
    if (item.kind === 'role') role(canvas, item.name, item.boxes, y, gx, roleWidth, rows[index] ?? 2, item.name === 'builder' && isBuilding)
    else {
      boxes(canvas, item.boxes, y, gx, CW, 1)
      item.boxes.slice(1).forEach((_, below) => canvas.put(y + 3 + below * 4, middle, '▼', { tone: 'accent' }))
    }
    y += rows[index] ?? 2
    if (item.kind === 'role' && item.name === 'reviewer') {
      const room = width - 1 - (gx + 2)
      const loop = [`↑${LOOP}→ back to builder`, `↑${LOOP}→ builder`, `↑${LOOP.trimEnd()}`].find(text => text.length <= room) ?? '↑'
      canvas.put(y, gx + 2, loop, { tone: 'chrome' })
      y += 1
    }
    if (index < items.length - 1) {
      canvas.put(y, middle, '▼', { tone: 'accent' })
      y += 1
    }
  })

  return canvas.lines()
}
