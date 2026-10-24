// The panel's screen (dist/draw.js) from a mock mission, against goldens at
// 96 columns. UPDATE_GOLDENS=1 npm test writes them anew; read the diff.
process.env.TZ = 'UTC'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { textOf } from '../dist/canvas.js'
import { draw } from '../dist/draw.js'
import { fold } from '../dist/log.js'
import { decisionsOf, modelOf } from '../dist/model.js'
import { readPlan } from '../dist/plan.js'
import { DEFAULT_STAGES, readStages } from '../dist/stages.js'

const here = path => fileURLToPath(new URL(path, import.meta.url))
const PLAN = readFileSync(here('fixtures/auth-refresh/plan.md'), 'utf8')
const HASH = 'sha256:3f9a0c1e'
const at = minute => `2026-10-24T${minute}:00.000Z`
const DISPATCH = { session: 'troupe', window: '@2', base: '9c1e2f0', argv: [] }
const APPROVED = [
  { at: at('10:41'), by: 'cli', ev: 'gate-open', gate: 'plan', plan: HASH },
  { at: at('10:42'), by: 'panel', ev: 'gate-answer', gate: 'plan', answer: 'approve', plan: HASH },
  { at: at('10:42'), by: 'orch', ev: 'stage', stage: 'build' },
  { at: at('12:07'), by: 'cli', ev: 'dispatch', role: 'api', pane: '%31', worktree: '/w/api', branch: 'role/auth-refresh/api', ...DISPATCH },
  { at: at('12:07'), by: 'cli', ev: 'dispatch', role: 'store', pane: '%32', worktree: '/w/store', branch: 'role/auth-refresh/store', ...DISPATCH },
]
const TRUST = ['', '  Trust this folder?', '  /Users/me/app/.troupe/worktrees/auth-refresh/api', '', '› 1. Trust and continue', '  2. Exit', '', '  Press enter to confirm']
const BUILDING = new Map([
  ['api', { state: 'waits', waitsOn: 'Trust this folder?', screen: TRUST, work: { commits: [], changed: [], outside: [] } }],
  [
    'store',
    {
      state: 'working',
      screen: ['● Adding the used flag to the token table', '  ⎿  migrations/0042_token_family.sql', '', '✻ Working… (esc to interrupt)'],
      work: { commits: [{ sha: 'a1b2c3d', subject: 'Add token families' }], changed: ['migrations/0042_token_family.sql', 'src/store/tokens.ts'], outside: [] },
    },
  ],
])

const model = (log, live, stages = DEFAULT_STAGES) =>
  modelOf({ mission: 'auth-refresh', planPath: 'docs/missions/auth-refresh/plan.md', planText: PLAN, plan: readPlan(PLAN), hash: HASH, folded: fold(log), log, live, stages, now: new Date(at('12:07')) })
const plain = drawn => drawn.lines.map(line => textOf(line).trimEnd())
const golden = (name, lines) => {
  const path = here(`goldens/${name}.txt`)
  if (process.env.UPDATE_GOLDENS === '1') writeFileSync(path, `${lines.join('\n')}\n`)
  assert.deepEqual(lines, readFileSync(path, 'utf8').replace(/\n$/, '').split('\n'))
}

test('the build, api selected: a waiting role in the strip, the flow, its detail and live screen', () => {
  const lines = plain(draw(model(APPROVED, BUILDING), { tab: 1, selected: 'api' }, 96, 58))
  golden('build-api', lines)
  assert.ok(lines.every(line => line.length <= 96))
  assert.match(lines[0], /auth-refresh {2}· {2}Build .*◆ 1 needs you {2}· {2}12:07$/)
})

test('the plan gate: goal, why, done when, each role with its flags, start and touches; the decision', () => {
  const log = APPROVED.slice(0, 1)
  const lines = plain(draw(model(log, new Map()), { tab: 1, selected: 'api' }, 96, 58))
  golden('plan-gate', lines)
  assert.ok(lines.some(line => line.includes('-a on-request -s workspace-write')))
  assert.ok(lines.some(line => line.includes('Decision 1  Grace period for a token used twice?') && line.includes('recommended: 10 s')))
})

