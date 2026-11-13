import { badgeOf } from './agents.ts'
import { blend, Canvas, cellsOf, DOUBLE, fit, rgbOf, ROUND, SINGLE, solid, textOf, TONES, wrap } from './canvas.ts'
import type { Hex, Line, Run, Style, Tone } from './canvas.ts'
import { pairsOf, wordDiff } from './diff.ts'
import type { FileDiff } from './diff.ts'
import { known, lang, plural, t } from './i18n.ts'
import type { Phrase } from './i18n.ts'
import { clockOf, durationOf } from './model.ts'
import type { PanelModel, RoleView, StageMark } from './model.ts'
import { clashesOf, sectionsOf, treeOf } from './plan.ts'
import type { RoleState } from './state.ts'

// The panel's screen (design section 5b): title bar, tabs, the goal, the
// needs-you strip (an open gate as a box, each waiting role as a line), then
// ROLES / STAGES / ACTIVITY on the left and, on the MISSION tab, the FLOW and
// the selected role's detail with its live screen on the right; the key bar
// last. Every clickable part is also a target, so a click finds what it hit.

export const TABS = ['MISSION', 'ROLES', 'PLAN', 'LOG', 'DIFF'] as const
export type Ui = {
  tab: number; selected: string; input?: { label: string; text: string }; scroll?: number; message?: string; help?: boolean; full?: boolean
  /** LOG: the event under the cursor, the events opened to their fields, and how many there were when following stopped. */
  line?: number; open?: number[]; paused?: number
  /** DIFF: the file under the cursor, as `role\tpath`. */
  file?: string
}
/** `stay`: selecting the role keeps the tab. */
export type Target = { kind: 'role'; name: string; stay?: true } | { kind: 'tab'; tab: number } | { kind: 'key'; key: string; role?: string }
  | { kind: 'scroll'; to: number } | { kind: 'line'; index: number } | { kind: 'file'; key: string; role: string }
export type Hit = { row: number; col: number; width: number; height: number; target: Target }
export type Point = [row: number, col: number]
export type Rect = { row: number; col: number; width: number; height: number }
/**
 * Where the drawn parts sit, for the live panel's effects; the lines never depend on it.
 * The MISSION tab's right column scrolls: its row r is on screen row `row + r`, shown when
 * `top <= row + r < bottom`, and its column c at `col + c`.
 */
export type Scene = {
  column?: {
    row: number; col: number; top: number; bottom: number; width: number
    /** Rows of the FLOW; the detail starts below it. */
    flow: number
    orchestrator: Rect
    boxes: (Rect & { name: string })[]
    /** From the orchestrator to each role that starts at once, the arrow last. */
    trunks: { name: string; path: Point[] }[]
    /** From a role's box to the reviewer's arrow. */
    lanes: { name: string; path: Point[] }[]
    /** What joins a role to the ones it waits for: its label, and the edge from the prerequisite it hangs under. */
    links: { from: string[]; to: string; cells: Point[]; edge?: { from: string; path: Point[] } }[]
    detail?: { name: string; row: number; spare: number; window?: { row: number; rows: number } }
  }
  /** Each role's glyph in the left column, on screen. */
  list: { name: string; row: number; col: number }[]
  activity?: { row: number; col: number; width: number; text: string }
  /** Rows of the waiting roles' lines, each starting with `▌`. */
  waits: number[]
  gate?: Point
  /** The open gate's box, whose border breathes. */
  gateBox?: Rect
  page?: Page
}
/** What moves on ROLES, PLAN, LOG and DIFF, on screen and only where drawn. */
export type Page = {
  /** A working role's glyph turns. */
  spins: { name: string; at: Point }[]
  /** A sweep over a working role's name and its status line. */
  shimmers: { name: string; row: number; col: number; width: number }[]
  /** Borders (their text colour) and bands (their background) that breathe in a tone. */
  breathes: { cells: Point[]; tone: Tone; period: number; seed: number; bg?: true }[]
  /** Where a working role's tokens/s line goes, and the text after it. */
  sparks: { name: string; row: number; col: number; tail: string }[]
  /** LOG: the LIVE dot while following, and each event's row, washed as it arrives. */
  live?: Point
  events: { index: number; row: number; col: number; width: number; tone: Tone }[]
}
/** `scroll` is where the frame scrolled to, when the page chose it (the LOG following its newest line). */
export type Drawn = { lines: Line[]; hits: Hit[]; maxScroll: number; scroll?: number; scene?: Scene; spin?: Point }

const LEFT = 27
const BOX = 26
const GAP = 6

export const LOOK: Record<RoleState, { glyph: string; text: Phrase; tone: Tone }> = {
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

/** While the orchestrator drafts the plan: that it does and for how long, where to watch it, and what comes here; centred, the spinner's cell with it. */
export const drafting = (planPath: string | undefined, since: number | undefined, now: number, width: number): { lines: Line[]; spin: Point } => {
  const took = since === undefined ? '' : ` · ${durationOf(Math.max(0, Math.floor((now - since) / 1000)))}`
  const next: Line = planPath === undefined
    ? [{ text: t('The plan comes here for approval when it is written.'), tone: 'dim' }]
    : [{ text: planPath }, { text: t(' comes here for approval when it is written'), tone: 'dim' }]
  const centre = (line: Line): Line => [{ text: ' '.repeat(Math.max(0, Math.floor((width - cellsOf(textOf(line))) / 2))) }, ...line]
  const title = centre([{ text: '⠋', tone: 'accent' }, { text: ' ' }, { text: t('Orch is drafting the plan'), tone: 'bright', bold: true }, { text: took, tone: 'dim' }])

  return {
    lines: [title, centre([{ text: t("in the orchestrator's pane, beside this one"), tone: 'dim' }]), [], ...reflow(next, width).map(centre)],
    spin: [0, cellsOf(title[0]?.text ?? '')],
  }
}

/** `left` and `right` in `width` cells, `right` flush with the edge; `left` cut first. */
const spread = (left: string, right: string, width: number) =>
  right === '' ? fit(left, width) : fit(`${fit(left, Math.max(0, width - cellsOf(right) - 1))} ${right}`, width)

const rule = (title: string, width: number): Line => [{ text: `─ ${title} ${'─'.repeat(Math.max(0, width - cellsOf(title) - 3))}`, tone: 'chrome' }]

/** When a role starts, as the plan gate says it. */
const startOf = (role: RoleView) =>
  role.dependsOn.length > 0 ? t('after {0}', role.dependsOn.join(', ')) : role.touches.length === 0 && role.reviews.length > 0 ? t('as each lands') : t('starts at once')

/** Context use as a share of the window, from the agent's transcript; undefined when unknown. */
const shareOf = (role: RoleView): number | undefined => {
  const tokens = role.tokens
  if (tokens?.window === undefined || tokens.window <= 0) return undefined

  return Math.max(0, Math.min(1, tokens.used / tokens.window))
}

/** `62%`, or `—` while it cannot be read. */
export const contextOf = (role: RoleView) => {
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
export const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n))

const tokensOf = (role: RoleView) => (role.tokens === undefined ? '—' : t('{0} in · {1} out', count(role.tokens.input), count(role.tokens.output)))

const badge = (role: RoleView): Run => {
  const one = role.badge ?? badgeOf(role.agent)

  return { text: one.glyph, tone: one.tone }
}

const LEVELS: Record<string, number> = { minimal: 1, low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }

/** Effort as five square cells and its word: `◼◼◼◻◻ high`; unset is `default`, an unknown word stays as written. */
export const effortOf = (effort: string): Line => {
  const level = Object.hasOwn(LEVELS, effort) ? LEVELS[effort] : undefined
  if (level === undefined) return [{ text: effort || t('default'), tone: 'dim' }]

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

/** Inline styles survive wrapping; markdown markers never reach the canvas. Code is cyan on a faint cyan ground. */
const inline = (text: string, dim = false): Line => {
  const runs: Line = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  const plain = dim ? { tone: 'dim' as const } : {}
  let at = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    if (index > at) runs.push({ text: text.slice(at, index), ...plain })
    const value = match[0]
    runs.push(value.startsWith('`') ? { text: value.slice(1, -1), tone: 'cyan', bg: 'cyan', wash: 0.13 } : { text: value.slice(2, -2), tone: dim ? 'dim' : 'bright', bold: true })
    at = index + value.length
  }
  if (at < text.length) runs.push({ text: text.slice(at), ...plain })

  return runs
}

/** `runs` wrapped in `width`; the first line starts with `first`, the rest with as many spaces. */
const reflow = (runs: Line, width: number, first: string | Run = '', rest = ''): Line[] => {
  const head: Run = typeof first === 'string' ? { text: first } : first
  let cells = runs.flatMap(run => [...run.text].map(text => ({ ...run, text })))
  const lines: Line[] = []
  do {
    const prefix = lines.length === 0 ? head : { text: rest }
    const room = Math.max(1, width - cellsOf(prefix.text))
    // The most characters that fit in `room` terminal cells (a CJK character takes two).
    let end = 0
    for (let used = 0; end < cells.length && used + cellsOf(cells[end]?.text ?? '') <= room; end += 1) used += cellsOf(cells[end]?.text ?? '')
    end = Math.max(1, end)
    if (end < cells.length && cells[end]?.text !== ' ') {
      const space = cells.slice(0, end).map(cell => cell.text).lastIndexOf(' ')
      if (space > 0) end = space
    }
    lines.push([prefix, ...cells.slice(0, end)])
    cells = cells.slice(end)
    while (cells[0]?.text === ' ') cells.shift()
  } while (cells.length > 0)

  return lines
}

/** A line on a faint background in `bg`, padded to `width` cells; a longer one is left for the edge to cut. */
const washed = (line: Line, width: number, bg: Tone, wash: number): Line => {
  const pad = width - cellsOf(textOf(line))

  return [...line, ...(pad > 0 ? [{ text: ' '.repeat(pad) }] : [])].map(run => (run.bg === undefined ? { ...run, bg, wash } : run))
}

/** A section head: `▍ Title` and, on a page, a faint rule to the edge. */
const sectionHead = (title: Line, width: number, tone: Tone, rule: boolean): Line => {
  const line: Line = [{ text: '▍ ', tone }, ...title.map(run => ({ ...run, tone: 'bright' as const, bold: true as const }))]

  return rule ? [...line, { text: ` ${'─'.repeat(Math.max(0, width - cellsOf(textOf(line)) - 1))}`, tone: 'chrome', fade: 0.55 }] : line
}

