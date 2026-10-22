import type { EngineInterface, On } from 'claude-code'

import { readApproval } from './approval.ts'
import { baseOf, isReviewOf, missionBranchOf } from './mission.ts'
import { isLight, readPlan } from './plan.ts'

// troupe_metrics: what a mission cost and how it ran, written at teardown to
// docs/missions/<mission>/metrics.json, so a troupe mission can be set against
// the rig-kit baseline and the comparison protocol's other arms
// (docs/missions/p4/compare.md). It reads only what lasts: plan.md, the
// approval record, the review files, git, and the Claude Code transcripts of
// the orchestrator, its subagents and the role windows. The windows are found
// by their worktree paths, not by $.state alone: troupe_close forgets them.
//
// The transcript format is Claude Code's and moves between releases. What
// troupe cannot read, or cannot know at all, is written as null with its
// reason under `nulls`, keyed by the field's path; it is never guessed.

const MISSIONS = 'docs/missions'
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
export const METRICS_FILE = 'metrics.json'

/**
 * List prices in USD per million tokens (the claude-api skill's table,
 * cached 2026-10-06): input, output, cache read, and cache write for the
 * 5-minute and the 1-hour lifetime (1.25x and 2x input). Haiku 5.5 is left
 * out on purpose: its price depends on each prompt's size.
 */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; write5m: number; write1h: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, write5m: 5, write1h: 8 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, write5m: 2.5, write1h: 4 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, write5m: 12.5, write1h: 20 },
}
export const PRICES_SOURCE = 'API list prices per MTok from the claude-api skill (cached 2026-10-06); cache read and the 5-minute and 1-hour cache writes priced apart'

// ---- one transcript ----------------------------------------------------------

type Usage = { input: number; output: number; cacheWrite: number; cacheRead: number; cost: number | null; costWhyNull?: string }
/** A troupe_dispatch or Agent call, as the orchestrator made it. */
export type Call = { at: string; tool: string; input: Record<string, unknown>; error?: string }
export type Refusals = { hook: number; classifier: number; troupe: number; declined: number; other: number }

export type TranscriptRead = {
  usage: Usage
  models: string[]
  efforts: string[]
  firstAt?: string
  lastAt?: string
  calls: Call[]
  refusals: Refusals
  /** Permission prompts a person answered (yes or no), from the transcript's permission decisions. */
  personPrompts: number
  /** Lines that are not JSON: a format change or a file cut mid-write. */
  badLines: number
}

const HOOK = /^\w+(:\w+)? hook (error|blocked)/
const CLASSIFIER = /denied by the Claude Code auto mode classifier|denied by a built-in Claude Code safety/
const DECLINED = /^The user doesn't want to proceed with this tool use/
const TROUPE_TOOL = /(^|__)troupe_(dispatch|status|close|metrics)$/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const textOf = (content: unknown): string =>
  typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => (isRecord(part) && typeof part.text === 'string' ? part.text : '')).join(' ') : ''
const unwrap = (text: string) => text.replace(/^<tool_use_error>|<\/tool_use_error>$/g, '').trim()

/** One assistant message's price, or why there is none. */
export function priceOf(model: string, usage: Record<string, unknown>): { cost: number } | { why: string } {
  const price = PRICES[model]
  if (price === undefined) return { why: `no list price in troupe's table for ${model}` }
  if (usage.speed !== undefined && usage.speed !== 'standard') return { why: `a ${String(usage.speed)} request, priced apart from the list` }
  const written = number(usage.cache_creation_input_tokens)
  const split = isRecord(usage.cache_creation) ? usage.cache_creation : undefined
  if (written > 0 && split === undefined) return { why: 'cache writes without their 5-minute / 1-hour split' }
  const write5m = number(split?.ephemeral_5m_input_tokens)
  const write1h = number(split?.ephemeral_1h_input_tokens)
  const perToken =
    number(usage.input_tokens) * price.input +
    number(usage.output_tokens) * price.output +
    number(usage.cache_read_input_tokens) * price.cacheRead +
    write5m * price.write5m +
    write1h * price.write1h

  return { cost: perToken / 1e6 }
}

