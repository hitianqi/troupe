import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { execute } from '../dist/commands.js'
import { mission, runtime } from '../dist/command-context.js'
import { append, readLog } from '../dist/log.js'
import { tmux } from '../dist/run.js'

test('real scratch tmux: dispatch, live status, bracketed send, result wait and close', { skip: spawnSync('tmux', ['-V']).status !== 0, timeout: 20000 }, async t => {
  const base = mkdtempSync(join(tmpdir(), 'troupe-command-integration-'))
  const root = join(base, "repo with 'quotes'")
  const home = join(base, 'home')
  const socket = `troupe-test-${process.pid}-${randomUUID().slice(0, 8)}`
  mkdirSync(root)
  mkdirSync(home)
  const env = { ...process.env, TMUX: undefined, TMUX_PANE: undefined, TROUPE_TMUX_SOCKET: socket }
  t.after(() => {
    tmux(['kill-server'], undefined, env)
    rmSync(base, { recursive: true, force: true })
  })
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  const agent = join(root, 'fake-agent.sh')
  writeFileSync(agent, `#!/bin/sh
printf 'WORKING\\n'
sleep 1
printf '\\033[2J\\033[H\\033[?2004hREADY\\n'
while IFS= read -r line; do
  mkdir -p .troupe
  printf '%s\\n' '---' 'status: done' 'summary: "fake agent received a line"' '---' 'Scratch result.' > .troupe/result.md
  printf '\\033[2J\\033[HREADY\\n'
done
`)
  chmodSync(agent, 0o755)
  mkdirSync(join(root, '.troupe/agents'), { recursive: true })
  writeFileSync(join(root, '.troupe/agents/fake.yaml'), `command: ${JSON.stringify(agent)}
model: []
effort: []
permission:
  - [--policy]
prompt: last-arg
screen:
  waits: ['^WAIT$']
  working: ['^WORKING$']
  ready: ['^READY$']
paste: bracketed
`)
  mkdirSync(join(root, 'docs/missions/m1'), { recursive: true })
  writeFileSync(join(root, 'docs/missions/m1/plan.md'), '# Scratch\n\n```yaml\ngoal: Check commands\nbase: main\nroles:\n  api:\n    agent: fake\n    flags: [--policy, ask]\n    touches: []\n```\n\n## Role: api\n\nReply when sent a line.\n')
  git('add', '.')
  git('-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'commit', '-qm', 'initial')
  const r = runtime({ cwd: root, home, env, inputTTY: false, outputTTY: false })
  const m = mission(r, 'm1')
  append(m.log, 'panel', { ev: 'gate-answer', gate: 'plan', answer: 'approve', plan: m.hash })
  const dispatched = await execute('dispatch', ['api', '-m', 'm1'], r)
  assert.equal(dispatched.code, 0, dispatched.out)
  const seen = new Set()
  for (let n = 0; n < 60; n++) {
    const status = await execute('status', ['--json', '-m', 'm1'], r)
    assert.equal(status.code, 0, status.out)
    const role = JSON.parse(status.out).roles[0]
    seen.add(role.state)
    if (role.state === 'idle') break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.ok(seen.has('working'), [...seen].join(', '))
  assert.ok(seen.has('idle'), [...seen].join(', '))
  const sent = await execute('send', ['api', 'Hello from the integration test', '-m', 'm1'], r)
  assert.equal(sent.code, 0, sent.out)
  const waited = await execute('wait', ['--role', 'api', '--timeout', '5', '-m', 'm1'], r)
  assert.equal(waited.code, 0, waited.out)
  assert.match(waited.out, /done: fake agent received a line/)
  const status = JSON.parse((await execute('status', ['--json', '-m', 'm1'], r)).out)
  assert.equal(status.roles[0].state, 'done')
  assert.deepEqual(status.roles[0].outside, [])
  const closed = await execute('close', ['api', '-m', 'm1'], r)
  assert.equal(closed.code, 0, closed.out)
  assert.ok(existsSync(status.roles[0].worktree))
  assert.equal(git('rev-parse', '--verify', 'role/m1/api').trim().length, 40)
  assert.deepEqual(readLog(m.log).events.map(e => e.ev), ['gate-answer', 'dispatch', 'send', 'close'])
  assert.match(readFileSync(join(status.roles[0].worktree, '.troupe/result.md'), 'utf8'), /Scratch result/)
})
