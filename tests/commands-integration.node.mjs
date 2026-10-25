import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'

import { execute } from '../dist/commands.js'
import { mission, runtime } from '../dist/command-context.js'
import { append, readLog } from '../dist/log.js'
import { tmux } from '../dist/run.js'
import { gitDirsOf } from '../dist/role-commands.js'

test('real scratch tmux: open marks one panel, keeps focus, and is a no-op the second time', { skip: spawnSync('tmux', ['-V']).status !== 0, timeout: 15000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'troupe-open-integration-'))
  const socket = `troupe-open-${process.pid}-${randomUUID().slice(0, 8)}`
  const env = { ...process.env, TMUX: undefined, TMUX_PANE: undefined, TROUPE_TMUX_SOCKET: socket }
  t.after(() => {
    tmux(['kill-server'], undefined, env)
    rmSync(root, { recursive: true, force: true })
  })
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim()
  const caller = tmux(['new-session', '-d', '-s', 'agent', '-P', '-F', '#{pane_id}', 'sleep 30'], undefined, env)
  assert.equal(caller.code, 0, caller.err)
  const pane = caller.out.trim()
  const r = runtime({ cwd: root, env: { ...env, TMUX: 'scratch', TMUX_PANE: pane } })
  const first = await execute('open', [], r)
  assert.equal(first.code, 0, first.out)
  const list = () => tmux(['list-panes', '-a', '-F', '#{pane_id}\t#{@troupe-panel}'], undefined, env).out.trim().split('\n')
  const panes = list()
  assert.equal(panes.length, 2)
  assert.equal(panes.filter(line => line.endsWith(`\t${repo}`)).length, 1)
  assert.equal(tmux(['display', '-p', '-t', 'agent', '#{pane_id}'], undefined, env).out.trim(), pane)
  const second = await execute('open', [], r)
  assert.equal(second.code, 0, second.out)
  assert.match(second.out, /already open/)
  assert.deepEqual(list(), panes)
})

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
  const session = `troupe-${basename(root).replace(/[^A-Za-z0-9_-]/g, '-')}`
  const manual = tmux(['new-session', '-d', '-s', session, '-n', 'roles', '-P', '-F', '#{pane_id}', 'sleep 30'], undefined, env)
  assert.equal(manual.code, 0, manual.err)
  const manualPane = manual.out.trim()
  const rolesWindow = tmux(['display', '-p', '-t', manualPane, '#{window_id}'], undefined, env).out.trim()
  const dispatched = await execute('dispatch', ['api', '-m', 'm1'], r)
  assert.equal(dispatched.code, 0, dispatched.out)
  const dispatch = readLog(m.log).events.find(e => e.ev === 'dispatch')
  const brief = join(dispatch.worktree, '.troupe/brief.md')
  assert.equal(dispatch.argv.at(-1), `Read the brief in ${brief} and follow it.`)
  assert.equal(readFileSync(brief, 'utf8'), readFileSync(join(m.common, 'troupe/m1/brief-api.md'), 'utf8'))
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dispatch.worktree, encoding: 'utf8' }).trim(), '')
  assert.equal(readLog(m.log).events.find(e => e.ev === 'dispatch').window, rolesWindow)
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
  assert.equal((await execute('dispatch', ['api', '-m', 'm1'], r)).code, 0)
  assert.equal((await execute('wait', ['--role', 'api', '--ready', '--timeout', '5', '-m', 'm1'], r)).code, 0)
  const reopened = readLog(m.log).events.filter(e => e.ev === 'dispatch').at(-1)
  const torn = await execute('teardown', ['-m', 'm1'], r)
  assert.equal(torn.code, 0, torn.out)
  assert.notEqual(tmux(['display', '-p', '-t', reopened.pane, '#{pane_id}'], undefined, env).out.trim(), reopened.pane)
  assert.equal(existsSync(reopened.worktree), false)
  assert.equal(tmux(['display', '-p', '-t', manualPane, '#{pane_id}'], undefined, env).out.trim(), manualPane)
  assert.equal(readLog(m.log).events.at(-1).ev, 'teardown')
})