/** A JSONL transcript: tokens and cost per message (a message split over lines counted once), models, efforts, times, calls and refusals. */
export function readTranscript(text: string): TranscriptRead {
  const messages = new Map<string, { model: string; usage: Record<string, unknown> }>()
  const models = new Set<string>()
  const efforts = new Set<string>()
  const pending = new Map<string, Call>()
  const calls: Call[] = []
  const refusals: Refusals = { hook: 0, classifier: 0, troupe: 0, declined: 0, other: 0 }
  let personPrompts = 0
  let firstAt: string | undefined
  let lastAt: string | undefined
  let badLines = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let entry: unknown
    try {
      entry = JSON.parse(line)
    } catch {
      badLines++
      continue
    }
    if (!isRecord(entry)) continue
    const at = typeof entry.timestamp === 'string' ? entry.timestamp : undefined
    if (at !== undefined) {
      if (firstAt === undefined || at < firstAt) firstAt = at
      if (lastAt === undefined || at > lastAt) lastAt = at
    }
    const message = isRecord(entry.message) ? entry.message : undefined
    const content = Array.isArray(message?.content) ? message.content.filter(isRecord) : []
    if (entry.type === 'assistant' && message !== undefined) {
      const model = typeof message.model === 'string' ? message.model : ''
      // `<synthetic>` marks a message the engine wrote itself, with no request behind it.
      if (model !== '' && model !== '<synthetic>') models.add(model)
      if (typeof entry.effort === 'string') efforts.add(entry.effort)
      const id = typeof message.id === 'string' ? message.id : `line-${messages.size}`
      if (isRecord(message.usage) && model !== '<synthetic>') messages.set(id, { model, usage: message.usage })
      for (const part of content) {
        if (part.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') {
          const call = { at: at ?? '', tool: part.name, input: isRecord(part.input) ? part.input : {} }
          pending.set(part.id, call)
          if (TROUPE_TOOL.test(part.name) || part.name === 'Agent' || part.name === 'Task') calls.push(call)
        }
      }
    }
    if (entry.type === 'user') {
      // Claude Code's record of the permission check, where it writes one: who decided, and how.
      const decision = isRecord(entry.permissionDecision) ? entry.permissionDecision : undefined
      const source = typeof decision?.source === 'string' ? decision.source : ''
      if (source.startsWith('user')) personPrompts++
      for (const part of content) {
        if (part.type !== 'tool_result' || part.is_error !== true) continue
        const said = unwrap(textOf(part.content))
        const call = typeof part.tool_use_id === 'string' ? pending.get(part.tool_use_id) : undefined
        if (call !== undefined && TROUPE_TOOL.test(call.tool)) {
          call.error = said
          refusals.troupe++
        } else if (decision?.decision === 'reject') {
          if (source === 'hook') refusals.hook++
          else if (decision.reasonType === 'classifier' || decision.reasonType === 'safetyCheck') refusals.classifier++
          else if (source === 'user_reject' || entry.toolDenialKind === 'user-rejected') refusals.declined++
          else refusals.other++
        } else if (decision !== undefined) continue
        // Older transcripts carry no decision: the error's own words.
        else if (HOOK.test(said)) refusals.hook++
        else if (CLASSIFIER.test(said)) refusals.classifier++
        else if (DECLINED.test(said)) refusals.declined++
        else if (call !== undefined && (call.tool === 'Agent' || call.tool === 'Task')) call.error = said
      }
    }
  }
  const usage: Usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 }
  for (const { model, usage: one } of messages.values()) {
    usage.input += number(one.input_tokens)
    usage.output += number(one.output_tokens)
    usage.cacheWrite += number(one.cache_creation_input_tokens)
    usage.cacheRead += number(one.cache_read_input_tokens)
    const priced = priceOf(model, one)
    if ('why' in priced) {
      usage.costWhyNull ??= priced.why
      usage.cost = null
    } else if (usage.cost !== null) usage.cost += priced.cost
  }

  return { usage, models: [...models], efforts: [...efforts], firstAt, lastAt, calls, refusals, personPrompts, badLines }
}

// ---- the mission's sheet ------------------------------------------------------

/** Claude Code's folder name for a project directory: every character but a letter or digit becomes `-`. */
export const slugOf = (path: string) => path.replace(/[^A-Za-z0-9]/g, '-')

