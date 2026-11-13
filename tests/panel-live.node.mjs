import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { textOf } from '../dist/canvas.js'
import { runtime } from '../dist/command-context.js'
import { mission } from '../dist/missions.js'
import { draw } from '../dist/draw.js'
import { append, readLog } from '../dist/log.js'
import { flushAnswers } from '../dist/orchestrator.js'
import { panelEffect } from '../dist/panel-actions.js'
import { gateTarget, hitAt, initialUi, parseInput, transition } from '../dist/panel-input.js'
import { readPanel } from '../dist/panel-model.js'
import { ENTER_PANEL, frameOf, LEAVE_PANEL, panel, terminalFrame } from '../dist/panel.js'

const PLAN = '# A mission\n\n```yaml\ngoal: Build the endpoint\nwhy: People need it\nroles:\n  api:\n    agent: fake\n    flags: [--policy, ask]\n    touches: [src/]\n  web:\n    agent: fake\n    flags: [--policy, ask]\n    touches: [web/]\n```\n\n## Done when\n\n- It works.\n\n## Role: api\n\nBuild it.\n\n## Role: web\n\nUse it.\n'
const ADAPTER = `command: fake
model: []
effort: []
permission:
  - [--policy]
prompt: last-arg
screen:
  waits: ['^WAIT']
  working: ['^WORKING$']
  ready: ['^READY$']
paste: bracketed
`

