import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'

import { execute } from '../dist/commands.js'
import { mission, runtime } from '../dist/command-context.js'
import { append, readLog } from '../dist/log.js'
import { shellOf } from '../dist/run.js'
import { INSTALL_MARKER } from '../dist/setup.js'
import { panelEffect } from '../dist/panel-actions.js'
import { readPanel } from '../dist/panel-model.js'
import { gateTarget } from '../dist/panel-input.js'

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

const world = (t, env = { TROUPE_TMUX_SOCKET: 'unit-socket' }) => {
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
  let clock = 0
  let afterLoad
  const yes = out => ({ code: 0, out: out ?? '', err: '' })
  const no = () => ({ code: 1, out: '', err: 'not found' })
  const run = (command, raw, options = {}) => {
    calls.push({ command, args: [...raw], ...options })
    const args = command === 'tmux' && raw[0] === '-L' ? raw.slice(2) : raw
    if (command === 'which') return yes(`/fake/${args[0]}\n`)
    if (command === 'ps') return no()
    if (command === 'git') {
      if (args.includes('--show-toplevel')) return yes(root)
      if (args.includes('--git-common-dir')) return yes('.git')
      if (args[0] === 'rev-parse') return yes('abcdef123456')
      if (args[0] === 'show-ref') return no()
      if (args[0] === 'worktree' && args[1] === 'list') return yes([...worktrees].map(([path, branch]) => `worktree ${path}\0branch refs/heads/${branch}\0\0`).join(''))
      if (args[0] === 'worktree' && args[1] === 'remove') {
        rmSync(args.at(-1), { recursive: true, force: true })
        worktrees.delete(args.at(-1))
      }
      if (args[0] === 'worktree' && args[1] === 'add') {
        const path = args.at(-2)
        const branch = args[args.indexOf('-b') + 1]
        mkdirSync(path, { recursive: true })
        worktrees.set(path, branch)
      }
      return yes()
    }
    assert.equal(command, 'tmux')
    if (env.TROUPE_TMUX_SOCKET) assert.deepEqual(raw.slice(0, 2), ['-L', env.TROUPE_TMUX_SOCKET])
    const target = args[args.indexOf('-t') + 1]
    if (args[0] === 'has-session') return panes.size ? yes() : no()
    if (['new-session', 'new-window', 'split-window'].includes(args[0])) {
      const parent = panes.get(target)
      const pane = `%${++nextPane}`
      const window = parent?.window ?? `@${++nextWindow}`
      panes.set(pane, { window, windowName: parent?.windowName ?? args[args.indexOf('-n') + 1], owner: '', screen: 'READY', dead: false })
      return yes(`$1 ${window} ${pane}\n`)
    }
    if (args[0] === 'set-option') {
      if (args.includes('@troupe-owner')) panes.get(target).owner = args.at(-1)
      if (args.includes('@troupe-orchestrator')) panes.get(target).orchestrator = args.includes('-u') ? undefined : args.at(-1)
      if (args.includes('@troupe-orchestrator-token')) panes.get(target).token = args.includes('-u') ? undefined : args.at(-1)
      if (args.includes('@troupe-panel')) panes.get(target).panel = args.at(-1)
      if (args.includes('@troupe-planning')) panes.get(target).planning = args.includes('-u') ? undefined : args.at(-1)
    }
    if (args[0] === 'display' && args.at(-1).includes('@troupe-planning')) return yes(`${panes.get(target)?.panel ?? ''}\t${panes.get(target)?.planning ?? ''}`)
    if (args[0] === 'display') {
      if (args.at(-1) === '#{session_id}') return yes('$1')
      if (args.at(-1) === '#{pane_width}') return yes('200')
      const p = panes.get(target)
      return p ? yes(`${target}\t${p.dead ? 1 : 0}\t${p.owner}`) : no()
    }
    if (args[0] === 'capture-pane') return panes.has(target) ? yes(panes.get(target).screen) : no()
    if (args[0] === 'list-panes' && args.at(-1).includes('#{pane_pid}')) return yes('')
    if (args[0] === 'list-panes' && args.at(-1).includes('@troupe-orchestrator')) return yes([...panes].map(([id, p]) => `${id}\t${p.dead ? 1 : 0}\t${p.orchestrator ?? ''}\t${p.token ?? ''}`).join('\n'))
    if (args[0] === 'list-panes' && args.at(-1).includes('@troupe-panel')) return yes([...panes].map(([id, p]) => `${id}\t${p.dead ? 1 : 0}\t${p.panel ?? ''}`).join('\n'))
    if (args[0] === 'list-panes') return yes([...panes].map(([id, p]) => `${p.windowName}\t$1 ${p.window} ${id}`).join('\n'))
    if (args[0] === 'load-buffer') afterLoad?.()
    if (args[0] === 'kill-pane') panes.delete(target)
    return yes()
  }
  const output = []
  const r = runtime({ cwd: root, home, packageRoot: pkg, env, run, inputTTY: true, outputTTY: true,
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
  assert.equal('socket' in opened, false)
  assert.equal('server' in opened, false)
  assert.deepEqual(opened.argv.slice(0, 7), ['fake', '--model', 'small', '--effort', 'low', '--policy', 'ask'])
  assert.ok(w.calls.some(c => c.command === 'tmux' && c.args.at(-1) === shellOf(opened.argv)))
  const brief = readFileSync(join(w.root, '.git/troupe/m1/brief-api.md'), 'utf8')
  const localBrief = join(opened.worktree, '.troupe/brief.md')
  assert.equal(readFileSync(localBrief, 'utf8'), brief)
  assert.equal(opened.argv.at(-1), `Read the brief in ${localBrief} and follow it.`)
  for (const text of ['Ship the feature', 'People need it', 'Build the endpoint.', 'Reference instructions.', 'src/', 'probe-skill', 'Commit your changes', '.troupe/result.md', 'blocked or failed']) assert.ok(brief.includes(text), text)
  assert.match((await w.call('dispatch', 'api')).out, /already open/)
  w.write(join(opened.worktree, '.troupe/result.md'), '---\nstatus: done\nsummary: built\n---\n')
  assert.equal((await w.call('dispatch', 'web')).code, 0)
  assert.ok(w.calls.some(c => c.args.includes('split-window')))
  assert.equal(readFileSync(join(w.root, '.git/info/exclude'), 'utf8').split('/.troupe/').length, 2)
})

test('send refuses waits, working, unknown, drafts and other owners and rechecks immediately before paste', async t => {
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
  p.owner = 'other'
  assert.match((await w.call('send', 'api', 'hello')).out, /pane is gone/)
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

test('status, wait and close read live state, retain worktrees, and skip panes with another owner', async t => {
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
  pane.owner = 'other'
  assert.equal((await w.call('close', 'api')).code, 0)
  assert.equal(w.panes.size, 1)
  assert.ok(!w.calls.some(c => c.args.includes('kill-pane')))
  pane.owner = owner
  assert.equal((await w.call('close', '--all')).code, 0)
  assert.equal(w.panes.size, 1)
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
  assert.ok(w.calls.some(c => c.args.includes('split-window') && c.args.includes('-h') && c.args.includes('100') && c.args.at(-1).includes("'panel'")))
  assert.ok(w.calls.some(c => c.args.includes('attach-session') && c.inherit))
  assert.equal(w.events().at(-1).ev, 'up')
  assert.ok([...w.panes.values()].some(p => p.orchestrator === w.root && p.token))
  const noOp = w.calls.length
  assert.match((await w.call('open')).out, /already open/)
  assert.ok(w.calls.slice(noOp).filter(c => c.command === 'tmux').every(c => c.args[2] === 'list-panes'))
  const before = w.calls.length
  assert.equal((await execute('up', [], { ...w.r, env: { ...w.r.env, TMUX: 'unit', TMUX_PANE: '%1' } })).code, 0)
  assert.ok(!w.calls.slice(before).some(c => c.args.includes('has-session')))
  assert.ok(w.calls.slice(before).some(c => c.args.includes('display') && c.args.includes('%1') && c.args.at(-1) === '#{session_id}'))
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

test('a changed plan during worktree preparation never launches a role', async t => {
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

test('dispatch reuses the named session and roles window, leaving unlogged panes alone', async t => {
  const w = world(t)
  await w.approve()
  w.panes.set('%99', { window: '@99', windowName: 'roles', owner: 'other', screen: 'READY', dead: false })
  assert.equal((await w.call('dispatch', 'api')).code, 0)
  assert.equal((await w.call('dispatch', 'web')).code, 0)
  assert.ok(!w.calls.some(c => c.args.includes('new-session') || c.args.includes('new-window')))
  assert.equal(w.calls.filter(c => c.args.includes('split-window')).length, 2)
  assert.ok(w.calls.some(c => c.args.includes('select-layout') && c.args.includes('@99') && c.args.includes('tiled')))
  assert.equal((await w.call('close', '--all')).code, 0)
  assert.deepEqual([...w.panes.keys()], ['%99'])
})

test('dispatch creates roles in an existing session without a roles window', async t => {
  const w = world(t)
  await w.approve()
  w.panes.set('%99', { window: '@99', windowName: 'roles extra', owner: 'other', screen: 'READY', dead: false })
  assert.equal((await w.call('dispatch', 'api')).code, 0)
  const created = w.calls.find(c => c.args.includes('new-window'))
  assert.ok(created.args.includes('$1:'))
  assert.ok(created.args.includes('roles'))
  assert.ok(!w.calls.some(c => c.args.includes('new-session')))
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

test('readiness waits ignore old results, poll unknown/working, and stop on dialogs, gone and timeout', async t => {
  const w = world(t)
  await w.approve()
  await w.call('dispatch', 'api')
  const opened = w.events().find(e => e.ev === 'dispatch')
  const pane = w.panes.get(opened.pane)
  w.write(join(opened.worktree, '.troupe/result.md'), '---\nstatus: done\nsummary: old\n---\n')
  pane.screen = 'unrecognized'
  assert.match((await w.call('send', 'api', 'hi')).out, /troupe wait -m m1 --role api --ready/)
  let polls = 0
  const ready = await execute('wait', ['--role', 'api', '--ready', '--timeout', '3'], { ...w.r, sleep: async () => { pane.screen = ++polls === 1 ? 'WORKING' : 'READY' } })
  assert.deepEqual(ready, { code: 0, out: 'api: ready\n' })
  assert.equal(polls, 2)
  pane.screen = 'WAIT'
  assert.deepEqual(await w.call('wait', '--role', 'api', '--ready'), { code: 1, out: 'api: waits on you\nWAIT\n' })
  pane.screen = 'WORKING'
  assert.match((await w.call('wait', '--role', 'api', '--ready', '--timeout', '0')).out, /Timed out/)
  pane.dead = true
  assert.match((await w.call('wait', '--role', 'api', '--ready')).out, /pane gone/)
  pane.dead = false
  pane.owner = 'other'
  assert.match((await w.call('wait', '--role', 'api', '--ready')).out, /pane gone/)
  assert.equal((await w.call('wait', '--gate', 'plan', '--ready')).code, 2)
})

test('teardown skips a reused pane ID with another owner, with or without force', async t => {
  for (const args of [[], ['--force']]) {
    const w = world(t)
    await w.approve()
    await w.call('dispatch', 'api')
    const opened = w.events().find(e => e.ev === 'dispatch')
    w.panes.get(opened.pane).owner = 'other'
    const reply = await w.call('teardown', ...args)
    assert.equal(reply.code, 0, reply.out)
    assert.equal(w.panes.size, 1)
    assert.ok(!w.calls.some(c => c.args.includes('kill-pane')))
    assert.equal(w.events().at(-1).ev, 'teardown')
  }
})

test('readiness wait prints only the matched dialog line in a multiline pane', async t => {
  const w = world(t)
  await w.approve()
  await w.call('dispatch', 'api')
  const pane = [...w.panes.values()][0]
  pane.screen = 'Earlier agent output\r\n  \r\nWAIT\r\nPermission choices\r\nREADY\r\n'
  assert.deepEqual(await w.call('wait', '--role', 'api', '--ready'), { code: 1, out: 'api: waits on you\nWAIT\n' })
})

test('a reused pane ID reads as gone and redispatch leaves it alone', async t => {
  const w = world(t)
  await w.approve()
  await w.call('dispatch', 'api')
  const old = w.events().find(e => e.ev === 'dispatch')
  w.panes.get(old.pane).owner = 'other'
  assert.equal(JSON.parse((await w.call('status', '--json')).out).roles[0].state, 'gone')
  assert.equal((await w.call('dispatch', 'api')).code, 0)
  const reopened = w.events().filter(e => e.ev === 'dispatch').at(-1)
  assert.notEqual(reopened.pane, old.pane)
  assert.equal(reopened.worktree, old.worktree)
  assert.equal(reopened.branch, old.branch)
  assert.ok(!w.calls.some(c => c.args.includes('kill-pane')))
  assert.equal((await w.call('close', 'api')).code, 0)
  assert.deepEqual([...w.panes.keys()], [old.pane])
})

test('teardown still refuses unread log lines, including with force', async t => {
  const w = world(t)
  await w.approve()
  await w.call('dispatch', 'api')
  const log = join(w.root, '.git/troupe/m1/log.jsonl')
  w.write(log, readFileSync(log, 'utf8') + '{torn record')
  const count = w.calls.length
  for (const args of [[], ['--force']]) {
    const reply = await w.call('teardown', ...args)
    assert.equal(reply.code, 1)
    assert.match(reply.out, /unread log/)
  }
  assert.ok(!w.calls.slice(count).some(c => c.args.includes('kill-pane') || c.args.includes('remove') || c.args.includes('-D')))
  assert.equal(w.panes.size, 1)
})

test('open reuses a live repository panel without tmux writes, even without a plan', async t => {
  const w = world(t)
  rmSync(join(w.root, 'docs/missions/m1/plan.md'))
  w.panes.set('%99', { panel: w.root, dead: false })
  const result = await w.call('open')
  assert.deepEqual(result, { code: 0, out: 'Panel already open in %99.\n' })
  assert.ok(w.calls.filter(c => c.command === 'tmux').every(c => c.args[2] === 'list-panes'))
})

test('open splits the caller on the right, marks the panel, and passes the requested mission', async t => {
  const w = world(t)
  w.panes.set('%99', { window: '@99', windowName: 'agent', screen: 'READY', owner: 'person' })
  const result = await execute('open', ['-m', 'm1'], { ...w.r, env: { ...w.r.env, TMUX: 'unit', TMUX_PANE: '%99' } })
  assert.equal(result.code, 0, result.out)
  assert.equal(result.out.trim().split('\n').length, 1)
  const split = w.calls.find(c => c.args.includes('split-window')).args.slice(2)
  assert.deepEqual(split.slice(0, 7), ['split-window', '-d', '-h', '-l', '90', '-t', '%99'])
  assert.ok(split.at(-1).includes("'panel' '-m' 'm1'"))
  assert.equal(w.panes.get('%99').orchestrator, w.root)
  assert.ok(w.panes.get('%99').token)
  assert.ok(w.calls.some(c => c.args.includes('@troupe-panel') && c.args.at(-1) === w.root))
  assert.ok(!w.calls.some(c => c.args.includes('attach-session') || c.command === 'osascript'))
})

test('open ignores dead panels and panels marked for another repository', async t => {
  const w = world(t)
  w.panes.set('%98', { panel: w.root, dead: true })
  w.panes.set('%99', { panel: '/another/repo', dead: false })
  assert.equal((await w.call('open')).code, 0)
  assert.equal([...w.panes.values()].filter(p => p.panel === w.root && !p.dead).length, 1)
})

for (const terminal of ['Apple_Terminal', 'iTerm.app']) {
  test(`open launches ${terminal} with the session as an AppleScript argument`, async t => {
    const w = world(t)
    const scripts = []
    const result = await execute('open', [], { ...w.r, platform: 'darwin', env: { ...w.r.env, TERM_PROGRAM: terminal }, run: (command, args, options) => {
      if (command !== 'osascript') return w.r.run(command, args, options)
      scripts.push(args)
      return { code: 0, out: '', err: '' }
    } })
    assert.equal(result.code, 0, result.out)
    assert.equal(scripts.length, 1)
    const [flag, source, name, socket] = scripts[0]
    assert.equal(flag, '-e')
    assert.equal(name, `troupe-${basename(w.root).replace(/[^A-Za-z0-9_-]/g, '-')}`)
    assert.equal(socket, 'unit-socket')
    assert.ok(!source.includes(name))
    assert.ok(source.includes('quoted form of (item 1 of argv)'))
    assert.ok(source.includes('quoted form of (item 2 of argv)'))
    assert.ok(source.includes(terminal === 'Apple_Terminal' ? 'tell application "Terminal"' : 'tell application "iTerm2"'))
    assert.ok(w.calls.some(c => c.args.includes('new-session') && c.args.includes('mission')))
    assert.ok(w.calls.some(c => c.args.includes('select-window')))
    assert.equal(result.out.trim().split('\n').length, 1)
  })
}

test('open prints the attach command on other terminals/platforms without running AppleScript', async t => {
  for (const [platform, terminal] of [['darwin', 'other'], ['linux', 'Apple_Terminal']]) {
    const w = world(t, {})
    const result = await execute('open', [], { ...w.r, platform, env: { TERM_PROGRAM: terminal } })
    assert.equal(result.code, 0, result.out)
    const name = `troupe-${basename(w.root).replace(/[^A-Za-z0-9_-]/g, '-')}`
    assert.ok(result.out.includes(`tmux attach -t ${name}`))
    assert.match(result.out, /role windows will appear in that session/)
    assert.ok(!w.calls.some(c => c.command === 'osascript'))
  }
})

test('failed or unavailable AppleScript falls back to attach instructions and keeps the panel', async t => {
  for (const throwing of [false, true]) {
    const w = world(t)
    const result = await execute('open', [], { ...w.r, platform: 'darwin', env: { ...w.r.env, TERM_PROGRAM: 'Apple_Terminal' }, run: (command, args, options) => {
      if (command !== 'osascript') return w.r.run(command, args, options)
      if (throwing) throw new Error('not installed')
      return { code: 1, out: '', err: 'automation denied' }
    } })
    assert.equal(result.code, 0)
    assert.match(result.out, /tmux -L 'unit-socket' attach -t troupe-/)
    assert.match(result.out, /role windows will appear/)
    assert.equal(w.panes.size, 1)
  }
})

test('open requires tmux and rejects options/positionals other than the global mission', async t => {
  const w = world(t)
  const missing = await execute('open', [], { ...w.r, run: (command, args, options) => command === 'which' && args[0] === 'tmux'
    ? { code: 1, out: '', err: '' } : w.r.run(command, args, options) })
  assert.equal(missing.code, 1)
  assert.match(missing.out, /tmux is required/)
  for (const args of [['extra'], ['--orch', 'codex'], ['--once']]) assert.equal((await w.call('open', ...args)).code, 2)
  assert.equal(w.panes.size, 0)
})

test('up chooses the available orchestrator, preferring claude, and an explicit --orch wins', async t => {
  for (const [found, args, expected] of [
    [['codex'], [], 'codex'],
    [['claude'], [], 'claude'],
    [['claude', 'codex'], [], 'claude'],
    [['claude', 'codex'], ['--orch', 'codex'], 'codex'],
  ]) {
    const w = world(t)
    const result = await execute('up', args, { ...w.r, run: (command, argv, options) => command === 'which' && ['claude', 'codex'].includes(argv[0]) && !found.includes(argv[0])
      ? { code: 1, out: '', err: '' } : w.r.run(command, argv, options) })
    assert.equal(result.code, 0, result.out)
    assert.ok(w.calls.some(c => c.args.includes('new-session') && c.args.at(-1) === shellOf([expected])))
    assert.ok(result.out.includes(`${expected} orchestrator`))
  }
})

test('MR gate approval includes cleanup commands; a change does not', async t => {
  const w = world(t)
  const log = join(w.root, '.git/troupe/m1/log.jsonl')
  const result = await execute('gate', ['mr-ok'], { ...w.r, sleep: async () => {
    append(log, 'panel', { ev: 'gate-answer', gate: 'mr-ok', answer: 'approve' })
  } })
  assert.equal(result.code, 0)
  assert.ok(result.out.startsWith('approve\n'))
  assert.match(result.out, /troupe stage teardown -m m1/)
  assert.match(result.out, /troupe teardown -m m1 before reporting completion/)
  await w.call('gate', 'mr-ok', '--no-wait')
  append(log, 'panel', { ev: 'gate-answer', gate: 'mr-ok', answer: 'change', text: 'Fix first' })
  assert.deepEqual(await w.call('wait', '--gate', 'mr-ok'), { code: 0, out: 'change: Fix first\n' })
})

test('callerPane finds the pane through process ancestry when an agent strips the tmux variables', async () => {
  const { callerPane } = await import('../dist/panes.js')
  const parents = { 4242: 300, 300: 500, 500: 1 }
  const run = (command, args) => {
    if (command === 'tmux' && args.includes('list-panes')) return { code: 0, out: '900\t%3\t/x\t\n500\t%7\t/y\t\n', err: '' }
    if (command === 'ps') return { code: 0, out: `${parents[args.at(-1)] ?? 1}\n`, err: '' }
    return { code: 1, out: '', err: 'unexpected' }
  }
  assert.equal(callerPane(runtime({ env: {}, pid: 4242, run })), '%7')
  assert.equal(callerPane(runtime({ env: {}, pid: 77, run })), undefined)
  assert.equal(callerPane(runtime({ env: { TMUX: '/tmp/s,1,0', TMUX_PANE: '%9' }, pid: 4242, run })), '%9')
})

test('callerPane falls back to the one unmarked pane at the repository root', async () => {
  const { callerPane } = await import('../dist/panes.js')
  const root = mkdtempSync(join(tmpdir(), 'troupe-caller-'))
  const listed = out => (command, args) => command === 'tmux' && args.includes('list-panes') ? { code: 0, out, err: '' } : { code: 1, out: '', err: '' }
  const panel = `11\t%1\t${root}\tPANEL\n`
  const role = `12\t%2\t${root}/wt\tOWNER\n`
  assert.equal(callerPane(runtime({ env: {}, pid: 99, run: listed(`${panel}${role}13\t%3\t${root}\t\n`) }), root), '%3')
  assert.equal(callerPane(runtime({ env: {}, pid: 99, run: listed(`13\t%3\t${root}\t\n14\t%4\t${root}\t\n`) }), root), undefined, 'two candidates: no guess')
  assert.equal(callerPane(runtime({ env: {}, pid: 99, run: listed(`13\t%3\t${root}\t\n`) })), undefined, 'no root: no guess')
  rmSync(root, { recursive: true, force: true })
})

test('open from caller B replaces caller A and the next panel answer goes only to B', async t => {
  const w = world(t)
  for (const id of ['%90', '%91']) w.panes.set(id, { window: '@90', windowName: 'agent', owner: '', screen: '› Ask Codex to do anything', dead: false })
  const open = pane => execute('open', [], { ...w.r, env: { ...w.r.env, TMUX: 'unit', TMUX_PANE: pane } })
  assert.equal((await open('%90')).code, 0)
  assert.equal(w.panes.get('%90').orchestrator, w.root)
  const panels = [...w.panes.values()].filter(p => p.panel === w.root).length
  assert.match((await open('%91')).out, /already open/)
  assert.equal(w.panes.get('%90').orchestrator, undefined)
  assert.equal(w.panes.get('%90').token, undefined)
  assert.equal(w.panes.get('%91').orchestrator, w.root)
  assert.equal([...w.panes.values()].filter(p => p.panel === w.root).length, panels)
  const token = w.panes.get('%91').token
  assert.equal((await open('%91')).code, 0)
  assert.equal(w.panes.get('%91').token, token)
  await w.call('gate', 'plan', '--no-wait')
  const reading = readPanel(w.r, 'm1')
  assert.equal(await panelEffect(w.r, 'm1', { kind: 'answer', gate: gateTarget(reading.model), answer: 'approve' }), 'Approved plan')
  const pastes = w.calls.filter(c => c.args.includes('paste-buffer'))
  assert.equal(pastes.length, 1)
  assert.equal(pastes[0].args.at(-1), '%91')
  assert.ok(w.calls.filter(c => c.args.includes('send-keys')).every(c => c.args.includes('%91')))
})


test('only explicit planning opens show progress, then discovery restores truthful idle state', async t => {
  const w = world(t)
  const path = join(w.root, 'docs/missions/m1/plan.md')
  rmSync(path)
  assert.equal((await w.call('open')).code, 0)
  const pane = [...w.panes].find(([, p]) => p.panel === w.root)[0]
  const r = { ...w.r, env: { ...w.r.env, TMUX_PANE: pane } }
  assert.deepEqual(readPanel(r, 'm1'), { missing: 'no mission yet' })
  assert.equal((await w.call('open', '--planning')).code, 0)
  assert.deepEqual(readPanel(r, 'm1'), { missing: 'Orch is planning…' })
  w.write(path, plan())
  assert.ok('model' in readPanel(r, 'm1'))
  assert.equal(w.panes.get(pane).planning, undefined)
  rmSync(path)
  assert.deepEqual(readPanel(r, 'm1'), { missing: 'no mission yet' })
  w.panes.get(pane).planning = '1'
  w.panes.get(pane).panel = '/unrelated/repo'
  assert.deepEqual(readPanel(r, 'm1'), { missing: 'no mission yet' })
})
