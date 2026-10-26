import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { argvOf, optionOf, screenOf } from './agents.ts'
import type { Agent } from './agents.ts'
import { clean, git, mission, mux, Refusal, within } from './command-context.ts'
import type { Mission, Reply, Runtime } from './command-context.ts'
import { append, isApproved } from './log.ts'
import type { Live } from './model.ts'
import { createPane, ownedPane, rolesWindow } from './panes.ts'
import type { Role } from './plan.ts'
import { readResult, RESULT_FILE, roleState, waitingOn, workOf } from './state.ts'
import { shellOf, tmux } from './run.ts'
import { CONTEXT_FILE, statusLineCommand } from './statusline.ts'
import { tokensOf } from './usage.ts'

export const briefOf = (m: Mission, role: Role, worktree: string, branch: string): string => [
  `# ${m.name}: ${role.name}`, '',
  `Mission goal: ${m.plan.goal}`, `Why: ${m.plan.why}`, `Your goal: ${role.goal}`, '',
  `Work in ${worktree} on branch ${branch}. Do not rename the branch.`,
  `Change only these touches: ${role.touches.length > 0 ? role.touches.join(', ') : 'none; do not change repository files'}.`,
  'Commit your changes on your branch.',
  `Depends on: ${role.dependsOn.join(', ') || 'none'}.`,
  `Skills to load: ${role.skills.join(', ') || 'none'}.`, '',
  ...(m.texts.has(role.name) ? ['## Referenced instructions', '', m.texts.get(role.name) ?? '', ''] : []),
  '## Your role', '', role.section, '',
  '## Finish', '',
  `Write ${RESULT_FILE} inside your worktree (create .troupe/ if needed), with this front matter:`, '',
  '```markdown', '---', 'status: done', 'summary: "<one line>"', '---', '<What changed, how you checked it, open items for the orchestrator.>', '```', '',
  'Use status: done, blocked or failed. Then stop. The result file is ignored by git; do not commit it.', '',
].join('\n')

/** The matching dialog line from the same recent rows used by screenOf. */
/** The dialog's line, in the adapter's pattern order: a header anywhere on the visible screen beats a footer. */
export const waitsOnOf = (agent: Agent, screen: string): string | undefined => {
  const lines = screen.split(/\r?\n/).filter(line => line.trim() !== '')
  for (const pattern of agent.screen.waits) {
    const line = [...lines].reverse().find(one => new RegExp(pattern, 'm').test(one))
    if (line !== undefined) return line.trim()
  }

  return undefined
}

export const liveOf = (r: Runtime, m: Mission, role: Role): Live & { problem?: string } => {
  const opened = m.folded.roles.get(role.name)
  const pane = opened === undefined ? undefined : ownedPane(r, opened)
  const agent = m.agents[opened?.agent ?? role.agent]
  const screen = pane !== undefined && agent !== undefined ? screenOf(agent, pane.screen) : 'unknown'
  let result: ReturnType<typeof readResult>
  let work: ReturnType<typeof workOf> | undefined
  let problem = ''
  if (opened !== undefined) {
    try {
      result = readResult(opened.worktree)
      work = workOf(opened.worktree, opened.base, role.touches, r.run)
    } catch (error) {
      problem = (error as Error).message
    }
  }
  const lines = (pane?.screen ?? '').split(/\r?\n/)
  while (lines.at(-1)?.trim() === '') lines.pop()
  const waitsOn = pane === undefined || agent === undefined ? undefined : waitsOnOf(agent, pane.screen)
  const tokens = opened?.worktree && agent?.usage ? tokensOf(agent.usage, opened.worktree, opened.at, r.home) : undefined

  return {
    state: roleState({ opened: opened !== undefined, closed: opened?.closed, result, pane, screen }),
    work, result, screen: lines.slice(-20), waitsOn, ...(problem ? { problem } : {}), ...(tokens === undefined ? {} : { tokens }),
  }
}

export const statusOf = (r: Runtime, m: Mission) => {
  const roles = m.plan.roles.map(role => {
    const opened = m.folded.roles.get(role.name)
    const { state, work, result, problem, tokens } = liveOf(r, m, role)

    return {
      name: role.name, agent: opened?.agent ?? role.agent, state,
      branch: opened?.branch ?? '', pane: opened?.pane ?? '', worktree: opened?.worktree ?? '',
      commits: work?.commits ?? [], changed: work?.changed ?? [], outside: work?.outside ?? [],
      summary: result?.summary ?? '', ...(result?.problem ? { resultProblem: result.problem } : {}), ...(problem ? { problem } : {}), ...(tokens === undefined ? {} : { tokens }),
    }
  })

  return { mission: m.name, stage: m.folded.stage, roles, gates: [...m.folded.gates.values()].filter(gate => gate.answer === undefined), problems: m.problems }
}