type Role = 'orchestrator' | 'builder' | 'reviewer'
const ROLES: Role[] = ['orchestrator', 'builder', 'reviewer']

/** A subagent's role from its description: `<id>:` and cuts or fixes build (`fix final review findings` too), reviews and the slim pass review, the rest is the orchestrator's. */
export function roleOfSubagent(description: string): Role {
  if (/^[A-Za-z0-9_-]+:/.test(description)) return 'builder'
  if (/\b(cut|cuts|fix|fixer|fixes)\b/i.test(description)) return 'builder'
  if (/review|slim pass/i.test(description)) return 'reviewer'

  return 'orchestrator'
}

/** `N files changed, X insertions(+), Y deletions(-)` as numbers. */
export function shortstat(text: string): { files: number; added: number; removed: number } {
  const count = (pattern: RegExp) => Number(pattern.exec(text)?.[1] ?? 0)

  return { files: count(/(\d+) files? changed/), added: count(/(\d+) insertions?\(\+\)/), removed: count(/(\d+) deletions?\(-\)/) }
}

const seconds = (from?: string, to?: string) => {
  if (from === undefined || to === undefined) return null
  const span = (Date.parse(to) - Date.parse(from)) / 1000

  return Number.isFinite(span) ? Math.round(span) : null
}
const round = (value: number | null, places = 4) => (value === null ? null : Math.round(value * 10 ** places) / 10 ** places)

type RoleSheet = {
  sessions: string[]
  input_tokens: number | null
  output_tokens: number | null
  cache_write_tokens: number | null
  cache_read_tokens: number | null
  cost_usd: number | null
  model_effective: string[] | null
  effort_effective: { values: string[]; source: string } | null
}

export type Sheet = Record<string, unknown> & { nulls: Record<string, string> }

/** What the engine and git hand the sheet; built by `gather`, kept plain so a test can hand it over. */
export type Facts = {
  mission: string
  claudeVersion: string | null
  plan: ReturnType<typeof readPlan>
  files: string[]
  approvedAt: string | null
  missionBranch: string | null
  baseCommit: string | null
  /** The branch the base commit is the merge-base with. */
  baseFrom: string | null
  tip: { sha: string; at: string } | null
  /** `<id>: …` commits on the mission branch, newest first: sha, committer time, subject, and its shortstat. */
  merges: { sha: string; at: string; subject: string; stat: string }[]
  diffStat: string | null
  /** Transcripts by role: the path and its text. */
  transcripts: Record<Role, { path: string; text: string }[]>
  /** The orchestrator's own transcript (also listed under orchestrator), whose calls give dispatches and refusals. */
  orchestratorPath: string | null
  subagents: { description: string; role: Role }[]
  /** Why a source could not be read, by what it is. */
  missing: Record<string, string>
}

