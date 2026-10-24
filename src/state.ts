import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { overlaps } from './plan.ts'
import type { Role } from './plan.ts'
import { parseYaml } from './yaml.ts'
import type { Yaml } from './yaml.ts'

// What a mission is doing now, read live each poll: the plan's hash, each
// role's result file, its commits and changed files, and its pane. Nothing
// here is stored; the log (log.ts) holds what only the moment of action knows.

/** `sha256:<hex>` over the plan's bytes and, in role order, the bytes of each text a role names; a missing text counts as missing. */
export const planHash = (plan: string | Uint8Array, texts: { ref: string; bytes: string | Uint8Array | undefined }[] = []): string => {
  const hash = createHash('sha256').update(plan)
  for (const { ref, bytes } of texts) hash.update(`\0${ref}\0`).update(bytes ?? '\0missing')

  return `sha256:${hash.digest('hex')}`
}

/** The file a role writes in its worktree when it stops: front matter `status` and `summary`, then free text. */
export const RESULT_FILE = '.troupe/result.md'
export type ResultStatus = 'done' | 'blocked' | 'failed'
export type Result = { status: ResultStatus | ''; summary: string; body: string; problem?: string }
const STATUSES: string[] = ['done', 'blocked', 'failed']

export const resultOf = (text: string): Result => {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'))
  if (match === null) return { status: '', summary: '', body: text.trim(), problem: 'no front matter' }
  let data: Yaml
  try {
    data = parseYaml(match[1] ?? '', 2)
  } catch (error) {
    return { status: '', summary: '', body: (match[2] ?? '').trim(), problem: (error as Error).message }
  }
  const field = (key: string) => (typeof data === 'object' && data !== null && !Array.isArray(data) && typeof data[key] === 'string' ? data[key] : '')
  const status = field('status')

  return {
    status: STATUSES.includes(status) ? (status as ResultStatus) : '',
    summary: field('summary'),
    body: (match[2] ?? '').trim(),
    ...(status !== '' && !STATUSES.includes(status) ? { problem: `status "${status}" is not done, blocked or failed` } : {}),
  }
}

/** The role's result, or undefined while it has written none. */
export const readResult = (worktree: string): Result | undefined => {
  const path = join(worktree, RESULT_FILE)

  return existsSync(path) ? resultOf(readFileSync(path, 'utf8')) : undefined
}

const git = (cwd: string, args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

export type Work = {
  commits: { sha: string; subject: string }[]
  /** Files changed since `base`, committed or not, untracked included. */
  changed: string[]
  /** The changed files no entry of the role's touches covers. */
  outside: string[]
}

/** The role's commits since `base` and the files it changed, against its touches. */
export const workOf = (worktree: string, base: string, touches: string[]): Work => {
  const commits = git(worktree, ['log', '--format=%h%x09%s', `${base}..HEAD`])
    .split('\n')
    .filter(line => line !== '')
    .map(line => {
      const [sha = '', ...subject] = line.split('\t')

      return { sha, subject: subject.join('\t') }
    })
  const changed = [
    ...new Set([...git(worktree, ['diff', '--name-only', base]).split('\n'), ...git(worktree, ['ls-files', '--others', '--exclude-standard']).split('\n')]),
  ]
    .filter(file => file !== '')
    .sort()

  return { commits, changed, outside: changed.filter(file => !touches.some(touch => overlaps(touch, file))) }
}

export type Screen = 'waits' | 'working' | 'ready' | 'unknown'
export type Pane = { alive: boolean; dead: boolean; screen: string }

/** The pane's state from tmux: gone, its agent exited (`remain-on-exit`), or alive with its screen. */
export const paneOf = (pane: string): Pane => {
  try {
    const dead = execFileSync('tmux', ['display', '-p', '-t', pane, '#{pane_id} #{pane_dead}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (!dead.startsWith(`${pane} `)) return { alive: false, dead: false, screen: '' }
    const screen = execFileSync('tmux', ['capture-pane', '-p', '-t', pane], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

    return { alive: true, dead: dead.endsWith(' 1'), screen }
  } catch {
    return { alive: false, dead: false, screen: '' }
  }
}

/** A role's state, as the panel and `troupe status` show it. */
export type RoleState = 'planned' | 'working' | 'waits' | 'idle' | 'unknown' | ResultStatus | 'gone' | 'closed'

/**
 * Not opened yet: planned. Closed by troupe: closed. A result written wins
 * over the screen (a role that wrote `done` and sits at its prompt is done).
 * Its pane gone or its agent exited without a result: gone. Else what its
 * screen says (`screen` is the adapter's reading of the pane).
 */
export const roleState = (r: { opened: boolean; closed?: boolean; result?: Result; pane?: Pane; screen?: Screen }): RoleState => {
  if (!r.opened) return 'planned'
  if (r.closed === true) return 'closed'
  if (r.result !== undefined && r.result.status !== '') return r.result.status
  if (r.pane === undefined || !r.pane.alive || r.pane.dead) return 'gone'
  if (r.screen === 'ready') return 'idle'

  return r.screen ?? 'unknown'
}

/** The roles whose `depends_on` are not all done yet: dispatch waits for them. */
export const waitingOn = (role: Role, states: Map<string, RoleState>): string[] => role.dependsOn.filter(dep => states.get(dep) !== 'done')
