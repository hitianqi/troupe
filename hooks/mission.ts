import type { TroupeMission, TroupeOrderState } from '../types'
import { stepOf } from './plan.ts'
import type { PlanRead } from './plan.ts'

// The mission as drawn, from plan.md, what the engine knows (the agent list
// and the session's skills) and what git knows (the order branches and the
// orders merged onto the mission branch). No engine import: the in-session
// pane (read-state.ts) and bin/troupe-panel both build the mission here.

/** What only the engine knows; the mod writes it to STATE_FILE in the mission folder for troupe-panel. */
export type EngineFacts = {
  agents: { description: string; status: string }[]
  /** The session's skill names; undefined when the listing could not be read. */
  skills?: string[]
}

/** How often the pane and troupe-panel look at the mission folder again, and at git. */
export const POLL_MS = 2000
export const GIT_MS = 10_000

/**
 * From git: the orders whose branch has commits ahead of the mission branch,
 * and those merged onto it; with SLIM.md in the folder, whether the mission
 * branch holds it (the cuts merged: the final review is next).
 */
export type GitFacts = { running: string[]; merged: string[]; isSlimMerged?: boolean }

/** In the mission folder, written by the mod, read by troupe-panel; git ignores it. */
export const STATE_FILE = '.troupe-state.json'

const SHARED = 'shared:'

/** The session lists `shared:x` as `x`; every other name, `codex:x` too, counts only as listed. */
export const hasSkill = (listed: string[], name: string): boolean =>
  listed.some(one => one === name || one === name.replace(SHARED, '') || name === one.replace(SHARED, ''))

const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])

/** The file a builder's role window writes in its worktree when its order is built; the mod copies it into the mission folder. */
export const doneMarker = (id: string) => `DONE-${id}.md`

/** A review report of order `id`: `REVIEW-<id>.md`, or `REVIEW-<id>-<n>.md` for its `n`th review. */
export const isReviewOf = (id: string, name: string) => name === `REVIEW-${id}.md` || new RegExp(`^REVIEW-${id.replace(/\W/g, '\\$&')}-\\d+\\.md$`).test(name)

/**
 * An order's state: `reviewed` with a review file, whatever its verdict, so a
 * fix round stays `reviewed`; `done` once merged onto the mission branch or
 * with its done marker; `running` while a subagent named `<id>:` lives or its
 * order branch is ahead of the mission branch; `done` when such a subagent
 * finished.
 */
export const stateOf = (id: string, files: string[], agents: EngineFacts['agents'], git?: GitFacts): TroupeOrderState => {
  if (files.some(file => isReviewOf(id, file))) return 'reviewed'
  // A squash-merged order's branch stays ahead of the mission branch: merged wins.
  if (git?.merged.includes(id) || files.includes(doneMarker(id))) return 'done'
  const mine = agents.filter(agent => agent.description.startsWith(`${id}:`))
  if (mine.some(agent => LIVE.has(agent.status)) || git?.running.includes(id)) return 'running'

  return mine.length > 0 ? 'done' : 'planned'
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The mission branch: a local branch named for the mission (`feature/NO-JIRA-p2`, `p2`), not an order branch. */
export const missionBranchOf = (mission: string, branches: string[]): string | undefined =>
  branches.find(branch => !branch.startsWith('order/') && new RegExp(`(^|[/-])${escape(mission)}$`).test(branch))

/**
 * What git says of the orders `ids` of `mission`: `run` runs one git command
 * in the mission's repository and answers its output, or undefined when it
 * fails. Orders are merged one commit each, titled `<id>: …`; an order's
 * branch is `order/<mission>/<id>`. `files` are the mission folder's names
 * (git runs in that folder). Undefined with no mission branch.
 */
export async function gitFacts(run: (args: string[]) => Promise<string | undefined>, mission: string, ids: string[], files: string[] = []): Promise<GitFacts | undefined> {
  const branches = (await run(['for-each-ref', '--format=%(refname:short)', 'refs/heads/']))?.split('\n').filter(Boolean)
  const base = branches && missionBranchOf(mission, branches)
  if (base === undefined) return undefined
  // The commits on the mission branch alone: on no other branch, local or remote
  // (a local main may lag origin/main, which has earlier missions' `o1: …`),
  // the mission branch and the order branches, and their remote copies, aside.
  const alone = ['--not', `--exclude=${base}`, '--exclude=order/*', '--branches', `--exclude=*/${base}`, '--exclude=*/order/*', '--remotes']
  const subjects = ((await run(['log', '--format=%s', base, ...alone])) ?? '').split('\n')
  const merged = ids.filter(id => subjects.some(subject => subject.startsWith(`${id}: `)))
  const running: string[] = []
  for (const id of ids) {
    const branch = `order/${mission}/${id}`
    if (merged.includes(id) || !branches?.includes(branch)) continue
    if (Number((await run(['rev-list', '--count', `${base}..${branch}`]))?.trim()) > 0) running.push(id)
  }
  if (!files.includes('SLIM.md')) return { running, merged }

  return { running, merged, isSlimMerged: Boolean((await run(['log', '-1', '--format=%h', base, '--', 'SLIM.md']))?.trim()) }
}

/** The mission in `dir` from its plan, the folder's file names, the engine's facts and git's. */
export const missionOf = (dir: string, plan: PlanRead, files: string[], facts: EngineFacts, git?: GitFacts): TroupeMission => {
  const listed = facts.skills
  const orders = plan.orders.map(({ id, kind, goal, model, dependsOn }) => ({ id, kind, goal, model, dependsOn, state: stateOf(id, files, facts.agents, git) }))

  return {
    dir,
    name: dir.slice(dir.lastIndexOf('/') + 1),
    title: plan.title,
    goal: plan.goal,
    step: stepOf({ problems: plan.problems, orders }, files, git?.isSlimMerged),
    hasRoles: plan.hasRoles,
    roles: plan.roles.map(role => ({
      ...role,
      skills: role.skills.map(name => ({ name, isFound: listed !== undefined && hasSkill(listed, name) })),
    })),
    orders,
    problems: listed === undefined ? [...plan.problems, 'the session lists no skills to check against'] : plan.problems,
  }
}
