import type { EngineInterface, Register } from 'claude-code'

// p3 o1 probe: from a hook, open a window running interactive `claude` in a
// tmux session of its own on the scratch server, and type fixed briefs into
// it. Every command is a fixed shape; the only input is a step name from the
// fixed list below. Keys go only to windows this module opened itself.

const ROOT = '/home/tizh/scratch/troupe/p3-o1'
const SOCKET = `${ROOT}/tmux.sock`
const REPO = `${ROOT}/repo`
const SESSION = 'tprobe-role'

const BRIEFS = {
  one: 'Reply with exactly the word PONG-ONE and nothing else.',
  tool: 'Use the Bash tool to run: touch tool-landed.txt ; then reply with exactly DONE-TOOL.',
  second: 'Reply with exactly the word PONG-SECOND and nothing else.',
  multi: 'This brief has three lines.\nLine two: remember the word KIWI.\nLine three: reply with exactly MULTI-OK plus the word from line two.',
  file: `Read the brief in ${ROOT}/brief.md and follow it.`,
  partial: 'half typed by a person',
  big: '',
} as const

/** window name → pane id, for windows this module opened. */
const opened = new Map<string, string>()

const tmux = (...args: string[]) => ['tmux', '-S', SOCKET, ...args]
const run = ($: EngineInterface, argv: string[]) => $.process.run(argv, { timeoutMs: 5000 })

async function log($: EngineInterface, step: string, argv: string[], result: { exitCode: number; stdout: string; stderr: string }) {
  const line = `${new Date(await $.clock.now()).toISOString()} ${step} ${JSON.stringify(argv)} -> exit ${result.exitCode} stdout ${JSON.stringify(result.stdout.trim())} stderr ${JSON.stringify(result.stderr.trim())}\n`
  const path = `${ROOT}/ev/probe-log.txt`
  const before = await $.fs.read(path).catch(() => '')
  await $.fs.write(path, before + line)

  return line
}

/** Opens window `name` running claude (with `--permission-mode auto` for `auto`) in the role session. */
async function open($: EngineInterface, name: 'default' | 'auto' | 'manual' | 'eager') {
  const claude = name === 'auto' || name === 'manual' ? ['claude', '--permission-mode', name] : ['claude']
  const has = await run($, tmux('has-session', '-t', SESSION))
  const argv =
    has.exitCode === 0
      ? tmux('new-window', '-d', '-t', `${SESSION}:`, '-n', name, '-c', REPO, '-P', '-F', '#{pane_id}', ...claude)
      : tmux('new-session', '-d', '-s', SESSION, '-n', name, '-c', REPO, '-x', '120', '-y', '40', '-P', '-F', '#{pane_id}', ...claude)
  const result = await run($, argv)
  const pane = result.stdout.trim()
  if (result.exitCode === 0 && pane.startsWith('%')) opened.set(name, pane)

  return { pane, line: await log($, `open ${name}`, argv, result) }
}

/** Types brief `brief` into window `name` as literal keys, then Enter (unless `partial`). */
async function type($: EngineInterface, name: string, brief: keyof typeof BRIEFS, how: 'keys' | 'paste') {
  const pane = opened.get(name)
  if (pane === undefined) return `no window ${name} opened by this module`
  const lines: string[] = []
  const text = brief === 'big' ? await $.fs.read(`${ROOT}/big.md`) : BRIEFS[brief]
  if (how === 'paste') {
    const file = `${ROOT}/ev/buffer.txt`
    await $.fs.write(file, text)
    const load = tmux('load-buffer', '-b', 'tprobe', file)
    lines.push(await log($, `load ${brief}`, load, await run($, load)))
    const paste = tmux('paste-buffer', '-p', '-d', '-b', 'tprobe', '-t', pane)
    lines.push(await log($, `paste ${brief}`, paste, await run($, paste)))
  } else {
    const keys = tmux('send-keys', '-t', pane, '-l', text)
    lines.push(await log($, `keys ${brief}`, keys.map(a => (a.length > 200 ? `<${a.length} chars>` : a)), await run($, keys)))
  }
  if (brief !== 'partial') {
    const enter = tmux('send-keys', '-t', pane, 'Enter')
    lines.push(await log($, `enter ${brief}`, enter, await run($, enter)))
  }

  return lines.join('')
}

async function step($: EngineInterface, args: string): Promise<string> {
  const [verb, a, b] = args.trim().split(/\s+/)
  if (verb === 'open' && (a === 'default' || a === 'auto' || a === 'manual' || a === 'eager')) return (await open($, a)).line
  if (verb === 'type' && a && b && b in BRIEFS) return type($, a, b as keyof typeof BRIEFS, 'keys')
  if (verb === 'paste' && a && b && b in BRIEFS) return type($, a, b as keyof typeof BRIEFS, 'paste')
  // Opens a window and types a brief at once, before claude has drawn.
  if (verb === 'eager') {
    const { line } = await open($, 'eager')
    return line + (await type($, 'eager', 'one', 'keys'))
  }
  if (verb === 'close') {
    const argv = tmux('kill-session', '-t', SESSION)
    opened.clear()
    return log($, 'close', argv, await run($, argv))
  }

  return `steps: open default|auto, type <window> ${Object.keys(BRIEFS).join('|')}, paste <window> <brief>, eager, close`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tprobe', description: 'p3 o1 probe: fixed tmux steps', argumentHint: 'open|type|paste|eager|close' })

    return next(e)
  })
  on('command.run', { command: 'tprobe' }, async ($, e) => ({ text: await step($, e.args) }))
}
