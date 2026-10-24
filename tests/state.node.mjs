// The run log (dist/log.js) and the live reads (dist/state.js).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { append, fold, isApproved, logPath, readLog } from '../dist/log.js'
import { paneOf, planHash, readResult, resultOf, roleState, waitingOn, workOf } from '../dist/state.js'

const temp = () => mkdtempSync(join(tmpdir(), 'troupe-state-'))

test('the log appends stamped events and folds them into stage, gates, roles and the approval', () => {
  const path = logPath(temp(), 'm1')
  const at = new Date('2026-10-24T10:00:00Z')
  append(path, 'cli', { ev: 'gate-open', gate: 'plan', plan: 'sha256:a' }, at)
  append(path, 'panel', { ev: 'gate-answer', gate: 'plan', answer: 'approve', plan: 'sha256:a' }, at)
  append(path, 'orch', { ev: 'stage', stage: 'build' }, at)
  const dispatch = { role: 'api', session: 's', window: '@1', pane: '%1', worktree: '/w', branch: 'role/m1/api', base: 'abc', argv: ['codex', 'go'] }
  append(path, 'cli', { ev: 'dispatch', ...dispatch }, at)
  append(path, 'cli', { ev: 'send', role: 'api', text: 'fix it' }, at)
  append(path, 'orch', { ev: 'gate-open', gate: 'mr-ok', ask: 'Open the MR?' }, at)
  appendFileSync(path, '{"torn": \n')

  const { events, unread } = readLog(path)
  assert.equal(events.length, 6)
  assert.equal(unread, 1)
  assert.deepEqual(events[0], { at: '2026-10-24T10:00:00.000Z', by: 'cli', ev: 'gate-open', gate: 'plan', plan: 'sha256:a' })
  const folded = fold(events)
  assert.equal(folded.stage, 'build')
  assert.equal(folded.roles.get('api')?.pane, '%1')
  assert.equal(folded.roles.get('api')?.sends, 1)
  assert.equal(folded.gates.get('mr-ok')?.answer, undefined)
  assert.equal(folded.gates.get('plan')?.answer, 'approve')
  assert.ok(isApproved(folded, 'sha256:a'))
  assert.ok(!isApproved(folded, 'sha256:b'), 'a changed plan asks again')
})

test('a change at the plan gate withdraws the approval; a reopened gate starts unanswered', () => {
  const ev = (e, by = 'panel') => ({ at: 't', by, ...e })
  const folded = fold([
    ev({ ev: 'gate-answer', gate: 'plan', answer: 'approve', plan: 'sha256:a' }),
    ev({ ev: 'gate-answer', gate: 'plan', answer: 'change', text: 'smaller', plan: 'sha256:a' }),
    ev({ ev: 'gate-open', gate: 'mr-ok', ask: 'one' }, 'orch'),
    ev({ ev: 'gate-answer', gate: 'mr-ok', answer: 'change', text: 'fix first' }),
    ev({ ev: 'gate-open', gate: 'mr-ok', ask: 'two' }, 'orch'),
    ev({ ev: 'close', role: 'nobody' }, 'cli'),
  ])
  assert.ok(!isApproved(folded, 'sha256:a'))
  assert.deepEqual(folded.gates.get('mr-ok'), { id: 'mr-ok', ask: 'two', openedAt: 't' })
  assert.equal(readLog(join(temp(), 'none.jsonl')).events.length, 0)
})

test('the plan hash covers the plan bytes and each referenced text', () => {
  const base = planHash('plan')
  assert.match(base, /^sha256:[0-9a-f]{64}$/)
  assert.notEqual(planHash('plan '), base)
  const texts = [{ ref: 'docs/a.md', bytes: 'A' }]
  assert.notEqual(planHash('plan', texts), base)
  assert.notEqual(planHash('plan', [{ ref: 'docs/a.md', bytes: 'B' }]), planHash('plan', texts))
  assert.notEqual(planHash('plan', [{ ref: 'docs/a.md', bytes: undefined }]), planHash('plan', [{ ref: 'docs/a.md', bytes: '' }]))
})

test('the result file: front matter status and summary, then free text', () => {
  assert.deepEqual(resultOf('---\nstatus: done\nsummary: "14 tests pass"\n---\nWhat changed.\n'), { status: 'done', summary: '14 tests pass', body: 'What changed.' })
  assert.equal(resultOf('---\nstatus: maybe\n---\n').problem, 'status "maybe" is not done, blocked or failed')
  assert.equal(resultOf('just text').problem, 'no front matter')
  assert.match(resultOf('---\nsummary: a: b\n---\n').problem ?? '', /line 2/)
  const wt = temp()
  assert.equal(readResult(wt), undefined)
  mkdirSync(join(wt, '.troupe'))
  writeFileSync(join(wt, '.troupe/result.md'), '---\nstatus: blocked\n---\nNeeds a key.')
  assert.equal(readResult(wt)?.status, 'blocked')
})

test("a role's work: commits since base, changed files, and those outside its touches", () => {
  const wt = temp()
  const git = (...args) => execFileSync('git', args, { cwd: wt, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base')
  const base = git('rev-parse', 'HEAD').trim()
  mkdirSync(join(wt, 'src'))
  writeFileSync(join(wt, 'src/a.ts'), 'a')
  git('add', '.')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'add a')
  writeFileSync(join(wt, 'README.md'), 'loose')
  const work = workOf(wt, base, ['src/'])
  assert.deepEqual(work.commits.map(c => c.subject), ['add a'])
  assert.deepEqual(work.changed, ['README.md', 'src/a.ts'])
  assert.deepEqual(work.outside, ['README.md'])
})

test('role state: planned, closed, the result first, gone, then the screen', () => {
  const live = { alive: true, dead: false, screen: '' }
  const done = { status: 'done', summary: '', body: '' }
  assert.equal(roleState({ opened: false }), 'planned')
  assert.equal(roleState({ opened: true, closed: true, result: done }), 'closed')
  assert.equal(roleState({ opened: true, result: done, pane: live, screen: 'ready' }), 'done')
  assert.equal(roleState({ opened: true, pane: { ...live, dead: true } }), 'gone')
  assert.equal(roleState({ opened: true }), 'gone')
  assert.equal(roleState({ opened: true, pane: live, screen: 'ready' }), 'idle')
  assert.equal(roleState({ opened: true, pane: live, screen: 'waits' }), 'waits')
  assert.equal(roleState({ opened: true, pane: live }), 'unknown')
  const web = { name: 'web', dependsOn: ['api', 'store'] }
  assert.deepEqual(waitingOn(web, new Map([['api', 'done'], ['store', 'working']])), ['store'])
  assert.deepEqual(paneOf('%999999'), { alive: false, dead: false, screen: '' })
})
