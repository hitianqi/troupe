import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { panelColumns } from '../hooks/panel.ts'
import { VALID } from './fixtures.ts'

// /troupe inside tmux: the split beside the session's own pane, its reuse,
// /troupe close, the close at session end, and the refusal with no tmux.
// These hooks stand for the engine and for tmux: the engine's TMUX and
// TMUX_PANE name the session's pane, and `sh` answers the engine's pid.

const SOCKET = '/tmp/tmux-1000/default'
const SESSION_TMUX = { TMUX: `${SOCKET},3506,126`, TMUX_PANE: '%126' }
const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const failed = (stderr: string) => ({ value: { exitCode: 1, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false } })

type Tmux = { env?: { TMUX: string; TMUX_PANE: string }; panes: Set<string>; calls: string[][]; writes: string[] }

/** A checkout with docs/missions/p2 and p9, a session in /repo, and a fake tmux. */
function serves(on: On, given: Partial<Tmux> = {}): Tmux {
  const tmux: Tmux = { env: SESSION_TMUX, panes: new Set(['%126']), calls: [], writes: [], ...given }
  on('command.register', () => ({ value: { command: 'troupe' } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('fs.list', () => ({ value: [] }))
  on('fs.stat', (_, e) =>
    /docs\/missions\/p(2|9)\/plan\.md$/.test(e.path) ? { value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } } : { deny: 'ENOENT' },
  )
  on('fs.read', () => ({ value: VALID }))
  on('fs.write', (_, e) => {
    tmux.writes.push(e.path)

    return { value: undefined }
  })
  on('env.get', (_, e) => ({ value: tmux.env?.[e.name as 'TMUX' | 'TMUX_PANE'] }))
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    if (argv[0] === 'node') return ok('/usr/bin/node\n')
    if (argv[0] === 'sh') return ok('100\n')
    tmux.calls.push(argv)
    const verb = argv[argv[1] === '-S' ? 3 : 1]
    const target = argv[argv.indexOf('-t') + 1] ?? ''
    if (verb === 'display') {
      if (!tmux.panes.has(target)) return failed(`can't find pane: ${target}`)

      const format = argv.at(-1)

      return ok(format === '#{window_width}' ? '76\n' : format === '#{pane_width}' ? '31\n' : `${target}\n`)
    }
    if (verb === 'split-window') {
      tmux.panes.add('%200')

      return ok('%200\n')
    }
    if (verb === 'kill-pane') tmux.panes.delete(target)

    return ok()
  })

  return tmux
}

const run = async ($: { command: { run: (input: never) => Promise<unknown> } }, args: string) =>
  JSON.stringify(await $.command.run({ command: 'troupe', args } as never))
const splits = (tmux: Tmux) => tmux.calls.filter(argv => argv.includes('split-window'))

test('the panel takes half the window, at least 30 columns', async () => {
  expect([panelColumns(50), panelColumns(76), panelColumns(158), panelColumns(200)]).toEqual([30, 38, 79, 100])
})

test("inside tmux /troupe splits troupe-panel right of the session pane its TMUX names", async ($, on) => {
  const clock = mock.clock(on)
  const tmux = serves(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()

  // It reports the width tmux gave (31), not the one asked (38).
  expect(await run($, 'p2')).toContain('troupe panel opened on the right (31 columns, pane %200).')
  const [split] = splits(tmux)
  expect(splits(tmux)).toHaveLength(1)
  expect(split?.slice(0, 16)).toEqual(['tmux', '-S', SOCKET, 'split-window', '-h', '-d', '-l', '38', '-t', '%126', '-c', '/repo', '-P', '-F', '#{pane_id}', '/usr/bin/node'])
  expect(split?.[16]).toMatch(/\/bin\/troupe-panel$/)
  expect(split?.slice(17)).toEqual(['docs/missions/p2', '--owner', '100'])
  // Nothing is written for the panel: it reads the mission folder itself.
  expect(tmux.writes).toEqual([])
})

test('a TMUX socket path with a space is passed whole', async ($, on) => {
  const clock = mock.clock(on)
  const tmux = serves(on, { env: { TMUX: '/tmp/my socket,9,0', TMUX_PANE: '%7' }, panes: new Set(['%7']) })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()

  expect(await run($, 'p2')).toContain('pane %200')
  expect(splits(tmux)[0]?.slice(0, 10)).toEqual(['tmux', '-S', '/tmp/my socket', 'split-window', '-h', '-d', '-l', '38', '-t', '%7'])
})

test('a second /troupe reuses the panel, another mission respawns it there, and a reload adds no split', async ($, on) => {
  const clock = mock.clock(on)
  const tmux = serves(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await run($, 'p2')

  expect(await run($, 'p2')).toContain('troupe panel already open (pane %200)')
  expect(await run($, 'p9')).toContain('now showing docs/missions/p9')
  const respawn = tmux.calls.filter(argv => argv.includes('respawn-pane'))
  expect(respawn.map(argv => argv.slice(3, 9).concat(argv.slice(11, 12)))).toEqual([['respawn-pane', '-k', '-t', '%200', '-c', '/repo', 'docs/missions/p9']])

  // A hot reload runs session.start again; $.state keeps the pane.
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await run($, 'p9')
  expect(splits(tmux)).toHaveLength(1)
})

test('a panel pane that has gone is split again', async ($, on) => {
  const clock = mock.clock(on)
  const tmux = serves(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await run($, 'p2')
  tmux.panes.delete('%200')

  expect(await run($, 'p2')).toContain('troupe panel opened on the right')
  expect(splits(tmux)).toHaveLength(2)
})

test('/troupe close and the session end close the panel', async ($, on) => {
  const clock = mock.clock(on)
  const tmux = serves(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await run($, 'p2')

  expect(await run($, 'close')).toContain('troupe panel closed.')
  expect(tmux.panes.has('%200')).toBe(false)
  expect(await run($, 'close')).toContain('no troupe panel is open.')

  await run($, 'p2')
  expect(tmux.panes.has('%200')).toBe(true)
  await $.session.end({ reason: 'other', sessionId: 's1', resume: {} } as never)
  expect(tmux.panes.has('%200')).toBe(false)
})

test('outside tmux /troupe says troupe needs it: no split, no file written', async ($, on) => {
  const clock = mock.clock(on)
  const tmux = serves(on, { env: undefined, panes: new Set() })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()

  expect(await run($, 'p2')).toContain('troupe needs tmux')
  expect(splits(tmux)).toEqual([])
  expect(tmux.writes).toEqual([])
})
