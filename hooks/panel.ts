import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { TroupePanel } from '../types'

// troupe-panel in a tmux pane split right beside the session's own: found,
// split, reused and closed through $.process with argv (tmux runs no shell).
// docs/FEASIBILITY.md, "Phase 2": the engine may run without $TMUX, so the
// session's pane comes from the nearest ancestor process that has one, read
// from /proc; and `tmux display -p` without a target names another pane.

const panel = atom({ plugin: 'troupe', key: 'panel' } as const, null)

/** The panel's share of the window, and its least width in columns. */
export const SHARE = 0.5
export const MIN_COLUMNS = 30
export const panelColumns = (windowColumns: number) => Math.max(MIN_COLUMNS, Math.round(windowColumns * SHARE))

/** `tmux`, on the session's server when it is not the default one. */
export const tmux = (socket: string | undefined, ...args: string[]) => ['tmux', ...(socket ? ['-S', socket] : []), ...args]

/**
 * Prints, for the engine's process and each of its ancestors, `pid TAB TMUX
 * TAB TMUX_PANE` as /proc holds them (empty where it does not).
 * `$PPID` of this shell is the engine's process.
 */
export const ANCESTRY = [
  'sh',
  '-c',
  'p=$PPID; while [ "$p" -gt 1 ]; do e=$(tr "\\0" "\\n" < /proc/$p/environ 2>/dev/null); ' +
    'printf "%s\\t%s\\t%s\\n" "$p" "$(printf "%s" "$e" | sed -n "s/^TMUX=//p")" "$(printf "%s" "$e" | sed -n "s/^TMUX_PANE=//p")"; ' +
    'p=$(ps -o ppid= -p "$p" | tr -d " "); done',
]

/** The socket of a `TMUX` value: `<socket>,<server pid>,<session>`. */
const socketOf = (value: string) => value.split(',').slice(0, -2).join(',')

/** The session's pane from the engine's own TMUX and TMUX_PANE, else from the nearest ancestor that has both; and the engine's pid. */
export function ownPaneOf(env: { tmux?: string; tmuxPane?: string }, ancestry: string): { socket: string; pane: string; owner?: number } | undefined {
  const rows = ancestry
    .split('\n')
    .filter(Boolean)
    .map(row => row.split('\t'))
  const owner = Number(rows[0]?.[0]) || undefined
  if (env.tmux && env.tmuxPane) return { socket: socketOf(env.tmux), pane: env.tmuxPane, owner }
  const found = rows.find(([, value, pane]) => value && pane)

  return found ? { socket: socketOf(found[1] ?? ''), pane: found[2] ?? '', owner } : undefined
}

function run($: EngineInterface, argv: string[]) {
  return $.process.run(argv, { timeoutMs: 5000 })
}

/** Whether the panel's pane is still there. */
async function isAlive($: EngineInterface, open: TroupePanel) {
  return (await run($, tmux(open.socket, 'display', '-p', '-t', open.pane, '#{pane_id}')).catch(() => undefined))?.stdout.trim() === open.pane
}

export async function readPanel($: EngineInterface): Promise<TroupePanel | null> {
  return read($, panel)
}

export type Opened = { kind: 'opened'; pane: string; columns: number } | { kind: 'reused'; pane: string } | { kind: 'no-tmux' } | { kind: 'failed'; reason: string }

/** Shows mission `dir` (as the session names it, from `cwd`) in the panel: the open one, or a new split beside the session's pane; `prepare` runs just before the panel starts. */
export async function openPanel($: EngineInterface, dir: string, cwd: string, prepare: () => Promise<void>): Promise<Opened> {
  const open = await read($, panel)
  const node = (await run($, ['node', '-p', 'process.execPath']).catch(() => undefined))?.stdout.trim()
  const command = (owner?: number) => [node || 'node', `${$.plugin.root}/bin/troupe-panel`, dir, ...(owner ? ['--owner', String(owner)] : [])]
  const ancestry = (await run($, ANCESTRY).catch(() => undefined))?.stdout ?? ''
  const own = ownPaneOf({ tmux: await $.env.get('TMUX'), tmuxPane: await $.env.get('TMUX_PANE') }, ancestry)

  if (open !== null && (await isAlive($, open))) {
    if (open.dir !== dir) {
      await prepare()
      await run($, tmux(open.socket, 'respawn-pane', '-k', '-t', open.pane, '-c', cwd, ...command(own?.owner)))
      await update($, panel, () => ({ ...open, dir }))
    }

    return { kind: 'reused', pane: open.pane }
  }
  if (own === undefined) return { kind: 'no-tmux' }
  const width = await run($, tmux(own.socket, 'display', '-p', '-t', own.pane, '#{window_width}')).catch(() => undefined)
  if (width === undefined || width.exitCode !== 0) return { kind: 'no-tmux' }
  const columns = panelColumns(Number(width.stdout.trim()))
  await prepare()
  const split = await run($, tmux(own.socket, 'split-window', '-h', '-d', '-l', String(columns), '-t', own.pane, '-c', cwd, '-P', '-F', '#{pane_id}', ...command(own.owner)))
  const pane = split.stdout.trim()
  if (split.exitCode !== 0 || !pane.startsWith('%')) return { kind: 'failed', reason: split.stderr.trim() || `tmux exited ${split.exitCode}` }
  await update($, panel, () => ({ ...(own.socket && { socket: own.socket }), pane, dir }))
  // The width tmux gave it, which can differ from the one asked.
  const got = await run($, tmux(own.socket, 'display', '-p', '-t', pane, '#{pane_width}')).catch(() => undefined)

  return { kind: 'opened', pane, columns: Number(got?.stdout.trim()) || columns }
}

/** Closes the panel's pane, if one is open; answers whether one was. */
export async function closePanel($: EngineInterface): Promise<boolean> {
  const open = await read($, panel)
  if (open === null) return false
  await run($, tmux(open.socket, 'kill-pane', '-t', open.pane)).catch(() => undefined)
  await update($, panel, () => null)

  return true
}
