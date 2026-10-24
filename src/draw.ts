import { badgeOf } from './agents.ts'
import { Canvas, DOUBLE, fit, SINGLE, wrap } from './canvas.ts'
import type { Line, Run, Tone } from './canvas.ts'
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

const contextOf = (role: RoleView) => {
  const value = role.context?.trim()
  if (!value || /^(?:—|unknown|n\/a)$/i.test(value)) return '—'
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(value)
  if (percent === null) return value
  const filled = Math.round(Math.max(0, Math.min(100, Number(percent[1]))) / 10)

  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${value}`
}

const badge = (role: RoleView): Run => {
  const one = role.badge ?? badgeOf(role.agent)

  return { text: one.glyph, tone: one.tone }
}

export const effortOf = (effort: string): Run => {
  const levels: Record<string, number> = { minimal: 1, low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }
  const count = Object.hasOwn(levels, effort) ? levels[effort] : undefined

  return { text: count === undefined ? effort || 'default' : '▰'.repeat(count) + '▱'.repeat(5 - count), tone: effort === '' ? 'dim' : 'accent' }
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
    let end = Math.min(room, cells.length)
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

const planLines = (m: PanelModel, width: number): Line[] => {
  const checks: Run = m.problems.length === 0 ? { text: 'checks clean', tone: 'ok' } : { text: `${m.problems.length} problems`, tone: 'error' }
  const lines = reflow([{ text: `${m.planPath} · ${m.hash.slice(0, 15)} · `, tone: 'dim' }, checks], width)
  lines.push([])
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
  lines.push([{ text: `${fit('ROLE', 8)}${fit('AGENT', 9)}${fit('MODEL', 13)}${fit('EFFORT', 8)}FLAGS`, tone: 'dim' }])
  for (const role of m.roles) {
    lines.push([
      { text: fit(role.name, 8), tone: 'bright', bold: true },
      badge(role), { text: ` ${fit(role.agent, 6)} ${fit(role.model || 'default', 13)}` },
      { ...effortOf(role.effort), text: fit(effortOf(role.effort).text, 8) },
      { text: fit(role.flags.join(' '), inner - 38), tone: 'accent' },
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

/** Builders layer only on depends_on. Review-only roles watch each branch from a side lane. */
const flow = (m: PanelModel, ui: Ui, width: number): { canvas: Canvas; boxes: { name: string; row: number; col: number; width: number; height: number }[] } => {
  const reviewers = m.roles.filter(role => role.touches.length === 0 && role.reviews.length > 0)
  const builders = m.roles.filter(role => !reviewers.includes(role))
  const known = new Set(builders.map(role => role.name))
  const nodes = builders.map(role => ({ role, name: role.name, dependsOn: role.dependsOn.filter(dep => known.has(dep)) }))
  const { layers, stuck } = layersOf(nodes)
  if (stuck.length > 0) layers.push(stuck)
  const laneWidth = 26
  const gutters = builders.length + 2
  const side = builders.length > 0 && reviewers.length > 0 && width >= BOX + gutters + reviewers.length * (laneWidth + GAP)
  const builderWidth = side ? width - reviewers.length * (laneWidth + GAP) : width
  const chainWidth = Math.max(8, builderWidth - gutters)
  const rows: { nodes: typeof nodes; box: number }[] = layers.flatMap(layer => {
    // Each reviewed branch gets its own horizontal edge, clear of other boxes.
    if (side) return layer.map(node => ({ nodes: [node], box: Math.min(BOX, chainWidth) }))
    const box = Math.min(BOX, Math.floor((chainWidth - (layer.length - 1) * GAP) / Math.max(1, layer.length)))
    if (box >= 18) return [{ nodes: layer, box }]
    const per = Math.max(1, Math.floor((chainWidth + GAP) / (BOX + GAP)))

    return Array.from({ length: Math.ceil(layer.length / per) }, (_, index) => ({ nodes: layer.slice(index * per, index * per + per), box: Math.min(BOX, chainWidth) }))
  })
  const builderEnd = 3 + rows.length * 8
  const fallbackWidth = Math.min(width, Math.max(BOX, 48))
  const reviewerNotes = reviewers.map(role => wrap(`reviews ${role.reviews.join(', ')} as each lands`, fallbackWidth - 4))
  const canvas = new Canvas(width, builderEnd + (side ? 0 : reviewerNotes.reduce((n, lines) => n + 6 + lines.length, 0)))
  const boxes: { name: string; row: number; col: number; width: number; height: number }[] = []
  const orchWidth = Math.min(BOX, chainWidth)
  canvas.box(0, 0, orchWidth, 3, 'chrome')
  canvas.put(1, 2, fit('● orchestrator', orchWidth - 4), { tone: 'bright' })
  const roleBox = (role: RoleView, row: number, col: number, boxWidth: number, height = 5) => {
    const look = LOOK[role.state]
    const selected = role.name === ui.selected
    canvas.box(row, col, boxWidth, height, selected ? look.tone : role.state === 'planned' ? 'chrome' : look.tone, selected ? DOUBLE : SINGLE)
    canvas.put(row + 1, col + 2, spread(`${look.glyph} ${role.name}`, look.text, boxWidth - 4), { tone: look.tone, ...(selected && { bold: true }) })
    canvas.runs(row + 2, col + 2, [badge(role), { text: ` ${fit(`${role.agent} ${role.model || 'default'}`, boxWidth - 6)}`, tone: 'dim' }])
    const usage = contextOf(role) === '—' ? effortOf(role.effort) : { text: contextOf(role), tone: 'dim' as const }
    canvas.runs(row + 3, col + 2, [{ ...usage, text: fit(usage.text, boxWidth - 4) }])
    boxes.push({ name: role.name, row, col, width: boxWidth, height })
  }
  const placed = new Map<string, { row: number; center: number; col: number; width: number }>()
  let row = 3
  for (const one of rows) {
    one.nodes.forEach((node, index) => {
      const col = index * (one.box + GAP)
      const center = col + Math.floor(one.box / 2)
      roleBox(node.role, row + 3, col, one.box)
      placed.set(node.name, { row: row + 3, center, col, width: one.box })
    })
    row += 8
  }
  // Route vertical edges in dedicated gutters so a long dependency never cuts
  // through an unrelated builder (including roots wrapped into a later row).
  for (const node of nodes) {
    const child = placed.get(node.name)
    if (child === undefined) continue
    const sources = node.dependsOn.length === 0 ? [''] : node.dependsOn
    for (const name of sources) {
      const parent = name === '' ? { row: -2, center: Math.floor(orchWidth / 2) } : placed.get(name)
      if (parent === undefined) continue
      const from = parent.row + 5
      const to = child.row - 2
      if (to < from) continue
      if (parent.center === child.center && to === from + 1) {
        connect(canvas, from, [parent.center], [child.center])
        continue
      }
      const gutter = chainWidth + 1 + (name === '' ? 0 : builders.findIndex(role => role.name === name) + 1)
      wire(canvas, from, parent.center, `└${'─'.repeat(Math.max(0, gutter - parent.center - 1))}┐`)
      for (let r = from + 1; r < to; r++) wire(canvas, r, gutter, '│')
      wire(canvas, to, child.center, `┌${'─'.repeat(Math.max(0, gutter - child.center - 1))}┘`)
      canvas.put(to + 1, child.center, '▼', { tone: 'chrome' })
    }
  }
  let below = builderEnd
  reviewers.forEach((role, index) => {
    if (!side) {
      const note = reviewerNotes[index] ?? []
      const height = 5 + note.length
      roleBox(role, below, 0, fallbackWidth, height)
      note.forEach((line, i) => canvas.put(below + 4 + i, 2, line, { tone: 'dim' }))
      below += height + 1
      return
    }
    const sources = role.reviews.map(name => ({ name, box: placed.get(name) })).filter(one => one.box !== undefined)
    const first = sources.length === 0 ? 6 : Math.min(...sources.map(one => one.box?.row ?? 6))
    const last = Math.max(first, ...sources.map(one => one.box?.row ?? first))
    const col = builderWidth + GAP + index * (laneWidth + GAP)
    roleBox(role, first, col, laneWidth, Math.max(5, last - first + 5))
    sources.forEach(({ name, box }) => {
      if (box === undefined) return
      const tone = builders.find(one => one.name === name)?.state === 'done' ? 'ok' : 'dim'
      wire(canvas, box.row + 1, box.col + box.width, `${'─'.repeat(Math.max(0, col - box.col - box.width - 1))}▶`, tone)
    })
  })

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
  lines.push([{ text: fit(' agent', 10), tone: 'dim' }, badge(role), { text: ` ${role.agent} ${role.model || 'default'} ` }, effortOf(role.effort)])
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
  if (m.gate !== undefined && ui.tab === 1) {
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
          { text: fit(role.name, 7), ...(role.name === ui.selected && { tone: 'bright' as const, bold: true as const }) },
          badge(role), { text: ` ${fit(role.agent, 6)}`, tone: 'dim' },
          { text: (role.context || '—').padStart(4), tone: 'dim' },
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

/** Card content wraps inside its border; a row's taller card sets the next row. */
const roleCards = (m: PanelModel, ui: Ui, width: number) => {
  const columns = width >= 90 ? 2 : 1
  const gap = 2
  const cardWidth = Math.floor((width - gap * (columns - 1)) / columns)
  const inner = cardWidth - 4
  const cards = m.roles.map(role => {
    const look = LOOK[role.state]
    const lines: Line[] = []
    const field = (label: string, value: string, tone?: Tone) => lines.push(...reflow([{ text: `${label} `, tone: 'dim' }, { text: value, ...(tone && { tone }) }], inner))
    lines.push(...reflow([badge(role), { text: ` ${role.name} · ${look.glyph} ${look.text}`, tone: look.tone, bold: true }], inner))
    lines.push(...reflow([{ text: `${role.model || 'default'} ` }, effortOf(role.effort)], inner))
    field('flags', role.flags.join(' ') || '—', 'accent')
    field('branch', role.branch)
    const work = role.work
    field('work', work === undefined ? '— commits · — files inside / — outside touches' : `${work.commits.length} commits · ${work.changed.length - work.outside.length} files inside / ${work.outside.length} outside touches`, work?.outside.length ? 'error' : undefined)
    field('starts', startOf(role).replace(/^starts /, ''))
    field('elapsed', role.elapsed === undefined ? '—' : `${role.elapsed} since dispatch`)
    field('context', contextOf(role) || '—')
    if (role.state === 'waits') field('waits on', role.waitsOn || '—', 'warn')
    field('result', role.result === undefined ? '—' : `${role.result.status || '?'} · ${role.result.summary}`, role.result?.status === 'done' ? 'ok' : undefined)
    field('last', role.screen.filter(line => line.trim() !== '').at(-1)?.trim() || '—')

    return { role, lines }
  })
  const boxes: { name: string; row: number; col: number; width: number; height: number }[] = []
  let height = 0
  for (let index = 0; index < cards.length; index += columns) {
    const group = cards.slice(index, index + columns)
    const h = Math.max(...group.map(card => card.lines.length)) + 2
    group.forEach((card, col) => boxes.push({ name: card.role.name, row: height, col: col * (cardWidth + gap), width: cardWidth, height: h }))
    height += h + 1
  }
  const canvas = new Canvas(width, Math.max(0, height - 1))
  cards.forEach((card, index) => {
    const box = boxes[index]
    if (box === undefined) return
    const selected = card.role.name === ui.selected
    canvas.box(box.row, box.col, box.width, box.height, selected ? 'accent' : 'chrome', selected ? DOUBLE : SINGLE)
    card.lines.forEach((line, i) => canvas.runs(box.row + i + 1, box.col + 2, line))
  })

  return { lines: canvas.lines(), boxes }
}

/** ROLES, PLAN, LOG and DIFF use the whole width. */
const other = (c: Canvas, m: PanelModel, ui: Ui, top: number, bottom: number, hit: (row: number, col: number, w: number, h: number, target: Target) => void): number => {
  const lines: Line[] = []
  const width = c.width - 2
  let cards: ReturnType<typeof roleCards> | undefined
  if (ui.tab === 2) {
    cards = roleCards(m, ui, width)
    lines.push(...cards.lines)
  } else if (ui.tab === 3) {
    lines.push(...planLines(m, width))
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
  for (const box of cards?.boxes ?? []) {
    const row = Math.max(top, top + box.row - from)
    const end = Math.min(bottom, top + box.row + box.height - from)
    if (end > row) hit(row, 1 + box.col, box.width, end - row, { kind: 'role', name: box.name })
  }

  return maxScroll
}
