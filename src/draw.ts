import { Canvas, DOUBLE, fit, SINGLE, wrap } from './canvas.ts'
import type { Line, Tone } from './canvas.ts'
import type { PanelModel, RoleView, StageMark } from './model.ts'
import { layersOf } from './plan.ts'
import type { RoleState } from './state.ts'

// The panel's screen (design section 5b): title bar, tabs, the goal, the
// needs-you strip (an open gate as a box, each waiting role as a line), then
// ROLES / STAGES / ACTIVITY on the left and, on the MISSION tab, the FLOW and
// the selected role's detail with its live screen on the right; the key bar
// last. Every clickable part is also a target, so a click finds what it hit.

export const TABS = ['MISSION', 'ROLES', 'PLAN', 'LOG', 'DIFF'] as const
export type Ui = { tab: number; selected: string; input?: { label: string; text: string }; scroll?: number; message?: string; help?: boolean }
export type Target = { kind: 'role'; name: string } | { kind: 'tab'; tab: number } | { kind: 'key'; key: string; role?: string }
export type Hit = { row: number; col: number; width: number; height: number; target: Target }
export type Drawn = { lines: Line[]; hits: Hit[]; maxScroll: number }

const LEFT = 27
const BOX = 26
const GAP = 6

export const LOOK: Record<RoleState, { glyph: string; text: string; tone: Tone }> = {
  planned: { glyph: '○', text: 'planned', tone: 'dim' },
  working: { glyph: '●', text: 'working', tone: 'ok' },
  idle: { glyph: '◐', text: 'idle', tone: 'accent' },
  waits: { glyph: '◆', text: 'waits on you', tone: 'warn' },
  done: { glyph: '✓', text: 'done', tone: 'ok' },
  blocked: { glyph: '✕', text: 'blocked', tone: 'error' },
  failed: { glyph: '✕', text: 'failed', tone: 'error' },
  gone: { glyph: '⊘', text: 'gone', tone: 'error' },
  closed: { glyph: '·', text: 'closed', tone: 'dim' },
  unknown: { glyph: '?', text: 'unknown', tone: 'dim' },
}
const MARK: Record<StageMark, { glyph: string; tone: Tone }> = {
  done: { glyph: '✓', tone: 'ok' },
  now: { glyph: '●', tone: 'accent' },
  open: { glyph: '◆', tone: 'warn' },
  gate: { glyph: '◇', tone: 'dim' },
  todo: { glyph: '○', tone: 'dim' },
}

/** `left` and `right` in `width` cells, `right` flush with the edge; `left` cut first. */
const spread = (left: string, right: string, width: number) =>
  right === '' ? fit(left, width) : `${fit(left, Math.max(0, width - right.length - 1))} ${right}`.slice(0, width)

const rule = (title: string, width: number): Line => [{ text: `─ ${title} ${'─'.repeat(Math.max(0, width - title.length - 3))}`, tone: 'chrome' }]

/** When a role starts, as the plan gate says it. */
const startOf = (role: RoleView) =>
  role.dependsOn.length > 0 ? `after ${role.dependsOn.join(', ')}` : role.touches.length === 0 && role.reviews.length > 0 ? 'as each lands' : 'starts at once'

const contextOf = (role: RoleView) => role.context ?? '—'

// ---- the parts -------------------------------------------------------------

