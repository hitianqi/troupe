import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { claudeTurnEnded } from './usage.ts'

/** Where a Claude role's lifecycle hooks leave its turn: busy, waiting on the person, or ready. */
export const ACTIVITY_FILE = '.troupe/activity.json'
/**
 * The hook events troupe gives a Claude role; each runs `troupe activity <file>`. `PostToolBatch` fires once per
 * batch of tool calls, after all of them: it ends a wait the person answered (approved, or denied with feedback).
 * A plain deny or an interrupt fires no hook; the transcript's interrupt row ends that wait (see claudeActivity).
 */
export const ACTIVITY_EVENTS = ['UserPromptSubmit', 'PermissionRequest', 'PostToolBatch', 'Stop', 'Notification'] as const
/** A turn as the agent reports it. Busy covers working and waiting on an approval; the screen tells those two apart. */
export type Turn = 'busy' | 'ready'
/** A Claude role reports its waits too: its permission dialog (approvals, questions) holds the turn. */
export type ClaudeTurn = Turn | 'waits'

type Object = Record<string, unknown>
const object = (value: unknown): value is Object => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Claude Code hook payload → turn. A prompt or a finished tool batch runs a turn; an approval request holds it on
 * the person; Stop, or the idle notice after an interrupt, ends it.
 */
const turnOfHook = (payload: Object): ClaudeTurn | undefined => {
  const event = payload.hook_event_name
  if (event === 'UserPromptSubmit' || event === 'PostToolBatch') return 'busy'
  if (event === 'PermissionRequest') return 'waits'
  if (event === 'Stop') return 'ready'
  if (event === 'Notification' && payload.notification_type === 'idle_prompt') return 'ready'

  return undefined
}

/** How a wait on the person ended: the turn went on, or a deny or an interrupt stopped it. */
export type Answer = { at: string; then: 'working' | 'stopped' }
/** Older answers have long been told or superseded; the cap keeps a hook's read and write small. */
const ANSWERS = 50
type Saved = { turn: ClaudeTurn; at: string; session?: string; answers: Answer[] }
const answer = (value: unknown): value is Answer =>
  object(value) && typeof value.at === 'string' && (value.then === 'working' || value.then === 'stopped')
const read = (file: string): Saved | undefined => {
  try {
    const saved: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!object(saved) || (saved.turn !== 'busy' && saved.turn !== 'ready' && saved.turn !== 'waits') || typeof saved.at !== 'string') return undefined

    return { turn: saved.turn, at: saved.at, ...(typeof saved.session === 'string' ? { session: saved.session } : {}), answers: Array.isArray(saved.answers) ? saved.answers.filter(answer) : [] }
  } catch {
    return undefined
  }
}

/** A recorded wait that a deny or an interrupt ended: no hook runs for those, but the transcript has the row. */
const stoppedAt = (saved: Saved, home: string): string | undefined => {
  if (saved.turn !== 'waits' || saved.session === undefined) return undefined
  const ended = claudeTurnEnded(saved.session, home, Date.parse(saved.at))

  return ended === undefined ? undefined : new Date(ended).toISOString()
}

/**
 * `troupe activity <file>`: a hook must never fail the session, so a payload it cannot read changes nothing. Each
 * wait's end is kept as an answer: a tool batch after it means the turn went on; any other hook after it means a
 * deny or an interrupt stopped the turn, at the transcript's interrupt row. A second approval request in the same
 * batch is no end.
 */
export const recordActivity = (input: string, file: string, now = new Date(), home = homedir()): void => {
  try {
    const payload: unknown = JSON.parse(input)
    if (!object(payload)) return
    const turn = turnOfHook(payload)
    if (turn === undefined) return
    const before = read(file)
    const answers = [...before?.answers ?? []]
    if (before?.turn === 'waits' && payload.hook_event_name === 'PostToolBatch') answers.push({ at: now.toISOString(), then: 'working' })
    else if (before?.turn === 'waits' && payload.hook_event_name !== 'PermissionRequest') answers.push({ at: stoppedAt(before, home) ?? now.toISOString(), then: 'stopped' })
    const temp = `${file}.${process.pid}.tmp`
    writeFileSync(temp, `${JSON.stringify({ turn, event: payload.hook_event_name, session: payload.session_id ?? null, at: now.toISOString(), answers: answers.slice(-ANSWERS) })}\n`)
    renameSync(temp, file)
  } catch { /* The panel falls back to the screen until a hook is recorded. */ }
}

/**
 * A Claude role's turn and answered waits as its hooks recorded them since `since` (its dispatch). A wait a deny or
 * an interrupt ended has no hook yet: its interrupt row in the role's transcript, read from `home`, ends it.
 */
export const claudeActivity = (worktree: string, since: string | undefined, home?: string): { turn: ClaudeTurn; answers: Answer[] } | undefined => {
  const saved = read(join(worktree, ACTIVITY_FILE))
  if (saved === undefined || (since !== undefined && Date.parse(saved.at) < Date.parse(since))) return undefined
  const stopped = home === undefined ? undefined : stoppedAt(saved, home)

  return stopped === undefined ? { turn: saved.turn, answers: saved.answers } : { turn: 'ready', answers: [...saved.answers, { at: stopped, then: 'stopped' }] }
}

/** The turn a Claude role's hooks last recorded, if recorded since `since` (its dispatch). */
export const claudeTurn = (worktree: string, since: string | undefined, home?: string): ClaudeTurn | undefined =>
  claudeActivity(worktree, since, home)?.turn
