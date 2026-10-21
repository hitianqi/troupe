import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { TroupeRoleSession, TroupeRoleWindow } from '../types'
import { approvalOf } from './approval.ts'
import { gitFacts, missionBranchOf } from './mission.ts'
import { ANCESTRY, ownPaneOf, tmux } from './panel.ts'
import { readPlan } from './plan.ts'
import type { PlanOrder, PlanRead } from './plan.ts'

// troupe_dispatch and troupe_status: one Claude window per order, in a tmux
// session of its own (`troupe-<mission>`) on the orchestrator's tmux server,
// each in the order's own worktree, briefed by typed keys. The home of the
// two hard rules: no dispatch before the plan is approved (approval.ts), none
// while an order it depends on is not done.
//
// Every command has a fixed shape: the mission and order ids are checked
// against NAME and the plan before they reach a path, a branch or a window
// name; the model comes from MODELS; what is typed is a fixed sentence naming
// the brief file the mod wrote, pasted as a bracketed paste (raw keys typed
// into a claude that has just started can leave its Enter as a newline). The mod acts only on the session and windows
// it opened itself, by the ids it kept (docs/FEASIBILITY.md, "Phase 2 part 2").

const roles = atom({ plugin: 'troupe', key: 'roles' } as const, {})

const MISSIONS = 'docs/missions'
/** A mission or order id the mod puts in a path, a branch or a tmux name. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
/** The models a role window may run, as `claude --model` takes them. */
export const MODELS = ['opus', 'sonnet', 'haiku', 'fable']
/** How long dispatch waits for claude's input box before it types, and how often it looks. */
export const READY_MS = 30_000
const READY_POLL_MS = 500
/** How long after the Enter dispatch looks whether the prompt left the input box. */
export const SENT_MS = 1500

export const DISPATCH = 'troupe_dispatch'
export const STATUS = 'troupe_status'

// ---- the commands, each a fixed shape ---------------------------------------

export const claudeArgv = (model: string) => ['claude', ...(model ? ['--model', model] : [])]
/** What tmux prints of a session or window it opened: `$N @N %N`. */
const IDS = '#{session_id} #{window_id} #{pane_id}'

export const argv = {
  worktreeAdd: (root: string, path: string, branch: string, base: string) => ['git', '-C', root, 'worktree', 'add', '-b', branch, path, base],
  newSession: (socket: string | undefined, name: string, window: string, cwd: string, model: string) =>
    tmux(socket, 'new-session', '-d', '-s', name, '-n', window, '-c', cwd, '-P', '-F', IDS, ...claudeArgv(model)),
  newWindow: (socket: string | undefined, session: string, window: string, cwd: string, model: string) =>
    tmux(socket, 'new-window', '-d', '-t', `${session}:`, '-n', window, '-c', cwd, '-P', '-F', IDS, ...claudeArgv(model)),
  hasSession: (socket: string | undefined, name: string) => tmux(socket, 'has-session', '-t', `=${name}`),
  sessionName: (socket: string | undefined, id: string) => tmux(socket, 'display', '-p', '-t', id, '#{session_id} #{session_name}'),
  paneId: (socket: string | undefined, pane: string) => tmux(socket, 'display', '-p', '-t', pane, '#{pane_id}'),
  capture: (socket: string | undefined, pane: string) => tmux(socket, 'capture-pane', '-p', '-t', pane),
  setBuffer: (socket: string | undefined, buffer: string, text: string) => tmux(socket, 'set-buffer', '-b', buffer, '--', text),
  paste: (socket: string | undefined, buffer: string, pane: string) => tmux(socket, 'paste-buffer', '-p', '-d', '-b', buffer, '-t', pane),
  enter: (socket: string | undefined, pane: string) => tmux(socket, 'send-keys', '-t', pane, 'Enter'),
}

/** The one sentence typed into a role window. */
export const typedPrompt = (brief: string) => `Read the brief in ${brief} and follow it.`

/** Claude shows its input box: a line that starts with `❯` in column 0 (a dialog draws its `❯` indented). */
export const isReady = (screen: string) => screen.split('\n').some(line => line.startsWith('❯'))

/** The prompt still sits in the input box: the last `❯` line is it (once sent, it is history and the box is below it). */
export const isUnsent = (screen: string, prompt: string) =>
  (screen.split('\n').findLast(line => line.startsWith('❯')) ?? '').replace(/^❯\s*/, '').startsWith(prompt.slice(0, 16))