/** The plan gate's lines inside its box: goal, why, done when, the roles with their real flags, the plan file and its checks, the decisions, the buttons. */
const planGate = (m: PanelModel, inner: number): { lines: Line[]; buttons: number } => {
  const label = (name: string) => fit(name, 11)
  const lines: Line[] = []
  const field = (name: string, text: string, tone?: Tone) =>
    wrap(text, inner - 11).forEach((one, index) => lines.push([{ text: label(index === 0 ? name : ''), tone: 'dim' }, { text: one, ...(tone && { tone }) }]))
  field('Goal', m.goal || m.title)
  if (m.why !== '') field('Why', m.why)
  m.doneWhen.forEach((one, index) =>
    wrap(one, inner - 13).forEach((piece, at) => lines.push([{ text: label(index === 0 && at === 0 ? 'Done when' : ''), tone: 'dim' }, { text: at === 0 ? '· ' : '  ' }, { text: piece }])),
  )
  lines.push([])
  lines.push([{ text: `${fit('ROLE', 8)}${fit('AGENT', 8)}${fit('MODEL', 13)}${fit('EFFORT', 8)}FLAGS`, tone: 'dim' }])
  for (const role of m.roles) {
    lines.push([
      { text: fit(role.name, 8), tone: 'bright', bold: true },
      { text: `${fit(role.agent, 8)}${fit(role.model || 'default', 13)}${fit(role.effort || 'default', 8)}` },
      { text: fit(role.flags.join(' '), inner - 37), tone: 'accent' },
    ])
    const start = `   · ${startOf(role)}`
    lines.push([{ text: '        ↳ ', tone: 'dim' }, { text: fit(role.goal, inner - 10 - start.length) }, { text: start, tone: 'dim' }])
    lines.push([{ text: `          ${role.touches.length === 0 ? 'touches — changes nothing' : fit(`touches ${role.touches.join(' ')}`, inner - 10)}`, tone: 'dim' }])
  }
  lines.push([])
  const short = m.hash.replace(/^(sha256:.{4}).*$/, '$1…')
  lines.push([
    { text: `${m.planPath}  ·  ${short}  ·  `, tone: 'dim' },
    m.problems.length === 0 ? { text: 'checks clean', tone: 'ok' } : { text: `${m.problems.length} problem${m.problems.length === 1 ? '' : 's'}`, tone: 'error' },
  ])
  for (const problem of m.problems) wrap(problem, inner - 4).forEach((one, index) => lines.push([{ text: `${index === 0 ? '  - ' : '    '}${one}`, tone: 'error' }]))
  if (m.decisions.length > 0) lines.push([])
  for (const one of m.decisions) {
    const rec = one.recommended === '' ? '' : `  recommended: ${one.recommended}`
    lines.push([{ text: fit(`Decision ${one.n}`, 12), tone: 'dim' }, { text: fit(one.ask, inner - 12 - rec.length) }, { text: rec, tone: 'ok' }])
  }
  lines.push([])
  const buttons = lines.length
  const isClean = m.problems.length === 0
  const note = !isClean ? 'fix the plan first' : m.decisions.length > 0 ? 'approving takes the recommendations' : ''
  const left = ' a Approve    c Change…    v Read the plan'
  lines.push([
    { text: ' a Approve', tone: isClean ? 'ok' : 'dim', bold: true },
    { text: '    c Change…    v Read the plan' },
    { text: `${' '.repeat(Math.max(1, inner - left.length - note.length))}${note}`, tone: 'dim' },
  ])

  return { lines, buttons }
}

/** Another gate: the orchestrator's question and the buttons. */
const askGate = (ask: string, inner: number): { lines: Line[]; buttons: number } => {
  const lines: Line[] = wrap(ask, inner).map(one => [{ text: one, tone: 'bright' }])
  lines.push([])

  return { lines: [...lines, [{ text: ' a Approve', tone: 'ok', bold: true }, { text: '    c Change…' }]], buttons: lines.length }
}

