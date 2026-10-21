import { expect, test } from 'claude-code/testing'

import type { TroupeOrderState } from '../types'
import { goalOf, isLight, layersOf, readPlan, stepOf, STEPS } from '../hooks/plan.ts'
import { gitFacts, hasSkill, isApproved, missionBranchOf, planHash, stateOf } from '../hooks/mission.ts'
import { detail, textOf } from '../hooks/view.ts'
import { parseYaml } from '../hooks/yaml.ts'
import { BAD_YAML, MISSING_SKILL, OVERLAP, SESSION_SKILLS, VALID } from './fixtures.ts'
import { P1 } from './p1.ts'

test('a valid plan reads with its roles, orders and no problems', async () => {
  const plan = readPlan(VALID)
  expect(plan.problems).toEqual([])
  expect(plan.title).toBe('Plan: demo — a sample mission')
  expect(plan.hasRoles).toBe(true)
  // The mapping form in full, the list form with the defaults, a mapping with only skills.
  expect(plan.roles).toEqual([
    { name: 'orchestrator', model: 'fable', effort: 'max', duty: ['Runs the demo: plans and merges', 'Opens the MR'], skills: [] },
    {
      name: 'builder',
      model: 'opus',
      effort: 'high',
      duty: ['Builds its order in its own worktree', 'Fixes the review findings, one round per review'],
      skills: ['plugin-authoring', 'shared:systematic-debugging'],
    },
    {
      name: 'reviewer',
      model: 'sonnet',
      effort: 'high',
      duty: ['Reviews each order for behaviour as it lands', 'Runs the final review across the orders'],
      skills: [],
    },
  ])
  // No goal: key, so the first sentence of Intent.
  expect(plan.goal).toBe('Draw the demo pane.')
  expect(readPlan(MISSING_SKILL).goal).toBe('Show the demo mission in a pane')
  expect(plan.orders.map(order => [order.id, order.kind, order.model, order.dependsOn])).toEqual([
    ['o1', 'code', 'opus', []],
    ['o2', 'code', 'sonnet', ['o1']],
    ['o3', 'research', 'opus', []],
  ])
  expect(plan.orders[0]?.goal).toBe('Add the parser: it reads plan.md')
  expect(plan.orders[0]?.why).toBe("Reuses plan_lint's rules")
  expect(plan.orders[0]?.touches).toEqual(['hooks/read-state.ts', 'types/'])
})

test('overlapping touches without depends_on are flagged', async () => {
  expect(readPlan(OVERLAP).problems).toEqual([
    'o1 and o2 overlap (types/ ~ types/index.d.ts) but neither depends on the other',
  ])
})

test('YAML the parser cannot read is flagged with its line, not misread', async () => {
  const plan = readPlan(BAD_YAML)
  expect(plan.orders).toEqual([])
  expect(plan.problems).toEqual(['the orders block cannot be read: line 12: a value holding ": " must be quoted'])
  expect(() => parseYaml('a: |\n  text')).toThrow(/not supported/)
  expect(() => parseYaml('a: x\n  b: y')).toThrow(/unexpected indentation/)
  expect(() => parseYaml('a: 1\na: 2')).toThrow(/duplicate key/)
  expect(() => parseYaml('a: "\\u2192 arrow"')).toThrow(/escape "\\u" is not supported/)
  expect(parseYaml('a: "q\\"b\\\\c\\nd"')).toEqual({ a: 'q"b\\c\nd' })
})

test('a plan without a roles block gets the three default roles', async () => {
  const plan = readPlan(OVERLAP)
  expect(plan.hasRoles).toBe(false)
  expect(plan.roles.map(role => role.name)).toEqual(['orchestrator', 'builder', 'reviewer'])
})

test("plan_lint's other rules: no touches, no why, unknown and cyclic depends_on, duplicate ids", async () => {
  const plan = readPlan(`\`\`\`yaml
orders:
  - id: a
    kind: code
    depends_on: [b, ghost]
  - id: b
    kind: code
    why: x
    touches: [x/]
    depends_on: [a]
  - id: c
    kind: research
  - id: c
    kind: research
\`\`\`
`)
  expect(plan.problems).toEqual([
    'duplicate order id: c',
    'a: code order declares no files in touches',
    'a: code order has no why',
    'a: depends_on unknown order "ghost"',
    'a: dependency cycle',
    'b: dependency cycle',
  ])
})

test('a skill is found in either spelling; one the session lacks is not', async () => {
  const skills = readPlan(MISSING_SKILL).roles[0]?.skills ?? []
  expect(skills.map(name => hasSkill(SESSION_SKILLS, name))).toEqual([true, false])
  expect(hasSkill(SESSION_SKILLS, 'shared:systematic-debugging')).toBe(true)
  expect(hasSkill(SESSION_SKILLS, 'codex:rescue')).toBe(true)
  // Only `shared:` is dropped: another plugin's skill of the same name does not count.
  expect(hasSkill(SESSION_SKILLS, 'rescue')).toBe(false)
  expect(hasSkill(['codex:setup'], 'shared:setup')).toBe(false)
  expect(hasSkill(['shared:setup'], 'setup')).toBe(true)
})

