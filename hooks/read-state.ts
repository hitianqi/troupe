import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface } from 'claude-code'

import type { TroupeMission, TroupeOrderState } from '../types'
import { readPlan, stepOf } from './plan'
import type { PlanRead } from './plan'

// Reads the mission: finds plan.md, reads it when it changed (plan.ts),
// resolves the roles' skills and infers each order's state.

const target = atom({ plugin: 'troupe', key: 'target' } as const, '')
const mission = atom({ plugin: 'troupe', key: 'mission' } as const, null)

// ---- skills and order state -------------------------------------------------

const SHARED = 'shared:'

/** The session lists `shared:x` as `x`; every other name, `codex:x` too, counts only as listed. */
export const hasSkill = (listed: string[], name: string): boolean =>
  listed.some(one => one === name || one === name.replace(SHARED, '') || name === one.replace(SHARED, ''))

const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])

export const stateOf = (id: string, files: string[], agents: Pick<AgentInfo, 'description' | 'status'>[]): TroupeOrderState => {
  if (files.some(file => file === `REVIEW-${id}.md` || new RegExp(`^REVIEW-${id.replace(/\W/g, '\\$&')}-\\d+\\.md$`).test(file))) return 'reviewed'
  const mine = agents.filter(agent => agent.description.startsWith(`${id}:`))
  if (mine.some(agent => LIVE.has(agent.status))) return 'running'

  return mine.length > 0 ? 'done' : 'planned'
}

// ---- the poll: find the mission, read plan.md when it changed --------------

const MISSIONS = 'docs/missions'
/** How long a skill listing stands; one that could not be read is asked for again at the next poll. */
export const SKILLS_MS = 30_000

// What the poll last read; a hot reload starts both over, which costs one read.
let parsed: { key: string; plan: PlanRead } | undefined
let skills: { at: number; names: string[] | undefined } | undefined

/** The mission whose plan.md changed last; equal times go to the higher name (p1 over p0). */
async function newestMission($: EngineInterface): Promise<string | undefined> {
  const dirs = (await $.fs.list(MISSIONS).catch(() => [])).filter(entry => entry.kind === 'dir')
  const plans = await Promise.all(
    dirs.map(dir => $.fs.stat(`${MISSIONS}/${dir.name}/plan.md`).then(stat => ({ name: dir.name, at: stat.mtimeMs }), () => undefined)),
  )
  const newest = plans
    .filter(plan => plan !== undefined)
    .sort((a, b) => b.at - a.at || b.name.localeCompare(a.name, 'en', { numeric: true }))[0]

  return newest && `${MISSIONS}/${newest.name}`
}

async function skillNames($: EngineInterface): Promise<string[] | undefined> {
  const now = await $.clock.now()
  if (skills === undefined || skills.names === undefined || now - skills.at >= SKILLS_MS) {
    const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
    skills = { at: now, names: usage?.context.breakdown?.skills?.skillFrontmatter.map(skill => skill.name) }
  }

  return skills.names
}

/** `/troupe <mission>`: a mission name, a mission folder's path, or '' for the newest. */
export async function setTarget($: EngineInterface, want: string): Promise<void> {
  await update($, target, () => want)
}

/** The mission as last read; while drawing, the read subscribes the pane to it. */
export async function readMission($: EngineInterface): Promise<TroupeMission | { missing: string } | null> {
  return read($, mission)
}

export async function refresh($: EngineInterface): Promise<void> {
  const want = await read($, target)
  const before = await read($, mission)
  const dir = want.includes('/') ? want.replace(/\/+$/, '') : want !== '' ? `${MISSIONS}/${want}` : await newestMission($)
  const stat = dir === undefined ? undefined : await $.fs.stat(`${dir}/plan.md`).catch(() => undefined)
  if (dir === undefined || stat === undefined) {
    const missing = dir === undefined ? `no mission under ${MISSIONS}/` : `no plan.md in ${dir}`
    if (before === null || !('missing' in before) || before.missing !== missing) await update($, mission, () => ({ missing }))

    return
  }
  const key = `${dir}@${stat.mtimeMs}`
  if (parsed?.key !== key) parsed = { key, plan: readPlan(await $.fs.read(`${dir}/plan.md`)) }
  const { plan } = parsed
  const listed = await skillNames($)
  const files = (await $.fs.list(dir).catch(() => [])).map(entry => entry.name)
  const agents = await $.agent.list().catch(() => [])
  const orders = plan.orders.map(({ id, kind, goal, model, dependsOn }) => ({ id, kind, goal, model, dependsOn, state: stateOf(id, files, agents) }))
  const next: TroupeMission = {
    dir,
    name: dir.slice(dir.lastIndexOf('/') + 1),
    title: plan.title,
    goal: plan.goal,
    step: stepOf({ problems: plan.problems, orders }, files),
    hasRoles: plan.hasRoles,
    roles: plan.roles.map(role => ({
      ...role,
      skills: role.skills.map(name => ({ name, isFound: listed !== undefined && hasSkill(listed, name) })),
    })),
    orders,
    problems: listed === undefined ? [...plan.problems, 'the session lists no skills to check against'] : plan.problems,
  }
  if (JSON.stringify(next) !== JSON.stringify(before)) await update($, mission, () => next)
}
