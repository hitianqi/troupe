import type { EngineInterface, Register, Timer } from 'claude-code'

import { drawPane, paneRows } from './draw-pane'
import { refresh, setTarget } from './read-state'

// Phase 1: pane `troupe`, a read-only view of the mission in plan.md.

const PANE = 'troupe'
export const POLL_MS = 2000
/** The width the pane is drawn for (the approved mock's): asked as the dock's columns, and to size the rows asked inline. */
const PANE_COLUMNS = 110

// One poll per module: a second session.start (an enable, a worker respawn)
// cancels the first, and a hot reload cancels the old module's waits itself.
let poll: Timer | undefined
let lastError = ''

const tick = ($: EngineInterface) =>
  refresh($).then(
    () => {
      lastError = ''
    },
    error => {
      if (String(error) !== lastError) $.ui.log(`could not read the mission: ${String(error)}`)
      lastError = String(error)
    },
  )

async function openPane($: EngineInterface) {
  const rows = (await paneRows($, PANE_COLUMNS)) ?? 40
  const opened = await $.ui.open({ id: PANE, title: 'troupe', rows, columns: PANE_COLUMNS })
  if (!opened.isPlaced) $.ui.log(`pane not placed: ${opened.reason}`)

  return opened
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'troupe',
      description: 'Open the troupe pane: the mission plan, its roles, orders and gates',
      argumentHint: '[mission, or a mission folder]',
    })
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => void tick($))
    void tick($)
    void openPane($).catch(error => $.ui.log(`could not open the pane: ${String(error)}`))

    return next(e)
  })

  on('command.run', { command: 'troupe' }, async ($, e) => {
    await setTarget($, e.args.trim())
    await tick($)
    const opened = await openPane($)

    return {
      text: opened.isPlaced ? 'troupe pane opened.' : `troupe pane not placed: ${opened.reason}`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => drawPane($, e))
}