/** The FLOW: the orchestrator, then the roles top to bottom by layer (depends_on, and reviews), the selected one double-lined. */
const flow = (m: PanelModel, ui: Ui, width: number): { canvas: Canvas; boxes: { name: string; row: number; col: number; width: number; height: number }[] } => {
  const known = new Set(m.roles.map(role => role.name))
  const nodes = m.roles.map(role => ({ role, name: role.name, dependsOn: [...role.dependsOn, ...role.reviews].filter(dep => known.has(dep)) }))
  const { layers, stuck } = layersOf(nodes)
  if (stuck.length > 0) layers.push(stuck)
  // A layer wider than the column shrinks its boxes, then breaks into rows.
  const rows: { nodes: typeof nodes; box: number }[] = layers.flatMap(layer => {
    const fits = (box: number) => layer.length * box + (layer.length - 1) * GAP <= width
    const box = fits(BOX) ? BOX : Math.floor((width - (layer.length - 1) * GAP) / layer.length)
    if (box >= 18) return [{ nodes: layer, box }]
    const per = Math.max(1, Math.floor((width + GAP) / (BOX + GAP)))

    return Array.from({ length: Math.ceil(layer.length / per) }, (_, index) => ({ nodes: layer.slice(index * per, index * per + per), box: Math.min(BOX, width) }))
  })
  const ORCH = 3
  const height = ORCH + rows.length * 7
  const canvas = new Canvas(width, height)
  const boxes: { name: string; row: number; col: number; width: number; height: number }[] = []
  canvas.box(0, 0, BOX, ORCH, 'chrome')
  canvas.put(1, 2, fit('● orchestrator', BOX - 4), { tone: 'bright' })
  // The row above, by centre: the orchestrator's box first.
  let above: { name: string; center: number }[] = [{ name: '', center: Math.floor(BOX / 2) }]
  let row = ORCH
  for (const one of rows) {
    const centers = one.nodes.map((_, index) => index * (one.box + GAP) + Math.floor(one.box / 2))
    // An edge runs from a box in the row above to a box here that depends on it (or reviews it); the first row hangs off the orchestrator.
    const hangs = (deps: string[], name: string) => (name === '' ? deps.length === 0 : deps.includes(name))
    const children = centers.filter((_, index) => above.some(parent => hangs(one.nodes[index]?.dependsOn ?? [], parent.name)))
    const parents = above.filter(parent => one.nodes.some(node => hangs(node.dependsOn, parent.name))).map(parent => parent.center)
    if (children.length > 0) connect(canvas, row, parents, children)
    one.nodes.forEach((node, index) => {
      const col = index * (one.box + GAP)
      const look = LOOK[node.role.state]
      const isSelected = node.name === ui.selected
      canvas.box(row + 3, col, one.box, 4, isSelected ? look.tone : node.role.state === 'planned' ? 'chrome' : look.tone, isSelected ? DOUBLE : SINGLE)
      canvas.put(row + 4, col + 2, spread(`${look.glyph} ${node.name}`, look.text, one.box - 4), { tone: look.tone, ...(isSelected && { bold: true }) })
      canvas.put(row + 5, col + 2, spread(`${node.role.agent} ${node.role.model}`.trim(), contextOf(node.role), one.box - 4), { tone: 'dim' })
      boxes.push({ name: node.name, row: row + 3, col, width: one.box, height: 4 })
    })
    above = one.nodes.map((node, index) => ({ name: node.name, center: centers[index] ?? 0 }))
    row += 7
  }

  return { canvas, boxes }
}

/** Three rows from the parents' centres down to the children's: a stem, a bus with its joints, arrows. */
const connect = (canvas: Canvas, row: number, parents: number[], children: number[]) => {
  const all = [...parents, ...children]
  const [from, to] = [Math.min(...all), Math.max(...all)]
  for (const col of parents) canvas.put(row, col, '│', { tone: 'chrome' })
  for (let col = from; col <= to; col += 1) {
    const up = parents.includes(col)
    const down = children.includes(col)
    const left = col > from
    const right = col < to
    canvas.put(row + 1, col, JOINTS[`${+up}${+down}${+left}${+right}`] ?? '─', { tone: 'chrome' })
  }
  for (const col of children) canvas.put(row + 2, col, '▼', { tone: 'chrome' })
}
/** Box-drawing joints by up, down, left, right. */
const JOINTS: Record<string, string> = {
  '1100': '│', '1000': '│', '0100': '│', '0011': '─', '0010': '─', '0001': '─',
  '1101': '├', '1110': '┤', '1111': '┼', '1011': '┴', '0111': '┬',
  '1001': '└', '1010': '┘', '0101': '┌', '0110': '┐',
}

