import { relative } from 'node:path'

import { mux, workflowStages } from './command-context.ts'
import type { Mission, Runtime } from './command-context.ts'
import { modelOf } from './model.ts'
import type { PanelModel } from './model.ts'
import { mission, Unresolved } from './missions.ts'
import { liveOf } from './role-commands.ts'
import { rootOf } from './check.ts'
import { tmux } from './run.ts'

export type Snapshot = { mission: Mission; model: PanelModel }
export type Reading = Snapshot | { missing: string }
/** What the panel reads while the orchestrator drafts the plan. */
export const PLANNING = 'Orch is planning…'

const planning = (r: Runtime, root: string, finish = false): boolean => {
  const pane = r.env.TMUX_PANE
  if (!pane) return false
  const found = tmux(['display', '-p', '-t', pane, '#{@troupe-panel}\t#{@troupe-planning}'], r.run, r.env)
  const active = found.code === 0 && found.out.trimEnd() === `${root}\t1`
  if (active && finish) mux(r, ['set-option', '-p', '-u', '-t', pane, '@troupe-planning'])

  return active
}

/** The commands and panel share the same bytes, hash, stages and live reads. */
export const readPanel = (r: Runtime, want: string): Reading => {
  try {
    const m = mission(r, want)
    planning(r, m.root, true)
    const stages = workflowStages(r, m.plan.workflow)
    const plan = { ...m.plan, problems: [...m.problems, ...stages.problems] }
    const model = modelOf({
      mission: m.name, planPath: relative(m.worktree, m.path), planText: m.source, plan,
      agents: m.agents, hash: m.hash, folded: m.folded, log: m.events, stages: stages.stages,
      live: new Map(m.plan.roles.map(role => [role.name, liveOf(r, m, role)])), now: new Date(r.now()),
    })

    return { mission: m, model }
  } catch (error) {
    const why = (error as Error).message
    const waiting = error instanceof Unresolved || /^no plan for/.test(why)
    if (waiting && planning(r, rootOf(r.cwd, r.run))) return { missing: PLANNING }
    // With missions open, an unbound panel names them instead of looking idle.
    if (error instanceof Unresolved && error.open.length > 0) return { missing: `panel: ${why}` }

    return { missing: waiting ? 'no mission yet' : `panel: ${why}` }
  }
}
