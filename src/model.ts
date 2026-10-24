import { isApproved, PLAN_GATE } from './log.ts'
import type { Folded, Logged } from './log.ts'
import { sectionsOf } from './plan.ts'
import type { Plan, Role } from './plan.ts'
import type { Stage } from './stages.ts'
import type { Result, RoleState, Work } from './state.ts'

// What the panel draws, built from the files: the plan, the folded log, the
// workflow's stages and what was read live for each role. Pure: the panel
// loop (step 7) and the goldens build it the same way.

/** What was read live for a role this poll. */
export type Live = {
  state: RoleState
  /** The dialog a waiting role shows, in a few words. */
  waitsOn?: string
  /** Context use where the adapter can read it, else absent. */
  context?: string
  work?: Work
  result?: Result
  /** The last lines of its pane. */
  screen?: string[]
}
export type RoleView = Role & Live & { branch: string; screen: string[] }
export type StageMark = 'done' | 'now' | 'open' | 'gate' | 'todo'
export type StageView = Stage & { mark: StageMark; note: string }
export type GateView = { id: string; label: string; ask: string; isPlan: boolean }
export type Decision = { n: string; ask: string; recommended: string }
export type Activity = { at: string; text: string }
export type PanelModel = {
  mission: string
  planPath: string
  planText: string
  hash: string
  title: string
  goal: string
  why: string
  doneWhen: string[]
  problems: string[]
  decisions: Decision[]
  stage: StageView | undefined
  stages: StageView[]
  roles: RoleView[]
  gate: GateView | undefined
  activity: Activity[]
  log: Logged[]
  clock: string
}

/** HH:MM, local time. */
export const clockOf = (at: Date | string) => {
  const date = typeof at === 'string' ? new Date(at) : at

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** The `## Decisions for you` items: `1. <question> **Recommended: <option>**, …`. */
export const decisionsOf = (source: string): Decision[] => {
  const body = sectionsOf(source).find(section => /^decisions for you$/i.test(section.heading))?.body ?? ''

  return body
    .split(/\n(?=\s*\d+\.\s)/)
    .map(item => /^\s*(\d+)\.\s+([\s\S]*)$/.exec(item))
    .filter(match => match !== null)
    .map(match => {
      const text = (match[2] ?? '').replace(/\s+/g, ' ').trim()
      const recommended = /\*\*Recommended:\s*([^*]+?)\.?\*\*/i.exec(text)?.[1]?.trim() ?? ''
      const ask = /^.*?\?/.exec(text)?.[0] ?? (/^.*?[.!](?=\s|$)/.exec(text)?.[0] ?? text)

      return { n: match[1] ?? '', ask: ask.replace(/\*\*/g, ''), recommended }
    })
}

const describe = (e: Logged, labelOf: (gate: string) => string): string => {
  if (e.ev === 'stage') return `stage: ${e.stage}`
  if (e.ev === 'gate-open') return e.gate === PLAN_GATE ? 'plan gate opened' : `asked ${labelOf(e.gate)}: ${e.ask ?? ''}`
  if (e.ev === 'gate-answer') {
    const what = e.gate === PLAN_GATE ? 'plan' : labelOf(e.gate)

    return e.answer === 'approve' ? `${what} approved` : `${what}: change: ${e.text ?? ''}`
  }
  if (e.ev === 'dispatch') return `dispatched ${e.role}`
  if (e.ev === 'send') return `sent to ${e.role}: ${e.text}`
  if (e.ev === 'up') return `opened mission window ${e.window}`

  return `closed ${e.role}`
}

export type ModelInput = {
  mission: string
  planPath: string
  planText: string
  plan: Plan
  hash: string
  folded: Folded
  log: Logged[]
  live: Map<string, Live>
  stages: Stage[]
  now: Date
}

export const modelOf = (input: ModelInput): PanelModel => {
  const { plan, folded, stages } = input
  const approved = isApproved(folded, input.hash)
  const roles: RoleView[] = plan.roles.map(role => {
    const live = input.live.get(role.name) ?? { state: 'planned' }

    return { ...role, ...live, branch: folded.roles.get(role.name)?.branch ?? `role/${input.mission}/${role.name}`, screen: live.screen ?? [] }
  })
  const planGate = folded.gates.get(PLAN_GATE)
  // The plan gate stands open while the plan as it is now is not approved and someone asked for it.
  const planOpen = !approved && planGate !== undefined
  const labelOf = (gate: string) => stages.find(stage => stage.gate === gate)?.label ?? gate
  const otherOpen = [...folded.gates.values()].filter(gate => gate.id !== PLAN_GATE && gate.answer === undefined).sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0]
  const gate: GateView | undefined = planOpen
    ? { id: PLAN_GATE, label: labelOf(PLAN_GATE), ask: 'Approve the plan', isPlan: true }
    : otherOpen === undefined
      ? undefined
      : { id: otherOpen.id, label: labelOf(otherOpen.id), ask: otherOpen.ask, isPlan: false }

  const planIndex = stages.findIndex(stage => stage.gate === PLAN_GATE)
  const named = stages.findIndex(stage => stage.id === folded.stage)
  const current = !approved ? (planOpen ? planIndex : Math.max(0, Math.min(planIndex, named === -1 ? 0 : named))) : named === -1 ? planIndex + 1 : Math.max(named, planIndex + 1)
  const stageViews = stages.map((stage, index): StageView => {
    const answered = stage.gate === undefined ? undefined : folded.gates.get(stage.gate)
    const group = roles.filter(role => role.group === stage.id)
    const note =
      group.length > 0
        ? `${group.filter(role => role.state === 'done').length}/${group.length}`
        : index < current && answered?.answeredAt !== undefined
          ? clockOf(answered.answeredAt)
          : ''
    const isOpen = stage.gate !== undefined && (stage.gate === PLAN_GATE ? planOpen : answered !== undefined && answered.answer === undefined)
    const mark: StageMark = index < current ? 'done' : index === current ? (isOpen ? 'open' : stage.gate === undefined ? 'now' : 'gate') : stage.gate === undefined ? 'todo' : 'gate'

    return { ...stage, mark, note }
  })

  return {
    mission: input.mission,
    planPath: input.planPath,
    planText: input.planText,
    hash: input.hash,
    title: plan.title,
    goal: plan.goal,
    why: plan.why,
    doneWhen: plan.doneWhen,
    problems: plan.problems,
    decisions: decisionsOf(input.planText),
    stage: stageViews[current],
    stages: stageViews,
    roles,
    gate,
    activity: [...input.log].reverse().map(e => ({ at: clockOf(e.at), text: describe(e, labelOf) })),
    log: input.log,
    clock: clockOf(input.now),
  }
}
