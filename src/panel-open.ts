import { join } from 'node:path'

import { mux, Refusal, repository } from './command-context.ts'
import type { Reply, Repository, Runtime } from './command-context.ts'
import { callerOf, heldBy, markedPanes, markMission, orchestratorsOf, resolveMission, Unresolved } from './missions.ts'
import { createPane, ownedPane, sessionName } from './panes.ts'
import { recordOrchestrator } from './notices.ts'
import { markOrchestrator } from './orchestrator.ts'
import { available } from './setup.ts'
import { shellOf, tmux } from './run.ts'

/** A panel pane, marked with its repository, its orchestrator pane and (once known) its mission. */
export const createPanel = (r: Runtime, repo: Repository, name: string, orchestrator?: string, split?: { pane: string }, horizontal?: number, planning = false) => {
  const argv = [process.execPath, join(r.packageRoot, 'dist/cli.js'), 'panel']
  const opened = createPane(r, repo, 'troupe panel', repo.root, argv, split, horizontal, 'mission')
  try {
    mux(r, ['set-option', '-p', '-t', opened.pane, '@troupe-panel', repo.root])
    if (orchestrator !== undefined) mux(r, ['set-option', '-p', '-t', opened.pane, '@troupe-panel-orchestrator', orchestrator])
    if (name !== '') markMission(r, repo, opened.pane, name)
    if (planning) mux(r, ['set-option', '-p', '-t', opened.pane, '@troupe-planning', '1'])
  } catch (error) {
    if (ownedPane(r, opened).alive) tmux(['kill-pane', '-t', opened.pane], r.run, r.env)
    throw error
  }

  return opened
}

const attachScript = (terminal: boolean): string => `on run argv
  set attachCommand to "tmux"
  if (count of argv) > 1 then set attachCommand to attachCommand & " -L " & quoted form of (item 2 of argv)
  set attachCommand to attachCommand & " attach -t " & quoted form of (item 1 of argv)
  ${terminal ? `tell application "Terminal"
    activate
    do script attachCommand` : `tell application "iTerm2"
    activate
    set terminalWindow to (create window with default profile)
    tell current session of terminalWindow to write text attachCommand`}
  end tell
end run`

/** Opens the panel of the caller's mission beside the caller; one panel per mission. */
export const openPanel = (r: Runtime, want: string, planning = false): Reply => {
  if (!available(r, 'tmux')) throw new Refusal('tmux is required for troupe open')
  const repo = repository(r)
  const caller = callerOf(r)
  let name = ''
  try {
    name = resolveMission(r, repo, want)
  } catch (error) {
    // Only a planning panel may wait for `troupe mission new` to name its mission.
    if (!(error instanceof Unresolved) || !planning) throw error
  }
  if (caller !== undefined && name !== '') {
    // A pane running another open mission, in any repository, never takes this one.
    const held = heldBy(r, markedPanes(r), caller)
    if (held.name !== '' && (held.name !== name || held.root !== repo.root)) throw new Refusal(`this pane runs mission ${held.name}${held.root === repo.root ? '' : ` in ${held.root}`}; open ${name} from another pane`)
    // An unbound pane takes a mission over only from an orchestrator that is gone.
    const live = orchestratorsOf(markedPanes(r), repo, name).find(one => one.pane !== caller)
    if (live !== undefined) throw new Refusal(`mission ${name} is run by pane ${live.pane}; open its panel from there, or close that pane first`)
    // A pane that opens a mission's panel is that mission's orchestrator.
    markOrchestrator(r, repo, caller, name)
  }
  recordOrchestrator(r, repo, name)
  const panels = markedPanes(r).filter(one => one.panel === repo.root)
  const existing = (caller === undefined ? undefined : panels.find(one => one.orchestrator === caller))
    ?? (name === '' ? undefined : panels.find(one => one.repo === repo.common && one.mission === name))
    ?? (caller === undefined ? panels.find(one => one.orchestrator === '' && one.mission === '') : undefined)
  if (existing !== undefined) {
    if (caller !== undefined && existing.orchestrator !== caller) mux(r, ['set-option', '-p', '-t', existing.pane, '@troupe-panel-orchestrator', caller])
    if (name !== '' && (existing.mission !== name || existing.repo !== repo.common)) markMission(r, repo, existing.pane, name)
    if (planning) mux(r, ['set-option', '-p', '-t', existing.pane, '@troupe-planning', '1'])
    return { code: 0, out: `Panel already open in ${existing.pane}.\n` }
  }
  const opened = createPanel(r, repo, name, caller, caller === undefined ? undefined : { pane: caller }, 45, planning)
  if (caller !== undefined) return { code: 0, out: `Opened panel in ${opened.pane} beside your agent.\n` }
  mux(r, ['select-window', '-t', opened.window])
  const session = sessionName(repo)
  const socket = r.env.TROUPE_TMUX_SOCKET
  const attach = `tmux${socket ? ` -L ${shellOf([socket])}` : ''} attach -t ${session}`
  const herdrPane = r.env.HERDR_PANE_ID
  if (herdrPane) {
    // herdr is a multiplexer of its own, so the caller has no tmux pane: open a herdr pane beside it that attaches.
    try {
      const split = r.run('herdr', ['pane', 'split', herdrPane, '--direction', 'right'], { env: r.env })
      const pane: unknown = split.code === 0 ? JSON.parse(split.out).result?.pane?.pane_id : undefined
      if (typeof pane === 'string' && r.run('herdr', ['pane', 'run', pane, attach], { env: r.env }).code === 0) {
        return { code: 0, out: `Opened panel beside your agent in herdr pane ${pane} (${opened.pane}).\n` }
      }
    } catch { /* herdr can be unavailable or answer oddly; the session remains attachable. */ }
  }
  const terminal = r.env.TERM_PROGRAM
  if (r.platform === 'darwin' && (terminal === 'Apple_Terminal' || terminal === 'iTerm.app')) {
    try {
      const launched = r.run('osascript', ['-e', attachScript(terminal === 'Apple_Terminal'), session, ...(r.env.TROUPE_TMUX_SOCKET ? [r.env.TROUPE_TMUX_SOCKET] : [])], { env: r.env })
      if (launched.code === 0) return { code: 0, out: `Opened panel in ${terminal === 'Apple_Terminal' ? 'Terminal' : 'iTerm2'} (${opened.pane}).\n` }
    } catch { /* A terminal can be unavailable; the session remains attachable. */ }
  }

  return { code: 0, out: `Opened panel in ${opened.pane}; attach with: ${attach}; role windows will appear in that session.\n` }
}
