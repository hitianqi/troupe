import { join } from 'node:path'

import { mux, Refusal, repository } from './command-context.ts'
import type { Reply, Repository, Runtime } from './command-context.ts'
import { createPane, ownedPane, sessionName } from './panes.ts'
import { available } from './setup.ts'
import { shellOf, tmux } from './run.ts'

export const createPanel = (r: Runtime, repo: Repository, want: string, split?: { pane: string }, horizontal?: number) => {
  const argv = [process.execPath, join(r.packageRoot, 'dist/cli.js'), 'panel', ...(want ? ['-m', want] : [])]
  const opened = createPane(r, repo, 'troupe panel', repo.root, argv, split, horizontal, 'mission')
  try {
    mux(r, ['set-option', '-p', '-t', opened.pane, '@troupe-panel', repo.root])
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

export const openPanel = (r: Runtime, want: string): Reply => {
  if (!available(r, 'tmux')) throw new Refusal('tmux is required for troupe open')
  const repo = repository(r)
  const listed = tmux(['list-panes', '-a', '-F', '#{pane_id}\t#{pane_dead}\t#{@troupe-panel}'], r.run, r.env)
  const existing = listed.code === 0 ? listed.out.split('\n').map(line => line.split('\t'))
    .find(([pane, dead, root]) => /^%\d+$/.test(pane ?? '') && dead === '0' && root === repo.root) : undefined
  if (existing !== undefined) return { code: 0, out: `Panel already open in ${existing[0]}.\n` }
  const caller = r.env.TMUX ? r.env.TMUX_PANE || mux(r, ['display', '-p', '#{pane_id}']).trim() : undefined
  const opened = createPanel(r, repo, want, caller === undefined ? undefined : { pane: caller }, 45)
  if (caller !== undefined) return { code: 0, out: `Opened panel in ${opened.pane} beside your agent.\n` }
  mux(r, ['select-window', '-t', opened.window])
  const name = sessionName(repo)
  const terminal = r.env.TERM_PROGRAM
  if (r.platform === 'darwin' && (terminal === 'Apple_Terminal' || terminal === 'iTerm.app')) {
    try {
      const launched = r.run('osascript', ['-e', attachScript(terminal === 'Apple_Terminal'), name, ...(r.env.TROUPE_TMUX_SOCKET ? [r.env.TROUPE_TMUX_SOCKET] : [])], { env: r.env })
      if (launched.code === 0) return { code: 0, out: `Opened panel in ${terminal === 'Apple_Terminal' ? 'Terminal' : 'iTerm2'} (${opened.pane}).\n` }
    } catch { /* A terminal can be unavailable; the session remains attachable. */ }
  }
  const socket = r.env.TROUPE_TMUX_SOCKET
  const attach = `tmux${socket ? ` -L ${shellOf([socket])}` : ''} attach -t ${name}`

  return { code: 0, out: `Opened panel in ${opened.pane}; attach with: ${attach}; role windows will appear in that session.\n` }
}
