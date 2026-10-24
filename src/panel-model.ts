import { relative } from 'node:path'

import { mission, workflowStages } from './command-context.ts'
import type { Mission, Runtime } from './command-context.ts'
import { modelOf } from './model.ts'
import type { PanelModel } from './model.ts'
import { liveOf } from './role-commands.ts'

export type Snapshot = { mission: Mission; model: PanelModel }
export type Reading = Snapshot | { missing: string }

/** The commands and panel share the same bytes, hash, stages and live reads. */
export const readPanel = (r: Runtime, want: string): Reading => {
  try {
    const m = mission(r, want)
    const stages = workflowStages(r, m.plan.workflow)
    const plan = { ...m.plan, problems: [...m.problems, ...stages.problems] }
    const model = modelOf({
      mission: m.name, planPath: relative(m.root, m.path), planText: m.source, plan,
      agents: m.agents, hash: m.hash, folded: m.folded, log: m.events, stages: stages.stages,
      live: new Map(m.plan.roles.map(role => [role.name, liveOf(r, m, role)])), now: new Date(r.now()),
    })

    return { mission: m, model }
  } catch (error) {
    const why = (error as Error).message

    return { missing: /^no mission under|^no plan at/.test(why) ? 'no mission yet' : `panel: ${why}` }
  }
}
