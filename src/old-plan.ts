import type { TroupeOrderState } from '../types'
import { overlaps } from './plan.ts'
import { parseYaml } from './yaml.ts'
import type { Yaml } from './yaml.ts'

// The mod's plan.md (orders), read and checked, until Phase 5 step 9 deletes
// it with the mod. The new format is plan.ts.
// plan.md, read and checked: the goal, the roles, the orders block,
// plan_lint's rules, the dependency layers and the workflow step.

export type PlanOrder = {
  id: string
  kind: string
  goal: string
  why: string
  touches: string[]
  dependsOn: string[]
  model: string
}
export type PlanRole = { name: string; model: string; effort: string; duty: string[]; skills: string[] }
export type PlanRead = {
  title: string
  /** The block's `goal:`, else the first sentence of the plan's Intent. */
  goal: string
  hasRoles: boolean
  roles: PlanRole[]
  orders: PlanOrder[]
  problems: string[]
}

/** The three roles of a mission rig, as a plan that names no model, effort or duty gets them. */
const DEFAULT_ROLES: Record<string, Omit<PlanRole, 'name' | 'skills'> | undefined> = {
  orchestrator: {
    model: 'opus',
    effort: 'high',
    duty: ['Writes the plan and gets it approved', 'Dispatches each order and merges it onto the mission branch', "Opens the MR after the human's go, then tears down"],
  },
  builder: {
    model: 'opus',
    effort: 'high',
    duty: ['Builds its order in its own worktree', 'Fixes the review findings, one round per review'],
  },
  reviewer: {
    model: 'sonnet',
    effort: 'high',
    duty: ['Reviews each order for behaviour as it lands', 'Runs the final review across the orders'],
  },
}
/** A light mission's reviewer runs no final review of its own. */
const LIGHT_REVIEWER_DUTY = ['Reviews each order for behaviour as it lands', "Its review of the last order is also the mission's final review"]
const KINDS = ['code', 'research']
/** The efforts a role may name, lowest first; the pane's meter has one cell each. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

const isMap = (value: Yaml | undefined): value is { [key: string]: Yaml } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: Yaml | undefined): string => (typeof value === 'string' ? value : '')
const texts = (value: Yaml | undefined): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : typeof value === 'string' ? [value] : []

/** The paragraph that opens with `Intent:`, cut at its first sentence. */
export const goalOf = (source: string): string => {
  const paragraph = /^Intent:[ \t]*([\s\S]*?)(?:\n[ \t]*\n|$(?![\s\S]))/m.exec(source)?.[1] ?? ''
  const joined = paragraph.replace(/\s*\n\s*/g, ' ').replace(/`/g, '').trim()

  return /^.*?[.!?](?=\s|$)/.exec(joined)?.[0] ?? joined
}

/** A role is `name: [skills]`, or `name: { model, effort, duty: [lines], skills }`; what it leaves out is the default. */
const roleOf = (name: string, value: Yaml, light = false): PlanRole => {
  const own = isMap(value) ? value : { skills: value }
  const fallback = light && name === 'reviewer' ? { ...DEFAULT_ROLES.reviewer, duty: LIGHT_REVIEWER_DUTY } : DEFAULT_ROLES[name]
  const duty = texts(own.duty)

  return {
    name,
    model: text(own.model) || (fallback?.model ?? ''),
    effort: text(own.effort) || (fallback?.effort ?? ''),
    duty: duty.length > 0 ? duty : (fallback?.duty ?? []),
    skills: texts(own.skills),
  }
}

export const readPlan = (source: string): PlanRead => {
  const title = /^# +(.+)$/m.exec(source)?.[1]?.trim() ?? ''
  const empty = {
    title,
    goal: goalOf(source),
    hasRoles: false,
    roles: Object.keys(DEFAULT_ROLES).map(name => roleOf(name, [])),
    orders: [],
  }
  const fence = /```ya?ml\n([\s\S]*?)```/g
  for (let found = fence.exec(source); found !== null; found = fence.exec(source)) {
    const body = found[1] ?? ''
    if (!/^orders:/m.test(body)) continue
    const firstLine = source.slice(0, found.index).split('\n').length + 1
    let data: Yaml
    try {
      data = parseYaml(body, firstLine)
    } catch (error) {
      return { ...empty, problems: [`the orders block cannot be read: ${(error as Error).message}`] }
    }
    if (!isMap(data) || !Array.isArray(data.orders)) {
      return { ...empty, problems: ['the orders block has no list under `orders:`'] }
    }
    const problems: string[] = []
    const orders = data.orders.map((raw, index): PlanOrder => {
      const one = isMap(raw) ? raw : {}
      if (!isMap(raw)) problems.push(`order ${index + 1} is not a mapping`)

      return {
        id: text(one.id),
        kind: text(one.kind) || 'code',
        goal: text(one.goal),
        why: text(one.why),
        touches: texts(one.touches),
        dependsOn: texts(one.depends_on),
        model: text(one.model),
      }
    })
    const light = isLight(orders)
    const roles = isMap(data.roles)
      ? Object.entries(data.roles).map(([name, value]) => roleOf(name, value, light))
      : Object.keys(DEFAULT_ROLES).map(name => roleOf(name, [], light))
    if (data.roles !== undefined && !isMap(data.roles)) problems.push('`roles` is not a mapping of role to skills')
    for (const role of roles) {
      if (role.effort !== '' && !EFFORTS.includes(role.effort)) problems.push(`role ${role.name}: unknown effort "${role.effort}" (${EFFORTS.join(', ')})`)
    }

    const goal = text(data.goal) || empty.goal

    return { ...empty, goal, hasRoles: isMap(data.roles), roles, orders, problems: [...problems, ...checkPlan(orders)] }
  }

  return { ...empty, problems: ['no ```yaml block with an `orders:` key'] }
}

export { overlaps }

/** plan_lint's plan mode: the same rules, as problems to show. */
export const checkPlan = (orders: PlanOrder[]): string[] => {
  const problems: string[] = []
  const byId = new Map(orders.map(order => [order.id, order]))
  const ids = orders.map(order => order.id)
  ids.forEach((id, index) => {
    if (id === '') problems.push('an order has no id')
    else if (ids.indexOf(id) !== index && ids.indexOf(id, index + 1) === -1) problems.push(`duplicate order id: ${id}`)
  })
  for (const order of orders) {
    const id = order.id || '?'
    if (!KINDS.includes(order.kind)) problems.push(`${id}: kind must be code or research, got "${order.kind}"`)
    if (order.kind === 'code' && order.touches.length === 0) problems.push(`${id}: code order declares no files in touches`)
    if (order.kind === 'code' && order.why.trim() === '') problems.push(`${id}: code order has no why`)
    for (const dep of order.dependsOn) if (!byId.has(dep)) problems.push(`${id}: depends_on unknown order "${dep}"`)
  }
  const deps = (id: string): Set<string> => {
    const seen = new Set<string>()
    const stack = [...(byId.get(id)?.dependsOn ?? [])]
    for (let dep = stack.pop(); dep !== undefined; dep = stack.pop()) {
      if (seen.has(dep) || !byId.has(dep)) continue
      seen.add(dep)
      stack.push(...(byId.get(dep)?.dependsOn ?? []))
    }

    return seen
  }
  for (const id of byId.keys()) if (deps(id).has(id)) problems.push(`${id}: dependency cycle`)
  orders.forEach((a, index) => {
    for (const b of orders.slice(index + 1)) {
      const shared = a.touches.flatMap(x => b.touches.filter(y => overlaps(x, y)).map(y => `${x} ~ ${y}`))
      if (shared.length > 0 && !deps(a.id).has(b.id) && !deps(b.id).has(a.id)) {
        problems.push(`${a.id} and ${b.id} overlap (${shared.join('; ')}) but neither depends on the other`)
      }
    }
  })

  return problems
}

/** Kahn's layering: each layer holds the orders whose known dependencies all sit in earlier layers. */
export const layersOf = <O extends { id: string; dependsOn: string[] }>(orders: O[]): { layers: O[][]; stuck: O[] } => {
  const known = new Set(orders.map(order => order.id))
  const placed = new Set<string>()
  const layers: O[][] = []
  let left = orders
  while (left.length > 0) {
    const ready = left.filter(order => order.dependsOn.every(dep => placed.has(dep) || !known.has(dep)))
    if (ready.length === 0) break
    layers.push(ready)
    for (const order of ready) placed.add(order.id)
    left = left.filter(order => !ready.includes(order))
  }

  return { layers, stuck: left }
}


// ---- the workflow ------------------------------------------------------------

export type Step = { label: string; isGate?: true; isHeavy?: true }

/** The key steps of the kit's tianqi-mission flow, for the step detection; a gate waits for the human. The graph draws only the gates. */
export const STEPS: Step[] = [
  { label: 'Intent' },
  { label: 'Plan' },
  { label: 'Plan OK?', isGate: true },
  { label: 'Build' },
  { label: 'Order review' },
  { label: 'Slim', isHeavy: true },
  { label: 'Cut', isHeavy: true },
  { label: 'Final review', isHeavy: true },
  { label: 'MR OK?', isGate: true },
  { label: 'Open MR' },
  { label: 'Merged?', isGate: true },
  { label: 'Teardown' },
  { label: 'main' },
]
const at = (label: string) => STEPS.findIndex(step => step.label === label)

/** A light mission (one or two orders) skips the heavy steps: Slim, Cut and Final review. A plan with no orders read is not light. */
export const isLight = (orders: unknown[]): boolean => orders.length >= 1 && orders.length <= 2

/** The steps a mission of `orders` goes through, as the pane names them: from Plan to Teardown, a light one without the heavy steps. */
export const stepsOf = (orders: unknown[]): Step[] =>
  STEPS.filter(step => step.label !== 'Intent' && step.label !== 'main' && !(step.isHeavy && isLight(orders)))

/**
 * The step the mission is at, as an index into STEPS, from what the pane
 * already reads: the plan's problems, the order states, the mission folder's
 * SLIM.md and REVIEW.md, whether the mission branch holds SLIM.md (the
 * cuts merged, so the final review runs), and whether an approval record
 * holds for plan.md. It never passes "MR OK?".
 */
export const stepOf = (m: { problems: string[]; orders: { state: TroupeOrderState }[] }, files: string[], isSlimMerged = false, isApproved = false): number => {
  const states = m.orders.map(order => order.state)
  if (states.length === 0 || m.problems.length > 0) return at('Plan')
  // Past the gate once an approval record holds for plan.md as it is now.
  if (states.every(state => state === 'planned')) return isApproved ? at('Build') : at('Plan OK?')
  if (states.some(state => state === 'planned' || state === 'running')) return at('Build')
  if (states.some(state => state !== 'reviewed')) return at('Order review')
  if (isLight(states) || files.includes('REVIEW.md')) return at('MR OK?')

  if (!files.includes('SLIM.md')) return at('Slim')

  return isSlimMerged ? at('Final review') : at('Cut')
}