test('a changed plan opens the plan gate again; another gate shows its question', () => {
  const changed = modelOf({ ...model(APPROVED, new Map()), mission: 'auth-refresh', planPath: 'p', planText: PLAN, plan: readPlan(PLAN), hash: 'sha256:other', folded: fold(APPROVED), log: APPROVED, live: new Map(), stages: DEFAULT_STAGES, now: new Date(at('12:07')) })
  assert.equal(changed.gate?.isPlan, true)
  assert.equal(changed.stage?.label, 'Plan OK?')
  const asked = [...APPROVED, { at: at('12:30'), by: 'orch', ev: 'gate-open', gate: 'mr-ok', ask: 'Open the MR for auth-refresh? One finding left.' }]
  const m = model(asked, BUILDING)
  assert.deepEqual(m.gate, { id: 'mr-ok', label: 'MR OK?', ask: 'Open the MR for auth-refresh? One finding left.', isPlan: false })
  const lines = plain(draw(m, { tab: 1, selected: 'store' }, 96, 40))
  assert.ok(lines.some(line => line.includes('◆ MR OK?')))
  assert.ok(lines.some(line => line.includes('Open the MR for auth-refresh? One finding left.')))
})

test('stages: done with the answer time, now, groups counted, gates ahead', () => {
  const m = model(APPROVED, BUILDING)
  assert.deepEqual(
    m.stages.map(stage => `${stage.mark} ${stage.label} ${stage.note}`.trim()),
    ['done Plan', 'done Plan OK? 10:42', 'now Build 0/3', 'todo Review 0/1', 'gate MR OK?', 'todo Open MR', 'todo Done'],
  )
  const read = readStages(readFileSync(here('../skills/troupe-mission/stages.yaml'), 'utf8'))
  assert.deepEqual(read.problems, [])
  assert.deepEqual(read.stages, DEFAULT_STAGES)
  assert.deepEqual(readStages('stages:\n  - id: a\n  - id: a\n').problems, ['duplicate stage id: a', 'the first gate must be `gate: plan`: dispatch waits for it'])
})

test('clicks: tabs, role rows and boxes, and the gate buttons are targets', () => {
  const { hits } = draw(model(APPROVED, BUILDING), { tab: 1, selected: 'api' }, 96, 58)
  const find = predicate => hits.find(one => predicate(one.target))
  assert.deepEqual(find(t => t.kind === 'tab' && t.tab === 3) && { row: 1, col: 26 }, { row: 1, col: 26 })
  assert.ok(hits.filter(one => one.target.kind === 'role' && one.target.name === 'store').length >= 2, 'a row and a box')
  const gate = draw(model(APPROVED.slice(0, 1), new Map()), { tab: 1, selected: 'api' }, 96, 58).hits
  assert.ok(gate.some(one => one.target.kind === 'key' && one.target.key === 'a'))
})

test('the other tabs: roles table, plan, log, diff; and the input line', () => {
  const m = model(APPROVED, BUILDING)
  const tab = (n, selected = 'store') => plain(draw(m, { tab: n, selected }, 96, 30))
  assert.ok(tab(2).some(line => /^ api {6}◆ waits on you/.test(line)))
  assert.ok(tab(3).some(line => line.includes('# auth-refresh: rotate refresh tokens')))
  assert.ok(tab(4).some(line => line.includes('gate-answer')))
  assert.ok(tab(5).some(line => line.includes('✓ src/store/tokens.ts')))
  const typing = plain(draw(m, { tab: 1, selected: 'store', input: { label: 'send to store', text: 'also add a test' } }, 96, 30))
  assert.equal(typing[28], ' send to store › also add a test▏')
  assert.deepEqual(decisionsOf(PLAN), [{ n: '1', ask: 'Grace period for a token used twice?', recommended: '10 s' }])
})
