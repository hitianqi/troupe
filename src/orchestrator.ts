import { randomUUID } from 'node:crypto'

import { AGENTS, screenOf } from './agents.ts'
import { mux } from './command-context.ts'
import type { Mission, Runtime } from './command-context.ts'
import { fold, readLog } from './log.ts'
import type { Logged } from './log.ts'
import { tmux } from './run.ts'
import { afterMrApproval } from './gate-message.ts'

type Target = { pane: string; token: string }
type Notice = { gate: string; at: string; text: string; target: Target }
const pending = new WeakMap<Runtime, Map<string, Notice>>()

export const markOrchestrator = (r: Runtime, root: string, pane: string): void => {
  if (targets(r, root).some(one => one.pane === pane)) return
  mux(r, ['set-option', '-p', '-t', pane, '@troupe-orchestrator', root])
  mux(r, ['set-option', '-p', '-t', pane, '@troupe-orchestrator-token', randomUUID()])
}

const targets = (r: Runtime, root: string): Target[] => {
  const found = tmux(['list-panes', '-a', '-F', '#{pane_id}\t#{pane_dead}\t#{@troupe-orchestrator}\t#{@troupe-orchestrator-token}'], r.run, r.env)
  if (found.code !== 0) return []

  return found.out.split('\n').flatMap(line => {
    const [pane = '', dead, marked, token = ''] = line.split('\t')

    return /^%\d+$/.test(pane) && dead === '0' && marked === root && token ? [{ pane, token }] : []
  })
}

/** Only answers made in this panel process are queued; the log remains authoritative. */
export const queueAnswer = (r: Runtime, m: Mission, answer: Logged): void => {
  if (answer.ev !== 'gate-answer') return
  const found = targets(r, m.root)
  if (found.length !== 1) return
  const queue = pending.get(r) ?? new Map<string, Notice>()
  queue.set(`${m.log}\0${answer.gate}`, { gate: answer.gate, at: answer.at, target: found[0]!,
    text: (answer.answer === 'approve' ? `${answer.gate} approved in the panel. ${answer.gate === 'mr-ok' ? afterMrApproval(m.name) : 'Continue the mission.'}` : `Change requested on ${answer.gate}: ${answer.text ?? ''}`).replace(/\s+/g, ' ').trim() })
  pending.set(r, queue)
  flushAnswers(r, m)
}

export const flushAnswers = (r: Runtime, m: Mission): void => {
  const queue = pending.get(r)
  if (queue === undefined || queue.size === 0) return
  const gates = fold(readLog(m.log).events).gates
  for (const [key, notice] of queue) {
    if (!key.startsWith(`${m.log}\0`)) continue
    const gate = gates.get(notice.gate)
    if (gate?.answeredAt !== notice.at || (gate.id === 'plan' && gate.plan !== m.hash)) { queue.delete(key); continue }
    const ready = () => {
      if (!targets(r, m.root).some(one => one.pane === notice.target.pane && one.token === notice.target.token)) return false
      const screen = tmux(['capture-pane', '-p', '-t', notice.target.pane], r.run, r.env)

      return screen.code === 0 && Object.values(AGENTS).some(agent => screenOf(agent, screen.out) === 'ready')
    }
    const buffer = `troupe-answer-${randomUUID()}`
    let loaded = false
    try {
      if (!ready()) continue
      mux(r, ['load-buffer', '-b', buffer, '-'], { input: notice.text })
      loaded = true
      if (!ready()) continue
      mux(r, ['paste-buffer', '-p', '-d', '-b', buffer, '-t', notice.target.pane])
      queue.delete(key)
      mux(r, ['send-keys', '-t', notice.target.pane, 'Enter'])
    } catch { /* An unavailable agent must not undo a recorded answer. */ }
    finally { if (loaded) tmux(['delete-buffer', '-b', buffer], r.run, r.env) }
  }
}
