import type { EngineInterface, Register } from 'claude-code'

// troupe Phase 2 probe (mission p2, order o1). The tmux and process calls run
// from a hook through $.process, never from a model Bash call. Every command
// is fixed here: keys go only to the test pane this probe made, which runs
// `cat` into a file (no shell), and only panes it made can be closed.

const SCRATCH = '/home/tizh/scratch/troupe/p2-o1'
const LOADED_AT = new Date().toISOString()
const SAFE_TEXT = /^[A-Za-z0-9 :._-]{1,80}$/

const made = new Set<string>()
const children = new Map<string, string>()

type ProbeInput = { action: string; text?: string; cols?: number; name?: string }

async function run($: EngineInterface, argv: string[]) {
  try {
    const r = await $.process.run(argv, { timeoutMs: 10_000 })

    return { argv, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
  } catch (error) {
    return { argv, rejected: String(error) }
  }
}

const out = (r: Awaited<ReturnType<typeof run>>) => ('stdout' in r ? r.stdout : '')

// The session's own tmux pane: TMUX and TMUX_PANE as the engine's process
// sees them, then the pane whose process is an ancestor of the engine's.
async function findPane($: EngineInterface) {
  const tmux = await $.env.get('TMUX')
  const tmuxPane = await $.env.get('TMUX_PANE')
  const display = await run($, ['tmux', 'display', '-p', '#{pane_id}'])
  const ancestry = await run($, [
    'sh',
    '-c',
    'p=$PPID; while [ "$p" -gt 1 ]; do echo $p; p=$(ps -o ppid= -p $p | tr -d " "); done',
  ])
  const panes = await run($, [
    'tmux', 'list-panes', '-a', '-F',
    '#{pane_id} #{pane_pid} #{session_name}:#{window_index} #{window_width}x#{window_height}',
  ])
  const pids = new Set(out(ancestry).split('\n').filter(Boolean))
  const own = out(panes).split('\n').find(line => pids.has(line.split(' ')[1] ?? ''))

  return { tmux, tmuxPane, display, ancestry, panes, ownPane: own?.split(' ')[0], ownLine: own }
}

async function act($: EngineInterface, input: ProbeInput): Promise<unknown> {
  switch (input.action) {
    case 'env':
      return findPane($)
    case 'testpane': {
      const r = await run($, [
        'tmux', 'new-session', '-d', '-s', 'tprobe-target', '-x', '80', '-y', '10',
        '-P', '-F', '#{pane_id}', `cat > ${SCRATCH}/received.txt`,
      ])
      const id = out(r).trim()
      if (id) made.add(id)

      return r
    }
    case 'sendkeys': {
      const target = [...made][0]
      if (!target) return 'make the test pane first'
      if (!SAFE_TEXT.test(input.text ?? '')) return 'text must match [A-Za-z0-9 :._-]{1,80}'
      const sent = await run($, ['tmux', 'send-keys', '-t', target, input.text ?? '', 'Enter'])
      const received = await run($, ['cat', `${SCRATCH}/received.txt`])

      return { sent, received }
    }
    case 'split': {
      const found = await findPane($)
      const target = found.ownPane
      if (!target) return { found, split: 'no own pane found' }
      const cols = String(Math.max(10, Math.min(120, Math.round(input.cols ?? 40))))
      const r = await run($, [
        'tmux', 'split-window', '-h', '-d', '-l', cols, '-t', target, '-P', '-F', '#{pane_id}',
        'sh', '-c', 'printf "tprobe split from a hook\\n"; tput cols; sleep 300',
      ])
      const id = out(r).trim()
      if (id) made.add(id)

      return { target, ownLine: found.ownLine, split: r }
    }
    case 'close': {
      const closed = []
      for (const id of made) closed.push(await run($, ['tmux', 'kill-pane', '-t', id]))
      made.clear()
      await run($, ['tmux', 'kill-session', '-t', 'tprobe-target'])

      return closed
    }
    case 'spawn': {
      const name = (input.name ?? 'child').replace(/[^a-z0-9-]/g, '')
      children.set(name, 'running')
      void (async () => {
        try {
          const child = $.process.spawn({
            argv: ['sh', '-c', `echo $$ > ${SCRATCH}/child-${name}.pid; exec sleep 3600`],
          })
          for await (const _piece of child) {
            // the child writes nothing
          }
          children.set(name, `ended ${JSON.stringify(await child.result)}`)
        } catch (error) {
          children.set(name, `rejected ${String(error)}`)
        }
      })()

      return { started: name, loadedAt: LOADED_AT }
    }
    case 'children':
      return { loadedAt: LOADED_AT, children: Object.fromEntries(children) }
    default:
      return `unknown action: ${input.action}`
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.tool.register({
      name: 'probe',
      description:
        'troupe Phase 2 probe (o1), tmux and process calls from the mod. action "env": TMUX, TMUX_PANE and the own pane. "testpane": a detached tmux session running cat into a scratch file. "sendkeys": type text (safe characters) plus Enter into that test pane. "split": split-window -h -l cols beside the own pane, running a fixed banner and sleep. "close": kill the panes this probe made. "spawn": a long-lived sleep child under name. "children": how they are.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['env', 'testpane', 'sendkeys', 'split', 'close', 'spawn', 'children'],
          },
          text: { type: 'string' },
          cols: { type: 'number' },
          name: { type: 'string' },
        },
        required: ['action'],
      },
      isDeferred: false,
    })
    $.ui.log(`tprobe loaded at ${LOADED_AT}`)

    return started
  })

  on('session.end', async ($, e, next) => {
    await run($, ['sh', '-c', `echo "session.end ${e.reason} $(date -Is)" >> ${SCRATCH}/session-end.log`])

    return next(e)
  })

  on('tool.call', { tool: 'mcp__tprobe__probe' }, async ($, e) => ({
    result: JSON.stringify(await act($, e as unknown as ProbeInput), null, 2),
  })).catch(($, e, next) => (next.called ? next(e) : { deny: 'tprobe: its probe hook failed.' }))
}
