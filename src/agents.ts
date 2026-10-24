import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TONES } from './canvas.ts'
import type { Tone } from './canvas.ts'
import type { Role } from './plan.ts'
import { parseYaml } from './yaml.ts'
import type { Yaml } from './yaml.ts'

export type Screen = 'waits' | 'working' | 'ready' | 'unknown'
export type Badge = { glyph: string; tone: Tone }

/** Badges occupy exactly one cell: exclude controls, combining, wide and emoji glyphs. */
export const validBadgeGlyph = (glyph: string): boolean => {
  const point = glyph.codePointAt(0) ?? 0

  return [...glyph].length === 1 && !/[\s\p{M}\p{C}\p{Emoji_Presentation}]/u.test(glyph) &&
    !(point >= 0x1100 && (point <= 0x115f || point === 0x2329 || point === 0x232a ||
      point >= 0x2e80 && point <= 0xa4cf || point >= 0xac00 && point <= 0xd7a3 ||
      point >= 0xf900 && point <= 0xfaff || point >= 0xfe10 && point <= 0xfe6f ||
      point >= 0xff01 && point <= 0xff60 || point >= 0xffe0 && point <= 0xffe6 || point >= 0x16fe0 && point <= 0x1b2ff || point >= 0x20000))
}

export type Agent = {
  usage?: 'claude' | 'codex'
  badge?: Badge
  command: string
  model: string[]
  effort: string[]
  /** Each group is one setting, satisfied by any flag in that group. */
  permission: string[][]
  prompt: 'last-arg'
  screen: Record<Exclude<Screen, 'unknown'>, string[]>
  paste: 'bracketed'
}

export const AGENTS: Record<string, Agent> = Object.assign(Object.create(null) as Record<string, Agent>, {
  claude: {
    usage: 'claude',
    badge: { glyph: '✻', tone: 'coral' },
    command: 'claude',
    model: ['--model', '{model}'],
    effort: ['--effort', '{effort}'],
    permission: [['--permission-mode', '--dangerously-skip-permissions']],
    prompt: 'last-arg',
    screen: {
      waits: ['Is this a project you created or one you trust\\?', 'Do you want to proceed\\?'],
      working: ['esc to interrupt'],
      ready: ['^❯[\\s\\u00a0]*$'],
    },
    paste: 'bracketed',
  },
  codex: {
    usage: 'codex',
    badge: { glyph: '⬢', tone: 'cyan' },
    command: 'codex',
    model: ['-m', '{model}'],
    effort: ['-c', 'model_reasoning_effort="{effort}"'],
    permission: [
      ['-a', '--ask-for-approval', '--dangerously-bypass-approvals-and-sandbox'],
      ['-s', '--sandbox', '--dangerously-bypass-approvals-and-sandbox'],
    ],
    prompt: 'last-arg',
    screen: {
      waits: ['Trust this folder\\?', 'Would you like to run the following command\\?'],
      working: ['esc to interrupt'],
      ready: ['^› Ask Codex to do anything$'],
    },
    paste: 'bracketed',
  },
} satisfies Record<string, Agent>)

export const badgeOf = (name: string, agent: Agent | undefined = AGENTS[name]): Badge =>
  agent?.badge ?? { glyph: validBadgeGlyph([...name][0] ?? '') ? [...name][0] ?? '?' : '?', tone: 'dim' }

/** Whether `flags` hold `flag`, alone or as `flag=value`. */
const sets = (flags: string[], flag: string): boolean => flags.some(one => one === flag || one.startsWith(`${flag}=`))

/** The permission settings `flags` leave unset, each as its flags joined with " or ". */
export const unsetPermission = (agent: Agent, flags: string[]): string[] =>
  agent.permission.filter(setting => !setting.some(flag => sets(flags, flag))).map(setting => setting.join(' or '))

const expand = (template: string[], key: string, value: string): string[] =>
  value === '' ? [] : template.map(arg => arg.replaceAll(`{${key}}`, () => value))

/** An argv array, never shell text; omitted role settings add no arguments. */
export const argvOf = (agent: Agent, role: Pick<Role, 'model' | 'effort' | 'flags'>, prompt: string): string[] => [
  agent.command,
  ...expand(agent.model, 'model', role.model),
  ...expand(agent.effort, 'effort', role.effort),
  ...role.flags,
  prompt,
]

/** Blank terminal rows do not push a dialog out of the last 15 lines. */
export const screenOf = (agent: Agent, captured: string): Screen => {
  const tail = captured.split(/\r?\n/).filter(line => line.trim() !== '').slice(-15).join('\n')
  for (const state of ['waits', 'working', 'ready'] as const) {
    if (agent.screen[state].some(pattern => new RegExp(pattern, 'm').test(tail))) return state
  }

  return 'unknown'
}

type Map = { [key: string]: Yaml }
const isMap = (value: Yaml | undefined): value is Map => typeof value === 'object' && value !== null && !Array.isArray(value)
const KEYS = ['command', 'model', 'effort', 'permission', 'prompt', 'screen', 'paste', 'badge', 'usage']
const STATES = ['waits', 'working', 'ready'] as const

