import { relative } from 'node:path'

import { mux, workflowStages } from './command-context.ts'
import type { Mission, Runtime } from './command-context.ts'
import { modelOf } from './model.ts'
import type { PanelModel } from './model.ts'
import { PLAN_GATE } from './log.ts'
import { mission, Unresolved } from './missions.ts'
import { liveOf } from './role-commands.ts'
import { rootOf } from './check.ts'
import { tmux } from './run.ts'

export type Snapshot = { mission: Mission; model: PanelModel }
/** Before the orchestrator names its mission, the panel only knows it drafts a plan, and since when (ms) when told. */
export type Reading = Snapshot | { missing: string; drafting?: { since?: number; now: number } }
/** What the panel reads while the orchestrator drafts the plan. */
export const PLANNING = 'Orch is drafting the plan'

/**
 * Whether this panel was opened for planning (`@troupe-planning`, set by
 * `troupe open --planning` and `troupe up` to the time in ms; `1` from an
 * older troupe, with no time), and since when.
 */
const planning = (r: Runtime, root: string, finish = false): { since?: number } | undefined => {
  const pane = r.env.TMUX_PANE
  if (!pane) return undefined
  const found = tmux(['display', '-p', '-t', pane, '#{@troupe-panel}\t#{@troupe-planning}'], r.run, r.env)
  const [panel, mark = ''] = found.code === 0 ? found.out.trimEnd().split('\t') : []
  if (panel !== root || !/^\d+$/.test(mark)) return undefined
  if (finish) mux(r, ['set-option', '-p', '-u', '-t', pane, '@troupe-planning'])

  return mark === '1' ? {} : { since: Number(mark) }
}

/** The commands and panel share the same bytes, hash, stages and live reads. */
export const readPanel = (r: Runtime, want: string): Reading => {
  try {
    const m = mission(r, want)
    // The orchestrator drafts the plan until it first asks for approval; the mark is kept until then for its start.
    const isDrafting = !m.folded.finished && !m.folded.gates.has(PLAN_GATE)
    const marked = planning(r, m.root, !isDrafting)
    const since = marked?.since ?? Date.parse(m.events.find(e => e.ev === 'up')?.at ?? '')
    const stages = workflowStages(r, m.plan.workflow)
    const plan = { ...m.plan, problems: [...m.problems, ...stages.problems] }
    const model = modelOf({
      mission: m.name, planPath: relative(m.worktree, m.path), planText: m.source, plan,
      agents: m.agents, hash: m.hash, folded: m.folded, log: m.events, stages: stages.stages,
      live: new Map(m.plan.roles.map(role => [role.name, liveOf(r, m, role)])), now: new Date(r.now()),
      ...(isDrafting && { drafting: Number.isFinite(since) ? { since } : {} }),
    })

    return { mission: m, model }
  } catch (error) {
    const why = (error as Error).message
    const waiting = error instanceof Unresolved || /^no plan for/.test(why)
    const marked = waiting ? planning(r, rootOf(r.cwd, r.run)) : undefined
    if (marked !== undefined) return { missing: PLANNING, drafting: { ...marked, now: r.now() } }
    // With missions open, an unbound panel names them instead of looking idle.
    if (error instanceof Unresolved && error.open.length > 0) return { missing: `panel: ${why}` }

    return { missing: waiting ? 'no mission yet' : `panel: ${why}` }
  }
}
