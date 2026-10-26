import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { loadAgents } from './agents.ts'
import { MISSIONS, rootOf, textProblems } from './check.ts'
import { excludeTroupe, git, mux, NAME, Refusal, repository, roleText, Usage, within, workflowDirs } from './command-context.ts'
import type { Mission, Repository, Runtime } from './command-context.ts'
import { fold, logPath, readLog } from './log.ts'
import { callerPane } from './panes.ts'
import { readPlan } from './plan.ts'
import { tmux } from './run.ts'
import { planHash } from './state.ts'

// Several missions can be open at once. Each has its own worktree on branch
// `mission/<m>` and is bound to its orchestrator's pane (`@troupe-mission`,
// with the repository's common git dir in `@troupe-mission-repo`, so a pane
// in another repository never matches). A panel pane names its orchestrator
// in `@troupe-panel-orchestrator` and follows that pane's binding.

/** No mission could be resolved for the caller; the message lists the open ones. */
export class Unresolved extends Refusal {
  readonly open: { name: string; worktree: string }[]
  constructor(message: string, open: { name: string; worktree: string }[]) {
    super(message)
    this.open = open
  }
}

export const missionTree = (repo: Repository, name: string): string => join(repo.root, '.troupe/missions', name)

/** Each worktree on a `mission/<m>` branch, by mission name. */
export const missionTrees = (r: Runtime, repo: Repository): Map<string, string> => {
  const trees = new Map<string, string>()
  for (const entry of git(r, repo.root, ['worktree', 'list', '--porcelain', '-z']).split('\0\0')) {
    const fields = entry.split('\0')
    const path = fields.find(field => field.startsWith('worktree '))?.slice('worktree '.length)
    const name = fields.find(field => field.startsWith('branch refs/heads/mission/'))?.slice('branch refs/heads/mission/'.length)
    if (path && name && NAME.test(name)) trees.set(name, path)
  }

  return trees
}

export const finished = (repo: Repository, name: string): boolean => {
  const log = logPath(repo.common, name)

  return existsSync(log) && fold(readLog(log).events).finished
}

/** Missions with a worktree on their branch or a log, and no teardown yet. */
export const openMissions = (r: Runtime, repo: Repository): { name: string; worktree: string }[] => {
  const trees = missionTrees(r, repo)
  const dir = join(repo.common, 'troupe')
  const logged = existsSync(dir) ? readdirSync(dir).filter(name => NAME.test(name) && existsSync(logPath(repo.common, name))) : []

  return [...new Set([...trees.keys(), ...logged])].filter(name => !finished(repo, name)).sort()
    .map(name => ({ name, worktree: trees.get(name) ?? '' }))
}

export type Marked = { pane: string; mission: string; repo: string; panel: string; orchestrator: string; token: string }
const MARKS = ['#{pane_id}', '#{pane_dead}', '#{@troupe-mission}', '#{@troupe-mission-repo}', '#{@troupe-panel}', '#{@troupe-panel-orchestrator}', '#{@troupe-orchestrator-token}'].join('\t')

/** Every live pane (and dead ones too when asked) with its troupe marks. */
export const markedPanes = (r: Runtime, dead = false): Marked[] => {
  const found = tmux(['list-panes', '-a', '-F', MARKS], r.run, r.env)
  if (found.code !== 0) return []

  return found.out.split('\n').flatMap(line => {
    const [pane = '', gone, mission = '', repo = '', panel = '', orchestrator = '', token = ''] = line.split('\t')

    return /^%\d+$/.test(pane) && (dead || gone === '0') ? [{ pane, mission, repo, panel, orchestrator, token }] : []
  })
}

/** The mission `pane` is bound to in this repository: a panel's through its orchestrator first, else its own mark. */
export const boundTo = (panes: Marked[], repo: Repository, pane: string): string => {
  const own = panes.find(one => one.pane === pane)
  if (own === undefined) return ''
  const orchestrator = own.panel !== '' && own.orchestrator !== '' ? panes.find(one => one.pane === own.orchestrator) : undefined
  const via = orchestrator?.repo === repo.common ? orchestrator.mission : ''

  return via || (own.repo === repo.common ? own.mission : '')
}

