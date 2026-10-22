import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { APPROVAL_FILE, planHash } from '../hooks/approval.ts'
import { priceOf, readTranscript, roleOfSubagent, shortstat, slugOf } from '../hooks/metrics.ts'
import { VALID } from './fixtures.ts'

// troupe_metrics on a fixture mission: VALID's three orders, review files,
// an approval record, a fake git, and Claude Code transcripts for the
// orchestrator (with one subagent), a builder window and a reviewer window.
// The fields, a refused dispatch counted, review rounds from the REVIEW
// files, and what troupe cannot know left null with its reason.

const DIR = 'docs/missions/demo'
const ROOT = '/work/repo'
const PROJECTS = '/home/t/.claude/projects'
const BRANCH = 'feature/NO-JIRA-demo'

const line = (entry: object) => JSON.stringify(entry)
const usage = (input: number, output: number, read: number, write: number) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  cache_creation: { ephemeral_5m_input_tokens: write, ephemeral_1h_input_tokens: 0 },
  speed: 'standard',
})
const assistant = (at: string, id: string, model: string, content: object[], used = usage(10, 100, 5000, 1000)) =>
  line({ type: 'assistant', timestamp: at, effort: 'high', message: { id, model, role: 'assistant', content, usage: used } })
const result = (at: string, id: string, text: string, isError: boolean) =>
  line({ type: 'user', timestamp: at, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: text }] } })
const dispatchCall = (id: string, order: string) => ({ type: 'tool_use', id, name: 'mcp__troupe__troupe_dispatch', input: { mission: 'demo', order } })

/** The orchestrator: a brief, o1 dispatched, o2 refused, a hook refusal; the first message split over two lines with the same usage. */
const ORCHESTRATOR = [
  line({ type: 'user', timestamp: '2026-10-21T09:00:00.000Z', message: { role: 'user', content: 'the brief' } }),
  assistant('2026-10-21T10:05:00.000Z', 'm1', 'claude-opus-5-5', [{ type: 'text', text: 'Dispatching o1.' }]),
  assistant('2026-10-21T10:05:00.000Z', 'm1', 'claude-opus-5-5', [dispatchCall('t1', 'o1')]),
  result('2026-10-21T10:05:30.000Z', 't1', 'Dispatched o1 (opus, effort high) to o1 in troupe-demo', false),
  assistant('2026-10-21T10:06:00.000Z', 'm2', 'claude-opus-5-5', [dispatchCall('t2', 'o2')], usage(0, 0, 0, 0)),
  result('2026-10-21T10:06:01.000Z', 't2', '<tool_use_error>o2 depends on o1, not done yet (not merged onto feature/NO-JIRA-demo). Nothing was dispatched.</tool_use_error>', true),
  assistant('2026-10-21T10:07:00.000Z', 'm3', 'claude-opus-5-5', [{ type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'git commit' } }], usage(0, 0, 0, 0)),
  result('2026-10-21T10:07:01.000Z', 't3', 'PreToolUse:Bash hook error: blocked on main', true),
  'not json: a line cut mid-write',
].join('\n')
const SUBAGENT = assistant('2026-10-21T11:00:00.000Z', 's1', 'claude-sonnet-5-5', [], usage(1, 2, 0, 0))
/** Claude Code's permission decision on a tool result: who decided, and how. */
const decided = (resultLine: string, decision: object, extra: object = {}) => line({ ...JSON.parse(resultLine), permissionDecision: decision, ...extra })
/** The builder: a call the classifier refused (its decision recorded), and one a person allowed at a prompt. */
const BUILDER = [
  assistant('2026-10-21T10:10:00.000Z', 'b1', 'claude-opus-5-5', [{ type: 'tool_use', id: 'u1', name: 'Bash', input: {} }], usage(100, 1000, 0, 0)),
  decided(result('2026-10-21T10:10:01.000Z', 'u1', 'Permission for this action was denied.', true), { decision: 'reject', source: 'config', reasonType: 'classifier' }, { toolDenialKind: 'automode-blocked' }),
  decided(result('2026-10-21T10:11:00.000Z', 'u2', 'done', false), { decision: 'accept', source: 'user_temporary' }),
].join('\n')
const REVIEWER = assistant('2026-10-21T10:50:00.000Z', 'r1', 'claude-sonnet-5-5', [], usage(50, 500, 0, 0))

