import assert from 'node:assert/strict'
import fs, { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import { AGENTS, loadAgents } from '../dist/agents.js'
import { roleSettings, liveOf, statusOf } from '../dist/role-commands.js'
import { shellOf } from '../dist/run.js'
import { statusLine, statusLineCommand } from '../dist/statusline.js'
import { tokensOf } from '../dist/usage.js'

const cwd = '/repo/.troupe/worktrees/m1/api'
const started = '2026-10-24T10:00:00Z'
const fixture = kind => readFileSync(new URL(`./fixtures/usage/${kind}.jsonl`, import.meta.url), 'utf8')
const jsonl = row => `${JSON.stringify(row)}\n`
const message = (id, input, output = 1, model = 'claude-opus') => ({ type: 'assistant', message: { id, model, usage: { input_tokens: input, output_tokens: output } } })
const temporary = t => {
  const home = mkdtempSync(join(tmpdir(), 'troupe-usage-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); return path }
  const put = (kind, text = fixture(kind), name = 'session') => write(kind === 'codex'
    ? join(home, '.codex/sessions/2026/10/24', `rollout-${name}.jsonl`)
    : join(home, '.claude/projects', cwd.replace(/[/.]/g, '-'), `${name}.jsonl`), text)
  const get = (kind, since = undefined) => tokensOf(kind, cwd, since, home)

  return { home, write, put, get }
}

test('Codex uses the latest cumulative totals and input already includes cached input', t => {
  const { put, get } = temporary(t)
  put('codex')
  const expected = { used: 200, window: 475000, input: 300, output: 30 }
  assert.deepEqual(get('codex'), expected)
  assert.deepEqual(get('codex', started), expected)
  assert.equal(get('codex', '2026-10-24T10:00:00.001Z'), undefined)
  assert.equal(get('codex', 'bad date'), undefined)
  const result = get('codex')
  result.used = 0
  assert.deepEqual(get('codex'), expected)
})

for (const kind of ['claude', 'codex']) {
  test(`${kind}: select newest start for the cwd, discover new sessions, and never fall back to an older counter`, t => {
    const { put, get } = temporary(t)
    const first = put(kind)
    assert.ok(get(kind))
    put(kind, fixture(kind).replaceAll(cwd, '/some/other/path').replaceAll('10:00:00', '12:00:00'), 'other')
    assert.ok(get(kind))
    put(kind, fixture(kind).replaceAll('10:00:00', '11:00:00'), 'new')
    utimesSync(first, new Date('2030-01-01'), new Date('2030-01-01'))
    assert.ok(get(kind, '2026-10-24T11:00:00Z'))
    assert.equal(get(kind, '2026-10-24T11:00:01Z'), undefined)
    const meta = kind === 'codex'
      ? jsonl({ type: 'session_meta', payload: { cwd, timestamp: '2026-10-24T13:00:00Z' } })
      : jsonl({ type: 'user', cwd, timestamp: '2026-10-24T13:00:00Z' })
    put(kind, meta, 'empty-newest')
    assert.equal(get(kind), undefined)
  })
}

test('Claude includes caches in context and session totals, counting each message ID once', t => {
  const { put, get } = temporary(t)
  const path = put('claude')
  assert.deepEqual(get('claude'), { used: 210, window: 200000, input: 310, output: 50 })
  appendFileSync(path, jsonl(message('two', 220, 35)))
  assert.deepEqual(get('claude'), { used: 220, window: 200000, input: 320, output: 55 })
  appendFileSync(path, jsonl(message('three', 10, 2, 'claude-opus[1m]')))
  assert.deepEqual(get('claude'), { used: 10, window: 1000000, input: 330, output: 57 })
})

test('Claude guesses a 1m window after any context above 200k, even if the latest context is smaller', t => {
  const { put, get } = temporary(t)
  const path = put('claude', fixture('claude') + jsonl(message('large', 200000)))
  assert.equal(get('claude').window, 200000)
  appendFileSync(path, jsonl(message('large', 200001)) + jsonl(message('small', 20)))
  assert.deepEqual(get('claude'), { used: 20, window: 1000000, input: 200331, output: 52 })
})

test('Claude handles a provisional final record and a partially written append without double counting', t => {
  const { put, get } = temporary(t)
  const path = put('claude', fixture('claude') + JSON.stringify(message('three', 50, 5)))
  assert.deepEqual(get('claude'), { used: 50, window: 200000, input: 360, output: 55 })
  appendFileSync(path, '\n{"type":"assistant","message":')
  assert.deepEqual(get('claude'), { used: 50, window: 200000, input: 360, output: 55 })
  const next = JSON.stringify(message('four', 60, 6))
  appendFileSync(path, next.slice(next.indexOf(':', next.indexOf('"message"')) + 1) + '\n')
  assert.deepEqual(get('claude'), { used: 60, window: 200000, input: 420, output: 61 })
})

for (const kind of ['claude', 'codex']) {
  test(`${kind}: invalidate caches on rewrite, replacement and append`, t => {
    const { put, get } = temporary(t)
    const path = put(kind)
    assert.ok(get(kind))
    // Same length rewrite must invalidate; ctime also catches preserved mtime.
    writeFileSync(path, fixture(kind).replace(kind === 'codex' ? '"input_tokens":200' : '"input_tokens":5', kind === 'codex' ? '"input_tokens":201' : '"input_tokens":6'))
    assert.equal(get(kind).used, kind === 'codex' ? 201 : 211)
    writeFileSync(path, fixture(kind).split('\n').slice(0, kind === 'codex' ? 1 : 3).join('\n') + '\n')
    assert.equal(get(kind), undefined)
    const replacement = put(kind, fixture(kind), 'replacement')
    renameSync(replacement, path)
    assert.equal(get(kind).used, kind === 'codex' ? 200 : 210)
    const extra = kind === 'codex'
      ? { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 500, output_tokens: 40 }, last_token_usage: { input_tokens: 250 } } } }
      : message('new', 250, 40)
    appendFileSync(path, jsonl(extra))
    assert.deepEqual(get(kind), kind === 'codex' ? { used: 250, input: 500, output: 40 } : { used: 250, window: 200000, input: 560, output: 90 })
  })
}

