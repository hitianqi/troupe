import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { APPROVAL_FILE, planHash } from '../hooks/approval.ts'
import { isReady, isUnsent, READY_MS, SENT_MS } from '../hooks/dispatch.ts'
import { VALID } from './fixtures.ts'

// troupe_dispatch and troupe_status against a fake git and tmux: the two hard
// rules (approval, depends_on), the exact argv of every git and tmux call, the
// approval record and its hash, and what the tools answer. VALID's o2 depends
// on o1; o1 and o3 depend on nothing. The session sits in /work/repo, in an
// OpenRig-like seat: no TMUX in the engine, a pane two ancestors up.

const DIR = 'docs/missions/demo'
const ROOT = '/work/repo'
const SOCKET = '/tmp/tmux-1000/default'
const SEAT = `100\t\t\n90\t${SOCKET},3506,126\t%126\n1\t\t\n`
const READY = '\n ▐▛███▛█   Claude Code\n────\n❯ Try "fix lint errors"\n────\n  ⏵⏵ auto mode on\n'
const DIALOG = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No\n'

type World = {
  files: Map<string, string>
  /** Subjects on the mission branch alone: `o1: …` once o1 is merged. */
  merged: string[]
  ancestry: string
  /** tmux sessions by name → id, and panes alive. */
  sessions: Map<string, string>
  panes: Set<string>
  screen: string
  /** After the Enter, the pasted prompt stays in the input box. */
  isStuck: boolean
  /** plan.md as the mission branch holds it, when it is not the checkout's. */
  committed?: string
  /** Order branches and worktrees git has (the fake adds to both). */
  branches: string[]
  worktrees: string[]
  calls: string[][]
  clock: ReturnType<typeof mock.clock>
}

/** The engine hands the mod's relative paths over made absolute (from the test's own directory). */
const local = (path: string) => (path.startsWith('/work/') ? path : path.replace(/^\/.*?\/(docs\/missions\/)/, '$1'))
const ran = (stdout = '', exitCode = 0, stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })

function world(on: On, given: Partial<World> = {}): World {
  const w: World = {
    files: new Map([[`${DIR}/plan.md`, VALID]]),
    merged: [],
    ancestry: SEAT,
    sessions: new Map(),
    panes: new Set(),
    screen: READY,
    isStuck: false,
    branches: [],
    worktrees: [ROOT],
    calls: [],
    clock: mock.clock(on),
    ...given,
  }
  let next = 9
  on('tool.register', (_, e) => ({ value: { tool: `mcp__troupe__${e.name}` } }))
  on('command.register', () => ({ value: { command: 'troupe' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: ROOT }))
  on('ui.close', () => ({ value: undefined }))
  on('fs.list', (_, e) => {
    const dir = `${local(e.path).replace(/\/+$/, '')}/`
    const names = [...w.files.keys()].filter(path => path.startsWith(dir) && !path.slice(dir.length).includes('/')).map(path => path.slice(dir.length))

    return { value: names.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false })) }
  })
  on('fs.stat', (_, e) => (w.files.has(local(e.path)) ? { value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.read', (_, e) => {
    if (e.path.endsWith('/skills/troupe-mission/references/builder.md')) return { value: 'THE BUILDER ROLE' }
    if (e.path.endsWith('/skills/troupe-mission/references/reviewer.md')) return { value: 'THE REVIEWER ROLE' }
    const text = w.files.get(local(e.path))

    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.write', (_, e) => {
    w.files.set(local(e.path), e.text)

    return { value: undefined }
  })
  on('session.usage', () => ({ deny: 'no usage here' }))
  on('agent.list', () => ({ value: [] }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    if (argv[0] === 'sh') return ran(w.ancestry)
    if (argv[0] === 'node') return ran('/usr/bin/node\n')
    w.calls.push(argv)
    if (argv[0] === 'git') {
      const args = argv[1] === '-C' ? argv.slice(3) : argv.slice(1)
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return ran(`${ROOT}\n`)
      if (args[0] === 'rev-parse') return ran(`${ROOT}/.git\n`)
      if (args[0] === 'for-each-ref') return ran(['main', 'feature/NO-JIRA-demo', ...w.branches].map(branch => `${branch}\n`).join(''))
      if (args[0] === 'log') return ran(w.merged.map(subject => `${subject}\n`).join(''))
      if (args[0] === 'show') return ran(w.committed ?? w.files.get(`${DIR}/plan.md`) ?? '')
      if (args[0] === 'worktree' && args[1] === 'list') return ran(w.worktrees.map(path => `worktree ${path}\nHEAD 0\n`).join('\n'))
      if (args[0] === 'worktree') {
        w.worktrees.push(args.find(arg => arg.startsWith('/work/repo-')) ?? '')
        if (args.includes('-b')) w.branches.push(args[args.indexOf('-b') + 1] ?? '')

        return ran('')
      }

      return ran('', 1, 'unexpected git call')
    }
    const verb = argv[3]
    const target = argv[argv.indexOf('-t') + 1] ?? ''
    if (verb === 'has-session') return w.sessions.has(target.replace(/^=/, '')) ? ran() : ran('', 1, "can't find session")
    if (verb === 'new-session' || verb === 'new-window') {
      const name = verb === 'new-session' ? (argv[argv.indexOf('-s') + 1] ?? '') : ''
      if (name) w.sessions.set(name, '$5')
      const pane = `%${next++}`
      w.panes.add(pane)

      return ran(`$5 @${next} ${pane}\n`)
    }
    if (verb === 'display') {
      const format = argv.at(-1)
      if (format === '#{pane_id}') return w.panes.has(target) ? ran(`${target}\n`) : ran('', 1, "can't find pane")
      const name = [...w.sessions].find(([, id]) => id === target)?.[0]

      return name ? ran(`${target} ${name}\n`) : ran('', 1, "can't find session")
    }
    if (verb === 'capture-pane') {
      const entered = w.calls.some(one => one.includes('send-keys') && one.at(-1) === 'Enter' && one.includes(target))

      return ran(w.isStuck && entered ? `${w.screen}❯ Read the brief in ${ROOT}/.git/troupe/demo/o1.md and follow it.\n` : w.screen)
    }

    return ran()
  })

  return w
}

const start = async ($: { session: { start: (input: never) => Promise<unknown> } }) =>
  $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
/** Calls a tool, moving the clock past the readiness wait and the sent check. */
async function call($: { tool: { call: (input: never) => Promise<unknown> } }, w: World, tool: string, input: object) {
  const answer = $.tool.call({ tool: `mcp__troupe__${tool}`, ...input } as never)
  await w.clock.advance(READY_MS + SENT_MS + 1000)

  return JSON.stringify(await answer)
}
const approve = async (w: World, plan = VALID) =>
  w.files.set(`${DIR}/${APPROVAL_FILE}`, JSON.stringify({ planHash: await planHash(plan), approvedAt: '2026-10-21T14:00:00.000Z' }))
/** The git and tmux calls that change something. */
const changes = (w: World) =>
  w.calls.filter(argv => ['add', 'new-session', 'new-window', 'set-buffer', 'paste-buffer', 'send-keys', 'kill-window', 'kill-session'].some(verb => argv.includes(verb)))

test('refused before the plan is approved, and nothing runs', async ($, on) => {
  const w = world(on)
  await start($)

  const answer = await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })
  expect(answer).toContain(`the plan is not approved: no ${APPROVAL_FILE} in ${DIR}`)
  expect(answer).toContain('Nothing was dispatched')
  expect(changes(w)).toEqual([])
})

test('refused after the plan changed, a whitespace edit too', async ($, on) => {
  const w = world(on)
  await approve(w)
  w.files.set(`${DIR}/plan.md`, `${VALID} `)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain('plan.md changed since it was approved at 2026-10-21T14:00:00.000Z')
  expect(changes(w)).toEqual([])
})

