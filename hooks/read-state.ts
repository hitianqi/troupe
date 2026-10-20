import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { TroupeMission } from '../types'
import { GIT_MS, gitFacts, missionOf, STATE_FILE } from './mission.ts'
import type { EngineFacts, GitFacts } from './mission.ts'
import { readPlan } from './plan.ts'
// Kept here too for readers that took them from this module before mission.ts
// (docs/missions/workflow/check-sample.mjs).
export { hasSkill, stateOf } from './mission.ts'
import type { PlanRead } from './plan.ts'

// Reads the mission: finds plan.md, reads it when it changed (plan.ts), and
// builds it with the engine's facts (mission.ts): the agents and the skills.

const target = atom({ plugin: 'troupe', key: 'target' } as const, '')
const mission = atom({ plugin: 'troupe', key: 'mission' } as const, null)

// ---- the poll: find the mission, read plan.md when it changed --------------

const MISSIONS = 'docs/missions'
/** How long a skill listing stands; one that could not be read is asked for again at the next poll. */
export const SKILLS_MS = 30_000

// What the poll last read; a hot reload starts both over, which costs one read.
let parsed: { key: string; plan: PlanRead } | undefined
let skills: { at: number; names: string[] | undefined } | undefined
let git: { at: number; key: string; facts: GitFacts | undefined } | undefined

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

/** What git says of the mission's orders, asked at most every GIT_MS. */
async function gitOf($: EngineInterface, dir: string, ids: string[]): Promise<GitFacts | undefined> {
  const now = await $.clock.now()
  const key = `${dir}|${ids.join(',')}`
  if (git === undefined || git.key !== key || now - git.at >= GIT_MS) {
    const run = (args: string[]) =>
      $.process.run(['git', '-C', dir, ...args], { timeoutMs: 5000 }).then(
        ran => (ran.exitCode === 0 ? ran.stdout : undefined),
        () => undefined,
      )
    git = { at: now, key, facts: await gitFacts(run, dir.slice(dir.lastIndexOf('/') + 1), ids) }
  }

  return git.facts
}

/** `/troupe <mission>`: a mission name, a mission folder's path, or '' for the newest. */
export async function setTarget($: EngineInterface, want: string): Promise<void> {
  await update($, target, () => want)
}

/** The mission as last read; while drawing, the read subscribes the pane to it. */
export async function readMission($: EngineInterface): Promise<TroupeMission | { missing: string } | null> {
  return read($, mission)
}

/** Reads the mission into the pane's state; answers its folder and the engine's facts, or undefined with no plan. */
export async function refresh($: EngineInterface): Promise<{ dir: string; facts: EngineFacts } | undefined> {
  const want = await read($, target)
  const before = await read($, mission)
  const dir = want.includes('/') ? want.replace(/\/+$/, '') : want !== '' ? `${MISSIONS}/${want}` : await newestMission($)
  const stat = dir === undefined ? undefined : await $.fs.stat(`${dir}/plan.md`).catch(() => undefined)
  if (dir === undefined || stat === undefined) {
    const missing = dir === undefined ? `no mission under ${MISSIONS}/` : `no plan.md in ${dir}`
    if (before === null || !('missing' in before) || before.missing !== missing) await update($, mission, () => ({ missing }))

    return undefined
  }
  const key = `${dir}@${stat.mtimeMs}`
  if (parsed?.key !== key) parsed = { key, plan: readPlan(await $.fs.read(`${dir}/plan.md`)) }
  const files = (await $.fs.list(dir).catch(() => [])).map(entry => entry.name)
  const agents = await $.agent.list().catch(() => [])
  const facts: EngineFacts = { agents: agents.map(({ description, status }) => ({ description, status })), skills: await skillNames($) }
  const next = missionOf(dir, parsed.plan, files, facts, await gitOf($, dir, parsed.plan.orders.map(order => order.id)))
  if (JSON.stringify(next) !== JSON.stringify(before)) await update($, mission, () => next)

  return { dir, facts }
}

let written = ''

/** Writes the engine's facts to the mission folder for troupe-panel, when they changed. */
export async function writeFacts($: EngineInterface, read: { dir: string; facts: EngineFacts }): Promise<void> {
  const text = `${JSON.stringify(read.facts)}\n`
  if (`${read.dir}\n${text}` === written) return
  await $.fs.write(`${read.dir}/${STATE_FILE}`, text)
  written = `${read.dir}\n${text}`
}