test('layering: each order sits one layer below its deepest dependency; a cycle is left out', async () => {
  const order = (id: string, dependsOn: string[] = []) => ({ id, dependsOn })
  const { layers, stuck } = layersOf([
    order('o4', ['o2', 'o3']),
    order('o1'),
    order('o2', ['o1']),
    order('o3'),
    order('o5', ['o4', 'ghost']),
    order('c1', ['c2']),
    order('c2', ['c1']),
  ])
  expect(layers.map(layer => layer.map(one => one.id))).toEqual([['o1', 'o3'], ['o2'], ['o4'], ['o5']])
  expect(stuck.map(one => one.id)).toEqual(['c1', 'c2'])
})

test('order state: a review file, then a live or finished subagent named "<id>:", else planned', async () => {
  const agents = [
    { description: 'o2: draw', status: 'running' as const },
    { description: 'o3: check', status: 'completed' as const },
    { description: 'o10: other', status: 'running' as const },
  ]
  expect(stateOf('o1', ['plan.md', 'REVIEW-o1-2.md'], agents)).toBe('reviewed')
  expect(stateOf('o2', ['plan.md'], agents)).toBe('running')
  expect(stateOf('o3', ['plan.md'], agents)).toBe('done')
  expect(stateOf('o1', ['plan.md', 'REVIEW-o10.md'], agents)).toBe('planned')
})

test('the goal falls back to the first sentence of Intent', async () => {
  expect(goalOf('# T\n\nIntent: One line only\n\nNext.')).toBe('One line only')
  expect(goalOf('Intent: Ship it! Then rest.')).toBe('Ship it!')
  expect(goalOf('# No intent here')).toBe('')
})

test('the workflow step follows the plan, the order states and the mission files; light skips the heavy steps', async () => {
  const step = (states: TroupeOrderState[], files: string[] = [], problems: string[] = []) =>
    STEPS[stepOf({ problems, orders: states.map(state => ({ state })) }, files)]?.label
  expect(step([])).toBe('Plan')
  expect(step(['planned'], [], ['o1: code order has no why'])).toBe('Plan')
  expect(step(['planned', 'planned', 'planned'])).toBe('Plan OK?')
  expect(step(['running', 'planned', 'planned'])).toBe('Build')
  expect(step(['done', 'reviewed', 'reviewed'])).toBe('Order review')
  expect(step(['reviewed', 'reviewed', 'reviewed'])).toBe('Slim')
  expect(step(['reviewed', 'reviewed', 'reviewed'], ['SLIM.md'])).toBe('Cut')
  expect(step(['reviewed', 'reviewed', 'reviewed'], ['SLIM.md', 'REVIEW.md'])).toBe('MR OK?')
  expect(step(['reviewed', 'reviewed'])).toBe('MR OK?')
  expect([isLight([1]), isLight([1, 2]), isLight([1, 2, 3])]).toEqual([true, true, false])
  expect(STEPS.filter(one => one.isGate).map(one => one.label)).toEqual(['Plan OK?', 'MR OK?', 'Merged?'])
  expect(STEPS.filter(one => one.isHeavy).map(one => one.label)).toEqual(['Slim', 'Cut', 'Final review'])
})

test('the Phase 1 leftovers: an unknown effort is a problem, no orders is not light, a long label is cut', async () => {
  const plan = readPlan(VALID.replace('effort: max', 'effort: ultra'))
  expect(plan.problems).toEqual(['role orchestrator: unknown effort "ultra" (low, medium, high, xhigh, max)'])
  expect(isLight([])).toBe(false)
  expect(readPlan('# Plan: x\n\nno block').problems.length).toBeGreaterThan(0)

  const m = { ...P1, orders: P1.orders.map((order, index) => (index === 0 ? { ...order, id: 'o1-a-long-order-id' } : order)) }
  const row = detail(m, 110).map(textOf).find(text => text.includes('o1-a-long-o'))
  // Cut to the label column, so the value starts in its own column, as for a short label.
  expect(row?.slice(0, 20)).toBe('  o1-a-long-o…: opus')
})

test('order state from git: a branch ahead is running, a merged order is done, merged beats ahead, a review beats both', async () => {
  const git = { running: ['o2', 'o3'], merged: ['o1', 'o3'] }
  expect(stateOf('o1', [], [], git)).toBe('done')
  expect(stateOf('o2', [], [], git)).toBe('running')
  expect(stateOf('o3', [], [], git)).toBe('done')
  expect(stateOf('o4', [], [], git)).toBe('planned')
  expect(stateOf('o2', ['REVIEW-o2.md'], [], git)).toBe('reviewed')
  expect(missionBranchOf('p2', ['main', 'order/p2/o1', 'feature/NO-JIRA-p20', 'feature/NO-JIRA-p2'])).toBe('feature/NO-JIRA-p2')
  expect(missionBranchOf('p2', ['main', 'order/p2/o1'])).toBeUndefined()
})

