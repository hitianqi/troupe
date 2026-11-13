import { badgeOf } from './agents.ts'
import type { Agent, Badge } from './agents.ts'
import { known, t } from './i18n.ts'
import { isApproved, PLAN_GATE } from './log.ts'
import type { Folded, Logged } from './log.ts'
import { sectionsOf } from './plan.ts'
import type { Plan, Role } from './plan.ts'
import type { Stage } from './stages.ts'
import type { Result, RoleState, Work } from './state.ts'
import type { Tokens } from './usage.ts'

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
  tokens?: Tokens
  work?: Work
  result?: Result
  /** The last lines of its pane. */
  screen?: string[]
}
export type RoleView = Role & Live & { branch: string; screen: string[]; badge?: Badge; dispatchedAt?: string; elapsed?: string; seconds?: number }
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
  /** When it was read, in ms. */
  now: number
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
      const ask = /^.*?[?？]/.exec(text)?.[0] ?? (/^.*?(?:[.!](?=\s|$)|[。！])/.exec(text)?.[0] ?? text)

      return { n: match[1] ?? '', ask: ask.replace(/\*\*/g, ''), recommended }
    })
}

const describe = (e: Logged, labelOf: (gate: string) => string): string => {
  if ((e as { ev: string }).ev === 'teardown') return t('mission teardown complete')
  if (e.ev === 'stage') return t('stage: {0}', e.stage)
  if (e.ev === 'gate-open') return e.gate === PLAN_GATE ? t('plan gate opened') : t('asked {0}: {1}', known(labelOf(e.gate)), e.ask ?? '')
  if (e.ev === 'gate-answer') {
    const what = e.gate === PLAN_GATE ? t('plan') : known(labelOf(e.gate))

    return e.answer === 'approve' ? t('{0} approved', what) : t('{0}: change: {1}', what, e.text ?? '')
  }
  if (e.ev === 'dispatch') return t('dispatched {0}', e.role)
  if (e.ev === 'send') return t('sent to {0}: {1}', e.role, e.text)
  if (e.ev === 'up') return t('opened mission window {0}', e.window)

  if (e.ev === 'close') return t('closed {0}', e.role)
  if (e.ev === 'lang') return t('language: {0}', e.lang === 'zh' ? '中文' : 'English')

  return t('mission: {0}', (e as { ev: string }).ev)
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
  agents?: Record<string, Agent>
}

export const modelOf = (input: ModelInput): PanelModel => {
  const { plan, folded, stages } = input
  const approved = isApproved(folded, input.hash)
  const roles: RoleView[] = plan.roles.map(role => {
    const live = input.live.get(role.name) ?? { state: 'planned' }

    const opened = folded.roles.get(role.name)
    const seconds = opened === undefined ? NaN : Math.max(0, Math.floor((input.now.getTime() - Date.parse(opened.at)) / 1000))
    const elapsed = !Number.isFinite(seconds) ? undefined : seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`

    return { ...role, ...live, badge: badgeOf(role.agent, input.agents?.[role.agent]), branch: opened?.branch ?? `role/${input.mission}/${role.name}`, screen: live.screen ?? [], ...(opened && { dispatchedAt: opened.at }), ...(elapsed && { elapsed, seconds }) }
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
    now: input.now.getTime(),
  }
}
