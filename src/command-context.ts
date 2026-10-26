import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Agent } from './agents.ts'
import { rootOf } from './check.ts'
import type { Folded, Logged } from './log.ts'
import type { Plan } from './plan.ts'
import { run, tmux } from './run.ts'
import type { Ran, Run, RunOptions } from './run.ts'
import { DEFAULT_STAGES, readStages } from './stages.ts'

export type Reply = { out: string; code: number }
export class Refusal extends Error {}
export class Usage extends Error {}
export const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

export type Runtime = {
  cwd: string
  platform: NodeJS.Platform
  pid: number
  home: string
  packageRoot: string
  env: NodeJS.ProcessEnv
  run: Run
  inputTTY: boolean
  outputTTY: boolean
  input: () => Promise<string>
  ask: (question: string) => Promise<string>
  write: (text: string) => void
  sleep: (ms: number) => Promise<void>
  now: () => number
  signal?: AbortSignal
}

export const runtime = (overrides: Partial<Runtime> = {}): Runtime => {
  const env = overrides.env ?? process.env

  return {
    cwd: process.cwd(), platform: process.platform, pid: process.pid, home: homedir(), packageRoot: PACKAGE_ROOT, env,
    run: (command, args, options) => run(command, args, { ...options, env }),
    inputTTY: !!process.stdin.isTTY, outputTTY: !!process.stdout.isTTY,
    input: async () => {
      let text = ''
      for await (const chunk of process.stdin) text += String(chunk)

      return text
    },
    ask: async () => { throw new Refusal('interactive input is unavailable') },
    write: text => process.stdout.write(text),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    now: Date.now,
    ...overrides,
  }
}

export const ok = (result: Ran, what: string): string => {
  if (result.code !== 0) throw new Refusal(`${what}: ${result.err.trim() || `exit ${result.code}`}`)

  return result.out
}
export const git = (r: Runtime, cwd: string, args: string[]): string => ok(r.run('git', args, { cwd }), 'git')
export const mux = (r: Runtime, args: string[], options?: RunOptions): string => ok(tmux(args, r.run, r.env, options), 'tmux')

/** `root` is the main checkout, where mission and role worktrees live, from any worktree of the repository. */
export type Repository = { root: string; common: string }
export const repository = (r: Runtime): Repository => {
  const top = rootOf(r.cwd, r.run)
  const common = resolve(top, git(r, top, ['rev-parse', '--git-common-dir']).trim())

  return { root: basename(common) === '.git' ? dirname(common) : top, common }
}

/** Keeps troupe's worktrees out of the main checkout's status. */
export const excludeTroupe = (common: string): void => {
  const exclude = join(common, 'info/exclude')
  mkdirSync(dirname(exclude), { recursive: true })
  if (!existsSync(exclude) || !readFileSync(exclude, 'utf8').split(/\r?\n/).includes('/.troupe/')) appendFileSync(exclude, '\n/.troupe/\n')
}

/** A repo/skill reference cannot escape its root, including through a symlink. */
export const within = (root: string, ref: string): string => {
  const path = resolve(root, ref)
  const inside = (base: string, dest: string) => {
    const rel = relative(base, dest)

    return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  }
  let parent = path
  while (!existsSync(parent) && parent !== dirname(parent)) parent = dirname(parent)
  if (!inside(root, path) || !inside(realpathSync(root), realpathSync(parent))) throw new Refusal(`path is outside ${root}: ${ref}`)

  return path
}

export const workflowDirs = (r: Runtime, name: string): string[] => {
  if (!NAME.test(name)) throw new Refusal(`invalid workflow name: ${name}`)

  return [join(r.home, '.claude/skills', name), join(r.home, '.agents/skills', name), join(r.packageRoot, 'skills', name)]
}

export const workflowStages = (r: Runtime, name: string) => {
  const path = workflowDirs(r, name).map(dir => join(dir, 'stages.yaml')).find(path => existsSync(path))

  return path === undefined ? { stages: DEFAULT_STAGES, problems: [] } : readStages(readFileSync(path, 'utf8'))
}

export const roleText = (r: Runtime, root: string, workflow: string, ref: string): { ref: string; bytes: string | undefined } => {
  if (ref === '') return { ref, bytes: undefined }
  let path: string
  if (ref.startsWith('workflow:')) {
    const name = ref.slice('workflow:'.length)
    const dir = workflowDirs(r, workflow).find(dir => existsSync(join(dir, 'SKILL.md'))) ?? join(r.packageRoot, 'skills', workflow)
    const file = name.endsWith('.md') ? name : `${name}.md`
    path = within(dir, `roles/${file}`)
  } else path = within(root, ref)

  return { ref, bytes: existsSync(path) ? readFileSync(path, 'utf8') : undefined }
}

/** `worktree` holds the plan, the agents and the role texts; `root` stays the main checkout. */
export type Mission = Repository & { name: string; worktree: string; path: string; source: string; plan: Plan; agents: Record<string, Agent>; problems: string[]; hash: string; log: string; events: Logged[]; folded: Folded; texts: Map<string, string> }

export const clean = (m: Mission): void => {
  if (m.problems.length > 0) throw new Refusal(m.problems.join('\n'))
}
