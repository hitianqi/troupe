import type { EngineInterface, Register, Timer } from 'claude-code'

import { gate } from './approval.ts'
import { dispatchHooks, registerDispatch } from './dispatch.ts'
import { drawPane, paneRows } from './draw-pane.tsx'
import { metricsHooks, registerMetrics } from './metrics.ts'
import { POLL_MS } from './mission.ts'
import type { EngineFacts } from './mission.ts'
import { closePanel, openPanel, readPanel } from './panel.ts'
import { refresh, setTarget, writeFacts } from './read-state.ts'

// Phase 2: `/troupe` inside tmux splits troupe-panel to the right of the
// session (panel.ts); outside tmux it opens the in-session pane `troupe`,
// a read-only view of the mission in plan.md. One view at a time: while
// the panel is open the pane is closed. Once the plan is shown, approval.ts's
// gate answers whether it is approved. Phase 2 part 2: the role-window tools
// (troupe_dispatch, troupe_status, troupe_close) are declared and served by
// dispatch.ts. Phase 3: troupe_metrics (metrics.ts) writes metrics.json at
// teardown.

const PANE = 'troupe'
/** The width the pane is drawn for (the approved mock's): asked as the dock's columns, and to size the rows asked inline. */
const PANE_COLUMNS = 110

// One poll per module: a second session.start (an enable, a worker respawn)
// cancels the first, and a hot reload cancels the old module's waits itself.
let poll: Timer | undefined
let lastError = ''

/** Reads the mission; while the panel is open, hands it the engine's facts. */
const tick = ($: EngineInterface) =>
  refresh($)
    .then(async read => {
      if (read !== undefined && (await readPanel($)) !== null) await writeFacts($, read)
      lastError = ''

      return read
    })
    .catch(error => {
      if (String(error) !== lastError) $.ui.log(`could not read the mission: ${String(error)}`)
      lastError = String(error)

      return undefined
    })

async function openPane($: EngineInterface) {
  const rows = (await paneRows($, PANE_COLUMNS)) ?? 40
  const opened = await $.ui.open({ id: PANE, title: 'troupe', rows, columns: PANE_COLUMNS })
  if (!opened.isPlaced) $.ui.log(`pane not placed: ${opened.reason}`)

  return opened
}

/** `/troupe [mission]`: the panel inside tmux, else the pane; `/troupe close` closes the panel. */
async function troupe($: EngineInterface, want: string): Promise<string> {
  if (want === 'close') {
    if (!(await closePanel($))) return 'no troupe panel is open.'
    const opened = await openPane($)

    return `troupe panel closed; the in-session pane is back${opened.isPlaced ? '' : `, not placed: ${opened.reason}`}.`
  }
  await setTarget($, want)
  const read = await tick($)
  if (read === undefined) {
    const opened = await openPane($)

    return opened.isPlaced ? 'troupe pane opened: no mission to show yet.' : `troupe pane not placed: ${opened.reason}`
  }

  return `${await show($, read)} ${await gate($, read.dir)}`
}

/** Shows the mission read: the panel inside tmux, else the pane; answers what was shown. */
async function show($: EngineInterface, read: { dir: string; facts: EngineFacts }): Promise<string> {
  const shown = await openPanel($, read.dir, await $.session.cwd(), () => writeFacts($, read))
  if (shown.kind === 'opened' || shown.kind === 'reused') {
    // One view at a time: the in-session pane closes while the panel is open.
    await $.ui.close({ id: PANE })

    return shown.kind === 'opened'
      ? `troupe panel opened on the right (${shown.columns} columns, pane ${shown.pane}).`
      : `troupe panel already open (pane ${shown.pane}); now showing ${read.dir}.`
  }
  const opened = await openPane($)
  const why = shown.kind === 'no-tmux' ? 'no tmux' : `the split failed (${shown.reason})`

  return `${why}: showing the in-session pane${opened.isPlaced ? '' : `, not placed: ${opened.reason}`}.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'troupe',
      description: 'Show the mission plan in a panel on the right (inside tmux), or in the pane; /troupe close closes the panel',
      argumentHint: '[mission, a mission folder, or close]',
    })
    await registerDispatch($).catch(error => $.ui.log(`could not declare the dispatch tools: ${String(error)}`))
    await registerMetrics($).catch(error => $.ui.log(`could not declare troupe_metrics: ${String(error)}`))
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => void tick($))
    void tick($)
    // A panel still open from before a reload keeps the pane closed.
    if ((await readPanel($)) === null) void openPane($).catch(error => $.ui.log(`could not open the pane: ${String(error)}`))

    return next(e)
  })

  dispatchHooks(on)
  metricsHooks(on)

  on('command.run', { command: 'troupe' }, async ($, e) => ({ text: await troupe($, e.args.trim()) }))

  on('session.end', async ($, e, next) => {
    await closePanel($).catch(() => false)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => drawPane($, e))
}