test('gitFacts asks git for the branches, the mission-only subjects and each order branch ahead', async () => {
  const asked: string[][] = []
  const run = async (args: string[]) => {
    asked.push(args)
    if (args[0] === 'for-each-ref') return 'feature/NO-JIRA-p2\nmain\norder/p2/o1\norder/p2/o2\norder/p2/o3\n'
    if (args[0] === 'log') return 'Amend the plan\no1: answer the checks\nAdd the p2 plan\n'
    // o2 is ahead; o3's branch was only cut.
    return args.at(-1) === 'feature/NO-JIRA-p2..order/p2/o2' ? '4\n' : '0\n'
  }
  expect(await gitFacts(run, 'p2', ['o1', 'o2', 'o3', 'o4'])).toEqual({ running: ['o2'], merged: ['o1'] })
  expect(asked[1]).toEqual([
    'log', '--format=%s', 'feature/NO-JIRA-p2', '--not',
    '--exclude=feature/NO-JIRA-p2', '--exclude=order/*', '--branches', '--exclude=*/feature/NO-JIRA-p2', '--exclude=*/order/*', '--remotes',
  ])
  // Merged o1 is not asked about; o4 has no branch.
  expect(asked.filter(args => args[0] === 'rev-list').map(args => args.at(-1))).toEqual(['feature/NO-JIRA-p2..order/p2/o2', 'feature/NO-JIRA-p2..order/p2/o3'])
  expect(await gitFacts(async () => undefined, 'p2', ['o1'])).toBeUndefined()
})

test('a done marker makes an order done; a fix round stays reviewed, whatever runs for it', async () => {
  const fixing = [{ description: 'o1: fix the review', status: 'running' as const }]
  expect(stateOf('o1', ['plan.md', 'DONE-o1.md'], [])).toBe('done')
  expect(stateOf('o1', ['plan.md', 'DONE-o10.md'], [])).toBe('planned')
  // The order branch ahead (the fix commits) and a fixer at work: still reviewed.
  expect(stateOf('o1', ['DONE-o1.md', 'REVIEW-o1.md'], fixing, { running: ['o1'], merged: [] })).toBe('reviewed')
  // A built order's branch is ahead too: the marker says done.
  expect(stateOf('o1', ['DONE-o1.md'], [], { running: ['o1'], merged: [] })).toBe('done')
})

test('the step reaches "Final review" once the mission branch holds SLIM.md, and gitFacts asks only then', async () => {
  const step = (files: string[], isSlimMerged?: boolean) => STEPS[stepOf({ problems: [], orders: [{ state: 'reviewed' }, { state: 'reviewed' }, { state: 'reviewed' }] }, files, isSlimMerged)]?.label
  expect([step([]), step(['SLIM.md']), step(['SLIM.md'], false), step(['SLIM.md'], true), step(['SLIM.md', 'REVIEW.md'], true)]).toEqual([
    'Slim',
    'Cut',
    'Cut',
    'Final review',
    'MR OK?',
  ])

  const asked: string[][] = []
  const run = (slim: string) => async (args: string[]) => {
    asked.push(args)
    if (args[0] === 'for-each-ref') return 'feature/NO-JIRA-p3\nmain\n'
    if (args.includes('SLIM.md')) return slim

    return ''
  }
  expect(await gitFacts(run('a1b2c3d\n'), 'p3', ['o1'])).toEqual({ running: [], merged: [] })
  expect(asked.some(args => args.includes('SLIM.md'))).toBe(false)
  expect(await gitFacts(run('a1b2c3d\n'), 'p3', ['o1'], ['plan.md', 'SLIM.md'])).toEqual({ running: [], merged: [], isSlimMerged: true })
  expect(asked.at(-1)).toEqual(['log', '-1', '--format=%h', 'feature/NO-JIRA-p3', '--', 'SLIM.md'])
  expect(await gitFacts(run(''), 'p3', ['o1'], ['SLIM.md'])).toEqual({ running: [], merged: [], isSlimMerged: false })
})

test('an approval record that holds for plan.md moves the step past "Plan OK?"; an edited plan, none or a bad one does not', async () => {
  const step = (isApproved: boolean, states: TroupeOrderState[] = ['planned', 'planned']) =>
    STEPS[stepOf({ problems: [], orders: states.map(state => ({ state })) }, [], false, isApproved)]?.label
  expect([step(false), step(true), step(true, ['running', 'planned'])]).toEqual(['Plan OK?', 'Build', 'Build'])

  const record = JSON.stringify({ planHash: await planHash(VALID), approvedAt: '2026-10-21T16:00:00.000Z' })
  expect(await isApproved(VALID, record)).toBe(true)
  expect(await isApproved(`${VALID} `, record)).toBe(false)
  expect(await isApproved(VALID, undefined)).toBe(false)
  expect(await isApproved(VALID, 'not json')).toBe(false)
})
