// The panel's screen (dist/draw.js) from a mock mission, against goldens at
// 96 columns. UPDATE_GOLDENS=1 npm test writes them anew; read the diff.
process.env.TZ = 'UTC'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { paint, textOf, TONES } from '../dist/canvas.js'
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

test('the other tabs: role cards, plan, log, diff; and the input line', () => {
  const m = model(APPROVED, BUILDING)
  const tab = (n, selected = 'store') => plain(draw(m, { tab: n, selected }, 96, 30))
  assert.ok(tab(2).some(line => /⬢ api · ◆ waits on you/.test(line)))
  assert.ok(tab(3).some(line => line.includes('auth-refresh: rotate refresh tokens')))
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
    const drawn = draw(m, { tab: 3, selected: 'api' }, width, 45)
    const lines = plain(drawn)
    golden(name, lines)
    assert.ok(lines.slice(5, -2).every(line => !line.includes('…')))
    const text = lines.join('\n')
    assert.match(text, /checks clean/)
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
  const drawn = draw(m, { tab: 3, selected: 'api' }, 40, 50)
  const lines = plain(drawn)
  assert.ok(lines.slice(5, -2).every(line => !line.includes('…')))
  assert.match(lines.join('\n'), /2 problems/)
  assert.ok(lines.filter(line => /^ [a-z]+$/.test(line)).join('').replaceAll(' ', '').includes(token))
  assert.equal(lines.filter(line => /x{10}/.test(line)).length, 1, 'YAML is not reflowed')
  assert.match(lines.join('\n'), /next: value/)
  const long = { ...m, planText: Array.from({ length: 30 }, (_, n) => `- item ${n} with continuation words and details`).join('\n') }
  const first = draw(long, { tab: 3, selected: 'api' }, 40, 15)
  assert.ok(first.maxScroll > 0)
  const last = draw(long, { tab: 3, selected: 'api', scroll: first.maxScroll }, 40, 15)
  assert.match(plain(last).join('\n'), /item 29/)
})

test('FLOW: lock/build dependency keeps review beside both branches, with per-branch edge tones', () => {
  const m = scenario(flowRoles())
  const drawn = draw(m, { tab: 1, selected: 'build' }, 150, 50)
  golden('flow-wide', plain(drawn))
  const boxes = drawn.hits.filter(hit => hit.target.kind === 'role' && hit.height > 1)
  const find = name => boxes.find(box => box.target.name === name)
  assert.ok(find('lock').row < find('build').row)
  assert.equal(find('review').row, find('lock').row)
  assert.ok(find('review').col > find('build').col + find('build').width)
  const arrows = drawn.lines.flat().filter(run => run.text.includes('▶'))
  assert.equal(arrows.length, 2)
  assert.deepEqual(arrows.map(run => run.tone), ['ok', 'dim'])
  assert.ok(!plain(drawn).some(line => /as each lands/.test(line)))
})