test('refused while an order it depends on is not merged onto the mission branch', async ($, on) => {
  const w = world(on)
  await approve(w)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o2' })).toContain('o2 depends on o1, not done yet (not merged onto feature/NO-JIRA-demo)')
  expect(changes(w)).toEqual([])
})

test('allowed once approved and o1 is merged: the exact git and tmux calls, the brief, the state', async ($, on) => {
  const w = world(on, { merged: ['o1: the parser'] })
  await approve(w)
  await start($)

  const answer = await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o2' })
  const brief = `${ROOT}/.git/troupe/demo/o2.md`
  expect(answer).toContain(`Dispatched o2 (sonnet) to o2 in troupe-demo (window @10, worktree /work/repo-demo-o2, branch order/demo/o2): brief ${brief}, sent.`)
  const branches = ['git', '-C', ROOT, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/']
  const alone = ['--not', '--exclude=feature/NO-JIRA-demo', '--exclude=order/*', '--branches', '--exclude=*/feature/NO-JIRA-demo', '--exclude=*/order/*', '--remotes']
  expect(w.calls).toEqual([
    // The rules: the repository, the mission branch, and git's word on what is merged (mission.ts's gitFacts).
    ['git', 'rev-parse', '--show-toplevel'],
    branches,
    // The mission branch holds the plan as approved.
    ['git', 'show', 'feature/NO-JIRA-demo:./docs/missions/demo/plan.md'],
    branches,
    ['git', '-C', ROOT, 'log', '--format=%s', 'feature/NO-JIRA-demo', ...alone],
    // Then the changes: only after every check passed.
    ['tmux', '-S', SOCKET, 'has-session', '-t', '=troupe-demo'],
    ['git', '-C', ROOT, 'worktree', 'list', '--porcelain'],
    ['git', '-C', ROOT, 'worktree', 'add', '-b', 'order/demo/o2', '/work/repo-demo-o2', 'feature/NO-JIRA-demo'],
    ['git', '-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    ['tmux', '-S', SOCKET, 'new-session', '-d', '-s', 'troupe-demo', '-n', 'o2', '-c', '/work/repo-demo-o2', '-P', '-F', '#{session_id} #{window_id} #{pane_id}', 'claude', '--model', 'sonnet'],
    ['tmux', '-S', SOCKET, 'capture-pane', '-p', '-t', '%9'],
    ['tmux', '-S', SOCKET, 'set-buffer', '-b', 'troupe-demo-o2', '--', `Read the brief in ${brief} and follow it.`],
    ['tmux', '-S', SOCKET, 'paste-buffer', '-p', '-d', '-b', 'troupe-demo-o2', '-t', '%9'],
    ['tmux', '-S', SOCKET, 'send-keys', '-t', '%9', 'Enter'],
    // It looks once more: the prompt has left the input box.
    ['tmux', '-S', SOCKET, 'capture-pane', '-p', '-t', '%9'],
  ])
  // The brief names the order, the worktree and branch, the builder's skills, then the role.
  const text = w.files.get(brief) ?? ''
  expect(text).toContain('You are the builder of order o2 of mission demo.')
  expect(text).toContain('Your worktree is /work/repo-demo-o2, already on branch order/demo/o2 (cut from the mission branch feature/NO-JIRA-demo)')
  expect(text).toContain('Skills the plan names for the builder: plugin-authoring, shared:systematic-debugging.')
  expect(text.endsWith('THE BUILDER ROLE')).toBe(true)

  expect(await call($, w, 'troupe_status', {})).toContain('o2: order o2, builder, running; worktree /work/repo-demo-o2')
})

test('a second order opens a window in the same role session; the same order again is refused', async ($, on) => {
  const w = world(on)
  await approve(w)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain('Dispatched o1 (opus)')
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o3' })).toContain('Dispatched o3 (opus) to o3 in troupe-demo (window @11')
  const opened = w.calls.filter(argv => argv.includes('new-session') || argv.includes('new-window'))
  expect(opened.map(argv => argv[3])).toEqual(['new-session', 'new-window'])
  expect(opened[1]).toEqual(['tmux', '-S', SOCKET, 'new-window', '-d', '-t', '$5:', '-n', 'o3', '-c', '/work/repo-demo-o3', '-P', '-F', '#{session_id} #{window_id} #{pane_id}', 'claude', '--model', 'opus'])

  const before = changes(w).length
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain('o1 already has a window')
  expect(changes(w)).toHaveLength(before)
})

test('refused with no tmux above the session, with a session of that name troupe did not open, and on ids that are not a name', async ($, on) => {
  const w = world(on, { ancestry: '100\t\t\n1\t\t\n' })
  await approve(w)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain('the session is not inside tmux')
  w.ancestry = SEAT
  w.sessions.set('troupe-demo', '$1')
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain('a tmux session named troupe-demo exists that troupe did not open')
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1; touch x' })).toContain('order must be an order id from plan.md')
  expect(await call($, w, 'troupe_dispatch', { mission: '../demo', order: 'o1' })).toContain('mission must be the name of a folder under docs/missions/')
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o9' })).toContain('no order o9 in docs/missions/demo/plan.md (orders: o1, o2, o3)')
  expect(changes(w)).toEqual([])
})

test('no input box in time: the window is kept, the brief is not typed, and status says so', async ($, on) => {
  const w = world(on, { screen: DIALOG })
  await approve(w)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain(`claude showed no input box in ${READY_MS / 1000} s, so the brief was not typed`)
  expect(w.calls.filter(argv => argv.includes('send-keys') || argv.includes('paste-buffer'))).toEqual([])
  expect(await call($, w, 'troupe_status', { mission: 'demo' })).toContain('o1: order o1, builder, running, brief not sent')

  w.panes.clear()
  expect(await call($, w, 'troupe_status', { mission: 'demo' })).toContain('o1: order o1, builder, gone')
})

test('a prompt the Enter did not send is reported, and the window is not counted as briefed', async ($, on) => {
  const w = world(on, { isStuck: true })
  await approve(w)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain("pasted the brief's prompt, but it is still in claude's input box: the person presses Enter there")
  expect(await call($, w, 'troupe_status', {})).toContain('o1: order o1, builder, running, brief not sent')
})

test('the input box is told from a dialog by its ❯ in column 0, and a sent prompt from one still in the box', () => {
  expect([isReady(READY), isReady(DIALOG), isReady(''), isReady(' ❯ No, exit')]).toEqual([true, false, false, false])
  const prompt = 'Read the brief in /r/.git/troupe/demo/o1.md and follow it.'
  const box = '────\n❯ Read the brief in\n  /r/.git/troupe/demo/o1.md and follow it.\n────\n'
  const sent = '❯ Read the brief in\n  /r/.git/troupe/demo/o1.md and follow it.\n● Reading it.\n────\n❯ \n────\n'
  expect([isUnsent(box, prompt), isUnsent(sent, prompt), isUnsent(READY, prompt)]).toEqual([true, false, false])
})

test('the approval record: its hash is sha256 of the text as read, and /troupe says whether it holds', async ($, on) => {
  const w = world(on)
  await start($)
  const troupe = async () => JSON.stringify(await $.command.run({ command: 'troupe', args: 'demo' } as never))

  expect(await planHash(VALID)).toMatch(/^sha256:[0-9a-f]{64}$/)
  expect(await planHash(`${VALID} `)).not.toBe(await planHash(VALID))
  expect(await troupe()).toContain(`The plan is not approved: no ${APPROVAL_FILE} in ${DIR}.`)
  await approve(w)
  expect(await troupe()).toContain('The plan is approved (2026-10-21T14:00:00.000Z).')
  w.files.set(`${DIR}/plan.md`, VALID.replace('o3', 'o4'))
  expect(await troupe()).toContain('Plan.md changed since it was approved at 2026-10-21T14:00:00.000Z: it must be approved again.')
  w.files.set(`${DIR}/${APPROVAL_FILE}`, 'not json')
  expect(await troupe()).toContain(`The plan is not approved: no ${APPROVAL_FILE}`)
})

test('refused when the mission branch does not hold the approved plan.md', async ($, on) => {
  const w = world(on, { committed: VALID.replace('o3', 'o4') })
  await approve(w)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain(
    'the approved plan.md is not what feature/NO-JIRA-demo holds: commit it on the mission branch, then dispatch.',
  )
  expect(changes(w)).toEqual([])
})

test('a window that has gone is opened again in the same worktree, and so is a session that has gone', async ($, on) => {
  const w = world(on)
  await approve(w)
  await start($)
  const adds = () => w.calls.filter(argv => argv.includes('worktree') && argv.includes('add'))
  const opens = () => w.calls.filter(argv => argv.includes('new-session') || argv.includes('new-window')).map(argv => argv[3])

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain('Dispatched o1')
  w.panes.clear()
  expect(await call($, w, 'troupe_status', {})).toContain('o1: order o1, builder, gone')
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain('Dispatched o1 (opus) to o1 in troupe-demo')
  // The worktree git has is reused: one add for two dispatches; the session was alive, so a window.
  expect(adds()).toHaveLength(1)
  expect(opens()).toEqual(['new-session', 'new-window'])

  w.sessions.clear()
  w.panes.clear()
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain('Dispatched o1')
  expect(adds()).toHaveLength(1)
  expect(opens()).toEqual(['new-session', 'new-window', 'new-session'])
})

test('an order branch without a worktree is checked out again, not created', async ($, on) => {
  const w = world(on, { branches: ['order/demo/o1'] })
  await approve(w)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })).toContain('Dispatched o1')
  expect(w.calls.filter(argv => argv.includes('add'))).toEqual([['git', '-C', ROOT, 'worktree', 'add', '/work/repo-demo-o1', 'order/demo/o1']])
})