const approved = (m: Mission): void => {
  clean(m)
  if (!isApproved(m.folded, m.hash)) throw new Refusal('the plan as it is now is not approved; run troupe approve from a terminal')
}

const prepareWorktree = (r: Runtime, m: Mission, worktree: string, branch: string, base: string): void => {
  const exclude = join(m.common, 'info/exclude')
  mkdirSync(dirname(exclude), { recursive: true })
  if (!existsSync(exclude) || !readFileSync(exclude, 'utf8').split(/\r?\n/).includes('/.troupe/')) appendFileSync(exclude, '\n/.troupe/\n')
  const entries = git(r, m.root, ['worktree', 'list', '--porcelain', '-z']).split('\0\0')
  const existing = entries.find(entry => entry.split('\0').includes(`worktree ${worktree}`))
  if (existing !== undefined) {
    if (!existing.split('\0').includes(`branch refs/heads/${branch}`)) throw new Refusal(`${worktree} is on a different branch`)
    return
  }
  if (existsSync(worktree)) throw new Refusal(`${worktree} exists but is not the role's registered worktree`)
  mkdirSync(dirname(worktree), { recursive: true })
  const hasBranch = r.run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: m.root }).code === 0
  git(r, m.root, ['worktree', 'add', ...(hasBranch ? [] : ['-b', branch]), worktree, hasBranch ? branch : base])
}

/** Git needs its own index plus shared objects and this mission's loose refs/reflogs. */
export const gitDirsOf = (r: Runtime, m: Mission, role: Role, worktree: string): string[] => {
  const agent = m.agents[role.agent]
  const mode = optionOf(role.flags, ['-s', '--sandbox'])?.value
  if (agent === undefined || basename(agent.command) !== 'codex' || mode !== 'workspace-write' || role.flags.includes('--dangerously-bypass-approvals-and-sandbox')) return []
  const dirs = [git(r, worktree, ['rev-parse', '--absolute-git-dir']).trim(), join(m.common, 'objects'),
    join(m.common, 'refs/heads/role', m.name), join(m.common, 'logs/refs/heads/role', m.name)]
  for (const dir of dirs) mkdirSync(dir, { recursive: true })

  return dirs
}

/** A Claude role reports its real context window through a status line that then shows the person's own. */
export const contextArgs = (r: Runtime, m: Mission, agent: Agent, worktree: string): string[] => {
  if (agent.usage !== 'claude') return []
  const forward = statusLineCommand(m.root, r.home)
  const command = shellOf([process.execPath, join(r.packageRoot, 'dist/cli.js'), 'statusline', join(worktree, CONTEXT_FILE), ...(forward === undefined ? [] : [forward])])

  return ['--settings', JSON.stringify({ statusLine: { type: 'command', command } })]
}

