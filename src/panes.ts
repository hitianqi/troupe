import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { mux, Refusal } from './command-context.ts'
import type { Mission, Repository, Runtime } from './command-context.ts'
import { paneOf } from './state.ts'
import type { Pane, PaneOwner } from './state.ts'
import { shellOf, tmux } from './run.ts'

export type Created = { session: string; window: string; pane: string; owner: string; server: string }
const IDS = '#{session_id} #{window_id} #{pane_id}'
export const ownedPane = (r: Runtime, opened: PaneOwner & { pane: string }): Pane => paneOf(opened.pane, r.run, r.env, opened)

const ids = (out: string): Omit<Created, 'owner' | 'server'> => {
  const [session = '', window = '', pane = ''] = out.trim().split(/\s+/)
  if (!/^\$\d+$/.test(session) || !/^@\d+$/.test(window) || !/^%\d+$/.test(pane)) throw new Refusal(`tmux returned invalid pane identifiers: ${out.trim()}`)

  return { session, window, pane }
}

const sessionFile = (repo: Repository): string => join(repo.common, 'troupe', 'session.json')
const keptSession = (r: Runtime, repo: Repository): string | undefined => {
  const file = sessionFile(repo)
  if (!existsSync(file)) return undefined
  try {
    const kept = JSON.parse(readFileSync(file, 'utf8')) as { session: string; owner: string; socket: string }
    if (kept.socket !== (r.env.TROUPE_TMUX_SOCKET ?? '')) return undefined
    const found = tmux(['display', '-p', '-t', kept.session, '#{session_id} #{@troupe-session}'], r.run, r.env)
    if (found.code === 0 && found.out.trim() === `${kept.session} ${kept.owner}`) return kept.session
  } catch {
    return undefined
  }

  return undefined
}

export const createPane = (r: Runtime, repo: Repository, name: string, cwd: string, argv: string[], split?: Created, horizontal = false, windowName = name): Created => {
  let session = split?.session
  if (session === undefined && r.env.TMUX) session = mux(r, ['display', '-p', ...(r.env.TMUX_PANE ? ['-t', r.env.TMUX_PANE] : []), '#{session_id}']).trim()
  if (session === undefined) session = keptSession(r, repo)
  const sessionName = `troupe-${basename(repo.root).replace(/[^A-Za-z0-9_-]/g, '-')}`
  if (session === undefined && tmux(['has-session', '-t', `=${sessionName}`], r.run, r.env).code === 0) {
    throw new Refusal(`tmux session ${sessionName} exists but troupe cannot verify its ownership`)
  }
  const command = shellOf(argv)
  const common = ['-c', cwd, '-P', '-F', IDS, command]
  const opened = ids(mux(r, split !== undefined
    ? ['split-window', '-d', ...(horizontal ? ['-h', '-p', '50'] : []), '-t', split.pane, ...common]
    : session !== undefined
      ? ['new-window', '-d', '-t', `${session}:`, '-n', windowName, ...common]
      : ['new-session', '-d', '-s', sessionName, '-n', windowName, ...common]))
  const owner = randomUUID()
  let server = ''
  try {
    mux(r, ['set-option', '-p', '-t', opened.pane, 'remain-on-exit', 'on'])
    mux(r, ['set-option', '-p', '-t', opened.pane, '@troupe-owner', owner])
    mux(r, ['select-pane', '-t', opened.pane, '-T', name])
    server = mux(r, ['display', '-p', '#{socket_path}']).trim()
    if (server === '') throw new Refusal('tmux did not identify its socket')
    if (session === undefined) {
      const sessionOwner = randomUUID()
      mux(r, ['set-option', '-t', opened.session, '@troupe-session', sessionOwner])
      mkdirSync(join(repo.common, 'troupe'), { recursive: true })
      writeFileSync(sessionFile(repo), JSON.stringify({ session: opened.session, owner: sessionOwner, socket: r.env.TROUPE_TMUX_SOCKET ?? '' }))
    }
  } catch (error) {
    tmux(['kill-pane', '-t', opened.pane], r.run, r.env)
    throw error
  }

  return { ...opened, owner, server }
}

/** Tile only a window whose every pane still has a logged owner marker. */
export const rolesWindow = (r: Runtime, m: Mission): Created | undefined => {
  const opened = [...m.folded.roles.values()].filter(one => !one.closed)
  const live = opened.find(one => ownedPane(r, one).alive)
  if (live === undefined) return undefined
  const panes = mux(r, ['list-panes', '-t', live.window, '-F', '#{pane_id} #{@troupe-owner}']).trim().split('\n')
  for (const pane of panes) {
    if (!opened.some(one => pane === `${one.pane} ${one.owner}`)) throw new Refusal('roles window contains a pane troupe did not open')
  }

  return { session: live.session, window: live.window, pane: live.pane, owner: live.owner ?? '', server: live.server ?? '' }
}
