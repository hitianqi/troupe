import { AGENTS, unsetPermission } from './agents.ts'
import type { Agent } from './agents.ts'
import { overlaps } from './touches.ts'
import { parseYaml } from './yaml.ts'
import type { Yaml } from './yaml.ts'

export { overlaps } from './touches.ts'

// plan.md, read and checked: Markdown around one ```yaml block that holds the
// mission's one-line facts and its roles; each role's text is a
// `## Role: <name>` section in the Markdown. A role is a window: one role,
// one worktree, one branch. The checks are the ones that keep work correct;
// the method lives in the workflow skill.

export type Role = {
  name: string
  agent: string
  model: string
  effort: string
  /** The agent's own flags, as written; they must pin its permission. */
  flags: string[]
  touches: string[]
  dependsOn: string[]
  goal: string
  /** `workflow:<name>` or a repo path, '' for none. */
  text: string
  /** The `## Role: <name>` section's body, '' for none. */
  section: string
  skills: string[]
  reviews: string[]
  group: string
}
export type Plan = {
  title: string
  goal: string
  why: string
  workflow: string
  base: string
  /** The `## Done when` section's bullets. */
  doneWhen: string[]
  roles: Role[]
  problems: string[]
}

const NAME = /^[a-z][a-z0-9-]*$/
const ROLE_KEYS = ['use', 'agent', 'model', 'effort', 'flags', 'touches', 'depends_on', 'goal', 'text', 'skills', 'reviews', 'group']
const PLAN_KEYS = ['troupe', 'goal', 'why', 'workflow', 'base', 'profiles', 'roles']
export const DEFAULT_WORKFLOW = 'troupe-mission'

type Map = { [key: string]: Yaml }
const isMap = (value: Yaml | undefined): value is Map => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: Yaml | undefined): string => (typeof value === 'string' ? value : '')
const texts = (value: Yaml | undefined): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : typeof value === 'string' ? [value] : []