export const dispatch = async (r: Runtime, initial: Mission, name: string): Promise<Reply> => {
  const m = mission(r, initial.name)
  approved(m)
  const role = m.plan.roles.find(role => role.name === name)
  if (role === undefined) throw new Refusal(`unknown role: ${name}`)
  const previous = m.folded.roles.get(name)
  if (previous !== undefined && !previous.closed) {
    const pane = ownedPane(r, previous)
    if (pane.alive && !pane.dead) throw new Refusal(`role ${name} is already open in ${previous.pane}`)
  }
  const states = new Map(statusOf(r, m).roles.map(role => [role.name, role.state]))
  const deps = waitingOn(role, states)
  if (deps.length > 0) throw new Refusal(`role ${name} waits for done dependencies: ${deps.join(', ')}`)
  const worktree = within(m.root, `.troupe/worktrees/${m.name}/${name}`)
  const branch = `role/${m.name}/${name}`
  const base = previous?.base ?? git(r, m.root, ['rev-parse', '--verify', '--end-of-options', `${m.plan.base || 'HEAD'}^{commit}`]).trim()
  prepareWorktree(r, m, worktree, branch, base)
  const brief = join(worktree, '.troupe/brief.md')
  const briefText = briefOf(m, role, worktree, branch)
  mkdirSync(dirname(brief), { recursive: true })
  writeFileSync(brief, briefText)
  writeFileSync(join(dirname(m.log), `brief-${name}.md`), briefText)
  const current = mission(r, m.name)
  approved(current)
  if (current.hash !== m.hash) throw new Refusal('the plan changed during dispatch; retry after approving it')
  const oldResult = join(worktree, RESULT_FILE)
  if (existsSync(oldResult)) renameSync(oldResult, join(dirname(m.log), `result-${name}-${randomUUID()}.md`))
  // A retained dead pane is still troupe's; remove it before a replacement.
  if (previous !== undefined && !previous.closed && ownedPane(r, previous).alive) mux(r, ['kill-pane', '-t', previous.pane])
  const window = rolesWindow(r, m)
  const agent = m.agents[role.agent]
  if (agent === undefined) throw new Refusal(`unknown agent: ${role.agent}`)
  const argv = argvOf(agent, role, `Read the brief in ${brief} and follow it.`, gitDirsOf(r, m, role, worktree), contextArgs(r, m, agent, worktree))
  const opened = createPane(r, m, name, worktree, argv, window, undefined, 'roles')
  try {
    append(m.log, 'cli', { ev: 'dispatch', role: name, ...opened, worktree, branch, base, argv, agent: role.agent })
  } catch (error) {
    if (ownedPane(r, opened).alive) tmux(['kill-pane', '-t', opened.pane], r.run, r.env)
    throw error
  }
  mux(r, ['select-layout', '-t', opened.window, 'tiled'])

  return { code: 0, out: `Dispatched ${name} to ${opened.pane}; ${worktree} on ${branch}\n` }
}

export const send = async (r: Runtime, initial: Mission, name: string, text: string): Promise<Reply> => {
  const m = mission(r, initial.name)
  const opened = m.folded.roles.get(name)
  if (opened === undefined || opened.closed) throw new Refusal(`role ${name}: no open pane recorded by troupe`)
  const role = m.plan.roles.find(role => role.name === name)
  const agent = m.agents[opened.agent ?? role?.agent ?? '']
  if (agent === undefined || agent.command !== opened.argv[0]) throw new Refusal(`role ${name}: its launched adapter cannot be resolved`)
  const ready = () => {
    const pane = ownedPane(r, opened)
    if (!pane.alive || pane.dead) throw new Refusal(`role ${name}: pane is gone or its agent exited`)
    const state = screenOf(agent, pane.screen)
    if (state !== 'ready') throw new Refusal(`role ${name}: pane is ${state}; nothing was typed${state === 'unknown' || state === 'working' ? `; run troupe wait -m ${m.name} --role ${name} --ready [--timeout s]` : ''}`)
  }
  ready()
  const buffer = `troupe-${randomUUID()}`
  try {
    mux(r, ['load-buffer', '-b', buffer, '-'], { input: text })
    ready()
    // New work: the old result goes aside, so `troupe wait --role` waits for the new one.
    const oldResult = join(opened.worktree, RESULT_FILE)
    if (existsSync(oldResult)) renameSync(oldResult, join(dirname(m.log), `result-${name}-${randomUUID()}.md`))
    mux(r, ['paste-buffer', '-p', '-d', '-b', buffer, '-t', opened.pane])
    mux(r, ['send-keys', '-t', opened.pane, 'Enter'])
  } finally {
    tmux(['delete-buffer', '-b', buffer], r.run, r.env)
  }
  append(m.log, 'cli', { ev: 'send', role: name, text })

  return { code: 0, out: `Sent to ${name} (${opened.pane})\n` }
}

export const close = async (r: Runtime, initial: Mission, name?: string): Promise<Reply> => {
  const m = mission(r, initial.name)
  const names = name === undefined ? [...m.folded.roles.keys()] : [name]
  const lines: string[] = []
  for (const role of names) {
    const opened = m.folded.roles.get(role)
    if (opened === undefined) throw new Refusal(`role ${role}: troupe never opened a pane`)
    if (opened.closed) continue
    const pane = ownedPane(r, opened)
    if (pane.alive) mux(r, ['kill-pane', '-t', opened.pane])
    append(m.log, 'cli', { ev: 'close', role })
    lines.push(`Closed ${role}; kept ${opened.worktree} on ${opened.branch}`)
  }

  return { code: 0, out: `${lines.join('\n') || 'No open roles.'}\n` }
}

