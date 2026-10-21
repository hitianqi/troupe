import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { SKILLS_MS } from '../hooks/read-state.ts'
import { planHash, POLL_MS } from '../hooks/mission.ts'
import { MISSING_SKILL, SESSION_SKILLS, VALID } from './fixtures.ts'

// The engine hands fs hooks the path resolved against the session's directory.
const at = <T,>(table: Record<string, T>, path: string): T | undefined =>
  Object.entries(table).find(([name]) => path === name || path.endsWith(`/${name}`))?.[1]

const PANE = {
  plugin: 'troupe',
  component: 'Pane',
  requestId: 'troupe',
  props: {
    title: 'troupe',
    isFocused: false,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 200 },
    view: {},
  },
} as const

test('the pane draws the newest mission, flags a missing skill, redraws on an edit, polls once', async ($, on) => {
  // These hooks stand for the engine: a session in a checkout holding
  // docs/missions/p0 (older) and p1, and one subagent running o1.
  const files: Record<string, { text: string; at: number }> = {
    'docs/missions/p0/plan.md': { text: VALID, at: 100 },
    'docs/missions/p1/plan.md': { text: MISSING_SKILL, at: 200 },
  }
  let stats = 0
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'troupe' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.list', (_, e) => ({
    value:
      e.path.endsWith('/docs/missions')
        ? ['p0', 'p1'].map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }))
        : [{ name: 'plan.md', kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false }],
  }))
  on('fs.stat', (_, e) => {
    stats += 1
    const file = at(files, e.path)

    return file ? { value: { kind: 'file' as const, size: file.text.length, mtimeMs: file.at, isLink: false } } : { deny: 'ENOENT' }
  })
  on('fs.read', (_, e) => {
    const file = at(files, e.path)

    return file ? { value: file.text } : { deny: 'ENOENT' }
  })
  on('session.usage', () => ({
    value: {
      context: { breakdown: { skills: { skillFrontmatter: SESSION_SKILLS.map(name => ({ name, source: 'plugin', tokens: 1 })) } } },
    } as never,
  }))
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'o1: build it', type: 'general-purpose', status: 'running' as const }] }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^TROUPE · p1 · light · plan checks clean · Show the demo mission in a pane$/ })).toBeDefined()
  // The GRAPH (stacked at 100 columns), compact ROLES and ORDERS, and the DETAIL.
  expect(await ui.find({ type: 'Text', text: /▦ MISSION p1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /≡ build/ })).toBeDefined()
  // One order running: the builder works on it; the missing skill is red in the table and the detail.
  expect(await ui.find({ type: 'Text', text: /^ {2}● builder +opus +working +o1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {2}◐ o1 +opus +running$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {2}── ROLES · 1 ─+$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {16}▪ Builds its order in its own worktree$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {16}✗ troupe-no-such-skill$/ })).toBeDefined()

  // An edit to plan.md: the next poll reads it again and the pane redraws.
  files['docs/missions/p1/plan.md'] = { text: MISSING_SKILL.replace('model: opus', 'model: sonnet'), at: 300 }
  await clock.advance(POLL_MS)
  expect(await ui.find({ type: 'Text', text: /^ {2}◐ o1 +sonnet +running/ })).toBeDefined()
  await ui.unmount()

  // A second session.start (an enable, a respawn) must not add a second
  // poll: one tick still stats each plan.md once and p1's once more.
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  stats = 0
  await clock.advance(POLL_MS)
  expect(stats).toBe(3)
})

test('/troupe <folder> draws that mission; a folder with no plan says so', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'troupe' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.list', () => ({ value: [] }))
  on('fs.stat', (_, e) =>
    e.path.endsWith('/other/docs/missions/p9/plan.md')
      ? { value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } }
      : { deny: 'ENOENT' },
  )
  on('fs.read', () => ({ value: VALID }))
  on('session.usage', () => ({ deny: 'no usage here' }))
  on('agent.list', () => ({ value: [] }))
  outsideTmux(on)

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /no mission under docs\/missions\// })).toBeDefined()

  const answer = await $.command.run({ command: 'troupe', args: '../other/docs/missions/p9/' } as never)
  expect(JSON.stringify(answer)).toContain('no tmux: showing the in-session pane')
  expect(await ui.find({ type: 'Text', text: /^TROUPE · p9/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {2}○ o2 +sonnet +planned +← o1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /the session lists no skills to check against/ })).toBeDefined()

  await $.command.run({ command: 'troupe', args: 'nope' } as never)
  expect(await ui.find({ type: 'Text', text: /no plan.md in docs\/missions\/nope/ })).toBeDefined()
  await ui.unmount()
})

