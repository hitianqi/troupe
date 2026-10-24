import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

import { check, findPlan, rootOf } from './check.ts'
import { clean, mission, mux, NAME, Refusal, repository, runtime, Usage, workflowStages } from './command-context.ts'
import type { Mission, Reply, Runtime } from './command-context.ts'
import { append, fold, logPath, PLAN_GATE, readLog } from './log.ts'
import { createPane, ownedPane } from './panes.ts'
import { close, dispatch, send, statusOf } from './role-commands.ts'
import { available, installSkill, setup, skillTarget } from './setup.ts'
import { readResult } from './state.ts'
import { tmux } from './run.ts'
import { panel } from './panel.ts'

const OPTIONS: Record<string, string[]> = {
  setup: ['remove'], up: ['orch'], check: [], approve: [], gate: ['no-wait'], stage: [],
  dispatch: [], status: ['json', 'watch'], send: [], wait: ['role', 'gate', 'timeout'], close: ['all'], panel: ['once', 'plain', 'width', 'height'],
}

const parsed = (command: string, args: string[]) => {
  if (OPTIONS[command] === undefined) throw new Usage(`unknown command '${command}'`)
  let result
  try {
    result = parseArgs({ args, allowPositionals: true, options: {
      mission: { type: 'string', short: 'm' }, remove: { type: 'boolean' }, orch: { type: 'string' },
      'no-wait': { type: 'boolean' }, json: { type: 'boolean' }, watch: { type: 'boolean' },
      role: { type: 'string' }, gate: { type: 'string' }, timeout: { type: 'string' }, all: { type: 'boolean' },
      once: { type: 'boolean' }, plain: { type: 'boolean' }, width: { type: 'string' }, height: { type: 'string' },
    } })
  } catch (error) {
    throw new Usage((error as Error).message)
  }
  for (const key of Object.keys(result.values)) if (key !== 'mission' && !OPTIONS[command]?.includes(key)) throw new Usage(`--${key} is not an option for ${command}`)
  if (result.values.mission !== undefined && !NAME.test(result.values.mission)) throw new Usage('mission must be a folder name under docs/missions')

  return result
}

const count = (args: string[], min: number, max: number, usage: string): void => {
  if (args.length < min || args.length > max) throw new Usage(usage)
}
const id = (value: string | undefined, what: string): string => {
  if (value === undefined || !NAME.test(value)) throw new Usage(`${what} must be a name of letters, digits, - or _`)

  return value
}

const approve = async (r: Runtime, m: Mission): Promise<Reply> => {
  const show = [m.plan.goal, ...m.plan.roles.map(role => `${role.name}: ${role.agent} / ${role.model || 'default'} / ${role.effort || 'default'} / flags ${JSON.stringify(role.flags)}`), m.hash, `Problems: ${m.problems.join('; ') || 'none'}`].join('\n')
  r.write(`${show}\n`)
  clean(m)
  if (!/^y(?:es)?$/i.test((await r.ask('Approve? [y/N] ')).trim())) return { code: 1, out: 'Not approved.\n' }
  const current = mission(r, m.name)
  clean(current)
  if (current.hash !== m.hash) throw new Refusal('the plan or referenced text changed while approval was open; approve again')
  append(m.log, 'cli', { ev: 'gate-answer', gate: PLAN_GATE, answer: 'approve', plan: m.hash })

  return { code: 0, out: `Approved ${m.name} (${m.hash})\n` }
}

const wait = async (r: Runtime, m: Mission, target: { role?: string; gate?: string; seconds?: number }): Promise<Reply> => {
  const until = target.seconds === undefined ? Infinity : r.now() + target.seconds * 1000
  for (;;) {
    if (r.signal?.aborted) return { code: 1, out: 'Wait cancelled.\n' }
    const read = readLog(m.log)
    if (read.unread > 0) throw new Refusal(`${m.log}: unread log lines; cannot wait reliably`)
    const folded = fold(read.events)
    if (target.gate !== undefined) {
      const answer = folded.gates.get(target.gate)
      if (answer?.answer !== undefined) return { code: 0, out: answer.answer === 'approve' ? 'approve\n' : `change: ${answer.text ?? ''}\n` }
    } else {
      const opened = folded.roles.get(target.role ?? '')
      if (opened === undefined) throw new Refusal(`role ${target.role}: not dispatched`)
      const result = readResult(opened.worktree)
      if (result?.status) return { code: result.status === 'done' ? 0 : 1, out: `${result.status}: ${result.summary}\n` }
      const pane = ownedPane(r, opened)
      if (opened.closed || !pane.alive || pane.dead) return { code: 1, out: `${target.role}: ${pane.foreign ? 'pane ownership mismatch' : 'pane gone without a result'}\n` }
    }
    if (r.now() >= until) return { code: 1, out: `Timed out waiting for ${target.role === undefined ? `gate ${target.gate}` : `role ${target.role}`}\n` }
    await r.sleep(Math.min(2000, until - r.now()))
  }
}

