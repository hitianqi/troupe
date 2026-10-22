import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { TroupeRoleSession, TroupeRoleWindow } from '../types'
import { approvalOf } from './approval.ts'
import { baseOf, doneMarker, gitFacts, isReviewOf, missionBranchOf } from './mission.ts'
import { ANCESTRY, ownPaneOf, tmux } from './panel.ts'
import { ownTranscript } from './metrics.ts'
import { isLight, layersOf, readPlan } from './plan.ts'
import type { PlanOrder, PlanRead } from './plan.ts'

// troupe_dispatch, troupe_status and troupe_close: one Claude window per
// order or review, in a tmux session of its own (`troupe-<mission>`) on the
// orchestrator's tmux server, each in its own worktree, briefed by a pasted
// prompt. The home of the two hard rules: no dispatch before the plan is
// approved (approval.ts) and committed on the mission branch as approved,
// none while an order it depends on is not done (merged onto the mission
// branch); a review only of an order that is built. A light mission (one or
// two orders) runs its orders one after the other, whatever depends_on says,
// and its last order's review is also the mission's final review.
//
// Every command has a fixed shape: the mission and order ids are checked
// against NAME and the plan before they reach a path, a branch or a window
// name; the model comes from MODELS; what is typed is a fixed sentence naming
// the brief file the mod wrote, pasted as a bracketed paste (raw keys typed
// into a claude that has just started can leave its Enter as a newline).
// The mod acts only on the session and windows it opened itself, by the ids
// it kept (docs/FEASIBILITY.md, "Phase 2 part 2"). What the windows write
// back (done markers, reviews) it copies from their worktrees into the
// mission folder, where the pane and troupe-panel read it.

const roles = atom({ plugin: 'troupe', key: 'roles' } as const, {})

