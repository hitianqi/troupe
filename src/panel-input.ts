import type { Hit, Ui } from './draw.ts'
import type { PanelModel } from './model.ts'

export type Input = { kind: 'key'; key: string } | { kind: 'text'; text: string } | { kind: 'click'; row: number; col: number } | { kind: 'scroll'; by: number }
export type GateTarget = { id: string; isPlan: boolean; hash: string; stamp: string }
export type Effect = { kind: 'open'; role: string } | { kind: 'send'; role: string; text: string } | { kind: 'answer'; gate: GateTarget; answer: 'approve' | 'change'; text?: string }
type Entry = { label: string; text: string } & ({ kind: 'send'; role: string } | { kind: 'change'; gate: GateTarget })
export type PanelUi = Omit<Ui, 'input'> & { input?: Entry }
export const initialUi = (): PanelUi => ({ tab: 1, selected: '', scroll: 0 })

const SEQUENCES: [string, string][] = [
  ['\x1b[A', 'up'], ['\x1bOA', 'up'], ['\x1b[B', 'down'], ['\x1bOB', 'down'],
  ['\x1b[5~', 'pageUp'], ['\x1b[6~', 'pageDown'],
]
const PASTE = '\x1b[200~'
const END_PASTE = '\x1b[201~'

/** Incomplete escape/mouse/paste packets stay in rest for the next read. */
export const parseInput = (input: string): { actions: Input[]; rest: string } => {
  const actions: Input[] = []
  let rest = input
  while (rest !== '') {
    if (rest.startsWith(PASTE)) {
      const end = rest.indexOf(END_PASTE, PASTE.length)
      if (end === -1) break
      actions.push({ kind: 'text', text: rest.slice(PASTE.length, end) })
      rest = rest.slice(end + END_PASTE.length)
      continue
    }
    const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest)
    if (mouse !== null) {
      const button = Number(mouse[1])
      const col = Number(mouse[2]) - 1
      const row = Number(mouse[3]) - 1
      if (mouse[4] === 'M' && Number.isSafeInteger(row) && Number.isSafeInteger(col) && row >= 0 && col >= 0) {
        if ((button & 64) !== 0) actions.push({ kind: 'scroll', by: (button & 1) === 0 ? -3 : 3 })
        else if ((button & 35) === 0) actions.push({ kind: 'click', row, col })
      }
      rest = rest.slice(mouse[0].length)
      continue
    }
    const sequence = SEQUENCES.find(([text]) => rest.startsWith(text))
    if (sequence !== undefined) {
      actions.push({ kind: 'key', key: sequence[1] })
      rest = rest.slice(sequence[0].length)
      continue
    }
    if (rest.startsWith('\x1b')) {
      if ([...SEQUENCES.map(([text]) => text), PASTE].some(text => text.startsWith(rest)) || /^\x1b\[[0-?]*[ -/]*$/.test(rest)) break
      const csi = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(rest)
      rest = rest.slice(csi?.[0].length ?? 2)
      continue
    }
    const char = String.fromCodePoint(rest.codePointAt(0) ?? 0)
    rest = rest.slice(char.length)
    const key = char === '\x03' ? 'quit' : char === '\r' || char === '\n' ? 'enter' : char === '\t' ? 'tab' : char === '\x7f' || char === '\b' ? 'backspace' : char
    if (char === '\r' && rest.startsWith('\n')) rest = rest.slice(1)
    if (key !== char || char >= ' ') actions.push({ kind: 'key', key })
  }

  return { actions, rest }
}

export const hitAt = (hits: Hit[], row: number, col: number) =>
  [...hits].reverse().find(hit => row >= hit.row && row < hit.row + hit.height && col >= hit.col && col < hit.col + hit.width)?.target

export const gateTarget = (model: PanelModel): GateTarget | undefined => {
  const gate = model.gate
  if (gate === undefined) return undefined
  const latest = [...model.log].reverse().find(e => (e.ev === 'gate-open' || e.ev === 'gate-answer') && e.gate === gate.id)

  return { id: gate.id, isPlan: gate.isPlan, hash: model.hash, stamp: JSON.stringify(latest) ?? '' }
}

