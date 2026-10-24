import type { TroupeMission, TroupeOrder, TroupeOrderState, TroupeRole } from '../types'
import { EFFORTS, isLight, layersOf, STEPS, stepsOf } from './plan.ts'

// The view as lines of styled runs, in the OpenRig TUI's conventions: the
// header, compact ROLES and ORDERS, and the detail-view DETAIL sections.
// graph.ts draws the GRAPH the same way; lines.ts puts them in order.

/** OpenRig's theme (tui/dist/theme.js): every colour the pane uses; `dim` is lighter than OpenRig's #6d7480, so waiting items read on a picture background. */
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
const meterOf = (effort: string) => {
  const on = Math.max(0, EFFORTS.indexOf(effort) + 1)

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

// ---- compact ROLES and ORDERS: one line each, under a DETAIL-style rule ----

/** Below this width a compact line leaves out the model. */
const MODEL_MIN = 46

const compact = (title: string, rows: Line[], width: number): Line[] => [sectionRule(title, width), ...rows.map(row => cut(row, width))]

/** One line per role: glyph, name, model, state, what it is on. */
export function compactRoles(m: TroupeMission, width: number): Line[] {
  const rows = m.roles.map((role): Line => {
    const now = roleState(role, m)

    return [
      { text: '  ' },
      { text: now.glyph, tone: now.tone },
      { text: ` ${fit(role.name, 13)} ` },
      ...(width >= MODEL_MIN ? [{ text: `${fit(role.model || '—', 7)} `, tone: 'dim' as const }] : []),
      { text: fit(now.state, 10), tone: now.tone },
      { text: ` ${now.now}`, tone: now.now === '—' ? 'dim' : now.tone },
    ]
  })

  return compact(`ROLES · ${m.roles.length}`, rows, width)
}

/** One line per order: glyph, id, model, state, what it waits on. */
export function compactOrders(m: TroupeMission, width: number): Line[] {
  const rows = m.orders.map((order): Line => [
    { text: '  ' },
    { text: ORDER_GLYPH[order.state], tone: STATE_TONE[order.state] },
    { text: ` ${fit(order.id || '?', 6)} ` },
    ...(width >= MODEL_MIN ? [{ text: `${fit(order.model || '—', 7)} `, tone: 'dim' as const }] : []),
    ...(order.dependsOn.length > 0
      ? [{ text: fit(order.state, 9), tone: STATE_TONE[order.state] }, { text: ` ← ${order.dependsOn.join(', ')}`, tone: 'dim' as const }]
      : [{ text: order.state, tone: STATE_TONE[order.state] }]),
  ])

  return compact(`ORDERS · ${m.orders.length}`, rows, width)
}

// ---- DETAIL: detail.js's sections, rules and label column ------------------

const LABEL_W = 13
const VALUE_AT = 2 + LABEL_W + 1
/** Below this width a label takes its own line and the value goes under it. */
const STACK_BELOW = 48
const STACKED_AT = 4

const sectionRule = (title: string, width: number): Line => [
  { text: '  ' },
  { text: '──', tone: 'chrome' },
  { text: ' ' },
  { text: title, tone: 'bright', bold: true },
  { text: ' ' },
  { text: '─'.repeat(Math.max(4, width - title.length - 6)), tone: 'chrome' },
]

/** `  label:       value`, the value wrapped under its own column (under the label when narrow); `paint` styles each value line. */
const field = (label: string, value: string, width: number, paint: (text: string) => Line = text => [{ text }]): Line[] => {
  if (width < STACK_BELOW) {
    return [
      [{ text: `  ${label}:`, tone: 'dim' }],
      ...wrap(value, width - STACKED_AT).map((text): Line => [{ text: ' '.repeat(STACKED_AT) }, ...paint(text)]),
    ]
  }
  const shown = label.length < LABEL_W ? label : `${label.slice(0, LABEL_W - 2)}…`

  return wrap(value, width - VALUE_AT).map((text, index) => [
    index === 0 ? { text: `  ${`${shown}:`.padEnd(LABEL_W)} `, tone: 'dim' } : { text: ' '.repeat(VALUE_AT) },
    ...paint(text),
  ])
}

/** A line under the value column, continuation lines indented two more. */
const under = (text: string, width: number, paint: (text: string) => Line): Line[] => {
  const at = width < STACK_BELOW ? STACKED_AT : VALUE_AT

  return wrap(text, width - at - 2).map((line, index) => [{ text: ' '.repeat(at) + (index > 0 ? '  ' : '') }, ...paint(line)])
}

const paintOrder = (order: TroupeOrder) => (text: string): Line =>
  text.split(new RegExp(`\\b(${order.state})\\b`)).map(part => (part === order.state ? { text: part, tone: STATE_TONE[order.state] } : { text: part }))

/** The mission's steps, ` → ` between: done green, the one it is at orange and bold, the rest grey; a gate marked ◆. */
const stepsField = (m: TroupeMission, width: number): Line[] => {
  const steps = stepsOf(m.orders)
  const tones = new Map(
    steps.map((step): [string, Run] => {
      const index = STEPS.indexOf(step)
      const text = step.isGate ? `◆ ${step.label}` : step.label

      return [text, index === m.step ? { text, tone: 'warn', bold: true } : { text, tone: index < m.step ? 'ok' : 'dim' }]
    }),
  )

  return field('steps', [...tones.keys()].join(' → '), width, text =>
    text.split(/( → )/).filter(Boolean).map(part => tones.get(part) ?? { text: part, tone: 'dim' }),
  )
}

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
    ...stepsField(m, width),
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
    for (const skill of role.skills) lines.push(...under(`· ${skill}`, width, text => [{ text }]))
  }

  return lines
}
