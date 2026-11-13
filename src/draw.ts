import { badgeOf } from './agents.ts'
import { Canvas, cellsOf, DOUBLE, fit, SINGLE, textOf, wrap } from './canvas.ts'
import type { Line, Run, Tone } from './canvas.ts'
import type { PanelModel, RoleView, StageMark } from './model.ts'
import { clashesOf, layersOf, sectionsOf } from './plan.ts'
import type { RoleState } from './state.ts'

// The panel's screen (design section 5b): title bar, tabs, the goal, the
// needs-you strip (an open gate as a box, each waiting role as a line), then
// ROLES / STAGES / ACTIVITY on the left and, on the MISSION tab, the FLOW and
// the selected role's detail with its live screen on the right; the key bar
// last. Every clickable part is also a target, so a click finds what it hit.

export const TABS = ['MISSION', 'ROLES', 'PLAN', 'LOG', 'DIFF'] as const
export type Ui = { tab: number; selected: string; input?: { label: string; text: string }; scroll?: number; message?: string; help?: boolean; full?: boolean }
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

/** Context use as a share of the window, from the agent's transcript; undefined when unknown. */
const shareOf = (role: RoleView): number | undefined => {
  const tokens = role.tokens
  if (tokens?.window === undefined || tokens.window <= 0) return undefined

  return Math.max(0, Math.min(1, tokens.used / tokens.window))
}

/** `62%`, or `—` while it cannot be read. */
const contextOf = (role: RoleView) => {
  const share = shareOf(role)

  return share === undefined ? '—' : `${Math.round(share * 100)}%`
}

/** A thin bar for context use, its tone rising as the window fills. */
const contextBar = (role: RoleView, cells: number): Line => {
  const share = shareOf(role)
  if (share === undefined) return [{ text: fit('—', cells + 5), tone: 'dim' }]
  const filled = Math.round(share * cells)
  const tone: Tone = share >= 0.85 ? 'error' : share >= 0.6 ? 'warn' : 'ok'

  return [{ text: '━'.repeat(filled), tone }, { text: '─'.repeat(cells - filled), tone: 'chrome' }, { text: ` ${contextOf(role).padStart(4)}`, tone: 'dim' }]
}

/** 1234 → 1.2k, 1234567 → 1.2M. */
const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n))

const tokensOf = (role: RoleView) => (role.tokens === undefined ? '—' : `${count(role.tokens.input)} in · ${count(role.tokens.output)} out`)

const badge = (role: RoleView): Run => {
  const one = role.badge ?? badgeOf(role.agent)

  return { text: one.glyph, tone: one.tone }
}

const LEVELS: Record<string, number> = { minimal: 1, low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }

/** Effort as five square cells and its word: `◼◼◼◻◻ high`; unset is `default`, an unknown word stays as written. */
export const effortOf = (effort: string): Line => {
  const level = Object.hasOwn(LEVELS, effort) ? LEVELS[effort] : undefined
  if (level === undefined) return [{ text: effort || 'default', tone: 'dim' }]

  return [{ text: '◼'.repeat(level), tone: 'accent' }, { text: '◻'.repeat(5 - level), tone: 'chrome' }, { text: ` ${effort}`, tone: 'dim' }]
}
const EFFORT = 12

/** A line's runs padded or cut to `width` cells. */
const fitRuns = (runs: Line, width: number): Line => {
  const out: Line = []
  let left = width
  for (const run of runs) {
    if (left <= 0) break
    const text = cellsOf(run.text) <= left ? run.text : fit(run.text, left)
    out.push({ ...run, text })
    left -= cellsOf(text)
  }
  if (left > 0) out.push({ text: ' '.repeat(left) })

  return out
}

/** Inline styles survive wrapping; markdown markers never reach the canvas. */
const inline = (text: string): Line => {
  const runs: Line = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let at = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    if (index > at) runs.push({ text: text.slice(at, index) })
    const value = match[0]
    runs.push(value.startsWith('`') ? { text: value.slice(1, -1), tone: 'accent' } : { text: value.slice(2, -2), bold: true })
    at = index + value.length
  }
  if (at < text.length) runs.push({ text: text.slice(at) })

  return runs
}

const reflow = (runs: Line, width: number, first = '', rest = ''): Line[] => {
  let cells = runs.flatMap(run => [...run.text].map(text => ({ ...run, text })))
  const lines: Line[] = []
  do {
    const prefix = lines.length === 0 ? first : rest
    const room = Math.max(1, width - prefix.length)
    // The most characters that fit in `room` terminal cells (a CJK character takes two).
    let end = 0
    for (let used = 0; end < cells.length && used + cellsOf(cells[end]?.text ?? '') <= room; end += 1) used += cellsOf(cells[end]?.text ?? '')
    end = Math.max(1, end)
    if (end < cells.length && cells[end]?.text !== ' ') {
      const space = cells.slice(0, end).map(cell => cell.text).lastIndexOf(' ')
      if (space > 0) end = space
    }
    lines.push([{ text: prefix }, ...cells.slice(0, end)])
    cells = cells.slice(end)
    while (cells[0]?.text === ' ') cells.shift()
  } while (cells.length > 0)

  return lines
}

