import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import fs, { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import { execute } from '../dist/commands.js'
import { locked, mission, runtime } from '../dist/command-context.js'
import { append, readLog } from '../dist/log.js'
import { shellOf } from '../dist/run.js'
import { INSTALL_MARKER } from '../dist/setup.js'

const adapter = `command: fake
model: [--model, '{model}']
effort: [--effort, '{effort}']
permission:
  - [--policy]
prompt: last-arg
screen:
  waits: ['^WAIT$']
  working: ['^WORKING$']
  ready: ['^READY$']
paste: bracketed
`
const plan = (deps = false) => `# Test mission

\`\`\`yaml
goal: Ship the feature
why: People need it
base: main
roles:
  api:
    agent: fake
    model: small
    effort: low
    flags: [--policy, ask]
    touches: [src/]
    text: instructions.md
    skills: [probe-skill]
  web:
    agent: fake
    flags: [--policy, ask]
    touches: [web/]
    depends_on: ${deps ? '[api]' : '[]'}
\`\`\`

## Role: api

Build the endpoint.

## Role: web

Build the page.
`

const world = t => {
  const base = mkdtempSync(join(tmpdir(), 'troupe-command-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = join(base, "repo with 'quotes'")
  const home = join(base, 'home')
  const pkg = join(base, 'package')
  const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
  write(join(root, 'docs/missions/m1/plan.md'), plan())
  write(join(root, 'instructions.md'), 'Reference instructions.')
  write(join(root, '.troupe/agents/fake.yaml'), adapter)
  mkdirSync(join(root, '.git'), { recursive: true })
  mkdirSync(home)
  write(join(pkg, 'skills/troupe-mission/SKILL.md'), 'Workflow instructions.')
  const calls = []
  const panes = new Map()
  const worktrees = new Map()
  let nextPane = 0
  let nextWindow = 0
  let sessionOwner = ''
  let clock = 0
  let afterLoad
  const yes = out => ({ code: 0, out: out ?? '', err: '' })
  const no = () => ({ code: 1, out: '', err: 'not found' })
  const run = (command, raw, options = {}) => {
    calls.push({ command, args: [...raw], ...options })
    const args = command === 'tmux' ? raw.slice(2) : raw
    if (command === 'which') return yes(`/fake/${args[0]}\n`)
    if (command === 'git') {
      if (args.includes('--show-toplevel')) return yes(root)
      if (args.includes('--git-common-dir')) return yes('.git')
      if (args[0] === 'rev-parse') return yes('abcdef123456')
      if (args[0] === 'show-ref') return no()
      if (args[0] === 'worktree' && args[1] === 'list') return yes([...worktrees].map(([path, branch]) => `worktree ${path}\0branch refs/heads/${branch}\0\0`).join(''))
      if (args[0] === 'worktree' && args[1] === 'add') {
        const path = args.at(-2)
        const branch = args[args.indexOf('-b') + 1]
        mkdirSync(path, { recursive: true })
        worktrees.set(path, branch)
      }
      return yes()
    }
    assert.equal(command, 'tmux')
    assert.deepEqual(raw.slice(0, 2), ['-L', 'unit-socket'])
    const target = args[args.indexOf('-t') + 1]
    if (args[0] === 'has-session') return panes.size ? yes() : no()
    if (['new-session', 'new-window', 'split-window'].includes(args[0])) {
      const parent = panes.get(target)
      const pane = `%${++nextPane}`
      const window = parent?.window ?? `@${++nextWindow}`
      panes.set(pane, { window, owner: '', screen: 'READY', dead: false })
      return yes(`$1 ${window} ${pane}\n`)
    }
    if (args[0] === 'set-option') {
      if (args.includes('@troupe-owner')) panes.get(target).owner = args.at(-1)
      if (args.includes('@troupe-session')) sessionOwner = args.at(-1)
    }
    if (args[0] === 'display') {
      if (args.at(-1) === '#{socket_path}') return yes('/unit/socket')
      if (args.at(-1) === '#{session_id}') return yes('$1')
      if (target === '$1') return panes.size ? yes(`$1 ${sessionOwner}`) : no()
      const p = panes.get(target)
      return p ? yes(`${target}\t${p.dead ? 1 : 0}\t$1\t${p.window}\t${p.owner}`) : no()
    }
    if (args[0] === 'capture-pane') return panes.has(target) ? yes(panes.get(target).screen) : no()
    if (args[0] === 'list-panes') return yes([...panes].filter(([, p]) => p.window === target).map(([id, p]) => `${id} ${p.owner}`).join('\n'))
    if (args[0] === 'load-buffer') afterLoad?.()
    if (args[0] === 'kill-pane') panes.delete(target)
    return yes()
  }
  const output = []
  const r = runtime({ cwd: root, home, packageRoot: pkg, env: { TROUPE_TMUX_SOCKET: 'unit-socket' }, run, inputTTY: true, outputTTY: true,
    ask: async () => 'y', input: async () => 'stdin line\nsecond line', write: text => output.push(text),
    now: () => clock, sleep: async ms => { clock += ms } })
  const call = (command, ...args) => execute(command, args, r)
  const events = () => readLog(join(root, '.git/troupe/m1/log.jsonl')).events
  const approve = () => call('approve', '-m', 'm1')

  return { root, home, pkg, write, calls, panes, output, r, call, events, approve, afterLoad: fn => { afterLoad = fn } }
}

test('dispatch refuses unapproved, changed, problematic and unknown roles without opening panes', async t => {
  const w = world(t)
  assert.match((await w.call('dispatch', 'api')).out, /not approved/)
  assert.equal((await w.approve()).code, 0)
  w.write(join(w.root, 'instructions.md'), 'Changed reference.')
  assert.match((await w.call('dispatch', 'api')).out, /not approved/)
  await w.approve()
  w.write(join(w.root, 'docs/missions/m1/plan.md'), plan() + '\n')
  assert.match((await w.call('dispatch', 'api')).out, /not approved/)
  await w.approve()
  assert.match((await w.call('dispatch', 'missing')).out, /unknown role/)
  w.write(join(w.root, '.troupe/agents/broken.yaml'), 'command: {not: supported}')
  const bad = await w.call('dispatch', 'api')
  assert.equal(bad.code, 1)
  assert.match(bad.out, /broken.yaml: line 1/)
  assert.equal(w.panes.size, 0)
  assert.equal(w.calls.filter(c => c.args.includes('worktree') && c.args.includes('add')).length, 0)
})

test('approval requires both TTYs, refuses problems, and rechecks the hash after the question', async t => {
  const w = world(t)
  for (const tty of [{ inputTTY: false }, { outputTTY: false }]) {
    assert.match((await execute('approve', [], { ...w.r, ...tty })).out, /both stdin and stdout/)
  }
  assert.equal(w.events().length, 0)
  const changed = await execute('approve', [], { ...w.r, ask: async () => { w.write(join(w.root, 'instructions.md'), 'edited'); return 'y' } })
  assert.equal(changed.code, 1)
  assert.match(changed.out, /changed while approval/)
  assert.equal(w.events().length, 0)
  w.write(join(w.root, 'docs/missions/m1/plan.md'), plan().replace('flags: [--policy, ask]', 'flags: []'))
  assert.match((await w.approve()).out, /flags must pin/)
})

test('dispatch writes a complete brief, quoted argv and log event, refuses duplicates and enforces dependencies', async t => {
  const w = world(t)
  w.write(join(w.root, 'docs/missions/m1/plan.md'), plan(true))
  await w.approve()
  assert.match((await w.call('dispatch', 'web')).out, /dependencies: api/)
  const result = await w.call('dispatch', 'api')
  assert.equal(result.code, 0, result.out)
  const opened = w.events().find(e => e.ev === 'dispatch')
  assert.equal(opened.branch, 'role/m1/api')
  assert.equal(opened.base, 'abcdef123456')
  assert.ok(opened.owner)
  assert.deepEqual(opened.argv.slice(0, 7), ['fake', '--model', 'small', '--effort', 'low', '--policy', 'ask'])
  assert.ok(w.calls.some(c => c.command === 'tmux' && c.args.at(-1) === shellOf(opened.argv)))
  const brief = readFileSync(join(w.root, '.git/troupe/m1/brief-api.md'), 'utf8')
  for (const text of ['Ship the feature', 'People need it', 'Build the endpoint.', 'Reference instructions.', 'src/', 'probe-skill', 'Commit your changes', '.troupe/result.md', 'blocked or failed']) assert.ok(brief.includes(text), text)
  assert.match((await w.call('dispatch', 'api')).out, /already open/)
  w.write(join(opened.worktree, '.troupe/result.md'), '---\nstatus: done\nsummary: built\n---\n')
  assert.equal((await w.call('dispatch', 'web')).code, 0)
  assert.ok(w.calls.some(c => c.args.includes('split-window')))
  assert.equal(readFileSync(join(w.root, '.git/info/exclude'), 'utf8').split('/.troupe/').length, 2)
})

test('send refuses waits, working, unknown, drafts and foreign panes and rechecks immediately before paste', async t => {
  const w = world(t)
  assert.match((await w.call('send', 'api', 'hello')).out, /no open pane/)
  await w.approve()
  await w.call('dispatch', 'api')
  const p = [...w.panes.values()][0]
  for (const screen of ['WAIT', 'WORKING', 'unrecognized', 'READY draft']) {
    p.screen = screen
    const sent = await w.call('send', 'api', 'hello')
    assert.equal(sent.code, 1)
    assert.match(sent.out, /nothing was typed/)
  }
  const owner = p.owner
  p.owner = 'foreign'
  assert.match((await w.call('send', 'api', 'hello')).out, /not opened by troupe/)
  p.owner = owner
  p.screen = 'READY'
  const result = join(w.events().find(e => e.ev === 'dispatch').worktree, '.troupe/result.md')
  w.write(result, '---\nstatus: done\n---\n')
  w.afterLoad(() => { p.screen = 'WAIT' })
  assert.equal((await w.call('send', 'api', 'hello')).code, 1)
  assert.ok(!w.calls.some(c => c.args.includes('paste-buffer') || c.args.includes('send-keys')))
  assert.ok(existsSync(result), 'a refused send keeps the result')
  w.afterLoad(undefined)
  p.screen = 'READY'
  assert.equal((await execute('send', ['api'], { ...w.r, inputTTY: false })).code, 0)
  assert.ok(!existsSync(result), 'new work puts the old result aside')
  assert.ok(readdirSync(join(w.root, '.git/troupe/m1')).some(file => /^result-api-.+\.md$/.test(file)))
  assert.ok(w.calls.some(c => c.args.includes('load-buffer') && c.input === 'stdin line\nsecond line'))
  assert.equal(w.events().at(-1).ev, 'send')
  assert.equal(w.events().at(-1).text, 'stdin line\nsecond line')
})

test('status, wait and close read live state, retain worktrees, and refuse foreign panes', async t => {
  const w = world(t)
  await w.approve()
  await w.call('dispatch', 'api')
  const opened = w.events().find(e => e.ev === 'dispatch')
  const pane = w.panes.get(opened.pane)
  pane.screen = 'WORKING'
  assert.equal(JSON.parse((await w.call('status', '--json')).out).roles[0].state, 'working')
  assert.match((await w.call('wait', '--role', 'api', '--timeout', '0')).out, /Timed out/)
  w.write(join(opened.worktree, '.troupe/result.md'), '---\nstatus: blocked\nsummary: Need a key\n---\n')
  assert.deepEqual(await w.call('wait', '--role', 'api'), { code: 1, out: 'blocked: Need a key\n' })
  w.write(join(opened.worktree, '.troupe/result.md'), '---\nstatus: done\nsummary: Done now\n---\n')
  assert.deepEqual(await w.call('wait', '--role', 'api'), { code: 0, out: 'done: Done now\n' })
  const owner = pane.owner
  pane.owner = 'foreign'
  assert.equal((await w.call('close', 'api')).code, 1)
  assert.equal(w.panes.size, 1)
  pane.owner = owner
  assert.equal((await w.call('close', '--all')).code, 0)
  assert.equal(w.panes.size, 0)
  assert.ok(existsSync(opened.worktree))
  assert.equal(w.events().at(-1).ev, 'close')
  assert.equal(JSON.parse((await w.call('status', '--json')).out).roles[0].state, 'closed')
})

test('stage validation, gate reopen/answer, timeout and usage errors', async t => {
  const w = world(t)
  assert.equal((await w.call('stage', 'build')).code, 0)
  assert.equal((await w.call('stage', 'not-a-stage')).code, 1)
  const custom = 'stages:\n  - id: start\n    gate: plan\n  - id: special\n'
  w.write(join(w.home, '.agents/skills/troupe-mission/stages.yaml'), custom)
  assert.equal((await w.call('stage', 'special')).code, 0)
  assert.equal((await w.call('stage', 'build')).code, 1)
  await w.call('gate', 'plan', '--no-wait')
  assert.equal(w.events().at(-1).plan, mission(w.r).hash)
  await w.call('gate', 'release', 'Ship?', '--no-wait')
  const log = join(w.root, '.git/troupe/m1/log.jsonl')
  append(log, 'panel', { ev: 'gate-answer', gate: 'release', answer: 'change', text: 'Fix first' })
  assert.deepEqual(await w.call('wait', '--gate', 'release'), { code: 0, out: 'change: Fix first\n' })
  await w.call('gate', 'release', '--no-wait')
  assert.equal((await w.call('wait', '--gate', 'release', '--timeout', '0')).code, 1)
  let ticks = 0
  const answered = await execute('gate', ['release'], { ...w.r, sleep: async () => { ticks++; append(log, 'panel', { ev: 'gate-answer', gate: 'release', answer: 'approve' }) } })
  assert.equal(ticks, 1)
  assert.deepEqual(answered, { code: 0, out: 'approve\n' })
  for (const args of [[], ['--role', 'api', '--gate', 'release'], ['--gate', 'x', '--timeout', '-1'], ['--gate', 'x', '--timeout', 'NaN']]) assert.equal((await w.call('wait', ...args)).code, 2)
  assert.equal((await w.call('close', 'api', '--all')).code, 2)
  assert.equal((await w.call('status', '-m', '../escape')).code, 2)
  assert.equal((await w.call('status', '--remove')).code, 2)
  w.write(join(w.root, 'm1'), 'This is not the mission plan.')
  assert.equal((await w.call('check', '-m', 'm1')).code, 0)
  assert.equal((await w.call('dispatch', '../other')).code, 2)
})

test('setup updates marked copies and removes only its own skill directories', async t => {
  const w = world(t)
  assert.equal((await w.call('setup')).code, 0)
  const claude = join(w.home, '.claude/skills/troupe-mission')
  const codex = join(w.home, '.agents/skills/troupe-mission')
  assert.ok(existsSync(join(claude, INSTALL_MARKER)))
  w.write(join(w.pkg, 'skills/troupe-mission/SKILL.md'), 'Updated workflow')
  assert.equal((await w.call('setup')).code, 0)
  assert.equal(readFileSync(join(codex, 'SKILL.md'), 'utf8'), 'Updated workflow')
  rmSync(join(claude, INSTALL_MARKER))
  assert.equal((await w.call('setup', '--remove')).code, 1)
  assert.ok(existsSync(claude))
  assert.ok(!existsSync(codex))
  assert.equal((await w.call('setup')).code, 1)
})

test('up uses a new mission window, plain orchestrator and half-width panel, then attaches outside tmux', async t => {
  const w = world(t)
  const result = await w.call('up', '--orch', 'codex')
  assert.equal(result.code, 0, result.out)
  assert.ok(w.calls.some(c => c.args.includes('new-session') && c.args.at(-1) === "'codex'"))
  assert.ok(w.calls.some(c => c.args.includes('split-window') && c.args.includes('-h') && c.args.includes('50') && c.args.at(-1).includes("'panel'")))
  assert.ok(w.calls.some(c => c.args.includes('attach-session') && c.inherit))
  assert.equal(w.events().at(-1).ev, 'up')
  assert.equal((await execute('up', [], { ...w.r, env: { ...w.r.env, TMUX: 'unit', TMUX_PANE: '%1' } })).code, 0)
  assert.ok(w.calls.some(c => c.args.includes('new-window')))
  assert.equal((await w.call('up', '--orch', 'other')).code, 2)
})

test('shellOf preserves every argv element without command substitution', () => {
  const words = ['a space', "single'quote", '"double"', '$HOME', '`literal`', '$(literal)', 'two\nlines', '']
  const script = shellOf([process.execPath, '-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...words])
  assert.deepEqual(JSON.parse(execFileSync('/bin/sh', ['-c', script], { encoding: 'utf8' })), words)
})

test('workflow text resolves the package and installed skills, and changes the approval hash', async t => {
  const w = world(t)
  w.write(join(w.root, 'docs/missions/m1/plan.md'), plan().replace('text: instructions.md', 'text: workflow:builder'))
  w.write(join(w.pkg, 'skills/troupe-mission/roles/builder.md'), 'Package builder rules')
  assert.equal((await w.approve()).code, 0)
  w.write(join(w.pkg, 'skills/troupe-mission/roles/builder.md'), 'Changed package rules')
  assert.match((await w.call('dispatch', 'api')).out, /not approved/)
  w.write(join(w.home, '.agents/skills/troupe-mission/SKILL.md'), 'Installed workflow')
  w.write(join(w.home, '.agents/skills/troupe-mission/roles/builder.md'), 'Installed builder rules')
  await w.approve()
  assert.equal((await w.call('dispatch', 'api')).code, 0)
  assert.ok(readFileSync(join(w.root, '.git/troupe/m1/brief-api.md'), 'utf8').includes('Installed builder rules'))
})

test('a changed plan during worktree preparation never launches a role, and locks exclude overlapping commands', async t => {
  const w = world(t)
  await w.approve()
  const changing = (command, args, options) => {
    const result = w.r.run(command, args, options)
    if (command === 'git' && args[0] === 'worktree' && args[1] === 'add') w.write(join(w.root, 'instructions.md'), 'Edited during preparation')
    return result
  }
  const denied = await execute('dispatch', ['api'], { ...w.r, run: changing })
  assert.equal(denied.code, 1)
  assert.match(denied.out, /not approved|changed during dispatch/)
  assert.equal(w.panes.size, 0)
  const lock = join(w.root, '.git/troupe/m1/command.lock')
  mkdirSync(lock)
  assert.match((await w.call('dispatch', 'api')).out, /another command holds/)
  rmSync(lock, { recursive: true })
})

test('a command clears a lock whose holder exited and records its own pid while running', async t => {
  const w = world(t)
  await w.approve()
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await once(child, 'exit')
  const lock = join(w.root, '.git/troupe/m1/command.lock')
  w.write(join(lock, 'pid'), String(child.pid))
  const output = []
  const stdout = t.mock.method(process.stdout, 'write', text => { output.push(String(text)); return true })
  let result
  let held = false
  try {
    result = await execute('dispatch', ['api'], { ...w.r, run: (command, args, options) => {
      if (command === 'git' && args[0] === 'worktree' && args[1] === 'add') {
        assert.equal(readFileSync(join(lock, 'pid'), 'utf8'), String(process.pid))
        held = true
      }
      return w.r.run(command, args, options)
    } })
  } finally {
    stdout.mock.restore()
  }
  assert.equal(result.code, 0, result.out)
  assert.ok(held)
  assert.equal(output.length, 1)
  assert.equal(output[0], `Cleared stale command lock ${lock} (process ${child.pid} has exited).\n`)
  assert.ok(!existsSync(lock))
})

test('a stale contender cannot remove a lock another command has reclaimed', async t => {
  const w = world(t)
  await w.approve()
  const m = mission(w.r)
  const lock = join(dirname(m.log), 'command.lock')
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await once(child, 'exit')
  w.write(join(lock, 'pid'), String(child.pid))
  let release
  const hold = new Promise(resolve => { release = resolve })
  let winner
  let entered = false
  const kill = process.kill.bind(process)
  const check = t.mock.method(process, 'kill', (pid, signal) => {
    if (!winner) {
      check.mock.restore()
      // B already read the dead pid; A now reclaims and holds the new lock.
      winner = locked(m, () => hold)
    }
    return kill(pid, signal)
  })
  const output = []
  const stdout = t.mock.method(process.stdout, 'write', text => { output.push(String(text)); return true })
  try {
    await assert.rejects(locked(m, () => { entered = true }), /another command holds/)
    assert.equal(entered, false)
    assert.equal(readFileSync(join(lock, 'pid'), 'utf8'), String(process.pid))
    assert.ok(!existsSync(join(lock, 'reclaim')))
    assert.equal(output.length, 1)
  } finally {
    release()
    await winner
    stdout.mock.restore()
  }
  assert.ok(!existsSync(lock))
})

test('only one contender can remove a dead lock during reclamation', async t => {
  const w = world(t)
  await w.approve()
  const m = mission(w.r)
  const lock = join(dirname(m.log), 'command.lock')
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await once(child, 'exit')
  w.write(join(lock, 'pid'), String(child.pid))
  let contender
  let entered = false
  const remove = fs.rmSync
  const removal = t.mock.method(fs, 'rmSync', (path, options) => {
    if (path === lock && !contender) {
      // A is about to remove the old lock; B observes the same dead pid.
      contender = locked(m, () => { entered = true })
    }
    return remove(path, options)
  })
  syncBuiltinESMExports()
  const output = []
  const stdout = t.mock.method(process.stdout, 'write', text => { output.push(String(text)); return true })
  let release
  const hold = new Promise(resolve => { release = resolve })
  let winner
  try {
    winner = locked(m, () => hold)
    assert.ok(contender)
    await assert.rejects(contender, /another command holds/)
    assert.equal(entered, false)
    assert.equal(readFileSync(join(lock, 'pid'), 'utf8'), String(process.pid))
    assert.equal(output.length, 1)
  } finally {
    removal.mock.restore()
    syncBuiltinESMExports()
    release()
    await winner
    stdout.mock.restore()
  }
  assert.ok(!existsSync(lock))
})

test('commands refuse locks with live, missing, unreadable or invalid holder pids', async t => {
  const w = world(t)
  await w.approve()
  const lock = join(w.root, '.git/troupe/m1/command.lock')
  const kill = process.kill.bind(process)
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid === 1) throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
    return kill(pid, signal)
  })
  for (const pid of [String(process.pid), '1', undefined, 'unreadable', '', '0', '-1', '1.5', '99999999999999999999', 'invalid']) {
    mkdirSync(lock)
    if (pid === 'unreadable') mkdirSync(join(lock, 'pid'))
    else if (pid !== undefined) w.write(join(lock, 'pid'), pid)
    const result = await w.call('dispatch', 'api')
    assert.equal(result.code, 1)
    assert.ok(result.out.includes(`another command holds ${lock}`), result.out)
    if (pid !== String(process.pid) && pid !== '1') assert.ok(result.out.includes(`remove ${lock} by hand once no troupe command is running`), result.out)
    assert.ok(existsSync(lock))
    assert.equal(w.panes.size, 0)
    rmSync(lock, { recursive: true })
  }
})

test('redispatch reuses its branch/worktree and archives the old result', async t => {
  const w = world(t)
  await w.approve()
  await w.call('dispatch', 'api')
  const opened = w.events().find(e => e.ev === 'dispatch')
  w.write(join(opened.worktree, '.troupe/result.md'), '---\nstatus: done\nsummary: old result\n---\n')
  await w.call('close', 'api')
  assert.equal((await w.call('dispatch', 'api')).code, 0)
  assert.ok(!existsSync(join(opened.worktree, '.troupe/result.md')))
  assert.equal(w.calls.filter(c => c.command === 'git' && c.args[0] === 'worktree' && c.args[1] === 'add').length, 1)
  assert.equal(w.events().at(-1).worktree, opened.worktree)
  assert.equal(w.events().at(-1).branch, opened.branch)
})

test('status watch cancels, wait reports an exited pane, and up can start before a plan exists', async t => {
  const w = world(t)
  const stop = new AbortController()
  const watched = await execute('status', ['--watch'], { ...w.r, signal: stop.signal, sleep: async () => stop.abort() })
  assert.equal(watched.code, 0)
  assert.ok(w.output.some(text => text.includes('api: planned')))
  await w.approve()
  await w.call('dispatch', 'api')
  const pane = [...w.panes.values()][0]
  pane.dead = true
  assert.match((await w.call('wait', '--role', 'api')).out, /pane gone/)
  assert.equal((await w.call('send', 'api', 'hello')).code, 1)
  rmSync(join(w.root, 'docs/missions/m1/plan.md'))
  assert.equal((await w.call('up')).code, 0)
})

test('a failed capture does not turn an existing role into a missing pane', async t => {
  const w = world(t)
  await w.approve()
  await w.call('dispatch', 'api')
  const run = (command, args, options) => command === 'tmux' && args.includes('capture-pane')
    ? { code: 1, out: '', err: 'temporary capture error' }
    : w.r.run(command, args, options)
  assert.match((await execute('dispatch', ['api'], { ...w.r, run })).out, /already open/)
  assert.match((await execute('send', ['api', 'hello'], { ...w.r, run })).out, /unknown/)
  assert.equal(w.panes.size, 1)
})

test('foreign sessions and foreign panes in a roles window are never reused or closed', async t => {
  const w = world(t)
  await w.approve()
  w.panes.set('%99', { window: '@99', owner: 'foreign', screen: 'READY', dead: false })
  assert.match((await w.call('dispatch', 'api')).out, /cannot verify its ownership/)
  assert.equal(w.panes.size, 1)
  w.panes.clear()
  assert.equal((await w.call('dispatch', 'api')).code, 0)
  const own = [...w.panes.values()][0]
  w.panes.set('%99', { window: own.window, owner: 'foreign', screen: 'READY', dead: false })
  assert.match((await w.call('dispatch', 'web')).out, /pane troupe did not open/)
  assert.equal((await w.call('close', '--all')).code, 0)
  assert.deepEqual([...w.panes.keys()], ['%99'])
})

test('a pane is cleaned up if its dispatch cannot be logged', async t => {
  const w = world(t)
  await w.approve()
  const log = join(w.root, '.git/troupe/m1/log.jsonl')
  const run = (command, args, options) => {
    const result = w.r.run(command, args, options)
    if (command === 'tmux' && args.includes('select-pane')) {
      rmSync(log)
      mkdirSync(log)
    }
    return result
  }
  assert.equal((await execute('dispatch', ['api'], { ...w.r, run })).code, 1)
  assert.equal(w.panes.size, 0)
})

test('changing the explicit tmux socket cannot create a duplicate or target the wrong server', async t => {
  const w = world(t)
  await w.approve()
  await w.call('dispatch', 'api')
  const other = { ...w.r, env: { TROUPE_TMUX_SOCKET: 'other-socket' } }
  for (const [command, args] of [['dispatch', ['api']], ['send', ['api', 'hello']], ['close', ['api']]]) {
    assert.equal((await execute(command, args, other)).code, 1)
  }
  assert.equal(w.panes.size, 1)
})

test('changing the inherited tmux server refuses operations even if pane IDs are missing there', async t => {
  const w = world(t)
  await w.approve()
  await w.call('dispatch', 'api')
  const run = (command, args, options) => command === 'tmux' && args.at(-1) === '#{socket_path}'
    ? { code: 0, out: '/other/server', err: '' }
    : w.r.run(command, args, options)
  for (const [command, args] of [['dispatch', ['api']], ['send', ['api', 'hello']], ['close', ['api']]]) {
    assert.equal((await execute(command, args, { ...w.r, run })).code, 1)
  }
  assert.equal(w.panes.size, 1)
})
