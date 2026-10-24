import type { TroupeApproval, TroupeMission, TroupeOrderState } from '../types'
import { stepOf } from './plan.ts'
import type { PlanRead } from './plan.ts'

// The mission as drawn, from plan.md, the mission folder's files and what git
// knows (the order branches and the orders merged onto the mission branch).
// No engine import: bin/troupe-panel builds the mission here.

/** How often troupe-panel looks at the mission folder again, and at git. */
export const POLL_MS = 2000
export const GIT_MS = 10_000

/**
 * From git: the orders whose branch has commits ahead of the mission branch,
 * and those merged onto it; with SLIM.md in the folder, whether the mission
 * branch holds it (the cuts merged: the final review is next).
 */
export type GitFacts = { running: string[]; merged: string[]; isSlimMerged?: boolean }

/** The approval record, in the mission folder beside plan.md (approval.ts writes it). */
export const APPROVAL_FILE = 'APPROVAL.json'

/** `sha256:<hex>` of the plan's text, as read. */
export async function planHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))

  return `sha256:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

/** An approval record from its file's text; null when there is none or it cannot be read. */
export function recordOf(text: string | undefined): TroupeApproval | null {
  if (text === undefined) return null
  try {
    const record: unknown = JSON.parse(text)
    if (typeof record !== 'object' || record === null) return null
    const { planHash: hash, approvedAt } = record as Record<string, unknown>

    return typeof hash === 'string' && typeof approvedAt === 'string' ? { planHash: hash, approvedAt } : null
  } catch {
    return null
  }
}

/** Whether a record (its file's text) approves `plan` as it is now: approval.ts's rule, for both views. */
export const isApproved = async (plan: string, recordText: string | undefined): Promise<boolean> =>
  recordOf(recordText)?.planHash === (await planHash(plan))

/** The file a builder's role window writes in its worktree when its order is built; the mod copies it into the mission folder. */
export const doneMarker = (id: string) => `DONE-${id}.md`

/** A review report of order `id`: `REVIEW-<id>.md`, or `REVIEW-<id>-<n>.md` for its `n`th review. */
export const isReviewOf = (id: string, name: string) => name === `REVIEW-${id}.md` || new RegExp(`^REVIEW-${id.replace(/\W/g, '\\$&')}-\\d+\\.md$`).test(name)

/**
 * An order's state: `reviewed` with a review file, whatever its verdict, so a
 * fix round stays `reviewed`; `done` once merged onto the mission branch or
 * with its done marker; `running` while its order branch is ahead of the
 * mission branch; else `planned`.
 */
export const stateOf = (id: string, files: string[], git?: GitFacts): TroupeOrderState => {
  if (files.some(file => isReviewOf(id, file))) return 'reviewed'
  // A squash-merged order's branch stays ahead of the mission branch: merged wins.
  if (git?.merged.includes(id) || files.includes(doneMarker(id))) return 'done'

  return git?.running.includes(id) ? 'running' : 'planned'
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

/**
 * The mission's base commit: where `missionBranch` left the base branch, its
 * merge-base with origin's default branch, else with main, else with master.
 * `run` as for gitFacts. The light final-review brief and metrics.json both
 * read it, so they cannot name different commits.
 */
export async function baseOf(run: (args: string[]) => Promise<string | undefined>, missionBranch: string): Promise<{ commit: string; branch: string } | undefined> {
  const head = (await run(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']))?.trim()
  for (const branch of [head, 'main', 'master']) {
    if (!branch || branch === missionBranch) continue
    const commit = (await run(['merge-base', branch, missionBranch]))?.trim()
    if (commit) return { commit, branch }
  }

  return undefined
}

/** The mission in `dir` from its plan, the folder's file names, git's facts, and whether an approval record holds for the plan. */
export const missionOf = (dir: string, plan: PlanRead, files: string[], git?: GitFacts, isPlanApproved = false): TroupeMission => {
  const orders = plan.orders.map(({ id, kind, goal, model, dependsOn }) => ({ id, kind, goal, model, dependsOn, state: stateOf(id, files, git) }))

  return {
    dir,
    name: dir.slice(dir.lastIndexOf('/') + 1),
    title: plan.title,
    goal: plan.goal,
    step: stepOf({ problems: plan.problems, orders }, files, git?.isSlimMerged, isPlanApproved),
    hasRoles: plan.hasRoles,
    roles: plan.roles,
    orders,
    problems: plan.problems,
  }
}