type World = { files: Map<string, string>; calls: string[][] }
const ran = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: exitCode === 0 ? '' : 'fails', isStdoutTruncated: false, isStderrTruncated: false } })
/** The engine hands relative paths over made absolute (from the test's own directory); transcripts stay absolute. */
const local = (path: string) => (path.startsWith('/home/t/') ? path : path.replace(/^\/.*?\/(docs\/missions\/)/, '$1'))

async function world(on: On, transcripts: Record<string, string>): Promise<World> {
  const files = new Map<string, string>([
    [`${DIR}/plan.md`, VALID],
    [`${DIR}/${APPROVAL_FILE}`, JSON.stringify({ planHash: await planHash(VALID), approvedAt: '2026-10-21T10:00:00.000Z' })],
    [`${DIR}/REVIEW-o1.md`, 'FAIL'],
    [`${DIR}/REVIEW-o1-2.md`, 'PASS'],
    [`${DIR}/REVIEW-o2.md`, 'PASS'],
    [`${DIR}/REVIEW.md`, 'PASS'],
    ...Object.entries(transcripts),
  ])
  const w: World = { files, calls: [] }
  mock.clock(on)
  on('tool.register', (_, e) => ({ value: { tool: `mcp__troupe__${e.name}` } }))
  on('command.register', () => ({ value: { command: 'troupe' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: ROOT }))
  on('session.root', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 'S1' }))
  on('session.version', () => ({ value: { version: '2.1.308 (Claude Code)', base: '2.1.308', builtAt: '2026-10-20T00:00:00Z' } }))
  on('session.usage', () => ({ deny: 'no usage here' }))
  on('agent.list', () => ({ value: [] }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/t' : undefined }))
  on('fs.list', (_, e) => {
    const dir = `${local(e.path).replace(/\/+$/, '')}/`
    const names = [...w.files.keys()].filter(path => path.startsWith(dir) && !path.slice(dir.length).includes('/')).map(path => path.slice(dir.length))

    return { value: names.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false })) }
  })
  on('fs.stat', (_, e) => (w.files.has(local(e.path)) ? { value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.exists', (_, e) => ({ value: w.files.has(local(e.path)) }))
  on('fs.read', (_, e) => {
    const text = w.files.get(local(e.path))

    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.write', (_, e) => {
    w.files.set(local(e.path), e.text)

    return { value: undefined }
  })
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    w.calls.push(argv)
    if (argv[0] !== 'git') return ran('', 1)
    const args = argv[1] === '-C' ? argv.slice(3) : argv.slice(1)
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return ran(`${ROOT}\n`)
    if (args[0] === 'rev-parse') return ran('', 128)
    if (args[0] === 'for-each-ref') return ran(`main\n${BRANCH}\norder/demo/o1\n`)
    if (args[0] === 'merge-base') return ran('BASE\n')
    if (args[0] === 'log' && args[1] === '-1') return ran('TIP\t2026-10-21T12:00:00+00:00\n')
    if (args[0] === 'log') return ran('M1\t2026-10-21T11:05:00+00:00\to1: the parser\nP\t2026-10-21T09:30:00+00:00\tAdd the demo plan\n')
    if (args[0] === 'show') return ran('\n 2 files changed, 10 insertions(+), 3 deletions(-)\n')
    if (args[0] === 'diff') return ran(' 4 files changed, 20 insertions(+), 5 deletions(-)\n')

    return ran('', 1)
  })

  return w
}

const start = async ($: { session: { start: (input: never) => Promise<unknown> } }) =>
  $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
const metrics = async ($: { tool: { call: (input: never) => Promise<unknown> } }, mission = 'demo') =>
  JSON.stringify(await $.tool.call({ tool: 'mcp__troupe__troupe_metrics', mission } as never))
const sheetIn = (w: World) => JSON.parse(w.files.get(`${DIR}/metrics.json`) ?? 'null')

const ALL = {
  [`${PROJECTS}/-work-repo/S1.jsonl`]: ORCHESTRATOR,
  [`${PROJECTS}/-work-repo/S1/subagents/agent-a1.jsonl`]: SUBAGENT,
  [`${PROJECTS}/-work-repo/S1/subagents/agent-a1.meta.json`]: JSON.stringify({ description: 'o1: fix the parser', model: 'sonnet' }),
  [`${PROJECTS}/-work-repo-demo-o1/W1.jsonl`]: BUILDER,
  [`${PROJECTS}/-work-repo-demo-review-o1/R1.jsonl`]: REVIEWER,
}