/**
 * The open mission `pane`'s own marks name, in whichever repository they
 * name, with that repository's main checkout; empty when none.
 */
export const heldBy = (r: Runtime, panes: Marked[], pane: string): { name: string; root: string } => {
  const own = panes.find(one => one.pane === pane)
  if (own === undefined || own.panel !== '' || own.mission === '' || own.repo === '') return { name: '', root: '' }
  const repo = { root: basename(own.repo) === '.git' ? dirname(own.repo) : own.repo, common: own.repo }
  let open = false
  try { open = openMissions(r, repo).some(one => one.name === own.mission) } catch { /* A repository that is gone holds no open mission. */ }

  return open ? { name: own.mission, root: repo.root } : { name: '', root: '' }
}

/** The orchestrator panes bound to `name` (panels carry the mission too, but are not orchestrators). */
export const orchestratorsOf = (panes: Marked[], repo: Repository, name: string): Marked[] =>
  panes.filter(one => one.panel === '' && one.repo === repo.common && one.mission === name)

export const markMission = (r: Runtime, repo: Repository, pane: string, name: string): void => {
  mux(r, ['set-option', '-p', '-t', pane, '@troupe-mission', name])
  mux(r, ['set-option', '-p', '-t', pane, '@troupe-mission-repo', repo.common])
}

export const unbind = (r: Runtime, pane: string): void => {
  for (const option of ['@troupe-mission', '@troupe-mission-repo', '@troupe-orchestrator-token']) mux(r, ['set-option', '-p', '-u', '-t', pane, option])
}

/** The caller's pane, also when it runs outside tmux's variables; found at the current worktree's top. */
export const callerOf = (r: Runtime): string | undefined => callerPane(r, rootOf(r.cwd, r.run))

/**
 * The mission a command acts on, in order: `-m`; the caller pane's binding;
 * a panel's orchestrator's binding; the current worktree's `mission/<m>`
 * branch. `-m` naming another mission than the caller's binding refuses.
 */
export const resolveMission = (r: Runtime, repo: Repository, want: string): string => {
  const caller = callerOf(r)
  const bound = caller === undefined ? '' : boundTo(markedPanes(r), repo, caller)
  if (want !== '') {
    if (bound !== '' && bound !== want) throw new Refusal(`this pane runs mission ${bound}; -m ${want} names another`)
    return want
  }
  if (bound !== '') return bound
  const head = r.run('git', ['symbolic-ref', '-q', '--short', 'HEAD'], { cwd: r.cwd })
  const branch = head.code === 0 ? head.out.trim() : ''
  const name = branch.startsWith('mission/') ? branch.slice('mission/'.length) : ''
  if (NAME.test(name) && !finished(repo, name)) return name
  const open = openMissions(r, repo)

  throw new Unresolved(`no mission for this pane; pass -m <mission>${open.length === 0 ? ' (no open mission)'
    : `. Open missions:\n${open.map(one => `  ${one.name}  ${one.worktree || '(no worktree)'}`).join('\n')}`}`, open)
}

/** The mission's plan: in its worktree, else in the current worktree, else in the main checkout. */
export const planOf = (r: Runtime, repo: Repository, name: string): string | undefined =>
  [missionTrees(r, repo).get(name), rootOf(r.cwd, r.run), repo.root]
    .flatMap(dir => dir === undefined ? [] : [join(dir, MISSIONS, name, 'plan.md')])
    .find(path => existsSync(path) && statSync(path).isFile())

