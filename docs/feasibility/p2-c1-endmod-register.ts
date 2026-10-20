import type { EngineInterface, Register } from 'claude-code'

// troupe Phase 2 probe (o1), run in a scratch session: at session.start it
// spawns a long-lived sleep and looks for its own tmux pane on the default
// server; at session.end it logs the reason. Fixed commands only.

const OUT = '/home/tizh/scratch/troupe/p2-o1/end'

async function run($: EngineInterface, argv: string[]) {
  try {
    const r = await $.process.run(argv, { timeoutMs: 10_000 })

    return { argv, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
  } catch (error) {
    return { argv, rejected: String(error) }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void (async () => {
      const child = $.process.spawn({ argv: ['sh', '-c', `echo $$ > ${OUT}/child.pid; exec sleep 3600`] })
      for await (const _piece of child) {
        // the child writes nothing
      }
    })()
    const found = {
      tmux: await $.env.get('TMUX'),
      tmuxPane: await $.env.get('TMUX_PANE'),
      display: await run($, ['tmux', 'display', '-p', '#{pane_id}']),
      ancestry: await run($, [
        'sh', '-c', 'p=$PPID; while [ "$p" -gt 1 ]; do echo $p; p=$(ps -o ppid= -p $p | tr -d " "); done',
      ]),
      panes: await run($, ['tmux', 'list-panes', '-a', '-F', '#{pane_id} #{pane_pid}']),
      noServer: await run($, ['tmux', '-L', 'tprobe-no-such-server', 'list-panes', '-a']),
    }
    await $.fs.write(`${OUT}/start.json`, JSON.stringify(found, null, 2))

    return started
  })

  on('session.end', async ($, e, next) => {
    const alive = await run($, ['sh', '-c', `kill -0 $(cat ${OUT}/child.pid) && echo alive || echo gone`])
    await $.fs.write(`${OUT}/end.json`, JSON.stringify({ reason: e.reason, childAtEnd: alive }, null, 2))

    return next(e)
  })
}