/** The sheet from the facts: every field named in the plan and in compare.md's Metrics, null with its reason where troupe cannot know it. */
export function sheetOf(f: Facts, writtenAt: string): Sheet {
  const nulls: Record<string, string> = {}
  const unknown = (path: string, why: string) => {
    nulls[path] = why

    return null
  }

  const reads = Object.fromEntries(ROLES.map(role => [role, f.transcripts[role].map(one => ({ path: one.path, read: readTranscript(one.text) }))])) as Record<
    Role,
    { path: string; read: TranscriptRead }[]
  >
  const own = reads.orchestrator.find(one => one.path === f.orchestratorPath)?.read
  const calls = own?.calls ?? []

  // Orders: model, review and fix rounds, wall time from dispatch to merge, and size.
  const finalReviews = f.files.filter(name => /^REVIEW(-\d+)?\.md$/.test(name)).length
  const orders = f.plan.orders.map(order => {
    const rounds = f.files.filter(name => isReviewOf(order.id, name)).length
    const merge = f.merges.find(one => one.subject.startsWith(`${order.id}: `))
    const started = calls.find(
      call =>
        call.error === undefined &&
        ((TROUPE_TOOL.test(call.tool) && call.tool.endsWith('troupe_dispatch') && call.input.order === order.id && (call.input.role ?? 'builder') === 'builder') ||
          (!TROUPE_TOOL.test(call.tool) && typeof call.input.description === 'string' && call.input.description.startsWith(`${order.id}:`))),
    )
    const key = `orders.${order.id}`
    const wall =
      merge === undefined
        ? unknown(`${key}.wall_time_s`, `${order.id} is not merged onto the mission branch (no commit titled "${order.id}: …")`)
        : started === undefined
          ? unknown(`${key}.wall_time_s`, own === undefined ? "the orchestrator's transcript was not found" : `no dispatch of ${order.id} in the orchestrator's transcript`)
          : seconds(started.at, merge.at)

    return {
      id: order.id,
      model: order.model || null,
      merged: merge !== undefined,
      review_rounds: rounds,
      fix_rounds: Math.max(0, rounds - 1),
      wall_time_s: wall,
      diff_size: merge === undefined ? unknown(`${key}.diff_size`, `${order.id} is not merged`) : shortstat(merge.stat),
    }
  })
  const orderReviews = orders.reduce((sum, order) => sum + order.review_rounds, 0)
  const fixRounds = orders.reduce((sum, order) => sum + order.fix_rounds, 0) + Math.max(0, finalReviews - 1)

  // Refused dispatches: troupe_dispatch calls the orchestrator saw answered with a refusal.
  const refused = calls.filter(call => call.tool.endsWith('troupe_dispatch') && call.error !== undefined).map(call => call.error ?? '')

  // Tokens, cost, models and efforts, by role.
  const roleSheet = (role: Role): RoleSheet => {
    const found = reads[role]
    const key = `tokens.${role}`
    if (found.length === 0) {
      const why = f.missing[role] ?? `no ${role} transcript found`
      for (const field of ['input_tokens', 'output_tokens', 'cache_write_tokens', 'cache_read_tokens', 'cost_usd', 'model_effective', 'effort_effective']) unknown(`${key}.${field}`, why)

      return { sessions: [], input_tokens: null, output_tokens: null, cache_write_tokens: null, cache_read_tokens: null, cost_usd: null, model_effective: null, effort_effective: null }
    }
    const sum = (pick: (usage: Usage) => number) => found.reduce((total, one) => total + pick(one.read.usage), 0)
    const costs = found.map(one => one.read.usage)
    const unpriced = costs.find(usage => usage.cost === null)
    const efforts = [...new Set(found.flatMap(one => one.read.efforts))]
    const bad = found.reduce((total, one) => total + one.read.badLines, 0)
    if (bad > 0) nulls[`${key}.bad_lines`] = `${bad} transcript line(s) were not JSON and were skipped; the counts may be low`

    return {
      sessions: found.map(one => one.path),
      input_tokens: sum(usage => usage.input),
      output_tokens: sum(usage => usage.output),
      cache_write_tokens: sum(usage => usage.cacheWrite),
      cache_read_tokens: sum(usage => usage.cacheRead),
      cost_usd: unpriced !== undefined ? unknown(`${key}.cost_usd`, unpriced.costWhyNull ?? 'a message could not be priced') : round(costs.reduce((total, usage) => total + (usage.cost ?? 0), 0)),
      model_effective: [...new Set(found.flatMap(one => one.read.models))].sort(),
      effort_effective:
        efforts.length > 0
          ? { values: efforts, source: "the transcript's assistant lines (`effort`), as Claude Code ran them" }
          : unknown(`${key}.effort_effective`, 'the transcript records no effort on its assistant lines'),
    }
  }
  const byRole = Object.fromEntries(ROLES.map(role => [role, roleSheet(role)])) as Record<Role, RoleSheet>
  const allKnown = ROLES.every(role => byRole[role].input_tokens !== null)
  const total = (field: 'input_tokens' | 'output_tokens' | 'cache_write_tokens' | 'cache_read_tokens') =>
    allKnown ? ROLES.reduce((sum, role) => sum + (byRole[role][field] ?? 0), 0) : unknown(`tokens.total.${field}`, 'a role has no transcript; a total would be low')
  const costKnown = ROLES.every(role => byRole[role].cost_usd !== null)
  const tokensOf = (role: Role) => {
    const one = byRole[role]

    return (one.input_tokens ?? 0) + (one.output_tokens ?? 0) + (one.cache_write_tokens ?? 0) + (one.cache_read_tokens ?? 0)
  }
  const everything = ROLES.reduce((sum, role) => sum + tokensOf(role), 0)

  // Refusals across every transcript of the mission.
  const refusals = ROLES.flatMap(role => reads[role]).reduce(
    (sum, one) => ({
      hook: sum.hook + one.read.refusals.hook,
      classifier: sum.classifier + one.read.refusals.classifier,
      troupe: sum.troupe + one.read.refusals.troupe,
      declined: sum.declined + one.read.refusals.declined,
      other: sum.other + one.read.refusals.other,
    }),
    { hook: 0, classifier: 0, troupe: 0, declined: 0, other: 0 },
  )
  const prompts = [...reads.builder, ...reads.reviewer].reduce((sum, one) => sum + one.read.personPrompts, 0)

  const mrReady = f.tip?.at
  const human = 'troupe does not see the human; it comes from the run\'s reply log'

  return {
    mission: f.mission,
    written_at: writtenAt,
    claude_version: f.claudeVersion ?? unknown('claude_version', f.missing.version ?? 'the engine did not say its version'),
    mode: isLight(f.plan.orders) ? 'light' : 'full',
    mission_branch: f.missionBranch ?? unknown('mission_branch', f.missing.git ?? 'no mission branch'),
    base_commit: f.baseCommit ?? unknown('base_commit', f.missing.base ?? 'the base commit could not be found'),
    base_commit_from: f.baseFrom === null ? null : `the merge-base of the mission branch with ${f.baseFrom}, read before that branch holds the mission (run troupe_metrics before any fetch after the merge)`,
    mr_ready_commit: f.tip?.sha ?? unknown('mr_ready_commit', f.missing.git ?? 'no mission branch'),
    orders,
    review_rounds: { orders: orderReviews, final: finalReviews, total: orderReviews + finalReviews },
    refused_dispatches:
      own === undefined
        ? unknown('refused_dispatches', f.missing.orchestrator ?? "the orchestrator's transcript was not found")
        : { count: refused.length, reasons: refused },
    time: {
      approved_at: f.approvedAt ?? unknown('time.approved_at', `no approval record (APPROVAL.json) in ${MISSIONS}/${f.mission}`),
      mr_ready_at: mrReady ?? unknown('time.mr_ready_at', f.missing.git ?? 'no mission branch'),
      plan_approved_to_mr_ready_s:
        f.approvedAt !== null && mrReady !== undefined ? seconds(f.approvedAt, mrReady) : unknown('time.plan_approved_to_mr_ready_s', 'the approval time or the MR-ready commit is missing'),
      wall_time_s:
        own?.firstAt !== undefined && mrReady !== undefined
          ? seconds(own.firstAt, mrReady)
          : unknown('time.wall_time_s', "the orchestrator's transcript or the MR-ready commit is missing"),
      wall_time_from: "the first entry of the orchestrator's transcript (a fresh session per run) to the mission branch's last commit",
      human_attention_s: unknown('time.human_attention_s', human),
      human_interruptions: unknown('time.human_interruptions', human),
      waiting_on_human_s: unknown('time.waiting_on_human_s', human),
    },
    tokens: {
      ...byRole,
      total: {
        input_tokens: total('input_tokens'),
        output_tokens: total('output_tokens'),
        cache_write_tokens: total('cache_write_tokens'),
        cache_read_tokens: total('cache_read_tokens'),
        cost_usd: costKnown ? round(ROLES.reduce((sum, role) => sum + (byRole[role].cost_usd ?? 0), 0)) : unknown('tokens.total.cost_usd', 'a role has no price: see its cost_usd'),
      },
    },
    coordination_share:
      allKnown && everything > 0
        ? round((tokensOf('orchestrator') + tokensOf('reviewer')) / everything, 3)
        : unknown('coordination_share', 'a role has no transcript'),
    coordination_share_from: "all four token kinds of the orchestrator's and the reviewers' sessions over every session's: by session purpose",
    quality: {
      blind_review_act_on: unknown('quality.blind_review_act_on', 'the blind review runs after the mission, outside troupe'),
      blind_review_consider: unknown('quality.blind_review_consider', 'the blind review runs after the mission, outside troupe'),
      make_check: unknown('quality.make_check', "troupe does not run the project's check; the reviews record it"),
      handtest_defects: unknown('quality.handtest_defects', "the human's hand test happens outside troupe"),
      diff_size: f.diffStat === null ? unknown('quality.diff_size', f.missing.git ?? 'no diff against the base commit') : shortstat(f.diffStat),
      diff_size_from: `git's shortstat against the base commit (each order's: its merge commit), leaving out the mission folder ${MISSIONS}/${f.mission}: the plan, the approval and the review records are not the product change`,
    },
    rework: {
      fix_rounds: fixRounds,
      churn_lines: unknown('rework.churn_lines', "not counted: it needs each order branch's commit timeline, and the squash merges hide it"),
      refusals: { ...refusals, total: refusals.hook + refusals.classifier + refusals.troupe + refusals.declined + refusals.other },
      refusals_from:
        "refused tool calls in every transcript of the mission, by Claude Code's permission decision where it records one, else by the error's words: hook (a hook refused), classifier (auto mode or the built-in safety check), troupe (a troupe tool's refusal), declined (a person or a permission rule said no), other",
      blocked_s: unknown('rework.blocked_s', 'the transcripts do not say how long a refusal held the work'),
      prompts_in_role_windows:
        reads.builder.length + reads.reviewer.length > 0
          ? prompts
          : unknown('rework.prompts_in_role_windows', 'no builder or reviewer transcript was found'),
      prompts_from: "permission prompts a person answered, yes or no, in the builders' and reviewers' sessions (Claude Code's permission decisions from a user_* source)",
    },
    subagents: f.subagents,
    prices: { source: PRICES_SOURCE, usd_per_mtok: PRICES },
    nulls,
  }
}