/** The Markdown's `## ` sections by heading, skipping fenced code; the body runs to the next `#`/`##` heading. */
export const sectionsOf = (source: string): { heading: string; body: string }[] => {
  const out: { heading: string; body: string[] }[] = []
  let fence = ''
  for (const line of source.split('\n')) {
    const mark = /^\s*(```|~~~)/.exec(line)?.[1]
    if (mark !== undefined) fence = fence === '' ? mark : fence === mark ? '' : fence
    const heading = fence === '' && mark === undefined ? /^(#{1,2}) +(.+?)\s*$/.exec(line) : null
    if (heading !== null) {
      if (heading[1] === '##') out.push({ heading: heading[2] ?? '', body: [] })
      else out.push({ heading: '', body: [] })
    } else out.at(-1)?.body.push(line)
  }

  return out.filter(section => section.heading !== '').map(section => ({ heading: section.heading, body: section.body.join('\n').trim() }))
}

/** Top-level `-` / `*` items, each with its continuation lines joined. */
const bullets = (body: string): string[] =>
  body
    .split(/\n(?=\s*[-*] )/)
    .map(item => /^\s*[-*] +([\s\S]*)$/.exec(item)?.[1]?.split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim())
    .filter((one): one is string => one !== undefined && one !== '')

export const readPlan = (source: string, agents: Record<string, Agent> = AGENTS): Plan => {
  const title = /^# +(.+)$/m.exec(source)?.[1]?.trim() ?? ''
  const sections = sectionsOf(source)
  const doneWhen = bullets(sections.find(section => /^done when$/i.test(section.heading))?.body ?? '')
  const empty: Plan = { title, goal: '', why: '', workflow: DEFAULT_WORKFLOW, base: '', doneWhen, roles: [], problems: [] }

  const fence = /```ya?ml\n([\s\S]*?)```/g
  let found: RegExpExecArray | null = null
  let isOld = false
  for (let one = fence.exec(source); one !== null; one = fence.exec(source)) {
    if (/^orders:/m.test(one[1] ?? '')) isOld = true
    else if (/^roles:/m.test(one[1] ?? '')) {
      found = one
      break
    }
  }
  if (found === null) {
    const why = isOld
      ? 'an orders block: a plan of the troupe mod (before troupe 1); start a new plan from the template'
      : 'no ```yaml block with a `roles:` key'

    return { ...empty, problems: [why] }
  }
  let data: Yaml
  try {
    data = parseYaml(found[1] ?? '', source.slice(0, found.index).split('\n').length + 1)
  } catch (error) {
    return { ...empty, problems: [`the yaml block cannot be read: ${(error as Error).message}`] }
  }
  if (!isMap(data) || !isMap(data.roles)) return { ...empty, problems: ['`roles` is not a mapping of name to role'] }

  const problems: string[] = []
  for (const key of Object.keys(data)) if (!PLAN_KEYS.includes(key)) problems.push(`unknown key "${key}" (${PLAN_KEYS.join(', ')})`)
  if (data.troupe !== undefined && text(data.troupe) !== '1') problems.push(`troupe: ${text(data.troupe) || '?'} is not a format this troupe reads (1)`)
  const profiles = isMap(data.profiles) ? data.profiles : {}
  if (data.profiles !== undefined && !isMap(data.profiles)) problems.push('`profiles` is not a mapping of name to settings')
  for (const [name, value] of Object.entries(profiles)) {
    if (!isMap(value)) problems.push(`profile ${name} is not a mapping`)
    else if ('use' in value) problems.push(`profile ${name}: a profile cannot use another`)
  }

  const roleSections = new Map(
    sections.flatMap(section => {
      const name = /^Role: *(.+)$/.exec(section.heading)?.[1]?.trim()

      return name === undefined ? [] : [[name, section.body] as const]
    }),
  )
  const roles = Object.entries(data.roles).map(([name, raw]): Role => {
    const own = isMap(raw) ? raw : {}
    if (!isMap(raw)) problems.push(`role ${name} is not a mapping`)
    for (const key of Object.keys(own)) if (!ROLE_KEYS.includes(key)) problems.push(`role ${name}: unknown key "${key}"`)
    const use = text(own.use)
    const base = use === '' ? {} : profiles[use]
    if (use !== '' && base === undefined) problems.push(`role ${name}: use names no profile "${use}"`)
    const one: Map = { ...(isMap(base) ? base : {}), ...own }
    if (!('touches' in one)) problems.push(`role ${name}: no touches (write touches: [] for a role that changes no files)`)

    return {
      name,
      agent: text(one.agent),
      model: text(one.model),
      effort: text(one.effort),
      flags: texts(one.flags),
      touches: texts(one.touches),
      dependsOn: texts(one.depends_on),
      goal: text(one.goal),
      text: text(one.text),
      section: roleSections.get(name) ?? '',
      skills: texts(one.skills),
      reviews: texts(one.reviews),
      group: text(one.group) || (texts(one.touches).length === 0 && texts(one.reviews).length > 0 ? 'review' : 'build'),
    }
  })
  const seen = new Set(roles.map(role => role.name))
  for (const name of roleSections.keys()) if (!seen.has(name)) problems.push(`## Role: ${name} names no role in the yaml block`)

  return {
    ...empty,
    goal: text(data.goal),
    why: text(data.why),
    workflow: text(data.workflow) || DEFAULT_WORKFLOW,
    base: text(data.base),
    roles,
    problems: [...problems, ...checkRoles(roles, agents, Object.keys(data.roles))],
  }
}

/** The rules that keep work correct: names, agents and their pinned permission, role text, dependencies, no overlap without an order. */
export const checkRoles = (roles: Role[], agents: Record<string, Agent>, keys = roles.map(role => role.name)): string[] => {
  const problems: string[] = []
  if (roles.length === 0) problems.push('no roles')
  const byName = new Map(roles.map(role => [role.name, role]))
  for (const name of keys) if (!NAME.test(name)) problems.push(`role ${name}: a name is lower case letters, digits and -, starting with a letter`)
  for (const role of roles) {
    const { name } = role
    const agent = agents[role.agent]
    if (role.agent === '') problems.push(`role ${name}: no agent`)
    else if (agent === undefined) problems.push(`role ${name}: unknown agent "${role.agent}" (${Object.keys(agents).join(', ')})`)
    else {
      const unset = unsetPermission(agent, role.flags)
      if (unset.length > 0) problems.push(`role ${name}: flags must pin ${role.agent}'s permission (${unset.join('; ')})`)
    }
    if (role.text === '' && role.section === '') problems.push(`role ${name}: no text (a ## Role: ${name} section, or text:)`)
    for (const dep of role.dependsOn) if (!byName.has(dep)) problems.push(`role ${name}: depends_on unknown role "${dep}"`)
    for (const one of role.reviews) if (!byName.has(one)) problems.push(`role ${name}: reviews unknown role "${one}"`)
  }
  const deps = depsOf(roles)
  for (const name of byName.keys()) if (deps(name).has(name)) problems.push(`role ${name}: dependency cycle`)
  for (const { a, b, shared } of clashesOf(roles)) problems.push(`${a} and ${b} overlap (${shared.join('; ')}) but neither depends on the other`)

  return problems
}

type Node = Pick<Role, 'name' | 'touches' | 'dependsOn'>

/** Every role a role waits on, directly or through others. */
const depsOf = (roles: Node[]) => {
  const byName = new Map(roles.map(role => [role.name, role]))

  return (name: string): Set<string> => {
    const seen = new Set<string>()
    const stack = [...(byName.get(name)?.dependsOn ?? [])]
    for (let dep = stack.pop(); dep !== undefined; dep = stack.pop()) {
      if (seen.has(dep) || !byName.has(dep)) continue
      seen.add(dep)
      stack.push(...(byName.get(dep)?.dependsOn ?? []))
    }

    return seen
  }
}

/** Pairs of roles whose touches can name the same file while neither depends on the other; `shared` holds each `x ~ y`. */
export const clashesOf = (roles: Node[]): { a: string; b: string; shared: string[] }[] => {
  const deps = depsOf(roles)

  return roles.flatMap((a, index) => roles.slice(index + 1).flatMap(b => {
    const shared = a.touches.flatMap(x => b.touches.filter(y => overlaps(x, y)).map(y => `${x} ~ ${y}`))

    return shared.length > 0 && !deps(a.name).has(b.name) && !deps(b.name).has(a.name) ? [{ a: a.name, b: b.name, shared }] : []
  }))
}

/** Kahn's layering: each layer holds the roles whose known dependencies all sit in earlier layers. */
export const layersOf = <R extends { name: string; dependsOn: string[] }>(roles: R[]): { layers: R[][]; stuck: R[] } => {
  const known = new Set(roles.map(role => role.name))
  const placed = new Set<string>()
  const layers: R[][] = []
  let left = roles
  while (left.length > 0) {
    const ready = left.filter(role => role.dependsOn.every(dep => placed.has(dep) || !known.has(dep)))
    if (ready.length === 0) break
    layers.push(ready)
    for (const role of ready) placed.add(role.name)
    left = left.filter(role => !ready.includes(role))
  }

  return { layers, stuck: left }
}
