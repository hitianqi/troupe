import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TroupeAgent, TroupeAsk, TroupePlaced, TroupeSkills } from '../types'

// Phase 0: a hello pane plus the API probes behind docs/FEASIBILITY.md.

const PANE = 'troupe'
const CHANGE_PANE = 'troupe-change'
// An Agent call whose description starts with this is refused (probe Q3).
const PROBE_PREFIX = 'troupe-probe:'

const version = atom({ plugin: 'troupe', key: 'version' } as const, '')
const placed = atom({ plugin: 'troupe', key: 'placed' } as const, null)
const agents = atom({ plugin: 'troupe', key: 'agents' } as const, [])
const calls = atom({ plugin: 'troupe', key: 'calls' } as const, [])
const asks = atom({ plugin: 'troupe', key: 'asks' } as const, [])
const skills = atom({ plugin: 'troupe', key: 'skills' } as const, null)

const clip = (text: string, width: number) =>
  text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`

async function openPane($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: 'troupe' })
  const result: TroupePlaced = opened.isPlaced
    ? { isPlaced: true }
    : { isPlaced: false, reason: opened.reason }
  await update($, placed, () => result)
  if (!opened.isPlaced) {
    $.ui.log(`pane not placed: ${opened.reason}`)
  }

  return result
}

async function refreshAgents($: EngineInterface) {
  const list: TroupeAgent[] = (await $.agent.list()).map(agent => ({
    id: agent.id,
    description: agent.description,
    type: agent.type,
    status: agent.status,
  }))
  const before = await read($, agents)
  if (JSON.stringify(before) !== JSON.stringify(list)) {
    await update($, agents, () => list)
  }
}

async function recordAsk($: EngineInterface, ask: TroupeAsk) {
  await update($, asks, list => [...list, ask].slice(-10))
  $.ui.log(`ask round ${ask.round}: ${ask.kind} "${ask.answer}"`)
}

// Probe Q4: Approve / Change. A typed answer under "Other" is the change
// text; "Change" opens a pane with an Input for it. A change re-asks.
async function askPlan($: EngineInterface, round: number): Promise<string> {
  let answer: string
  try {
    answer = await $.ui.ask('Approve the plan?', {
      options: ['Approve', 'Change'],
      header: 'Plan',
    })
  } catch (error) {
    await recordAsk($, { round, kind: 'dismissed', answer: String(error) })

    return `dismissed: ${String(error)}`
  }

  if (answer === 'Approve') {
    await recordAsk($, { round, kind: 'approve', answer })

    return 'approved'
  }
  if (answer === 'Change') {
    await recordAsk($, { round, kind: 'change', answer })
    await $.ui.open({ id: CHANGE_PANE, title: 'troupe: change', focus: true, closeOnEscape: true, rows: 5 })

    return 'change: input pane opened'
  }
  await recordAsk($, { round, kind: 'other', answer })
  $.clock.after(500, () => void askPlan($, round + 1))

  return `change typed under Other: "${answer}"; asking again`
}

// Probe Q5: the skills the session lists, and which of the names asked for
// are among them.
async function probeSkills($: EngineInterface, wanted: string[]) {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const listing = usage.context.breakdown?.skills
  const found: TroupeSkills = {
    total: listing?.totalSkills ?? 0,
    included: listing?.includedSkills ?? 0,
    names: (listing?.skillFrontmatter ?? []).map(skill => skill.name),
  }
  await update($, skills, () => found)
  const missing = wanted.filter(name => !found.names.includes(name))

  return [
    `skills: ${found.total} in the session, ${found.included} listed`,
    `sources: ${[...new Set((listing?.skillFrontmatter ?? []).map(skill => skill.source))].join(', ')}`,
    wanted.length > 0 ? `asked: ${wanted.join(', ')}; missing: ${missing.join(', ') || 'none'}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'troupe', description: 'Open the troupe pane' })
    await $.command.register({
      name: 'troupe-probe-ask',
      description: 'troupe probe: ask Approve / Change',
    })
    await $.command.register({
      name: 'troupe-probe-skills',
      description: 'troupe probe: list the session skills and check names',
      argumentHint: '[skill names]',
    })
    await $.tool.register({
      name: 'probe',
      description:
        'troupe Phase 0 probes. action "skills": list the skills this session lists and check the given names against them. action "ask": raise the Approve / Change dialog and return at once; the answers are logged. action "agent": register the agent type troupe:probe preloading the given skill names.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['skills', 'ask', 'agent'] },
          names: { type: 'array', items: { type: 'string' } },
        },
        required: ['action'],
      },
      isDeferred: false,
    })
    const { version: running } = await $.session.version()
    await update($, version, () => running)
    void openPane($)
    $.clock.every(2000, () => void refreshAgents($))

    return next(e)
  })

  on('command.run', { command: 'troupe' }, async $ => {
    const result = await openPane($)

    return {
      text: result.isPlaced ? 'troupe pane opened.' : `troupe pane not placed: ${result.reason}`,
    }
  })

  on('command.run', { command: 'troupe-probe-ask' }, async $ => ({
    text: `troupe ask: ${await askPlan($, 1)}`,
  }))

  on('command.run', { command: 'troupe-probe-skills' }, async ($, e) => ({
    text: await probeSkills($, e.args.split(/\s+/).filter(Boolean)),
  }))

  on('tool.call', { tool: /^mcp__troupe__probe$/ }, async ($, e) => {
    const { action, names } = e as unknown as { action: string; names?: string[] }
    if (action === 'skills') {
      return { result: await probeSkills($, names ?? []) }
    }
    if (action === 'agent') {
      try {
        const { agent } = await $.agent.register({
          name: 'probe',
          description: 'troupe probe agent: reports the skills preloaded into it',
          prompt: 'List the skills preloaded into your context by name, then stop.',
          skills: names ?? [],
        })

        return { result: `registered ${agent} with skills: ${(names ?? []).join(', ')}` }
      } catch (error) {
        return { result: `agent.register refused: ${String(error)}`, isError: true }
      }
    }
    if (action === 'ask') {
      void askPlan($, 1)

      return { result: 'The Approve / Change dialog is up; its answers are logged as "ask round …".' }
    }

    return { result: `unknown action: ${action}`, isError: true }
  })

  // Probe Q5: which skills reach a subagent as a preload.
  on('skill.prompt', ($, e, next) => {
    $.ui.log(`skill.prompt ${e.skill} source=${e.source}`)

    return next(e)
  })

  // Probe Q3: refuse a probe Agent call, log every Agent call's description
  // and model.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const isProbe = e.description.startsWith(PROBE_PREFIX)
    await update($, calls, list =>
      [
        ...list,
        {
          description: e.description,
          model: e.model ?? '(none)',
          isolation: e.isolation ?? '(none)',
          verdict: isProbe ? ('denied' as const) : ('passed' as const),
        },
      ].slice(-10),
    )
    $.ui.log(
      `Agent call description="${e.description}" model=${e.model ?? '(none)'} isolation=${e.isolation ?? '(none)'} -> ${isProbe ? 'denied' : 'passed'}`,
    )
    if (isProbe) {
      return { deny: `troupe: "${e.description}" is a probe call; troupe refuses it on purpose.` }
    }

    return next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'troupe: its Agent guard failed.' },
  )

  on('ui.render', { component: 'Pane', requestId: CHANGE_PANE }, ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)

      return <Text>Type the change under Other in the dialog instead.</Text>
    }
    const { Input } = $.ui.resolve(e)

    return (
      <Input
        key="change"
        label="Change: "
        placeholder="e.g. o2 on opus"
        autoFocus
        onSubmit={async text => {
          const round = (await read($, asks)).length + 1
          await recordAsk($, { round, kind: 'other', answer: text })
          await $.ui.close({ id: CHANGE_PANE })
          $.clock.after(500, () => void askPlan($, round + 1))
        }}
      />
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(10, e.props.bodyColumns)
    const where = await read($, placed)
    const agentList = await read($, agents)
    const callList = await read($, calls)
    const askList = await read($, asks)
    const skillList = await read($, skills)

    return (
      <Box flexDirection="column">
        <Text bold>troupe</Text>
        <Text>Claude Code {await read($, version)}</Text>
        <Text dimColor>
          {clip(
            `${e.viewport?.columns ?? '?'} cols, body ${e.props.bodyColumns}, ${e.props.placement}, ${where === null ? 'opening' : where.isPlaced ? 'placed' : `not placed: ${where.reason}`}`,
            width,
          )}
        </Text>
        <Text bold>Agents ({agentList.length})</Text>
        {agentList.length === 0 && <Text dimColor>none yet</Text>}
        {agentList.map(agent => (
          <Text>{clip(`${agent.status} ${agent.type}: ${agent.description}`, width)}</Text>
        ))}
        <Text bold>Agent calls</Text>
        {callList.length === 0 && <Text dimColor>none yet</Text>}
        {callList.map(call => (
          <Text color={call.verdict === 'denied' ? 'red' : undefined}>
            {clip(`${call.verdict} ${call.description} (${call.model})`, width)}
          </Text>
        ))}
        {askList.length > 0 && <Text bold>Asks</Text>}
        {askList.map(ask => (
          <Text>{clip(`${ask.round}. ${ask.kind}: ${ask.answer}`, width)}</Text>
        ))}
        {skillList !== null && (
          <Text dimColor>
            {clip(`skills: ${skillList.included}/${skillList.total} listed`, width)}
          </Text>
        )}
      </Box>
    )
  })
}
