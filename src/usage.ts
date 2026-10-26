import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import type { Dirent, Stats } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { contextWindowOf } from './statusline.ts'

export type Tokens = { used: number; window?: number; input: number; output: number }
type Kind = 'claude' | 'codex'
type Object = Record<string, unknown>
type Meta = { started: number; cwd?: string }
type Session = { path: string; stat: Stats; meta: Meta }
const CHUNK = 64 * 1024
const HEAD = 1024 * 1024
const object = (value: unknown): value is Object => typeof value === 'object' && value !== null && !Array.isArray(value)
const number = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const time = (value: unknown): number | undefined => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined
const json = (line: Buffer): Object | undefined => {
  try {
    const value: unknown = JSON.parse(line.toString('utf8'))

    return object(value) ? value : undefined
  } catch {
    return undefined
  }
}
const stamp = (stat: Stats): string => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
const directories = new Map<string, { key: string; entries: Dirent[] }>()

const entries = (path: string): Dirent[] => {
  try {
    const key = stamp(statSync(path))
    const cached = directories.get(path)
    if (cached?.key === key) return cached.entries
    const names = readdirSync(path, { withFileTypes: true })
    directories.set(path, { key, entries: names })

    return names
  } catch {
    return []
  }
}

const block = (fd: number, offset: number, length: number): Buffer => {
  const bytes = Buffer.allocUnsafe(length)
  const read = readSync(fd, bytes, 0, length, offset)
  if (read === 0 && length > 0) throw new Error('transcript changed during read')

  return bytes.subarray(0, read)
}

/** Stream complete JSONL records forward; an unterminated last record is provisional. */
function* lines(path: string, from: number, size: number): Generator<{ bytes: Buffer; end: number; complete: boolean }> {
  const fd = openSync(path, 'r')
  let parts: Buffer[] = []
  try {
    for (let offset = from; offset < size;) {
      const bytes = block(fd, offset, Math.min(CHUNK, size - offset))
      let start = 0
      for (let at = 0; at < bytes.length; at++) {
        if (bytes[at] !== 10) continue
        parts.push(bytes.subarray(start, at))
        yield { bytes: Buffer.concat(parts), end: offset + at + 1, complete: true }
        parts = []
        start = at + 1
      }
      if (start < bytes.length) parts.push(bytes.subarray(start))
      offset += bytes.length
    }
    if (parts.length > 0) yield { bytes: Buffer.concat(parts), end: size, complete: false }
  } finally {
    closeSync(fd)
  }
}

/** Read backward only until the latest cumulative Codex counter is found. */
function* reverseLines(path: string, size: number): Generator<Buffer> {
  const fd = openSync(path, 'r')
  let parts: Buffer[] = []
  try {
    for (let end = size; end > 0;) {
      const start = Math.max(0, end - CHUNK)
      const bytes = block(fd, start, end - start)
      let right = bytes.length
      for (let at = bytes.length - 1; at >= 0; at--) {
        if (bytes[at] !== 10) continue
        parts.unshift(bytes.subarray(at + 1, right))
        yield Buffer.concat(parts)
        parts = []
        right = at
      }
      if (right > 0) parts.unshift(bytes.subarray(0, right))
      end = start
    }
    if (parts.length > 0) yield Buffer.concat(parts)
  } finally {
    closeSync(fd)
  }
}

const metadata = new Map<string, { key: string; meta?: Meta }>()
const metaOf = (path: string, stat: Stats, kind: Kind): Meta | undefined => {
  const key = stamp(stat)
  const cached = metadata.get(path)
  if (cached?.key === key) return cached.meta
  let meta: Meta | undefined
  let cwd: string | undefined
  for (const { bytes } of lines(path, 0, Math.min(stat.size, HEAD))) {
    const row = json(bytes)
    if (row === undefined) continue
    if (kind === 'codex') {
      const payload = row.payload
      if (row.type === 'session_meta' && object(payload) && typeof payload.cwd === 'string') {
        const started = time(payload.timestamp) ?? time(row.timestamp)
        if (started !== undefined) meta = { started, cwd: payload.cwd }
      }
      break
    }
    if (row.isSidechain === true) { meta = undefined; break }
    if (typeof row.cwd === 'string') cwd = row.cwd
    const started = time(row.timestamp) ?? (object(row.snapshot) ? time(row.snapshot.timestamp) : undefined)
    if (started !== undefined && meta === undefined) meta = { started }
    if (cwd !== undefined && meta !== undefined) { meta.cwd = cwd; break }
  }
  metadata.set(path, { key, meta })

  return meta
}