/** The selected role's detail: goal, agent and flags, branch and commits, touches, diff, result; then its window's last lines, live. */
const detail = (role: RoleView, width: number, room: number): { lines: Line[]; keys: number } => {
  const look = LOOK[role.state]
  const lines: Line[] = [[{ text: '─ ', tone: 'chrome' }, { text: `${look.glyph} ${role.name} · ${look.text}`, tone: look.tone }, { text: ` ${'─'.repeat(Math.max(0, width - role.name.length - look.text.length - 8))}`, tone: 'chrome' }]]
  const field = (name: string, text: string, tone?: Tone) =>
    wrap(text, width - 10).slice(0, 2).forEach((one, index) => lines.push([{ text: fit(index === 0 ? ` ${name}` : '', 10), tone: 'dim' }, { text: one, ...(tone && { tone }) }]))
  field('goal', role.goal)
  field('agent', `${role.agent} ${role.model || 'default'} ${role.effort || 'default'}`.trim())
  lines.push([{ text: fit('', 10) }, { text: fit(role.flags.join(' '), width - 10), tone: 'accent' }])
  const commits = role.work?.commits.length ?? 0
  field('branch', `${role.branch}${commits > 0 ? `  ·  ${commits} commit${commits === 1 ? '' : 's'}` : ''}`)
  field('touches', role.touches.length === 0 ? '— changes nothing' : role.touches.join(' '))
  if (role.work !== undefined) {
    const n = role.work.changed.length
    const files = `${n} file${n === 1 ? '' : 's'} changed`
    if (role.work.outside.length === 0) field('diff', `${files} · inside touches ✓`, n === 0 ? 'dim' : 'ok')
    else field('diff', `${files} · outside touches: ${role.work.outside.join(' ')}`, 'error')
  }
  if (role.result !== undefined) field('result', `${role.result.status || '?'} · ${role.result.summary}`, role.result.status === 'done' ? 'ok' : 'warn')
  lines.push([])
  if (role.state === 'planned') lines.push([{ text: ` not opened yet · ${startOf(role)}`, tone: 'dim' }])
  else {
    // The live screen takes the rows left, less the key line.
    const inner = Math.max(1, Math.min(role.screen.length, room - lines.length - 3))
    const title = ` its window, live · ${role.agent} `
    lines.push([{ text: `┌─${title}${'─'.repeat(Math.max(0, width - title.length - 3))}┐`, tone: 'chrome' }])
    const shown = role.screen.length === 0 ? [''] : role.screen.slice(-inner)
    for (const one of shown) lines.push([{ text: '│ ', tone: 'chrome' }, { text: fit(one, width - 4) }, { text: ' │', tone: 'chrome' }])
    lines.push([{ text: `└${'─'.repeat(width - 2)}┘`, tone: 'chrome' }])
  }
  const keys = lines.length
  const waits = role.state === 'waits'
  lines.push([{ text: ' o Open window    ' }, { text: 's Send…', tone: waits ? 'dim' : undefined }, { text: '    d Diff' }, ...(waits ? [{ text: '    answer it first', tone: 'dim' as const }] : [])])

  return { lines, keys }
}

// ---- the screen ----------------------------------------------------------------