/** The whole plan, rendered: `f` on the PLAN tab. */
const planFull = (m: PanelModel, width: number): Line[] => {
  const lines: Line[] = []
  const source = m.planText.split(/\r?\n/)
  const headingPattern = /^(#{1,6})\s+(.*)$/
  let fence: string | undefined
  for (let i = 0; i < source.length; i++) {
    const text = source[i] ?? ''
    const delimiter = /^\s*```(.*)$/.exec(text)
    if (delimiter !== null) {
      fence = fence === undefined ? (delimiter[1] ?? '').trim() : undefined
      continue
    }
    if (fence !== undefined) {
      if (fence === 'yaml' || fence === 'yml') {
        // Comments only start outside quoted values.
        let quote = ''
        let comment = -1
        for (let c = 0; c < text.length; c++) {
          const char = text[c] ?? ''
          if (quote !== '') { if (char === quote && text[c - 1] !== '\\') quote = '' }
          else if (char === '"' || char === "'") quote = char
          else if (char === '#' && (c === 0 || /\s/.test(text[c - 1] ?? ''))) { comment = c; break }
        }
        const body = comment < 0 ? text : text.slice(0, comment)
        const key = /^(\s*(?:- )?[^:#]+:)(.*)$/.exec(body)
        lines.push([...(key === null ? [{ text: body }] : [{ text: key[1] ?? '', tone: 'dim' as const }, { text: key[2] ?? '' }]), ...(comment < 0 ? [] : [{ text: text.slice(comment), tone: 'chrome' as const }])])
      } else lines.push([{ text, tone: 'accent' }])
      continue
    }
    if (text.trim() === '') { lines.push([]); continue }
    const heading = headingPattern.exec(text)
    if (heading !== null) {
      const title = heading[2] ?? ''
      const role = m.roles.find(one => title.toLowerCase() === `role: ${one.name}`.toLowerCase())
      if (heading[1] === '#') lines.push(...reflow(inline(title).map(run => ({ ...run, tone: 'bright', bold: true })), width))
      else {
        const content: Line = [{ text: '─ ', tone: 'chrome' }, ...(role === undefined ? [] : [badge(role), { text: ' ' }]), ...inline(title).map(run => ({ ...run, tone: 'bright' as const, bold: true as const }))]
        const wrapped = reflow(content, width)
        const last = wrapped.at(-1)
        if (last !== undefined) last.push({ text: ` ${'─'.repeat(Math.max(0, width - last.reduce((n, run) => n + [...run.text].length, 0) - 1))}`, tone: 'chrome' })
        lines.push(...wrapped)
      }
      continue
    }
    const list = /^(\s*)([-*+] |\d+[.)] )(.*)$/.exec(text)
    const prefix = list === null ? '' : `${list[1] ?? ''}${list[2] ?? ''}`
    let paragraph = list === null ? text.trim() : list[3] ?? ''
    while (i + 1 < source.length) {
      const next = source[i + 1] ?? ''
      if (next.trim() === '' || headingPattern.test(next) || /^\s*(?:```|[-*+] |\d+[.)] )/.test(next)) break
      paragraph += ` ${next.trim()}`
      i++
    }
    lines.push(...reflow(inline(paragraph), width, prefix, ' '.repeat(prefix.length)))
  }

  return lines
}

// ---- the parts -------------------------------------------------------------

const checksOf = (m: PanelModel): Run =>
  m.problems.length === 0 ? { text: 'checks clean', tone: 'ok' } : { text: `${m.problems.length} problem${m.problems.length === 1 ? '' : 's'}`, tone: 'error' }

/**
 * The plan's shape, above its roles: builders in columns by when they start,
 * an arrow from a role to the one beside it that waits on it, every row joined
 * to the reviewer; then the windows by agent and whether touches overlap.
 * Once a role is dispatched it shows its state and its line turns green when
 * done. Empty when the columns do not fit.
 */
