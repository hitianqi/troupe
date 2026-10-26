import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { basename } from 'node:path'

import { rootOf } from './check.ts'
import { mux, Refusal } from './command-context.ts'
import type { Repository, Runtime } from './command-context.ts'
import { paneOf } from './state.ts'
import type { Pane } from './state.ts'
import { shellOf, tmux } from './run.ts'

type Location = { session: string; window: string; pane: string }
export type Created = Location & { owner: string }
const IDS = '#{session_id} #{window_id} #{pane_id}'
export const ownedPane = (r: Runtime, opened: { pane: string; owner?: string }): Pane => paneOf(opened.pane, r.run, r.env, opened.owner)

const ids = (out: string): Location => {
  const [session = '', window = '', pane = ''] = out.trim().split(/\s+/)
  if (!/^\$\d+$/.test(session) || !/^@\d+$/.test(window) || !/^%\d+$/.test(pane)) throw new Refusal(`tmux returned invalid pane identifiers: ${out.trim()}`)

  return { session, window, pane }
}

export const sessionName = (repo: Repository): string => `troupe-${basename(repo.root).replace(/[^A-Za-z0-9_-]/g, '-')}`
/**
 * The tmux pane this command runs in: `$TMUX_PANE`, or, when an agent runs its
 * tools without the tmux variables (Codex does for escalated commands), the
 * pane whose shell is one of this process's ancestors.
 */
export const callerPane = (r: Runtime, root?: string): string | undefined => {
  if (r.env.TMUX) return r.env.TMUX_PANE || mux(r, ['display', '-p', '#{pane_id}']).trim()
  const listed = tmux(['list-panes', '-a', '-F', '#{pane_pid}\t#{pane_id}\t#{pane_current_path}\t#{@troupe-owner}#{@troupe-panel}'], r.run, r.env)
  if (listed.code !== 0) return undefined
  const panes = listed.out.split('\n').map(line => line.split('\t')).filter(([pid = '', pane = '']) => /^\d+$/.test(pid) && /^%\d+$/.test(pane))
  const byPid = new Map(panes.map(([pid = '', pane = '']) => [pid, pane]))
  let pid = r.pid
  for (let hop = 0; hop < 32 && pid > 1; hop += 1) {
    const pane = byPid.get(String(pid))
    if (pane) return pane
    const parent = r.run('ps', ['-o', 'ppid=', '-p', String(pid)])
    pid = parent.code === 0 ? Number(parent.out.trim()) || 0 : 0
  }
  // A background shell can be detached from the agent's pane too: then the one
  // pane troupe did not open that sits at the repository root is the agent's.
  const atRoot = root === undefined ? [] : panes.filter(([, , path = '', mark = '']) => mark === '' && sameDir(path, root))

  return atRoot.length === 1 ? atRoot[0]?.[1] : undefined
}

const sameDir = (a: string, b: string): boolean => {
  try {
    return realpathSync(a) === realpathSync(b)
  } catch {
    return false
  }
}

const sessionOf = (r: Runtime, repo: Repository): string | undefined => {
  const caller = callerPane(r, rootOf(r.cwd, r.run))
  if (caller !== undefined) return mux(r, ['display', '-p', '-t', caller, '#{session_id}']).trim()
  const name = `=${sessionName(repo)}`
  if (tmux(['has-session', '-t', name], r.run, r.env).code !== 0) return undefined

  return mux(r, ['display', '-p', '-t', name, '#{session_id}']).trim()
}

export const createPane = (r: Runtime, repo: Repository, name: string, cwd: string, argv: string[], split?: { pane: string }, horizontal?: number, windowName = name): Created => {
  const session = split === undefined ? sessionOf(r, repo) : undefined
  const common = ['-c', cwd, '-P', '-F', IDS, shellOf(argv)]
  // A percentage needs an attached client on some tmux versions ("size missing"); columns always work.
  const columns = (pane: string, percent: number) => String(Math.max(20, Math.round(Number(mux(r, ['display', '-p', '-t', pane, '#{pane_width}']).trim()) * percent / 100)))
  const opened = ids(mux(r, split !== undefined
    ? ['split-window', '-d', ...(horizontal ? ['-h', '-l', columns(split.pane, horizontal)] : []), '-t', split.pane, ...common]
    : session !== undefined
      ? ['new-window', '-d', '-t', `${session}:`, '-n', windowName, ...common]
      : ['new-session', '-d', '-s', sessionName(repo), '-n', windowName, ...common]))
  const owner = randomUUID()
  try {
    mux(r, ['set-option', '-p', '-t', opened.pane, 'remain-on-exit', 'on'])
    mux(r, ['set-option', '-p', '-t', opened.pane, '@troupe-owner', owner])
    mux(r, ['select-pane', '-t', opened.pane, '-T', name])
    // A session troupe starts is troupe's: clicks switch its windows whatever the person's tmux.conf says.
    if (split === undefined && session === undefined) mux(r, ['set-option', '-t', opened.session, 'mouse', 'on'])
  } catch (error) {
    tmux(['kill-pane', '-t', opened.pane], r.run, r.env)
    throw error
  }

  return { ...opened, owner }
}

/** Each mission tiles its roles in its own window; tmux window names cannot hold `:`. */
export const rolesName = (mission: string): string => `roles-${mission}`

export const rolesWindow = (r: Runtime, repo: Repository, mission: string): Location | undefined => {
  const session = sessionOf(r, repo)
  if (session === undefined) return undefined
  const panes = mux(r, ['list-panes', '-s', '-t', session, '-F', `#{window_name}\t${IDS}`]).trim().split('\n')
  const roles = panes.find(line => line.startsWith(`${rolesName(mission)}\t`))

  return roles === undefined ? undefined : ids(roles.slice(`${rolesName(mission)}\t`.length))
}
