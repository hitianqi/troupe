import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { APPROVAL_FILE, planHash } from '../hooks/approval.ts'
import { OVERLAP, VALID } from './fixtures.ts'

// The Approve / Change dialog that /troupe raises once the plan is shown,
// against a fake folder and a person who answers from a script: Approve
// writes the record, Change hands the words to the conversation, and a plan
// with problems or an approved one is not asked about. No tmux: /troupe
// shows the in-session pane.

const DIR = 'docs/missions/demo'

type World = {
  files: Map<string, string>
  /** What the person answers, one per dialog, in order: a label or words; undefined dismisses it; an object is the tool's whole result. */
  answers: (string | undefined | Record<string, unknown>)[]
  asked: string[]
  /** The option labels of each dialog, in order. */
  options: string[][]
  /** While set, the dialog stays up until it resolves. */
  held?: Promise<void>
  submitted: string[]
  clock: ReturnType<typeof mock.clock>
}

/** The engine hands the mod's relative paths over made absolute (from the test's own directory). */
const local = (path: string) => path.replace(/^\/.*?\/(docs\/missions\/)/, '$1')

function world(on: On, files: Record<string, string> = { [`${DIR}/plan.md`]: VALID }): World {
  const w: World = { files: new Map(Object.entries(files)), answers: [], asked: [], options: [], submitted: [], clock: mock.clock(on) }
  on('command.register', () => ({ value: { command: 'troupe' } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__troupe__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/repo' }))
  on('session.usage', () => ({ deny: 'no usage here' }))
  on('agent.list', () => ({ value: [] }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.stat', (_, e) => (w.files.has(local(e.path)) ? { value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.read', (_, e) => {
    const text = w.files.get(local(e.path))

    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.write', (_, e) => {
    w.files.set(local(e.path), e.text)

    return { value: undefined }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, async (_, e) => {
    const question = e.questions[0]?.question ?? ''
    w.asked.push(question)
    w.options.push(e.questions[0]?.options.map(option => option.label) ?? [])
    await w.held
    const answer = w.answers.shift()
    if (answer === undefined) return { deny: 'dismissed' }

    return { result: typeof answer === 'string' ? { questions: e.questions, answers: { [question]: answer } } : answer } as never
  })
  on('prompt.submit', (_, e) => {
    w.submitted.push(e.text)

    return { text: e.text }
  })

  return w
}

async function troupe($: { session: { start: (input: never) => Promise<unknown> }; command: { run: (input: never) => Promise<unknown> } }) {
  return JSON.stringify(await $.command.run({ command: 'troupe', args: 'demo' } as never))
}
const start = async ($: { session: { start: (input: never) => Promise<unknown> } }) =>
  $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true } as never)
const record = (w: World) => JSON.parse(w.files.get(`${DIR}/${APPROVAL_FILE}`) ?? 'null') as { planHash: string; approvedAt: string } | null

test('Approve writes the record of the plan shown, and an approved plan is not asked about again', async ($, on) => {
  const w = world(on)
  await start($)
  w.answers = ['Approve']

  const answer = await troupe($)
  expect(w.asked).toEqual(['Approve the plan?'])
  expect(answer).toContain('The plan is approved (')
  expect(record(w)?.planHash).toBe(await planHash(VALID))
  await w.clock.advance(1)
  expect(w.submitted).toEqual([])

  expect(await troupe($)).toContain('The plan is approved (')
  expect(w.asked).toEqual(['Approve the plan?'])
})

test('Change hands the words to the conversation, writes no record, and the next /troupe asks again', async ($, on) => {
  const w = world(on)
  await start($)
  w.answers = ['Change', 'Split o1 in two']

  const answer = await troupe($)
  // Handed on from a timer, once the command has answered.
  expect(w.submitted).toEqual([])
  await w.clock.advance(1)
  expect(w.asked).toEqual(['Approve the plan?', 'What should change in the plan? Type it under Other.'])
  expect(w.submitted).toEqual([`Tianqi asks: Split o1 in two; edit ${DIR}/plan.md, then /troupe again`])
  expect(answer).toContain('Change asked: Split o1 in two')
  expect(record(w)).toBeNull()

  // Words typed under Other in the first dialog are a change too.
  w.answers = ['Drop o3']
  await troupe($)
  await w.clock.advance(1)
  expect(w.asked).toHaveLength(3)
  expect(w.submitted.at(-1)).toBe(`Tianqi asks: Drop o3; edit ${DIR}/plan.md, then /troupe again`)
  expect(record(w)).toBeNull()
})

test('Not now, or a dismissed dialog, approves nothing and hands nothing on', async ($, on) => {
  const w = world(on)
  await start($)
  w.answers = ['Change', 'Not now']
  expect(await troupe($)).toContain(`The plan is not approved: no ${APPROVAL_FILE} in ${DIR}. Not approved; /troupe asks again.`)
  w.answers = [undefined]
  expect(await troupe($)).toContain('Not approved; /troupe asks again.')
  expect(w.asked).toHaveLength(3)
  await w.clock.advance(1)
  expect(w.submitted).toEqual([])
  expect(record(w)).toBeNull()
})

test('a plan with problems is not asked about', async ($, on) => {
  const w = world(on, { [`${DIR}/plan.md`]: OVERLAP })
  await start($)
  w.answers = ['Approve']

  expect(await troupe($)).toContain('Not asked: the plan has problems; fix plan.md first.')
  expect(w.asked).toEqual([])
  expect(record(w)).toBeNull()
})

test('an edited plan, a whitespace edit too, invalidates the record and is asked about again', async ($, on) => {
  const w = world(on)
  await start($)
  w.answers = ['Approve']
  await troupe($)
  const approvedAt = record(w)?.approvedAt

  w.files.set(`${DIR}/plan.md`, `${VALID}\n`)
  w.answers = [undefined]
  expect(await troupe($)).toContain(`Plan.md changed since it was approved at ${approvedAt}: it must be approved again.`)
  expect(w.asked).toEqual(['Approve the plan?', 'Approve the plan?'])

  w.answers = ['Approve']
  await troupe($)
  expect(record(w)?.planHash).toBe(await planHash(`${VALID}\n`))
})

test('a dialog that came back without an answer approves nothing: auto-resolved while away, or empty', async ($, on) => {
  const w = world(on)
  await start($)
  // As 2.1.306 resolves a lone question the person left: no answer given, afkTimeoutMs set.
  w.answers = [{ questions: [], answers: {}, afkTimeoutMs: 60000 }, { questions: [], answers: { 'Approve the plan?': '  ' } }]
  for (let i = 0; i < 2; i++) expect(await troupe($)).toContain('Not approved; /troupe asks again.')
  expect(w.asked).toHaveLength(2)
  await w.clock.advance(1)
  expect(w.submitted).toEqual([])
  expect(record(w)).toBeNull()
})

test('after Change, Not now is the first option, so a second Enter does not approve', async ($, on) => {
  const w = world(on)
  await start($)
  w.answers = ['Change', 'Not now']
  await troupe($)
  expect(w.options).toEqual([
    ['Approve', 'Change'],
    ['Not now', 'Approve'],
  ])
})

test('typed words that spell a label count as it, in any case', async ($, on) => {
  const w = world(on)
  await start($)
  w.answers = [' change ', 'not NOW']
  expect(await troupe($)).toContain('Not approved; /troupe asks again.')
  w.answers = ['approve']
  expect(await troupe($)).toContain('The plan is approved (')
  await w.clock.advance(1)
  expect(w.submitted).toEqual([])
  expect(record(w)?.planHash).toBe(await planHash(VALID))
})

test('a second /troupe while the dialog is up does not raise another', async ($, on) => {
  const w = world(on)
  await start($)
  let answer = () => {}
  w.held = new Promise(resolve => (answer = resolve))
  w.answers = ['Approve']

  const first = troupe($)
  const second = await troupe($)
  expect(second).toContain('The approval dialog is already open.')
  answer()
  expect(await first).toContain('The plan is approved (')
  expect(w.asked).toEqual(['Approve the plan?'])
})
