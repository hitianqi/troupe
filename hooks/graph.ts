import type { TroupeMission } from '../types'
import { GROUPS, isLight, STEPS } from './plan'
import type { Group } from './plan'
import { fit, ORDER_GLYPH } from './view'
import type { Line, Run, Tone } from './view'

// The GRAPH, drawn as OpenRig draws its topology: a character canvas. The
// engine's Box has no border titles and no free lines, so the double box
// "▦ MISSION", the "≡ group" boxes, the step boxes, the ━━▶ arrows and the
// "fix ≤ 2" loop are cells of text in the theme's tones.

type Style = { tone?: Tone; bold?: true; strike?: true }
type Cell = Style & { ch: string }
type Box = { lines: Line[]; border: Tone }

const GW_MAX = 22
/** Four groups of this width side by side, as the approved mock; narrower, they stack. */
const GW_ROW = 22
const ARROW = ' ━━▶ '
const LOOP = ' fix ≤ 2 '

class Canvas {
  readonly cells: Cell[][]
  constructor(readonly width: number, height: number) {
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

/** Each group's boxes: a step box per step, the build group a box per order. */
function contents(m: TroupeMission, inner: number): Record<Group, Box[]> {
  const light = isLight(m.orders)
  const steps = (group: Group): Box[] =>
    STEPS.flatMap((step, index) => {
      if (step.group !== group || step.label === 'Build') return []
      const isNow = index === m.step
      const isSkipped = light && step.isHeavy === true
      const isDone = index < m.step && !isSkipped
      const label = `${isNow ? '● ' : isDone ? '✓ ' : ''}${step.isGate ? '◆ ' : ''}${step.label}`
      const run: Run = isNow
        ? { text: fit(label, inner), tone: 'warn', bold: true }
        : { text: fit(label, inner), tone: isDone ? 'ok' : 'dim', ...(isSkipped && { strike: true as const }) }

      return [{ lines: [[run]], border: isNow ? 'warn' : 'chrome' }]
    })
  const orders: Box[] = m.orders.map(order => {
    const tone: Tone = order.state === 'planned' ? 'dim' : 'ok'

    return {
      lines: [
        [{ text: ORDER_GLYPH[order.state], tone }, { text: fit(` ${order.id}  ${order.model}`, inner - 1) }],
        [{ text: fit(`  ${order.state}`, inner), tone }],
      ],
      border: 'chrome',
    }
  })

  return { plan: steps('plan'), build: orders, review: steps('review'), land: steps('land') }
}

const heightOf = (boxes: Box[]) => boxes.reduce((sum, box) => sum + box.lines.length + 2, 0)

function group(canvas: Canvas, name: Group, boxes: Box[], row: number, col: number, width: number, height: number, isNow: boolean) {
  canvas.box(row, col, width, height, 'chrome')
  canvas.put(row, col + 2, ' ')
  canvas.put(row, col + 3, `≡ ${name}`, isNow ? { tone: 'warn', bold: true } : { tone: 'accentBright' })
  canvas.put(row, col + 5 + name.length, ' ')
  let y = row + 1
  for (const box of boxes) {
    canvas.box(y, col + 2, width - 4, box.lines.length + 2, box.border)
    box.lines.forEach((line, index) => canvas.runs(y + 1 + index, col + 4, line))
    y += box.lines.length + 2
  }
}

export function graph(m: TroupeMission, width: number): Line[] {
  const nowGroup = STEPS[m.step]?.group
  const gw = Math.min(GW_MAX, Math.floor((width - 4 - 3 * ARROW.length) / 4))
  const isRow = gw >= GW_ROW
  const groupWidth = isRow ? gw : Math.min(GW_MAX + 18, width - 6)
  const boxes = contents(m, groupWidth - 8)
  const title = ` ▦ MISSION ${m.name} `

  if (isRow) {
    const gh = Math.max(...GROUPS.map(name => heightOf(boxes[name]))) + 2
    const canvas = new Canvas(width, gh + 5)
    canvas.box(0, 0, width, gh + 5, 'chrome', '╔═╗║╚╝')
    canvas.put(0, 2, title, { tone: 'accentBright' })
    const x0 = 2 + Math.floor((width - 4 - (4 * gw + 3 * ARROW.length)) / 2)
    const centers = GROUPS.map((name, index) => {
      const gx = x0 + index * (gw + ARROW.length)
      group(canvas, name, boxes[name], 1, gx, gw, gh, name === 'build' && nowGroup === 'build')
      if (index < GROUPS.length - 1) canvas.put(3, gx + gw, ARROW, { tone: 'accent' })

      return gx + Math.floor(gw / 2)
    })
    const [cb = 0, cr = 0] = [centers[1], centers[2]]
    canvas.put(1 + gh, cb, '▲', { tone: 'chrome' })
    canvas.put(1 + gh, cr, '│', { tone: 'chrome' })
    canvas.put(2 + gh, cb, `└${'─'.repeat(cr - cb - 1)}┘`, { tone: 'chrome' })
    canvas.put(2 + gh, cb + Math.floor((cr - cb - LOOP.length) / 2), LOOP, { tone: 'chrome' })

    return canvas.lines()
  }

  // Too narrow for four side by side: the groups stack, joined by ▼, and the
  // fix loop is one line under review.
  const heights = GROUPS.map(name => heightOf(boxes[name]) + 2)
  const total = 1 + heights.reduce((sum, h) => sum + h, 0) + (GROUPS.length - 1) + 1 + 2
  const canvas = new Canvas(width, total)
  canvas.box(0, 0, width, total, 'chrome', '╔═╗║╚╝')
  canvas.put(0, 2, title, { tone: 'accentBright' })
  let y = 1
  GROUPS.forEach((name, index) => {
    const gx = 2 + Math.floor((width - 4 - groupWidth) / 2)
    group(canvas, name, boxes[name], y, gx, groupWidth, heights[index] ?? 2, name === 'build' && nowGroup === 'build')
    y += heights[index] ?? 2
    if (name === 'review') {
      canvas.put(y, gx + 2, `↑${LOOP}→ back to build`, { tone: 'chrome' })
      y += 1
    }
    if (index < GROUPS.length - 1) {
      canvas.put(y, gx + Math.floor(groupWidth / 2), '▼', { tone: 'accent' })
      y += 1
    }
  })

  return canvas.lines()
}
