import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { claudeActivity } from './activity.ts'
import { mux } from './command-context.ts'
import type { Mission, Repository, Runtime } from './command-context.ts'
import { append, fold, logPath, orchestratorOf, readLog } from './log.ts'
import type { Logged, Orchestrator } from './log.ts'
import { afterApproval } from './orchestrator.ts'
import { callerPane } from './panes.ts'
import { turnOf } from './role-commands.ts'
import { RESULT_FILE, readResult } from './state.ts'
import { tmux } from './run.ts'
import { claudeSessionTurn, codexThreadTurn } from './usage.ts'
import type { TurnAt } from './usage.ts'

// Notices (#43, #53): troupe types a line into the orchestrator when a role finishes, a gate is answered, or the
// person answers a role's wait in its window, so the orchestrator never polls. Who the orchestrator is, where it runs and what was already said live in the run log;
// whether it can take a line comes from its own transcript (Claude) or session log (Codex), never its screen.

export type Harness = 'claude' | 'codex'
export type Mux = 'tmux' | 'herdr'
type Notice = { key: string; text: string }

/** The pids above this process, nearest first, with their command names. */
const ancestors = (r: Runtime): { pid: number; comm: string }[] => {
  const found: { pid: number; comm: string }[] = []
  let pid = r.pid
  for (let hop = 0; hop < 32 && pid > 1; hop += 1) {
    const row = r.run('ps', ['-o', 'ppid=,comm=', '-p', String(pid)])
    const match = row.code === 0 ? /^\s*(\d+)\s+(.*)$/.exec(row.out.trim()) : null
    if (match === null) break
    pid = Number(match[1])
    found.push({ pid, comm: (match[2] ?? '').trim() })
  }

  return found
}

/**
 * The agent session this command runs inside. Its variables alone could be stale (a tmux server keeps the
 * environment of the shell that started it), so the agent must also be an ancestor of this process.
 */
export const agentSession = (r: Runtime): { harness: Harness; session: string } | undefined => {
  const chain = ancestors(r)
  const claude = r.env.CLAUDE_CODE_SESSION_ID && r.env.CLAUDE_PID ? chain.findIndex(one => String(one.pid) === r.env.CLAUDE_PID) : -1
  const codex = r.env.CODEX_THREAD_ID ? chain.findIndex(one => one.comm === 'codex' || one.comm.endsWith('/codex')) : -1
  if (claude < 0 && codex < 0) return undefined
  if (codex < 0 || (claude >= 0 && claude < codex)) return { harness: 'claude', session: r.env.CLAUDE_CODE_SESSION_ID ?? '' }

  return { harness: 'codex', session: r.env.CODEX_THREAD_ID ?? '' }
}

/** Where to type to this command's agent: its tmux pane, found exactly, else its herdr pane. */
export const callerTarget = (r: Runtime): { mux: Mux; pane: string } | undefined => {
  const pane = callerPane(r)
  if (pane !== undefined) return { mux: 'tmux', pane }
  if (r.env.HERDR_ENV === '1' && r.env.HERDR_PANE_ID) return { mux: 'herdr', pane: r.env.HERDR_PANE_ID }

  return undefined
}

/** Records the agent running this command as the mission's orchestrator, when it is one and has changed. */
export const recordOrchestrator = (r: Runtime, repo: Repository, name: string): void => {
  try {
    if (name === '' || !relative(join(repo.root, '.troupe/worktrees'), r.cwd).startsWith('..')) return
    const session = agentSession(r)
    const target = session === undefined ? undefined : callerTarget(r)
    if (session === undefined || target === undefined || session.session === '') return
    const log = logPath(repo.common, name)
    const last = orchestratorOf(readLog(log).events)
    if (last?.harness === session.harness && last.session === session.session && last.mux === target.mux && last.pane === target.pane) return
    append(log, 'cli', { ev: 'orchestrator', ...session, ...target })
  } catch { /* A command never fails over its notices. */ }
}

const said = (events: Logged[]): Set<string> => new Set(events.flatMap(e => e.ev === 'notice' ? [e.key] : []))

const writtenAt = (path: string): { bytes: string; at: number } | undefined => {
  try { return { bytes: readFileSync(path, 'utf8'), at: statSync(path).mtimeMs } } catch { return undefined }
}

