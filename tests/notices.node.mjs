import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import { recordActivity } from '../dist/activity.js'
import { AGENTS } from '../dist/agents.js'
import { append, readLog } from '../dist/log.js'
import { agentSession, callerTarget, deliverNotices, pendingNotices } from '../dist/notices.js'
import { claudeSessionTurn } from '../dist/usage.js'

const temporary = t => {
  const home = mkdtempSync(join(tmpdir(), 'troupe-notices-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); return path }
  return { home, write }
}
const jsonl = rows => rows.map(row => `${JSON.stringify(row)}\n`).join('')
// ps rows above pid 100: 100 → 90 (bash) → 80 (claude or codex) → 70 (herdr) → 1
const psRun = names => (command, args) => {
  if (command !== 'ps') return { code: 1, out: '', err: '' }
  const pid = Number(args.at(-1))
  const parent = { 100: [90, 'bash'], 90: [80, names[80] ?? 'claude'], 80: [70, names[70] ?? 'herdr'], 70: [1, 'init'] }[pid]
  return parent ? { code: 0, out: `${parent[0]} ${parent[1]}\n`, err: '' } : { code: 1, out: '', err: '' }
}

test('the orchestrator is the agent session this command really runs under, not stale variables', () => {
  const r = env => ({ pid: 100, env, run: psRun({}) })
  assert.deepEqual(agentSession(r({ CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_PID: '80' })), { harness: 'claude', session: 's1' })
  // A tmux server started from an old Claude shell hands its variables to every pane; that Claude is no ancestor.
  assert.equal(agentSession(r({ CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_PID: '4242' })), undefined)
  assert.deepEqual(agentSession({ pid: 100, env: { CODEX_THREAD_ID: 't1' }, run: psRun({ 80: 'codex' }) }), { harness: 'codex', session: 't1' })
  assert.equal(agentSession({ pid: 100, env: { CODEX_THREAD_ID: 't1' }, run: psRun({}) }), undefined)
  // Codex started from inside Claude: the nearer agent runs the command.
  assert.deepEqual(agentSession({ pid: 100, env: { CODEX_THREAD_ID: 't1', CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_PID: '70' }, run: psRun({ 80: 'codex', 70: 'claude' }) }), { harness: 'codex', session: 't1' })
  assert.deepEqual(callerTarget({ env: { TMUX: 'x', TMUX_PANE: '%7' }, run: () => ({ code: 0, out: '', err: '' }) }), { mux: 'tmux', pane: '%7' })
  assert.deepEqual(callerTarget({ pid: 100, env: { HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p4' }, run: () => ({ code: 1, out: '', err: '' }) }), { mux: 'herdr', pane: 'w1:p4' })
})

test('a Claude session turn comes from its transcript: prompts and tool results run it, turn_duration or an interrupt ends it', t => {
  const { home, write } = temporary(t)
  const path = write(join(home, '.claude/projects/-some-dir/s1.jsonl'), '')
  const at = s => `2026-10-26T12:00:${String(s).padStart(2, '0')}Z`
  const prompt = (s, content) => ({ type: 'user', timestamp: at(s), message: { role: 'user', content } })
  const cases = [
    [[prompt(1, 'do it')], 'busy'],
    [[prompt(1, 'do it'), { type: 'assistant', timestamp: at(2), message: {} }], 'busy'],
    [[prompt(1, 'do it'), { type: 'system', subtype: 'turn_duration', timestamp: at(3) }], 'ready'],
    [[prompt(1, 'do it'), { type: 'system', subtype: 'turn_duration', timestamp: at(3) }, prompt(4, '<command-name>/context</command-name>'), prompt(5, '<local-command-stdout>x</local-command-stdout>'), { type: 'system', subtype: 'away_summary', timestamp: at(6) }], 'ready'],
    [[prompt(1, 'do it'), prompt(2, [{ type: 'tool_result', content: 'ok' }])], 'busy'],
    [[prompt(1, 'do it'), prompt(2, [{ type: 'tool_result', content: 'no' }]), prompt(3, [{ type: 'text', text: '[Request interrupted by user for tool use]' }])], 'ready'],
    [[prompt(1, 'do it'), { type: 'system', subtype: 'turn_duration', timestamp: at(3) }, prompt(4, '<task-notification>done</task-notification>')], 'busy'],
  ]
  for (const [rows, want] of cases) {
    writeFileSync(path, jsonl(rows))
    assert.equal(claudeSessionTurn('s1', home)?.turn, want, JSON.stringify(rows.at(-1)))
  }
  assert.equal(claudeSessionTurn('missing', home), undefined)
})

test('notices reach the orchestrator once each, only after it has finished a turn since the last one', t => {
  const { home, write } = temporary(t)
  const log = join(home, 'repo/.git/troupe/m1/log.jsonl')
  const worktree = join(home, 'repo/.troupe/worktrees/m1/api')
  const transcript = join(home, '.claude/projects/-repo/orch.jsonl')
  const typed = []
  let now = Date.parse('2026-10-26T12:00:00Z')
  const r = { home, env: {}, now: () => now, run: (command, args) => {
    if (command === 'herdr') { if (args[1] === 'run') typed.push(args[3]); return { code: 0, out: '', err: '' } }
    return { code: 1, out: '', err: '' }
  } }
  const m = { name: 'm1', log, hash: 'h', agents: { claude: AGENTS.claude } }
  const stamp = s => new Date(Date.parse('2026-10-26T12:00:00Z') + s * 1000)
  const turnEnded = s => write(transcript, jsonl([{ type: 'user', timestamp: stamp(s - 1).toISOString(), message: { role: 'user', content: 'go' } }, { type: 'system', subtype: 'turn_duration', timestamp: stamp(s).toISOString() }]))
  append(log, 'cli', { ev: 'orchestrator', harness: 'claude', session: 'orch', mux: 'herdr', pane: 'w1:p4' }, stamp(1))
  append(log, 'cli', { ev: 'dispatch', role: 'api', session: '$1', window: '@1', pane: '%1', worktree, branch: 'role/m1/api', base: 'abc', argv: ['claude'], agent: 'claude' }, stamp(2))
  write(join(worktree, '.troupe/result.md'), '---\nstatus: done\nsummary: built it\n---\n')
  // The role has written its result but its agent has not reported the turn over: nothing yet.
  turnEnded(3)
  deliverNotices(r, m)
  assert.deepEqual(typed, [])
  write(join(worktree, '.troupe/activity.json'), JSON.stringify({ turn: 'ready', at: stamp(4).toISOString() }))
  // A gate answered in the panel, before the role finished: the oldest goes first, one per call.
  append(log, 'panel', { ev: 'gate-answer', gate: 'mr-ok', answer: 'approve' }, stamp(3))
  deliverNotices(r, m)
  assert.equal(typed.length, 1)
  assert.match(typed[0], /^mr-ok approved in the panel\. Open the PR/)
  // The orchestrator has not finished a turn since that line: the role's notice waits.
  deliverNotices(r, m)
  assert.equal(typed.length, 1)
  turnEnded(Math.ceil((Date.now() - Date.parse('2026-10-26T12:00:00Z')) / 1000) + 60)
  deliverNotices(r, m)
  assert.equal(typed.length, 2)
  assert.match(typed[1], /^Role api finished: done: built it\. Its result is .*\.troupe\/result\.md\.$/)
  // Everything said is logged; nothing repeats, even from a new panel process.
  turnEnded(Math.ceil((Date.now() - Date.parse('2026-10-26T12:00:00Z')) / 1000) + 120)
  deliverNotices(r, m)
  assert.equal(typed.length, 2)
  assert.deepEqual(readLog(log).events.filter(e => e.ev === 'notice').map(e => e.key.split(':')[0]), ['gate', 'role'])
  // A changed result is news again.
  write(join(worktree, '.troupe/result.md'), '---\nstatus: blocked\nsummary: needs a key\n---\n')
  deliverNotices(r, m)
  assert.match(typed[2], /^Role api finished: blocked: needs a key/)
})

const answerSetup = (t, role) => {
  const { home, write } = temporary(t)
  const log = join(home, 'repo/.git/troupe/m1/log.jsonl')
  const worktree = join(home, `repo/.troupe/worktrees/m1/${role}`)
  const activity = join(worktree, '.troupe/activity.json')
  const m = { name: 'm1', log, hash: 'h', agents: { claude: AGENTS.claude } }
  const r = { home, env: {}, run: () => ({ code: 1, out: '', err: '' }) }
  const stamp = s => new Date(Date.parse('2026-10-26T12:00:00Z') + s * 1000).toISOString()
  // A new panel process each time: everything comes from the run log and the role's files.
  const pending = () => pendingNotices(r, m, readLog(log).events, stamp(1))
  const keys = () => pending().map(one => one.key)
  const tell = () => { const next = pending()[0]; append(log, 'panel', { ev: 'notice', key: next.key, text: next.text }); return next }
  const hooks = (...rows) => { mkdirSync(dirname(activity), { recursive: true }); for (const [event, s] of rows) recordActivity(JSON.stringify({ hook_event_name: event, session_id: `${role}-s` }), activity, new Date(stamp(s)), home) }
  const result = (text, s) => { const path = write(join(worktree, '.troupe/result.md'), text); utimesSync(path, new Date(stamp(s)), new Date(stamp(s))) }
  append(log, 'cli', { ev: 'orchestrator', harness: 'claude', session: 'orch', mux: 'herdr', pane: 'w1:p4' }, new Date(stamp(1)))
  append(log, 'cli', { ev: 'dispatch', role, session: '$1', window: '@1', pane: '%1', worktree, branch: `role/m1/${role}`, base: 'abc', argv: ['claude'], agent: 'claude' }, new Date(stamp(2)))
  return { home, write, log, worktree, stamp, pending, keys, tell, hooks, result }
}

test('every wait answered in the role window is told once, oldest first, even after it waits again', t => {
  const { stamp, pending, keys, tell, hooks } = answerSetup(t, 'review')
  hooks(['UserPromptSubmit', 3], ['PermissionRequest', 4])
  assert.deepEqual(pending(), [])
  hooks(['PostToolBatch', 5])
  assert.deepEqual(pending(), [{ key: `answer:review:${stamp(5)}`, text: 'Role review was answered in its window and went on working.' }])
  // Not yet told (the orchestrator is busy); it waits again and is answered again: both stay to be told.
  hooks(['PermissionRequest', 6])
  assert.deepEqual(keys(), [`answer:review:${stamp(5)}`])
  hooks(['PostToolBatch', 7])
  assert.deepEqual(keys(), [`answer:review:${stamp(5)}`, `answer:review:${stamp(7)}`])
  tell()
  assert.deepEqual(keys(), [`answer:review:${stamp(7)}`])
  tell()
  hooks(['PostToolBatch', 8], ['Stop', 9])
  assert.deepEqual(pending(), [])
})

test('a deny or Esc that ends the turn with no result wakes the orchestrator', t => {
  const { write, home, stamp, pending, hooks } = answerSetup(t, 'wake')
  hooks(['UserPromptSubmit', 3], ['PermissionRequest', 4])
  const row = (s, content) => `${JSON.stringify({ type: 'user', timestamp: stamp(s), message: { role: 'user', content } })}\n`
  write(join(home, '.claude/projects/-wt/wake-s.jsonl'), row(3, 'go') + row(6, [{ type: 'text', text: '[Request interrupted by user for tool use]' }]))
  assert.deepEqual(pending(), [{ key: `answer:wake:${stamp(6)}`, text: 'Role wake was stopped in its window: its dialog was denied or interrupted, and its turn ended.' }])
  // The person's next prompt keeps that same answer, so it is neither lost nor said twice.
  hooks(['UserPromptSubmit', 20])
  assert.deepEqual(pending().map(one => one.key), [`answer:wake:${stamp(6)}`])
})

test('an answer a finish has superseded is not replayed when later work is sent', t => {
  const { log, stamp, keys, tell, hooks, result } = answerSetup(t, 'wake')
  hooks(['UserPromptSubmit', 3], ['PermissionRequest', 4], ['PostToolBatch', 5])
  result('---\nstatus: done\nsummary: built it\n---\n', 6)
  hooks(['Stop', 7])
  // The result is newer than the answer: the finish tells it.
  assert.deepEqual(keys().map(key => key.split(':')[0]), ['role'])
  tell()
  // troupe send moves the result aside and starts the next turn; the old answer stays old news.
  append(log, 'cli', { ev: 'send', role: 'wake', text: 'next' }, new Date(stamp(8)))
  hooks(['UserPromptSubmit', 9])
  assert.deepEqual(keys(), [])
  // So is an answer superseded only by work sent since, its finish never told.
  hooks(['PermissionRequest', 10], ['PostToolBatch', 11])
  assert.deepEqual(keys(), [`answer:wake:${stamp(11)}`])
  append(log, 'cli', { ev: 'send', role: 'wake', text: 'more' }, new Date(stamp(12)))
  assert.deepEqual(keys(), [])
})
