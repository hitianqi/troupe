import type { TroupeMission, TroupeOrder, TroupeOrderState, TroupeRole } from '../types'
import { isLight, layersOf, STEPS } from './plan'

// The pane as lines of styled runs, in the OpenRig TUI's conventions: the
// header, the seat-table style TABLES and the detail-view DETAIL sections.
// graph.ts draws the GRAPH the same way; draw-pane.tsx only paints lines.

/** OpenRig's theme (tui/dist/theme.js): every colour the pane uses. */
export const TONES = {
  bright: '#e8eaf0',
  accent: '#6fa8ff',
  accentBright: '#9ac2ff',
  chrome: '#4e6991',
  warn: '#f4be5c',
  ok: '#98c379',
  error: '#e06c75',
  dim: '#6d7480',
} as const
export type Tone = keyof typeof TONES
export type Run = { text: string; tone?: Tone; bold?: true; strike?: true }
export type Line = Run[]

export const textOf = (line: Line) => line.map(run => run.text).join('')

/** A cell of `width`: padded, or cut with `…` (the mock's `pad`). */
export const fit = (text: string, width: number) =>
  text.length <= width ? text + ' '.repeat(width - text.length) : `${text.slice(0, Math.max(0, width - 1))}…`

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

const STATE_TONE: Record<TroupeOrderState, Tone> = { planned: 'dim', running: 'ok', done: 'ok', reviewed: 'ok' }
export const ORDER_GLYPH: Record<TroupeOrderState, string> = { planned: '○', running: '◐', done: '●', reviewed: '✓' }
const EFFORT = ['low', 'medium', 'high', 'xhigh', 'max']
const meterOf = (effort: string) => {
  const on = Math.max(0, EFFORT.indexOf(effort) + 1)

  return '▪'.repeat(on) + '▫'.repeat(5 - on)
}
const SEP: Run = { text: ' · ', tone: 'dim' }

/** What a role is doing, from what the pane already reads: a gate needs the orchestrator, a running order the builder, a done one the reviewer. */
export const roleState = (role: TroupeRole, m: TroupeMission) => {
  const step = STEPS[m.step]
  const busy = (state: TroupeOrderState) => m.orders.find(order => order.state === state)
  const running = busy('running')
  const done = busy('done')
  if (role.name === 'orchestrator' && step?.isGate) return { glyph: '◐', state: 'needs you', tone: 'warn' as const, now: `◆ ${step.label}` }
  if (role.name === 'builder' && running) return { glyph: '●', state: 'working', tone: 'ok' as const, now: running.id }
  if (role.name === 'reviewer' && done) return { glyph: '●', state: 'working', tone: 'ok' as const, now: done.id }

  return { glyph: '·', state: 'idle', tone: 'dim' as const, now: '—' }
}

export function headerLine(m: TroupeMission, width: number): Line {
  const runs: Line = [{ text: 'TROUPE', tone: 'bright', bold: true }, SEP, { text: m.name, tone: 'accent' }]
  if (isLight(m.orders)) runs.push(SEP, { text: 'light', tone: 'dim' })
  runs.push(
    SEP,
    m.problems.length === 0
      ? { text: 'plan checks clean', tone: 'ok' }
      : { text: `✗ ${m.problems.length} plan problem${m.problems.length > 1 ? 's' : ''}`, tone: 'error' },
  )
  if (m.goal !== '') runs.push(SEP, { text: m.goal, tone: 'dim' })

  return cut(runs, width)
}

/** Cuts a line to `width`, the last cell `…`, as the mock's `pad`. */
const cut = (line: Line, width: number): Line => {
  if (textOf(line).length <= width) return line
  const out: Line = []
  let left = width - 1
  for (const run of line) {
    if (left <= 0) break
    out.push({ ...run, text: run.text.slice(0, left) })
    left -= run.text.length
  }
  const last = out[out.length - 1]

  return last ? [...out.slice(0, -1), { ...last, text: `${last.text}…` }] : out
}

/** A table in the seat table's style: a caps header, a ━ rule, rows split by · lines. */
function table(head: string[], rows: Line[][], widths: number[], width: number): Line[] {
  const cells = (row: Line[]): Line => {
    const runs = row.flatMap((cell, index) => {
      const w = widths[index] ?? 0
      const text = textOf(cell)
      if (text.length <= w) return [...cell, { text: ' '.repeat(w - text.length) }]

      // A cut cell keeps one blank before the next column; the last one runs to the edge.
      return index < widths.length - 1 ? [...cut(cell, w - 1), { text: ' ' }] : cut(cell, w)
    })
    const last = runs[runs.length - 1]

    return last && last.tone === undefined ? [...runs.slice(0, -1), { text: last.text.trimEnd() }] : runs
  }

  return [
    [{ text: head.map((title, index) => fit(title, widths[index] ?? 0)).join('').trimEnd(), tone: 'accentBright', bold: true }],
    [{ text: '━'.repeat(width), tone: 'chrome' }],
    ...rows.flatMap((row, index) => (index === 0 ? [cells(row)] : [[{ text: '·'.repeat(width), tone: 'chrome' as const }], cells(row)])),
  ]
}