test('troupe_metrics writes metrics.json: orders, review rounds from the REVIEW files, a refused dispatch, times, tokens and cost per role', async ($, on) => {
  const w = await world(on, ALL)
  await start($)

  const answer = await metrics($)
  expect(answer).toContain(`Wrote ${DIR}/metrics.json: 3 orders (full), 4 reviews, 1 fix round(s), 1 refused dispatch(es), 2h00m approved→MR-ready`)
  const sheet = sheetIn(w)
  expect(sheet.mission).toBe('demo')
  expect(sheet.claude_version).toBe('2.1.308 (Claude Code)')
  expect(sheet.mission_branch).toBe(BRANCH)
  expect(sheet.base_commit).toBe('BASE')
  expect(sheet.mr_ready_commit).toBe('TIP')

  // Orders: o1 reviewed twice (one fix), merged an hour after its dispatch; o2 reviewed once, not merged; o3 neither.
  expect(sheet.orders[0]).toEqual({ id: 'o1', model: 'opus', merged: true, review_rounds: 2, fix_rounds: 1, wall_time_s: 3600, diff_size: { files: 2, added: 10, removed: 3 } })
  expect(sheet.orders[1]).toMatchObject({ id: 'o2', model: 'sonnet', merged: false, review_rounds: 1, fix_rounds: 0, wall_time_s: null })
  expect(sheet.nulls['orders.o2.wall_time_s']).toContain('not merged')
  expect(sheet.review_rounds).toEqual({ orders: 3, final: 1, total: 4 })
  expect(sheet.fix_rounds).toBe(1)

  // The refused dispatch, with its reason; refusals by kind over every transcript.
  expect(sheet.refused_dispatches.count).toBe(1)
  expect(sheet.refused_dispatches.reasons[0]).toContain('o2 depends on o1, not done yet')
  expect(sheet.rework.refusals).toEqual({ hook: 1, classifier: 1, troupe: 1, declined: 0, other: 0, total: 3 })
  expect(sheet.rework.prompts_in_role_windows).toBe(1)

  // Times: approval to the mission branch's last commit, and the first transcript entry to it.
  expect(sheet.time.approved_at).toBe('2026-10-21T10:00:00.000Z')
  expect(sheet.time.plan_approved_to_mr_ready_s).toBe(7200)
  expect(sheet.time.wall_time_s).toBe(10800)

  // Tokens: a message split over two lines counted once; cache read and write priced apart at Opus 5.5's list prices.
  expect(sheet.tokens.orchestrator).toMatchObject({ input_tokens: 10, output_tokens: 100, cache_write_tokens: 1000, cache_read_tokens: 5000, model_effective: ['claude-opus-5-5'] })
  expect(sheet.tokens.orchestrator.cost_usd).toBe(0.008) // (10·4 + 100·20 + 5000·0.2 + 1000·5) / 1e6 = 0.00804
  expect(sheet.tokens.orchestrator.effort_effective.values).toEqual(['high'])
  expect(sheet.nulls['tokens.orchestrator.bad_lines']).toContain('1 transcript line')
  // The builder: its window and the `o1:` subagent; the reviewer: its window.
  expect(sheet.tokens.builder).toMatchObject({ input_tokens: 101, output_tokens: 1002, model_effective: ['claude-opus-5-5', 'claude-sonnet-5-5'] })
  expect(sheet.tokens.builder.sessions).toHaveLength(2)
  expect(sheet.tokens.reviewer).toMatchObject({ input_tokens: 50, output_tokens: 500, cost_usd: 0.0051 })
  expect(sheet.tokens.total).toMatchObject({ input_tokens: 161, output_tokens: 1602, cache_write_tokens: 1000, cache_read_tokens: 5000 })
  expect(sheet.subagents).toEqual([{ description: 'o1: fix the parser', role: 'builder' }])
  expect(sheet.quality.diff_size).toEqual({ files: 4, added: 20, removed: 5 })
  // Sizes leave the mission folder out: troupe's records are not the product change.
  const product = ['--', '.', `:(exclude)${DIR}`]
  expect(w.calls).toContainEqual(['git', '-C', ROOT, 'show', '--shortstat', '--format=', 'M1', ...product])
  expect(w.calls).toContainEqual(['git', '-C', ROOT, 'diff', '--shortstat', 'BASE', BRANCH, ...product])
  expect(sheet.base_commit_from).toContain('the merge-base of the mission branch with main')
})

