import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { readPlan } from './plan.ts'

// `troupe check [mission]`: finds the plan and prints its problems, or that
// it is clean. Exit 0 clean, 1 with problems, 2 when there is no plan.

export const MISSIONS = 'docs/missions'

/** The repository's top folder, else `cwd` itself. */
export const rootOf = (cwd: string): string => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return cwd
  }
}

/** The plan `want` names: a plan file, a folder holding plan.md, a mission under docs/missions/, or '' for the one whose plan.md changed last. */
export const findPlan = (root: string, cwd: string, want: string): { path: string } | { missing: string } => {
  if (want !== '') {
    const given = resolve(cwd, want)
    const candidates = [given, join(given, 'plan.md'), join(root, MISSIONS, want, 'plan.md')]
    const path = candidates.find(one => existsSync(one) && statSync(one).isFile())

    return path === undefined ? { missing: `no plan at ${want} (a plan file, a folder holding plan.md, or a mission under ${MISSIONS}/)` } : { path }
  }
  const dir = join(root, MISSIONS)
  const plans = (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [])
    .filter(entry => entry.isDirectory() && existsSync(join(dir, entry.name, 'plan.md')))
    .map(entry => ({ name: entry.name, at: statSync(join(dir, entry.name, 'plan.md')).mtimeMs }))
    .sort((a, b) => b.at - a.at || b.name.localeCompare(a.name, 'en', { numeric: true }))
  const newest = plans[0]

  return newest === undefined ? { missing: `no mission under ${MISSIONS}/` } : { path: join(dir, newest.name, 'plan.md') }
}

export const check = (cwd: string, want: string): { out: string; code: number } => {
  const root = rootOf(cwd)
  const found = findPlan(root, cwd, want)
  if ('missing' in found) return { out: `troupe check: ${found.missing}\n`, code: 2 }
  const plan = readPlan(readFileSync(found.path, 'utf8'))
  // A role's text in the repository must be there; `workflow:` texts are the skill's.
  const problems = [
    ...plan.problems,
    ...plan.roles
      .filter(role => role.text !== '' && !role.text.startsWith('workflow:') && !existsSync(join(root, role.text)))
      .map(role => `role ${role.name}: text ${role.text} is not in the repository`),
  ]
  const name = relative(cwd, found.path) || found.path
  if (problems.length === 0) {
    const count = plan.roles.length

    return { out: `${name}: clean (${count} role${count === 1 ? '' : 's'}: ${plan.roles.map(role => role.name).join(', ')})\n`, code: 0 }
  }

  return { out: `${name}: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n${problems.map(one => `  - ${one}\n`).join('')}`, code: 1 }
}
