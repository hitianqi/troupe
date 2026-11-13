import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { Screen } from './agents.ts'
import { addedFile, parseDiff } from './diff.ts'
import type { FileDiff } from './diff.ts'
import { overlaps } from './plan.ts'
import type { Role } from './plan.ts'
import { run, tmux } from './run.ts'
import type { Run } from './run.ts'
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
/** `doneWhen`: a reviewer's `done_when`, the plan's done-when criteria (from 1) this review found met. */
export type Result = { status: ResultStatus | ''; summary: string; body: string; problem?: string; at?: string; doneWhen?: number[] }
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
  const met = typeof data === 'object' && data !== null && !Array.isArray(data) ? data.done_when : undefined
  const doneWhen = Array.isArray(met) ? met.flatMap(one => (typeof one === 'string' && /^[1-9]\d*$/.test(one) ? [Number(one)] : [])) : undefined

  return {
    status: STATUSES.includes(status) ? (status as ResultStatus) : '',
    summary: field('summary'),
    body: (match[2] ?? '').trim(),
    ...(doneWhen && { doneWhen }),
    ...(status !== '' && !STATUSES.includes(status) ? { problem: `status "${status}" is not done, blocked or failed` } : {}),
  }
}

/** The results `troupe send` put aside for a role (`result-<role>-<uuid>.md` beside the log), oldest first. */
export const earlierResults = (dir: string, role: string): Result[] => {
  if (!existsSync(dir)) return []
  // Role names are plain (NAME), so the role needs no escaping here.
  const name = new RegExp(`^result-${role}-[0-9a-f-]{36}\\.md$`)

  return readdirSync(dir).filter(file => name.test(file)).map(file => join(dir, file))
    .map(path => ({ ...resultOf(readFileSync(path, 'utf8')), at: statSync(path).mtime.toISOString() }))
    .sort((a, b) => a.at.localeCompare(b.at))
}

/** The role's result, or undefined while it has written none. */
export const readResult = (worktree: string): Result | undefined => {
  const path = join(worktree, RESULT_FILE)

  // When it was written: the panel ticks the done-when criteria at the reviewer's PASS.
  return existsSync(path) ? { ...resultOf(readFileSync(path, 'utf8')), at: statSync(path).mtime.toISOString() } : undefined
}

const git = (cwd: string, args: string[], runner: Run): string => {
  const result = runner('git', args, { cwd })
  if (result.code !== 0) throw new Error(result.err || 'git failed')

  return result.out
}

export type Work = {
  commits: { sha: string; subject: string }[]
  /** Files changed since `base`, committed or not, untracked included. */
  changed: string[]
  /** The changed files no entry of the role's touches covers. */
  outside: string[]
  /** Each changed file's hunks, in `changed` order; absent when the diff could not be read. */
  files?: FileDiff[]
  diffProblem?: string
}

/** A new file is shown whole up to this size. */
const UNTRACKED = 64 * 1024

/** The change against `base` as hunks: tracked files from `git diff`, new files read whole. */
const filesOf = (worktree: string, base: string, untracked: string[], runner: Run): FileDiff[] => {
  const tracked = parseDiff(git(worktree, ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--no-renames', '-U3', base, '--'], runner))
  const added = untracked.map(path => {
    try {
      const file = join(worktree, path)
      if (statSync(file).size > UNTRACKED) return { path, status: 'A' as const, add: 0, del: 0, hunks: [], untracked: true as const, cut: true as const }
      const text = readFileSync(file, 'utf8')

      return text.includes('\0') ? { path, status: 'A' as const, add: 0, del: 0, hunks: [], untracked: true as const, binary: true as const } : addedFile(path, text)
    } catch {
      return { path, status: 'A' as const, add: 0, del: 0, hunks: [], untracked: true as const }
    }
  })

  return [...tracked, ...added]
}

/** The role's commits since `base` and the files it changed, against its touches. */
export const workOf = (worktree: string, base: string, touches: string[], runner: Run = run): Work => {
  const commits = git(worktree, ['log', '--format=%h%x09%s', `${base}..HEAD`], runner)
    .split('\n')
    .filter(line => line !== '')
    .map(line => {
      const [sha = '', ...subject] = line.split('\t')

      return { sha, subject: subject.join('\t') }
    })
  const untracked = git(worktree, ['ls-files', '--others', '--exclude-standard'], runner).split('\n').filter(file => file !== '')
  const changed = [...new Set([...git(worktree, ['diff', '--name-only', base], runner).split('\n'), ...untracked])]
    .filter(file => file !== '')
    .sort()
  const outside = changed.filter(file => !touches.some(touch => overlaps(touch, file)))
  // The hunks are extra: a diff too large or unreadable leaves the commits and files standing.
  try {
    const byPath = new Map(filesOf(worktree, base, untracked, runner).map(file => [file.path, file]))

    return { commits, changed, outside, files: changed.map(path => byPath.get(path) ?? { path, status: 'M', add: 0, del: 0, hunks: [] }) }
  } catch (error) {
    return { commits, changed, outside, diffProblem: (error as Error).message }
  }
}

export type Pane = { alive: boolean; dead: boolean; screen: string }

/** The pane's state from tmux: gone, its agent exited (`remain-on-exit`), or alive with its screen. */
export const paneOf = (pane: string, runner: Run = run, env = process.env, expected?: string): Pane => {
  const gone = { alive: false, dead: false, screen: '' }
  try {
    const identified = tmux(['display', '-p', '-t', pane, '#{pane_id}\t#{pane_dead}\t#{@troupe-owner}'], runner, env)
    const [id, dead, owner] = identified.out.trimEnd().split('\t')
    if (identified.code !== 0 || id !== pane || !expected || owner !== expected) return gone
    const captured = tmux(['capture-pane', '-p', '-t', pane], runner, env)

    return { alive: true, dead: dead === '1', screen: captured.code === 0 ? captured.out : '' }
  } catch {
    return gone
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