test('what troupe cannot know is null with a reason: the human, the blind review, and a role with no transcript', async ($, on) => {
  const { [`${PROJECTS}/-work-repo-demo-review-o1/R1.jsonl`]: _, ...noReviewer } = ALL
  const w = await world(on, noReviewer)
  await start($)

  expect(await metrics($)).toContain('cost unknown')
  const sheet = sheetIn(w)
  for (const field of ['time.human_attention_s', 'time.human_interruptions', 'time.waiting_on_human_s', 'quality.blind_review_act_on', 'quality.handtest_defects', 'rework.blocked_s']) {
    const [group, name] = field.split('.') as [string, string]
    expect(sheet[group][name]).toBeNull()
    expect(sheet.nulls[field]).toBeTruthy()
  }
  expect(sheet.tokens.reviewer.input_tokens).toBeNull()
  expect(sheet.nulls['tokens.reviewer.input_tokens']).toContain('no reviewer transcript')
  expect(sheet.tokens.total.cost_usd).toBeNull()
  expect(sheet.coordination_share).toBeNull()
})

test('refused: a mission name that is not a plain name, or a folder with no plan', async ($, on) => {
  await world(on, {})
  await start($)

  expect(await metrics($, '../etc')).toContain('mission must be the name of a folder under docs/missions/')
  expect(await metrics($, 'nothing')).toContain('no plan.md in docs/missions/nothing')
})

test('pricing: list prices with cache read and both cache writes apart; a model without a list price, or a fast request, is not guessed', () => {
  const opus = priceOf('claude-opus-5-5', { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 2e6, cache_creation: { ephemeral_5m_input_tokens: 1e6, ephemeral_1h_input_tokens: 1e6 } })
  expect(opus).toEqual({ cost: 4 + 20 + 0.2 + 5 + 8 })
  expect(priceOf('claude-haiku-5-5', { input_tokens: 1 })).toEqual({ why: "no list price in troupe's table for claude-haiku-5-5" })
  expect(priceOf('claude-opus-5-5', { input_tokens: 1, speed: 'fast' })).toEqual({ why: 'a fast request, priced apart from the list' })
  expect(priceOf('claude-opus-5-5', { cache_creation_input_tokens: 5 })).toEqual({ why: 'cache writes without their 5-minute / 1-hour split' })
})

test('a transcript: one count per message, its models and efforts, troupe calls and refusals by kind', () => {
  const read = readTranscript(ORCHESTRATOR)
  expect(read.usage).toMatchObject({ input: 10, output: 100, cacheRead: 5000, cacheWrite: 1000 })
  expect(read.models).toEqual(['claude-opus-5-5'])
  expect(read.efforts).toEqual(['high'])
  expect(read.firstAt).toBe('2026-10-21T09:00:00.000Z')
  expect(read.calls.map(call => [call.input.order, call.error === undefined])).toEqual([
    ['o1', true],
    ['o2', false],
  ])
  expect(read.refusals).toEqual({ hook: 1, classifier: 0, troupe: 1, declined: 0, other: 0 })
  expect(readTranscript(BUILDER)).toMatchObject({ refusals: { classifier: 1, hook: 0 }, personPrompts: 1 })
  expect(read.badLines).toBe(1)
})

test("helpers: Claude Code's project folder name, a subagent's role, git's shortstat", () => {
  expect(slugOf('/home/t/repo-p4.o1/x_y')).toBe('-home-t-repo-p4-o1-x-y')
  expect(roleOfSubagent('o2: fix the parser')).toBe('builder')
  expect(roleOfSubagent('review o2')).toBe('reviewer')
  expect(roleOfSubagent('slim pass')).toBe('reviewer')
  expect(roleOfSubagent('slim cuts')).toBe('builder')
  expect(roleOfSubagent('fix final review findings')).toBe('builder')
  expect(roleOfSubagent('look up the API')).toBe('orchestrator')
  expect(shortstat(' 1 file changed, 1 insertion(+)')).toEqual({ files: 1, added: 1, removed: 0 })
})
