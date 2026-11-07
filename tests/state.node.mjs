// The run log (dist/log.js) and the live reads (dist/state.js).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { append, fold, isApproved, logPath, readLog } from '../dist/log.js'
import { paneOf, planHash, readResult, resultOf, roleState, waitingOn, workOf } from '../dist/state.js'
import { pairsOf, parseDiff, wordDiff } from '../dist/diff.js'
import { run } from '../dist/run.js'

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
  writeFileSync(join(wt, 'src/a.ts'), 'a\nb\n')
  const work = workOf(wt, base, ['src/'])
  assert.deepEqual(work.commits.map(c => c.subject), ['add a'])
  assert.deepEqual(work.changed, ['README.md', 'src/a.ts'])
  assert.deepEqual(work.outside, ['README.md'])
  // Each file's hunks against base, in the same order: the untracked one read whole, the committed one with its edit on top.
  assert.deepEqual(work.files.map(f => [f.path, f.status, f.add, f.del, !!f.untracked]), [['README.md', 'A', 1, 0, true], ['src/a.ts', 'A', 2, 0, false]])
  assert.deepEqual(work.files[1].hunks[0].lines.map(l => `${l.sign}${l.new}:${l.text}`), ['+1:a', '+2:b'])
  // A diff that cannot be read leaves the commits and files standing.
  const failing = (command, args, options) => (args.includes('--no-ext-diff') ? { code: 1, out: '', err: 'diff exploded' } : run(command, args, options))
  const partial = workOf(wt, base, ['src/'], failing)
  assert.deepEqual(partial.changed, ['README.md', 'src/a.ts'])
  assert.equal(partial.files, undefined)
  assert.equal(partial.diffProblem, 'diff exploded')
})

test('a diff parsed per file: status, counts, line numbers on both sides, binary and mode-only files', () => {
  const text = [
    'diff --git a/src/x.ts b/src/x.ts', 'index 1..2 100644', '--- a/src/x.ts', '+++ b/src/x.ts',
    '@@ -10,4 +10,5 @@ export const x', ' keep', '-const ttl = 30 * DAY', '+const ttl = 14 * DAY', '+const grace = 10', ' end', '-- a removed SQL comment', '\\ No newline at end of file',
    'diff --git a/gone.ts b/gone.ts', 'deleted file mode 100644', '--- a/gone.ts', '+++ /dev/null', '@@ -1 +0,0 @@', '-bye',
    'diff --git a/logo.png b/logo.png', 'new file mode 100644', 'Binary files /dev/null and b/logo.png differ',
    'diff --git a/run.sh b/run.sh', 'old mode 100644', 'new mode 100755', '',
  ].join('\n')
  const files = parseDiff(text)
  assert.deepEqual(files.map(f => [f.path, f.status, f.add, f.del, !!f.binary, f.hunks.length]), [['src/x.ts', 'M', 2, 2, false, 1], ['gone.ts', 'D', 0, 1, false, 1], ['logo.png', 'A', 0, 0, true, 0], ['run.sh', 'M', 0, 0, false, 0]])
  const lines = files[0].hunks[0].lines
  assert.deepEqual(lines.map(l => `${l.sign}${l.old ?? ''}/${l.new ?? ''}`), [' 10/10', '-11/', '+/11', '+/12', ' 12/13', '-13/'])
  assert.equal(lines.at(-1).text, '- a removed SQL comment', 'a removed line that starts with -- is still a line')
  assert.equal(files[0].hunks[0].head, '@@ -10,4 +10,5 @@ export const x')
})

test('word diff: a removed line pairs with the added line in its place; only the changed words are marked', () => {
  const lines = [[' ', 'keep'], ['-', 'const ttl = 30'], ['-', 'const grace = 0'], ['+', 'const ttl = 14'], [' ', 'keep'], ['-', 'return issue(token.userId)'], ['+', 'await store.markUsed(token.id)'], ['+', 'return issue(token.userId, { family })']].map(([sign, text]) => ({ sign, text }))
  assert.deepEqual([...pairsOf(lines)], [[1, 3], [5, 7]], 'each removed line pairs with the added line like it, past an inserted one; the rest stand alone')
  const [before, after] = wordDiff('const TTL = 30 * DAY', 'const TTL = 14 * DAY')
  assert.deepEqual(before.filter(p => p.changed).map(p => p.text), ['30'])
  assert.deepEqual(after.filter(p => p.changed).map(p => p.text), ['14'])
  assert.equal(after.map(p => p.text).join(''), 'const TTL = 14 * DAY')
  const [, grown] = wordDiff('  return issue(token.userId)', '  return issue(token.userId, { family: token.family })')
  assert.deepEqual(grown.filter(p => p.changed).map(p => p.text), [', { family: token.family }'])
  assert.equal(wordDiff('if (!res.ok) return signOut()', 'throw new RefreshError(status, body, headers)'), undefined, 'lines that share little are not marked word by word')
  assert.equal(wordDiff('x'.repeat(10) + ' y'.repeat(300), 'z' + ' y'.repeat(300)), undefined, 'too long to compare')
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

test('teardown is a readable terminal lifecycle event and closes folded role records', () => {
  const events = [
    { ev: 'dispatch', role: 'api', session: '$1', window: '@1', pane: '%1', worktree: '/scratch', branch: 'role/m/api', base: 'abc', argv: ['fake'], at: '2026-01-01', by: 'cli' },
    { ev: 'teardown', at: '2026-01-02', by: 'cli' },
  ]
  const state = fold(events)
  assert.equal(state.finished, true)
  assert.equal(state.stage, 'teardown')
  assert.equal(state.roles.get('api').closed, true)
})