const world = t => {
  const root = mkdtempSync(join(tmpdir(), 'troupe-panel-live-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path, source) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, source) }
  const path = join(root, 'docs/missions/m1/plan.md')
  write(path, PLAN)
  write(join(root, '.troupe/agents/fake.yaml'), ADAPTER)
  mkdirSync(join(root, '.git'))
  const calls = []
  const output = []
  const pane = { owner: 'ours', screen: 'READY', dead: false, exists: true }
  const orch = { marked: false, mission: 'm1', token: 'orch-token', screen: '› Ask Codex to do anything', dead: false }
  // The checkout is on m1's mission branch, so a panel without -m resolves m1.
  const head = { branch: 'mission/m1' }
  let afterLoad
  const planning = { active: false }
  let clock = 0
  const yes = out => ({ code: 0, out: out ?? '', err: '' })
  const run = (command, raw, options) => {
    calls.push({ command, args: raw, ...options })
    if (command === 'git') {
      if (raw.includes('--show-toplevel')) return yes(root)
      if (raw.includes('--git-common-dir')) return yes('.git')
      if (raw[0] === 'symbolic-ref') return yes(head.branch)
      if (raw[0] === 'diff') return yes('src/api.ts\n')
      return yes()
    }
    if (command === 'ps') return { code: 1, out: '', err: '' }
    assert.equal(command, 'tmux')
    assert.deepEqual(raw.slice(0, 3), ['-u', '-L', 'panel-test'])
    const args = raw.slice(3)
    if (args[0] === 'list-panes' && args.at(-1).includes('@troupe-mission')) return yes(orch.marked ? `%9\t${orch.dead ? 1 : 0}\t${orch.mission}\t${join(root, '.git')}\t\t\t${orch.token}` : '')
    if (args[0] === 'load-buffer') afterLoad?.()
    if (args[0] === 'display' && args.at(-1).includes('@troupe-planning')) return yes(`${root}\t${planning.active ? '1' : ''}`)
    if (args[0] === 'set-option' && args.includes('@troupe-planning') && args.includes('-u')) planning.active = false
    if (args[0] === 'display') {
      return pane.exists ? yes(`%1\t${pane.dead ? 1 : 0}\t${pane.owner}`) : { code: 1, out: '', err: "can't find pane" }
    }
    if (args[0] === 'capture-pane') return yes(args.includes('%9') ? orch.screen : pane.screen)
    return yes()
  }
  const r = runtime({ cwd: root, home: join(root, 'home'), env: { TROUPE_TMUX_SOCKET: 'panel-test' }, run, inputTTY: true, outputTTY: true, write: text => output.push(text), now: () => clock })
  const log = join(root, '.git/troupe/m1/log.jsonl')
  const read = () => readPanel(r, 'm1')
  const openGate = (gate = 'plan', ask = 'Approve this?') => append(log, 'orch', { ev: 'gate-open', gate, ask, ...(gate === 'plan' ? { plan: mission(r, 'm1').hash } : {}) })
  const launch = () => {
    const worktree = join(root, '.troupe/worktrees/m1/api')
    mkdirSync(worktree, { recursive: true })
    append(log, 'cli', { ev: 'dispatch', role: 'api', agent: 'fake', session: '$1', window: '@1', pane: '%1', owner: 'ours', socket: 'old-socket', server: '/old/socket', worktree, branch: 'role/m1/api', base: 'abc', argv: ['fake'] })
  }

  return { root, path, log, write, pane, planning, orch, head, afterLoad: fn => { afterLoad = fn }, calls, output, r, read, openGate, launch, events: () => readLog(log).events, advance: ms => { clock += ms } }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const key = key => ({ kind: 'key', key })
const step = (ui, input, model, hits = [], height = 58, max = 100) => transition(ui, input, model, hits, height, max)

test('parser handles keys, split escapes, SGR clicks/releases/motion and wheel', () => {
  assert.deepEqual(parseInput('\x1b[A\x1bOBjk12345\t\r\x1b[5~\x1b[6~\x7f\x03').actions.map(a => a.key), ['up', 'down', 'j', 'k', '1', '2', '3', '4', '5', 'tab', 'enter', 'pageUp', 'pageDown', 'backspace', 'quit'])
  const half = parseInput('\x1b[<0;3;')
  assert.deepEqual(half.actions, [])
  assert.deepEqual(parseInput(half.rest + '2M').actions, [{ kind: 'click', row: 1, col: 2 }])
  assert.deepEqual(parseInput('\x1b[<0;3;2m\x1b[<32;3;2M\x1b[<64;3;2M\x1b[<65;3;2M').actions, [{ kind: 'scroll', by: -3 }, { kind: 'scroll', by: 3 }])
  assert.equal(parseInput('\x1b').rest, '\x1b')
  assert.deepEqual(parseInput('\x1b[?25h').actions, [])
})

test('paste is one text action; input handles Unicode, cancel and literal shortcut letters', t => {
  const w = world(t)
  w.openGate()
  const { model } = w.read()
  const ui = { ...initialUi(), selected: 'api' }
  const partial = parseInput('\x1b[200~a\nq')
  const pasted = parseInput(partial.rest + '\x1b[201~').actions[0]
  assert.deepEqual(pasted, { kind: 'text', text: 'a\nq' })
  assert.equal(step(ui, pasted, model).effect, undefined, 'paste must not approve a gate')
  const typing = step(ui, key('s'), model).ui
  assert.equal(typing.input.label, 'send to api')
  let edited = step(typing, pasted, model).ui
  assert.equal(edited.input.text, 'a q')
  edited = step(edited, key('😀'), model).ui
  edited = step(edited, key('backspace'), model).ui
  assert.equal(edited.input.text, 'a q')
  assert.equal(step(edited, key('q'), model).quit, undefined)
  const sent = step(edited, key('enter'), model)
  assert.deepEqual(sent.effect, { kind: 'send', role: 'api', text: 'a q' })
  assert.equal(sent.ui.input, undefined)
  assert.equal(step(edited, key('escape'), model).ui.input, undefined)
  assert.equal(step(edited, key('quit'), model).quit, true)
})

test('selection, tabs, detail, help, scrolling and hit-map actions are pure', t => {
  const w = world(t)
  const { model } = w.read()
  let ui = { ...initialUi(), selected: 'api' }
  assert.equal(step(ui, key('down'), model).ui.selected, 'web')
  assert.equal(step({ ...ui, selected: 'web' }, key('k'), model).ui.selected, 'api')
  assert.equal(step(ui, key('5'), model).ui.tab, 5)
  assert.equal(step({ ...ui, tab: 5 }, key('tab'), model).ui.tab, 1)
  assert.equal(step(ui, key('d'), model).ui.tab, 5)
  assert.equal(step(ui, key('v'), model).ui.tab, 3)
  assert.equal(step({ ...ui, tab: 2 }, key('enter'), model).ui.tab, 1)
  assert.equal(step(ui, key('pageDown'), model, [], 24, 10).ui.scroll, 10, 'MISSION scrolls its right column too')
  ui = { ...ui, tab: 2 }
  assert.equal(step(ui, key('pageDown'), model, [], 24, 10).ui.scroll, 10)
  assert.equal(step({ ...ui, scroll: 10 }, { kind: 'scroll', by: -3 }, model).ui.scroll, 7)
  assert.equal(step({ ...ui, scroll: 10 }, key('pageUp'), model, [], 24, 10).ui.scroll, 0)
  const drawn = draw(model, ui, 96, 58)
  const row = drawn.hits.find(hit => hit.target.kind === 'role' && hit.target.name === 'web')
  assert.ok(row)
  const clicked = step(ui, { kind: 'click', row: row.row, col: row.col }, model, drawn.hits)
  assert.equal(clicked.ui.selected, 'web')
  assert.equal(clicked.ui.tab, 2, 'a card selects its role and the page stays')
  assert.equal(hitAt(drawn.hits, 1, 27).kind, 'tab')
  const helped = step(ui, key('?'), model).ui
  assert.equal(helped.help, true)
  assert.equal(step(helped, key('a'), model).effect, undefined)
  assert.equal(step(helped, key('escape'), model).ui.help, false)
  assert.equal(step(ui, key('q'), model).quit, true)
})

test('live model shares the command hash/stages and captures screen, waitsOn, work and results', t => {
  const w = world(t)
  w.openGate()
  w.launch()
  w.pane.screen = '\nWAIT for permission\n\nREADY\n'
  let reading = w.read()
  assert.equal(reading.model.hash, mission(w.r, 'm1').hash)
  assert.equal(reading.model.roles[0].state, 'waits')
  assert.equal(reading.model.roles[0].waitsOn, 'WAIT for permission')
  assert.ok(reading.model.roles[0].screen.includes('READY'))
  assert.deepEqual(reading.model.roles[0].work.changed, ['src/api.ts'])
  w.write(join(w.r.home, '.agents/skills/troupe-mission/stages.yaml'), 'stages:\n  - id: plan-ok\n    gate: plan\n    label: My gate\n  - id: custom\n')
  assert.equal(w.read().model.stages[1].id, 'custom')
  w.write(join(w.root, '.troupe/worktrees/m1/api/.troupe/result.md'), '---\nstatus: done\nsummary: All checked\n---\nDone body.')
  reading = w.read()
  assert.equal(reading.model.roles[0].state, 'done')
  assert.equal(reading.model.roles[0].result.body, 'Done body.')
})

test('panel approval writes the displayed hash and refuses problems or a stale plan', async t => {
  const w = world(t)
  w.openGate()
  let model = w.read().model
  const approve = step({ ...initialUi(), selected: 'api' }, key('a'), model).effect
  w.write(w.path, PLAN + '\n')
  assert.match(await panelEffect(w.r, 'm1', approve), /changed/)
  assert.equal(w.events().filter(e => e.ev === 'gate-answer').length, 0)
  model = w.read().model
  w.write(join(w.root, '.troupe/agents/broken.yaml'), 'command: {not: supported}')
  assert.match(await panelEffect(w.r, 'm1', { kind: 'answer', gate: gateTarget(model), answer: 'approve' }), /broken.yaml/)
  assert.equal(w.events().filter(e => e.ev === 'gate-answer').length, 0)
  rmSync(join(w.root, '.troupe/agents/broken.yaml'))
  model = w.read().model
  assert.equal(await panelEffect(w.r, 'm1', { kind: 'answer', gate: gateTarget(model), answer: 'approve' }), 'Approved plan')
  const answer = w.events().at(-1)
  assert.equal(answer.by, 'panel')
  assert.equal(answer.plan, model.hash)
  assert.equal(w.read().model.gate, undefined)
})

test('change input answers its original gate; reopened gates require review again', async t => {
  const w = world(t)
  w.openGate()
  await panelEffect(w.r, 'm1', { kind: 'answer', gate: gateTarget(w.read().model), answer: 'approve' })
  w.openGate('release', 'Ship it?')
  const model = w.read().model
  let ui = step(initialUi(), key('c'), model).ui
  assert.equal(ui.input.label, 'change')
  ui = step(ui, { kind: 'text', text: 'Fix the tests first' }, model).ui
  const effect = step(ui, key('enter'), model).effect
  assert.equal(await panelEffect(w.r, 'm1', effect), 'Change sent for release')
  assert.equal(w.events().at(-1).text, 'Fix the tests first')
  assert.equal(w.events().at(-1).by, 'panel')
  w.openGate('release', 'A different question')
  assert.match(await panelEffect(w.r, 'm1', effect), /changed/)
})

test('an intervening plan change answer invalidates a previously displayed approval target', async t => {
  const w = world(t)
  w.openGate()
  const gate = gateTarget(w.read().model)
  append(w.log, 'panel', { ev: 'gate-answer', gate: 'plan', answer: 'change', text: 'Split this first', plan: gate.hash })
  assert.match(await panelEffect(w.r, 'm1', { kind: 'answer', gate, answer: 'approve' }), /changed/)
  assert.equal(w.events().at(-1).answer, 'change')
})

test('send dead key and effects use command refusals; open selects only a logged, owned pane', async t => {
  const w = world(t)
  assert.match(await panelEffect(w.r, 'm1', { kind: 'open', role: 'api' }), /no open pane/)
  w.launch()
  w.pane.screen = 'WAIT'
  const blocked = step({ ...initialUi(), selected: 'api' }, key('s'), w.read().model)
  assert.equal(blocked.ui.message, 'answer it first')
  assert.equal(blocked.ui.input, undefined)
  const model = w.read().model
  const hits = draw(model, { ...initialUi(), selected: 'web' }, 96, 58).hits
  const open = hits.find(hit => hit.target.kind === 'key' && hit.target.key === 'o' && hit.target.role === 'api')
  const clicked = step({ ...initialUi(), selected: 'web' }, { kind: 'click', row: open.row, col: open.col }, model, hits)
  assert.deepEqual(clicked.effect, { kind: 'open', role: 'api' })
  for (const screen of ['WAIT', 'WORKING', 'unknown']) {
    w.pane.screen = screen
    assert.match(await panelEffect(w.r, 'm1', { kind: 'send', role: 'api', text: 'hello' }), /nothing was typed/)
  }
  assert.ok(!w.calls.some(c => c.args.includes('paste-buffer')))
  w.pane.owner = 'other'
  assert.match(await panelEffect(w.r, 'm1', { kind: 'open', role: 'api' }), /pane is gone/)
  assert.ok(!w.calls.some(c => c.args.includes('select-pane')))
  w.pane.owner = 'ours'
  assert.equal(await panelEffect(w.r, 'm1', { kind: 'open', role: 'api' }), 'Opened api')
  assert.deepEqual(w.calls.filter(c => c.args.includes('select-window') || c.args.includes('select-pane')).map(c => c.args.slice(3)), [['select-window', '-t', '@1'], ['select-pane', '-t', '%1']])
  w.pane.screen = 'READY'
  assert.match(await panelEffect(w.r, 'm1', { kind: 'send', role: 'api', text: 'hello' }), /Sent to api/)
  assert.equal(w.events().at(-1).ev, 'send')
  assert.equal(w.events().at(-1).by, 'cli')
})

test('message/help rendering, bounded scroll and addressed painting need no golden changes', t => {
  const w = world(t)
  w.openGate()
  const reading = w.read()
  const drawn = frameOf(reading, { ...initialUi(), selected: 'api', message: 'Sent successfully' }, 96, 40)
  assert.equal(textOf(drawn.lines[38]).trim(), 'Sent successfully')
  const helped = draw(reading.model, { ...initialUi(), help: true }, 96, 40)
  assert.ok(helped.lines.some(line => textOf(line).includes('Ctrl-C')))
  assert.deepEqual(helped.hits, [])
  assert.ok(draw(reading.model, { ...initialUi(), tab: 3 }, 96, 12).maxScroll > 0)
  const painted = terminalFrame(drawn)
  assert.ok(!painted.includes('\n'))
  assert.ok(painted.includes('\x1b[40;1H\x1b[2K'))
  assert.ok(!painted.includes('\x1b[41;1H'))
  assert.ok(textOf(frameOf(reading, initialUi(), 20, 5).lines[0]).includes('Panel needs'))
})

class InputStream extends EventEmitter {
  isRaw = false
  paused = true
  raw = []
  setRawMode(value) { this.isRaw = value; this.raw.push(value); return this }
  isPaused() { return this.paused }
  pause() { this.paused = true; return this }
  resume() { this.paused = false; return this }
}
class OutputStream extends EventEmitter { columns = 96; rows = 40 }

test('terminal loop redraws input/resize, decodes split UTF-8 and restores modes on quit', async t => {
  const w = world(t)
  const input = new InputStream()
  input.paused = false
  input.readableFlowing = null
  const output = new OutputStream()
  const stop = new AbortController()
  t.after(() => stop.abort())
  const running = panel({ ...w.r, signal: stop.signal }, { mission: 'm1' }, { input, output })
  assert.ok(w.output[0].includes(ENTER_PANEL))
  input.emit('data', Buffer.from('s'))
  const char = Buffer.from('ö')
  input.emit('data', char.subarray(0, 1))
  input.emit('data', char.subarray(1))
  await tick()
  assert.ok(w.output.at(-1).includes('send to api'))
  assert.ok(w.output.at(-1).includes('ö'))
  input.emit('data', '\x1b')
  await new Promise(resolve => setTimeout(resolve, 60))
  output.rows = 30
  output.emit('resize')
  await tick()
  assert.ok(w.output.at(-1).includes('\x1b[30;1H'))
  input.emit('data', 'q')
  assert.equal((await running).code, 0)
  assert.deepEqual(input.raw, [true, false])
  assert.equal(input.paused, true)
  assert.equal(input.listenerCount('data'), 0)
  assert.equal(output.listenerCount('resize'), 0)
  assert.equal(w.output.at(-1), LEAVE_PANEL)
})

test('planning polling discovers a plan, and abort/pane close restore the terminal', { timeout: 5000 }, async t => {
  const w = world(t)
  rmSync(w.path)
  const stop = new AbortController()
  t.after(() => stop.abort())
  const input = new InputStream()
  const output = new OutputStream()
  w.planning.active = true
  const running = panel({ ...w.r, env: { ...w.r.env, TMUX_PANE: '%panel' }, signal: stop.signal }, { mission: 'm1' }, { input, output })
  assert.ok(w.output.some(text => text.includes('Orch is drafting the plan')))
  w.write(w.path, PLAN)
  await new Promise(resolve => setTimeout(resolve, 2100))
  assert.ok(w.output.at(-1).includes('Build the endpoint'))
  // Its mark stays until the plan gate opens: it holds when drafting began.
  assert.equal(w.planning.active, true)
  stop.abort()
  assert.equal((await running).code, 0)
  assert.equal(w.output.at(-1), LEAVE_PANEL)
  const second = panel(w.r, { mission: 'm1' }, { input, output })
  input.emit('close')
  assert.equal((await second).code, 0)
  assert.equal(input.isRaw, false)
})

test('one packet cannot approve a second unseen gate after approving the plan', async t => {
  const w = world(t)
  w.openGate()
  w.openGate('release', 'Ship this?')
  const stop = new AbortController()
  t.after(() => stop.abort())
  const input = new InputStream()
  const output = new OutputStream()
  const running = panel({ ...w.r, signal: stop.signal }, { mission: 'm1' }, { input, output })
  input.emit('data', 'aa')
  await tick()
  assert.deepEqual(w.events().filter(e => e.ev === 'gate-answer').map(e => e.gate), ['plan'])
  input.emit('data', '\x03')
  await running
})

test('switching the resolved mission cancels an in-progress draft', { timeout: 5000 }, async t => {
  const w = world(t)
  const stop = new AbortController()
  t.after(() => stop.abort())
  const input = new InputStream()
  const output = new OutputStream()
  const running = panel({ ...w.r, signal: stop.signal }, { mission: '' }, { input, output })
  input.emit('data', 'sHello')
  await tick()
  assert.ok(w.output.at(-1).includes('send to api'))
  w.write(join(w.root, 'docs/missions/m2/plan.md'), PLAN)
  w.head.branch = 'mission/m2'
  await new Promise(resolve => setTimeout(resolve, 2100))
  assert.ok(w.output.at(-1).includes('Mission changed; input cancelled.'))
  assert.ok(!w.output.at(-1).includes('send to api'))
  input.emit('data', 'q')
  await running
})

test('CLI panel --once --plain shows the plan gate, then the build after approval', t => {
  const root = mkdtempSync(join(tmpdir(), 'troupe-panel-once-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  mkdirSync(join(root, 'docs/missions/m1'), { recursive: true })
  const source = PLAN.replaceAll('agent: fake', 'agent: claude').replaceAll('flags: [--policy, ask]', 'flags: [--permission-mode, manual]')
  writeFileSync(join(root, 'docs/missions/m1/plan.md'), source)
  git('add', '.')
  git('-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'commit', '-qm', 'initial')
  const r = runtime({ cwd: root, home: join(root, 'home') })
  const m = mission(r, 'm1')
  append(m.log, 'orch', { ev: 'gate-open', gate: 'plan', plan: m.hash })
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
  const run = (...args) => spawnSync(process.execPath, [cli, 'panel', '-m', 'm1', '--plain', '--width', '96', '--height', '58', ...args], { cwd: root, encoding: 'utf8', input: 'a' })
  const before = run('--once')
  assert.equal(before.status, 0, before.stderr)
  assert.match(before.stdout, /APPROVE THE PLAN/)
  assert.ok(!before.stdout.includes('\x1b'))
  assert.equal(run().status, 0, 'non-TTY input must draw once, not process piped approvals')
  assert.equal(readLog(m.log).events.length, 1)
  append(m.log, 'panel', { ev: 'gate-answer', gate: 'plan', answer: 'approve', plan: m.hash })
  const after = run('--once')
  assert.equal(after.status, 0, after.stderr)
  assert.doesNotMatch(after.stdout, /APPROVE THE PLAN/)
  assert.match(after.stdout, /FLOW/)
  assert.match(after.stdout, /Build/)
  const bad = spawnSync(process.execPath, [cli, 'panel', '--width', '0', '--once'], { cwd: root, encoding: 'utf8' })
  assert.equal(bad.status, 2)
})

test('default panel polls after the last mission finishes, cancels its draft, and discovers the next mission', { timeout: 7000 }, async t => {
  const w = world(t)
  w.openGate()
  const stop = new AbortController()
  t.after(() => stop.abort())
  const input = new InputStream()
  const output = new OutputStream()
  const running = panel({ ...w.r, signal: stop.signal }, { mission: '' }, { input, output })
  input.emit('data', 'sOld draft')
  await tick()
  append(w.log, 'cli', { ev: 'teardown' })
  await new Promise(resolve => setTimeout(resolve, 2100))
  assert.ok(w.output.at(-1).includes('no mission yet'))
  w.write(join(w.root, 'docs/missions/new/plan.md'), PLAN)
  w.head.branch = 'mission/new'
  await new Promise(resolve => setTimeout(resolve, 2100))
  assert.ok(w.output.at(-1).includes('Build the endpoint'))
  assert.ok(!w.output.at(-1).includes('Old draft'))
  stop.abort()
  await running
})


test('panel answers wake only the marked, ready orchestrator once with literal change text', async t => {
  const w = world(t)
  w.orch.marked = true
  w.openGate()
  const text = 'Split this first; $(literal)\nthen continue'
  const effect = { kind: 'answer', gate: gateTarget(w.read().model), answer: 'change', text }
  assert.equal(await panelEffect(w.r, 'm1', effect), 'Change sent for plan')
  const load = w.calls.find(c => c.args.includes('load-buffer'))
  assert.equal(load.input, 'Change requested on plan: Split this first; $(literal) then continue')
  assert.equal(w.calls.filter(c => c.args.includes('paste-buffer')).length, 1)
  assert.ok(w.calls.find(c => c.args.includes('paste-buffer')).args.includes('%9'))
  flushAnswers(w.r, mission(w.r, 'm1'))
  assert.equal(w.calls.filter(c => c.args.includes('paste-buffer')).length, 1)
  assert.equal(w.events().at(-1).answer, 'change')
})

test('busy, dialog and unknown orchestrators are retried on refresh without typing', async t => {
  const w = world(t)
  w.orch.marked = true
  w.orch.screen = 'esc to interrupt'
  w.openGate()
  await panelEffect(w.r, 'm1', { kind: 'answer', gate: gateTarget(w.read().model), answer: 'approve' })
  for (const screen of ['Would you like to run the following command?', '❯\nWould you like to run the following command?', '› Ask Codex to do anything\nIs this a project you created or one you trust?', 'unknown', '› a draft']) {
    w.orch.screen = screen
    flushAnswers(w.r, mission(w.r, 'm1'))
  }
  assert.ok(!w.calls.some(c => c.args.includes('load-buffer')))
  w.orch.screen = '› Ask Codex to do anything'
  flushAnswers(w.r, mission(w.r, 'm1'))
  assert.equal(w.calls.filter(c => c.args.includes('paste-buffer')).length, 1)
  assert.equal(w.calls.find(c => c.args.includes('load-buffer')).input, 'plan approved in the panel. Continue the mission.')
})

test('notification rechecks readiness and pane identity just before paste', async t => {
  for (const change of ['busy', 'owner', 'gone']) {
    const w = world(t)
    w.orch.marked = true
    w.openGate()
    w.afterLoad(() => {
      if (change === 'busy') w.orch.screen = 'esc to interrupt'
      if (change === 'owner') w.orch.token = 'replacement'
      if (change === 'gone') w.orch.dead = true
    })
    await panelEffect(w.r, 'm1', { kind: 'answer', gate: gateTarget(w.read().model), answer: 'approve' })
    assert.ok(!w.calls.some(c => c.args.includes('paste-buffer') || c.args.includes('send-keys')))
    assert.equal(w.events().at(-1).answer, 'approve')
  }
})

test('a reopened gate cancels its pending answer notification', async t => {
  const w = world(t)
  w.orch.marked = true
  w.orch.screen = 'esc to interrupt'
  w.openGate()
  await panelEffect(w.r, 'm1', { kind: 'answer', gate: gateTarget(w.read().model), answer: 'approve' })
  w.openGate()
  w.orch.screen = '› Ask Codex to do anything'
  flushAnswers(w.r, mission(w.r, 'm1'))
  assert.ok(!w.calls.some(c => c.args.includes('paste-buffer')))
})

test('MR gate panel notification asks for the merged gate before any teardown', async t => {
  const w = world(t)
  w.orch.marked = true
  w.openGate('mr-ok')
  await panelEffect(w.r, 'm1', { kind: 'answer', gate: gateTarget(w.read().model), answer: 'approve' })
  const load = w.calls.find(c => c.args.includes('load-buffer'))
  assert.ok(load.input.startsWith('mr-ok approved in the panel.'))
  assert.match(load.input, /troupe gate merged -m m1/)
  assert.doesNotMatch(load.input, /troupe teardown/)
})

test('minimum panel height leaves readable gate content with and without change input', t => {
  const w = world(t)
  w.openGate()
  const reading = w.read()
  const change = transition(initialUi(), key('c'), reading.model, [], 10, 100).ui
  for (const ui of [initialUi(), change]) {
    for (const height of [8, 9]) {
      const small = frameOf(reading, ui, 73, height)
      assert.match(textOf(small.lines[0]), /needs 40 columns and 10 rows/)
      assert.deepEqual(small.hits, [])
      assert.equal(small.maxScroll, 0)
    }
    const minimum = frameOf(reading, ui, 73, 10)
    assert.ok(textOf(minimum.lines[5]).includes('Goal'), 'minimum height must show a content row')
    assert.ok(minimum.maxScroll > 0)
    if (ui.input) assert.ok(textOf(minimum.lines[8]).includes('change'))
  }
})

test('too-small resize blocks approval and hidden change submission until content is visible again', async t => {
  const w = world(t)
  w.openGate()
  const stop = new AbortController()
  t.after(() => stop.abort())
  const input = new InputStream()
  const output = new OutputStream()
  output.rows = 8
  const running = panel({ ...w.r, signal: stop.signal }, { mission: 'm1' }, { input, output })
  for (const height of [8, 9]) {
    output.rows = height
    output.emit('resize')
    input.emit('data', 'a')
    await tick()
    assert.ok(w.output.at(-1).includes('needs 40 columns and 10 rows'))
    assert.ok(!w.events().some(e => e.ev === 'gate-answer'))
  }
  output.rows = 10
  output.emit('resize')
  input.emit('data', 'cPlease revise')
  await tick()
  assert.ok(w.output.at(-1).includes('Please revise'))
  output.rows = 9
  output.emit('resize')
  input.emit('data', '\r')
  await tick()
  assert.ok(!w.events().some(e => e.ev === 'gate-answer'))
  output.rows = 10
  output.emit('resize')
  await tick()
  assert.ok(w.output.at(-1).includes('Please revise'))
  input.emit('data', '\r')
  await tick()
  assert.equal(w.events().at(-1).text, 'Please revise')
  stop.abort()
  assert.equal((await running).code, 0)
})