const stage = (r: Runtime, m: Mission, name: string): Reply => {
  const read = workflowStages(r, m.plan.workflow)
  if (read.problems.length > 0) throw new Refusal(read.problems.join('\n'))
  if (!read.stages.some(stage => stage.id === name)) throw new Refusal(`unknown stage ${name}; choose ${read.stages.map(stage => stage.id).join(', ')}`)
  append(m.log, 'cli', { ev: 'stage', stage: name })

  return { code: 0, out: `Stage: ${name}\n` }
}

const status = async (r: Runtime, want: string, json: boolean, watch: boolean): Promise<Reply> => {
  for (;;) {
    let out: string
    let code = 0
    try {
      const view = statusOf(r, mission(r, want))
      code = view.problems.length > 0 ? 1 : 0
      out = json ? `${JSON.stringify(view)}\n` : [
        `${view.mission} · stage ${view.stage || '—'}`,
        ...view.roles.map(role => `${role.name}: ${role.state} · ${role.agent} · ${role.branch || '—'} · ${role.commits.length} commits · changed ${role.changed.join(', ') || '—'} · outside ${role.outside.join(', ') || '—'}${role.summary ? ` · ${role.summary}` : ''}${role.problem ? ` · ${role.problem}` : ''}`),
        ...view.gates.map(gate => `Gate ${gate.id}: ${gate.ask || 'needs you'}`),
        ...view.problems,
      ].join('\n') + '\n'
    } catch (error) {
      if (!watch) throw error
      out = `${(error as Error).message}\n`
      code = 1
    }
    if (!watch) return { code, out }
    r.write(`${r.outputTTY && !json ? '\x1b[2J\x1b[H' : ''}${out}`)
    if (r.signal?.aborted) return { code: 0, out: '' }
    await r.sleep(2000)
  }
}

const up = (r: Runtime, want: string, orch: string): Reply => {
  if (!available(r, 'tmux')) throw new Refusal('tmux is required for troupe up')
  if (!available(r, orch)) throw new Refusal(`${orch} was not found on PATH`)
  let installed = ''
  if (!existsSync(join(skillTarget(r, orch), 'SKILL.md'))) installed = installSkill(r, orch)
  const repo = repository(r)
  const found = findPlan(repo.root, repo.root, want === '' ? '' : join(repo.root, 'docs/missions', want, 'plan.md'))
  const name = want || ('path' in found ? basename(dirname(found.path)) : 'mission')
  const opened = createPane(r, repo, 'mission', repo.root, [orch])
  let panel
  try {
    panel = createPane(r, repo, 'troupe panel', repo.root, [process.execPath, join(r.packageRoot, 'dist/cli.js'), 'panel', ...(want ? ['-m', want] : [])], opened, true)
    append(logPath(repo.common, name), 'cli', { ev: 'up', session: opened.session, window: opened.window, pane: opened.pane, panel: panel.pane })
  } catch (error) {
    if (panel !== undefined && ownedPane(r, panel).alive) tmux(['kill-pane', '-t', panel.pane], r.run, r.env)
    if (ownedPane(r, opened).alive) tmux(['kill-pane', '-t', opened.pane], r.run, r.env)
    throw error
  }
  mux(r, ['select-pane', '-t', opened.pane])
  mux(r, ['select-window', '-t', opened.window])
  if (!r.env.TMUX) mux(r, ['attach-session', '-t', opened.session], { inherit: true })

  return { code: 0, out: `${installed}Opened mission window ${opened.window}; orchestrator ${opened.pane}, status ${panel.pane}\n` }
}

