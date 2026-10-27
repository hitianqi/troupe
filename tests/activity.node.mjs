import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import { ACTIVITY_EVENTS, claudeActivity, claudeTurn, recordActivity } from '../dist/activity.js'
import { AGENTS } from '../dist/agents.js'
import { roleSettings, turnOf } from '../dist/role-commands.js'
import { shellOf } from '../dist/run.js'
import { codexTurn } from '../dist/usage.js'

const temporary = t => {
  const home = mkdtempSync(join(tmpdir(), 'troupe-activity-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); return path }
  return { home, write }
}
const hook = (event, extra = {}) => JSON.stringify({ hook_event_name: event, session_id: 's1', ...extra })
const READY = '❯ '
const APPROVAL = 'Do you want to proceed?\n❯ 1. Yes'

test('Claude hook events record the turn; anything else changes nothing', t => {
  const { home } = temporary(t)
  const file = join(home, 'activity.json')
  const turn = () => JSON.parse(readFileSync(file, 'utf8')).turn
  recordActivity(hook('UserPromptSubmit'), file)
  assert.equal(turn(), 'busy')
  recordActivity(hook('Stop'), file)
  assert.equal(turn(), 'ready')
  recordActivity(hook('PermissionRequest', { tool_name: 'Write' }), file)
  assert.equal(turn(), 'waits')
  for (const ignored of [hook('Notification', { notification_type: 'permission_prompt' }), hook('PostToolUse'), hook('SessionStart'), 'not json', '[]']) {
    recordActivity(ignored, file)
    assert.equal(turn(), 'waits', ignored)
  }
  recordActivity(hook('PostToolBatch'), file)
  assert.equal(turn(), 'busy')
  recordActivity(hook('Notification', { notification_type: 'idle_prompt' }), file)
  assert.equal(turn(), 'ready')
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8'))), ['turn', 'event', 'session', 'at', 'answers'])
})

test('every wait keeps how it ended through later hooks: a tool batch went on, anything else after it stopped it', t => {
  const { home } = temporary(t)
  const worktree = join(home, 'wt')
  const file = join(worktree, '.troupe/activity.json')
  mkdirSync(dirname(file), { recursive: true })
  const at = s => new Date(Date.parse('2026-10-26T12:00:00Z') + s * 1000)
  const record = (event, s) => recordActivity(hook(event), file, at(s), home)
  const answers = () => claudeActivity(worktree, undefined).answers
  record('UserPromptSubmit', 1)
  record('PostToolBatch', 2)
  assert.deepEqual(answers(), [])
  record('PermissionRequest', 3)
  // Two approvals in one batch end together.
  record('PermissionRequest', 4)
  record('PostToolBatch', 5)
  record('PermissionRequest', 6)
  record('PostToolBatch', 7)
  record('Stop', 8)
  assert.deepEqual(answers(), [{ at: at(5).toISOString(), then: 'working' }, { at: at(7).toISOString(), then: 'working' }])
  // Denied or interrupted: no hook until the next prompt; with no transcript row to date it, the prompt's time.
  record('UserPromptSubmit', 9)
  record('PermissionRequest', 10)
  record('UserPromptSubmit', 11)
  assert.deepEqual(answers().at(-1), { at: at(11).toISOString(), then: 'stopped' })
  assert.equal(answers().length, 3)
  assert.equal(claudeActivity(worktree, at(12).toISOString()), undefined)
})

test('a wait ends with the interrupt row a deny or Esc leaves in the transcript, kept when the next hook comes', t => {
  const { home, write } = temporary(t)
  const worktree = join(home, 'wt')
  const file = join(worktree, '.troupe/activity.json')
  const transcript = join(home, '.claude/projects/-wt/s1.jsonl')
  const row = (timestamp, content) => `${JSON.stringify({ type: 'user', timestamp, message: { role: 'user', content } })}\n`
  write(file, JSON.stringify({ turn: 'waits', session: 's1', at: '2026-10-26T12:00:05.000Z' }))
  assert.equal(claudeTurn(worktree, undefined, home), 'waits')
  write(transcript, row('2026-10-26T12:00:01Z', 'go') + row('2026-10-26T12:00:02Z', [{ type: 'text', text: '[Request interrupted by user]' }]))
  assert.equal(claudeTurn(worktree, undefined, home), 'waits')
  const interrupt = row('2026-10-26T12:00:09Z', [{ type: 'text', text: '[Request interrupted by user for tool use]' }])
  write(transcript, row('2026-10-26T12:00:01Z', 'go') + interrupt)
  assert.deepEqual(claudeActivity(worktree, undefined, home), { turn: 'ready', answers: [{ at: '2026-10-26T12:00:09.000Z', then: 'stopped' }] })
  assert.equal(turnOf({ home }, AGENTS.claude, { worktree }, APPROVAL), 'ready')
  // The next prompt is written to the transcript too; the wait's end is still the interrupt, as the panel saw it.
  write(transcript, row('2026-10-26T12:00:01Z', 'go') + interrupt + row('2026-10-26T12:01:00Z', 'try again'))
  recordActivity(hook('UserPromptSubmit', { session_id: 's1' }), file, new Date('2026-10-26T12:01:00Z'), home)
  assert.deepEqual(claudeActivity(worktree, undefined, home), { turn: 'busy', answers: [{ at: '2026-10-26T12:00:09.000Z', then: 'stopped' }] })
})

test('a Claude turn counts only if recorded since the role was dispatched', t => {
  const { home, write } = temporary(t)
  const at = '2026-10-26T12:00:00.000Z'
  assert.equal(claudeTurn(home, at), undefined)
  write(join(home, '.troupe/activity.json'), JSON.stringify({ turn: 'ready', at: '2026-10-26T11:59:59.000Z' }))
  assert.equal(claudeTurn(home, at), undefined)
  write(join(home, '.troupe/activity.json'), JSON.stringify({ turn: 'ready', at: '2026-10-26T12:00:01.000Z' }))
  assert.equal(claudeTurn(home, at), 'ready')
  write(join(home, '.troupe/activity.json'), JSON.stringify({ turn: 'maybe', at: '2026-10-26T12:00:01.000Z' }))
  assert.equal(claudeTurn(home, at), undefined)
})

test('a Codex turn comes from its session log: the latest top-level start and whether it ended', t => {
  const { home, write } = temporary(t)
  const cwd = join(home, 'wt')
  const event = (type, extra) => `${JSON.stringify({ timestamp: '2026-10-26T12:00:01Z', type: 'event_msg', payload: { type, ...extra } })}\n`
  const start = (id, parent = null) => event('task_started', { turn_attribution: { turn_id: id, parent_turn_id: parent } })
  const meta = `${JSON.stringify({ timestamp: '2026-10-26T12:00:00Z', type: 'session_meta', payload: { cwd, timestamp: '2026-10-26T12:00:00Z' } })}\n`
  const log = text => write(join(home, '.codex/sessions/2026/10/26/rollout-a.jsonl'), meta + text)
  const turn = () => codexTurn(cwd, '2026-10-26T11:00:00Z', home)
  log('')
  assert.equal(turn(), undefined)
  log(start('t1'))
  assert.equal(turn(), 'busy')
  log(start('t1') + event('task_complete', { turn_id: 't1' }))
  assert.equal(turn(), 'ready')
  log(start('t1') + event('task_complete', { turn_id: 't1' }) + start('t2'))
  assert.equal(turn(), 'busy')
  log(start('t2') + start('sub', 't2') + event('task_complete', { turn_id: 'sub' }))
  assert.equal(turn(), 'busy')
  log(start('t2') + event('turn_aborted', { turn_id: 't2', reason: 'interrupted' }))
  assert.equal(turn(), 'ready')
  assert.equal(codexTurn(cwd, '2026-10-26T13:00:00Z', home), undefined)
})

test('the reported turn decides ready; the screen only tells an approval from work, or stands in before any report', t => {
  const { home, write } = temporary(t)
  const r = { home }
  const opened = { worktree: home, at: '2026-10-26T12:00:00.000Z' }
  const report = turn => write(join(home, '.troupe/activity.json'), JSON.stringify({ turn, at: '2026-10-26T12:00:01.000Z' }))
  // No report yet: the screen is the fallback, but it never says ready; the role has a brief to start on.
  assert.equal(turnOf(r, AGENTS.claude, opened, READY), 'unknown')
  assert.equal(turnOf(r, AGENTS.claude, opened, 'esc to interrupt'), 'working')
  assert.equal(turnOf(r, AGENTS.claude, opened, 'Is this a project you created or one you trust?'), 'waits')
  report('busy')
  // Mid-turn with an empty prompt and no hint on screen (#41): still working, never ready.
  assert.equal(turnOf(r, AGENTS.claude, opened, READY), 'working')
  assert.equal(turnOf(r, AGENTS.claude, opened, APPROVAL), 'waits')
  // A reported wait needs no dialog on screen.
  report('waits')
  assert.equal(turnOf(r, AGENTS.claude, opened, 'esc to interrupt'), 'waits')
  report('ready')
  // A screen troupe cannot read does not hold back a role its agent says is ready.
  assert.equal(turnOf(r, AGENTS.claude, opened, '❯ something drawn differently'), 'ready')
  // An adapter with no report keeps the screen, ready included.
  assert.equal(turnOf(r, { ...AGENTS.claude, usage: undefined }, opened, 'esc to interrupt'), 'working')
  assert.equal(turnOf(r, { ...AGENTS.claude, usage: undefined }, { worktree: join(home, 'none') }, READY), 'ready')
})

test('Claude roles get the lifecycle hooks; Codex roles trust the main checkout for this run', t => {
  const { home } = temporary(t)
  const r = { home, packageRoot: '/pkg' }
  const m = { root: join(home, 'repo') }
  assert.deepEqual(roleSettings(r, m, AGENTS.codex, '/wt'), ['-c', `projects={"${m.root}"={trust_level="trusted"}}`])
  // One argv element, so no shell quoting; the key is a TOML basic string, dots and spaces included.
  assert.deepEqual(roleSettings(r, { root: '/home/a b/my.repo "x"' }, AGENTS.codex, '/wt'), ['-c', 'projects={"/home/a b/my.repo \\"x\\""={trust_level="trusted"}}'])
  assert.deepEqual(roleSettings(r, m, { ...AGENTS.codex, usage: undefined }, '/wt'), [])
  const { hooks } = JSON.parse(roleSettings(r, m, AGENTS.claude, '/wt')[1])
  assert.deepEqual(Object.keys(hooks), [...ACTIVITY_EVENTS])
  const record = shellOf([process.execPath, '/pkg/dist/cli.js', 'activity', '/wt/.troupe/activity.json'])
  for (const event of ACTIVITY_EVENTS) assert.deepEqual(hooks[event], [{ hooks: [{ type: 'command', command: record }] }])
})