const typed = (text: string): string => text.replace(/[\r\n]+/g, ' ').replace(/[\x00-\x1f\x7f-\x9f]/g, '')
export const transition = (ui: PanelUi, action: Input, model: PanelModel | undefined, hits: Hit[], height: number, maxScroll: number): { ui: PanelUi; effect?: Effect; quit?: true } => {
  if (action.kind === 'key' && action.key === 'quit') return { ui, quit: true }
  if (ui.input !== undefined) {
    if (action.kind === 'text') return { ui: { ...ui, input: { ...ui.input, text: ui.input.text + typed(action.text) } } }
    if (action.kind !== 'key') return { ui }
    if (action.key === 'escape') return { ui: { ...ui, input: undefined } }
    if (action.key === 'backspace') return { ui: { ...ui, input: { ...ui.input, text: [...ui.input.text].slice(0, -1).join('') } } }
    if (action.key === 'enter') {
      if (ui.input.text.trim() === '') return { ui: { ...ui, message: 'Enter some text, or Esc to cancel.' } }
      const effect: Effect = ui.input.kind === 'send'
        ? { kind: 'send', role: ui.input.role, text: ui.input.text }
        : { kind: 'answer', gate: ui.input.gate, answer: 'change', text: ui.input.text }

      return { ui: { ...ui, input: undefined }, effect }
    }
    return { ui: [...action.key].length === 1 ? { ...ui, input: { ...ui.input, text: ui.input.text + typed(action.key) } } : ui }
  }
  if (ui.help) return { ui: action.kind === 'key' && ['escape', '?'].includes(action.key) ? { ...ui, help: false } : ui, ...(action.kind === 'key' && action.key === 'q' ? { quit: true as const } : {}) }
  if (action.kind === 'key' && action.key === 'q') return { ui, quit: true }
  if (model === undefined) return { ui }
  if (action.kind === 'click') {
    const target = action.row < height ? hitAt(hits, action.row, action.col) : undefined
    if (target?.kind === 'key') {
      const selected = target.role !== undefined && model.roles.some(role => role.name === target.role) ? { ...ui, selected: target.role } : ui

      return transition(selected, { kind: 'key', key: target.key }, model, hits, height, maxScroll)
    }
    if (target?.kind === 'tab') return { ui: { ...ui, tab: target.tab, scroll: 0 } }
    if (target?.kind === 'role' && model.roles.some(role => role.name === target.name)) return { ui: { ...ui, selected: target.name, tab: 1, scroll: 0 } }

    return { ui }
  }
  if (action.kind === 'text') return { ui }
  const by = action.kind === 'scroll' ? action.by : action.key === 'pageUp' ? -Math.max(1, height - 10) : action.key === 'pageDown' ? Math.max(1, height - 10) : 0
  if (by !== 0) return { ui: { ...ui, scroll: Math.max(0, Math.min(maxScroll, (ui.scroll ?? 0) + by)) } }
  if (action.kind !== 'key') return { ui }
  const { key } = action
  const selected = model.roles.find(role => role.name === ui.selected) ?? model.roles[0]
  if (['up', 'down', 'j', 'k'].includes(key)) {
    const at = model.roles.findIndex(role => role.name === selected?.name)
    const to = Math.max(0, Math.min(model.roles.length - 1, at + (key === 'up' || key === 'k' ? -1 : 1)))

    return { ui: { ...ui, selected: model.roles[to]?.name ?? '' } }
  }
  const tab = /^[1-5]$/.test(key) ? Number(key) : key === 'tab' ? ui.tab % 5 + 1 : key === 'd' ? 5 : key === 'v' ? 3 : key === 'enter' ? 1 : undefined
  if (tab !== undefined) return { ui: { ...ui, tab, scroll: 0 } }
  if (key === '?') return { ui: { ...ui, help: true } }
  if (key === 'f' && ui.tab === 3) return { ui: { ...ui, full: !ui.full, scroll: 0 } }
  if (key === 'escape') return { ui: { ...ui, message: undefined } }
  if (key === 'o' && selected !== undefined) return { ui, effect: { kind: 'open', role: selected.name } }
  if (key === 's' && selected !== undefined) return { ui: selected.state === 'waits'
    ? { ...ui, message: 'answer it first' }
    : { ...ui, input: { kind: 'send', role: selected.name, label: `send to ${selected.name}`, text: '' }, message: undefined } }
  const gate = gateTarget(model)
  if ((key === 'a' || key === 'c') && gate !== undefined) {
    if (key === 'c') return { ui: { ...ui, input: { kind: 'change', gate, label: 'change', text: '' }, message: undefined } }

    return { ui, effect: { kind: 'answer', gate, answer: 'approve' } }
  }

  return { ui }
}