export const draw = (m: PanelModel, ui: Ui, width: number, height: number): Drawn => {
  const c = new Canvas(width, height)
  const hits: Hit[] = []
  const hit = (row: number, col: number, w: number, h: number, target: Target) => hits.push({ row, col, width: w, height: h, target })
  const waiting = m.roles.filter(role => role.state === 'waits')
  const needs = waiting.length + (m.gate === undefined ? 0 : 1)

  // Title bar, tabs, goal, rule.
  const right = `${needs > 0 ? `◆ ${needs} needs you  ·  ` : ''}${m.clock}`
  let at = c.runs(0, 0, [{ text: ' troupe', tone: 'bright', bold: true }, { text: '  ' }, { text: m.mission, tone: 'accent' }, { text: '  ·  ', tone: 'dim' }])
  c.put(0, at, m.stage?.label ?? '', { tone: m.gate === undefined ? 'bright' : 'warn' })
  c.put(0, width - right.length - 1, right, { tone: needs > 0 ? 'warn' : 'dim' })
  at = 2
  TABS.forEach((name, index) => {
    const text = `${index + 1} ${name}`
    hit(1, at, text.length, 1, { kind: 'tab', tab: index + 1 })
    at = c.put(1, at, text, ui.tab === index + 1 ? { tone: 'accent', bold: true } : { tone: 'dim' }) + 3
  })
  const goal = m.goal || m.title
  c.put(2, Math.max(1, width - goal.length - 1), fit(goal, width - 2), { tone: 'dim' })
  c.put(3, 0, '─'.repeat(width), { tone: 'chrome' })
  let row = 4

  // Needs you: an open gate as a box, each waiting role as a line.
  if (m.gate !== undefined) {
    const inner = width - 4
    const { lines, buttons } = m.gate.isPlan ? planGate(m, inner) : askGate(m.gate.ask, inner)
    const title = m.gate.isPlan ? ' ◆ APPROVE THE PLAN ' : ` ◆ ${m.gate.label.toUpperCase()} `
    c.box(row, 0, width, lines.length + 2, 'warn')
    c.put(row, 1, `─${title}`, { tone: 'warn', bold: true })
    lines.forEach((line, index) => c.runs(row + 1 + index, 2, line))
    hit(row + 1 + buttons, 2, 10, 1, { kind: 'key', key: 'a' })
    hit(row + 1 + buttons, 15, 10, 1, { kind: 'key', key: 'c' })
    if (m.gate.isPlan) hit(row + 1 + buttons, 28, 15, 1, { kind: 'key', key: 'v' })
    row += lines.length + 2
  }
  for (const role of waiting) {
    c.put(row, 0, spread(`▌ ◆ ${fit(role.name, 7)}waits on you${role.waitsOn ? ` · ${role.waitsOn}` : ''}`, 'o Open window', width - 1), { tone: 'warn' })
    hit(row, 0, width, 1, { kind: 'role', name: role.name })
    hit(row, width - 14, 13, 1, { kind: 'key', key: 'o', role: role.name })
    row += 1
  }
  row += 1

  // The key bar and the input line keep the bottom.
  const bottom = height - (ui.input === undefined ? 2 : 3)
  if (ui.input !== undefined) c.runs(height - 2, 0, [{ text: ` ${ui.input.label} › `, tone: 'accent' }, { text: ui.input.text }, { text: '▏', tone: 'accent' }])
  else if (ui.message) c.put(height - 2, 0, fit(` ${ui.message}`, width), { tone: 'accent' })
  if (ui.input !== undefined && ui.message) c.put(height - 3, 0, fit(` ${ui.message}`, width), { tone: 'accent' })
  const keys = m.gate !== undefined ? ' a  approve   c  change   v  plan   ↑↓  role   1-5  tabs   ?  help' : ' ↑↓  role   ⏎  detail   o  open   s  send   d  diff   1-5  tabs   ?  help'
  c.put(height - 1, 0, fit(keys, width), { tone: 'dim' })

  let maxScroll = 0
  if (ui.tab === 1) mission(c, m, ui, row, bottom, hit)
  else maxScroll = other(c, m, ui, row, bottom, hit)
  if (ui.help) {
    const lines = ['↑↓ / j k  select role     Enter  detail', '1-5 / Tab  tabs           o  open role pane', 's  send to role           d  diff    v  plan', 'PgUp/PgDn / wheel  scroll tabs 2-5', 'a  approve gate           c  type a change', 'Enter  submit input       Esc  cancel input', '? / Esc  close help       q / Ctrl-C  quit']
    const w = Math.min(60, width - 4)
    const h = Math.min(lines.length + 2, height - 2)
    const top = Math.max(0, Math.floor((height - h) / 2))
    const left = Math.max(0, Math.floor((width - w) / 2))
    for (let r = top; r < top + h; r++) c.put(r, left, ' '.repeat(w))
    c.box(top, left, w, h, 'accent')
    lines.slice(0, h - 2).forEach((line, index) => c.put(top + 1 + index, left + 2, fit(line, w - 4)))
    hits.length = 0
  }

  return { lines: c.lines(), hits, maxScroll }
}