/** A YAML line: keys, values by kind, comments; comments only start outside quoted values. */
const yamlRuns = (text: string): Line => {
  let quote = ''
  let comment = -1
  for (let c = 0; c < text.length; c++) {
    const char = text[c] ?? ''
    if (quote !== '') { if (char === quote && text[c - 1] !== '\\') quote = '' }
    else if (char === '"' || char === "'") quote = char
    else if (char === '#' && (c === 0 || /\s/.test(text[c - 1] ?? ''))) { comment = c; break }
  }
  const body = comment < 0 ? text : text.slice(0, comment)
  const tail: Line = comment < 0 ? [] : [{ text: text.slice(comment), tone: 'dim' }]
  const key = /^(\s*(?:- )?)([^:#]+)(:)(\s*)(.*)$/.exec(body)
  if (key === null) return [{ text: body }, ...tail]
  const value = (key[5] ?? '').trimEnd()
  const tone: Tone | undefined = /^(["']).*\1$/.test(value) ? 'ok' : /^-?\d+(\.\d+)?$/.test(value) ? 'cyan' : value.startsWith('[') || value === '' ? undefined : 'bright'

  return [{ text: key[1] ?? '' }, { text: key[2] ?? '', tone: 'accentBright' }, { text: ':', tone: 'chrome' }, { text: `${key[4] ?? ''}${key[5] ?? ''}`, ...(tone && { tone }) }, ...tail]
}

/** The page's sections, by the line each starts on. */
type Head = { title: string; at: number }

/** The whole plan, rendered: `f` on the PLAN tab. */
const planFull = (m: PanelModel, width: number): { lines: Line[]; heads: Head[] } => {
  const lines: Line[] = []
  const heads: Head[] = []
  const source = m.planText.split(/\r?\n/)
  const headingPattern = /^(#{1,6})\s+(.*)$/
  let fence: string | undefined
  for (let i = 0; i < source.length; i++) {
    const text = source[i] ?? ''
    const delimiter = /^\s*```(.*)$/.exec(text)
    if (delimiter !== null) {
      // Code sits on a dim panel, a blank panel row above and below.
      fence = fence === undefined ? (delimiter[1] ?? '').trim() : undefined
      lines.push(washed([], width, 'chrome', 0.16))
      continue
    }
    if (fence !== undefined) {
      lines.push(washed([{ text: ' ' }, ...(fence === 'yaml' || fence === 'yml' ? yamlRuns(text) : [{ text }])], width, 'chrome', 0.16))
      continue
    }
    if (text.trim() === '') { lines.push([]); continue }
    const heading = headingPattern.exec(text)
    if (heading !== null) {
      const title = heading[2] ?? ''
      const role = m.roles.find(one => title.toLowerCase() === `role: ${one.name}`.toLowerCase())
      if (heading[1] === '#') lines.push(...reflow(inline(` ${title} `).map(run => ({ ...run, ...solid('accent') })), width))
      else {
        heads.push({ title: title.replace(/\*\*|`/g, ''), at: lines.length })
        lines.push(sectionHead([...(role === undefined ? [] : [badge(role), { text: ' ' }]), ...inline(title)], width, 'accent', true))
      }
      continue
    }
    const list = /^(\s*)([-*+] |\d+[.)] )(.*)$/.exec(text)
    const marker = list === null ? '' : /^\d/.test(list[2] ?? '') ? list[2] ?? '' : '• '
    const prefix = list === null ? '' : `${list[1] ?? ''}${marker}`
    let paragraph = list === null ? text.trim() : list[3] ?? ''
    while (i + 1 < source.length) {
      const next = source[i + 1] ?? ''
      if (next.trim() === '' || headingPattern.test(next) || /^\s*(?:```|[-*+] |\d+[.)] )/.test(next)) break
      paragraph += ` ${next.trim()}`
      i++
    }
    lines.push(...reflow(inline(paragraph), width, { text: prefix, tone: 'accent' }, ' '.repeat(cellsOf(prefix))))
  }

  return { lines, heads }
}

// ---- the parts -------------------------------------------------------------

const checksOf = (m: PanelModel): Run =>
  m.problems.length === 0 ? { text: t('checks clean'), tone: 'ok' } : { text: plural(m.problems.length, '{0} problem', '{0} problems'), tone: 'error' }

/** When the reviewer passed every branch it reviews: its result says PASS and they are all done. */
const passedAt = (m: PanelModel): string | undefined => {
  const reviewer = m.roles.find(role => role.touches.length === 0 && role.reviews.length > 0)
  const result = reviewer?.result
  if (reviewer === undefined || result?.status !== 'done' || !/^PASS\b/i.test(result.summary)) return undefined
  if (!reviewer.reviews.every(name => m.roles.find(role => role.name === name)?.state === 'done')) return undefined

  return result.at === undefined ? '' : clockOf(result.at)
}

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
  // A builder's column is one past the furthest of the builders it waits on; a cycle has none.
  const column = new Map<string, number>()
  const columnOf = (role: RoleView, seen: string[] = []): number => {
    if (seen.includes(role.name)) return NaN
    const known = column.get(role.name)
    if (known !== undefined) return known
    const deps = builders.filter(one => role.dependsOn.includes(one.name)).map(one => columnOf(one, [...seen, role.name]))
    const at = deps.length === 0 ? 0 : Math.max(...deps) + 1
    column.set(role.name, at)

    return at
  }
  const at = builders.map(role => columnOf(role))
  if (builders.length === 0 || at.some(Number.isNaN)) return []
  const layers = Array.from({ length: Math.max(...at) + 1 }, (_, n) => builders.filter((_, i) => at[i] === n))
  const node = (role: RoleView): Line => role.state === 'planned'
    ? [badge(role), { text: ` ${role.name}`, tone: 'bright', bold: true }]
    : [{ text: LOOK[role.state].glyph, tone: LOOK[role.state].tone }, { text: ` ${role.name}`, tone: 'bright', bold: true }]
  const line = (role: RoleView | undefined): Tone => (role?.state === 'done' ? 'ok' : 'chrome')
  const columns = layers.map((layer, index) => ({
    head: index === 0 ? t('at once') : t('after {0}', [...new Set(layer.flatMap(one => one.dependsOn))].join(', ')),
    roles: layer,
  }))
  const widths = columns.map(column => Math.max(cellsOf(column.head), ...column.roles.map(role => cellsOf(textOf(node(role))))))
  const last = reviewers.length === 0 ? [] : [reviewers.map(role => textOf(node(role))).join(' · '), t('as each lands')]
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
    { text: `  ${plural(m.roles.length, '{0} window', '{0} windows')} · `, tone: 'dim' },
    ...[...agents].flatMap(([agent, roles]) => [{ text: `${agent} ×${roles.length}`, tone: badge(roles[0] as RoleView).tone }, { text: ' · ', tone: 'dim' as const }]),
    clash === undefined ? { text: t("touches don't overlap ✓"), tone: 'ok' } : { text: t('✗ {0} and {1} overlap', clash.a, clash.b), tone: 'error' },
  ])

  return out
}

/** The plan's parts, the same in the plan gate and on the PLAN tab: goal, why, done when, each role, decisions, out of scope; wrapped, never cut. */
const planSummary = (m: PanelModel, width: number, tone: Tone, page: boolean): { lines: Line[]; heads: Head[] } => {
  const lines: Line[] = []
  const heads: Head[] = []
  const field = (name: Phrase, runs: Line) => lines.push(...reflow(runs, width, { text: fit(t(name), 7), tone: 'dim' }, ' '.repeat(7)))
  const head = (phrase: Phrase) => {
    const title = t(phrase)
    lines.push([])
    heads.push({ title, at: lines.length })
    lines.push(sectionHead([{ text: title }], width, tone, page))
    if (page) lines.push([])
  }
  field('Goal', [{ text: m.goal || m.title, tone: 'bright' }])
  if (m.why !== '') field('Why', inline(m.why))
  if (m.doneWhen.length > 0) head('Done when')
  // Each criterion as a box, ticked once the reviewer passed the mission.
  const passed = passedAt(m)
  for (const one of m.doneWhen) {
    const runs = [...inline(one, passed !== undefined), ...(passed === undefined ? [] : [{ text: `  ✓ PASS${passed ? ` ${passed}` : ''}`, tone: 'ok' as const }])]
    lines.push(...reflow(runs, width, { text: passed === undefined ? '  ☐  ' : '  ☒  ', tone: passed === undefined ? 'dim' : 'ok' }, '     '))
  }
  head('Roles')
  const shape = shapeOf(m, width)
  if (shape.length > 0) lines.push(...shape, [])
  // A role's own problems and its overlaps sit under it; the rest follow the roles.
  const clashes = clashesOf(m.roles)
  const placed = new Set<string>()
  m.roles.forEach((role, index) => {
    if (index > 0 && page) lines.push([])
    const agent = `${role.agent} ${role.model || t('default')}`
    const look = LOOK[role.state]
    lines.push([
      { text: ' ' }, badge(role), { text: ' ' },
      { text: fit(role.name, 11), tone: 'bright', bold: true },
      { text: fit(agent, 20), tone: 'dim' },
      ...fitRuns(effortOf(role.effort), EFFORT + 2),
      role.state === 'planned' ? { text: fit(startOf(role), Math.max(0, width - 48)), tone: 'dim' } : { text: fit(`${look.glyph} ${t(look.text)}`, Math.max(0, width - 48)), tone: look.tone },
    ])
    lines.push(...reflow(inline(role.goal), width, '   ', '   '))
    const side = (one: { a: string; b: string }) => (one.a === role.name ? 0 : one.b === role.name ? 1 : -1)
    const clashing = new Set(clashes.flatMap(one => (side(one) < 0 ? [] : one.shared.map(pair => pair.split(' ~ ')[side(one)] ?? ''))))
    const touches: Line = role.touches.length === 0 ? [{ text: t('changes nothing'), tone: 'dim' }] : role.touches.flatMap((touch, i) => [...(i > 0 ? [{ text: '  ' }] : []), clashing.has(touch) ? { text: `✗ ${touch}`, tone: 'error' as const } : { text: touch, tone: 'cyan' as const, bg: 'cyan' as const, wash: 0.13 }])
    lines.push(...reflow(touches, width, '   ', '   '))
    const own = [
      ...m.problems.filter(problem => problem.startsWith(`role ${role.name}: `)).map(problem => ({ problem, text: problem.slice(`role ${role.name}: `.length) })),
      ...clashes.filter(one => one.b === role.name).map(one => ({ problem: m.problems.find(problem => problem.startsWith(`${one.a} and ${one.b} overlap (`)) ?? '', text: t('overlaps {0} on {1} · neither depends on the other', one.a, one.shared.map(pair => pair.replace(/^(.+) ~ \1$/, '$1')).join('; ')) })),
    ]
    for (const { problem, text } of own) {
      placed.add(problem)
      lines.push(...reflow([{ text: `✗ ${text}`, tone: 'error' }], width, '   ', '     '))
    }
  })
  for (const problem of m.problems.filter(one => !placed.has(one))) wrap(problem, width - 4).forEach((one, index) => lines.push([{ text: `${index === 0 ? '  - ' : '    '}${one}`, tone: 'error' }]))
  if (m.decisions.length > 0) head('Decisions')
  for (const one of m.decisions) {
    const n = `  ${one.n}. `
    lines.push(...reflow([...inline(one.ask), ...(one.recommended === '' ? [] : [{ text: ' → ', tone: 'dim' as const }, { text: one.recommended, tone: 'bright' as const, bold: true as const }])], width, { text: n, tone: 'accent' }, ' '.repeat(n.length)))
  }
  const out = sectionsOf(m.planText).find(section => /^out of scope$/i.test(section.heading))?.body.replace(/\s+/g, ' ').trim() ?? ''
  if (out !== '') {
    head('Out of scope')
    lines.push(...reflow(inline(out), width, '  ', '  '))
  }

  return { lines, heads }
}

/** The gate's buttons as pills, Approve filled: each key with where it sits. */
const buttons = (plan: boolean): { line: Line; keys: { key: string; col: number; width: number }[] } => {
  const quiet: Style = { bg: 'chrome', wash: 0.35 }
  const pills: [string, string, Style][] = [['a', ` a  ${t('Approve')} `, solid('warn')], ['c', ` c  ${t('Change…')} `, quiet], ...(plan ? [['v', ` v  ${t('Read the plan')} `, quiet] as [string, string, Style]] : [])]
  const line: Line = []
  const keys: { key: string; col: number; width: number }[] = []
  let col = 0
  for (const [key, text, style] of pills) {
    if (col > 0) { line.push({ text: '  ' }); col += 2 }
    keys.push({ key, col, width: cellsOf(text) })
    line.push({ text, ...style })
    col += cellsOf(text)
  }

  return { line, keys }
}

type Gate = { lines: Line[]; buttons: number; keys: { key: string; col: number; width: number }[] }

/** The plan gate: the summary, where the plan lives and its checks, the buttons. */
const planGate = (m: PanelModel, inner: number): Gate => {
  const lines = planSummary(m, inner, 'warn', false).lines
  lines.push([], ...reflow([{ text: `${m.planPath}  ·  ${m.hash.replace(/^(sha256:.{4}).*$/, '$1…')}  ·  `, tone: 'dim' }, checksOf(m)], inner), [])
  const at = lines.length
  const isClean = m.problems.length === 0
  const note = !isClean ? t('fix the plan first') : m.decisions.length > 0 ? t('approving takes the recommendations') : ''
  const { line, keys } = buttons(true)
  if (!isClean) line[0] = { ...line[0], text: line[0]?.text ?? '', bg: 'chrome', wash: 0.35, tone: 'dim' }
  const used = cellsOf(textOf(line))
  lines.push([...line, { text: note && inner >= used + cellsOf(note) + 1 ? `${' '.repeat(inner - used - cellsOf(note))}${note}` : '', tone: 'dim' }])
  if (note && inner < used + cellsOf(note) + 1) lines.push(...reflow([{ text: note, tone: 'dim' }], inner))

  return { lines, buttons: at, keys }
}

/** Another gate: the orchestrator's question and the buttons. */
const askGate = (ask: string, inner: number): Gate => {
  const lines: Line[] = wrap(ask, inner).map(one => [{ text: one, tone: 'bright' }])
  lines.push([])
  const { line, keys } = buttons(false)

  return { lines: [...lines, line], buttons: lines.length, keys }
}

/**
 * The FLOW, as a dependency tree. Builders stack depth-first: a trunk from the
 * orchestrator feeds each one that starts at once, and a role that waits on
 * another sits right under it, indented, joined by an edge from its
 * prerequisite's box, dashed until that one is done. A reviewer reviews each
 * branch as it lands, so it sits in a lane to the right of the widest box,
 * joined to every role it reviews by an edge that lights once that role is
 * done; without room for the lane it sits below with a line saying so.
 */
type Flow = { canvas: Canvas } & Pick<NonNullable<Scene['column']>, 'orchestrator' | 'boxes' | 'trunks' | 'lanes' | 'links'>
const DASH: Record<string, string> = { '│': '╎', '─': '╌' }
const flow = (m: PanelModel, ui: Ui, width: number): Flow => {
  const reviewers = m.roles.filter(role => role.touches.length === 0 && role.reviews.length > 0)
  const builders = m.roles.filter(role => !reviewers.includes(role))
  const tree = treeOf(builders)
  const INDENT = 5
  const STEP = 4
  const HEIGHT = 5
  const box = Math.max(16, Math.min(BOX, width - INDENT))
  const lane = Math.min(BOX, 24)
  const deepest = Math.max(0, ...tree.map(one => one.depth))
  const side = reviewers.length === 1 && tree.length > 0 && width >= INDENT + deepest * STEP + box + 6 + lane
  // Indentation stops where the box would leave the width (or the reviewer's lane).
  const levels = side ? deepest : Math.max(0, Math.floor((width - box - INDENT) / STEP))
  const colOf = (depth: number) => INDENT + Math.min(depth, levels) * STEP
  const below = side ? [] : reviewers
  const canvas = new Canvas(width, 3 + tree.length * (HEIGHT + 2) + below.length * (HEIGHT + 4))
  const boxes: Flow['boxes'] = []
  const trunks: Flow['trunks'] = []
  const lanes: Flow['lanes'] = []
  const links: Flow['links'] = []
  const roleBox = (role: RoleView, row: number, col: number, w: number, note = '') => {
    const look = LOOK[role.state]
    const selected = role.name === ui.selected
    const notes = note === '' ? [] : wrap(note, w - 4)
    const h = HEIGHT + notes.length
    canvas.box(row, col, w, h, selected ? look.tone : role.state === 'planned' ? 'chrome' : look.tone, selected ? DOUBLE : SINGLE)
    canvas.put(row + 1, col + 2, spread(`${look.glyph} ${role.name}`, t(look.text), w - 4), { tone: look.tone, ...(selected && { bold: true }) })
    canvas.runs(row + 2, col + 2, [badge(role), { text: ` ${fit(`${role.agent} ${role.model || t('default')}`, w - 6)}`, tone: 'dim' }])
    const ctx = contextOf(role) === '—' ? '' : `${t('ctx')} ${contextOf(role)}`
    canvas.runs(row + 3, col + 2, [...fitRuns(effortOf(role.effort), w - 4 - cellsOf(ctx)), { text: ctx, tone: 'dim' }])
    notes.forEach((one, index) => canvas.put(row + 4 + index, col + 2, one, { tone: 'dim' }))
    boxes.push({ name: role.name, row, col, width: w, height: h })

    return row + h
  }

  canvas.box(0, 0, Math.min(BOX, width), 3, 'chrome')
  canvas.put(1, 2, fit(`● ${t('orchestrator')}`, Math.min(BOX, width) - 4), { tone: 'bright' })
  const placed = new Map<string, { row: number; col: number }>()
  const roots: number[] = []
  const locked: Point[][] = []
  tree.forEach(({ role, depth, parent }, index) => {
    const row = 3 + index * (HEIGHT + 2) + 1
    const col = colOf(depth)
    roleBox(role, row, col, box)
    placed.set(role.name, { row, col })
    const mid = row + 2
    const waits = role.dependsOn.some(dep => builders.some(one => one.name === dep))
    if (!waits) roots.push(mid)
    // The label sits just above the box, beside the edge.
    const label = fit(t('after {0}', role.dependsOn.join(', ')), Math.max(0, width - col - 1)).trimEnd()
    const cells = Array.from({ length: cellsOf(label) }, (_, i) => [row - 1, col + i] as Point)
    if (waits) canvas.put(row - 1, col, label, { tone: 'dim' })
    if (parent === undefined) {
      // In a cycle: no prerequisite to hang under.
      if (waits) links.push({ from: role.dependsOn, to: role.name, cells })
      return
    }
    // The edge: down from under the prerequisite's box, then └▶ into this one's middle row.
    const from = placed.get(parent.name) ?? { row: 0, col: INDENT }
    const edge = Math.min(from.col + 2, col - 2)
    const path: Point[] = [
      ...Array.from({ length: Math.max(0, mid - from.row - HEIGHT) }, (_, i) => [from.row + HEIGHT + i, edge] as Point),
      [mid, edge], ...Array.from({ length: Math.max(0, col - edge - 2) }, (_, i) => [mid, edge + 1 + i] as Point), [mid, col - 1],
    ]
    path.forEach(([r, c], i) => i === path.length - 1 ? canvas.put(r, c, '▶', { tone: 'chrome' }) : wire(canvas, r, c, r === mid ? (c === edge ? '└' : '─') : '│'))
    if (parent.state !== 'done') locked.push(path)
    links.push({ from: role.dependsOn, to: role.name, cells, edge: { from: parent.name, path } })
    // A dependent's packets run along its own edge.
    trunks.push({ name: role.name, path })
  })
  // An edge whose prerequisite is not done yet is dashed and faint; its joints keep their shape.
  for (const path of locked) for (const [r, c] of path) {
    const cell = canvas.cells[r]?.[c]
    if (cell !== undefined) Object.assign(cell, { ch: DASH[cell.ch] ?? cell.ch, tone: 'chrome', fade: 0.75 })
  }
  // The trunk: from under the orchestrator down to the last role that starts at once.
  if (roots.length > 0) {
    wire(canvas, 2, 2, '┬')
    for (let row = 3; row < Math.max(...roots); row += 1) wire(canvas, row, 2, '│')
    for (const row of roots) wire(canvas, row, 2, `${row === Math.max(...roots) ? '└' : '├'}─`), canvas.put(row, INDENT - 1, '▶', { tone: 'chrome' })
    for (const { role } of tree) {
      const at = (placed.get(role.name)?.row ?? 0) + 2
      if (roots.includes(at)) trunks.push({ name: role.name, path: [...Array.from({ length: at - 2 }, (_, i) => [2 + i, 2] as Point), [at, 2], [at, 3], [at, INDENT - 1]] })
    }
  }

  const reviewer = reviewers[0]
  if (side && reviewer !== undefined) {
    const sources = reviewer.reviews.map(name => ({ name, at: placed.get(name), done: builders.find(one => one.name === name)?.state === 'done' })).filter(one => one.at !== undefined)
    const spine = Math.max(...[...placed.values()].map(one => one.col + box)) + 2
    const rows = sources.map(one => (one.at?.row ?? 0) + 2)
    const mid = rows.length === 0 ? 6 : Math.round((Math.min(...rows) + Math.max(...rows)) / 2)
    // Dim edges first, lit ones over them, so a landed branch reads all the way to the reviewer.
    for (const one of [...sources.filter(one => !one.done), ...sources.filter(one => one.done)]) {
      const tone: Tone = one.done ? 'ok' : 'chrome'
      const at = (one.at?.row ?? mid - 2) + 2
      const right = (one.at?.col ?? INDENT) + box
      wire(canvas, at, right, '─'.repeat(spine - right), tone)
      for (let row = Math.min(at, mid) + 1; row < Math.max(at, mid); row += 1) wire(canvas, row, spine, '│', tone)
      // Partial joints merge: a source above and one below make ├ on the reviewer's row.
      wire(canvas, at, spine, at < mid ? '┐' : at > mid ? '┘' : '─', tone)
      if (at !== mid) wire(canvas, mid, spine, at < mid ? '└' : '┌', tone)
      wire(canvas, mid, spine + 1, '──', tone)
      canvas.put(mid, spine + 3, '▶', { tone })
      const step = at < mid ? 1 : -1
      lanes.push({ name: one.name, path: [
        ...Array.from({ length: spine - right + 1 }, (_, i) => [at, right + i] as Point),
        ...Array.from({ length: Math.max(0, Math.abs(mid - at) - 1) }, (_, i) => [at + step * (i + 1), spine] as Point),
        ...(at === mid ? [] : [[mid, spine] as Point]), [mid, spine + 1], [mid, spine + 2], [mid, spine + 3],
      ] })
    }
    roleBox(reviewer, Math.max(0, mid - 2), spine + 4, Math.min(lane, width - spine - 4))
  }
  let row = 3 + tree.length * (HEIGHT + 2)
  for (const role of below) row = roleBox(role, row, INDENT, box, t('reviews {0} as each lands', role.reviews.join(', '))) + 1

  return { canvas, orchestrator: { row: 0, col: 0, width: Math.min(BOX, width), height: 3 }, boxes, trunks, lanes, links }
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
const detail = (role: RoleView, width: number, room: number): { lines: Line[]; keys: number; keyCols: { key: string; col: number; width: number }[]; spare: number; window?: { row: number; rows: number } } => {
  const look = LOOK[role.state]
  const head = `${look.glyph} ${role.name} · ${t(look.text)}`
  const lines: Line[] = [[{ text: '─ ', tone: 'chrome' }, { text: head, tone: look.tone }, { text: ` ${'─'.repeat(Math.max(0, width - cellsOf(head) - 3))}`, tone: 'chrome' }]]
  const field = (name: Phrase, text: string, tone?: Tone) =>
    wrap(text, width - 10).slice(0, 2).forEach((one, index) => lines.push([{ text: fit(index === 0 ? ` ${t(name)}` : '', 10), tone: 'dim' }, { text: one, ...(tone && { tone }) }]))
  field('goal', role.goal)
  lines.push([{ text: fit(` ${t('agent')}`, 10), tone: 'dim' }, badge(role), { text: ` ${role.agent} ${role.model || t('default')}   ` }, ...effortOf(role.effort)])
  if (role.tokens !== undefined) lines.push([{ text: fit(` ${t('context')}`, 10), tone: 'dim' }, ...contextBar(role, 16), { text: `   ${tokensOf(role)}`, tone: 'dim' }])
  lines.push([{ text: fit('', 10) }, { text: fit(role.flags.join(' '), width - 10), tone: 'accent' }])
  const commits = role.work?.commits.length ?? 0
  field('branch', `${role.branch}${commits > 0 ? `  ·  ${plural(commits, '{0} commit', '{0} commits')}` : ''}`)
  field('touches', role.touches.length === 0 ? `— ${t('changes nothing')}` : role.touches.join(' '))
  if (role.work !== undefined) {
    const n = role.work.changed.length
    const files = plural(n, '{0} file changed', '{0} files changed')
    if (role.work.outside.length === 0) field('diff', `${files} · ${t('inside touches ✓')}`, n === 0 ? 'dim' : 'ok')
    else field('diff', `${files} · ${t('outside touches: {0}', role.work.outside.join(' '))}`, 'error')
  }
  if (role.result !== undefined) field('result', `${role.result.status || '?'} · ${role.result.summary}`, role.result.status === 'done' ? 'ok' : 'warn')
  const spare = lines.length
  lines.push([])
  let window: { row: number; rows: number } | undefined
  if (role.state === 'planned') lines.push([{ text: ` ${t('not opened yet · {0}', startOf(role))}`, tone: 'dim' }])
  else {
    // The live screen takes the rows left, less the key line.
    const inner = Math.max(1, Math.min(role.screen.length, room - lines.length - 3))
    const title = ` ${t('its window, live')} `
    lines.push([{ text: `┌─${title}${'─'.repeat(Math.max(0, width - cellsOf(title) - 3))}┐`, tone: 'chrome' }])
    const shown = role.screen.length === 0 ? [''] : role.screen.slice(-inner)
    window = { row: lines.length - 1, rows: shown.length }
    for (const one of shown) lines.push([{ text: '│ ', tone: 'chrome' }, { text: fit(one, width - 4) }, { text: ' │', tone: 'chrome' }])
    lines.push([{ text: `└${'─'.repeat(width - 2)}┘`, tone: 'chrome' }])
  }
  const keys = lines.length
  const waits = role.state === 'waits'
  // The key line, and where each key's label sits for its click.
  const keyRuns: [string, Line][] = [['o', [{ text: `o ${t('Open window')}` }]], ['s', [{ text: `s ${t('Send…')}`, tone: waits ? 'dim' : undefined }]], ['d', [{ text: `d ${t('Diff')}` }]]]
  const keyLine: Line = [{ text: ' ' }]
  const keyCols: { key: string; col: number; width: number }[] = []
  for (const [key, runs] of keyRuns) {
    if (keyCols.length > 0) keyLine.push({ text: '    ' })
    const col = cellsOf(textOf(keyLine))
    keyCols.push({ key, col, width: cellsOf(textOf(runs)) })
    keyLine.push(...runs)
  }
  lines.push([...keyLine, ...(waits ? [{ text: `    ${t('answer it first')}`, tone: 'dim' as const }] : [])])

  return { lines, keys, keyCols, spare, ...(window && { window }) }
}

/** The language switch, `中/EN` with the one in use lit; a click on it or `L` switches. */
export const langSwitch = (): Line => {
  const lit = (on: boolean): Style => (on ? { tone: 'accent', bold: true } : { tone: 'dim' })

  return [{ text: '中', ...lit(lang() === 'zh') }, { text: '/', tone: 'chrome' }, { text: 'EN', ...lit(lang() === 'en') }]
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
  const scene: Scene = { list: [], waits: [] }

  // Title bar, tabs, goal, rule.
  let at = c.runs(0, 0, [{ text: ' troupe', tone: 'bright', bold: true }, { text: '  ' }, { text: m.mission, tone: 'accent' }, { text: '  ·  ', tone: 'dim' }])
  at = c.put(0, at, known(m.stage?.label ?? ''), { tone: m.gate === undefined ? 'bright' : 'warn' })
  const toggle = langSwitch()
  const toggleAt = width - cellsOf(textOf(toggle)) - 1
  // Short of room, the count goes first: the strip below lists what needs you.
  const full = `${needs > 0 ? `◆ ${t('{0} needs you', needs)}  ·  ` : ''}${m.clock}`
  const right = toggleAt - cellsOf(full) - 3 > at ? full : m.clock
  c.put(0, toggleAt - cellsOf(right) - 3, right, { tone: needs > 0 ? 'warn' : 'dim' })
  c.runs(0, toggleAt, toggle)
  hit(0, toggleAt, cellsOf(textOf(toggle)), 1, { kind: 'key', key: 'L' })
  at = 2
  TABS.forEach((name, index) => {
    const text = `${index + 1} ${t(name)}`
    hit(1, at, cellsOf(text), 1, { kind: 'tab', tab: index + 1 })
    at = c.put(1, at, text, ui.tab === index + 1 ? { tone: 'accent', bold: true } : { tone: 'dim' }) + 3
  })
  const goal = m.goal || m.title
  c.put(2, Math.max(1, width - cellsOf(goal) - 1), fit(goal, width - 2), { tone: 'dim' })
  c.put(3, 0, '─'.repeat(width), { tone: 'chrome' })
  let row = 4
  const bottom = height - (ui.input === undefined ? 2 : 3)
  let maxScroll = 0

  // Needs you: an open gate as a box, each waiting role as a line.
  if (m.gate !== undefined && ui.tab === 1) {
    const inner = width - 4
    const { lines, buttons, keys } = m.gate.isPlan ? planGate(m, inner) : askGate(m.gate.ask, inner)
    const title = m.gate.isPlan ? ` ◆ ${t('APPROVE THE PLAN')} ` : ` ◆ ${known(m.gate.label).toUpperCase()} `
    const size = Math.max(2, Math.min(lines.length + 2, bottom - row))
    const room = size - 2
    maxScroll = Math.max(0, lines.length - room)
    const from = Math.max(0, Math.min(ui.scroll ?? 0, maxScroll))
    c.box(row, 0, width, size, 'warn', ROUND)
    scene.gateBox = { row, col: 0, width, height: size }
    const cue = maxScroll > 0 ? ` ${from + 1}-${Math.min(from + room, lines.length)}/${lines.length} · PgUp/PgDn/${t('wheel')} ` : ''
    c.put(row, 1, cue ? fit(`─${title}`, width - 2 - cellsOf(cue)) : `─${title}`, { tone: 'warn', bold: true })
    scene.gate = [row, 3]
    if (cue) c.put(row, width - cellsOf(cue) - 1, cue, { tone: 'warn' })
    lines.slice(from, from + room).forEach((line, index) => c.runs(row + 1 + index, 2, line))
    if (buttons >= from && buttons < from + room) for (const one of keys) hit(row + 1 + buttons - from, 2 + one.col, one.width, 1, { kind: 'key', key: one.key })
    row += size
  }
  if (m.gate !== undefined && ui.tab !== 1) {
    let col = c.put(row, 1, `◆ ${known(m.gate.label)} · `, { tone: 'warn' })
    scene.gate = [row, 1]
    for (const [key, phrase] of [['a', 'Approve'], ['c', 'Change'], ['v', 'Plan']] as const) {
      const text = `${key} ${t(phrase)}`
      if (col + cellsOf(text) < width) hit(row, col, cellsOf(text), 1, { kind: 'key', key })
      col = c.put(row, col, `${text}${key === 'v' ? '' : ' · '}`, { tone: 'warn' })
    }
    row++
  }
  for (const role of waiting) {
    if (row >= bottom) break
    const open = `o ${t('Open window')}`
    c.put(row, 0, spread(`▌ ◆ ${fit(role.name, 7)}${t('waits on you')}${role.waitsOn ? ` · ${role.waitsOn}` : ''}`, open, width - 1), { tone: 'warn' })
    hit(row, 0, width, 1, { kind: 'role', name: role.name })
    hit(row, width - 1 - cellsOf(open), cellsOf(open), 1, { kind: 'key', key: 'o', role: role.name })
    scene.waits.push(row)
    row += 1
  }
  row += 1

  // The key bar and the input line keep the bottom.
  if (ui.input !== undefined) c.runs(height - 2, 0, [{ text: ` ${ui.input.label} › `, tone: 'accent' }, { text: ui.input.text }, { text: '▏', tone: 'accent' }])
  else if (ui.message) c.put(height - 2, 0, fit(` ${ui.message}`, width), { tone: 'accent' })
  if (ui.input !== undefined && ui.message) c.put(height - 3, 0, fit(` ${ui.message}`, width), { tone: 'accent' })
  const pairs: [string, Phrase][] = m.gate !== undefined
    ? [['a', 'approve'], ['c', 'change'], ['v', 'plan'], ['↑↓', 'role'], ['1-5', 'tabs'], ['?', 'help']]
    : [['↑↓', 'role'], ['⏎', 'detail'], ['o', 'open'], ['s', 'send'], ['d', 'diff'], ['1-5', 'tabs'], ['?', 'help']]
  if (ui.tab === 1) c.put(height - 1, 0, fit(` ${pairs.map(([key, what]) => `${key}  ${t(what)}`).join('   ')}`, width), { tone: 'dim' })
  else c.runs(height - 1, 0, hints(m, ui, width))

  let scroll: number | undefined
  let spin: Point | undefined
  if (row < bottom && ui.tab === 1) maxScroll = mission(c, m, ui, row, bottom, hit, scene)
  else if (row < bottom) ({ maxScroll, scroll, spin } = other(c, m, ui, row, bottom, hit, scene))
  if (ui.help) {
    const keys: [string, Phrase][] = [
      ['↑↓ / j k', 'select role'], ['Enter', 'detail'], ['1-5 / Tab', 'tabs'], ['o', 'open role pane'], ['s', 'send to role'], ['d', 'diff'],
      ['v', 'plan'], ['PgUp/PgDn', 'scroll'], ['LOG ⏎', 'open an event'], ['LOG G / End', 'follow the newest'], ['DIFF ↑↓ n N', 'next file'],
      ['a', 'approve the gate'], ['c', 'type a change'], ['Enter / Esc', 'submit or cancel input'], ['L', 'switch language (中/EN)'], ['? / Esc', 'close help'], ['q / Ctrl-C', 'quit'],
    ]
    const w = Math.min(72, width - 4)
    // Two to a line when they fit, else one.
    const half = Math.floor((w - 4) / 2)
    const one = ([key, what]: [string, Phrase], room: number) => fit(`${fit(key, 13)}${t(what)}`, room)
    const lines = half >= 30
      ? Array.from({ length: Math.ceil(keys.length / 2) }, (_, i) => `${one(keys[2 * i]!, half)}${keys[2 * i + 1] === undefined ? '' : one(keys[2 * i + 1]!, half)}`)
      : keys.map(key => one(key, w - 4))
    const h = Math.min(lines.length + 2, height - 2)
    const top = Math.max(0, Math.floor((height - h) / 2))
    const left = Math.max(0, Math.floor((width - w) / 2))
    for (let r = top; r < top + h; r++) c.put(r, left, ' '.repeat(w))
    c.box(top, left, w, h, 'accent')
    lines.slice(0, h - 2).forEach((line, index) => c.put(top + 1 + index, left + 2, fit(line, w - 4)))
    hits.length = 0
  }

  return { lines: c.lines(), hits, maxScroll, ...(scroll !== undefined && { scroll }), ...(!ui.help && { scene, ...(spin && { spin }) }) }
}

/** The MISSION tab: the left column, then FLOW and the detail on the right. */
const mission = (c: Canvas, m: PanelModel, ui: Ui, top: number, bottom: number, hit: (row: number, col: number, w: number, h: number, target: Target) => void, scene: Scene): number => {
  const left: { line: Line; role?: string }[] = [{ line: rule(t('ROLES'), LEFT - 1) }]
  const groups = [...new Set(m.roles.map(role => role.group))]
  // Depth-first like the FLOW, so a role's └ sits right under what it waits on.
  const order = treeOf(m.roles).map(one => one.role)
  for (const group of groups) {
    left.push({ line: [{ text: ` ${group}`, tone: 'dim' }] })
    for (const role of order.filter(one => one.group === group)) {
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
  left.push({ line: [] }, { line: rule(t('STAGES'), LEFT - 1) })
  for (const stage of m.stages) {
    const mark = MARK[stage.mark]
    left.push({ line: [{ text: `  ${mark.glyph} `, tone: mark.tone }, { text: fit(known(stage.label), 16), ...(stage.mark === 'now' || stage.mark === 'open' ? { tone: mark.tone, bold: true as const } : stage.mark === 'done' ? {} : { tone: 'dim' as const }) }, { text: stage.note.padStart(5), tone: 'dim' }] })
  }
  left.push({ line: [] }, { line: rule(t('ACTIVITY'), LEFT - 1) })
  for (const one of m.activity) left.push({ line: [{ text: ` ${one.at} `, tone: 'dim' }, { text: fit(one.text, LEFT - 8) }] })
  const activity = left.length - m.activity.length
  left.slice(0, bottom - top).forEach((one, index) => {
    c.runs(top + index, 0, one.line)
    if (one.role !== undefined) {
      hit(top + index, 0, LEFT, 1, { kind: 'role', name: one.role })
      scene.list.push({ name: one.role, row: top + index, col: 4 })
    }
  })
  const newest = m.activity[0]
  if (newest !== undefined && activity < bottom - top) scene.activity = { row: top + activity, col: 7, width: LEFT - 8, text: `${newest.at} ${newest.text}` }
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
  c.runs(top, col, rule(from < maxScroll ? `${t('FLOW')} · ${t('scroll for more ↓')}` : t('FLOW'), width))
  column.slice(from, from + view).forEach((line, index) => c.runs(top + 1 + index, col, line))
  const visible = (row: number, height = 1) => row >= from && row + height <= from + view
  for (const box of drawn.boxes) if (visible(box.row, box.height)) hit(top + 1 + box.row - from, col + box.col, box.width, box.height, { kind: 'role', name: box.name })
  const { canvas: _, ...parts } = drawn
  scene.column = {
    row: top + 1 - from, col, top: top + 1, bottom: top + 1 + view, width, flow: flowLines.length, ...parts,
    ...(selected !== undefined && shown !== undefined && { detail: { name: selected.name, row: flowLines.length + 1, spare: flowLines.length + 1 + shown.spare, ...(shown.window && { window: { row: flowLines.length + 1 + shown.window.row, rows: shown.window.rows } }) } }),
  }
  if (shown !== undefined) {
    const keys = flowLines.length + 1 + shown.keys
    if (visible(keys)) for (const one of shown.keyCols) hit(top + 1 + keys - from, col + one.col, one.width, 1, { kind: 'key', key: one.key })
  }

  return maxScroll
}

// ---- ROLES, PLAN, LOG and DIFF ------------------------------------------------

type HitFn = (row: number, col: number, w: number, h: number, target: Target) => void
/** A page draws between `top` and `bottom` and says how far it scrolls; `scroll` when it chose where. */
type PageArgs = { c: Canvas; m: PanelModel; ui: Ui; top: number; bottom: number; hit: HitFn; page: Page }
type Paged = { maxScroll: number; scroll?: number; spin?: Point }

const toHex = (rgb: readonly number[]): Hex => `#${rgb.map(x => x.toString(16).padStart(2, '0')).join('')}`
const mixTone = (a: Tone, b: Tone, t: number): Hex => toHex(blend(rgbOf(TONES[a]), rgbOf(TONES[b]), t))
const centred = (text: string, width: number) => `${' '.repeat(Math.max(0, Math.floor((width - cellsOf(text)) / 2)))}${text}`
const clampScroll = (scroll: number | undefined, max: number) => Math.max(0, Math.min(scroll ?? 0, max))

/** Roles in the plan's order each get a hue of their own; the orchestrator and the person theirs. */
const HUES: Tone[] = ['cyan', 'coral', 'violet', 'pink', 'ok', 'accentBright']
const hueOf = (m: PanelModel, who: string): Tone => {
  const index = m.roles.findIndex(role => role.name === who)

  return index >= 0 ? HUES[index % HUES.length] ?? 'dim' : who === 'orch' ? 'accent' : who === 'panel' ? 'warn' : 'dim'
}

/** How long until a working role's context fills, at its pace since dispatch: `12m`, `2h`. */
const toFull = (role: RoleView): string | undefined => {
  const tokens = role.tokens
  if (role.state !== 'working' || tokens?.window === undefined || role.seconds === undefined || role.seconds < 60 || tokens.used <= 0) return undefined
  const minutes = ((tokens.window - tokens.used) / (tokens.used / role.seconds)) / 60

  return minutes <= 0 ? undefined : minutes < 120 ? `${Math.max(1, Math.round(minutes))}m` : `${Math.round(minutes / 60)}h`
}

const GAUGE = 16
/** Context use as cells that go green to yellow to red along the bar, then the share and how long it has left. */
const gauge = (role: RoleView): Line => {
  const share = shareOf(role)
  if (share === undefined) return [{ text: '—', tone: 'dim' }]
  const filled = Math.round(share * GAUGE)
  const cells: Line = Array.from({ length: GAUGE }, (_, i) => {
    const u = i / (GAUGE - 1)
    return i < filled ? { text: '■', tone: u < 0.6 ? mixTone('ok', 'warn', u / 0.6) : mixTone('warn', 'error', (u - 0.6) / 0.4) } : { text: '■', tone: 'chrome', fade: 0.45 }
  })
  const left = toFull(role)

  return [...cells, { text: ` ${contextOf(role)}` }, ...(left === undefined ? [] : [{ text: `  ${t('~{0} to full', left)}`, tone: 'dim' as const }])]
}

/** The agent's own status line in its window, `✻ Writing…`, without the `(esc to interrupt)`. */
const statusLineOf = (role: RoleView): string | undefined => {
  const line = [...role.screen].reverse().find(one => /^\s*[^\s\w]\s.*esc to interrupt/.test(one))

  return line === undefined ? undefined : line.slice(0, line.lastIndexOf('(')).trim()
}

/** A role as a full-width card: its name and state cut into the top border, its facts in two columns (one when narrow), then what it waits on, does or returned. */
const card = (role: RoleView, width: number, selected: boolean, seed: number): { canvas: Canvas; fx: Omit<Page, 'events'>; band?: { row: number; col: number; width: number } } => {
  const look = LOOK[role.state]
  const two = width >= 84
  const fx: Omit<Page, 'events'> = { spins: [], shimmers: [], breathes: [], sparks: [] }
  const work = role.work
  const tokens: Line = role.tokens === undefined ? [{ text: '—', tone: 'dim' }] : [{ text: tokensOf(role) }]
  const left: [Phrase, Line][] = [
    ['effort', effortOf(role.effort)],
    ['ctx', gauge(role)],
    ['tokens', tokens],
    ['work', work === undefined || (work.commits.length === 0 && work.changed.length === 0) ? [{ text: '—', tone: 'dim' }] : [
      { text: `${plural(work.commits.length, '{0} commit', '{0} commits')} · ${plural(work.changed.length, '{0} file', '{0} files')} ` },
      work.outside.length > 0 ? { text: t('✗ {0} outside', work.outside.length), tone: 'error' } : { text: t('✓ inside'), tone: 'ok' },
    ]],
  ]
  const right: [Phrase, Line][] = [
    ['agent', [badge(role), { text: ` ${role.agent} ${role.model || t('default')}` }]],
    ['time', role.elapsed === undefined ? [{ text: '—', tone: 'dim' }] : [{ text: role.elapsed }, { text: t(' since dispatch'), tone: 'dim' }]],
    ['branch', [{ text: role.branch }]],
    ['flags', [{ text: role.flags.join(' ') || '—', tone: role.flags.length === 0 ? 'dim' : 'accent' }]],
  ]
  const rows = two ? 4 : 8
  const height = rows + 3
  const canvas = new Canvas(width, height)
  const border: Style = selected ? { tone: role.state === 'planned' ? 'accent' : look.tone } : role.state === 'planned' ? { tone: 'chrome' } : { tone: look.tone, fade: role.state === 'waits' ? 0.5 : 0.65 }
  canvas.box(0, 0, width, height, border, selected ? DOUBLE : ROUND)
  canvas.runs(0, 2, [{ text: ` ${look.glyph} `, tone: look.tone }, { text: role.name, tone: 'bright', bold: true }, { text: ' ' }])
  if (role.state === 'working') {
    fx.spins.push({ name: role.name, at: [0, 3] })
    fx.shimmers.push({ name: role.name, row: 0, col: 5, width: cellsOf(role.name) })
  }
  const state: Line = role.state === 'planned' ? [{ text: `${look.glyph} ${t(look.text)}`, tone: look.tone }] : [{ text: ` ${t(look.text)} `, tone: look.tone, bg: look.tone, wash: role.state === 'waits' ? 0.25 : 0.16 }]
  canvas.runs(0, width - 3 - cellsOf(textOf(state)), [{ text: ' ' }, ...state, { text: ' ' }])
  const half = two ? Math.floor(width / 2) : width
  const put = (row: number, col: number, room: number, [label, value]: [Phrase, Line]) => {
    canvas.runs(row, col, [{ text: fit(t(label), 8), tone: 'dim' }, ...fitRuns(value, room - 8)])
    if (label === 'tokens' && role.state === 'working' && role.tokens !== undefined) fx.sparks.push({ name: role.name, row, col: col + 8, tail: t('{0} in', count(role.tokens.input)) })
  }
  const fields = two ? left : [right[0]!, ...left, ...right.slice(1)]
  fields.slice(0, rows).forEach((one, k) => put(1 + k, 2, half - 4, one))
  if (two) right.forEach((one, k) => put(1 + k, half, width - half - 2, one))
  if (role.state === 'waits' || role.state === 'working') fx.breathes.push({ cells: outline(height, width), tone: look.tone, period: role.state === 'waits' ? 1.4 : 2.8, seed })

  // The last line: what it waits on, what it is doing, what it returned, or when it starts.
  const foot = height - 2
  let band: { row: number; col: number; width: number } | undefined
  if (role.state === 'waits') {
    const key = `o ${t('open')} `
    canvas.runs(foot, 1, [{ text: fit(` ◆ ${t('waits on you')} · ${role.waitsOn || t('a dialog in its window')}`, width - 2 - cellsOf(key) - 1), ...solid('warn') }, { text: key, ...solid('warn') }, { text: ' ', ...solid('warn') }])
    fx.breathes.push({ cells: Array.from({ length: width - 2 }, (_, i) => [foot, 1 + i] as Point), tone: 'warn', period: 1.4, seed, bg: true })
    band = { row: foot, col: width - 2 - cellsOf(key), width: cellsOf(key) }
  } else if (role.state === 'working') {
    const status = statusLineOf(role)
    const last = [...role.screen].reverse().find(one => one.trim() !== '')?.trim() ?? ''
    canvas.put(foot, 2, fit(status ?? last, width - 4), { tone: status === undefined ? 'dim' : 'coral' })
    if (status !== undefined) fx.shimmers.push({ name: role.name, row: foot, col: 2, width: Math.min(cellsOf(status), width - 4) })
  } else if (role.result !== undefined && role.result.status !== '') {
    const ok = role.result.status === 'done'
    canvas.runs(foot, 2, [{ text: ok ? '✓ ' : '✕ ', tone: ok ? 'ok' : 'error' }, { text: fit(`${ok ? '' : `${role.result.status} · `}${role.result.summary}`, width - 6) }])
  } else if (role.state === 'planned') canvas.put(foot, 2, fit(startOf(role), width - 4), { tone: 'dim' })

  return { canvas, fx, ...(band && { band }) }
}
/** A box's outline cells, from its own top left. */
const outline = (height: number, width: number): Point[] => [
  ...Array.from({ length: width }, (_, i) => [0, i] as Point), ...Array.from({ length: width }, (_, i) => [height - 1, i] as Point),
  ...Array.from({ length: height - 2 }, (_, i) => [1 + i, 0] as Point), ...Array.from({ length: height - 2 }, (_, i) => [1 + i, width - 1] as Point),
]

/** ROLES: one card per role, stacked; a click on a card selects it. */
const rolesPage = ({ c, m, ui, top, bottom, hit, page }: PageArgs): Paged => {
  const width = c.width - 2
  const cards = m.roles.map((role, index) => ({ role, ...card(role, width, role.name === ui.selected, index) }))
  const total = cards.reduce((n, one) => n + one.canvas.height + 1, 0)
  const room = Math.max(0, bottom - top)
  const maxScroll = Math.max(0, total - 1 - room)
  const from = clampScroll(ui.scroll, maxScroll)
  const shown = (row: number) => row >= top && row < bottom
  let at = top - from
  for (const { role, canvas, fx, band } of cards) {
    canvas.lines().forEach((line, r) => { if (shown(at + r)) c.runs(at + r, 1, line) })
    const visible = Math.max(top, at)
    const end = Math.min(bottom, at + canvas.height)
    if (end > visible) hit(visible, 1, width, end - visible, { kind: 'role', name: role.name, stay: true })
    if (band !== undefined && shown(at + band.row)) hit(at + band.row, 1 + band.col, band.width - 1, 1, { kind: 'key', key: 'o', role: role.name })
    const move = ([row, col]: Point): Point => [at + row, 1 + col]
    for (const one of fx.spins) if (shown(at + one.at[0])) page.spins.push({ ...one, at: move(one.at) })
    for (const one of fx.shimmers) if (shown(at + one.row)) page.shimmers.push({ ...one, row: at + one.row, col: 1 + one.col })
    for (const one of fx.sparks) if (shown(at + one.row)) page.sparks.push({ ...one, row: at + one.row, col: 1 + one.col })
    for (const one of fx.breathes) page.breathes.push({ ...one, cells: one.cells.map(move).filter(([row]) => shown(row)) })
    at += canvas.height + 1
  }

  return { maxScroll }
}

const TOC = 20
/** PLAN: the summary or the whole plan as markdown, its sections listed on the left when there is room; a click on one jumps to it. */
const planPage = ({ c, m, ui, top, bottom, hit }: PageArgs): Paged => {
  // The draft is the orchestrator's to show, in its own pane; this page says so until the plan gate opens.
  if (m.drafting !== undefined) {
    const shown = drafting(m.planPath, m.drafting.since, m.now, c.width - 2)
    const row = top + Math.max(0, Math.floor((bottom - top - shown.lines.length) / 2))
    shown.lines.forEach((line, index) => { if (row + index < bottom) c.runs(row + index, 1, line) })

    return { maxScroll: 0, spin: [row + shown.spin[0], 1 + shown.spin[1]] }
  }
  const bodyOf = (width: number) => (ui.full ? planFull(m, width) : planSummary(m, width, 'accent', true))
  // The contents column, when there is room and more than one section to list.
  const toc = c.width >= 90 && bodyOf(c.width - TOC - 4).heads.length >= 2
  const col = toc ? TOC + 3 : 1
  const width = c.width - col - 1
  const body = bodyOf(width)
  const lead: Line[] = [
    ...reflow([{ text: `${m.planPath}  ·  ${m.hash.replace(/^(sha256:.{8}).*$/, '$1')}  ·  `, tone: 'dim' }, checksOf(m), { text: `  ·  f ${t(ui.full ? 'summary' : 'full text')}`, tone: 'dim' }], width),
    [],
    ...(ui.full ? [] : [[{ text: ` ${m.title} `, ...solid('accent') }], []]),
  ]
  const lines = [...lead, ...body.lines]
  const heads = body.heads.map(head => ({ ...head, at: head.at + lead.length }))
  const room = Math.max(0, bottom - top)
  const maxScroll = Math.max(0, lines.length - room)
  const from = clampScroll(ui.scroll, maxScroll)
  lines.slice(from, from + room).forEach((line, index) => c.runs(top + index, col, line))
  if (toc) {
    const current = heads.filter(head => head.at <= from + 2).at(-1) ?? heads[0]
    c.put(top, 2, t('CONTENTS'), { tone: 'dim' })
    heads.slice(0, Math.max(0, room - 2)).forEach((head, i) => {
      const row = top + 2 + i
      c.runs(row, 1, head === current ? [{ text: '▍', tone: 'accent' }, { text: ` ${fit(head.title, TOC - 3)}`, tone: 'bright', bold: true }] : [{ text: `  ${fit(head.title, TOC - 3)}`, tone: 'dim' }])
      hit(row, 1, TOC, 1, { kind: 'scroll', to: Math.min(head.at, maxScroll) })
    })
    for (let row = top; row < bottom; row++) c.put(row, TOC + 1, '│', { tone: 'chrome' })
  }

  return { maxScroll }
}

/** Each event's kind as a glyph and a tone, so the rows that matter stand out. */
const LEVEL: Record<string, { glyph: string; tone: Tone }> = {
  'gate-open': { glyph: '◇', tone: 'warn' }, stage: { glyph: '»', tone: 'accentBright' }, dispatch: { glyph: '→', tone: 'accent' },
  up: { glyph: '▸', tone: 'accent' }, send: { glyph: '↵', tone: 'accent' }, close: { glyph: '■', tone: 'dim' }, teardown: { glyph: '■', tone: 'dim' },
  orchestrator: { glyph: '◉', tone: 'accent' }, notice: { glyph: '·', tone: 'dim' },
}
const levelOf = (e: PanelModel['log'][number]) => e.ev === 'gate-answer' ? (e.answer === 'approve' ? { glyph: '✓', tone: 'ok' as const } : { glyph: '↵', tone: 'warn' as const }) : LEVEL[e.ev] ?? { glyph: '·', tone: 'dim' as const }

const valueText = (value: unknown): string =>
  typeof value === 'string' ? (/\s/.test(value) || value === '' ? JSON.stringify(value) : value) : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
/** A value's tone by kind: yes and PASS green, no and FAIL red, shas and hashes blue, numbers cyan, paths plain. */
const valueTone = (value: unknown): Tone | undefined =>
  value === true || value === 'PASS' || value === 'approve' ? 'ok'
    : value === false || value === 'FAIL' ? 'error'
      : typeof value === 'number' ? 'cyan'
        : typeof value !== 'string' ? undefined
          : /^(sha256:)?[0-9a-f]{7,64}$/.test(value) && /\d/.test(value) ? 'accent' : value.includes('/') ? undefined : 'bright'
const fieldsOf = (e: PanelModel['log'][number]) => Object.entries(e).filter(([key]) => key !== 'at' && key !== 'by' && key !== 'ev')

/** `now`, `40s ago`, `3m ago` for the last ten minutes, else the time of day (`12:04:31`). */
const agoOf = (at: string, now: number) => {
  const seconds = (now - Date.parse(at)) / 1000
  if (seconds >= 0 && seconds < 5) return t('now')
  if (seconds >= 0 && seconds < 60) return t('{0}s ago', Math.floor(seconds))
  if (seconds >= 0 && seconds < 600) return t('{0}m ago', Math.floor(seconds / 60))
  const date = new Date(at)

  return Number.isNaN(date.getTime()) ? at.slice(11, 19) : `${clockOf(date)}:${String(date.getSeconds()).padStart(2, '0')}`
}

const LEFT_DOTS = [0x40, 0x04, 0x02, 0x01]
const RIGHT_DOTS = [0x80, 0x20, 0x10, 0x08]
/** Levels 0..1 two to a braille cell, each a column of dots, at least one. */
const braille = (levels: number[]): string => {
  let out = ''
  for (let i = 0; i + 1 < levels.length; i += 2) {
    let bits = 0
    for (let k = 0; k < Math.max(1, Math.round((levels[i] ?? 0) * 4)); k++) bits |= LEFT_DOTS[k] ?? 0
    for (let k = 0; k < Math.max(1, Math.round((levels[i + 1] ?? 0) * 4)); k++) bits |= RIGHT_DOTS[k] ?? 0
    out += String.fromCharCode(0x2800 + bits)
  }

  return out
}

/** LOG: every event, oldest first, following the newest until you scroll up; a click or Enter opens an event's fields. */
const logPage = ({ c, m, ui, top, bottom, hit, page }: PageArgs): Paged => {
  const width = c.width - 2
  const following = ui.paused === undefined
  // The strip: LIVE or paused, the event rate over the last twelve minutes, the counts.
  let at = following ? c.runs(top, 1, [{ text: '●', tone: 'ok' }, { text: ` ${t('LIVE')}`, tone: 'ok', bold: true }]) : c.runs(top, 1, [{ text: t('‖ paused'), tone: 'warn', bold: true }, { text: t(' · {0} new ↓', Math.max(0, m.log.length - (ui.paused ?? 0))), tone: 'warn' }])
  if (following) page.live = [top, 1]
  const BUCKET = 15_000
  const levels = Array.from({ length: 48 }, (_, i) => {
    const end = m.now - (47 - i) * BUCKET
    return Math.min(1, m.log.filter(e => { const t = Date.parse(e.at); return t > end - BUCKET && t <= end }).length / 3)
  })
  const counts: Line = [
    { text: plural(m.log.length, '{0} event', '{0} events') }, { text: '  ·  ', tone: 'dim' },
    { text: t('{0} waits', m.roles.filter(role => role.state === 'waits').length), tone: 'warn' }, { text: '  ·  ', tone: 'dim' },
    { text: t('{0} commits', m.roles.reduce((n, role) => n + (role.work?.commits.length ?? 0), 0)) },
  ]
  const countsAt = c.width - 1 - cellsOf(textOf(counts))
  if (countsAt > at + 1) c.runs(top, countsAt, counts)
  at = Math.max(at + 2, 22)
  if (at + 34 < countsAt) {
    at = c.put(top, at, `${t('events')} `, { tone: 'dim' })
    ;[...braille(levels)].forEach((ch, i) => c.put(top, at + i, ch, { tone: mixTone('chrome', 'accentBright', Math.max(levels[i * 2] ?? 0, levels[i * 2 + 1] ?? 0) * 1.3) }))
    c.put(top, at + 25, '12m', { tone: 'dim' })
  }
  c.put(top + 1, 1, '─'.repeat(width), { tone: 'chrome', fade: 0.6 })

  const rows: { index: number; field?: [string, unknown] }[] = []
  m.log.forEach((e, index) => {
    rows.push({ index })
    if (ui.open?.includes(index)) for (const field of fieldsOf(e)) rows.push({ index, field })
  })
  const first = top + 2
  const room = Math.max(0, bottom - first)
  const maxScroll = Math.max(0, rows.length - room)
  let from = following ? maxScroll : clampScroll(ui.scroll, maxScroll)
  // The cursor's line stays in view.
  const cursor = ui.line === undefined ? -1 : rows.findIndex(row => row.index === ui.line && row.field === undefined)
  if (cursor >= 0 && cursor < from) from = cursor
  if (cursor >= 0 && cursor >= from + room) from = Math.min(maxScroll, cursor - room + 1)
  if (m.log.length === 0) c.put(first + 2, 1, centred(t('nothing logged yet · the orchestrator writes here as it plans, dispatches and asks'), width), { tone: 'dim' })
  const laneOf = (index: number) => { const e = m.log[index]; return e === undefined ? '' : 'role' in e && typeof e.role === 'string' ? e.role : e.by }
  rows.slice(from, from + room).forEach((row, j) => {
    const r = first + j
    const e = m.log[row.index]
    if (e === undefined) return
    const lane = laneOf(row.index)
    const hue = hueOf(m, lane)
    if (row.field !== undefined) {
      const [key, value] = row.field
      c.runs(r, 1, washed(fitRuns([{ text: ' '.repeat(20) }, { text: '⎿ ', tone: 'chrome' }, { text: fit(key, 11), tone: 'dim' }, { text: valueText(value), ...(valueTone(value) && { tone: valueTone(value) }) }], width), width, 'chrome', 0.12))
      return
    }
    // A run of events from one lane hangs from its first row.
    const same = (j > 0 || from > 0) && rows[from + j - 1] !== undefined && laneOf(rows[from + j - 1]!.index) === lane && rows[from + j - 1]!.field === undefined
    const ago = agoOf(e.at, m.now)
    const recent = Date.parse(e.at) > m.now - 600_000
    const level = levelOf(e)
    const kv: Line = fieldsOf(e).flatMap(([key, value], i) => [{ text: `${i > 0 ? '  ' : ''}${key}`, tone: 'dim' as const }, { text: '=', tone: 'chrome' as const }, { text: valueText(value), ...(valueTone(value) && { tone: valueTone(value) }) }])
    const line: Line = [
      { text: '▍ ', tone: hue },
      { text: fit(ago, 10), ...(recent ? {} : { tone: 'dim' as const }) },
      { text: fit(same ? '⎿' : lane, 8), tone: same ? 'chrome' : hue },
      { text: `${level.glyph} `, tone: level.tone },
      { text: fit(e.ev, 13), tone: level.tone },
      ...kv,
    ]
    c.runs(r, 1, row.index === ui.line ? washed(fitRuns(line, width), width, 'accent', 0.16) : fitRuns(line, width))
    hit(r, 1, width, 1, { kind: 'line', index: row.index })
    page.events.push({ index: row.index, row: r, col: 1, width, tone: hue })
  })

  return { maxScroll, scroll: from }
}

export type DiffEntry = { role: RoleView; file: FileDiff; key: string; outside: boolean }
/** Every role's changed files in plan order, as the DIFF tab lists them. */
export const diffFiles = (m: PanelModel): DiffEntry[] => m.roles.flatMap(role => {
  const work = role.work
  const files = work?.files ?? work?.changed.map((path): FileDiff => ({ path, status: 'M', add: 0, del: 0, hunks: [] })) ?? []

  return files.map(file => ({ role, file, key: `${role.name}\t${file.path}`, outside: work?.outside.includes(file.path) ?? false }))
})
/** The file under the cursor: the one asked for, else the selected role's first, else the first. */
export const diffFileOf = (m: PanelModel, ui: Pick<Ui, 'file' | 'selected'>): DiffEntry | undefined => {
  const files = diffFiles(m)

  return files.find(one => one.key === ui.file) ?? files.find(one => one.role.name === ui.selected) ?? files[0]
}

const STATUS: Record<FileDiff['status'], Tone> = { M: 'warn', A: 'ok', D: 'error' }
/** `+41 −12`, with a five-cell bar of the two when asked. */
const stat = (file: { add: number; del: number }, bar: boolean): Line => {
  const runs: Line = [{ text: `+${file.add}`, tone: 'ok' }, ...(file.del > 0 ? [{ text: ` −${file.del}`, tone: 'error' as const }] : [])]
  if (!bar) return runs
  const adds = Math.round((file.add / Math.max(1, file.add + file.del)) * 5)

  return [...runs, { text: ' ' }, { text: '▪'.repeat(adds), tone: 'ok' }, { text: '▪'.repeat(5 - adds), ...(file.del > 0 ? { tone: 'error' as const } : { tone: 'chrome' as const, fade: 0.5 }) }]
}
/** Why a role has nothing in the list. */
const noFilesOf = (role: RoleView) =>
  role.touches.length === 0 ? t('changes nothing') : role.state === 'planned' ? t('not started · {0}', startOf(role)) : role.work === undefined ? t('no work read yet') : t('no changes yet')

/** A role's commits, newest first, the sha as a chip. */
const commitLines = (role: RoleView, width: number): Line[] =>
  (role.work?.commits ?? []).map(commit => [{ text: ` ${commit.sha} `, tone: 'accentBright', bg: 'accent', wash: 0.18 }, { text: ` ${fit(commit.subject, Math.max(0, width - commit.sha.length - 3))}` }])

/** The file's change the way delta draws it: line numbers, red and green washes, the changed words brighter; and where each row's change is. */
const hunkLines = (entry: DiffEntry, width: number, problem: string | undefined): { lines: Line[]; marks: ('+' | '-' | '±' | '')[] } => {
  const { file, outside } = entry
  const lines: Line[] = [fitRuns([
    { text: '▍', tone: STATUS[file.status] }, { text: ` ${file.status} `, tone: STATUS[file.status], bold: true },
    { text: file.path, tone: outside ? 'error' : 'bright', bold: true }, { text: '  ' }, ...stat(file, false),
    ...(outside ? [{ text: '  ' }, { text: ` ${t('✗ outside touches')} `, tone: 'error' as const, bg: 'error' as const, wash: 0.16 }] : []),
  ], width), []]
  const marks: ('+' | '-' | '±' | '')[] = []
  const say = (text: string) => lines.push([{ text: centred(text, width), tone: 'dim' }])
  if (file.hunks.length === 0) {
    say(problem !== undefined ? t('the diff could not be read · {0}', problem) : t(file.binary ? 'binary file' : file.cut ? 'new file, too large to show' : entry.role.work?.files === undefined ? 'no hunks read yet' : 'no line changes'))
    return { lines, marks }
  }
  const digits = Math.max(3, String(Math.max(...file.hunks.flatMap(hunk => hunk.lines.map(line => Math.max(line.old ?? 0, line.new ?? 0))))).length)
  for (const hunk of file.hunks) {
    lines.push(washed(fitRuns([{ text: ` ${hunk.head}`, tone: 'accent' }], width), width, 'accent', 0.08))
    marks.push('')
    const pairs = pairsOf(hunk.lines)
    const partner = new Map([...pairs].map(([a, b]) => [b, a]))
    hunk.lines.forEach((line, i) => {
      const text = line.text.replace(/\t/g, '  ')
      const number: Run = { text: `${String(line.old ?? '').padStart(digits)} ${String(line.new ?? '').padStart(digits)} `, tone: 'dim', fade: 0.6 }
      const sign: Run = line.sign === '-' ? { text: '- ', tone: 'error' } : line.sign === '+' ? { text: '+ ', tone: 'ok' } : { text: '  ' }
      const other = line.sign === '-' ? pairs.get(i) : line.sign === '+' ? partner.get(i) : undefined
      const pieces = other === undefined ? undefined : line.sign === '-' ? wordDiff(text, (hunk.lines[other]?.text ?? '').replace(/\t/g, '  '))?.[0] : wordDiff((hunk.lines[other]?.text ?? '').replace(/\t/g, '  '), text)?.[1]
      const strong: Style = line.sign === '-' ? { tone: 'bright', bg: 'error', wash: 0.38 } : { tone: 'bright', bg: 'ok', wash: 0.34 }
      const body: Line = pieces === undefined ? [{ text, ...(line.sign === ' ' && { tone: 'dim' as const }) }] : pieces.map(piece => (piece.changed ? { text: piece.text, ...strong } : { text: piece.text }))
      const row = fitRuns([number, sign, ...body], width)
      lines.push(line.sign === ' ' ? row : washed(row, width, line.sign === '-' ? 'error' : 'ok', line.sign === '-' ? 0.13 : 0.12))
      marks.push(line.sign === ' ' ? '' : line.sign)
    })
  }
  if (file.cut) say(t('… more lines than the panel keeps'))

  return { lines, marks }
}

/** A column beside the hunks: each cell a stretch of them, ┃ red or green where it changes, its window brighter. */
const minimap = (c: Canvas, col: number, top: number, height: number, marks: ('+' | '-' | '±' | '')[], seen: [number, number]) => {
  if (marks.length === 0 || height <= 0) return
  const rows = Math.min(height, marks.length)
  for (let i = 0; i < rows; i++) {
    const lo = Math.floor((i * marks.length) / rows)
    const hi = Math.max(lo + 1, Math.floor(((i + 1) * marks.length) / rows))
    const part = marks.slice(lo, hi)
    const adds = part.includes('+')
    const dels = part.includes('-')
    const inView = hi > seen[0] && lo < seen[1]
    if (adds || dels) c.put(top + i, col, '┃', { tone: adds && dels ? 'warn' : adds ? 'ok' : 'error' })
    else c.put(top + i, col, '│', inView ? { tone: 'chrome' } : { tone: 'chrome', fade: 0.4 })
  }
}

const TREE = 38
/** DIFF: each role's changed files as a tree on the left, the selected file's commits and hunks on the right; stacked when narrow. */
const diffPage = ({ c, m, ui, top, bottom, hit }: PageArgs): Paged => {
  const room = Math.max(0, bottom - top)
  const files = diffFiles(m)
  const current = diffFileOf(m, ui)
  const tree = c.width >= 80
  if (tree) {
    // The tree, scrolled so the file under the cursor shows.
    const left: { line: Line; key?: string; role?: string }[] = []
    for (const role of m.roles) {
      const mine = files.filter(one => one.role === role)
      const total = { add: mine.reduce((n, one) => n + one.file.add, 0), del: mine.reduce((n, one) => n + one.file.del, 0) }
      const sum = mine.length > 0 ? stat(total, false) : []
      left.push({ line: [badge(role), { text: ' ' }, { text: fit(role.name, TREE - 3 - cellsOf(textOf(sum))), tone: 'bright', bold: true }, ...sum], role: role.name })
      if (mine.length === 0) left.push({ line: [{ text: `  ${fit(noFilesOf(role), TREE - 2)}`, tone: 'dim' }] })
      const dirs = [...new Set(mine.map(one => one.file.path.slice(0, one.file.path.lastIndexOf('/') + 1)))]
      for (const dir of dirs) {
        if (dir !== '') left.push({ line: [{ text: `  ${fit(dir, TREE - 2)}`, tone: 'dim' }] })
        const inDir = mine.filter(one => one.file.path.slice(0, one.file.path.lastIndexOf('/') + 1) === dir)
        inDir.forEach((one, k) => {
          const selected = one.key === current?.key
          const bar = stat(one.file, true)
          const name = one.file.path.slice(dir.length)
          const line: Line = [
            { text: selected ? '▸' : ' ', tone: 'accent' }, { text: '  ' }, { text: k === inDir.length - 1 ? '└ ' : '├ ', tone: 'chrome' },
            { text: `${one.file.status} `, tone: STATUS[one.file.status], bold: true },
            { text: fit(name, TREE - 10 - cellsOf(textOf(bar))), ...(one.outside ? { tone: 'error' as const } : selected ? { tone: 'bright' as const, bold: true as const } : {}) },
            { text: one.outside ? '✗ ' : '  ', tone: 'error' }, ...bar,
          ]
          left.push({ line: selected ? washed(fitRuns(line, TREE), TREE, 'accent', 0.18) : line, key: one.key, role: one.role.name })
        })
      }
      left.push({ line: [] })
    }
    const at = left.findIndex(one => one.key !== undefined && one.key === current?.key)
    const leftFrom = at < room - 1 ? 0 : Math.min(at - room + 2, Math.max(0, left.length - room))
    left.slice(leftFrom, leftFrom + room).forEach((one, j) => {
      c.runs(top + j, 1, one.line)
      if (one.key !== undefined && one.role !== undefined) hit(top + j, 1, TREE, 1, { kind: 'file', key: one.key, role: one.role })
    })
    for (let row = top; row < bottom; row++) c.put(row, TREE + 1, '│', { tone: 'chrome' })
  }
  const col = tree ? TREE + 3 : 1
  const width = c.width - col - 1
  if (current === undefined) {
    c.put(top + Math.floor(room / 3), col, centred(t('nothing changed yet · files show up here as roles commit'), width), { tone: 'dim' })
    return { maxScroll: 0 }
  }
  // Narrow: the role, its files as a list, then the file under the cursor.
  const head: { line: Line; key?: string }[] = []
  if (!tree) {
    head.push({ line: [badge(current.role), { text: ` ${current.role.name}`, tone: 'bright', bold: true }, { text: `  ·  ${current.role.branch}`, tone: 'dim' }] }, { line: [] })
    for (const one of files.filter(entry => entry.role === current.role)) {
      const line: Line = [{ text: one.key === current.key ? '▸ ' : '  ', tone: 'accent' }, { text: `${one.file.status} `, tone: STATUS[one.file.status], bold: true }, { text: fit(one.file.path, Math.max(8, width - 18)), ...(one.outside && { tone: 'error' as const }) }, { text: one.outside ? '✗ ' : '  ', tone: 'error' }, ...stat(one.file, true)]
      head.push({ line: one.key === current.key ? washed(fitRuns(line, width), width, 'accent', 0.18) : line, key: one.key })
    }
    head.push({ line: [] })
  }
  const commits = commitLines(current.role, width)
  const minimapOn = current.file.hunks.length > 0
  const hunks = hunkLines(current, minimapOn ? width - 2 : width, current.role.work?.diffProblem)
  const lines = [...head.map(one => one.line), ...commits, ...(commits.length > 0 ? [[]] : []), ...hunks.lines]
  const maxScroll = Math.max(0, lines.length - room)
  const from = clampScroll(ui.scroll, maxScroll)
  lines.slice(from, from + room).forEach((line, j) => c.runs(top + j, col, line))
  head.forEach((one, i) => { if (one.key !== undefined && i >= from && i < from + room) hit(top + i - from, col, width, 1, { kind: 'file', key: one.key, role: current.role.name }) })
  if (minimapOn) {
    // From the first hunk's row, or the top once it has scrolled past, to the bottom.
    const start = lines.length - hunks.marks.length
    const row = top + Math.max(0, start - from)
    minimap(c, c.width - 2, row, bottom - row, hunks.marks, [from - start, from + room - start])
  }

  return { maxScroll }
}

/** The pages other than MISSION use the whole width. */
const other = (c: Canvas, m: PanelModel, ui: Ui, top: number, bottom: number, hit: HitFn, scene: Scene): Paged => {
  const page: Page = { spins: [], shimmers: [], breathes: [], sparks: [], events: [] }
  scene.page = page
  const args = { c, m, ui, top, bottom, hit, page }

  return ui.tab === 2 ? rolesPage(args) : ui.tab === 3 ? planPage(args) : ui.tab === 4 ? logPage(args) : diffPage(args)
}

/** Key hints for each page, keys bright and what they do dim; an open gate's keys first. */
const HINTS: Record<number, [string, Phrase][]> = {
  2: [['↑↓', 'role'], ['⏎', 'detail'], ['o', 'open window'], ['s', 'send']],
  3: [['↑↓', 'scroll'], ['f', 'full text']],
  4: [['↑↓', 'line'], ['⏎', 'expand'], ['G', 'follow']],
  5: [['↑↓', 'file'], ['PgUp PgDn', 'scroll'], ['o', 'open window']],
}
const hints = (m: PanelModel, ui: Ui, width: number): Line => {
  const keys = [...(m.gate === undefined ? [] : [['a', 'approve'], ['c', 'change']] as [string, Phrase][]), ...(ui.tab === 3 && m.drafting !== undefined ? [] : HINTS[ui.tab] ?? []).map(([key, what]): [string, Phrase] => (key === 'f' && ui.full ? [key, 'summary'] : [key, what]))]
  const left: Line = [{ text: ' ' }, ...keys.flatMap(([key, what]): Line => [{ text: key, tone: 'accentBright', bold: true }, { text: ` ${t(what)}   `, tone: 'dim' }])]
  const right: Line = [{ text: '1-5', tone: 'accentBright', bold: true }, { text: ` ${t('tabs')}   `, tone: 'dim' }, { text: '?', tone: 'accentBright', bold: true }, { text: ` ${t('help')} `, tone: 'dim' }]
  const room = width - cellsOf(textOf(right))

  return cellsOf(textOf(left)) <= room ? [...fitRuns(left, room), ...right] : fitRuns(left, width)
}