test('two dispatches that interleave keep both windows', async ($, on) => {
  const w = world(on, { merged: ['o1: the parser'] })
  await approve(w)
  await start($)
  await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })

  const both = Promise.all(['o2', 'o3'].map(order => $.tool.call({ tool: 'mcp__troupe__troupe_dispatch', mission: 'demo', order } as never)))
  await w.clock.advance(READY_MS + SENT_MS + 1000)
  expect(JSON.stringify(await both)).toContain('Dispatched o3')
  const listed = await call($, w, 'troupe_status', { mission: 'demo' })
  for (const id of ['o1', 'o2', 'o3']) expect(listed).toContain(`${id}: order ${id}, builder, running;`)
})

test('the reviewer: refused until the order is built, then a detached worktree, the reviewer model, its brief and report name', async ($, on) => {
  const w = world(on)
  await approve(w)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1', role: 'reviewer' })).toContain('o1 has no branch order/demo/o1 to review yet')
  w.branches.push('order/demo/o1')
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1', role: 'reviewer' })).toContain(`o1 is not built yet (no DONE-o1.md in ${DIR})`)
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1', role: 'boss' })).toContain('role must be builder or reviewer')
  expect(changes(w)).toEqual([])

  w.files.set(`${DIR}/DONE-o1.md`, 'built')
  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1', role: 'reviewer' })).toContain(
    'Dispatched the review of o1 (sonnet) to review-o1 in troupe-demo (window @10, worktree /work/repo-demo-review-o1, detached at order/demo/o1)',
  )
  expect(changes(w).slice(0, 2)).toEqual([
    ['git', '-C', ROOT, 'worktree', 'add', '--detach', '/work/repo-demo-review-o1', 'order/demo/o1'],
    ['tmux', '-S', SOCKET, 'new-session', '-d', '-s', 'troupe-demo', '-n', 'review-o1', '-c', '/work/repo-demo-review-o1', '-P', '-F', '#{session_id} #{window_id} #{pane_id}', 'claude', '--model', 'sonnet'],
  ])
  const brief = w.files.get(`${ROOT}/.git/troupe/demo/review-o1.md`) ?? ''
  expect(brief).toContain('You are the reviewer of order o1 of mission demo: an order review.')
  expect(brief).toContain(`Write the report to /work/repo-demo-review-o1/${DIR}/REVIEW-o1.md and leave it untracked`)
  expect(brief.endsWith('THE REVIEWER ROLE')).toBe(true)
  expect(await call($, w, 'troupe_status', {})).toContain('review-o1: order o1, reviewer, running')
})