/** The MISSION tab: the left column, then FLOW and the detail on the right. */
const mission = (c: Canvas, m: PanelModel, ui: Ui, top: number, bottom: number, hit: (row: number, col: number, w: number, h: number, target: Target) => void) => {
  const left: { line: Line; role?: string }[] = [{ line: rule('ROLES', LEFT - 1) }]
  const groups = [...new Set(m.roles.map(role => role.group))]
  for (const group of groups) {
    left.push({ line: [{ text: ` ${group}`, tone: 'dim' }] })
    for (const role of m.roles.filter(one => one.group === group)) {
      const look = LOOK[role.state]
      left.push({
        role: role.name,
        line: [
          { text: role.name === ui.selected ? '▸' : ' ', tone: 'accent' },
          { text: role.dependsOn.length > 0 ? ' └ ' : '   ', tone: 'chrome' },
          { text: `${look.glyph} `, tone: look.tone },
          { text: fit(role.name, 8), ...(role.name === ui.selected && { tone: 'bright' as const, bold: true as const }) },
          { text: fit(role.agent, 7), tone: 'dim' },
          { text: contextOf(role).padStart(4), tone: 'dim' },
        ],
      })
    }
  }
  left.push({ line: [] }, { line: rule('STAGES', LEFT - 1) })
  for (const stage of m.stages) {
    const mark = MARK[stage.mark]
    left.push({ line: [{ text: `  ${mark.glyph} `, tone: mark.tone }, { text: fit(stage.label, 16), ...(stage.mark === 'now' || stage.mark === 'open' ? { tone: mark.tone, bold: true as const } : stage.mark === 'done' ? {} : { tone: 'dim' as const }) }, { text: stage.note.padStart(5), tone: 'dim' }] })
  }
  left.push({ line: [] }, { line: rule('ACTIVITY', LEFT - 1) })
  for (const one of m.activity) left.push({ line: [{ text: ` ${one.at} `, tone: 'dim' }, { text: fit(one.text, LEFT - 8) }] })
  left.slice(0, bottom - top).forEach((one, index) => {
    c.runs(top + index, 0, one.line)
    if (one.role !== undefined) hit(top + index, 0, LEFT, 1, { kind: 'role', name: one.role })
  })
  for (let row = top; row < bottom; row += 1) c.put(row, LEFT, '│', { tone: 'chrome' })

  const col = LEFT + 2
  const width = c.width - col
  c.runs(top, col, rule('FLOW', width))
  const drawn = flow(m, ui, width)
  const flowLines = drawn.canvas.lines().slice(0, Math.max(0, bottom - top - 1))
  flowLines.forEach((line, index) => c.runs(top + 1 + index, col, line))
  for (const box of drawn.boxes) if (box.row + box.height <= flowLines.length) hit(top + 1 + box.row, col + box.col, box.width, box.height, { kind: 'role', name: box.name })
  const selected = m.roles.find(role => role.name === ui.selected)
  const start = top + 1 + flowLines.length + 1
  if (selected === undefined || start >= bottom) return
  const { lines, keys } = detail(selected, width, bottom - start)
  lines.slice(0, bottom - start).forEach((line, index) => c.runs(start + index, col, line))
  if (start + keys < bottom) {
    hit(start + keys, col + 1, 13, 1, { kind: 'key', key: 'o' })
    hit(start + keys, col + 18, 7, 1, { kind: 'key', key: 's' })
    hit(start + keys, col + 29, 6, 1, { kind: 'key', key: 'd' })
  }
}