/** Preflight every resource before cleanup; a refused or interrupted run stays open. */
export const teardown = async (r: Runtime, initial: Mission, force: boolean): Promise<Reply> => {
  const m = mission(r, initial.name)
  if (m.problems.some(problem => problem.includes('unread log'))) throw new Refusal('unread log lines; cannot establish teardown ownership')
  const parent = within(m.root, `.troupe/worktrees/${m.name}`)
  const prefix = `role/${m.name}/`
  const target = m.plan.base || `mission/${m.name}`
  const entries = git(r, m.root, ['worktree', 'list', '--porcelain', '-z']).split('\0\0').filter(Boolean).map(entry => {
    const fields = entry.split('\0')
    return { path: fields.find(field => field.startsWith('worktree '))?.slice(9) ?? '', branch: fields.find(field => field.startsWith('branch refs/heads/'))?.slice(18) ?? '' }
  })
  const branches = git(r, m.root, ['for-each-ref', '--format=%(refname:short)', `refs/heads/${prefix}`]).trim().split('\n').filter(branch => branch.startsWith(prefix))
  const trees = entries.filter(entry => entry.branch.startsWith(prefix) || resolve(dirname(entry.path)) === parent)
  const reasons: string[] = []
  for (const tree of trees) {
    if (resolve(dirname(tree.path)) !== parent || !tree.branch.startsWith(prefix)) reasons.push(`${tree.path}: unexpected worktree location or branch; remove manually`)
    else if (!force && existsSync(tree.path) && git(r, tree.path, ['status', '--porcelain', '--untracked-files=all']).trim()) reasons.push(`${tree.branch}: dirty or untracked changes in ${tree.path}`)
  }
  for (const branch of branches) {
    if (branch === target) reasons.push(`${branch}: is the mission branch; cannot remove`)
    else if (!force) {
      const merged = r.run('git', ['merge-base', '--is-ancestor', `refs/heads/${branch}`, target], { cwd: m.root })
      if (merged.code !== 0) reasons.push(`${branch}: unmerged into ${target}${merged.err.trim() ? ` (${merged.err.trim()})` : ''}`)
    }
  }
  // Unknown files are never recursively swept up, even with --force.
  if (existsSync(parent)) for (const name of readdirSync(parent)) {
    if (!trees.some(tree => resolve(tree.path) === join(parent, name))) reasons.push(`${join(parent, name)}: not a registered role worktree; remove manually`)
  }
  if (reasons.length) throw new Refusal(`Teardown refused:\n${reasons.map(reason => `- ${reason}`).join('\n')}`)
  let removed = 0
  for (const opened of m.folded.roles.values()) {
    if (opened.closed) continue
    const pane = ownedPane(r, opened)
    if (pane.alive) { mux(r, ['kill-pane', '-t', opened.pane]); removed++ }
    append(m.log, 'cli', { ev: 'close', role: opened.role })
  }
  // Agents can finish a write or commit while their panes are closing. Check
  // again after stopping them, before deleting any worktree or branch.
  if (!force) {
    for (const tree of trees) {
      if (existsSync(tree.path) && git(r, tree.path, ['status', '--porcelain', '--untracked-files=all']).trim()) throw new Refusal(`${tree.branch}: dirty or untracked changes appeared during teardown`)
    }
    for (const branch of branches) {
      if (r.run('git', ['merge-base', '--is-ancestor', `refs/heads/${branch}`, target], { cwd: m.root }).code !== 0) throw new Refusal(`${branch}: unmerged into ${target}; teardown remains incomplete`)
    }
  }
  for (const tree of trees) {
    git(r, m.root, ['worktree', 'remove', ...(force ? ['--force'] : []), tree.path])
    removed++
  }
  for (const branch of branches) {
    // Ancestry was checked against the mission branch, rather than HEAD.
    git(r, m.root, ['branch', '-D', branch])
    removed++
  }
  if (existsSync(parent)) { rmdirSync(parent); removed++ }
  for (const file of readdirSync(dirname(m.log))) {
    if (/^(brief-.+|result-.+)\.md$/.test(file)) { rmSync(join(dirname(m.log), file)); removed++ }
  }
  if (!m.folded.finished) append(m.log, 'cli', { ev: 'teardown' })
  return { code: 0, out: removed ? `Tore down ${m.name}; kept mission branch ${target} and ${m.log}\n` : `Nothing left to tear down for ${m.name}.\n` }
}