const shapeOf = (m: PanelModel, width: number): Line[] => {
  const reviewers = m.roles.filter(role => role.touches.length === 0 && role.reviews.length > 0)
  const builders = m.roles.filter(role => !reviewers.includes(role))
  const known = new Set(builders.map(role => role.name))
  const { layers, stuck } = layersOf(builders.map(role => ({ name: role.name, dependsOn: role.dependsOn.filter(dep => known.has(dep)) })))
  if (builders.length === 0 || stuck.length > 0) return []
  const byName = new Map(m.roles.map(role => [role.name, role]))
  const node = (role: RoleView): Line => role.state === 'planned'
    ? [badge(role), { text: ` ${role.name}`, tone: 'bright', bold: true }]
    : [{ text: LOOK[role.state].glyph, tone: LOOK[role.state].tone }, { text: ` ${role.name}`, tone: 'bright', bold: true }]
  const line = (role: RoleView | undefined): Tone => (role?.state === 'done' ? 'ok' : 'chrome')
  const columns = layers.map((layer, index) => ({
    head: index === 0 ? 'at once' : `after ${[...new Set(layer.flatMap(one => one.dependsOn))].join(', ')}`,
    roles: layer.map(one => byName.get(one.name)).filter(role => role !== undefined),
  }))
  const widths = columns.map(column => Math.max(cellsOf(column.head), ...column.roles.map(role => cellsOf(textOf(node(role))))))
  const last = reviewers.length === 0 ? [] : [reviewers.map(role => textOf(node(role))).join(' · '), 'as each lands']
  const ARROW = 5
  if (2 + widths.reduce((sum, one) => sum + one + ARROW, 0) + Math.max(0, ...last.map(cellsOf)) > width) return []

  const rows = Math.max(...columns.map(column => column.roles.length))
  const out: Line[] = [[{ text: '  ' }, ...columns.flatMap((column, index) => [{ text: fit(column.head, widths[index] ?? 0), tone: 'dim' as const }, { text: ' '.repeat(ARROW) }]), ...(last[1] ? [{ text: last[1], tone: 'dim' as const }] : [])]]
  for (let row = 0; row < rows; row++) {
    const runs: Line = [{ text: '  ' }]
    // Where this row's last role ends: its line runs on to the reviewer from there.
    const end = columns.reduce((found, column, index) => (column.roles[row] === undefined ? found : index), -1)
    columns.forEach((column, index) => {
      const role = column.roles[row]
      const size = widths[index] ?? 0
      const next = columns[index + 1]?.roles[row]
      if (role === undefined) {
        runs.push({ text: index > end && reviewers.length > 0 ? '─'.repeat(size + ARROW) : ' '.repeat(size + ARROW), tone: line(columns[end]?.roles[row]) })
        return
      }
      runs.push(...node(role), { text: ' '.repeat(size - cellsOf(textOf(node(role)))) })
      if (next !== undefined && next.dependsOn.includes(role.name)) runs.push({ text: ' ──▶ ', tone: line(role) })
      else if (next === undefined && reviewers.length > 0) runs.push({ text: ' ' + '─'.repeat(ARROW - 1), tone: line(role) })
      else runs.push({ text: ' '.repeat(ARROW) })
    })
    if (reviewers.length > 0) {
      const tone = line(columns[end]?.roles[row])
      // The rows join into one arrow to the reviewer.
      const join = rows === 1 ? '─▶ ' : row === 0 ? '┬▶ ' : row === rows - 1 ? '┘' : '┤'
      runs.push({ text: join, tone })
      if (row === 0) reviewers.forEach((role, index) => runs.push(...(index > 0 ? [{ text: ' · ', tone: 'dim' as const }] : []), ...node(role)))
    }
    out.push(runs)
  }
  const agents = new Map<string, RoleView[]>()
  for (const role of m.roles) agents.set(role.agent, [...(agents.get(role.agent) ?? []), role])
  const clash = clashesOf(m.roles)[0]
  out.push([
    { text: `  ${m.roles.length} window${m.roles.length === 1 ? '' : 's'} · `, tone: 'dim' },
    ...[...agents].flatMap(([agent, roles]) => [{ text: `${agent} ×${roles.length}`, tone: badge(roles[0] as RoleView).tone }, { text: ' · ', tone: 'dim' as const }]),
    clash === undefined ? { text: "touches don't overlap ✓", tone: 'ok' } : { text: `✗ ${clash.a} and ${clash.b} overlap`, tone: 'error' },
  ])

  return out
}