/** ROLES, PLAN, LOG and DIFF use the whole width. */
const other = (c: Canvas, m: PanelModel, ui: Ui, top: number, bottom: number, hit: (row: number, col: number, w: number, h: number, target: Target) => void): number => {
  const lines: Line[] = []
  const width = c.width - 2
  if (ui.tab === 2) {
    lines.push([{ text: `${fit('ROLE', 9)}${fit('STATE', 14)}${fit('AGENT', 8)}${fit('MODEL', 13)}${fit('EFFORT', 8)}${fit('COMMITS', 9)}BRANCH`, tone: 'dim' }])
    for (const role of m.roles) {
      const look = LOOK[role.state]
      lines.push([
        { text: fit(role.name, 9), tone: 'bright' },
        { text: fit(`${look.glyph} ${look.text}`, 14), tone: look.tone },
        { text: `${fit(role.agent, 8)}${fit(role.model || 'default', 13)}${fit(role.effort || 'default', 8)}${fit(String(role.work?.commits.length ?? '—'), 9)}${role.branch}` },
      ])
      lines.push([{ text: `         ${role.flags.join(' ')}`, tone: 'accent' }])
    }
  } else if (ui.tab === 3) {
    lines.push([{ text: `${m.planPath}  ·  ${m.hash.slice(0, 15)}…`, tone: 'dim' }], [])
    for (const one of m.planText.split('\n')) lines.push([{ text: fit(one, width) }])
  } else if (ui.tab === 4) {
    for (const e of m.log) {
      const { at, by, ev, ...rest } = e
      lines.push([{ text: `${at.slice(11, 19)}  `, tone: 'dim' }, { text: fit(by, 6), tone: 'accent' }, { text: fit(ev, 12), tone: 'bright' }, { text: fit(JSON.stringify(rest), width - 28), tone: 'dim' }])
    }
    if (m.log.length === 0) lines.push([{ text: 'nothing logged yet', tone: 'dim' }])
  } else {
    const role = m.roles.find(one => one.name === ui.selected)
    lines.push([{ text: `${role?.name ?? '—'}  ·  ${role?.branch ?? ''}`, tone: 'bright' }], [])
    const work = role?.work
    if (role === undefined || work === undefined) lines.push([{ text: 'no work read yet', tone: 'dim' }])
    else {
      for (const commit of work.commits) lines.push([{ text: `${commit.sha}  `, tone: 'accent' }, { text: commit.subject }])
      if (work.commits.length > 0) lines.push([])
      for (const file of work.changed) {
        const isOutside = work.outside.includes(file)
        lines.push([{ text: isOutside ? '✗ ' : '✓ ', tone: isOutside ? 'error' : 'ok' }, { text: file, ...(isOutside && { tone: 'error' as const }) }])
      }
      if (work.changed.length === 0) lines.push([{ text: 'no files changed', tone: 'dim' }])
    }
  }
  const room = Math.max(0, bottom - top)
  const maxScroll = Math.max(0, lines.length - room)
  const from = Math.max(0, Math.min(ui.scroll ?? 0, maxScroll))
  lines.slice(from, from + room).forEach((line, index) => {
    c.runs(top + index, 1, line)
    if (ui.tab === 2 && from + index > 0 && (from + index) % 2 === 1) {
      const role = m.roles[Math.floor((from + index - 1) / 2)]
      if (role !== undefined) hit(top + index, 1, width, 1, { kind: 'role', name: role.name })
    }
  })

  return maxScroll
}