// ---- reading it from the engine and git --------------------------------------

function run($: EngineInterface, command: string[]) {
  return $.process.run(command, { timeoutMs: 20_000 }).catch(error => ({ exitCode: -1, stdout: '', stderr: String(error) }))
}

/** The `.jsonl` files in a folder, with their text; [] when the folder is not there. */
async function jsonl($: EngineInterface, folder: string): Promise<{ path: string; text: string }[]> {
  const entries = await $.fs.list(folder).catch(() => [])
  const files: { path: string; text: string }[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' || entry.isLink || !entry.name.endsWith('.jsonl')) continue
    const text = await $.fs.read(`${folder}/${entry.name}`).catch(() => undefined)
    if (text !== undefined) files.push({ path: `${folder}/${entry.name}`, text })
  }

  return files
}

/** Where Claude Code keeps its transcripts: one folder per project directory. */
async function projectsOf($: EngineInterface): Promise<string> {
  const config = (await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)) || `${(await $.env.get('HOME').catch(() => undefined)) ?? ''}/.claude`

  return `${config}/projects`
}

/**
 * This session's transcript, `<projects>/<slug of its folder>/<session id>.jsonl`,
 * looked for under the session's directory, its root, then `more`; `folder`
 * is the session's own folder beside it (its subagents). Undefined when the
 * engine gives no session id or no such file is there.
 */