const MISSIONS = 'docs/missions'
/** A mission or order id the mod puts in a path, a branch or a tmux name. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
/** The models a role window may run, as `claude --model` takes them. */
export const MODELS = ['opus', 'sonnet', 'haiku', 'fable']
/** The permission modes a role window may run: `claude --permission-mode`'s choices (2.1.308), and `default`, which transcripts record and the flag still takes. */
export const PERMISSION_MODES = ['default', 'manual', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']
/** How long dispatch waits for claude's input box before it types, and how often it looks. */
export const READY_MS = 30_000
const READY_POLL_MS = 500
/** How long after the Enter dispatch looks whether the prompt left the input box. */
export const SENT_MS = 1500

type Role = TroupeRoleWindow['role']
/** A role window's name in the session: the order id for its builder, `review-<id>` for its reviewer. */
export const windowName = (role: Role, id: string) => (role === 'reviewer' ? `review-${id}` : id)

// ---- the commands, each a fixed shape ---------------------------------------

/** `claude` pinned to the role's model and effort and the orchestrator's permission mode; a flag is left out when there is no value for it. */
export const claudeArgv = (model: string, effort: string, mode = '') => [
  'claude',
  ...(model ? ['--model', model] : []),
  ...(effort ? ['--effort', effort] : []),
  ...(mode ? ['--permission-mode', mode] : []),
]
/** What tmux prints of a session or window it opened: `$N @N %N`. */
const IDS = '#{session_id} #{window_id} #{pane_id}'

export const argv = {
  worktreeAdd: (root: string, path: string, branch: string, base: string) => ['git', '-C', root, 'worktree', 'add', '-b', branch, path, base],
  /** An existing branch, into a worktree again. */
  worktreeAddExisting: (root: string, path: string, branch: string) => ['git', '-C', root, 'worktree', 'add', path, branch],
  /** A reviewer's worktree: the branch it reviews, detached. */
  worktreeAddDetached: (root: string, path: string, branch: string) => ['git', '-C', root, 'worktree', 'add', '--detach', path, branch],
  worktreeList: (root: string) => ['git', '-C', root, 'worktree', 'list', '--porcelain'],
  checkoutDetached: (path: string, branch: string) => ['git', '-C', path, 'checkout', '--detach', branch],
  newSession: (socket: string | undefined, name: string, window: string, cwd: string, model: string, effort: string, mode = '') =>
    tmux(socket, 'new-session', '-d', '-s', name, '-n', window, '-c', cwd, '-P', '-F', IDS, ...claudeArgv(model, effort, mode)),
  newWindow: (socket: string | undefined, session: string, window: string, cwd: string, model: string, effort: string, mode = '') =>
    tmux(socket, 'new-window', '-d', '-t', `${session}:`, '-n', window, '-c', cwd, '-P', '-F', IDS, ...claudeArgv(model, effort, mode)),
  hasSession: (socket: string | undefined, name: string) => tmux(socket, 'has-session', '-t', `=${name}`),
  sessionName: (socket: string | undefined, id: string) => tmux(socket, 'display', '-p', '-t', id, '#{session_id} #{session_name}'),
  paneId: (socket: string | undefined, pane: string) => tmux(socket, 'display', '-p', '-t', pane, '#{pane_id}'),
  capture: (socket: string | undefined, pane: string) => tmux(socket, 'capture-pane', '-p', '-t', pane),
  setBuffer: (socket: string | undefined, buffer: string, text: string) => tmux(socket, 'set-buffer', '-b', buffer, '--', text),
  paste: (socket: string | undefined, buffer: string, pane: string) => tmux(socket, 'paste-buffer', '-p', '-d', '-b', buffer, '-t', pane),
  enter: (socket: string | undefined, pane: string) => tmux(socket, 'send-keys', '-t', pane, 'Enter'),
  killWindow: (socket: string | undefined, window: string) => tmux(socket, 'kill-window', '-t', window),
  killSession: (socket: string | undefined, id: string) => tmux(socket, 'kill-session', '-t', id),
}

/** The one sentence typed into a role window. */
export const typedPrompt = (brief: string) => `Read the brief in ${brief} and follow it.`

/** Claude shows its input box: a line that starts with `❯` in column 0 (a dialog draws its `❯` indented). */
export const isReady = (screen: string) => screen.split('\n').some(line => line.startsWith('❯'))

/** The prompt still sits in the input box: the last `❯` line is it (once sent, it is history and the box is below it). */
export const isUnsent = (screen: string, prompt: string) =>
  (screen.split('\n').findLast(line => line.startsWith('❯')) ?? '').replace(/^❯\s*/, '').startsWith(prompt.slice(0, 16))

/** The files a role window hands back, by name: its order's done marker and review reports (`REVIEW-<id>.md`, `REVIEW-<id>-<n>.md`). */
export const isResultOf = (id: string, name: string) => name === doneMarker(id) || isReviewOf(id, name)

function run($: EngineInterface, command: string[], timeoutMs = 10_000) {
  return $.process.run(command, { timeoutMs }).catch(error => ({ exitCode: -1, stdout: '', stderr: String(error) }))
}

const ok = async (ran: Promise<{ exitCode: number; stdout: string; stderr: string }>) => {
  const result = await ran

  return result.exitCode === 0 ? result.stdout : undefined
}

// ---- the rules ---------------------------------------------------------------

type Mission = { name: string; dir: string; plan: PlanRead; order: PlanOrder; root: string; base: string; branches: string[] }
type Ruled = { mission: Mission } | { refused: string }

/** The hard rules and the checks before them; the mission to dispatch, or why not. */
export async function rule($: EngineInterface, name: unknown, id: unknown, role: Role): Promise<Ruled> {
  if (typeof name !== 'string' || !NAME.test(name)) return { refused: `mission must be the name of a folder under ${MISSIONS}/ (letters, digits, _ and -)` }
  if (typeof id !== 'string' || !NAME.test(id)) return { refused: 'order must be an order id from plan.md (letters, digits, _ and -)' }
  const dir = `${MISSIONS}/${name}`
  const source = await $.fs.read(`${dir}/plan.md`).catch(() => undefined)
  if (source === undefined) return { refused: `no plan.md in ${dir}` }
  const plan = readPlan(source)
  if (plan.problems.length > 0) return { refused: `the plan has problems; fix plan.md first: ${plan.problems.join('; ')}` }
  const order = plan.orders.find(one => one.id === id)
  if (order === undefined) return { refused: `no order ${id} in ${dir}/plan.md (orders: ${plan.orders.map(one => one.id).join(', ')})` }
  const model = modelOf(plan, order, role)
  if (model !== '' && !MODELS.includes(model)) return { refused: `${role === 'reviewer' ? 'the reviewer role' : `order ${id}`} names model "${model}"; a role window runs ${MODELS.join(', ')}` }

  const approved = await approvalOf($, dir)
  if (!approved.isApproved) return { refused: `${approved.reason}. Nothing was dispatched.` }

  const root = (await ok(run($, ['git', 'rev-parse', '--show-toplevel'])))?.trim()
  if (!root) return { refused: 'the session is not in a git repository' }
  const branches = (await ok(run($, ['git', '-C', root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/'])))?.split('\n').filter(Boolean) ?? []
  const base = missionBranchOf(name, branches)
  if (base === undefined) return { refused: `no mission branch for ${name} (a local branch named for it, such as feature/NO-JIRA-${name})` }
  // A window's worktree is cut from the mission branch: it must hold the plan that was approved.
  if ((await ok(run($, ['git', 'show', `${base}:./${dir}/plan.md`]))) !== source) {
    return { refused: `the approved plan.md is not what ${base} holds: commit it on the mission branch, then dispatch. Nothing was dispatched.` }
  }

  if (role === 'reviewer') {
    const files = (await $.fs.list(dir).catch(() => [])).map(entry => entry.name)
    if (!branches.includes(`order/${name}/${id}`)) return { refused: `${id} has no branch order/${name}/${id} to review yet. Nothing was dispatched.` }
    const isBuilt = files.includes(doneMarker(id)) || (await $.fs.exists(`${root}-${name}-${id}/${dir}/${doneMarker(id)}`).catch(() => false))
    if (!isBuilt) return { refused: `${id} is not built yet (no ${doneMarker(id)} in ${dir}). Nothing was dispatched.` }

    return { mission: { name, dir, plan, order, root, base, branches } }
  }
  // Done: merged onto the mission branch.
  const done = (await gitFacts(args => ok(run($, ['git', '-C', root, ...args])), name, plan.orders.map(one => one.id)))?.merged ?? []
  const waiting = order.dependsOn.filter(dep => !done.includes(dep))
  if (waiting.length > 0) return { refused: `${id} depends on ${waiting.join(', ')}, not done yet (not merged onto ${base}). Nothing was dispatched.` }
  // A light mission: one order at a time, each after the one before it is merged.
  const serial = serialOf(plan)
  const before = serial.slice(0, serial.indexOf(order)).filter(one => !done.includes(one.id)).map(one => one.id).join(', ')
  if (isLight(plan.orders) && before !== '') {
    return {
      refused: `${id} waits for ${before}: a light mission (one or two orders) runs its orders one after the other, whatever depends_on says, and ${before} is not merged onto ${base} yet. Nothing was dispatched.`,
    }
  }

  return { mission: { name, dir, plan, order, root, base, branches } }
}

/** The orders one after the other: by dependency layer, then as plan.md lists them. A light mission runs them in this order. */
const serialOf = (plan: PlanRead): PlanOrder[] => layersOf(plan.orders).layers.flat()

/** A builder runs the order's model; a reviewer, the reviewer role's. */
const modelOf = (plan: PlanRead, order: PlanOrder, role: Role) => (role === 'reviewer' ? (plan.roles.find(one => one.name === 'reviewer')?.model ?? '') : order.model)
/** A window runs its role's effort, as the plan reads it (a role that names none gets the default the pane shows). */
const effortOf = (plan: PlanRead, role: Role) => plan.roles.find(one => one.name === role)?.effort ?? ''

/** The last mode Claude Code recorded in a transcript (`{"type":"permission-mode", …}`), if it is one a window may run. */
export function lastPermissionMode(transcript: string): string {
  const lines = transcript.split('\n')
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index] ?? ''
    if (!line.includes('"permission-mode"')) continue
    try {
      const entry: unknown = JSON.parse(line)
      const mode = typeof entry === 'object' && entry !== null && (entry as { type?: unknown }).type === 'permission-mode' ? (entry as { permissionMode?: unknown }).permissionMode : undefined
      if (typeof mode === 'string') return PERMISSION_MODES.includes(mode) ? mode : ''
    } catch {
      // A line cut mid-write: look further back.
    }
  }

  return ''
}

/**
 * The orchestrator's own permission mode, so role windows run as the person
 * set it rather than as a project's settings would. The engine does not hand
 * a mod the session's mode; Claude Code records each mode the session takes
 * in its transcript, so the last one recorded is the mode now. '' when the
 * transcript cannot be read: then no mode is passed, and the answer says so.
 */
async function ownPermissionMode($: EngineInterface): Promise<string> {
  const own = await ownTranscript($)

  return own ? lastPermissionMode(own.text) : ''
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
  // Asked twice: one failed look (a busy server) must not forget windows that run.
  const named = ((await ok(run($, argv.sessionName(kept.socket, kept.id)))) ?? (await ok(run($, argv.sessionName(kept.socket, kept.id)))))?.trim()

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

/** Keeps one window of `session`, read back at the moment of the write, so two dispatches that interleave keep both windows. */
const keepWindow = ($: EngineInterface, mission: string, session: Omit<TroupeRoleSession, 'windows'>, window: string, record: TroupeRoleWindow) =>
  update($, roles, all => {
    const current = all[mission]
    const base = current !== undefined && current.id === session.id ? current : { ...session, windows: {} }

    return { ...all, [mission]: { ...base, windows: { ...base.windows, [window]: record } } }
  })

/** Forgets windows (all of the session's when `window` is undefined). */
const forget = ($: EngineInterface, mission: string, window?: string) =>
  update($, roles, all => {
    const current = all[mission]
    if (current === undefined) return all
    if (window === undefined) {
      const { [mission]: _, ...rest } = all

      return rest
    }
    const { [window]: __, ...windows } = current.windows

    return { ...all, [mission]: { ...current, windows } }
  })

/** The worktree for a window: the one git already has at `path` (a reopen), else a new one. Answers an error text, or undefined. */
async function worktreeFor($: EngineInterface, m: Mission, role: Role, path: string, branch: string): Promise<string | undefined> {
  const listed = (await ok(run($, argv.worktreeList(m.root)))) ?? ''
  if (listed.split('\n').includes(`worktree ${path}`)) {
    if (role !== 'reviewer') return undefined
    // A reviewer's worktree is reused for its re-review: on to the branch the brief names.
    const moved = await run($, argv.checkoutDetached(path, branch))

    return moved.exitCode === 0 ? undefined : `git could not move the reviewer's worktree ${path} to ${branch}: ${moved.stderr.trim() || `exit ${moved.exitCode}`}`
  }
  const add =
    role === 'reviewer'
      ? argv.worktreeAddDetached(m.root, path, branch)
      : m.branches.includes(branch)
        ? argv.worktreeAddExisting(m.root, path, branch)
        : argv.worktreeAdd(m.root, path, branch, m.base)
  const added = await run($, add, 60_000)

  return added.exitCode === 0 ? undefined : `git could not add the worktree ${path} on ${branch}: ${added.stderr.trim() || `exit ${added.exitCode}`}`
}

/** The builder's brief: where it works, how it says it is done, then the builder role as the mod ships it. */
async function builderBrief($: EngineInterface, m: Mission, worktree: string, branch: string): Promise<string> {
  const role = await $.fs.read(`${$.plugin.root}/skills/troupe-mission/references/builder.md`)
  const skills = m.plan.roles.find(one => one.name === 'builder')?.skills ?? []

  return [
    `You are the builder of order ${m.order.id} of mission ${m.name}.`,
    `Your worktree is ${worktree}, already on branch ${branch} (cut from the mission branch ${m.base}): do not rename it.`,
    `The plan is ${m.dir}/plan.md in your worktree; read your order there (goal, why, touches, risks, proof) and the mission's done-when criteria.`,
    `Skills the plan names for the builder: ${skills.length > 0 ? skills.join(', ') : 'none'}.`,
    `When the order is built and committed on your branch, write ${worktree}/${m.dir}/${doneMarker(m.order.id)}: what changed, what you verified and how, what is not verified. Do not commit that file; troupe hands it to the orchestrator, who merges. Then say so in this window.`,
    '',
    'Your role:',
    '',
    role,
  ].join('\n')
}

/** A light mission's last order: its review is also the mission's final review, over the whole mission diff. */
async function finalDuty($: EngineInterface, m: Mission, branch: string): Promise<string[]> {
  if (!isLight(m.plan.orders) || serialOf(m.plan).at(-1) !== m.order) return []
  const base = await baseOf(args => ok(run($, ['git', '-C', m.root, ...args])), m.base)
  const from = base
    ? `the mission's base commit ${base.commit} (the merge-base of ${m.base} with ${base.branch})`
    : `the mission's base commit, the merge-base of ${m.base} with the repository's default branch (troupe could not find it: run git merge-base yourself)`

  return [
    `This is a light mission (${m.plan.orders.length} order${m.plan.orders.length === 1 ? '' : 's'}): this review is also the mission's final review. There is no slim pass and no other final review.`,
    `Review the whole mission diff, from ${from} to ${branch}${base ? ` (git diff ${base.commit}..${branch})` : ''}, not only this order's commits, and check every done-when criterion in plan.md, one by one, on this branch.`,
  ]
}

/** The reviewer's brief: what to check out, the report's name and where to write it, then the reviewer role. */
async function reviewerBrief($: EngineInterface, m: Mission, worktree: string, branch: string): Promise<string> {
  const role = await $.fs.read(`${$.plugin.root}/skills/troupe-mission/references/reviewer.md`)
  const files = (await $.fs.list(m.dir).catch(() => [])).map(entry => entry.name)
  const rounds = files.filter(name => isReviewOf(m.order.id, name)).length
  const report = rounds === 0 ? `REVIEW-${m.order.id}.md` : `REVIEW-${m.order.id}-${rounds + 1}.md`
  const final = await finalDuty($, m, branch)
  const skills = m.plan.roles.find(one => one.name === 'reviewer')?.skills ?? []

  return [
    `You are the reviewer of order ${m.order.id} of mission ${m.name}: ${final.length > 0 ? "an order review and the mission's final review" : 'an order review'}.`,
    `Your worktree is ${worktree}, detached at ${branch}, the branch to review, against the mission branch ${m.base}.`,
    ...final,
    `The plan is ${m.dir}/plan.md there. The report template is ${$.plugin.root}/templates/REVIEW.md.`,
    `Skills the plan names for the reviewer: ${skills.length > 0 ? skills.join(', ') : 'none'}.`,
    `Write the report to ${worktree}/${m.dir}/${report} and leave it untracked: troupe copies it into the mission folder. Then say so in this window.`,
    ...(rounds > 0 ? [`This is a re-review: the earlier reports are in the orchestrator's ${m.dir}/ (${m.root}/${m.dir}).`] : []),
    '',
    'Your role:',
    '',
    role,
  ].join('\n')
}

async function dispatch($: EngineInterface, input: { mission?: unknown; order?: unknown; role?: unknown }): Promise<{ deny: string } | { result: string }> {
  if (input.role !== undefined && input.role !== 'builder' && input.role !== 'reviewer') return { deny: 'role must be builder or reviewer' }
  const role: Role = input.role === 'reviewer' ? 'reviewer' : 'builder'
  const ruled = await rule($, input.mission, input.order, role)
  if ('refused' in ruled) return { deny: ruled.refused }
  const m = ruled.mission
  const id = m.order.id
  const model = modelOf(m.plan, m.order, role)
  const effort = effortOf(m.plan, role)
  const mode = await ownPermissionMode($)
  const own = await ownSocket($)
  if (own === undefined) return { deny: 'the session is not inside tmux: troupe_dispatch opens role windows in a tmux session of their own' }
  const socket = own.socket || undefined
  const name = `troupe-${m.name}`
  const window = windowName(role, id)
  const live = await liveSession($, m.name)
  // A session that has gone is forgotten, with its windows; the next one opens it again.
  if (live === undefined) await forget($, m.name)
  const kept = live?.windows[window]
  if (kept !== undefined && (await isAlive($, live?.socket, kept.pane))) {
    return { deny: `${window} already has a window (${kept.window}, pane ${kept.pane}) in ${name}` }
  }
  if (live === undefined && (await ok(run($, argv.hasSession(socket, name)))) !== undefined) {
    return { deny: `a tmux session named ${name} exists that troupe did not open; close or rename it, then dispatch again` }
  }

  // Beside the repository, as `../<repo>-<mission>-<order>` (`-review-<order>` for its reviewer).
  const worktree = `${m.root}-${m.name}-${window}`
  // A reviewer reviews the order's fix branch once there is one.
  const branch = role === 'reviewer' && m.branches.includes(`order/${m.name}/${id}-fix`) ? `order/${m.name}/${id}-fix` : `order/${m.name}/${id}`
  const failed = await worktreeFor($, m, role, worktree, branch)
  if (failed !== undefined) return { deny: failed }

  // The brief lives where git tracks nothing: the repository's own git folder.
  const gitDir = (await ok(run($, ['git', '-C', m.root, 'rev-parse', '--path-format=absolute', '--git-common-dir'])))?.trim()
  const brief = `${gitDir ?? `${m.root}/.git`}/troupe/${m.name}/${window}.md`
  await $.fs.write(brief, await (role === 'reviewer' ? reviewerBrief($, m, worktree, branch) : builderBrief($, m, worktree, branch)))

  const opened = await run($, live === undefined ? argv.newSession(socket, name, window, worktree, model, effort, mode) : argv.newWindow(live.socket, live.id, window, worktree, model, effort, mode))
  const [sessionId, windowId, pane] = opened.stdout.trim().split(' ')
  if (opened.exitCode !== 0 || !sessionId?.startsWith('$') || !windowId || !pane) {
    return { deny: `tmux could not open the window ${window}: ${opened.stderr.trim() || `exit ${opened.exitCode}`}. The worktree ${worktree} is there; a dispatch again reuses it.` }
  }
  const session = live ?? { ...(socket && { socket }), name, id: sessionId, windows: {} }
  const record: TroupeRoleWindow = { order: id, role, window: windowId, pane, worktree, branch, isBriefSent: false }
  await keepWindow($, m.name, session, window, record)
  const where = `${window} in ${name} (window ${windowId}, worktree ${worktree}, ${role === 'reviewer' ? `detached at ${branch}` : `branch ${branch}`})`
  const pinned = `${model || 'the default model'}, effort ${effort || 'the default'}, ${mode ? `permission mode ${mode}` : "the project's permission mode (this session's could not be read)"}`

  if (!(await waitReady($, session.socket, pane))) {
    return { result: `Opened ${where} (${pinned}), but claude showed no input box in ${READY_MS / 1000} s, so the brief was not typed. It is at ${brief}; the person can type: ${typedPrompt(brief)}` }
  }
  const buffer = `troupe-${m.name}-${window}`
  await run($, argv.setBuffer(session.socket, buffer, typedPrompt(brief)))
  await run($, argv.paste(session.socket, buffer, pane))
  await run($, argv.enter(session.socket, pane))
  await $.clock.sleep(SENT_MS)
  if (isUnsent((await ok(run($, argv.capture(session.socket, pane)))) ?? '', typedPrompt(brief))) {
    return { result: `Opened ${where} (${pinned}) and pasted the brief's prompt, but it is still in claude's input box: the person presses Enter there. The brief is at ${brief}.` }
  }
  await keepWindow($, m.name, session, window, { ...record, isBriefSent: true })

  return { result: `Dispatched ${role === 'reviewer' ? `the review of ${id}` : id} (${pinned}) to ${where}: brief ${brief}, sent.` }
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

/** Closes one role window (`window`: an order id, or `review-<id>`), or with none the whole role session; only what troupe opened. */
async function close($: EngineInterface, mission: unknown, window: unknown): Promise<{ deny: string } | { result: string }> {
  if (typeof mission !== 'string' || !NAME.test(mission)) return { deny: `mission must be the name of a folder under ${MISSIONS}/` }
  const kept = (await read($, roles))[mission]
  if (kept === undefined) return { deny: `troupe opened no role session for ${mission}` }
  const live = await liveSession($, mission)
  if (window === undefined || window === '') {
    // By the id it kept, and only while tmux still names it as troupe did.
    if (live !== undefined) await run($, argv.killSession(live.socket, live.id))
    await forget($, mission)

    return { result: live ? `Closed the role session ${kept.name} (${kept.id}) and its ${Object.keys(kept.windows).length} window(s); the worktrees stay.` : `The role session ${kept.name} had already gone; forgotten.` }
  }
  const one = typeof window === 'string' ? kept.windows[window] : undefined
  if (one === undefined) return { deny: `no role window ${String(window)} in ${kept.name} (windows: ${Object.keys(kept.windows).join(', ') || 'none'})` }
  const alive = live !== undefined && (await isAlive($, kept.socket, one.pane))
  if (alive) await run($, argv.killWindow(kept.socket, one.window))
  await forget($, mission, window as string)

  return { result: alive ? `Closed ${String(window)} (${one.window}) in ${kept.name}; its worktree ${one.worktree} stays.` : `${String(window)} had already gone; forgotten.` }
}

// The copies already said to be committed on their branch since (said once per copy).
const told = new Set<string>()

/**
 * Copies what the role windows of the mission in `dir` handed back (each
 * order's done marker and review reports, from its window's worktree) into
 * `dir`, where the pane and troupe-panel read the folder. Run on the poll.
 *
 * Only plain files git does not track there: a committed one comes with the
 * merge, and an untracked copy of it would stop that merge. Only when the
 * folder has none, or an older one: what the orchestrator has is kept.
 */
export async function collectResults($: EngineInterface, dir: string): Promise<void> {
  const kept = (await read($, roles))[dir.slice(dir.lastIndexOf('/') + 1)]
  if (kept === undefined || !dir.startsWith(`${MISSIONS}/`)) return
  for (const one of Object.values(kept.windows)) {
    const from = `${one.worktree}/${dir}`
    const entries = (await $.fs.list(from).catch(() => [])).filter(entry => entry.kind === 'file' && !entry.isLink && isResultOf(one.order, entry.name))
    for (const entry of entries) {
      const to = await $.fs.stat(`${dir}/${entry.name}`).catch(() => undefined)
      const isTracked = Boolean((await ok(run($, ['git', '-C', one.worktree, 'ls-files', '--', `${dir}/${entry.name}`])))?.trim())
      if (isTracked) {
        if (to !== undefined && !told.has(`${dir}/${entry.name}`)) {
          told.add(`${dir}/${entry.name}`)
          $.ui.log(`${entry.name} is committed on ${one.branch} now: remove the copy in ${dir} before merging it`)
        }
        continue
      }
      if (to !== undefined && to.mtimeMs >= entry.mtimeMs) continue
      await $.fs.write(`${dir}/${entry.name}`, await $.fs.read(`${from}/${entry.name}`))
    }
  }
}

// ---- the wiring register.tsx calls -------------------------------------------

/** Declares the tools; called at session.start. */
export async function registerDispatch($: EngineInterface): Promise<void> {
  const mission = { type: 'string', description: 'The mission folder name under docs/missions/, such as p3' }
  await $.tool.register({
    name: 'troupe_dispatch',
    description:
      'Dispatch one order of an approved troupe mission, or its review: adds its worktree (order/<mission>/<order> from the mission branch; a review checks that branch out detached), opens a Claude window for it in the tmux session troupe-<mission>, pinned to the model and effort its role has in plan.md and to the permission mode this session runs in, and pastes its brief. Refused before the plan is approved (APPROVAL.json matching plan.md, committed on the mission branch), while an order it depends on is not merged onto the mission branch (in a light mission of one or two orders, while the order before it is not), and a review before the order is built (its DONE-<order>.md). A window that has gone is opened again in its worktree.',
    inputSchema: {
      type: 'object',
      properties: {
        mission,
        order: { type: 'string', description: 'The order id in plan.md, such as o1' },
        role: { type: 'string', enum: ['builder', 'reviewer'], description: 'builder (the default) builds the order; reviewer reviews it' },
      },
      required: ['mission', 'order'],
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'troupe_status',
    description: 'Each troupe role window opened in this session: its order, its role, and whether it is still running.',
    inputSchema: { type: 'object', properties: { mission: { ...mission, description: 'One mission; all when left out' } } },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'troupe_close',
    description: 'Close one troupe role window (window: an order id for its builder, review-<order> for its reviewer), or with no window the whole tmux session troupe-<mission>. Only what troupe opened; the worktrees stay.',
    inputSchema: { type: 'object', properties: { mission, window: { type: 'string', description: 'o1, or review-o1; all windows when left out' } }, required: ['mission'] },
    isDeferred: false,
  })
}

/** Serves the tools; called once from register. A hook that throws is refused, never half-answered. */
export function dispatchHooks(on: On): void {
  on('tool.call', { tool: 'mcp__troupe__troupe_dispatch' }, async ($, e) => dispatch($, e as unknown as { mission?: unknown; order?: unknown; role?: unknown })).catch(
    ($, e, next) => (next.called ? next(e) : { deny: 'troupe_dispatch failed; see the debug log. Check troupe_status before dispatching again.' }),
  )
  on('tool.call', { tool: 'mcp__troupe__troupe_status' }, async ($, e) => ({ result: await status($, (e as unknown as { mission?: unknown }).mission) })).catch(
    ($, e, next) => (next.called ? next(e) : { deny: 'troupe_status failed; see the debug log.' }),
  )
  on('tool.call', { tool: 'mcp__troupe__troupe_close' }, async ($, e) => {
    const input = e as unknown as { mission?: unknown; window?: unknown }

    return close($, input.mission, input.window)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'troupe_close failed; see the debug log. Check troupe_status.' }))
}
