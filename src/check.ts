import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'

import { loadAgents } from './agents.ts'
import { fold, logPath, readLog } from './log.ts'
import { readPlan } from './plan.ts'
import type { Plan } from './plan.ts'
import { run } from './run.ts'
import type { Run } from './run.ts'

// `troupe check [mission]`: finds the plan and prints its problems, or that
// it is clean. Exit 0 clean, 1 with problems, 2 when there is no plan.

export const MISSIONS = 'docs/missions'

/** The repository's top folder, else `cwd` itself. */
export const rootOf = (cwd: string, runner: Run = run): string => {
  const found = runner('git', ['rev-parse', '--show-toplevel'], { cwd })

  return found.code === 0 ? found.out.trim() : cwd
}

export const textProblems = (root: string, plan: Plan): string[] => plan.roles
  .filter(role => role.text !== '' && !role.text.startsWith('workflow:') && !existsSync(join(root, role.text)))
  .map(role => `role ${role.name}: text ${role.text} is not in the repository`)

/** The plan `want` names: a plan file, a folder holding plan.md, a mission under docs/missions/, or '' for the newest open mission. */
export const findPlan = (root: string, cwd: string, want: string, runner: Run = run): { path: string } | { missing: string } => {
  if (want !== '') {
    const given = resolve(cwd, want)
    const candidates = [given, join(given, 'plan.md'), join(root, MISSIONS, want, 'plan.md')]
    const path = candidates.find(one => existsSync(one) && statSync(one).isFile())

    return path === undefined ? { missing: `no plan at ${want} (a plan file, a folder holding plan.md, or a mission under ${MISSIONS}/)` } : { path }
  }
  const common = runner('git', ['rev-parse', '--git-common-dir'], { cwd: root })
  const commonDir = resolve(root, common.code === 0 ? common.out.trim() : '.git')
  const dir = join(root, MISSIONS)
  const plans = (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [])
    .filter(entry => entry.isDirectory() && existsSync(join(dir, entry.name, 'plan.md')))
    .filter(entry => {
      const log = logPath(commonDir, entry.name)
      if (existsSync(log)) return !fold(readLog(log).events).finished
      // No log yet: a plan being written (not committed), or one committed on its own mission branch before the first gate.
      const branch = runner('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root })
      if (branch.code === 0 && branch.out.trim() === `mission/${entry.name}`) return true
      const tracked = runner('git', ['ls-tree', '--name-only', 'HEAD', '--', `${MISSIONS}/${entry.name}/plan.md`], { cwd: root })
      return tracked.code !== 0 || tracked.out.trim() === ''
    })
    .map(entry => ({ name: entry.name, at: statSync(join(dir, entry.name, 'plan.md')).mtimeMs }))
    .sort((a, b) => b.at - a.at || b.name.localeCompare(a.name, 'en', { numeric: true }))
  const newest = plans[0]

  return newest === undefined ? { missing: `no mission under ${MISSIONS}/ (no open mission yet)` } : { path: join(dir, newest.name, 'plan.md') }
}

export const check = (cwd: string, want: string, home = homedir(), runner: Run = run): { out: string; code: number } => {
  const root = rootOf(cwd, runner)
  const found = findPlan(root, cwd, want, runner)
  if ('missing' in found) return { out: `troupe check: ${found.missing}\n`, code: 2 }
  const loaded = loadAgents(root, home)
  const plan = readPlan(readFileSync(found.path, 'utf8'), loaded.agents)
  // A role's text in the repository must be there; `workflow:` texts are the skill's.
  const problems = [
    ...loaded.problems,
    ...plan.problems,
    ...textProblems(root, plan),
  ]
  const name = relative(cwd, found.path) || found.path
  if (problems.length === 0) {
    const count = plan.roles.length

    return { out: `${name}: clean (${count} role${count === 1 ? '' : 's'}: ${plan.roles.map(role => role.name).join(', ')})\n`, code: 0 }
  }

  return { out: `${name}: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n${problems.map(one => `  - ${one}\n`).join('')}`, code: 1 }
}