test('a re-review takes the fix branch and the next report name', async ($, on) => {
  const w = world(on, { branches: ['order/demo/o1', 'order/demo/o1-fix'] })
  w.files.set(`${DIR}/DONE-o1.md`, 'built')
  w.files.set(`${DIR}/REVIEW-o1.md`, 'FAIL')
  await approve(w)
  await start($)

  expect(await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1', role: 'reviewer' })).toContain('detached at order/demo/o1-fix')
  expect(w.files.get(`${ROOT}/.git/troupe/demo/review-o1.md`)).toContain(`/${DIR}/REVIEW-o1-2.md and leave it untracked`)
})

test("the role windows' done markers and reviews come into the mission folder on the poll, and nothing else does", async ($, on) => {
  const w = world(on)
  await approve(w)
  await start($)
  await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })
  const from = `/work/repo-demo-o1/${DIR}`
  w.files.set(`${from}/DONE-o1.md`, 'o1 built')
  w.files.set(`${from}/REVIEW-o1-2.md`, 'PASS')
  w.files.set(`${from}/DONE-o2.md`, 'not o1s to hand back')
  w.files.set(`${from}/notes.md`, 'scratch')

  await $.command.run({ command: 'troupe', args: 'demo' } as never)
  expect([w.files.get(`${DIR}/DONE-o1.md`), w.files.get(`${DIR}/REVIEW-o1-2.md`)]).toEqual(['o1 built', 'PASS'])
  expect([w.files.has(`${DIR}/DONE-o2.md`), w.files.has(`${DIR}/notes.md`)]).toEqual([false, false])
})