export async function ownTranscript($: EngineInterface, more: string[] = []): Promise<{ path: string; text: string; folder: string } | undefined> {
  const id = await $.session.id().catch(() => undefined)
  if (id === undefined) return undefined
  const projects = await projectsOf($)
  const places = [...new Set([await $.session.cwd().catch(() => undefined), await $.session.root().catch(() => undefined), ...more].filter((one): one is string => Boolean(one)))]
  for (const place of places) {
    const path = `${projects}/${slugOf(place)}/${id}.jsonl`
    const text = await $.fs.read(path).catch(() => undefined)
    if (text !== undefined) return { path, text, folder: `${projects}/${slugOf(place)}/${id}` }
  }

  return undefined
}

/** Every fact the sheet needs, from the mission folder, git, the engine and the transcripts. */
export async function gather($: EngineInterface, mission: string): Promise<Facts | { refused: string }> {
  const dir = `${MISSIONS}/${mission}`
  const source = await $.fs.read(`${dir}/plan.md`).catch(() => undefined)
  if (source === undefined) return { refused: `no plan.md in ${dir}` }
  const plan = readPlan(source)
  const files = (await $.fs.list(dir).catch(() => [])).map(entry => entry.name)
  const missing: Record<string, string> = {}
  const git = async (...args: string[]) => {
    const result = await run($, ['git', '-C', root, ...args])

    return result.exitCode === 0 ? result.stdout : undefined
  }

  const root = (await run($, ['git', 'rev-parse', '--show-toplevel'])).stdout.trim()
  const branches = root === '' ? [] : ((await git('for-each-ref', '--format=%(refname:short)', 'refs/heads/'))?.split('\n').filter(Boolean) ?? [])
  const missionBranch = missionBranchOf(mission, branches) ?? null
  if (root === '') missing.git = 'the session is not in a git repository'
  else if (missionBranch === null) missing.git = `no mission branch for ${mission} (a local branch named for it)`

  // The base: where the mission branch left the base branch (origin's HEAD, else main, else master).
  let baseCommit: string | null = null
  let baseFrom: string | null = null
  if (missionBranch !== null) {
    const found = await baseOf(args => git(...args), missionBranch)
    baseCommit = found?.commit ?? null
    baseFrom = found?.branch ?? null
    if (baseCommit === null) missing.base = 'no base branch (origin/HEAD, main or master) shares history with the mission branch'
  }
  let tip: Facts['tip'] = null
  const merges: Facts['merges'] = []
  let diffStat: string | null = null
  // The product change only: the mission folder holds troupe's own records (plan, approval, done and review copies).
  const product = ['--', '.', `:(exclude)${dir}`]
  if (missionBranch !== null) {
    const [sha, at] = ((await git('log', '-1', '--format=%H%x09%cI', missionBranch)) ?? '').trim().split('\t')
    if (sha && at) tip = { sha, at }
    if (baseCommit !== null) {
      const log = (await git('log', '--format=%H%x09%cI%x09%s', `${baseCommit}..${missionBranch}`)) ?? ''
      for (const line of log.split('\n')) {
        const [one, when, ...rest] = line.split('\t')
        const subject = rest.join('\t')
        if (!one || !when || !plan.orders.some(order => subject.startsWith(`${order.id}: `))) continue
        merges.push({ sha: one, at: when, subject, stat: (await git('show', '--shortstat', '--format=', one, ...product)) ?? '' })
      }
      diffStat = (await git('diff', '--shortstat', baseCommit, missionBranch, ...product)) ?? null
    }
  }

  // The transcripts: the orchestrator's (this session's), its subagents' and the role windows'.
  const projects = await projectsOf($)
  const transcripts: Facts['transcripts'] = { orchestrator: [], builder: [], reviewer: [] }
  const subagents: Facts['subagents'] = []
  const own = await ownTranscript($, root === '' ? [] : [root])
  const orchestratorPath = own?.path ?? null
  if (own !== undefined) {
    transcripts.orchestrator.push({ path: own.path, text: own.text })
    // Its subagents: a transcript and a meta file each, the meta naming the description.
    for (const one of await jsonl($, `${own.folder}/subagents`)) {
      const meta = await $.fs.read(one.path.replace(/\.jsonl$/, '.meta.json')).catch(() => undefined)
      let description = ''
      try {
        const parsed: unknown = meta === undefined ? undefined : JSON.parse(meta)
        if (isRecord(parsed) && typeof parsed.description === 'string') description = parsed.description
      } catch {
        // No readable meta: the subagent counts as the orchestrator's.
      }
      const role = roleOfSubagent(description)
      subagents.push({ description, role })
      transcripts[role].push(one)
    }
  } else {
    missing.orchestrator =
      (await $.session.id().catch(() => undefined)) === undefined
        ? 'the engine did not give the session id'
        : `no transcript of this session under ${projects} for its directory, its root or ${root || 'the repository root'}`
  }
  // The role windows: one folder per worktree, found by its path (troupe_close forgets the windows) and by what $.state still holds.
  const kept = (await $.state.get({ plugin: 'troupe', key: 'roles' }).catch(() => undefined))?.value
  const worktrees = new Map<string, Role>()
  if (root !== '') {
    for (const order of plan.orders) {
      worktrees.set(`${root}-${mission}-${order.id}`, 'builder')
      worktrees.set(`${root}-${mission}-review-${order.id}`, 'reviewer')
    }
  }
  for (const window of Object.values(kept?.[mission]?.windows ?? {})) {
    if (typeof window.worktree === 'string') worktrees.set(window.worktree, window.role === 'reviewer' ? 'reviewer' : 'builder')
  }
  for (const [worktree, role] of worktrees) transcripts[role].push(...(await jsonl($, `${projects}/${slugOf(worktree)}`)))
  for (const role of ['builder', 'reviewer'] as const) {
    if (transcripts[role].length === 0) missing[role] = `no ${role} transcript under ${projects} for the worktrees ${[...worktrees].filter(([, one]) => one === role).map(([path]) => path).join(', ') || '(none)'}`
  }

  const version = await $.session.version().catch(() => undefined)
  if (version === undefined) missing.version = 'the engine did not say its version'
  const approval = await readApproval($, dir).catch(() => null)

  return {
    mission,
    claudeVersion: version?.version ?? null,
    plan,
    files,
    approvedAt: approval?.approvedAt ?? null,
    missionBranch,
    baseCommit,
    baseFrom,
    tip,
    merges,
    diffStat,
    transcripts,
    orchestratorPath,
    subagents,
    missing,
  }
}

