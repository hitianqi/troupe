import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// The mission's run log: <git-common-dir>/troupe/<mission>/log.jsonl, one
// JSON object per line, appended by the CLI and the panel only. It holds what
// only the moment of action knows (the pane a role opened in, the argv, gate
// questions and answers, the stage); what goes stale (working, waits on you)
// is read live instead. Facts only: fold() derives the rest.

export type GateAnswer = 'approve' | 'change'
export type Event =
  | { ev: 'gate-open'; gate: string; ask?: string; plan?: string }
  | { ev: 'gate-answer'; gate: string; answer: GateAnswer; text?: string; plan?: string }
  | { ev: 'stage'; stage: string }
  | { ev: 'dispatch'; role: string; session: string; window: string; pane: string; worktree: string; branch: string; base: string; argv: string[] }
  | { ev: 'send'; role: string; text: string }
  | { ev: 'close'; role: string }
/** Who wrote a line: what the writer says, not a proof. */
export type By = 'cli' | 'panel' | 'orch'
export type Logged = Event & { at: string; by: By }

/** The plan gate: the one gate the core owns, because dispatch depends on it. */
export const PLAN_GATE = 'plan'

export const logPath = (commonDir: string, mission: string): string => join(commonDir, 'troupe', mission, 'log.jsonl')

/** Appends one event, stamped; one write per line, so the CLI and the panel can append at once. */
export const append = (path: string, by: By, event: Event, at = new Date()): Logged => {
  const line: Logged = { at: at.toISOString(), by, ...event }
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(line)}\n`)

  return line
}

const EVENTS = ['gate-open', 'gate-answer', 'stage', 'dispatch', 'send', 'close']

/** The log's events, and how many lines could not be read (a torn last line, a hand edit). */
export const readLog = (path: string): { events: Logged[]; unread: number } => {
  if (!existsSync(path)) return { events: [], unread: 0 }
  const events: Logged[] = []
  let unread = 0
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    try {
      const one: unknown = JSON.parse(line)
      if (typeof one === 'object' && one !== null && EVENTS.includes((one as { ev?: string }).ev ?? '')) events.push(one as Logged)
      else unread += 1
    } catch {
      unread += 1
    }
  }

  return { events, unread }
}

export type Gate = { id: string; ask: string; openedAt: string; answer?: GateAnswer; text?: string; plan?: string; answeredAt?: string }
export type Opened = Extract<Event, { ev: 'dispatch' }> & { at: string; sends: number; closed: boolean }
export type Folded = {
  /** The stage the orchestrator last named, '' before any. */
  stage: string
  /** Each gate by id as it stands now: a gate opened again starts unanswered. */
  gates: Map<string, Gate>
  /** Each role troupe opened, by name: its last dispatch. */
  roles: Map<string, Opened>
  /** The hash of the plan as last approved at the plan gate, '' for none. */
  approved: string
}

export const fold = (events: Logged[]): Folded => {
  const out: Folded = { stage: '', gates: new Map(), roles: new Map(), approved: '' }
  for (const e of events) {
    if (e.ev === 'stage') out.stage = e.stage
    else if (e.ev === 'gate-open') out.gates.set(e.gate, { id: e.gate, ask: e.ask ?? '', openedAt: e.at, ...(e.plan === undefined ? {} : { plan: e.plan }) })
    else if (e.ev === 'gate-answer') {
      const gate = out.gates.get(e.gate) ?? { id: e.gate, ask: '', openedAt: e.at }
      out.gates.set(e.gate, { ...gate, answer: e.answer, answeredAt: e.at, ...(e.text === undefined ? {} : { text: e.text }), ...(e.plan === undefined ? {} : { plan: e.plan }) })
      // A change asks for another plan: the approval it answered no longer holds.
      if (e.gate === PLAN_GATE) out.approved = e.answer === 'approve' ? (e.plan ?? '') : ''
    } else if (e.ev === 'dispatch') {
      const { at, by: _by, ...dispatch } = e
      out.roles.set(e.role, { ...dispatch, at, sends: 0, closed: false })
    } else {
      const role = out.roles.get(e.role)
      if (role !== undefined && e.ev === 'send') role.sends += 1
      if (role !== undefined && e.ev === 'close') role.closed = true
    }
  }

  return out
}

/** Whether the plan, hashed as it is now, is the one approved: a changed plan asks again. */
export const isApproved = (folded: Folded, hash: string): boolean => folded.approved !== '' && folded.approved === hash