const codexPaths = (base: string): string[] => entries(base).filter(one => one.isDirectory() && /^\d{4}$/.test(one.name)).flatMap(({ name: year }) =>
  entries(join(base, year)).filter(one => one.isDirectory() && /^\d{2}$/.test(one.name)).flatMap(({ name: month }) =>
    entries(join(base, year, month)).filter(one => one.isDirectory() && /^\d{2}$/.test(one.name)).flatMap(({ name: day }) =>
      entries(join(base, year, month, day)).filter(one => one.isFile() && /^rollout-.*\.jsonl$/.test(one.name)).map(one => join(base, year, month, day, one.name)),
    ),
  ),
)

const newest = (kind: Kind, cwd: string, since: number, home: string): Session | undefined => {
  const paths = kind === 'codex' ? codexPaths(join(home, '.codex/sessions')) : (() => {
    const dir = join(home, '.claude/projects', cwd.replace(/[/.]/g, '-'))

    return entries(dir).filter(one => one.isFile() && one.name.endsWith('.jsonl') && !one.name.startsWith('agent-')).map(one => join(dir, one.name))
  })()
  let found: Session | undefined
  for (const path of paths) {
    try {
      const stat = statSync(path)
      if (!stat.isFile()) continue
      const meta = metaOf(path, stat, kind)
      if (meta === undefined || meta.started < since || (meta.cwd !== undefined && resolve(meta.cwd) !== cwd)) continue
      if (found === undefined || meta.started > found.meta.started || (meta.started === found.meta.started && path > found.path)) found = { path, stat, meta }
    } catch { /* A transcript can disappear while sessions are being listed. */ }
  }

  return found
}

const codexCache = new Map<string, { key: string; tokens?: Tokens }>()
const codexTokens = ({ path, stat }: Session): Tokens | undefined => {
  const key = stamp(stat)
  const cached = codexCache.get(path)
  if (cached?.key === key) return cached.tokens
  let tokens: Tokens | undefined
  for (const bytes of reverseLines(path, stat.size)) {
    if (!bytes.includes('"token_count"')) continue
    const row = json(bytes)
    if (row?.type !== 'event_msg' || !object(row.payload) || row.payload.type !== 'token_count') continue
    const info = row.payload.info
    if (info === null || info === undefined) continue
    if (!object(info) || !object(info.last_token_usage) || !object(info.total_token_usage)) break
    const last = info.last_token_usage
    const total = info.total_token_usage
    if (number(last.input_tokens) && number(total.input_tokens) && number(total.output_tokens)) {
      // Codex input_tokens already includes cached_input_tokens; output includes reasoning.
      tokens = { used: last.input_tokens, input: total.input_tokens, output: total.output_tokens,
        ...(number(info.model_context_window) && info.model_context_window > 0 ? { window: info.model_context_window } : {}) }
    }
    break
  }
  codexCache.set(path, { key, tokens })

  return tokens
}