/** The plan's parts, the same in the plan gate and on the PLAN tab: goal, why, done when, each role, decisions, out of scope; wrapped, never cut. */
const planSummary = (m: PanelModel, width: number): Line[] => {
  const lines: Line[] = []
  const field = (name: string, text: string) => lines.push(...reflow(inline(text), width, fit(name, 7), ' '.repeat(7)).map(([label, ...rest]) => [{ ...label, tone: 'dim' as const }, ...rest] as Line))
  const head = (title: string) => lines.push([], rule(title, width))
  field('Goal', m.goal || m.title)
  if (m.why !== '') field('Why', m.why)
  if (m.doneWhen.length > 0) head('DONE WHEN')
  // Numbered items wrap under their text; the plan is never cut short here.
  const item = (n: string, runs: Line) => lines.push(...reflow(runs, width, '     ', '     ').map((line, index) => index === 0 ? [{ text: ` ${n.padStart(2)}  `, tone: 'dim' as const }, ...line.slice(1)] : line))
  m.doneWhen.forEach((one, index) => item(String(index + 1), inline(one)))
  head('ROLES')
  const shape = shapeOf(m, width)
  if (shape.length > 0) lines.push(...shape, [])
  // A role's own problems and its overlaps sit under it; the rest follow the roles.
  const clashes = clashesOf(m.roles)
  const placed = new Set<string>()
  m.roles.forEach((role, index) => {
    if (index > 0) lines.push([])
    const agent = `${role.agent} ${role.model || 'default'}`
    const look = LOOK[role.state]
    lines.push([
      { text: ' ' }, badge(role), { text: ' ' },
      { text: fit(role.name, 11), tone: 'bright', bold: true },
      { text: fit(agent, 20), tone: 'dim' },
      ...fitRuns(effortOf(role.effort), EFFORT + 2),
      role.state === 'planned' ? { text: fit(startOf(role), Math.max(0, width - 48)), tone: 'dim' } : { text: fit(`${look.glyph} ${look.text}`, Math.max(0, width - 48)), tone: look.tone },
    ])
    lines.push(...reflow(inline(role.goal), width, '   ', '   '))
    const side = (one: { a: string; b: string }) => (one.a === role.name ? 0 : one.b === role.name ? 1 : -1)
    const clashing = new Set(clashes.flatMap(one => (side(one) < 0 ? [] : one.shared.map(pair => pair.split(' ~ ')[side(one)] ?? ''))))
    const touches: Line = role.touches.length === 0 ? [{ text: 'changes nothing', tone: 'chrome' }] : role.touches.flatMap((one, n) => [{ text: n === 0 ? '' : '  ' }, clashing.has(one) ? { text: `✗ ${one}`, tone: 'error' as const } : { text: one, tone: 'chrome' as const }])
    lines.push(...reflow(touches, width, '   ', '   '))
    const own = [
      ...m.problems.filter(problem => problem.startsWith(`role ${role.name}: `)).map(problem => ({ problem, text: problem.slice(`role ${role.name}: `.length) })),
      ...clashes.filter(one => one.b === role.name).map(one => ({ problem: m.problems.find(problem => problem.startsWith(`${one.a} and ${one.b} overlap (`)) ?? '', text: `overlaps ${one.a} on ${one.shared.map(pair => pair.replace(/^(.+) ~ \1$/, '$1')).join('; ')} · neither depends on the other` })),
    ]
    for (const { problem, text } of own) {
      placed.add(problem)
      lines.push(...reflow([{ text: `✗ ${text}`, tone: 'error' }], width, '   ', '     '))
    }
  })
  for (const problem of m.problems.filter(one => !placed.has(one))) wrap(problem, width - 4).forEach((one, index) => lines.push([{ text: `${index === 0 ? '  - ' : '    '}${one}`, tone: 'error' }]))
  if (m.decisions.length > 0) head('DECISIONS')
  for (const one of m.decisions) {
    const rec = one.recommended === '' ? '' : `→ ${one.recommended}`
    item(one.n, [...inline(one.ask), { text: ` ${rec}`, tone: 'ok' }])
  }
  const out = sectionsOf(m.planText).find(section => /^out of scope$/i.test(section.heading))?.body.replace(/\s+/g, ' ').trim() ?? ''
  if (out !== '') {
    head('OUT OF SCOPE')
    lines.push(...reflow(inline(out), width, ' ', ' '))
  }

  return lines
}

/** The plan gate: the summary, where the plan lives and its checks, the buttons. */
const planGate = (m: PanelModel, inner: number): { lines: Line[]; buttons: number } => {
  const lines = planSummary(m, inner)
  lines.push([], ...reflow([{ text: `${m.planPath}  ·  ${m.hash.replace(/^(sha256:.{4}).*$/, '$1…')}  ·  `, tone: 'dim' }, checksOf(m)], inner), [])
  const buttons = lines.length
  const isClean = m.problems.length === 0
  const note = !isClean ? 'fix the plan first' : m.decisions.length > 0 ? 'approving takes the recommendations' : ''
  const left = ' a Approve    c Change…    v Read the plan'
  lines.push([
    { text: ' a Approve', tone: isClean ? 'ok' : 'dim', bold: true },
    { text: '    c Change…    v Read the plan' },
    { text: note && inner >= left.length + note.length + 1 ? `${' '.repeat(inner - left.length - note.length)}${note}` : '', tone: 'dim' },
  ])

  if (note && inner < left.length + note.length + 1) lines.push(...reflow([{ text: note, tone: 'dim' }], inner))

  return { lines, buttons }
}

/** Another gate: the orchestrator's question and the buttons. */
const askGate = (ask: string, inner: number): { lines: Line[]; buttons: number } => {
  const lines: Line[] = wrap(ask, inner).map(one => [{ text: one, tone: 'bright' }])
  lines.push([])

  return { lines: [...lines, [{ text: ' a Approve', tone: 'ok', bold: true }, { text: '    c Change…' }]], buttons: lines.length }
}

