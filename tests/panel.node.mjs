// bin/troupe-panel under plain Node (node --test tests/panel.node.mjs; check.sh
// runs it): its screen against the goldens at two widths, cut to the
// terminal, the command itself, and the git state rule on a real repository.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { frame } from '../hooks/ansi.ts'
import { gitFacts } from '../hooks/mission.ts'
import { GRAPH_50 } from './graph-goldens.ts'
import { DOCKED, VIEW_30 } from './mock-p1.ts'
import { P1 } from './p1.ts'

const ALL = Number.MAX_SAFE_INTEGER
const panel = new URL('../bin/troupe-panel', import.meta.url).pathname

test('at 110 columns the panel is the view golden, cell for cell, and its 30-row viewport as golden', () => {
  assert.deepEqual(frame(P1, 110, ALL, false).lines, DOCKED)
  assert.deepEqual(frame(P1, 110, 30, false).lines, VIEW_30)
})

test('at 50 columns: the stacked GRAPH golden under the header, then compact ROLES', () => {
  const lines = frame(P1, 50, ALL, false).lines
  assert.deepEqual(lines.slice(2, 2 + GRAPH_50.length), GRAPH_50)
  assert.ok(lines[2 + GRAPH_50.length + 1]?.startsWith('  ── ROLES · '))
})

test('it never draws past the terminal: at most its rows, no line wider than it', () => {
  for (const [width, rows] of [[30, 27], [63, 57], [79, 57], [117, 57], [110, 20]]) {
    const lines = frame(P1, width, rows, true).lines
    assert.ok(lines.length <= rows, `${width}x${rows}: ${lines.length} lines`)
    for (const line of frame(P1, width, rows, false).lines) assert.ok(line.length <= width, `${width}x${rows}: ${line}`)
  }
})

test('troupe-panel --once draws a mission folder and exits 0; in a terminal it scrolls on a key; a bad width is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'troupe-panel-'))
  try {
    copyFileSync(new URL('../templates/plan.md', import.meta.url), join(dir, 'plan.md'))
    const out = execFileSync(panel, [dir, '--once', '--plain', '--width', '60'], { encoding: 'utf8' })
    assert.match(out.split('\n')[0] ?? '', /^TROUPE · troupe-panel-/)
    // In a terminal: each line placed at its row by cursor address, autowrap off, no newline at all;
    // SIGTERM ends it with 0 (script -e passes the exit on).
    const screen = execFileSync('script', ['-qec', `stty cols 40 rows 12; timeout --preserve-status -s TERM 1 ${panel} ${dir}`, '/dev/null'], { encoding: 'utf8' })
    assert.ok(screen.includes('\x1b[?7l') && screen.includes('\x1b[12;1H') && !screen.includes('\x1b[13;1H'))
    // Each row is cleared before it is written, never after: that would erase the last column.
    assert.ok(screen.includes('\x1b[1;1H\x1b[2K') && !screen.includes('\x1b[K'))
    assert.ok(!/\n/.test(screen.slice(screen.indexOf('\x1b[?7l'), screen.lastIndexOf('\x1b[?7h'))))
    // Keys reach it: End scrolls to the last line, under the pinned header; mouse reports are asked for and given back.
    copyFileSync(new URL('../docs/missions/p2/plan.md', import.meta.url), join(dir, 'plan.md'))
    const keyed = execFileSync('sh', ['-c', `(sleep 0.8; printf '\\033[F'; sleep 0.8) | script -qec "stty cols 63 rows 20; timeout --preserve-status -s TERM 2 ${panel} ${dir}" /dev/null`], { encoding: 'utf8' })
    assert.match(keyed, /↑ \d+ more/)
    assert.ok(keyed.includes('no skills') && keyed.includes('\x1b[?1000h') && keyed.includes('\x1b[?1000l'))
    assert.ok(keyed.indexOf('\x1b[?1049h') < keyed.indexOf('\x1b[?1049l'))
    assert.throws(() => execFileSync(panel, [dir, '--width', '5'], { stdio: 'pipe' }), { status: 2 })
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('git state in a real repository whose local main lags origin/main: earlier missions do not count', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'troupe-git-'))
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
  const commit = subject => git('commit', '-q', '--allow-empty', '-m', subject)
  try {
    git('init', '-q', '-b', 'main')
    commit('init')
    const old = git('rev-parse', 'HEAD').trim()
    // An earlier mission's orders reached origin/main; the local main was never pulled.
    commit('o1: an earlier mission')
    commit('o2: an earlier mission')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    git('checkout', '-q', '-b', 'feature/NO-JIRA-p9')
    git('branch', '-f', 'main', old)
    commit('Add the p9 plan')
    git('checkout', '-q', '-b', 'order/p9/o2')
    commit('o2 work in progress')
    git('checkout', '-q', 'feature/NO-JIRA-p9')
    const run = async args => {
      try {
        return git(...args)
      } catch {
        return undefined
      }
    }
    assert.deepEqual(await gitFacts(run, 'p9', ['o1', 'o2']), { running: ['o2'], merged: [] })

    // o1 merged onto the mission branch and the branch pushed: origin's copy is not "another branch".
    commit('o1: the p9 order')
    git('update-ref', 'refs/remotes/origin/feature/NO-JIRA-p9', 'HEAD')
    git('update-ref', 'refs/remotes/origin/order/p9/o2', 'order/p9/o2')
    assert.deepEqual(await gitFacts(run, 'p9', ['o1', 'o2']), { running: ['o2'], merged: ['o1'] })
  } finally {
    rmSync(repo, { recursive: true })
  }
})