function run($: EngineInterface, command: string[], timeoutMs = 10_000) {
  return $.process.run(command, { timeoutMs })
}

const ok = async (ran: Promise<{ exitCode: number; stdout: string; stderr: string }>) => {
  const result = await ran.catch(error => ({ exitCode: -1, stdout: '', stderr: String(error) }))

  return result.exitCode === 0 ? result.stdout : undefined
}

// ---- the rules ---------------------------------------------------------------

type Mission = { name: string; dir: string; plan: PlanRead; order: PlanOrder; root: string; base: string }
type Ruled = { mission: Mission } | { refused: string }

/** The orders of `mission` that are done: merged onto the mission branch. */
export async function doneOrders($: EngineInterface, root: string, mission: string, ids: string[]): Promise<string[] | undefined> {
  const facts = await gitFacts(args => ok(run($, ['git', '-C', root, ...args])), mission, ids)

  return facts?.merged
}

/** The two hard rules and the checks before them; the mission to dispatch, or why not. */
export async function rule($: EngineInterface, name: unknown, id: unknown): Promise<Ruled> {
  if (typeof name !== 'string' || !NAME.test(name)) return { refused: `mission must be the name of a folder under ${MISSIONS}/ (letters, digits, _ and -)` }
  if (typeof id !== 'string' || !NAME.test(id)) return { refused: 'order must be an order id from plan.md (letters, digits, _ and -)' }
  const dir = `${MISSIONS}/${name}`
  const source = await $.fs.read(`${dir}/plan.md`).catch(() => undefined)
  if (source === undefined) return { refused: `no plan.md in ${dir}` }
  const plan = readPlan(source)
  if (plan.problems.length > 0) return { refused: `the plan has problems; fix plan.md first: ${plan.problems.join('; ')}` }
  const order = plan.orders.find(one => one.id === id)
  if (order === undefined) return { refused: `no order ${id} in ${dir}/plan.md (orders: ${plan.orders.map(one => one.id).join(', ')})` }
  if (order.model !== '' && !MODELS.includes(order.model)) return { refused: `order ${id} names model "${order.model}"; a role window runs ${MODELS.join(', ')}` }

  const approved = await approvalOf($, dir)
  if (!approved.isApproved) return { refused: `${approved.reason}. Nothing was dispatched.` }

  const root = (await ok(run($, ['git', 'rev-parse', '--show-toplevel'])))?.trim()
  if (!root) return { refused: 'the session is not in a git repository' }
  const branches = (await ok(run($, ['git', '-C', root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/'])))?.split('\n').filter(Boolean) ?? []
  const base = missionBranchOf(name, branches)
  if (base === undefined) return { refused: `no mission branch for ${name} (a local branch named for it, such as feature/NO-JIRA-${name})` }
  const done = (await doneOrders($, root, name, plan.orders.map(one => one.id))) ?? []
  const waiting = order.dependsOn.filter(dep => !done.includes(dep))
  if (waiting.length > 0) return { refused: `${id} depends on ${waiting.join(', ')}, not done yet (not merged onto ${base}). Nothing was dispatched.` }

  return { mission: { name, dir, plan, order, root, base } }
}

// ---- the role session and its windows ----------------------------------------

/** The orchestrator's tmux server: its socket, found as the panel finds it; undefined outside tmux. */
async function ownSocket($: EngineInterface): Promise<{ socket: string } | undefined> {
  const ancestry = (await ok(run($, ANCESTRY))) ?? ''
  const own = ownPaneOf({ tmux: await $.env.get('TMUX'), tmuxPane: await $.env.get('TMUX_PANE') }, ancestry)

  return own && { socket: own.socket }
}

/** The role session kept for `mission`, if tmux still has it under the same id and name. */
async function liveSession($: EngineInterface, mission: string): Promise<TroupeRoleSession | undefined> {
  const kept = (await read($, roles))[mission]
  if (kept === undefined) return undefined
  const named = (await ok(run($, argv.sessionName(kept.socket, kept.id))))?.trim()

  return named === `${kept.id} ${kept.name}` ? kept : undefined
}

async function isAlive($: EngineInterface, socket: string | undefined, pane: string) {
  return (await ok(run($, argv.paneId(socket, pane))))?.trim() === pane
}

/** Waits, at most READY_MS, for claude's input box in `pane`. */
async function waitReady($: EngineInterface, socket: string | undefined, pane: string): Promise<boolean> {
  const until = (await $.clock.now()) + READY_MS
  for (;;) {
    if (isReady((await ok(run($, argv.capture(socket, pane)))) ?? '')) return true
    if ((await $.clock.now()) >= until) return false
    await $.clock.sleep(READY_POLL_MS)
  }
}

const keep = ($: EngineInterface, mission: string, session: TroupeRoleSession) => update($, roles, all => ({ ...all, [mission]: session }))

/** The builder's brief: where it works, then the builder role as the mod ships it. */
async function builderBrief($: EngineInterface, m: Mission, worktree: string, branch: string): Promise<string> {
  const role = await $.fs.read(`${$.plugin.root}/skills/troupe-mission/references/builder.md`)
  const skills = m.plan.roles.find(one => one.name === 'builder')?.skills ?? []

  return [
    `You are the builder of order ${m.order.id} of mission ${m.name}.`,
    `Your worktree is ${worktree}, already on branch ${branch} (cut from the mission branch ${m.base}): do not rename it.`,
    `The plan is ${m.dir}/plan.md in your worktree; read your order there (goal, why, touches, risks, proof) and the mission's done-when criteria.`,
    `Skills the plan names for the builder: ${skills.length > 0 ? skills.join(', ') : 'none'}.`,
    'When the order is built, commit on your branch and say so in this window; the orchestrator merges.',
    '',
    'Your role:',
    '',
    role,
  ].join('\n')
}

async function dispatch($: EngineInterface, input: { mission?: unknown; order?: unknown }): Promise<{ deny: string } | { result: string }> {
  const ruled = await rule($, input.mission, input.order)
  if ('refused' in ruled) return { deny: ruled.refused }
  const m = ruled.mission
  const id = m.order.id
  const own = await ownSocket($)
  if (own === undefined) return { deny: 'the session is not inside tmux: troupe_dispatch opens role windows in a tmux session of their own' }
  const socket = own.socket || undefined
  const name = `troupe-${m.name}`
  let session = await liveSession($, m.name)
  const kept = session?.windows[id]
  if (kept !== undefined && (await isAlive($, session?.socket, kept.pane))) {
    return { deny: `${id} already has a window (${kept.window}, pane ${kept.pane}) in ${name}` }
  }
  if (session === undefined && (await ok(run($, argv.hasSession(socket, name)))) !== undefined) {
    return { deny: `a tmux session named ${name} exists that troupe did not open; close or rename it, then dispatch again` }
  }

  const branch = `order/${m.name}/${id}`
  // Beside the repository, as `../<repo>-<mission>-<order>`.
  const worktree = `${m.root}-${m.name}-${id}`
  const added = await run($, argv.worktreeAdd(m.root, worktree, branch, m.base), 60_000).catch(error => ({ exitCode: -1, stdout: '', stderr: String(error) }))
  if (added.exitCode !== 0) return { deny: `git could not add the worktree ${worktree} on ${branch}: ${added.stderr.trim() || `exit ${added.exitCode}`}` }

  // The brief lives where git tracks nothing: the repository's own git folder.
  const gitDir = (await ok(run($, ['git', '-C', m.root, 'rev-parse', '--path-format=absolute', '--git-common-dir'])))?.trim()
  const brief = `${gitDir ?? `${m.root}/.git`}/troupe/${m.name}/${id}.md`
  await $.fs.write(brief, await builderBrief($, m, worktree, branch))

  const opened = await run($, session === undefined ? argv.newSession(socket, name, id, worktree, m.order.model) : argv.newWindow(session.socket, session.id, id, worktree, m.order.model))
  const [sessionId, window, pane] = opened.stdout.trim().split(' ')
  if (opened.exitCode !== 0 || !sessionId?.startsWith('$') || !window || !pane) {
    return { deny: `tmux could not open the window for ${id}: ${opened.stderr.trim() || `exit ${opened.exitCode}`}. The worktree ${worktree} is there.` }
  }
  const record: TroupeRoleWindow = { order: id, role: 'builder', window, pane, worktree, branch, brief, isBriefSent: false }
  session = { ...(session ?? { ...(socket && { socket }), name, id: sessionId }), windows: { ...session?.windows, [id]: record } }
  await keep($, m.name, session)

  if (!(await waitReady($, session.socket, pane))) {
    return { result: `Opened ${id} in ${name} (window ${window}, worktree ${worktree}, branch ${branch}), but claude showed no input box in ${READY_MS / 1000} s, so the brief was not typed. It is at ${brief}; the person can type: ${typedPrompt(brief)}` }
  }
  const buffer = `troupe-${m.name}-${id}`
  await run($, argv.setBuffer(session.socket, buffer, typedPrompt(brief)))
  await run($, argv.paste(session.socket, buffer, pane))
  await run($, argv.enter(session.socket, pane))
  await $.clock.sleep(SENT_MS)
  if (isUnsent((await ok(run($, argv.capture(session.socket, pane)))) ?? '', typedPrompt(brief))) {
    return { result: `Opened ${id} in ${name} (window ${window}, worktree ${worktree}, branch ${branch}) and pasted the brief's prompt, but it is still in claude's input box: the person presses Enter there. The brief is at ${brief}.` }
  }
  await keep($, m.name, { ...session, windows: { ...session.windows, [id]: { ...record, isBriefSent: true } } })

  return { result: `Dispatched ${id} (${m.order.model || 'the default model'}) to window ${window} of tmux session ${name}: worktree ${worktree}, branch ${branch}, brief ${brief}, sent.` }
}

/** Each role window kept: its order, role and whether it still lives. */
async function status($: EngineInterface, mission: unknown): Promise<string> {
  const all = await read($, roles)
  const names = typeof mission === 'string' && mission !== '' ? [mission] : Object.keys(all)
  const lines: string[] = []
  for (const name of names) {
    const kept = all[name]
    if (kept === undefined) {
      lines.push(`${name}: no role session opened`)
      continue
    }
    const session = await liveSession($, name)
    lines.push(`${name}: tmux session ${kept.name} (${kept.id}) ${session ? 'open' : 'gone'}`)
    for (const [window, one] of Object.entries(kept.windows)) {
      const alive = session !== undefined && (await isAlive($, kept.socket, one.pane))
      lines.push(`  ${window}: order ${one.order}, ${one.role}, ${alive ? 'running' : 'gone'}${one.isBriefSent ? '' : ', brief not sent'}; worktree ${one.worktree}`)
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'no role windows: nothing dispatched in this session'
}

// ---- the wiring register.tsx calls -------------------------------------------

/** Declares the tools; called at session.start. */
export async function registerDispatch($: EngineInterface): Promise<void> {
  await $.tool.register({
    name: DISPATCH,
    description:
      'Dispatch one order of an approved troupe mission: adds its worktree and branch order/<mission>/<order> from the mission branch, opens a Claude window for it in the tmux session troupe-<mission>, and types its brief. Refused before the plan is approved (APPROVAL.json matching plan.md) and while an order it depends on is not merged onto the mission branch.',
    inputSchema: {
      type: 'object',
      properties: {
        mission: { type: 'string', description: 'The mission folder name under docs/missions/, such as p3' },
        order: { type: 'string', description: 'The order id in plan.md, such as o1' },
      },
      required: ['mission', 'order'],
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: STATUS,
    description: "Each troupe role window opened in this session: its order, its role, and whether it is still running.",
    inputSchema: { type: 'object', properties: { mission: { type: 'string', description: 'One mission; all when left out' } } },
    isDeferred: false,
  })
}

/** Serves the tools; called once from register. A dispatch that throws is refused, never half-answered. */
export function dispatchHooks(on: On): void {
  on('tool.call', { tool: 'mcp__troupe__troupe_dispatch' }, async ($, e) => dispatch($, e as unknown as { mission?: unknown; order?: unknown })).catch(
    ($, e, next) => (next.called ? next(e) : { deny: 'troupe_dispatch failed; see the debug log. Check troupe_status before dispatching again.' }),
  )
  on('tool.call', { tool: 'mcp__troupe__troupe_status' }, async ($, e) => ({ result: await status($, (e as unknown as { mission?: unknown }).mission) })).catch(
    ($, e, next) => (next.called ? next(e) : { deny: 'troupe_status failed; see the debug log.' }),
  )
}