/**
 * The FLOW. Builders stack top to bottom in dependency order: a trunk from the
 * orchestrator feeds each one that starts at once, and an arrow joins a role to
 * the one right above it when it depends on it. A reviewer reviews each branch
 * as it lands, so it sits in a lane to the right, joined to every role it
 * reviews by an edge that lights once that role is done; without room for the
 * lane it sits below with a line saying so.
 */
const flow = (m: PanelModel, ui: Ui, width: number): { canvas: Canvas; boxes: { name: string; row: number; col: number; width: number; height: number }[] } => {
  const reviewers = m.roles.filter(role => role.touches.length === 0 && role.reviews.length > 0)
  const builders = m.roles.filter(role => !reviewers.includes(role))
  const known = new Set(builders.map(role => role.name))
  const { layers, stuck } = layersOf(builders.map(role => ({ name: role.name, dependsOn: role.dependsOn.filter(dep => known.has(dep)) })))
  const order = [...layers.flat(), ...stuck].map(node => builders.find(role => role.name === node.name)).filter(role => role !== undefined)
  const INDENT = 5
  const HEIGHT = 5
  const box = Math.max(16, Math.min(BOX, width - INDENT))
  const lane = Math.min(BOX, 24)
  const side = reviewers.length === 1 && order.length > 0 && width >= INDENT + box + 6 + lane
  const below = side ? [] : reviewers
  const canvas = new Canvas(width, 3 + order.length * (HEIGHT + 2) + below.length * (HEIGHT + 4))
  const boxes: { name: string; row: number; col: number; width: number; height: number }[] = []
  const roleBox = (role: RoleView, row: number, col: number, w: number, note = '') => {
    const look = LOOK[role.state]
    const selected = role.name === ui.selected
    const notes = note === '' ? [] : wrap(note, w - 4)
    const h = HEIGHT + notes.length
    canvas.box(row, col, w, h, selected ? look.tone : role.state === 'planned' ? 'chrome' : look.tone, selected ? DOUBLE : SINGLE)
    canvas.put(row + 1, col + 2, spread(`${look.glyph} ${role.name}`, look.text, w - 4), { tone: look.tone, ...(selected && { bold: true }) })
    canvas.runs(row + 2, col + 2, [badge(role), { text: ` ${fit(`${role.agent} ${role.model || 'default'}`, w - 6)}`, tone: 'dim' }])
    const ctx = contextOf(role) === '—' ? '' : `ctx ${contextOf(role)}`
    canvas.runs(row + 3, col + 2, [...fitRuns(effortOf(role.effort), w - 4 - ctx.length), { text: ctx, tone: 'dim' }])
    notes.forEach((one, index) => canvas.put(row + 4 + index, col + 2, one, { tone: 'dim' }))
    boxes.push({ name: role.name, row, col, width: w, height: h })

    return row + h
  }

  canvas.box(0, 0, Math.min(BOX, width), 3, 'chrome')
  canvas.put(1, 2, fit('● orchestrator', Math.min(BOX, width) - 4), { tone: 'bright' })
  const mids = new Map<string, number>()
  const roots: number[] = []
  order.forEach((role, index) => {
    const row = 3 + index * (HEIGHT + 2) + 1
    roleBox(role, row, INDENT, box)
    mids.set(role.name, row + 2)
    if (role.dependsOn.filter(dep => known.has(dep)).length === 0) roots.push(row + 2)
    else if (index > 0 && role.dependsOn.includes(order[index - 1]?.name ?? '')) {
      const center = INDENT + Math.floor(box / 2)
      canvas.put(row - 2, center, '│', { tone: 'chrome' })
      canvas.put(row - 1, center, '▼', { tone: 'chrome' })
    } else canvas.put(row - 1, INDENT + 2, fit(`after ${role.dependsOn.join(', ')}`, box - 2), { tone: 'dim' })
  })
  // The trunk: from under the orchestrator down to the last role that starts at once.
  if (roots.length > 0) {
    wire(canvas, 2, 2, '┬')
    for (let row = 3; row < Math.max(...roots); row += 1) wire(canvas, row, 2, '│')
    for (const row of roots) wire(canvas, row, 2, `${row === Math.max(...roots) ? '└' : '├'}─`), canvas.put(row, INDENT - 1, '▶', { tone: 'chrome' })
  }

  const reviewer = reviewers[0]
  if (side && reviewer !== undefined) {
    const sources = reviewer.reviews.map(name => ({ name, mid: mids.get(name), done: builders.find(one => one.name === name)?.state === 'done' })).filter(one => one.mid !== undefined)
    const spine = INDENT + box + 2
    const rows = sources.map(one => one.mid ?? 0)
    const mid = rows.length === 0 ? 6 : Math.round((Math.min(...rows) + Math.max(...rows)) / 2)
    // Dim edges first, lit ones over them, so a landed branch reads all the way to the reviewer.
    for (const one of [...sources.filter(one => !one.done), ...sources.filter(one => one.done)]) {
      const tone: Tone = one.done ? 'ok' : 'chrome'
      const at = one.mid ?? mid
      wire(canvas, at, INDENT + box, '─'.repeat(spine - INDENT - box), tone)
      for (let row = Math.min(at, mid) + 1; row < Math.max(at, mid); row += 1) wire(canvas, row, spine, '│', tone)
      // Partial joints merge: a source above and one below make ├ on the reviewer's row.
      wire(canvas, at, spine, at < mid ? '┐' : at > mid ? '┘' : '─', tone)
      if (at !== mid) wire(canvas, mid, spine, at < mid ? '└' : '┌', tone)
      wire(canvas, mid, spine + 1, '──', tone)
      canvas.put(mid, spine + 3, '▶', { tone })
    }
    roleBox(reviewer, Math.max(0, mid - 2), spine + 4, Math.min(lane, width - spine - 4))
  }
  let row = 3 + order.length * (HEIGHT + 2)
  for (const role of below) row = roleBox(role, row, INDENT, box, `reviews ${role.reviews.join(', ')} as each lands`) + 1

  return { canvas, boxes }
}

