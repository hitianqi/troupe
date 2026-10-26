import { join } from 'node:path'

import { mux, Refusal, repository } from './command-context.ts'
import type { Reply, Repository, Runtime } from './command-context.ts'
import { callerPane, createPane, ownedPane, sessionName } from './panes.ts'
import { markOrchestrator } from './orchestrator.ts'
import { available } from './setup.ts'
import { shellOf, tmux } from './run.ts'

export const createPanel = (r: Runtime, repo: Repository, want: string, split?: { pane: string }, horizontal?: number, planning = false) => {
  const argv = [process.execPath, join(r.packageRoot, 'dist/cli.js'), 'panel', ...(want ? ['-m', want] : [])]
  const opened = createPane(r, repo, 'troupe panel', repo.root, argv, split, horizontal, 'mission')
  try {
    mux(r, ['set-option', '-p', '-t', opened.pane, '@troupe-panel', repo.root])
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

export const openPanel = (r: Runtime, want: string, planning = false): Reply => {
  if (!available(r, 'tmux')) throw new Refusal('tmux is required for troupe open')
  const repo = repository(r)
  const listed = tmux(['list-panes', '-a', '-F', '#{pane_id}\t#{pane_dead}\t#{@troupe-panel}'], r.run, r.env)
  const existing = listed.code === 0 ? listed.out.split('\n').map(line => line.split('\t'))
    .find(([pane, dead, root]) => /^%\d+$/.test(pane ?? '') && dead === '0' && root === repo.root) : undefined
  if (existing !== undefined) {
    const caller = callerPane(r, repo.root)
    if (caller !== undefined) markOrchestrator(r, repo.root, caller)
    if (planning) mux(r, ['set-option', '-p', '-t', existing[0]!, '@troupe-planning', '1'])
    return { code: 0, out: `Panel already open in ${existing[0]}.\n` }
  }
  const caller = callerPane(r, repo.root)
  if (caller !== undefined) markOrchestrator(r, repo.root, caller)
  const opened = createPanel(r, repo, want, caller === undefined ? undefined : { pane: caller }, 45, planning)
  if (caller !== undefined) return { code: 0, out: `Opened panel in ${opened.pane} beside your agent.\n` }
  mux(r, ['select-window', '-t', opened.window])
  const name = sessionName(repo)
  const socket = r.env.TROUPE_TMUX_SOCKET
  const attach = `tmux${socket ? ` -L ${shellOf([socket])}` : ''} attach -t ${name}`
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
      const launched = r.run('osascript', ['-e', attachScript(terminal === 'Apple_Terminal'), name, ...(r.env.TROUPE_TMUX_SOCKET ? [r.env.TROUPE_TMUX_SOCKET] : [])], { env: r.env })
      if (launched.code === 0) return { code: 0, out: `Opened panel in ${terminal === 'Apple_Terminal' ? 'Terminal' : 'iTerm2'} (${opened.pane}).\n` }
    } catch { /* A terminal can be unavailable; the session remains attachable. */ }
  }

  return { code: 0, out: `Opened panel in ${opened.pane}; attach with: ${attach}; role windows will appear in that session.\n` }
}