test('FLOW narrow fallback has no dependency arrow into review and still has a selectable reviewer', () => {
  const drawn = draw(scenario(flowRoles()), { tab: 1, selected: 'review' }, 78, 52)
  golden('flow-narrow', plain(drawn))
  const text = plain(drawn).join('\n')
  assert.match(text, /reviews lock, build as each lands/)
  assert.ok(!text.includes('▶'))
  const box = drawn.hits.find(hit => hit.target.kind === 'role' && hit.target.name === 'review' && hit.height > 1)
  assert.ok(box)
  assert.ok(!textOf(drawn.lines[box.row - 1]).slice(box.col, box.col + box.width).includes('▼'))
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

test('ROLES wide cards include live facts, known context meter, waiting dialog and missing-data placeholders', () => {
  const drawn = draw(scenario(cardRoles()), { tab: 2, selected: 'panel' }, 150, 44)
  golden('roles-wide', plain(drawn))
  const text = plain(drawn).join('\n')
  for (const value of ['⬢ panel', '✻ review', '▰▰▰▱▱', 'unusual', '1 commits · 1 files inside / 1 outside touches', '5m 12s since dispatch', '▰▰▰▰▱▱▱▱▱▱ 42%', 'last meaningful line', 'Safe cleanup', 'as each lands', '— commits']) assert.ok(text.includes(value), value)
  const hits = drawn.hits.filter(hit => hit.target.kind === 'role' && hit.height > 1)
  assert.equal(hits.length, 3)
  assert.equal(hits[0].row, hits[1].row)
  assert.ok(hits[1].col > hits[0].col)
  assert.ok(text.includes('╔') && text.includes('┌'))
  assert.ok(drawn.lines.flat().some(run => run.text.includes('1 outside touches') && run.tone === 'error'))
})

test('ROLES narrow cards scroll and clipped cards retain accurate hit targets and selection', () => {
  const m = scenario(cardRoles())
  const first = draw(m, { tab: 2, selected: 'panel' }, 56, 24)
  assert.ok(first.maxScroll > 0)
  const drawn = draw(m, { tab: 2, selected: 'review', scroll: first.maxScroll }, 56, 24)
  golden('roles-narrow', plain(drawn))
  const boxes = drawn.hits.filter(hit => hit.target.kind === 'role' && hit.height > 1)
  assert.ok(boxes.every(box => box.col === 1 && box.row >= 6 && box.row + box.height <= 22))
  const review = boxes.find(box => box.target.name === 'review')
  assert.ok(review)
  assert.deepEqual(hitAt(drawn.hits, review.row, review.col + 2), { kind: 'role', name: 'review' })
  const next = transition({ tab: 2, selected: 'panel' }, { kind: 'click', row: review.row, col: review.col + 2 }, m, drawn.hits, 24, drawn.maxScroll)
  assert.equal(next.ui.selected, 'review')
  assert.equal(next.ui.tab, 1)
  assert.match(plain(drawn).join('\n'), /✻ review/)
})

test('effort mappings, defaults, unknown words and agent ANSI colors are preserved across panel surfaces', () => {
  for (const [word, n] of [['minimal', 1], ['low', 1], ['medium', 2], ['high', 3], ['xhigh', 4], ['max', 5]]) assert.equal(effortOf(word).text, '▰'.repeat(n) + '▱'.repeat(5 - n))
  assert.deepEqual(effortOf(''), { text: 'default', tone: 'dim' })
  for (const word of ['turbo', 'constructor', 'toString', '__proto__']) assert.equal(effortOf(word).text, word)
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


test('FLOW parallel reviewed builders retain separate root edges and unobstructed boxes', () => {
  const roles = [role('panel'), role('commands'), role('review', { touches: [], reviews: ['panel', 'commands'] })]
  const drawn = draw(scenario(roles), { tab: 1, selected: 'panel' }, 150, 50)
  const boxes = drawn.hits.filter(hit => hit.target.kind === 'role' && hit.height > 1)
  const first = boxes.find(hit => hit.target.name === 'panel')
  const second = boxes.find(hit => hit.target.name === 'commands')
  assert.notEqual(first.row, second.row, 'each horizontal review edge has its own clear row')
  for (const box of [first, second]) {
    const inside = drawn.lines.slice(box.row + 1, box.row + box.height - 1).map(line => textOf(line).slice(box.col + 1, box.col + box.width - 1))
    assert.ok(inside.every(line => !/[│▼▶]/.test(line)))
  }
  assert.equal(drawn.lines.flat().filter(run => run.text.includes('▶')).length, 2)
})


test('PLAN issue references continue paragraphs and hanging lists; only real headings split them', () => {
  const tail = '#17 regressions and follow-up details through several wrapped continuation rows.'
  for (const marker of ['', '- ', '1. ', '1) ']) {
    const source = `# Title\n\n${marker}Keep checking both\n${' '.repeat(marker.length)}${tail}\n\n## Actual heading\n\nSecond paragraph.\n`
    for (const width of [52, 150]) {
      const drawn = draw({ ...model(APPROVED, new Map()), planText: source }, { tab: 3, selected: 'api' }, width, 32)
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
  assert.ok(plain(draw(m, { tab: 3, selected: 'api' }, 150, 24)).includes(` Keep ${invalid}`))
  for (let count = 1; count <= 6; count++) {
    const planText = `# Title\n\nBefore heading.\n${'#'.repeat(count)} Real heading\nAfter heading.\n`
    const lines = plain(draw({ ...m, planText }, { tab: 3, selected: 'api' }, 150, 24))
    assert.ok(lines.includes(' Before heading.'))
    assert.ok(lines.includes(' After heading.'))
    assert.ok(lines.some(line => line.includes('Real heading') && !line.includes('Before heading.')))
  }
})

const cellsOf = line => line.flatMap(run => [...run.text].map(text => ({ ...run, text })))

test('FLOW review arrows keep dependency gutter junctions and their per-branch tones', () => {
  const roles = [role('panel', { state: 'done' }), role('commands'), role('build', { state: 'done', dependsOn: ['panel'] }), role('review', { touches: [], reviews: ['panel', 'commands', 'build'] })]
  const drawn = draw(scenario(roles), { tab: 1, selected: 'panel' }, 150, 50)
  const boxes = drawn.hits.filter(hit => hit.target.kind === 'role' && hit.height > 1)
  const reviewer = boxes.find(hit => hit.target.name === 'review')
  for (const [name, tone] of [['panel', 'ok'], ['commands', 'dim']]) {
    const box = boxes.find(hit => hit.target.name === name)
    const row = box.row + 1
    const cells = cellsOf(drawn.lines[row])
    const above = cellsOf(drawn.lines[row - 1])
    const below = cellsOf(drawn.lines[row + 1])
    const crossings = []
    for (let col = box.col + box.width; col < reviewer.col - 1; col++) {
      if (above[col]?.text === '│' && below[col]?.text === '│') crossings.push(col)
    }
    assert.ok(crossings.length > 0, `${name} arrow crosses a dependency gutter`)
    for (const col of crossings) {
      assert.equal(cells[col].text, '┼')
      assert.equal(cells[col].tone, tone)
    }
    assert.equal(cells[reviewer.col - 1].text, '▶')
    assert.equal(cells[reviewer.col - 1].tone, tone)
  }
})

test('FLOW fits long unknown effort inside builder and reviewer borders', () => {
  const effort = 'ultra-extended-thinking-max'
  assert.equal(effortOf(effort).text, effort, 'unknown effort remains literal before fitting')
  for (const width of [78, 150]) {
    const roles = [role('panel', { effort }), role('review', { effort, touches: [], reviews: ['panel'] })]
    const drawn = draw(scenario(roles), { tab: 1, selected: 'panel' }, width, 50)
    const boxes = drawn.hits.filter(hit => hit.target.kind === 'role' && hit.height > 1)
    assert.equal(boxes.length, 2)
    for (const box of boxes) {
      const cells = cellsOf(drawn.lines[box.row + 3])
      assert.equal(cells[box.col].text, box.target.name === 'panel' ? '║' : '│')
      assert.equal(cells[box.col + box.width - 1].text, box.target.name === 'panel' ? '║' : '│')
      const available = box.width - 4
      const text = cells.slice(box.col + 2, box.col + 2 + available).map(cell => cell.text).join('')
      assert.equal(text.trimEnd(), effort.length > available ? `${effort.slice(0, available - 1)}…` : effort)
      assert.equal(cells[box.col + 2].tone, 'accent')
      assert.ok(cells.slice(box.col + box.width, box.col + box.width + 4).every(cell => cell.text === ' '), 'effort does not leak beyond the border')
    }
  }
})