type Message = { used: number; output: number; model: string }
type Claude = { stat: Stats; offset: number; messages: Map<string, Message>; input: number; output: number; maxUsed: number; last?: Message; broken: boolean; tokens?: Tokens }
const claudeCache = new Map<string, Claude>()
const assistant = (row: Object): { id?: string; message: Message } | undefined => {
  if (row.type !== 'assistant' || row.isSidechain === true || !object(row.message) || row.message.usage === undefined) return undefined
  const usage = row.message.usage
  if (!object(usage)) throw new Error('invalid assistant usage')
  const { input_tokens: input, output_tokens: output } = usage
  const read = usage.cache_read_input_tokens ?? 0
  const create = usage.cache_creation_input_tokens ?? 0
  if (![input, output, read, create].every(number)) throw new Error('invalid assistant counters')
  const used = (input as number) + (read as number) + (create as number)
  if (!number(used)) throw new Error('invalid assistant input total')

  return { id: typeof row.message.id === 'string' ? row.message.id : typeof row.uuid === 'string' ? row.uuid : undefined,
    message: { used, output: output as number, model: typeof row.message.model === 'string' ? row.message.model : '' } }
}

const claudeView = (state: Claude, last = state.last, old?: Message): Tokens | undefined => {
  if (state.broken || last === undefined) return undefined
  const input = state.input + (old === undefined ? 0 : last.used - old.used)
  const output = state.output + (old === undefined ? 0 : last.output - old.output)
  if (!number(input) || !number(output)) return undefined
  // Claude's transcript has no window field: 200k/1m is a guess until the role's status line reports the real one.
  return { used: last.used, window: last.model.endsWith('[1m]') || Math.max(state.maxUsed, last.used) > 200_000 ? 1_000_000 : 200_000, input, output }
}

const claudeTokens = ({ path, stat }: Session): Tokens | undefined => {
  let state = claudeCache.get(path)
  if (state !== undefined && stamp(state.stat) === stamp(stat)) return state.tokens
  if (state === undefined || state.stat.dev !== stat.dev || state.stat.ino !== stat.ino || stat.size <= state.stat.size) {
    state = { stat, offset: 0, messages: new Map(), input: 0, output: 0, maxUsed: 0, broken: false }
  }
  let pending: Buffer | undefined
  for (const line of lines(path, state.offset, stat.size)) {
    if (!line.complete) { pending = line.bytes; break }
    const row = json(line.bytes)
    if (row === undefined && line.bytes.toString('utf8').trim() !== '') state.broken = true
    let parsed: ReturnType<typeof assistant>
    try { parsed = row === undefined ? undefined : assistant(row) } catch { state.broken = true }
    if (parsed !== undefined) {
      const id = parsed.id ?? `line:${line.end}`
      const old = state.messages.get(id)
      state.input += parsed.message.used - (old?.used ?? 0)
      state.output += parsed.message.output - (old?.output ?? 0)
      state.messages.set(id, parsed.message)
      state.maxUsed = Math.max(state.maxUsed, parsed.message.used)
      state.last = parsed.message
    }
    state.offset = line.end
  }
  state.stat = stat
  state.tokens = claudeView(state)
  if (pending !== undefined) {
    const row = json(pending)
    try {
      const parsed = row === undefined ? undefined : assistant(row)
      if (parsed !== undefined) state.tokens = claudeView(state, parsed.message, state.messages.get(parsed.id ?? `line:${stat.size}`) ?? { used: 0, output: 0, model: '' })
    } catch {
      state.tokens = undefined
    }
  }
  claudeCache.set(path, state)

  return state.tokens
}

/** Select by session start, not last write: an older session can still be active. */
export const tokensOf = (kind: Kind, cwd: string, since: string | undefined, home: string): Tokens | undefined => {
  try {
    if (!['claude', 'codex'].includes(kind) || cwd === '' || home === '') return undefined
    const cutoff = since === undefined ? -Infinity : time(since)
    if (cutoff === undefined) return undefined
    const session = newest(kind, resolve(cwd), cutoff, home)
    if (session === undefined) return undefined
    const tokens = kind === 'codex' ? codexTokens(session) : claudeTokens(session)
    if (tokens === undefined) return undefined
    const window = kind === 'claude' ? contextWindowOf(cwd, basename(session.path, '.jsonl')) : undefined

    return window === undefined ? { ...tokens } : { ...tokens, window }
  } catch {
    return undefined
  }
}