test('troupe_close closes one window by the id it kept, then the session by its id, and only what troupe opened', async ($, on) => {
  const w = world(on)
  await approve(w)
  await start($)
  await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })
  await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o3' })
  const kills = () => w.calls.filter(argv => argv[3]?.startsWith('kill-'))

  expect(await call($, w, 'troupe_close', { mission: 'demo', window: 'o9' })).toContain('no role window o9 in troupe-demo (windows: o1, o3)')
  expect(await call($, w, 'troupe_close', { mission: 'other' })).toContain('troupe opened no role session for other')
  expect(await call($, w, 'troupe_close', { mission: 'demo', window: 'o1' })).toContain('Closed o1 (@10) in troupe-demo; its worktree /work/repo-demo-o1 stays.')
  expect(await call($, w, 'troupe_status', {})).not.toContain('o1: order o1')
  expect(await call($, w, 'troupe_close', { mission: 'demo' })).toContain('Closed the role session troupe-demo ($5) and its 1 window(s)')
  expect(kills()).toEqual([
    ['tmux', '-S', SOCKET, 'kill-window', '-t', '@10'],
    ['tmux', '-S', SOCKET, 'kill-session', '-t', '$5'],
  ])
  expect(await call($, w, 'troupe_status', {})).toContain('no role windows')
})

test('troupe_close does not kill a session that has gone and whose name another session took', async ($, on) => {
  const w = world(on)
  await approve(w)
  await start($)
  await call($, w, 'troupe_dispatch', { mission: 'demo', order: 'o1' })
  // troupe's session went; someone opened another under the same name.
  w.sessions.set('troupe-demo', '$8')

  expect(await call($, w, 'troupe_close', { mission: 'demo' })).toContain('The role session troupe-demo had already gone; forgotten.')
  expect(w.calls.filter(argv => argv[3]?.startsWith('kill-'))).toEqual([])
})
