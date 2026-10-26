// The panel's screen (dist/draw.js) from a mock mission, against goldens at
// 96 columns. UPDATE_GOLDENS=1 npm test writes them anew; read the diff.
process.env.TZ = 'UTC'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { Canvas, cellsOf as widthOf, fit, paint, textOf, TONES, wrap } from '../dist/canvas.js'
import { draw, effortOf } from '../dist/draw.js'
import { fold } from '../dist/log.js'
import { decisionsOf, modelOf } from '../dist/model.js'
import { readPlan } from '../dist/plan.js'
import { AGENTS } from '../dist/agents.js'
import { hitAt, transition } from '../dist/panel-input.js'
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

test('the plan gate: goal, why, one line per done-when, each role with its start and touches; the decision', () => {
  const log = APPROVED.slice(0, 1)
  const lines = plain(draw(model(log, new Map()), { tab: 1, selected: 'api' }, 96, 58))
  golden('plan-gate', lines)
  for (const heading of ['DONE WHEN', 'ROLES', 'DECISIONS', 'OUT OF SCOPE']) assert.ok(lines.some(line => line.includes(`─ ${heading} ─`)), heading)
  assert.ok(lines.some(line => /Goal {3}Refresh tokens rotate/.test(line)))
  assert.ok(lines.some(line => /Why {4}Stolen refresh tokens/.test(line)))
  assert.equal(lines.filter(line => /^│ {3}\d {2}A /.test(line) || /^│ {3}\d {2}The /.test(line)).length, 3, 'one line per done-when item')
  assert.ok(lines.some(line => line.includes('web') && line.includes('after api')))
  assert.ok(lines.some(line => line.includes('src/api/refresh.ts  src/api/errors.ts')))
  assert.ok(lines.some(line => line.includes('Grace period for a token used twice?') && line.includes('→ 10 s')))
  assert.ok(lines.every(line => line.length <= 96))
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
    ['done Plan', 'done Plan OK? 10:42', 'now Build 0/3', 'todo Review 0/1', 'gate MR OK?', 'todo Open MR', 'todo Teardown'],
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

test('the other tabs: roles table, plan summary, log, diff; and the input line', () => {
  const m = model(APPROVED, BUILDING)
  const tab = (n, selected = 'store') => plain(draw(m, { tab: n, selected }, 96, 30))
  assert.ok(tab(2).some(line => /─ ⬢ api · ◆ waits on you/.test(line)))
  assert.ok(tab(2).some(line => /waits on +Trust this folder\?/.test(line)))
  assert.ok(tab(3).some(line => line.includes('auth-refresh: rotate refresh tokens')))
  assert.ok(tab(3).some(line => line.includes('─ DONE WHEN ─')))
  assert.ok(tab(4).some(line => line.includes('gate-answer')))
  assert.ok(tab(5).some(line => line.includes('✓ src/store/tokens.ts')))
  const typing = plain(draw(m, { tab: 1, selected: 'store', input: { label: 'send to store', text: 'also add a test' } }, 96, 30))
  assert.equal(typing[28], ' send to store › also add a test▏')
  assert.deepEqual(decisionsOf(PLAN), [{ n: '1', ask: 'Grace period for a token used twice?', recommended: '10 s' }])
})

const role = (name, extra = {}) => ({ ...model(APPROVED, new Map()).roles[0], name, branch: `role/demo/${name}`, state: 'planned', elapsed: undefined, dispatchedAt: undefined, touches: [`src/${name}.ts`], dependsOn: [], reviews: [], ...extra })
const scenario = roles => ({ ...model(APPROVED, new Map()), roles })
const flowRoles = () => [
  role('lock', { state: 'done' }),
  role('build', { dependsOn: ['lock'] }),
  role('review', { agent: 'claude', badge: AGENTS.claude.badge, model: 'opus', touches: [], reviews: ['lock', 'build'] }),
]
const cellsOf = line => line.flatMap(run => [...run.text].map(text => ({ ...run, text })))
const boxesOf = drawn => drawn.hits.filter(hit => hit.target.kind === 'role' && hit.height > 1)
/** Every box has its corners and sides, inside the width. */
const closed = (drawn, width) => {
  for (const box of boxesOf(drawn)) {
    assert.ok(box.col + box.width <= width, `${box.target.name} inside the width`)
    const top = cellsOf(drawn.lines[box.row])
    const bottom = cellsOf(drawn.lines[box.row + box.height - 1])
    assert.match(top[box.col].text, /[┌╔]/)
    assert.match(top[box.col + box.width - 1].text, /[┐╗]/)
    assert.match(bottom[box.col].text, /[└╚]/)
    assert.match(bottom[box.col + box.width - 1].text, /[┘╝]/)
    for (let row = box.row + 1; row < box.row + box.height - 1; row++) {
      const cells = cellsOf(drawn.lines[row])
      assert.match(cells[box.col].text, /[│║]/, `${box.target.name} left side`)
      assert.match(cells[box.col + box.width - 1].text, /[│║]/, `${box.target.name} right side`)
    }
  }
}
const markdown = `# A readable mission title

## Intent

A paragraph with **bold emphasis** and \`inline code\` that continues
across source lines and wraps without dropping the final sentinelword.

- A list entry with enough words to wrap on a narrow screen while keeping its continuation indented.
  #17 regressions belong to the same item.
12. A numbered entry with enough words to wrap and keep its hanging indentation.

## Role: api

Build the feature.

\`\`\`yaml
roles:
  api:
    agent: codex # adapter
    goal: "keep # inside quotes"
\`\`\`
`

test('PLAN reflows paragraphs and hanging lists, renders headings, inline styles and tinted YAML', () => {
  const m = { ...model(APPROVED, new Map()), planText: markdown }
  for (const [width, name] of [[56, 'plan-narrow'], [110, 'plan-wide']]) {
    const drawn = draw(m, { tab: 3, selected: 'api', full: true }, width, 45)
    const lines = plain(drawn)
    golden(name, lines)
    assert.ok(lines.slice(5, -2).every(line => !line.includes('…')))
    const text = lines.join('\n')
    // The path line is one row: narrow screens cut it, wide ones keep the checks and the toggle.
    if (width === 110) assert.match(text, /checks clean {2}· {2}f summary/)
    assert.match(text, /sentinelword/)
    assert.match(text, /─ ⬢ Role: api/)
    assert.ok(!text.includes('**') && !text.includes('`'))
    assert.ok(lines.some(line => /^   \w/.test(line)), 'bullet continuation is indented')
    if (width === 56) assert.ok(lines.some(line => /^     \w/.test(line)), 'number continuation is indented')
    const runs = drawn.lines.flat()
    assert.ok(runs.some(run => run.text.includes('bold emphasis') && run.bold))
    assert.ok(runs.some(run => run.text.includes('inline code') && run.tone === 'accent'))
    assert.ok(runs.some(run => run.text.includes('A readable mission title') && run.bold && run.tone === 'bright'))
    assert.ok(runs.some(run => run.text.includes('agent:') && run.tone === 'dim'))
    assert.ok(runs.some(run => run.text.includes('# adapter') && run.tone === 'chrome'))
    assert.ok(runs.some(run => run.text.includes('keep # inside quotes') && run.tone === undefined))
    const ansi = drawn.lines.map(paint).join('\n')
    assert.match(ansi, /\x1b\[1m/)
    assert.ok(ansi.includes('38;2;111;168;255m'))
  }
})

test('PLAN preserves a long token through scrolling; YAML stays on its source row', () => {
  const token = 'abcdefghijklmnopqrstuvwxyz'.repeat(4)
  const source = `# Test\n\n${token}\n\n\`\`\`yaml\nkey: ${'x'.repeat(100)}\nnext: value\n\`\`\`\n`
  const m = { ...model(APPROVED, new Map()), planText: source, problems: ['one', 'two'] }
  const drawn = draw(m, { tab: 3, selected: 'api', full: true }, 40, 50)
  const lines = plain(drawn)
  assert.ok(lines.slice(5, -2).every(line => !line.includes('…')))
  assert.match(plain(draw(m, { tab: 3, selected: 'api', full: true }, 100, 50)).join('\n'), /2 problems/)
  assert.ok(lines.filter(line => /^ [a-z]+$/.test(line)).join('').replaceAll(' ', '').includes(token))
  assert.equal(lines.filter(line => /x{10}/.test(line)).length, 1, 'YAML is not reflowed')
  assert.match(lines.join('\n'), /next: value/)
  const long = { ...m, planText: Array.from({ length: 30 }, (_, n) => `- item ${n} with continuation words and details`).join('\n') }
  const first = draw(long, { tab: 3, selected: 'api', full: true }, 40, 15)
  assert.ok(first.maxScroll > 0)
  const last = draw(long, { tab: 3, selected: 'api', full: true, scroll: first.maxScroll }, 40, 15)
  assert.match(plain(last).join('\n'), /item 29/)
})

test('FLOW: a trunk into the root, a stem to its dependent, the reviewer in a side lane with per-branch edge tones', () => {
  const m = scenario(flowRoles())
  const drawn = draw(m, { tab: 1, selected: 'build' }, 150, 50)
  golden('flow-wide', plain(drawn))
  const boxes = boxesOf(drawn)
  const find = name => boxes.find(box => box.target.name === name)
  const lines = plain(drawn)
  const [lock, build, review] = ['lock', 'build', 'review'].map(find)
  // Stacked in dependency order, the dependent right under its parent, joined by a stem and an arrow.
  assert.equal(lock.col, build.col)
  assert.ok(lock.row + lock.height < build.row)
  const centre = cellsOf(drawn.lines[build.row - 1]).findIndex((cell, col) => col >= lock.col && cell.text === '▼')
  assert.ok(centre > lock.col && centre < lock.col + lock.width)
  assert.equal(cellsOf(drawn.lines[build.row - 2])[centre].text, '│')
  // One root: the trunk comes down from the orchestrator and ends in └─▶ at lock.
  assert.ok(lines.some(line => /└─▶│/.test(line)))
  assert.ok(!lines.some(line => line.includes('├─▶')))
  // The reviewer sits in a lane to the right, between its two sources.
  assert.ok(review.col > build.col + build.width)
  assert.ok(review.row >= lock.row && review.row < build.row + build.height)
  assert.ok(!lines.some(line => /as each lands/.test(line)))
  // Each edge leaves its role's middle row; it is ok once that role is done, chrome otherwise.
  const edge = box => cellsOf(drawn.lines[box.row + 2])[box.col + box.width]
  assert.deepEqual([edge(lock).text, edge(lock).tone], ['─', 'ok'])
  assert.deepEqual([edge(build).text, edge(build).tone], ['─', 'chrome'])
  const arrow = cellsOf(drawn.lines[review.row + 2])[review.col - 1]
  assert.equal(arrow.text, '▶')
  assert.equal(arrow.tone, 'ok', 'the landed branch reads all the way to the reviewer')
  closed(drawn, 150 - 29)
})

test('FLOW narrow: the reviewer goes below, says what it reviews, and stays selectable', () => {
  const drawn = draw(scenario(flowRoles()), { tab: 1, selected: 'review' }, 78, 52)
  golden('flow-narrow', plain(drawn))
  const text = plain(drawn).join('\n')
  const boxes = boxesOf(drawn)
  const review = boxes.find(box => box.target.name === 'review')
  const build = boxes.find(box => box.target.name === 'build')
  assert.ok(review && build)
  assert.ok(review.row >= build.row + build.height && review.col === build.col, 'below the builders, not in a lane')
  assert.match(text, /reviews lock, build/)
  assert.equal(text.split('▶').length - 1, 1, 'only the trunk arrow; no edge into the reviewer')
  assert.deepEqual(hitAt(drawn.hits, review.row + 1, review.col + 2), { kind: 'role', name: 'review' })
  closed(drawn, 78)
})

test('FLOW with several reviewers puts them below with the reviews line', () => {
  const roles = [role('panel'), role('commands'), role('review-a', { touches: [], reviews: ['panel'] }), role('review-b', { touches: [], reviews: ['commands'] })]
  const drawn = draw(scenario(roles), { tab: 1, selected: 'panel' }, 150, 70)
  const boxes = boxesOf(drawn)
  assert.equal(boxes.length, 4)
  const lines = plain(drawn)
  assert.ok(lines.some(line => line.includes('reviews panel')))
  assert.ok(lines.some(line => line.includes('reviews commands')))
  const first = Math.min(...boxes.filter(box => /^review/.test(box.target.name)).map(box => box.row))
  assert.ok(boxes.filter(box => !/^review/.test(box.target.name)).every(box => box.row + box.height <= first))
  closed(drawn, 150 - 29)
})

test('FLOW does not draw a dependency through an independent builder wrapped between parent and child', () => {
  const roles = [role('lock'), role('parallel'), role('build', { dependsOn: ['lock'] })]
  const drawn = draw(scenario(roles), { tab: 1, selected: 'lock' }, 70, 50)
  const box = drawn.hits.find(hit => hit.target.kind === 'role' && hit.target.name === 'parallel' && hit.height > 1)
  assert.ok(box)
  const inside = drawn.lines.slice(box.row + 1, box.row + box.height - 1).map(line => textOf(line).slice(box.col + 1, box.col + box.width - 1))
  assert.ok(inside.every(line => !/[│▼]/.test(line)))
})

const cardRoles = () => [
  role('panel', { agent: 'codex', state: 'waits', waitsOn: 'Trust this folder?', elapsed: '5m 12s', context: '42%', flags: ['-a', 'on-request', '-s', 'workspace-write'], work: { commits: [{ sha: 'a', subject: 'Render panel' }], changed: ['src/panel.ts', 'oops.ts'], outside: ['oops.ts'] }, screen: ['first', '', 'last meaningful line', '  '] }),
  role('commands', { effort: 'unusual', model: '', result: { status: 'done', summary: 'Safe cleanup', body: '' } }),
  role('review', { agent: 'claude', badge: AGENTS.claude.badge, touches: [], reviews: ['panel', 'commands'], dependsOn: [] }),
]

test('ROLES: each role under its own rule, one fact per line', () => {
  const drawn = draw(scenario(cardRoles()), { tab: 2, selected: 'panel' }, 150, 60)
  golden('roles-wide', plain(drawn))
  const lines = plain(drawn)
  const head = name => lines.findIndex(line => new RegExp(`^ ─ [⬢✻] ${name} · `).test(line))
  const [panel, commands, review] = ['panel', 'commands', 'review'].map(head)
  assert.ok(panel > 0 && panel < commands && commands < review)
  assert.match(lines[panel], /─ ⬢ panel · ◆ waits on you ─+$/)
  const block = (from, to) => lines.slice(from + 1, to)
  const facts = rows => Object.fromEntries(rows.filter(line => /^ {3}\S/.test(line)).map(line => [line.trim().split(/\s+/)[0], line]))
  const p = facts(block(panel, commands))
  assert.deepEqual(Object.keys(p), ['agent', 'effort', 'ctx', 'tokens', 'work', 'time', 'branch', 'flags', 'waits'])
  assert.match(p.effort, /◼◼◼◻◻ high$/)
  assert.match(p.work, /1 commit · 2 files ✗ 1 outside touches$/)
  assert.match(p.flags, /-a on-request -s workspace-write$/)
  assert.match(p.waits, /waits on +Trust this folder\?$/)
  const c = facts(block(commands, review))
  assert.match(c.agent, /codex default$/)
  assert.match(c.effort, /unusual$/)
  assert.match(lines.slice(commands).find(line => line.includes('result')), /result +done · Safe cleanup$/)
  const r = facts(block(review, lines.length))
  assert.match(r.ctx, /ctx +—$/)
  assert.match(r.tokens, /tokens +—$/)
  assert.ok(!lines.join('\n').includes('╔') && !lines.join('\n').includes('▰'), 'no cards, no pips')
  const runs = drawn.lines.flat()
  assert.ok(runs.some(run => run.text.includes('✗ 1') && run.tone === 'error'))
  assert.ok(runs.some(run => run.text === '◼◼◼' && run.tone === 'accent'))
  const hits = drawn.hits.filter(hit => hit.target.kind === 'role' && hit.col === 1)
  assert.deepEqual(hits.map(hit => [hit.target.name, hit.row]), [['panel', panel], ['commands', commands], ['review', review]])
})

test('ROLES narrow: the list scrolls, lines stay inside the width, and a click on a role rule selects it', () => {
  const m = scenario(cardRoles())
  for (const width of [56, 90]) assert.ok(plain(draw(m, { tab: 2, selected: 'panel' }, width, 24)).every(line => line.length <= width))
  const first = draw(m, { tab: 2, selected: 'panel' }, 56, 14)
  assert.ok(first.maxScroll > 0)
  // Scrolled back from the end until the last role's rule comes into view.
  let scroll = first.maxScroll
  while (scroll > 0 && !draw(m, { tab: 2, selected: 'panel', scroll }, 56, 14).hits.some(hit => hit.target.kind === 'role' && hit.col === 1)) scroll -= 1
  assert.ok(scroll > 0 && scroll < first.maxScroll)
  const drawn = draw(m, { tab: 2, selected: 'panel', scroll }, 56, 14)
  golden('roles-narrow', plain(drawn))
  const hits = drawn.hits.filter(hit => hit.target.kind === 'role' && hit.col === 1)
  assert.ok(hits.length >= 1 && hits.every(hit => hit.row >= 4 && hit.row < 12))
  const target = hits.at(-1)
  assert.ok(plain(drawn)[target.row].includes(target.target.name), 'the hit sits on the rule')
  const next = transition({ tab: 2, selected: 'panel' }, { kind: 'click', row: target.row, col: target.col + 4 }, m, drawn.hits, 14, drawn.maxScroll)
  assert.equal(next.ui.selected, target.target.name)
})

test('effort: five square cells and the word, default when unset, an unknown word as written; agent colors on every surface', () => {
  const cells = line => line.map(run => run.text).join('')
  for (const [word, n] of [['minimal', 1], ['low', 1], ['medium', 2], ['high', 3], ['xhigh', 4], ['max', 5]]) {
    assert.equal(cells(effortOf(word)), `${'◼'.repeat(n)}${'◻'.repeat(5 - n)} ${word}`)
    assert.deepEqual(effortOf(word).map(run => run.tone), ['accent', 'chrome', 'dim'])
  }
  assert.deepEqual(effortOf(''), [{ text: 'default', tone: 'dim' }])
  for (const word of ['turbo', 'constructor', 'toString', '__proto__']) assert.deepEqual(effortOf(word), [{ text: word, tone: 'dim' }])
  const m = scenario([role('api', { effort: '', context: 'unknown' })])
  const flow = draw(m, { tab: 1, selected: 'api' }, 110, 45)
  assert.match(plain(flow).join('\n'), /default/)
  assert.ok(!plain(flow).join('\n').includes('unknown'))
  for (const tab of [1, 2]) {
    const runs = draw(model(APPROVED, BUILDING), { tab, selected: 'api' }, 150, 60).lines.flat()
    assert.ok(runs.some(run => run.text.includes('⬢') && run.tone === 'cyan'))
    assert.ok(runs.some(run => run.text.includes('✻') && run.tone === 'coral'))
  }
  assert.notEqual(TONES.cyan, TONES.coral)
})

test('model elapsed uses the last logged dispatch and remains absent before dispatch; teardown is activity', () => {
  const events = [...APPROVED, { ...APPROVED[3], at: at('12:05') }, { at: at('12:06'), by: 'cli', ev: 'teardown' }]
  const m = model(events, new Map())
  assert.equal(m.roles.find(role => role.name === 'api').elapsed, '2m 0s')
  assert.equal(m.roles.find(role => role.name === 'api').dispatchedAt, at('12:05'))
  assert.equal(m.roles.find(role => role.name === 'review').elapsed, undefined)
  assert.equal(m.activity[0].text, 'mission teardown complete')
})

test('models carry optional adapter badges into role views', () => {
  const m = modelOf({ mission: 'demo', planPath: 'plan.md', planText: PLAN, plan: readPlan(PLAN), hash: HASH, folded: fold(APPROVED), log: APPROVED, live: new Map(), stages: DEFAULT_STAGES, now: new Date(at('12:07')), agents: { codex: { ...AGENTS.codex, badge: { glyph: 'C', tone: 'warn' } } } })
  assert.deepEqual(m.roles[0].badge, { glyph: 'C', tone: 'warn' })
})


test('FLOW parallel roots: each gets its own trunk arrow, boxes stay clear, the reviewer joins both', () => {
  const roles = [role('panel'), role('commands'), role('review', { touches: [], reviews: ['panel', 'commands'] })]
  const drawn = draw(scenario(roles), { tab: 1, selected: 'panel' }, 150, 50)
  const boxes = boxesOf(drawn)
  const [first, second, reviewer] = ['panel', 'commands', 'review'].map(name => boxes.find(hit => hit.target.name === name))
  assert.ok(first.row + first.height <= second.row, 'stacked, not overlapping')
  const lines = plain(drawn)
  const arrows = lines.filter(line => /[├└]─▶[│║]/.test(line))
  assert.equal(arrows.length, 2)
  assert.ok(/├─▶[│║]/.test(lines[first.row + 2]) && /└─▶[│║]/.test(lines[second.row + 2]), 'a ├─▶ then the last └─▶')
  assert.ok(!lines.some(line => /after (panel|commands)/.test(line.slice(0, 80)) && line.includes('▼')))
  for (const box of [first, second]) {
    const inside = drawn.lines.slice(box.row + 1, box.row + box.height - 1).map(line => textOf(line).slice(box.col + 1, box.col + box.width - 1))
    assert.ok(inside.every(line => !/[│▼▶]/.test(line)))
    assert.equal(cellsOf(drawn.lines[box.row + 2])[box.col + box.width].text, '─')
    assert.equal(cellsOf(drawn.lines[box.row + 2])[box.col + box.width].tone, 'chrome', 'not done yet, so not lit')
  }
  assert.ok(reviewer.col > first.col + first.width)
  assert.equal(cellsOf(drawn.lines[reviewer.row + 2])[reviewer.col - 1].text, '▶')
  closed(drawn, 150 - 29)
})

test('PLAN issue references continue paragraphs and hanging lists; only real headings split them', () => {
  const tail = '#17 regressions and follow-up details through several wrapped continuation rows.'
  for (const marker of ['', '- ', '1. ', '1) ']) {
    const source = `# Title\n\n${marker}Keep checking both\n${' '.repeat(marker.length)}${tail}\n\n## Actual heading\n\nSecond paragraph.\n`
    for (const width of [52, 150]) {
      const drawn = draw({ ...model(APPROVED, new Map()), planText: source }, { tab: 3, selected: 'api', full: true }, width, 32)
      const lines = plain(drawn)
      const start = lines.findIndex(line => line.includes('Keep checking both'))
      const paragraph = lines.slice(start, lines.findIndex((line, index) => index > start && line === ''))
      assert.equal(paragraph.map(line => line.trim()).join(' '), `${marker}Keep checking both ${tail}`)
      assert.ok(paragraph.slice(1).every(line => line.startsWith(' '.repeat(marker.length + 1))), `hanging indent for ${JSON.stringify(marker)} at ${width}`)
      if (width === 150) assert.equal(paragraph.length, 1, 'source continuation joins the previous line')
      assert.ok(lines.some(line => line.startsWith(' ─ Actual heading ')))
    }
  }
  const invalid = '#hashtag # ####### seven hashes stay in this paragraph.'
  const m = { ...model(APPROVED, new Map()), planText: `# Title\n\nKeep\n#hashtag\n#\n####### seven hashes stay in this paragraph.\n` }
  assert.ok(plain(draw(m, { tab: 3, selected: 'api', full: true }, 150, 24)).includes(` Keep ${invalid}`))
  for (let count = 1; count <= 6; count++) {
    const planText = `# Title\n\nBefore heading.\n${'#'.repeat(count)} Real heading\nAfter heading.\n`
    const lines = plain(draw({ ...m, planText }, { tab: 3, selected: 'api', full: true }, 150, 24))
    assert.ok(lines.includes(' Before heading.'))
    assert.ok(lines.includes(' After heading.'))
    assert.ok(lines.some(line => line.includes('Real heading') && !line.includes('Before heading.')))
  }
})

test('FLOW edge tones follow each reviewed role: ok when done, chrome otherwise', () => {
  const roles = [role('panel', { state: 'done' }), role('commands'), role('build', { state: 'done', dependsOn: ['panel'] }), role('review', { touches: [], reviews: ['panel', 'commands', 'build'] })]
  const drawn = draw(scenario(roles), { tab: 1, selected: 'panel' }, 150, 60)
  const boxes = boxesOf(drawn)
  const reviewer = boxes.find(hit => hit.target.name === 'review')
  for (const [name, tone] of [['panel', 'ok'], ['commands', 'chrome'], ['build', 'ok']]) {
    const box = boxes.find(hit => hit.target.name === name)
    const cells = cellsOf(drawn.lines[box.row + 2])
    assert.deepEqual([cells[box.col + box.width].text, cells[box.col + box.width].tone], ['─', tone], name)
  }
  // The arrow into the reviewer is lit because some branch has landed.
  assert.deepEqual([cellsOf(drawn.lines[reviewer.row + 2])[reviewer.col - 1].text, cellsOf(drawn.lines[reviewer.row + 2])[reviewer.col - 1].tone], ['▶', 'ok'])
  closed(drawn, 150 - 29)
})

test('FLOW fits long unknown effort inside builder and reviewer borders', () => {
  const effort = 'ultra-extended-thinking-max'
  assert.deepEqual(effortOf(effort), [{ text: effort, tone: 'dim' }], 'unknown effort remains literal before fitting')
  for (const width of [78, 150]) {
    const roles = [role('panel', { effort }), role('review', { effort, touches: [], reviews: ['panel'] })]
    const drawn = draw(scenario(roles), { tab: 1, selected: 'panel' }, width, 50)
    const boxes = boxesOf(drawn)
    assert.equal(boxes.length, 2)
    closed(drawn, width)
    for (const box of boxes) {
      const cells = cellsOf(drawn.lines[box.row + 3])
      const available = box.width - 4
      const text = cells.slice(box.col + 2, box.col + 2 + available).map(cell => cell.text).join('')
      assert.equal(text.trimEnd(), effort.length > available ? `${effort.slice(0, available - 1)}…` : effort)
      assert.equal(cells[box.col + 2].tone, 'dim')
      assert.ok(cells.slice(box.col + box.width, box.col + box.width + 4).every(cell => cell.text === ' '), 'effort does not leak beyond the border')
    }
  }
})

test('cellsOf counts wide as two and combining as zero', () => {
  assert.equal(widthOf('abc'), 3)
  assert.equal(widthOf('中文'), 4)
  assert.equal(widthOf('한글a'), 5)
  assert.equal(widthOf('e\u0301'), 1)
  assert.equal(widthOf('a\u200db'), 2)
  assert.equal(widthOf('〿'), 1)
})

test('fit pads and cuts by cells without half a wide char', () => {
  assert.equal(fit('中文', 6), '中文  ')
  assert.equal(fit('中文字', 5), '中文…')
  assert.equal(fit('中文字', 4), '中… ')
  assert.equal(widthOf(fit('中文字符', 4)), 4)
  assert.equal(fit('abc', 5), 'abc  ')
  assert.equal(fit('abcdef', 4), 'abc…')
})

test('wrap breaks CJK at character boundaries within the width', () => {
  const lines = wrap('结果摘要已经完成all good', 6)
  assert.ok(lines.length > 1)
  for (const line of lines) assert.ok(widthOf(line) <= 6, line)
  assert.equal(lines.join('').replace(/ /g, ''), '结果摘要已经完成allgood')
  assert.deepEqual(wrap('ab cd', 5), ['ab cd'])
})

test('Canvas.put stores a wide char in two cells and repairs overwrites', () => {
  const canvas = new Canvas(6, 1)
  assert.equal(canvas.put(0, 0, '中a'), 3)
  assert.equal(textOf(canvas.lines()[0] ?? []), '中a')
  canvas.put(0, 1, 'x')
  assert.equal(textOf(canvas.lines()[0] ?? []), ' xa')
  canvas.put(0, 0, '中')
  canvas.put(0, 0, 'y')
  assert.equal(textOf(canvas.lines()[0] ?? []), 'y a')
  const edge = new Canvas(3, 1)
  assert.equal(edge.put(0, 2, '中'), 4)
  assert.equal(textOf(edge.lines()[0] ?? []), '')
  assert.equal(edge.cells[0][2].ch, ' ')
})

test('a box with CJK keeps its right border at the right column', () => {
  const canvas = new Canvas(10, 3)
  canvas.box(0, 0, 10, 3, 'chrome')
  canvas.put(1, 1, fit('中文字符串测试', 8), { tone: 'bright' })
  const row = textOf(canvas.lines()[1] ?? [])
  assert.equal(widthOf(row), 10)
  assert.ok(row.startsWith('│') && row.endsWith('│'))
})

test('long plan approval cards scroll by keyboard/wheel and keep visible hits aligned on resize', () => {
  const m = model(APPROVED.slice(0, 1), new Map())
  const long = { ...m, doneWhen: Array.from({ length: 18 }, (_, i) => `CRITERION-${i} must remain readable across wrapped lines at a normal half-window width.`), decisions: Array.from({ length: 8 }, (_, i) => ({ n: String(i + 1), ask: `DECISION-${i} choose the deployment approach`, recommended: 'Keep the current behavior' })) }
  let ui = { tab: 1, selected: 'api', scroll: 0 }
  const seen = new Set()
  for (const [width, height] of [[73, 48], [58, 30], [96, 40]]) {
    ui = { ...ui, scroll: 0 }
    let drawn = draw(long, ui, width, height)
    assert.ok(drawn.maxScroll > 0)
    assert.ok(plain(drawn).some(line => line.includes('PgUp/PgDn/wheel')))
    for (let i = 0; i <= drawn.maxScroll; i++) {
      drawn = draw(long, { ...ui, scroll: i }, width, height)
      plain(drawn).forEach(line => { for (const word of line.match(/(?:CRITERION|DECISION)-\d+/g) ?? []) seen.add(word) })
      for (const hit of drawn.hits.filter(one => one.target.kind === 'key' && ['a', 'c', 'v'].includes(one.target.key))) {
        assert.ok(hit.row < height - 2, 'a card hit cannot spill into the input/footer')
        assert.deepEqual(hitAt(drawn.hits, hit.row, hit.col), hit.target)
        assert.ok(plain(drawn)[hit.row].includes(hit.target.key === 'a' ? 'Approve' : hit.target.key === 'c' ? 'Change' : 'Read the plan'))
      }
    }
    drawn = draw(long, ui, width, height)
    ui = transition(ui, { kind: 'key', key: 'pageDown' }, long, drawn.hits, height, drawn.maxScroll).ui
    assert.ok(ui.scroll > 0)
    const page = ui.scroll
    ui = transition(ui, { kind: 'scroll', by: -3 }, long, drawn.hits, height, drawn.maxScroll).ui
    assert.ok(ui.scroll < page)
    const last = draw(long, { ...ui, scroll: 99999 }, width, height)
    assert.ok(plain(last).some(line => line.includes('checks clean')))
    const change = last.hits.find(hit => hit.target.kind === 'key' && hit.target.key === 'c')
    assert.ok(change)
    const editing = transition(ui, { kind: 'click', row: change.row, col: change.col }, long, last.hits, height, last.maxScroll).ui
    assert.equal(editing.input.kind, 'change')
    assert.ok(plain(draw(long, { ...editing, input: { ...editing.input, text: 'Please revise' } }, width, height))[height - 2].includes('Please revise'))
    assert.ok(plain(last)[height - 1].includes('approve'))
  }
  for (let i = 0; i < 18; i++) assert.ok(seen.has(`CRITERION-${i}`))
  for (let i = 0; i < 8; i++) assert.ok(seen.has(`DECISION-${i}`))
})
