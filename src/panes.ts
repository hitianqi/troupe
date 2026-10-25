import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

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
const sessionOf = (r: Runtime, repo: Repository): string | undefined => {
  if (r.env.TMUX) return mux(r, ['display', '-p', ...(r.env.TMUX_PANE ? ['-t', r.env.TMUX_PANE] : []), '#{session_id}']).trim()
  const name = `=${sessionName(repo)}`
  if (tmux(['has-session', '-t', name], r.run, r.env).code !== 0) return undefined

  return mux(r, ['display', '-p', '-t', name, '#{session_id}']).trim()
}

export const createPane = (r: Runtime, repo: Repository, name: string, cwd: string, argv: string[], split?: { pane: string }, horizontal?: number, windowName = name): Created => {
  const session = split === undefined ? sessionOf(r, repo) : undefined
  const common = ['-c', cwd, '-P', '-F', IDS, shellOf(argv)]
  const opened = ids(mux(r, split !== undefined
    ? ['split-window', '-d', ...(horizontal ? ['-h', '-p', String(horizontal)] : []), '-t', split.pane, ...common]
    : session !== undefined
      ? ['new-window', '-d', '-t', `${session}:`, '-n', windowName, ...common]
      : ['new-session', '-d', '-s', sessionName(repo), '-n', windowName, ...common]))
  const owner = randomUUID()
  try {
    mux(r, ['set-option', '-p', '-t', opened.pane, 'remain-on-exit', 'on'])
    mux(r, ['set-option', '-p', '-t', opened.pane, '@troupe-owner', owner])
    mux(r, ['select-pane', '-t', opened.pane, '-T', name])
  } catch (error) {
    tmux(['kill-pane', '-t', opened.pane], r.run, r.env)
    throw error
  }

  return { ...opened, owner }
}

export const rolesWindow = (r: Runtime, repo: Repository): Location | undefined => {
  const session = sessionOf(r, repo)
  if (session === undefined) return undefined
  const panes = mux(r, ['list-panes', '-s', '-t', session, '-F', `#{window_name}\t${IDS}`]).trim().split('\n')
  const roles = panes.find(line => line.startsWith('roles\t'))

  return roles === undefined ? undefined : ids(roles.slice('roles\t'.length))
}