export const execute = async (command: string, args: string[], overrides: Partial<Runtime> = {}): Promise<Reply> => {
  const r = runtime(overrides)
  try {
    const { values, positionals: pos } = parsed(command, args)
    const want = values.mission ?? ''
    if (command === 'panel') {
      count(pos, 0, 0, 'panel [-m mission] [--once] [--plain] [--width N --height N]')
      const size = (value: string | undefined, name: string): number | undefined => {
        if (value === undefined) return undefined
        const n = Number(value)
        if (!Number.isSafeInteger(n) || n < 1) throw new Usage(`--${name} must be a positive integer`)

        return n
      }

      return await panel(r, { mission: want, once: values.once, plain: values.plain, width: size(values.width, 'width'), height: size(values.height, 'height') })
    }
    if (command === 'setup') {
      count(pos, 0, 0, 'setup [--remove]')
      return setup(r, values.remove)
    }
    if (command === 'up') {
      count(pos, 0, 0, 'up [--orch claude|codex]')
      const orch = values.orch ?? 'claude'
      if (!['claude', 'codex'].includes(orch)) throw new Usage('--orch must be claude or codex')
      return up(r, want, orch)
    }
    if (command === 'check') {
      count(pos, 0, want ? 0 : 1, 'check [-m mission | plan file or folder]')
      return check(r.cwd, want ? join(rootOf(r.cwd, r.run), 'docs/missions', want, 'plan.md') : pos[0] || '', r.home, r.run)
    }
    // Reject automated approval before reading a plan or writing any file.
    if (command === 'approve' && (!r.inputTTY || !r.outputTTY)) throw new Refusal('approve requires both stdin and stdout to be terminals')
    if (command === 'approve') count(pos, 0, 0, 'approve')
    else if (command === 'dispatch' || command === 'stage') count(pos, 1, 1, `${command} <name>`)
    else if (command === 'gate') count(pos, 1, 2, 'gate <id> ["question"] [--no-wait]')
    else if (command === 'send') count(pos, 1, Infinity, 'send <role> <text…> (or text on stdin)')
    else if (command === 'close') count(pos, values.all ? 0 : 1, values.all ? 0 : 1, 'close <role> | --all')
    else if (command === 'status') count(pos, 0, 0, 'status [--json] [--watch]')
    else if (command === 'wait') {
      count(pos, 0, 0, 'wait (--role <r> | --gate <id>) [--timeout <s>]')
      if ((values.role === undefined) === (values.gate === undefined)) throw new Usage('wait requires exactly one of --role and --gate')
      if (values.timeout !== undefined && (values.timeout.trim() === '' || !Number.isFinite(Number(values.timeout)) || Number(values.timeout) < 0)) throw new Usage('--timeout must be a nonnegative number of seconds')
    }
    if (['dispatch', 'stage', 'gate', 'send'].includes(command) || (command === 'close' && !values.all)) id(pos[0], 'name')
    if (command === 'wait') id(values.role ?? values.gate, 'wait target')
    if (command === 'send' && pos.length === 1 && r.inputTTY) throw new Usage('send needs text arguments or text on stdin')
    if (command === 'status') return await status(r, want, !!values.json, !!values.watch)
    const m = mission(r, want)
    if (command === 'approve') return await approve(r, m)
    if (command === 'dispatch') return await dispatch(r, m, id(pos[0], 'role'))
    if (command === 'stage') return stage(r, m, id(pos[0], 'stage'))
    if (command === 'gate') {
      const gate = id(pos[0], 'gate')
      append(m.log, 'cli', { ev: 'gate-open', gate, ...(pos[1] === undefined ? {} : { ask: pos[1] }), ...(gate === PLAN_GATE ? { plan: m.hash } : {}) })
      return values['no-wait'] ? { code: 0, out: `Opened gate ${gate}\n` } : await wait(r, m, { gate })
    }
    if (command === 'send') {
      const text = pos.length > 1 ? pos.slice(1).join(' ') : r.inputTTY ? '' : await r.input()
      if (text.trim() === '') throw new Usage('send needs text arguments or text on stdin')
      return await send(r, m, id(pos[0], 'role'), text)
    }
    if (command === 'close') return await close(r, m, values.all ? undefined : id(pos[0], 'role'))
    if (command === 'wait') return await wait(r, m, { ...(values.role === undefined ? { gate: id(values.gate, 'gate') } : { role: id(values.role, 'role') }), ...(values.timeout === undefined ? {} : { seconds: Number(values.timeout) }) })
    throw new Usage(`unknown command '${command}'`)
  } catch (error) {
    return { code: error instanceof Usage ? 2 : 1, out: `${(error as Error).message}\n` }
  }
}
