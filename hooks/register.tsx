import type { EngineInterface, Register, Timer } from 'claude-code'

import { gate } from './approval.ts'
import { dispatchHooks, registerDispatch } from './dispatch.ts'
import { metricsHooks, registerMetrics } from './metrics.ts'
import { POLL_MS } from '../src/mission.ts'
import { closePanel, openPanel } from './panel.ts'
import { refresh, setTarget } from './read-state.ts'

// The Claude Code side of troupe, until the troupe CLI replaces it (ROADMAP,
// Phase 5): `/troupe` splits troupe-panel to the right of the session
// (panel.ts) and asks for the plan's approval (approval.ts); the role-window
// tools (dispatch.ts) and troupe_metrics (metrics.ts) are declared here; the
// poll brings the role windows' results into the mission folder. troupe needs
// tmux: outside it, `/troupe` says so.

// One poll per module: a second session.start (an enable, a worker respawn)
// cancels the first, and a hot reload cancels the old module's waits itself.
let poll: Timer | undefined
let lastError = ''

/** Finds the mission and collects its results; logs a failure once. */
const tick = ($: EngineInterface) =>
  refresh($)
    .then(read => {
      lastError = ''

      return read
    })
    .catch(error => {
      if (String(error) !== lastError) $.ui.log(`could not read the mission: ${String(error)}`)
      lastError = String(error)

      return { missing: String(error) }
    })

/** `/troupe [mission]`: the panel beside the session, then the approval; `/troupe close` closes the panel. */
async function troupe($: EngineInterface, want: string): Promise<string> {
  if (want === 'close') return (await closePanel($)) ? 'troupe panel closed.' : 'no troupe panel is open.'
  await setTarget($, want)
  const read = await tick($)
  if ('missing' in read) return `troupe: ${read.missing}. /troupe <mission> names one under docs/missions/, or a mission folder by its path.`
  const shown = await openPanel($, read.dir, await $.session.cwd())
  if (shown.kind === 'no-tmux') return 'troupe needs tmux: start Claude Code inside a tmux session, then /troupe again.'
  if (shown.kind === 'failed') return `the panel split failed (${shown.reason}).`
  const said =
    shown.kind === 'opened'
      ? `troupe panel opened on the right (${shown.columns} columns, pane ${shown.pane}).`
      : `troupe panel already open (pane ${shown.pane}); now showing ${read.dir}.`

  return `${said} ${await gate($, read.dir)}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'troupe',
      description: 'Show the mission plan in a panel on the right (inside tmux) and ask to approve it; /troupe close closes the panel',
      argumentHint: '[mission, a mission folder, or close]',
    })
    await registerDispatch($).catch(error => $.ui.log(`could not declare the dispatch tools: ${String(error)}`))
    await registerMetrics($).catch(error => $.ui.log(`could not declare troupe_metrics: ${String(error)}`))
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => void tick($))
    void tick($)

    return next(e)
  })

  dispatchHooks(on)
  metricsHooks(on)

  on('command.run', { command: 'troupe' }, async ($, e) => ({ text: await troupe($, e.args.trim()) }))

  on('session.end', async ($, e, next) => {
    await closePanel($).catch(() => false)

    return next(e)
  })
}
