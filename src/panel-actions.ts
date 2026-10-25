import { clean, mission, mux, Refusal, workflowStages } from './command-context.ts'
import type { Runtime } from './command-context.ts'
import { append } from './log.ts'
import { ownedPane } from './panes.ts'
import { send } from './role-commands.ts'
import { gateTarget } from './panel-input.ts'
import type { Effect } from './panel-input.ts'
import { queueAnswer } from './orchestrator.ts'
import { modelOf } from './model.ts'

/** Re-read at the effect, so a stale frame cannot approve a different plan/gate. */
export const panelEffect = async (r: Runtime, want: string, effect: Effect): Promise<string> => {
  try {
    const m = mission(r, want)
    if (effect.kind === 'send') return (await send(r, m, effect.role, effect.text)).out.trim()
    if (effect.kind === 'open') {
      const opened = m.folded.roles.get(effect.role)
      if (opened === undefined || opened.closed) throw new Refusal(`role ${effect.role}: no open pane recorded by troupe`)
      const pane = ownedPane(r, opened)
      if (!pane.alive || pane.dead) throw new Refusal(`role ${effect.role}: pane is gone or its agent exited`)
      mux(r, ['select-window', '-t', opened.window])
      mux(r, ['select-pane', '-t', opened.pane])

      return `Opened ${effect.role}`
    }
    const stages = workflowStages(r, m.plan.workflow)
    const current = modelOf({ mission: m.name, planPath: m.path, planText: m.source, plan: m.plan, hash: m.hash, folded: m.folded, log: m.events, live: new Map(), stages: stages.stages, now: new Date(r.now()) })
    const gate = gateTarget(current)
    if (gate === undefined || gate.id !== effect.gate.id || gate.stamp !== effect.gate.stamp || (gate.isPlan && gate.hash !== effect.gate.hash)) throw new Refusal('The gate or plan changed; review it again.')
    if (effect.answer === 'approve' && gate.isPlan) {
      clean(m)
      if (stages.problems.length > 0) throw new Refusal(stages.problems.join('\n'))
    }
    if (effect.answer === 'change' && !effect.text?.trim()) throw new Refusal('Enter a change first.')
    const answer = append(m.log, 'panel', { ev: 'gate-answer', gate: gate.id, answer: effect.answer, ...(effect.text === undefined ? {} : { text: effect.text }), ...(gate.isPlan ? { plan: m.hash } : {}) })

    queueAnswer(r, m, answer)
    return effect.answer === 'approve' ? `Approved ${gate.id}` : `Change sent for ${gate.id}`
  } catch (error) {
    return (error as Error).message
  }
}
