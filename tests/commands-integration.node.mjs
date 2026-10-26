import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'

import { execute } from '../dist/commands.js'
import { runtime } from '../dist/command-context.js'
import { mission } from '../dist/missions.js'
import { append, readLog } from '../dist/log.js'
import { panelEffect } from '../dist/panel-actions.js'
import { readPanel } from '../dist/panel-model.js'
import { gateTarget } from '../dist/panel-input.js'
import { flushAnswers } from '../dist/orchestrator.js'
import { shellOf, tmux } from '../dist/run.js'
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
  execFileSync('git', ['-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'initial'], { cwd: root })
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim()
  const caller = tmux(['new-session', '-d', '-s', 'agent', '-x', '200', '-y', '50', '-P', '-F', '#{pane_id}', 'sleep 30'], undefined, env)
  assert.equal(caller.code, 0, caller.err)
  const pane = caller.out.trim()
  const r = runtime({ cwd: root, home: join(root, '.home'), env: { ...env, TMUX: 'scratch', TMUX_PANE: pane } })
  const first = await execute('open', ['--planning'], r)
  assert.equal(first.code, 0, first.out)
  const list = () => tmux(['list-panes', '-a', '-F', '#{pane_id}\t#{@troupe-panel}'], undefined, env).out.trim().split('\n')
  const panes = list()
  assert.equal(panes.length, 2)
  assert.equal(panes.filter(line => line.endsWith(`\t${repo}`)).length, 1)
  const panelPane = panes.find(line => line.endsWith(`\t${repo}`)).split('\t')[0]
  let firstFrame = ''
  for (let i = 0; i < 100; i++) {
    firstFrame = tmux(['capture-pane', '-p', '-t', panelPane], undefined, env).out.trim()
    if (firstFrame) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.ok(firstFrame.includes('Orch is planning…'), firstFrame)

  assert.equal(tmux(['display', '-p', '-t', 'agent', '#{pane_id}'], undefined, env).out.trim(), pane)
  const plain = await execute('open', [], r)
  assert.equal(plain.code, 1, plain.out)
  assert.match(plain.out, /no mission for this pane; pass -m <mission> \(no open mission\)/)
  const second = await execute('open', ['--planning'], r)
  assert.equal(second.code, 0, second.out)
  assert.match(second.out, /already open/)
  assert.deepEqual(list(), panes)
  // Binding the pane later hands the planning panel its mission.
  const made = await execute('mission', ['new', 'later'], r)
  assert.equal(made.code, 0, made.out)
  assert.match(made.out, /already open/)
  assert.deepEqual(list(), panes)
  let frame = ''
  for (let i = 0; i < 200 && !frame.includes('later'); i++) {
    frame = tmux(['capture-pane', '-p', '-t', panelPane], undefined, env).out
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.ok(frame.includes('later'), frame)
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
  const manual = tmux(['new-session', '-d', '-s', session, '-n', 'roles-m1', '-P', '-F', '#{pane_id}', 'sleep 30'], undefined, env)
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
  for (const flags of [['-s', 'read-only'], ['--sandbox=workspace-write', '-s', 'read-only'], ['-s=workspace-write', '--sandbox=read-only'], ['--sandbox=workspace-write', '-s=read-only'], ['-s', 'workspace-write', '--dangerously-bypass-approvals-and-sandbox']]) {
    assert.deepEqual(gitDirsOf(w.r, w.m, { ...role, flags }, w.path), [])
  }
  assert.deepEqual(gitDirsOf(w.r, w.m, { ...role, agent: 'claude' }, w.path), [])
  for (const flags of [['-s', 'workspace-write'], ['--sandbox', 'workspace-write'], ['-s=workspace-write'], ['--sandbox=workspace-write'], ['--sandbox=read-only', '-s=workspace-write']]) {
    assert.deepEqual(gitDirsOf(w.r, w.m, { ...role, flags }, w.path), dirs)
  }
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

test('teardown takes a squash-merged role as merged by its content, and refuses a missing or later change (#49)', async t => {
  const w = cleanupRepo(t)
  const gitRole = (...args) => execFileSync('git', args, { cwd: w.path, encoding: 'utf8' })
  mkdirSync(join(w.path, 'src'), { recursive: true })
  writeFileSync(join(w.path, 'src/a'), 'a1')
  writeFileSync(join(w.path, 'src/b'), 'b1')
  gitRole('add', '.')
  gitRole('commit', '-qm', 'one')
  gitRole('mv', 'tracked', 'moved')
  gitRole('commit', '-qm', 'two')
  // Only part of the role reached the mission branch.
  w.git('checkout', 'role/m1/api', '--', 'src/a')
  w.git('commit', '-qm', 'api: part')
  let reply = await w.call()
  assert.equal(reply.code, 1, reply.out)
  assert.match(reply.out, /role\/m1\/api: unmerged into mission\/m1 \(its changes differ from the target\)/)
  // The whole role as one commit, a rename included: merged, though not an ancestor.
  w.git('rm', '-q', 'tracked')
  w.git('checkout', 'role/m1/api', '--', 'src', 'moved')
  w.git('commit', '-qm', 'api: all')
  assert.notEqual(spawnSync('git', ['merge-base', '--is-ancestor', 'role/m1/api', 'mission/m1'], { cwd: w.root }).status, 0)
  // A commit on the role branch after the squash is missing again.
  writeFileSync(join(w.path, 'src/a'), 'a2')
  gitRole('commit', '-qam', 'three')
  reply = await w.call()
  assert.equal(reply.code, 1, reply.out)
  assert.match(reply.out, /unmerged into mission\/m1/)
  w.git('checkout', 'role/m1/api', '--', 'src/a')
  w.git('commit', '-qm', 'api: three')
  reply = await w.call()
  assert.equal(reply.code, 0, reply.out)
  assert.equal(w.git('branch', '--list', 'role/m1/*').trim(), '')
  assert.equal(existsSync(w.path), false)
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


test('real scratch tmux: a panel answer reaches the marked ready agent once', { skip: spawnSync('tmux', ['-V']).status !== 0, timeout: 15000 }, async t => {
  const w = cleanupRepo(t)
  const socket = `troupe-wake-${process.pid}-${randomUUID().slice(0, 8)}`
  const env = { ...process.env, TMUX: undefined, TMUX_PANE: undefined, TROUPE_TMUX_SOCKET: socket }
  t.after(() => tmux(['kill-server'], undefined, env))
  const received = join(w.root, '.troupe/received.txt')
  const script = `printf '› Ask Codex to do anything\\n'; while IFS= read -r line; do printf '%s\\n' "$line" >> ${shellOf([received])}; done`
  const caller = tmux(['new-session', '-d', '-s', 'agent', '-P', '-F', '#{pane_id}', shellOf(['/bin/sh', '-c', script])], undefined, env)
  assert.equal(caller.code, 0, caller.err)
  const pane = caller.out.trim()
  const r = runtime({ ...w.r, env: { ...env, TMUX: 'scratch', TMUX_PANE: pane } })
  assert.equal((await execute('open', [], r)).code, 0)
  append(w.m.log, 'orch', { ev: 'gate-open', gate: 'plan', plan: w.m.hash })
  const reading = readPanel(r, 'm1')
  assert.ok('model' in reading)
  assert.equal(await panelEffect(r, 'm1', { kind: 'answer', gate: gateTarget(reading.model), answer: 'approve' }), 'Approved plan')
  for (let i = 0; i < 50 && !existsSync(received); i++) {
    flushAnswers(r, mission(r, 'm1'))
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(readFileSync(received, 'utf8'), 'plan approved in the panel. Continue the mission.\n')
  flushAnswers(r, mission(r, 'm1'))
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(readFileSync(received, 'utf8').trim().split('\n').length, 1)
})

// Two orchestrators, each bound to its own mission, plus an unbound pane, on one scratch tmux server.
const parallelWorld = (t, prefix) => {
  const base = mkdtempSync(join(tmpdir(), `troupe-${prefix}-`))
  const socket = `troupe-${prefix}-${process.pid}-${randomUUID().slice(0, 8)}`
  const env = { ...process.env, TMUX: undefined, TMUX_PANE: undefined, TROUPE_TMUX_SOCKET: socket }
  t.after(() => {
    tmux(['kill-server'], undefined, env)
    rmSync(base, { recursive: true, force: true })
  })
  const home = join(base, 'home')
  mkdirSync(home)
  const agent = join(base, 'fake-agent.sh')
  writeFileSync(agent, "#!/bin/sh\nprintf '\\033[2J\\033[HREADY\\n'\nwhile IFS= read -r line; do printf '\\033[2J\\033[HREADY\\n'; done\n")
  chmodSync(agent, 0o755)
  const repo = name => {
    const root = join(base, name)
    mkdirSync(join(root, '.troupe/agents'), { recursive: true })
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    git('init', '-q', '-b', 'main')
    git('config', 'user.name', 'Probe')
    git('config', 'user.email', 'probe@example.invalid')
    writeFileSync(join(root, '.troupe/agents/fake.yaml'), `command: ${JSON.stringify(agent)}\nmodel: []\neffort: []\npermission:\n  - [--policy]\nprompt: last-arg\nscreen:\n  waits: ['^WAIT$']\n  working: ['^WORKING$']\n  ready: ['^READY$']\npaste: bracketed\n`)
    writeFileSync(join(root, 'README'), name)
    git('add', '.')
    git('commit', '-qm', 'initial')
    return { root, git }
  }
  // An orchestrator stand-in: a Codex-like prompt that records every line typed into it.
  const orchestrator = (name, window) => {
    const received = join(base, `${name}.received`)
    const script = `printf '› Ask Codex to do anything\\n'; while IFS= read -r line; do printf '%s\\n' "$line" >> ${shellOf([received])}; done`
    const opened = tmux(window === 0 ? ['new-session', '-d', '-s', 'agents', '-x', '200', '-y', '50', '-P', '-F', '#{pane_id}', shellOf(['/bin/sh', '-c', script])]
      : ['new-window', '-d', '-t', 'agents:', '-P', '-F', '#{pane_id}', shellOf(['/bin/sh', '-c', script])], undefined, env)
    assert.equal(opened.code, 0, opened.err)
    return { pane: opened.out.trim(), received }
  }
  const at = (cwd, pane) => runtime({ cwd, home, env: { ...env, TMUX: 'scratch', TMUX_PANE: pane }, inputTTY: false, outputTTY: false })
  const panes = () => tmux(['list-panes', '-a', '-F', '#{pane_id}\t#{@troupe-panel}\t#{@troupe-panel-orchestrator}\t#{@troupe-mission}\t#{@troupe-mission-repo}'], undefined, env).out.trim().split('\n')
    .map(line => { const [pane, panel, orchestrator, mission, repo] = line.split('\t'); return { pane, panel, orchestrator, mission, repo } })
  const windows = () => tmux(['list-windows', '-a', '-F', '#{window_name}\t#{window_panes}'], undefined, env).out.trim().split('\n')
  return { base, env, repo, orchestrator, at, panes, windows }
}

const fakePlan = name => `# ${name}\n\n\`\`\`yaml\ngoal: Check ${name}\nbase: mission/${name}\nroles:\n  api:\n    agent: fake\n    flags: [--policy, ask]\n    touches: []\n\`\`\`\n\n## Role: api\n\nReply.\n`

test('real scratch tmux: two missions in one repository each follow their own orchestrator pane', { skip: spawnSync('tmux', ['-V']).status !== 0, timeout: 40000 }, async t => {
  const w = parallelWorld(t, 'parallel')
  const { root, git } = w.repo('repo')
  const a = w.orchestrator('a', 0)
  const b = w.orchestrator('b', 1)
  const c = w.orchestrator('c', 2)
  const [ra, rb, rc] = [a, b, c].map(one => w.at(root, one.pane))

  for (const [name, r] of [['alpha', ra], ['beta', rb]]) {
    const made = await execute('mission', ['new', name], r)
    assert.equal(made.code, 0, made.out)
    assert.ok(made.out.includes(join(root, '.troupe/missions', name)), made.out)
    assert.equal(git('symbolic-ref', '--short', 'HEAD').trim(), 'main', 'mission new never switches the main checkout')
  }
  assert.match((await execute('mission', ['new', 'beta'], rc)).out, /already exists/)
  assert.match((await execute('mission', ['new', 'gamma'], ra)).out, /runs mission alpha/)
  assert.equal(git('status', '--porcelain').trim(), '', 'mission worktrees stay out of the main checkout status')

  // Each caller pane resolves its own mission without -m, from the main checkout.
  for (const [name, r] of [['alpha', ra], ['beta', rb]]) {
    const worktree = join(root, '.troupe/missions', name)
    writeFileSync(join(worktree, `docs/missions/${name}/plan.md`), fakePlan(name))
    execFileSync('git', ['add', '.'], { cwd: worktree })
    execFileSync('git', ['commit', '-qm', `${name}: plan`], { cwd: worktree })
    const m = mission(r)
    assert.equal(m.name, name)
    assert.equal(m.worktree, worktree)
    const checked = await execute('check', [], r)
    assert.equal(checked.code, 0, checked.out)
    append(m.log, 'panel', { ev: 'gate-answer', gate: 'plan', answer: 'approve', plan: m.hash })
    assert.equal(JSON.parse((await execute('status', ['--json'], r)).out).mission, name)
  }
  // -m reads the other mission's plan from wherever it runs, but not against a pane's own binding.
  assert.equal(mission(rc, 'beta').worktree, join(root, '.troupe/missions/beta'))
  assert.match((await execute('status', ['-m', 'beta'], ra)).out, /runs mission alpha; -m beta names another/)

  // An unbound pane refuses and lists both; status lists them with exit 0.
  const refused = await execute('stage', ['build'], rc)
  assert.equal(refused.code, 1)
  for (const name of ['alpha', 'beta']) assert.ok(refused.out.includes(`${name}  ${join(root, '.troupe/missions', name)}`), refused.out)
  const listed = await execute('status', ['--json'], rc)
  assert.equal(listed.code, 0, listed.out)
  const open = JSON.parse(listed.out).missions
  assert.deepEqual(open.map(one => [one.name, one.orchestrator]), [['alpha', a.pane], ['beta', b.pane]])

  // One panel per mission, beside its orchestrator, and open stays idempotent per mission.
  const panels = () => w.panes().filter(one => one.panel === root)
  assert.deepEqual(panels().map(one => [one.orchestrator, one.mission]).sort(), [[a.pane, 'alpha'], [b.pane, 'beta']])
  assert.deepEqual(open.map(one => one.panel), [panels().find(one => one.mission === 'alpha').pane, panels().find(one => one.mission === 'beta').pane])
  assert.match((await execute('open', [], ra)).out, /already open/)
  assert.equal(panels().length, 2)
  // An unbound pane neither opens an idle panel nor takes over a live orchestrator's mission.
  const idle = await execute('open', [], rc)
  assert.equal(idle.code, 1)
  for (const name of ['alpha', 'beta']) assert.ok(idle.out.includes(`${name}  ${join(root, '.troupe/missions', name)}`), idle.out)
  const unbound = readPanel(rc, '')
  assert.ok(unbound.missing.startsWith('panel: no mission for this pane') && unbound.missing.includes('alpha') && unbound.missing.includes('beta'), unbound.missing)
  const stolen = await execute('open', ['-m', 'alpha'], rc)
  assert.equal(stolen.code, 1)
  assert.match(stolen.out, new RegExp(`mission alpha is run by pane ${a.pane}`))
  assert.ok(!w.panes().find(one => one.pane === c.pane).mission, 'the unbound pane stays unbound')
  assert.equal(panels().length, 2)
  const alphaPanel = panels().find(one => one.mission === 'alpha').pane
  let frame = ''
  for (let i = 0; i < 150 && !frame.includes('alpha'); i++) {
    frame = tmux(['capture-pane', '-p', '-t', alphaPanel], undefined, w.env).out
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.ok(frame.includes('alpha') && !frame.includes('beta'), frame)

  // One roles-<m> window per mission.
  for (const r of [ra, rb]) {
    const dispatched = await execute('dispatch', ['api'], r)
    assert.equal(dispatched.code, 0, dispatched.out)
  }
  assert.deepEqual(w.windows().filter(line => line.startsWith('roles')).sort(), ['roles-alpha\t1', 'roles-beta\t1'])
  assert.ok(existsSync(join(root, '.troupe/worktrees/alpha/api')) && existsSync(join(root, '.troupe/worktrees/beta/api')), 'role worktrees stay under the main checkout')

  // A gate answer reaches only its own mission's orchestrator.
  assert.equal((await execute('gate', ['release', 'Ship alpha?', '--no-wait'], ra)).code, 0)
  const rPanel = w.at(root, alphaPanel)
  const reading = readPanel(rPanel, '')
  assert.equal(reading.mission.name, 'alpha', 'the panel resolves through its orchestrator')
  assert.equal(await panelEffect(rPanel, 'alpha', { kind: 'answer', gate: gateTarget(reading.model), answer: 'approve' }), 'Approved release')
  for (let i = 0; i < 100 && !existsSync(a.received); i++) {
    flushAnswers(rPanel, mission(rPanel))
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(readFileSync(a.received, 'utf8'), 'release approved in the panel. Continue the mission.\n')
  assert.equal(existsSync(b.received), false)

  // Teardown of beta waits for its push, then leaves alpha intact.
  const beta = join(root, '.troupe/missions/beta')
  assert.match((await execute('teardown', [], rb)).out, /mission\/beta: not pushed/)
  execFileSync('git', ['init', '-q', '--bare', join(w.base, 'remote.git')])
  git('remote', 'add', 'origin', join(w.base, 'remote.git'))
  execFileSync('git', ['push', '-q', 'origin', 'mission/beta'], { cwd: beta, stdio: 'ignore' })
  const torn = await execute('teardown', [], rb)
  assert.equal(torn.code, 0, torn.out)
  assert.equal(existsSync(beta), false)
  assert.equal(git('rev-parse', '--verify', '-q', 'mission/beta').trim().length, 40, 'the mission branch stays')
  assert.deepEqual(panels().map(one => one.mission), ['alpha'])
  assert.equal(w.panes().find(one => one.pane === b.pane).mission, '', 'the beta orchestrator is unbound')
  assert.deepEqual(w.windows().filter(line => line.startsWith('roles')), ['roles-alpha\t1'])
  assert.ok(existsSync(join(root, '.troupe/missions/alpha')))
  assert.equal(JSON.parse((await execute('status', ['--json'], ra)).out).roles[0].state !== 'gone', true)
  assert.match((await execute('teardown', ['-m', 'beta'], rc)).out, /Nothing left to tear down for beta/)
  assert.deepEqual(JSON.parse((await execute('status', ['--json'], rc)).out).missions.map(one => one.name), ['alpha'])

  // Once alpha's orchestrator is gone, another pane may take the mission and its panel over.
  assert.equal(tmux(['kill-pane', '-t', a.pane], undefined, w.env).code, 0)
  const taken = await execute('open', ['-m', 'alpha'], rc)
  assert.equal(taken.code, 0, taken.out)
  assert.match(taken.out, /already open/)
  assert.equal(w.panes().find(one => one.pane === c.pane).mission, 'alpha')
  assert.deepEqual(panels().map(one => [one.orchestrator, one.mission]), [[c.pane, 'alpha']])
})

test('real scratch tmux: the same mission name in two repositories stays apart', { skip: spawnSync('tmux', ['-V']).status !== 0, timeout: 20000 }, async t => {
  const w = parallelWorld(t, 'repos')
  const one = w.repo('one')
  const two = w.repo('two')
  const a = w.orchestrator('a', 0)
  const b = w.orchestrator('b', 1)
  assert.equal((await execute('mission', ['new', 'alpha'], w.at(one.root, a.pane))).code, 0)
  assert.equal((await execute('mission', ['new', 'alpha'], w.at(two.root, b.pane))).code, 0)
  assert.equal(mission(w.at(one.root, a.pane)).worktree, join(one.root, '.troupe/missions/alpha'))
  assert.equal(mission(w.at(two.root, b.pane)).worktree, join(two.root, '.troupe/missions/alpha'))
  // A pane bound to an open mission in one repository cannot start another in a second one.
  const twice = await execute('mission', ['new', 'beta'], w.at(two.root, a.pane))
  assert.equal(twice.code, 1)
  assert.match(twice.out, new RegExp(`this pane runs mission alpha in ${one.root}; start beta from another pane`))
  assert.equal(existsSync(join(two.root, '.troupe/missions/beta')), false)
  assert.equal(w.panes().find(p => p.pane === a.pane).repo.startsWith(one.root), true)
  // Nor can it take over a mission in the second one whose orchestrator is gone.
  const q = w.orchestrator('q', 2)
  assert.equal((await execute('mission', ['new', 'beta'], w.at(two.root, q.pane))).code, 0)
  assert.equal(tmux(['kill-pane', '-t', q.pane], undefined, w.env).code, 0)
  const takeover = await execute('open', ['-m', 'beta'], w.at(two.root, a.pane))
  assert.equal(takeover.code, 1)
  assert.match(takeover.out, new RegExp(`this pane runs mission alpha in ${one.root}; open beta from another pane`))
  const held = w.panes().find(p => p.pane === a.pane)
  assert.equal(held.mission, 'alpha')
  assert.equal(held.repo.startsWith(one.root), true)
  // A pane bound in one repository is unbound in the other.
  const across = JSON.parse((await execute('status', ['--json'], w.at(two.root, a.pane))).out)
  assert.deepEqual(across.missions.map(m => [m.name, m.orchestrator]), [['alpha', b.pane], ['beta', '']])
  const panels = w.panes().filter(p => p.panel !== '' && p.orchestrator !== q.pane)
  assert.deepEqual(panels.map(p => [p.panel, p.orchestrator]).sort(), [[one.root, a.pane], [two.root, b.pane]])
})