export function rolesTable(m: TroupeMission, width: number): Line[] {
  const rows = m.roles.map((role): Line[] => {
    const now = roleState(role, m)
    const skills: Line =
      role.skills.length === 0
        ? [{ text: '—', tone: 'dim' }]
        : role.skills.flatMap((skill, index): Line => [
            ...(index > 0 ? [{ text: '  ' }] : []),
            skill.isFound ? { text: `✓ ${skill.name}`, tone: 'ok' } : { text: `✗ ${skill.name}`, tone: 'error' },
          ])

    return [
      [{ text: now.glyph, tone: now.tone }, { text: ` ${role.name}` }],
      [{ text: role.model || '—' }],
      [{ text: `${role.effort} ` }, { text: meterOf(role.effort) }],
      skills,
      [{ text: now.state, tone: now.tone }],
      [{ text: now.now, tone: now.now === '—' ? 'dim' : now.tone }],
    ]
  })

  return table(['ROLE', 'MODEL', 'EFFORT', 'SKILLS', 'STATE', 'NOW'], rows, [17, 8, 13, width - 66, 12, 16], width)
}

export function ordersTable(m: TroupeMission, width: number): Line[] {
  const layerOf = new Map(layersOf(m.orders).layers.flatMap((layer, index) => layer.map(order => [order.id, index + 1] as const)))
  const rows = m.orders.map((order): Line[] => [
    [{ text: ORDER_GLYPH[order.state], tone: STATE_TONE[order.state] }, { text: ` ${order.id}` }],
    [{ text: String(layerOf.get(order.id) ?? '↺') }],
    [{ text: order.model || '—' }],
    [{ text: order.state, tone: STATE_TONE[order.state] }],
    [{ text: order.dependsOn.join(', ') || '—', tone: order.dependsOn.length === 0 ? 'dim' : undefined }],
    [{ text: order.goal, tone: 'dim' }],
  ])

  return table(['ID', 'LAYER', 'MODEL', 'STATE', 'DEPENDS', 'GOAL'], rows, [7, 7, 8, 10, 10, width - 42], width)
}

// ---- DETAIL: detail.js's sections, rules and label column ------------------

const LABEL_W = 13
const VALUE_AT = 2 + LABEL_W + 1

const sectionRule = (title: string, width: number): Line => [
  { text: '  ' },
  { text: '──', tone: 'chrome' },
  { text: ' ' },
  { text: title, tone: 'bright', bold: true },
  { text: ' ' },
  { text: '─'.repeat(Math.max(4, width - title.length - 6)), tone: 'chrome' },
]

/** `  label:       value`, the value wrapped under its own column; `paint` styles each value line. */
const field = (label: string, value: string, width: number, paint: (text: string) => Line = text => [{ text }]): Line[] =>
  wrap(value, width - VALUE_AT).map((text, index) => [
    index === 0 ? { text: `  ${`${label}:`.padEnd(LABEL_W)} `, tone: 'dim' } : { text: ' '.repeat(VALUE_AT) },
    ...paint(text),
  ])

/** A line under the value column, continuation lines indented two more. */
const under = (text: string, width: number, paint: (text: string) => Line): Line[] =>
  wrap(text, width - VALUE_AT - 2).map((line, index) => [{ text: ' '.repeat(VALUE_AT) + (index > 0 ? '  ' : '') }, ...paint(line)])

const paintOrder = (order: TroupeOrder) => (text: string): Line =>
  text.split(new RegExp(`\\b(${order.state})\\b`)).map(part => (part === order.state ? { text: part, tone: STATE_TONE[order.state] } : { text: part }))

export function detail(m: TroupeMission, width: number): Line[] {
  const layerOf = new Map(layersOf(m.orders).layers.flatMap((layer, index) => layer.map(order => [order.id, index + 1] as const)))
  const check = m.problems.length === 0 ? 'plan checks clean' : `${m.problems.length} plan problem${m.problems.length > 1 ? 's' : ''}`
  const size = `${m.orders.length} order${m.orders.length === 1 ? '' : 's'}`
  const lines: Line[] = [
    [],
    sectionRule('GOAL', width),
    ...field('goal', m.goal || '—', width),
    ...field('plan', `${m.dir}/plan.md · ${check} · ${isLight(m.orders) ? `light (${size})` : size}`, width, text =>
      text.split(/(plan checks clean|\d+ plan problems?)/).map(part =>
        part === 'plan checks clean' ? { text: part, tone: 'ok' } : /plan problem/.test(part) ? { text: part, tone: 'error' } : { text: part },
      ),
    ),
    ...m.problems.flatMap(problem => under(`✗ ${problem}`, width, text => [{ text, tone: 'error' }])),
    [],
    sectionRule(`ORDERS · ${m.orders.length}`, width),
  ]
  for (const order of m.orders) {
    const value = `${order.model || '—'} · ${order.state} · layer ${layerOf.get(order.id) ?? '↺'} · depends ${order.dependsOn.join(', ') || '—'} · ${order.goal}`
    lines.push(...field(order.id || '?', value, width, paintOrder(order)))
  }
  lines.push([], sectionRule(`ROLES · ${m.roles.length}`, width))
  for (const role of m.roles) {
    lines.push(...field(role.name, `${role.model || '—'} · ${role.effort || '—'} · ${meterOf(role.effort)}`, width))
    for (const duty of role.duty) lines.push(...under(`▪ ${duty}`, width, text => [{ text }]))
    if (role.skills.length === 0) lines.push(...under('no skills', width, text => [{ text, tone: 'dim' }]))
    for (const skill of role.skills) {
      lines.push(...under(skill.isFound ? `✓ ${skill.name}` : `✗ ${skill.name}`, width, text => [{ text, tone: skill.isFound ? 'ok' : 'error' }]))
    }
  }

  return lines
}