test('missing, malformed, sidechain and invalid counters are unavailable without throwing', t => {
  const { home, put, get } = temporary(t)
  for (const kind of ['claude', 'codex']) assert.equal(get(kind), undefined)
  assert.equal(tokensOf('unknown', cwd, undefined, home), undefined)
  const claude = put('claude', fixture('claude') + jsonl(message('bad', -1)))
  assert.equal(get('claude'), undefined)
  writeFileSync(claude, fixture('claude') + 'not-json\n')
  assert.equal(get('claude'), undefined)
  writeFileSync(claude, jsonl({ type: 'user', isSidechain: true, cwd, timestamp: started }) + jsonl(message('child', 10)))
  assert.equal(get('claude'), undefined)
  put('codex', fixture('codex') + jsonl({ type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: '200' }, total_token_usage: { input_tokens: 300, output_tokens: 30 } } } }))
  assert.equal(get('codex'), undefined)
})

test('polling unchanged files reads no bytes; Codex tails and Claude appends stay bounded', t => {
  const { put, get } = temporary(t)
  const filler = jsonl({ type: 'progress', text: 'x'.repeat(1000) }).repeat(2000)
  const codex = fixture('codex').split('\n')
  put('codex', codex[0] + '\n' + filler + codex.slice(1).join('\n'))
  const claude = put('claude', fixture('claude') + filler)
  let bytes = 0
  const original = fs.readSync
  t.mock.method(fs, 'readSync', (...args) => { const count = original(...args); bytes += count; return count })
  syncBuiltinESMExports()
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports() })
  assert.ok(get('codex'))
  assert.ok(bytes <= 128 * 1024, `Codex read ${bytes} bytes`)
  bytes = 0
  assert.ok(get('claude'))
  assert.ok(bytes > 2_000_000)
  bytes = 0
  assert.ok(get('codex'))
  assert.ok(get('claude'))
  assert.equal(bytes, 0)
  appendFileSync(claude, jsonl(message('appended', 30)))
  assert.equal(get('claude').used, 30)
  assert.ok(bytes < 128 * 1024, `Claude append read ${bytes} bytes`)
})

test('live and JSON status use the launched adapter, worktree and dispatch time', t => {
  const { home, put } = temporary(t)
  put('codex')
  const role = { name: 'api', agent: 'claude', touches: [], dependsOn: [] }
  const opened = { role: 'api', agent: 'custom', worktree: cwd, at: started, base: 'main', pane: '%9', session: 'test', window: '@9', branch: 'role/m1/api' }
  const m = { name: 'm1', plan: { roles: [role] }, agents: { ...AGENTS, custom: { ...AGENTS.codex } }, folded: { roles: new Map([['api', opened]]), gates: new Map(), stage: 'work' }, problems: [] }
  const r = { home, env: {}, run: () => ({ code: 0, out: '', err: '' }) }
  const expected = { used: 200, window: 475000, input: 300, output: 30 }
  assert.deepEqual(liveOf(r, m, role).tokens, expected)
  assert.deepEqual(JSON.parse(JSON.stringify(statusOf(r, m))).roles[0].tokens, expected)
  assert.equal(liveOf(r, m, role).context, undefined)
  opened.at = '2026-10-24T11:00:00Z'
  assert.equal(liveOf(r, m, role).tokens, undefined)
  opened.at = started
  delete m.agents.custom.usage
  assert.equal(liveOf(r, m, role).tokens, undefined)
  m.folded.roles.clear()
  assert.equal(liveOf(r, m, role).tokens, undefined)
})

