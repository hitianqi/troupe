import { spawnSync } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Where a Claude role's status line leaves the context window Claude Code reports. */
export const CONTEXT_FILE = '.troupe/context.json'

type Object = Record<string, unknown>
const object = (value: unknown): value is Object => typeof value === 'object' && value !== null && !Array.isArray(value)
const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

/** The status line command Claude Code would run for a session in `root`: local, then project, then user settings. */
export const statusLineCommand = (root: string, home: string): string | undefined => {
  for (const path of [join(root, '.claude/settings.local.json'), join(root, '.claude/settings.json'), join(home, '.claude/settings.json')]) {
    const settings = readJson(path)
    if (!object(settings) || !object(settings.statusLine)) continue
    const { type, command } = settings.statusLine

    return type === 'command' && typeof command === 'string' && command.trim() !== '' ? command : undefined
  }

  return undefined
}

/** Claude Code has no window field in its transcript; its status line payload has the real one. */
export const contextWindowOf = (worktree: string, session: string): number | undefined => {
  const saved = readJson(join(worktree, CONTEXT_FILE))
  if (!object(saved) || saved.session !== session) return undefined

  return typeof saved.window === 'number' && Number.isSafeInteger(saved.window) && saved.window > 0 ? saved.window : undefined
}

/** `troupe statusline <file> [command]`: keep the payload's window for the panel, then show the person's own status line. */
export const statusLine = (input: string, file: string, forward?: string): string => {
  try {
    const payload: unknown = JSON.parse(input)
    if (object(payload) && object(payload.context_window) && typeof payload.session_id === 'string') {
      const temp = `${file}.${process.pid}.tmp`
      writeFileSync(temp, `${JSON.stringify({ session: payload.session_id, window: payload.context_window.context_window_size })}\n`)
      renameSync(temp, file)
    }
  } catch { /* A status line must never fail the session; the panel falls back to its guess. */ }
  if (forward === undefined || forward === '') return ''
  const shown = spawnSync('/bin/sh', ['-c', forward], { input, encoding: 'utf8', timeout: 5000 })

  return shown.stdout ?? ''
}