/** Three rows from the parents' centres down to the children's: a stem, a bus with its joints, arrows. */
const connect = (canvas: Canvas, row: number, parents: number[], children: number[]) => {
  const all = [...parents, ...children]
  const [from, to] = [Math.min(...all), Math.max(...all)]
  for (const col of parents) wire(canvas, row, col, '│')
  for (let col = from; col <= to; col += 1) {
    const up = parents.includes(col)
    const down = children.includes(col)
    const left = col > from
    const right = col < to
    wire(canvas, row + 1, col, JOINTS[`${+up}${+down}${+left}${+right}`] ?? '─')
  }
  for (const col of children) canvas.put(row + 2, col, '▼', { tone: 'chrome' })
}
/** Box-drawing joints by up, down, left, right. */
const JOINTS: Record<string, string> = {
  '1100': '│', '1000': '│', '0100': '│', '0011': '─', '0010': '─', '0001': '─',
  '1101': '├', '1110': '┤', '1111': '┼', '1011': '┴', '0111': '┬',
  '1001': '└', '1010': '┘', '0101': '┌', '0110': '┐',
}

/** Merge shared stems and buses into a visible junction. */
const wire = (canvas: Canvas, row: number, col: number, text: string, tone: Tone = 'chrome') => {
  const directions: Record<string, string> = { '│': '1100', '─': '0011', '└': '1001', '┘': '1010', '┌': '0101', '┐': '0110', '├': '1101', '┤': '1110', '┼': '1111', '┴': '1011', '┬': '0111' }
  ;[...text].forEach((glyph, index) => {
    const old = directions[canvas.cells[row]?.[col + index]?.ch ?? '']
    const next = directions[glyph]
    const merged = old === undefined || next === undefined ? glyph : JOINTS[[...old].map((bit, i) => bit === '1' || next[i] === '1' ? '1' : '0').join('')] ?? glyph
    canvas.put(row, col + index, merged, { tone })
  })
}