test('built-in and YAML adapters opt into a validated usage reader', t => {
  const { home, write } = temporary(t)
  assert.equal(AGENTS.claude.usage, 'claude')
  assert.equal(AGENTS.codex.usage, 'codex')
  const path = join(home, '.troupe/agents/custom.yaml')
  const source = "command: custom\nmodel: [--model, '{model}']\neffort: [--effort, '{effort}']\npermission:\n  - [--policy]\nprompt: last-arg\nscreen:\n  waits: ['WAIT']\n  working: ['BUSY']\n  ready: ['READY']\npaste: bracketed\n"
  for (const usage of ['claude', 'codex', undefined]) {
    write(path, source + (usage === undefined ? '' : `usage: ${usage}\n`))
    const loaded = loadAgents(home, home)
    assert.deepEqual(loaded.problems, [])
    assert.equal(loaded.agents.custom.usage, usage)
  }
  for (const value of ['other', 'true', '[codex]']) {
    write(path, source + `usage: ${value}\n`)
    const loaded = loadAgents(home, home)
    assert.ok(loaded.problems.some(problem => problem.includes('usage') && problem.includes(path)))
    assert.equal(loaded.agents.custom, undefined)
  }
})

test('claude takes the window its status line reported for the same session', t => {
  const { home, write } = temporary(t)
  const dir = join(home, 'worktree')
  write(join(home, '.claude/projects', dir.replace(/[/.]/g, '-'), 'abc.jsonl'), fixture('claude').replaceAll(cwd, dir))
  const window = () => tokensOf('claude', dir, undefined, home).window
  assert.equal(window(), 200000)
  write(join(dir, '.troupe/context.json'), JSON.stringify({ session: 'other', window: 1000000 }))
  assert.equal(window(), 200000)
  write(join(dir, '.troupe/context.json'), JSON.stringify({ session: 'abc', window: 1000000 }))
  assert.equal(window(), 1000000)
  write(join(dir, '.troupe/context.json'), 'not json')
  assert.equal(window(), 200000)
})

test('the role status line saves the reported window and still shows the configured one', t => {
  const { home, write } = temporary(t)
  const file = join(home, 'context.json')
  const payload = JSON.stringify({ session_id: 'abc', context_window: { context_window_size: 1000000 } })
  assert.equal(statusLine(payload, file, 'printf shown; cat >/dev/null'), 'shown')
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { session: 'abc', window: 1000000 })
  assert.equal(statusLine(payload, file), '')
  assert.equal(statusLine('not json', join(home, 'none.json'), 'cat'), 'not json')
  assert.equal(fs.existsSync(join(home, 'none.json')), false)
  const root = join(home, 'repo')
  assert.equal(statusLineCommand(root, home), undefined)
  write(join(home, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'user-line' } }))
  assert.equal(statusLineCommand(root, home), 'user-line')
  write(join(root, '.claude/settings.json'), JSON.stringify({ model: 'opus' }))
  assert.equal(statusLineCommand(root, home), 'user-line')
  write(join(root, '.claude/settings.local.json'), JSON.stringify({ statusLine: { type: 'command', command: 'local-line' } }))
  assert.equal(statusLineCommand(root, home), 'local-line')
})

test('only Claude roles get settings: no prompt suggestions, and the context status line forwarding the configured one', t => {
  const { home, write } = temporary(t)
  const r = { home, packageRoot: '/pkg' }
  const m = { root: join(home, 'repo') }
  // Codex gets no --settings, only its trust override (see activity.node.mjs).
  assert.equal(roleSettings(r, m, AGENTS.codex, '/wt').includes('--settings'), false)
  write(join(home, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command: "mine 'x'" } }))
  const [flag, settings] = roleSettings(r, m, AGENTS.claude, '/wt')
  assert.equal(flag, '--settings')
  assert.equal(JSON.parse(settings).promptSuggestionEnabled, false)
  const { type, command } = JSON.parse(settings).statusLine
  assert.equal(type, 'command')
  assert.equal(command, shellOf([process.execPath, '/pkg/dist/cli.js', 'statusline', '/wt/.troupe/context.json', "mine 'x'"]))
})