const cleanupRepo = t => {
  const root = mkdtempSync(join(tmpdir(), 'troupe-teardown-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q', '-b', 'mission/m1')
  git('config', 'user.name', 'Probe')
  git('config', 'user.email', 'probe@example.invalid')
  mkdirSync(join(root, 'docs/missions/m1'), { recursive: true })
  writeFileSync(join(root, 'docs/missions/m1/plan.md'), '# Cleanup\n\n```yaml\ngoal: Cleanup\nbase: mission/m1\nroles:\n  api:\n    agent: claude\n    flags: [--permission-mode, acceptEdits]\n    touches: [src/]\n```\n\n## Role: api\n\nBuild it.\n')
  writeFileSync(join(root, 'tracked'), 'initial')
  git('add', '.')
  git('commit', '-qm', 'initial')
  const r = runtime({ cwd: root, home: join(root, 'home') })
  const m = mission(r, 'm1')
  append(m.log, 'orch', { ev: 'stage', stage: 'build' })
  const path = join(root, '.troupe/worktrees/m1/api')
  git('worktree', 'add', '-qb', 'role/m1/api', path)
  const call = (...args) => execute('teardown', ['-m', 'm1', ...args], r)
  const events = () => readLog(m.log).events
  return { root, git, r, m, path, call, events }
}

test('Codex Git grants stay within its index, shared objects and mission refs', t => {
  const w = cleanupRepo(t)
  const role = { ...w.m.plan.roles[0], agent: 'codex', flags: ['-a', 'on-request', '-s', 'workspace-write'] }
  const dirs = gitDirsOf(w.r, w.m, role, w.path)
  assert.deepEqual(dirs, [
    w.git('-C', w.path, 'rev-parse', '--absolute-git-dir').trim(),
    join(w.m.common, 'objects'), join(w.m.common, 'refs/heads/role/m1'), join(w.m.common, 'logs/refs/heads/role/m1'),
  ])
  assert.ok(dirs.every(existsSync))
  assert.ok(!dirs.includes(w.m.common))
  assert.ok(!dirs.includes(join(w.m.common, 'refs/heads')))
  for (const flags of [['-s', 'read-only'], ['--sandbox=workspace-write', '-s', 'read-only'], ['-s', 'workspace-write', '--dangerously-bypass-approvals-and-sandbox']]) {
    assert.deepEqual(gitDirsOf(w.r, w.m, { ...role, flags }, w.path), [])
  }
  assert.deepEqual(gitDirsOf(w.r, w.m, { ...role, agent: 'claude' }, w.path), [])
  assert.equal(gitDirsOf(w.r, w.m, { ...role, flags: ['--sandbox=workspace-write'] }, w.path).length, 4)
})

test('teardown protects unmerged commits, tracked edits and untracked files; force preserves MR head and log', async t => {
  const w = cleanupRepo(t)
  const gitRole = (...args) => execFileSync('git', args, { cwd: w.path, encoding: 'utf8' })
  writeFileSync(join(w.path, 'committed'), 'valuable work')
  gitRole('add', '.')
  gitRole('commit', '-qm', 'unmerged')
  let reply = await w.call()
  assert.equal(reply.code, 1, reply.out)
  assert.match(reply.out, /role\/m1\/api: unmerged into mission\/m1/)
  w.git('merge', '--ff-only', 'role/m1/api')
  writeFileSync(join(w.path, 'tracked'), 'dirty')
  writeFileSync(join(w.path, 'untracked'), 'valuable scratch')
  reply = await w.call()
  assert.equal(reply.code, 1, reply.out)
  assert.match(reply.out, /dirty or untracked/)
  gitRole('restore', 'tracked')
  assert.match((await w.call()).out, /dirty or untracked/, 'untracked files alone are protected')
  assert.ok(!w.events().some(e => e.ev === 'teardown'))
  const head = w.git('rev-parse', 'mission/m1')
  writeFileSync(join(w.m.common, 'troupe/m1/brief-api.md'), 'brief')
  writeFileSync(join(w.m.common, 'troupe/m1/result-api-old.md'), 'moved result')
  reply = await w.call('--force')
  assert.equal(reply.code, 0, reply.out)
  assert.equal(w.git('rev-parse', 'mission/m1'), head)
  assert.equal(existsSync(w.path), false)
  assert.equal(existsSync(join(w.root, '.troupe/worktrees/m1')), false)
  assert.equal(w.git('branch', '--list', 'role/m1/*').trim(), '')
  assert.equal(existsSync(join(w.m.common, 'troupe/m1/brief-api.md')), false)
  assert.equal(existsSync(join(w.m.common, 'troupe/m1/result-api-old.md')), false)
  assert.equal(w.events().at(-1).ev, 'teardown')
  assert.match((await w.call()).out, /Nothing left/)
  assert.equal(w.events().filter(e => e.ev === 'teardown').length, 1)
  assert.equal((await execute('teardown', [], w.r)).code, 1, 'finished missions need explicit -m')
})

test('clean teardown works without force and partial failure stays open for a retry', async t => {
  const w = cleanupRepo(t)
  const failed = await execute('teardown', ['-m', 'm1'], { ...w.r, run: (command, args, options) => command === 'git' && args[0] === 'branch' && args[1] === '-D'
    ? { code: 1, out: '', err: 'simulated branch deletion failure' } : w.r.run(command, args, options) })
  assert.equal(failed.code, 1)
  assert.match(failed.out, /simulated branch deletion failure/)
  assert.equal(existsSync(w.path), false)
  assert.ok(!w.events().some(e => e.ev === 'teardown'))
  assert.equal(mission(w.r).name, 'm1', 'partial cleanup remains selected')
  const reply = await w.call()
  assert.equal(reply.code, 0, reply.out)
  assert.match((await w.call()).out, /Nothing left/)
})

test('a commit made while panes close is retained and does not finish teardown', async t => {
  const w = cleanupRepo(t)
  let committed = false
  const reply = await execute('teardown', ['-m', 'm1'], { ...w.r, run: (command, args, options) => {
    if (!committed && command === 'git' && args[0] === 'merge-base') {
      const result = w.r.run(command, args, options)
      writeFileSync(join(w.path, 'late'), 'late commit')
      execFileSync('git', ['add', 'late'], { cwd: w.path })
      execFileSync('git', ['commit', '-qm', 'late'], { cwd: w.path })
      committed = true
      return result
    }
    return w.r.run(command, args, options)
  } })
  assert.equal(reply.code, 1, reply.out)
  assert.match(reply.out, /unmerged into mission\/m1/)
  assert.ok(existsSync(w.path))
  assert.ok(!w.events().some(e => e.ev === 'teardown'))
  assert.match(w.git('log', '-1', '--format=%s', 'role/m1/api'), /late/)
})