/** The selected role's detail: goal, agent and flags, branch and commits, touches, diff, result; then its window's last lines, live. */
const detail = (role: RoleView, width: number, room: number): { lines: Line[]; keys: number } => {
  const look = LOOK[role.state]
  const lines: Line[] = [[{ text: '─ ', tone: 'chrome' }, { text: `${look.glyph} ${role.name} · ${look.text}`, tone: look.tone }, { text: ` ${'─'.repeat(Math.max(0, width - role.name.length - look.text.length - 8))}`, tone: 'chrome' }]]
  const field = (name: string, text: string, tone?: Tone) =>
    wrap(text, width - 10).slice(0, 2).forEach((one, index) => lines.push([{ text: fit(index === 0 ? ` ${name}` : '', 10), tone: 'dim' }, { text: one, ...(tone && { tone }) }]))
  field('goal', role.goal)
  lines.push([{ text: fit(' agent', 10), tone: 'dim' }, badge(role), { text: ` ${role.agent} ${role.model || 'default'}   ` }, ...effortOf(role.effort)])
  if (role.tokens !== undefined) lines.push([{ text: fit(' context', 10), tone: 'dim' }, ...contextBar(role, 16), { text: `   ${tokensOf(role)}`, tone: 'dim' }])
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
    const title = ' its window, live '
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
  const hit = (row: number, col: number, w: number, h: number, target: Target) => {
    if (row >= 0 && row < height && col >= 0 && col < width) hits.push({ row, col, width: Math.min(w, width - col), height: Math.min(h, height - row), target })
  }
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
  const bottom = height - (ui.input === undefined ? 2 : 3)
  let maxScroll = 0

  // Needs you: an open gate as a box, each waiting role as a line.
  if (m.gate !== undefined && ui.tab === 1) {
    const inner = width - 4
    const { lines, buttons } = m.gate.isPlan ? planGate(m, inner) : askGate(m.gate.ask, inner)
    const title = m.gate.isPlan ? ' ◆ APPROVE THE PLAN ' : ` ◆ ${m.gate.label.toUpperCase()} `
    const size = Math.max(2, Math.min(lines.length + 2, bottom - row))
    const room = size - 2
    maxScroll = Math.max(0, lines.length - room)
    const from = Math.max(0, Math.min(ui.scroll ?? 0, maxScroll))
    c.box(row, 0, width, size, 'warn')
    const cue = maxScroll > 0 ? ` ${from + 1}-${Math.min(from + room, lines.length)}/${lines.length} · PgUp/PgDn/wheel ` : ''
    c.put(row, 1, cue ? fit(`─${title}`, width - 2 - cue.length) : `─${title}`, { tone: 'warn', bold: true })
    if (cue) c.put(row, width - cue.length - 1, cue, { tone: 'warn' })
    lines.slice(from, from + room).forEach((line, index) => c.runs(row + 1 + index, 2, line))
    if (buttons >= from && buttons < from + room) {
      hit(row + 1 + buttons - from, 2, 10, 1, { kind: 'key', key: 'a' })
      hit(row + 1 + buttons - from, 15, 10, 1, { kind: 'key', key: 'c' })
      if (m.gate.isPlan) hit(row + 1 + buttons - from, 28, 15, 1, { kind: 'key', key: 'v' })
    }
    row += size
  }
  if (m.gate !== undefined && ui.tab !== 1) {
    const label = `◆ ${m.gate.label} · `
    c.put(row, 1, fit(`${label}a Approve · c Change · v Plan`, width - 2), { tone: 'warn' })
    for (const [offset, size, key] of [[0, 9, 'a'], [12, 8, 'c'], [23, 6, 'v']] as const) {
      const col = 1 + label.length + offset
      if (col + size < width) hit(row, col, size, 1, { kind: 'key', key })
    }
    row++
  }
  for (const role of waiting) {
    if (row >= bottom) break
    c.put(row, 0, spread(`▌ ◆ ${fit(role.name, 7)}waits on you${role.waitsOn ? ` · ${role.waitsOn}` : ''}`, 'o Open window', width - 1), { tone: 'warn' })
    hit(row, 0, width, 1, { kind: 'role', name: role.name })
    hit(row, width - 14, 13, 1, { kind: 'key', key: 'o', role: role.name })
    row += 1
  }
  row += 1

  // The key bar and the input line keep the bottom.
  if (ui.input !== undefined) c.runs(height - 2, 0, [{ text: ` ${ui.input.label} › `, tone: 'accent' }, { text: ui.input.text }, { text: '▏', tone: 'accent' }])
  else if (ui.message) c.put(height - 2, 0, fit(` ${ui.message}`, width), { tone: 'accent' })
  if (ui.input !== undefined && ui.message) c.put(height - 3, 0, fit(` ${ui.message}`, width), { tone: 'accent' })
  const keys = m.gate !== undefined ? ' a  approve   c  change   v  plan   ↑↓  role   1-5  tabs   ?  help' : ' ↑↓  role   ⏎  detail   o  open   s  send   d  diff   1-5  tabs   ?  help'
  c.put(height - 1, 0, fit(keys, width), { tone: 'dim' })

  if (row < bottom) maxScroll = ui.tab === 1 ? mission(c, m, ui, row, bottom, hit) : other(c, m, ui, row, bottom, hit)
  if (ui.help) {
    const lines = ['↑↓ / j k  select role     Enter  detail', '1-5 / Tab  tabs           o  open role pane', 's  send to role           d  diff    v  plan', 'PgUp/PgDn / wheel  scroll content', 'a  approve gate           c  type a change', 'Enter  submit input       Esc  cancel input', '? / Esc  close help       q / Ctrl-C  quit']
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
const mission = (c: Canvas, m: PanelModel, ui: Ui, top: number, bottom: number, hit: (row: number, col: number, w: number, h: number, target: Target) => void): number => {
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
          { text: fit(role.name, 12), ...(role.name === ui.selected && { tone: 'bright' as const, bold: true as const }) },
          badge(role),
          { text: contextOf(role).padStart(5), tone: 'dim' },
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
  const drawn = flow(m, ui, width)
  // FLOW, then the selected role's detail and live window, scrolled as one column when they do not fit.
  const view = Math.max(0, bottom - top - 1)
  const flowLines = drawn.canvas.lines()
  const selected = m.roles.find(role => role.name === ui.selected)
  const fits = view - flowLines.length - 1
  const shown = selected === undefined ? undefined : detail(selected, width, fits >= 14 ? fits : view)
  const column: Line[] = [...flowLines, ...(shown === undefined ? [] : [[], ...shown.lines])]
  const maxScroll = Math.max(0, column.length - view)
  const from = Math.max(0, Math.min(ui.scroll ?? 0, maxScroll))
  c.runs(top, col, rule(from < maxScroll ? 'FLOW · scroll for more ↓' : 'FLOW', width))
  column.slice(from, from + view).forEach((line, index) => c.runs(top + 1 + index, col, line))
  const visible = (row: number, height = 1) => row >= from && row + height <= from + view
  for (const box of drawn.boxes) if (visible(box.row, box.height)) hit(top + 1 + box.row - from, col + box.col, box.width, box.height, { kind: 'role', name: box.name })
  if (shown !== undefined) {
    const keys = flowLines.length + 1 + shown.keys
    if (visible(keys)) {
      hit(top + 1 + keys - from, col + 1, 13, 1, { kind: 'key', key: 'o' })
      hit(top + 1 + keys - from, col + 18, 7, 1, { kind: 'key', key: 's' })
      hit(top + 1 + keys - from, col + 29, 6, 1, { kind: 'key', key: 'd' })
    }
  }

  return maxScroll
}

/** The ROLES tab: each role under its own rule, one fact per line. */
const rolesTable = (m: PanelModel, width: number): Line[] => {
  const lines: Line[] = []
  const LABEL = 11
  for (const role of m.roles) {
    const look = LOOK[role.state]
    const title = `${role.name} · ${look.glyph} ${look.text}`
    lines.push([{ text: '─ ', tone: 'chrome' }, badge(role), { text: ` ${role.name}`, tone: 'bright', bold: true }, { text: ` · ${look.glyph} ${look.text}`, tone: look.tone }, { text: ` ${'─'.repeat(Math.max(0, width - cellsOf(title) - 5))}`, tone: 'chrome' }])
    const field = (name: string, value: Line) => lines.push([{ text: fit(`  ${name}`, LABEL), tone: 'dim' }, ...fitRuns(value, width - LABEL)])
    field('agent', [{ text: `${role.agent} ${role.model || 'default'}` }])
    field('effort', effortOf(role.effort))
    field('ctx', contextBar(role, 24))
    field('tokens', [{ text: role.tokens === undefined ? '—' : `${tokensOf(role)}${role.tokens.window === undefined ? '' : ` · ${count(role.tokens.window)} window`}`, tone: role.tokens === undefined ? 'dim' : undefined }])
    const work = role.work
    field('work', work === undefined ? [{ text: '—', tone: 'dim' }] : [
      { text: `${work.commits.length} commit${work.commits.length === 1 ? '' : 's'} · ${work.changed.length} file${work.changed.length === 1 ? '' : 's'} ` },
      work.outside.length > 0 ? { text: `✗ ${work.outside.length} outside touches`, tone: 'error' } : { text: '✓ inside touches', tone: 'ok' },
    ])
    field('time', [{ text: role.elapsed === undefined ? `— · ${startOf(role)}` : `${role.elapsed} since dispatch`, tone: 'dim' }])
    field('branch', [{ text: role.branch }])
    field('flags', [{ text: role.flags.join(' ') || '—', tone: 'accent' }])
    if (role.state === 'waits') field('waits on', [{ text: role.waitsOn || '—', tone: 'warn' }])
    if (role.result !== undefined) lines.push(...reflow([{ text: `${role.result.status || '?'} · ${role.result.summary}`, tone: role.result.status === 'done' ? 'ok' : 'warn' }], width, ' '.repeat(LABEL), ' '.repeat(LABEL)).map((line, index) => index === 0 ? [{ text: fit('  result', LABEL), tone: 'dim' as const }, ...line.slice(1)] : line))
    lines.push([])
  }

  return lines
}

/** ROLES, PLAN, LOG and DIFF use the whole width. */
const other = (c: Canvas, m: PanelModel, ui: Ui, top: number, bottom: number, hit: (row: number, col: number, w: number, h: number, target: Target) => void): number => {
  const lines: Line[] = []
  const width = c.width - 2
  const rows: { at: number; role: string }[] = []
  if (ui.tab === 2) {
    const table = rolesTable(m, width)
    // A role's block starts at its name row: the header, then blocks separated by a blank line.
    table.forEach((line, index) => { const name = m.roles.find(role => line[0]?.text === '─ ' && line.some(run => run.bold && run.text.trim() === role.name)); if (name !== undefined) rows.push({ at: index, role: name.name }) })
    lines.push(...table)
  } else if (ui.tab === 3) {
    lines.push(...reflow([{ text: `${m.planPath}  ·  ${m.hash.replace(/^(sha256:.{8}).*$/, '$1')}  ·  `, tone: 'dim' }, checksOf(m), { text: `  ·  f ${ui.full ? 'summary' : 'full text'}`, tone: 'dim' }], width), [])
    if (!ui.full) lines.push([{ text: m.title, tone: 'bright', bold: true }], [])
    lines.push(...(ui.full ? planFull(m, width) : planSummary(m, width)))
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
  })
  for (const one of rows) if (one.at >= from && one.at < from + room) hit(top + one.at - from, 1, width, 1, { kind: 'role', name: one.role })

  return maxScroll
}