/** What the orchestrator has not been told yet: gate answers made in the panel, oldest first, then for each role its answered waits and its finish. */
export const pendingNotices = (r: Runtime, m: Mission, events: Logged[], since: string): Notice[] => {
  const told = said(events)
  const folded = fold(events)
  const notices: Notice[] = []
  for (const e of events) {
    if (e.ev !== 'gate-answer' || e.by !== 'panel' || e.at < since) continue
    const gate = folded.gates.get(e.gate)
    // A gate opened again since, or a plan that changed since its answer, has nothing to report.
    if (gate?.answeredAt !== e.at || (e.gate === 'plan' && gate.plan !== m.hash)) continue
    const key = `gate:${e.gate}:${e.at}`
    if (!told.has(key)) notices.push({ key, text: e.answer === 'approve' ? `${e.gate} approved in the panel. ${afterApproval(e.gate, m.name)}` : `Change requested on ${e.gate}: ${e.text ?? ''}` })
  }
  for (const [name, opened] of folded.roles) {
    if (opened.closed) continue
    const agent = m.agents[opened.agent ?? '']
    const result = readResult(opened.worktree)
    const path = join(opened.worktree, RESULT_FILE)
    const written = writtenAt(path)
    const finished = result !== undefined && result.status !== '' && written !== undefined
    const activity = agent?.usage === 'claude' ? claudeActivity(opened.worktree, opened.at, r.home) : undefined
    // Each wait the person answered in the role's window, oldest first, until told; a finish told or work sent
    // since, or a result written since, makes it old news.
    const superseded = events.filter(e => e.ev === 'send' && e.role === name || e.ev === 'notice' && e.key.startsWith(`role:${name}:`)).at(-1)?.at
    for (const answer of activity?.answers ?? []) {
      if (answer.at < since || (superseded !== undefined && superseded > answer.at) || (written !== undefined && written.at > Date.parse(answer.at))) continue
      const key = `answer:${name}:${answer.at}`
      if (!told.has(key)) notices.push({ key, text: answer.then === 'working' ? `Role ${name} was answered in its window and went on working.` : `Role ${name} was stopped in its window: its dialog was denied or interrupted, and its turn ended.` })
    }
    if (!finished) continue
    // The role's own report that its turn ended; an adapter that reports nothing has only its result.
    const turn = activity?.turn ?? (agent?.usage === undefined ? undefined : turnOf(r, agent, opened, ''))
    if (turn !== undefined && turn !== 'ready') continue
    const key = `role:${name}:${createHash('sha256').update(written.bytes).digest('hex').slice(0, 16)}`
    if (!told.has(key)) notices.push({ key, text: `Role ${name} finished: ${result.status}: ${result.summary}. Its result is ${path}.` })
  }

  return notices.map(one => ({ ...one, text: one.text.replace(/\s+/g, ' ').trim() }))
}

const turnOfOrchestrator = (r: Runtime, o: Orchestrator): TurnAt | undefined =>
  o.harness === 'claude' ? claudeSessionTurn(o.session, r.home) : codexThreadTurn(o.session, r.home)

const typeInto = (r: Runtime, o: Orchestrator, text: string): boolean => {
  if (o.mux === 'herdr') {
    if (r.run('herdr', ['pane', 'get', o.pane], { env: r.env }).code !== 0) return false
    // `pane run` types the line and submits it as one action; text then a separate Enter can lose the Enter.

    return r.run('herdr', ['pane', 'run', o.pane, text], { env: r.env }).code === 0
  }
  if (tmux(['display', '-p', '-t', o.pane, '#{pane_dead}'], r.run, r.env).out.trim() !== '0') return false
  const buffer = `troupe-notice-${randomUUID()}`
  try {
    mux(r, ['load-buffer', '-b', buffer, '-'], { input: text })
    mux(r, ['paste-buffer', '-p', '-d', '-b', buffer, '-t', o.pane])
    mux(r, ['send-keys', '-t', o.pane, 'Enter'])

    return true
  } finally {
    tmux(['delete-buffer', '-b', buffer], r.run, r.env)
  }
}

/**
 * Types the oldest pending notice into the orchestrator once it has finished a turn since the last one troupe
 * typed (a turn in progress may hold a permission dialog, which keystrokes would answer). One per call; the
 * panel calls this as it refreshes. Each notice is logged once delivered, so a restart neither drops nor repeats it.
 */
export const deliverNotices = (r: Runtime, m: Mission): void => {
  try {
    const events = readLog(m.log).events
    const o = orchestratorOf(events)
    if (o === undefined) return
    const next = pendingNotices(r, m, events, o.at)[0]
    if (next === undefined) return
    const turn = turnOfOrchestrator(r, o)
    const lastNotice = events.filter(e => e.ev === 'notice').at(-1)?.at
    if (turn?.turn !== 'ready' || (lastNotice !== undefined && turn.at <= Date.parse(lastNotice))) return
    if (typeInto(r, o, next.text)) append(m.log, 'panel', { ev: 'notice', key: next.key, text: next.text })
  } catch { /* An unavailable orchestrator must not stop the panel; the notice stays pending. */ }
}
