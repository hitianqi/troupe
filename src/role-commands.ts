import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { argvOf, screenOf } from './agents.ts'
import { clean, git, locked, mission, mux, Refusal, within } from './command-context.ts'
import type { Mission, Reply, Runtime } from './command-context.ts'
import { append, isApproved } from './log.ts'
import { createPane, ownedPane, rolesWindow } from './panes.ts'
import type { Role } from './plan.ts'
import { readResult, RESULT_FILE, roleState, waitingOn, workOf } from './state.ts'
import { tmux } from './run.ts'

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

export const statusOf = (r: Runtime, m: Mission) => {
  const roles = m.plan.roles.map(role => {
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
    if (pane?.foreign) problem = 'recorded pane ownership cannot be verified'

    return {
      name: role.name, agent: opened?.agent ?? role.agent,
      state: roleState({ opened: opened !== undefined, closed: opened?.closed, result, pane, screen }),
      branch: opened?.branch ?? '', pane: opened?.pane ?? '', worktree: opened?.worktree ?? '',
      commits: work?.commits ?? [], changed: work?.changed ?? [], outside: work?.outside ?? [],
      summary: result?.summary ?? '', ...(result?.problem ? { resultProblem: result.problem } : {}), ...(problem ? { problem } : {}),
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

export const dispatch = async (r: Runtime, initial: Mission, name: string): Promise<Reply> => locked(initial, () => {
  const m = mission(r, initial.name)
  approved(m)
  const role = m.plan.roles.find(role => role.name === name)
  if (role === undefined) throw new Refusal(`unknown role: ${name}`)
  const previous = m.folded.roles.get(name)
  if (previous !== undefined && !previous.closed) {
    const pane = ownedPane(r, previous)
    if (pane.foreign) throw new Refusal(`role ${name}: recorded pane ownership cannot be verified`)
    if (pane.alive && !pane.dead) throw new Refusal(`role ${name} is already open in ${previous.pane}`)
  }
  const states = new Map(statusOf(r, m).roles.map(role => [role.name, role.state]))
  const deps = waitingOn(role, states)
  if (deps.length > 0) throw new Refusal(`role ${name} waits for done dependencies: ${deps.join(', ')}`)
  const worktree = within(m.root, `.troupe/worktrees/${m.name}/${name}`)
  const branch = `role/${m.name}/${name}`
  const base = previous?.base ?? git(r, m.root, ['rev-parse', '--verify', '--end-of-options', `${m.plan.base || 'HEAD'}^{commit}`]).trim()
  prepareWorktree(r, m, worktree, branch, base)
  const brief = join(dirname(m.log), `brief-${name}.md`)
  writeFileSync(brief, briefOf(m, role, worktree, branch))
  const current = mission(r, m.name)
  approved(current)
  if (current.hash !== m.hash) throw new Refusal('the plan changed during dispatch; retry after approving it')
  const oldResult = join(worktree, RESULT_FILE)
  if (existsSync(oldResult)) renameSync(oldResult, join(dirname(m.log), `result-${name}-${randomUUID()}.md`))
  // A retained dead pane is still troupe's; remove it before a replacement.
  if (previous !== undefined && !previous.closed && ownedPane(r, previous).alive) mux(r, ['kill-pane', '-t', previous.pane])
  const window = rolesWindow(r, { ...m, folded: { ...m.folded, roles: new Map([...m.folded.roles].filter(([key]) => key !== name)) } })
  const agent = m.agents[role.agent]
  if (agent === undefined) throw new Refusal(`unknown agent: ${role.agent}`)
  const argv = argvOf(agent, role, `Read the brief in ${brief} and follow it.`)
  const opened = createPane(r, m, name, worktree, argv, window, false, 'roles')
  try {
    append(m.log, 'cli', { ev: 'dispatch', role: name, ...opened, worktree, branch, base, argv, agent: role.agent, socket: r.env.TROUPE_TMUX_SOCKET ?? '' })
  } catch (error) {
    if (ownedPane(r, opened).alive) tmux(['kill-pane', '-t', opened.pane], r.run, r.env)
    throw error
  }
  mux(r, ['select-layout', '-t', opened.window, 'tiled'])

  return { code: 0, out: `Dispatched ${name} to ${opened.pane}; ${worktree} on ${branch}\n` }
})

export const send = async (r: Runtime, initial: Mission, name: string, text: string): Promise<Reply> => locked(initial, () => {
  const m = mission(r, initial.name)
  const opened = m.folded.roles.get(name)
  if (opened === undefined || opened.closed) throw new Refusal(`role ${name}: no open pane recorded by troupe`)
  const role = m.plan.roles.find(role => role.name === name)
  const agent = m.agents[opened.agent ?? role?.agent ?? '']
  if (agent === undefined || agent.command !== opened.argv[0]) throw new Refusal(`role ${name}: its launched adapter cannot be resolved`)
  const ready = () => {
    const pane = ownedPane(r, opened)
    if (pane.foreign) throw new Refusal(`role ${name}: pane was not opened by troupe (ownership mismatch)`)
    if (!pane.alive || pane.dead) throw new Refusal(`role ${name}: pane is gone or its agent exited`)
    const state = screenOf(agent, pane.screen)
    if (state !== 'ready') throw new Refusal(`role ${name}: pane is ${state}; nothing was typed`)
  }
  ready()
  const buffer = `troupe-${randomUUID()}`
  try {
    mux(r, ['load-buffer', '-b', buffer, '-'], { input: text })
    ready()
    mux(r, ['paste-buffer', '-p', '-d', '-b', buffer, '-t', opened.pane])
    mux(r, ['send-keys', '-t', opened.pane, 'Enter'])
  } finally {
    tmux(['delete-buffer', '-b', buffer], r.run, r.env)
  }
  append(m.log, 'cli', { ev: 'send', role: name, text })

  return { code: 0, out: `Sent to ${name} (${opened.pane})\n` }
})

export const close = async (r: Runtime, initial: Mission, name?: string): Promise<Reply> => locked(initial, () => {
  const m = mission(r, initial.name)
  const names = name === undefined ? [...m.folded.roles.keys()] : [name]
  const lines: string[] = []
  for (const role of names) {
    const opened = m.folded.roles.get(role)
    if (opened === undefined) throw new Refusal(`role ${role}: troupe never opened a pane`)
    if (!opened.closed && ownedPane(r, opened).foreign) throw new Refusal(`role ${role}: pane ownership cannot be verified; not closed`)
  }
  for (const role of names) {
    const opened = m.folded.roles.get(role)
    if (opened === undefined) throw new Refusal(`role ${role}: troupe never opened a pane`)
    if (opened.closed) continue
    const pane = ownedPane(r, opened)
    if (pane.foreign) throw new Refusal(`role ${role}: pane ownership cannot be verified; not closed`)
    if (pane.alive) mux(r, ['kill-pane', '-t', opened.pane])
    append(m.log, 'cli', { ev: 'close', role })
    lines.push(`Closed ${role}; kept ${opened.worktree} on ${opened.branch}`)
  }

  return { code: 0, out: `${lines.join('\n') || 'No open roles.'}\n` }
})