test('the skill verdict follows the session: a listing that failed, or one that gained a skill', async ($, on) => {
  // usage refuses at first, then lists plugin-authoring; troupe-no-such-skill arrives later.
  let listed: string[] | undefined
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'troupe' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.list', (_, e) => ({
    value: e.path.endsWith('/docs/missions') ? [{ name: 'p1', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }] : [],
  }))
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } }))
  on('fs.read', () => ({ value: MISSING_SKILL }))
  on('session.usage', () =>
    listed === undefined
      ? { deny: 'not ready yet' }
      : { value: { context: { breakdown: { skills: { skillFrontmatter: listed.map(name => ({ name, source: 'plugin', tokens: 1 })) } } } } as never },
  )
  on('agent.list', () => ({ value: [] }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /the session lists no skills to check against/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✗ plugin-authoring/ })).toBeDefined()

  // The listing works from now on: the next poll asks again, plan.md unchanged.
  listed = ['plugin-authoring']
  await clock.advance(POLL_MS)
  expect(await ui.find({ type: 'Text', text: /✓ plugin-authoring/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /the session lists no skills/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /✗ troupe-no-such-skill/ })).toBeDefined()

  // The session gains the other skill: it shows within one listing period.
  listed = ['plugin-authoring', 'troupe-no-such-skill']
  await clock.advance(SKILLS_MS)
  expect(await ui.find({ type: 'Text', text: /✓ troupe-no-such-skill/ })).toBeDefined()
  await ui.unmount()
})

/** A session with no tmux above it: no TMUX, and no ancestor that has one. */
const outsideTmux = (on: On) => {
  on('session.cwd', () => ({ value: '/repo' }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '100\t\t\n1\t\t\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
}

/** A checkout with docs/missions/p2 holding VALID; `read` and `mtime` stand in for its files when a test changes them. */
const servesValid = (on: On, read: (path: string) => string | undefined = () => VALID, mtime: () => number = () => 1) => {
  on('command.register', () => ({ value: { command: 'troupe' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.list', (_, e) => ({
    value: e.path.endsWith('/docs/missions') ? [{ name: 'p2', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }] : [],
  }))
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: 1, mtimeMs: mtime(), isLink: false } }))
  on('fs.read', (_, e) => {
    const text = read(e.path)

    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('session.usage', () => ({
    value: { context: { breakdown: { skills: { skillFrontmatter: SESSION_SKILLS.map(name => ({ name, source: 'plugin', tokens: 1 })) } } } } as never,
  }))
  on('agent.list', () => ({ value: [] }))
}
const inline = (bodyColumns: number, bodyRows: number) => ({
  ...PANE,
  surface: 'terminal' as const,
  props: { ...PANE.props, placement: 'inline' as const, bodyColumns, scroll: { offset: 0, bodyRows } },
})

/** The order of the pane's parts: the header, the GRAPH's title, each section rule; and whether it ends cut (…). */
const partsOf = async (ui: { findAll: (query: { type: string }) => Promise<{ text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' }))
    .map(one => one.text ?? '')
    .filter((text, index, all) => /^(TROUPE ·|╔═ ▦ MISSION| {2}── |…$)/.test(text) && text !== all[index - 1])
    .map(text => (text.startsWith('TROUPE') ? 'header' : text.startsWith('╔') ? 'GRAPH' : text.replace(/ ─+$/, '').trim()))

test('inline with few rows: the pane draws the whole view, for the engine to scroll', async ($, on) => {
  const clock = mock.clock(on)
  servesValid(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount(inline(100, 9))
  expect(await partsOf(ui)).toEqual(['header', 'GRAPH', '── ROLES · 3', '── ORDERS · 3', '── GOAL', '── ORDERS · 3', '── ROLES · 3'])
  await ui.unmount()
})

test('inline given the rows for all of it: header, GRAPH, compact ROLES and ORDERS, then DETAIL', async ($, on) => {
  const clock = mock.clock(on)
  servesValid(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount(inline(150, 200))
  expect(await partsOf(ui)).toEqual(['header', 'GRAPH', '── ROLES · 3', '── ORDERS · 3', '── GOAL', '── ORDERS · 3', '── ROLES · 3'])
  // Three orders, o2 after o1: one line each, the goal only in DETAIL.
  expect(await ui.find({ type: 'Text', text: /^ {2}○ o2 +sonnet +planned +← o1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {2}o2: {11}sonnet · planned · layer 2 · depends o1 · Draw the pane$/ })).toBeDefined()
  await ui.unmount()
})

test('narrow: the compact lines keep each role state, and DETAIL keeps the roles', async ($, on) => {
  const clock = mock.clock(on)
  servesValid(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount(inline(72, 200))
  expect(await ui.find({ type: 'Text', text: /^ {2}◐ orchestrator {2}fable {3}needs you {2}◆ Plan OK\?$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {2}orchestrator: fable · max · ▪▪▪▪▪$/ })).toBeDefined()
  await ui.unmount()
})

test('the pane leaves "Plan OK?" once an approval record holds, and comes back to it when plan.md is edited', async ($, on) => {
  const clock = mock.clock(on)
  const files: Record<string, string | undefined> = { 'plan.md': VALID }
  let mtime = 1
  servesValid(on, path => at(files, path), () => mtime)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount(inline(72, 200))
  const orchestrator = async () => (await ui.findAll({ type: 'Text' })).map(one => one.text ?? '').find(text => /^ {2}. orchestrator /.test(text))

  expect(await orchestrator()).toMatch(/needs you {2}◆ Plan OK\?$/)
  files['APPROVAL.json'] = JSON.stringify({ planHash: await planHash(VALID), approvedAt: '2026-10-21T16:00:00.000Z' })
  await clock.advance(POLL_MS)
  expect(await orchestrator()).not.toMatch(/Plan OK/)
  files['plan.md'] = `${VALID}\n`
  mtime = 2
  await clock.advance(POLL_MS)
  expect(await orchestrator()).toMatch(/needs you {2}◆ Plan OK\?$/)
  await ui.unmount()
})