const lineOf = (source: string, field: string): number => {
  const parents: { indent: number; key: string }[] = []
  const lines = source.split('\n')
  for (const [index, line] of lines.entries()) {
    const match = /^(\s*)([^\s#][^:]*):(?:\s|$)/.exec(line)
    if (match === null) continue
    const indent = match[1]?.length ?? 0
    while (parents.length > 0 && (parents.at(-1)?.indent ?? 0) >= indent) parents.pop()
    parents.push({ indent, key: (match[2] ?? '').trim() })
    if (parents.map(one => one.key).join('.') === field) return index + 1
  }

  return 1
}

const readAgent = (source: string): Agent => {
  const fail = (field: string, why: string): never => {
    throw new Error(`line ${lineOf(source, field)}: ${field || 'adapter'} ${why}`)
  }
  const strings = (value: Yaml | undefined, field: string): string[] => {
    if (!Array.isArray(value) || !value.every((one): one is string => typeof one === 'string')) return fail(field, 'must be a list of strings')

    return value
  }
  const data = parseYaml(source)
  if (!isMap(data)) return fail('', 'must be a mapping')
  for (const key of Object.keys(data)) if (!KEYS.includes(key)) fail(key, 'is not an adapter field')
  if (typeof data.command !== 'string' || data.command.trim() === '') return fail('command', 'must be a nonempty string')
  const model = strings(data.model, 'model')
  const effort = strings(data.effort, 'effort')
  if (!Array.isArray(data.permission) || data.permission.length === 0) return fail('permission', 'must be a nonempty list of flag groups')
  const permission = data.permission.map(group => {
    const flags = strings(group, 'permission')
    if (flags.length === 0 || flags.some(flag => !/^--?[^\s=]+$/.test(flag))) fail('permission', 'groups must contain flag names')

    return flags
  })
  if (data.prompt !== 'last-arg') return fail('prompt', 'must be last-arg')
  if (data.paste !== 'bracketed') return fail('paste', 'must be bracketed')
  if (data.usage !== undefined && data.usage !== 'claude' && data.usage !== 'codex') return fail('usage', 'must be claude or codex')
  const usage = data.usage as Agent['usage']
  if (!isMap(data.screen)) return fail('screen', 'must be a mapping')
  const screen: Agent['screen'] = { waits: [], working: [], ready: [] }
  for (const key of Object.keys(data.screen)) if (!STATES.some(state => state === key)) fail(`screen.${key}`, 'is not a screen state')
  for (const state of STATES) {
    screen[state] = strings(data.screen[state], `screen.${state}`)
    for (const pattern of screen[state]) {
      try {
        new RegExp(pattern, 'm')
      } catch {
        fail(`screen.${state}`, `has an invalid regex: ${pattern}`)
      }
    }
  }

  let badge: Badge | undefined
  if (data.badge !== undefined) {
    if (!isMap(data.badge)) return fail('badge', 'must be a mapping')
    for (const key of Object.keys(data.badge)) if (!['glyph', 'tone'].includes(key)) fail(`badge.${key}`, 'is not a badge field')
    if (typeof data.badge.glyph !== 'string' || !validBadgeGlyph(data.badge.glyph)) return fail('badge.glyph', 'must be one visible terminal cell')
    if (typeof data.badge.tone !== 'string' || !Object.hasOwn(TONES, data.badge.tone)) return fail('badge.tone', `must be one of ${Object.keys(TONES).join(', ')}`)
    badge = { glyph: data.badge.glyph, tone: data.badge.tone as Tone }
  }

  return { command: data.command, model, effort, permission, prompt: data.prompt, screen, paste: data.paste, ...(badge && { badge }), ...(usage === undefined ? {} : { usage }) }
}

/** Files replace an adapter in full: built-ins, then home, then repository. Problems must be resolved before use. */
export const loadAgents = (root: string, home: string): { agents: Record<string, Agent>; problems: string[] } => {
  const agents = Object.assign(Object.create(null) as Record<string, Agent>, AGENTS)
  const problems: string[] = []
  for (const dir of [join(home, '.config/troupe/agents'), join(root, '.troupe/agents')]) {
    let files: string[]
    try {
      files = readdirSync(dir).filter(name => name.endsWith('.yaml')).sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') problems.push(`${dir}: line 1: ${(error as Error).message}`)
      continue
    }
    for (const file of files) {
      const path = join(dir, file)
      try {
        const name = file.slice(0, -5)
        if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('line 1: adapter name must be lower case letters, digits and -, starting with a letter')
        agents[name] = readAgent(readFileSync(path, 'utf8'))
      } catch (error) {
        const message = (error as Error).message
        problems.push(`${path}: ${/^line \d+:/.test(message) ? message : `line 1: ${message}`}`)
      }
    }
  }

  return { agents, problems }
}