/** The one-line summary troupe_metrics answers with. */
export function summaryOf(sheet: Sheet): string {
  const time = sheet.time as { plan_approved_to_mr_ready_s: number | null }
  const total = (sheet.tokens as { total: { cost_usd: number | null } }).total
  const span = time.plan_approved_to_mr_ready_s
  const clock = span === null ? 'approved→MR-ready unknown' : `${Math.floor(span / 3600)}h${String(Math.round((span % 3600) / 60)).padStart(2, '0')}m approved→MR-ready`
  const refused = sheet.refused_dispatches as { count: number } | null
  const rounds = sheet.review_rounds as { total: number }

  return [
    `${(sheet.orders as unknown[]).length} orders (${String(sheet.mode)})`,
    `${rounds.total} reviews`,
    `${(sheet.rework as { fix_rounds: number }).fix_rounds} fix round(s)`,
    `${refused === null ? '?' : refused.count} refused dispatch(es)`,
    clock,
    total.cost_usd === null ? 'cost unknown' : `$${total.cost_usd.toFixed(2)} at list prices`,
    `${Object.keys(sheet.nulls).length} field(s) null with a reason`,
  ].join(', ')
}

async function metrics($: EngineInterface, mission: unknown): Promise<{ deny: string } | { result: string }> {
  if (typeof mission !== 'string' || !NAME.test(mission)) return { deny: `mission must be the name of a folder under ${MISSIONS}/ (letters, digits, _ and -)` }
  const facts = await gather($, mission)
  if ('refused' in facts) return { deny: facts.refused }
  const sheet = sheetOf(facts, new Date(await $.clock.now()).toISOString())
  const path = `${MISSIONS}/${mission}/${METRICS_FILE}`
  await $.fs.write(path, `${JSON.stringify(sheet, null, 2)}\n`)

  return { result: `Wrote ${path}: ${summaryOf(sheet)}.` }
}

// ---- the wiring register.tsx calls -------------------------------------------

/** Declares troupe_metrics; called at session.start. */
export async function registerMetrics($: EngineInterface): Promise<void> {
  await $.tool.register({
    name: 'troupe_metrics',
    description:
      "Write docs/missions/<mission>/metrics.json for a troupe mission, at teardown and before anything is removed: orders and their models, review and fix rounds, refused dispatches, wall times, tokens and cost at list prices per role (orchestrator, builder, reviewer) from the Claude Code transcripts, the models and efforts they ran, refusals and the diff's size. A field troupe cannot know is null, with its reason under `nulls`. Answers the file's path and a one-line summary.",
    inputSchema: {
      type: 'object',
      properties: { mission: { type: 'string', description: 'The mission folder name under docs/missions/, such as p4' } },
      required: ['mission'],
    },
    isDeferred: false,
  })
}

/** Serves troupe_metrics; called once from register. A hook that throws is refused, never half-answered. */
export function metricsHooks(on: On): void {
  on('tool.call', { tool: 'mcp__troupe__troupe_metrics' }, async ($, e) => metrics($, (e as unknown as { mission?: unknown }).mission)).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'troupe_metrics failed; see the debug log.' },
  )
}