export const mission = (r: Runtime, want = ''): Mission => {
  if (want !== '' && !NAME.test(want)) throw new Usage('mission must be a folder name under docs/missions')
  const repo = repository(r)
  const name = resolveMission(r, repo, want)
  const path = planOf(r, repo, name)
  if (path === undefined) throw new Refusal(`no plan for mission ${name} (${MISSIONS}/${name}/plan.md in its worktree)`)
  const worktree = dirname(dirname(dirname(dirname(path))))
  const loaded = loadAgents(worktree, r.home)
  const source = readFileSync(path)
  const plan = readPlan(source.toString('utf8'), loaded.agents)
  const problems = [...loaded.problems, ...plan.problems, ...textProblems(worktree, plan)]
  const texts = new Map<string, string>()
  const refs = plan.roles.filter(role => role.text !== '').map(role => {
    try {
      const text = roleText(r, worktree, plan.workflow, role.text)
      if (text.bytes === undefined) problems.push(`role ${role.name}: missing text ${role.text}`)
      else texts.set(role.name, text.bytes)

      return text
    } catch (error) {
      problems.push(`role ${role.name}: ${(error as Error).message}`)

      return { ref: role.text, bytes: undefined }
    }
  })
  const log = logPath(repo.common, name)
  const read = readLog(log)
  if (read.unread > 0) problems.push(`${log}: ${read.unread} unread log line(s)`)

  return { ...repo, name, worktree, path, source: source.toString('utf8'), plan, agents: loaded.agents, problems, hash: planHash(source, refs), log, events: read.events, folded: fold(read.events), texts }
}

/**
 * Creates the mission's worktree on a new `mission/<m>` branch, cut from the
 * main checkout's current branch (or `base`), with the skill's plan template.
 * The main checkout's branch never changes.
 */
export const newMission = (r: Runtime, repo: Repository, name: string, base: string): string => {
  if (!NAME.test(name)) throw new Refusal(`invalid mission name: ${name}`)
  const branch = `mission/${name}`
  const worktree = within(repo.root, `.troupe/missions/${name}`)
  if (existsSync(logPath(repo.common, name))) throw new Refusal(`mission ${name} already has a log: ${logPath(repo.common, name)}`)
  if (r.run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: repo.root }).code === 0) throw new Refusal(`branch ${branch} already exists`)
  if (missionTrees(r, repo).has(name) || existsSync(worktree)) throw new Refusal(`mission ${name} already has a worktree`)
  const template = workflowDirs(r, 'troupe-mission').map(dir => join(dir, 'templates/plan.md')).find(path => existsSync(path))
  if (template === undefined) throw new Refusal('the troupe-mission plan template is missing; run troupe setup')
  const current = r.run('git', ['symbolic-ref', '-q', '--short', 'HEAD'], { cwd: repo.root })
  const from = base || (current.code === 0 && current.out.trim()) || 'HEAD'
  const commit = git(r, repo.root, ['rev-parse', '--verify', '--end-of-options', `${from}^{commit}`]).trim()
  excludeTroupe(repo.common)
  mkdirSync(dirname(worktree), { recursive: true })
  git(r, repo.root, ['worktree', 'add', '-b', branch, worktree, commit])
  const plan = join(worktree, MISSIONS, name, 'plan.md')
  mkdirSync(dirname(plan), { recursive: true })
  writeFileSync(plan, readFileSync(template, 'utf8').replace(/^base: *\S*/m, `base: ${branch}`))

  return worktree
}

/** Removes a mission worktree that was just created, with its branch, after a failed start. */
export const dropMission = (r: Runtime, repo: Repository, name: string, worktree: string): void => {
  r.run('git', ['worktree', 'remove', '--force', worktree], { cwd: repo.root })
  r.run('git', ['branch', '-D', `mission/${name}`], { cwd: repo.root })
}

/** Open missions with their worktree, orchestrator pane and panel pane. */
export const missionList = (r: Runtime, repo: Repository) => {
  const panes = markedPanes(r)

  return openMissions(r, repo).map(one => ({
    ...one,
    orchestrator: orchestratorsOf(panes, repo, one.name)[0]?.pane ?? '',
    panel: panes.find(pane => pane.panel === repo.root && boundTo(panes, repo, pane.pane) === one.name)?.pane ?? '',
  }))
}
