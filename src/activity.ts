import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Where a Claude role's lifecycle hooks leave its turn: busy or ready. */
export const ACTIVITY_FILE = '.troupe/activity.json'
/** The hook events troupe gives a Claude role; each runs `troupe activity <file>`. */
export const ACTIVITY_EVENTS = ['UserPromptSubmit', 'PermissionRequest', 'Stop', 'Notification'] as const
/** A turn as the agent reports it. Busy covers working and waiting on an approval; the screen tells those two apart. */
export type Turn = 'busy' | 'ready'

type Object = Record<string, unknown>
const object = (value: unknown): value is Object => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Claude Code hook payload → turn. A prompt or an approval request starts or holds a turn; Stop, or the idle notice after an interrupt, ends it. */
const turnOfHook = (payload: Object): Turn | undefined => {
  const event = payload.hook_event_name
  if (event === 'UserPromptSubmit' || event === 'PermissionRequest') return 'busy'
  if (event === 'Stop') return 'ready'
  if (event === 'Notification' && payload.notification_type === 'idle_prompt') return 'ready'

  return undefined
}

/** `troupe activity <file>`: a hook must never fail the session, so a payload it cannot read changes nothing. */
export const recordActivity = (input: string, file: string, now = new Date()): void => {
  try {
    const payload: unknown = JSON.parse(input)
    if (!object(payload)) return
    const turn = turnOfHook(payload)
    if (turn === undefined) return
    const temp = `${file}.${process.pid}.tmp`
    writeFileSync(temp, `${JSON.stringify({ turn, event: payload.hook_event_name, session: payload.session_id ?? null, at: now.toISOString() })}\n`)
    renameSync(temp, file)
  } catch { /* The panel falls back to the screen until a hook is recorded. */ }
}

/** The turn a Claude role's hooks last recorded, if recorded since `since` (its dispatch). */
export const claudeTurn = (worktree: string, since: string | undefined): Turn | undefined => {
  try {
    const saved: unknown = JSON.parse(readFileSync(join(worktree, ACTIVITY_FILE), 'utf8'))
    if (!object(saved) || (saved.turn !== 'busy' && saved.turn !== 'ready') || typeof saved.at !== 'string') return undefined
    if (since !== undefined && Date.parse(saved.at) < Date.parse(since)) return undefined

    return saved.turn
  } catch {
    return undefined
  }
}
