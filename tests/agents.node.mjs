import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { AGENTS, argvOf, badgeOf, validBadgeGlyph, loadAgents, screenOf, unsetPermission } from '../dist/agents.js'
import { check } from '../dist/check.js'

const capture = name => readFileSync(new URL(`./fixtures/agents/${name}.txt`, import.meta.url), 'utf8')
const fixture = name => readFileSync(new URL(`./fixtures/agents/${name}.txt`, import.meta.url), 'utf8')

for (const harness of ['claude', 'codex']) {
  test(`${harness}: real ready, working, approval, trust and exit captures`, () => {
    const agent = AGENTS[harness]
    const working = harness === 'codex' ? 'working-turn' : 'working'
    for (const [name, want] of [
      ['ready', 'ready'],
      [working, 'working'],
      ['approval', 'waits'],
      ['trust', 'waits'],
      ['dialog-pasted', 'waits'],
      ['exit', 'unknown'],
    ]) {
      const file = `p4-${harness}-${name}`
      assert.equal(screenOf(agent, capture(file)), want, file)
    }
    assert.equal(screenOf(agent, fixture(`p5-${harness}-main-ready`)), 'ready')
    const idle = harness === 'codex' ? '› Ask Codex to do anything' : '❯\u00a0'
    const trust = harness === 'codex' ? 'Trust this folder?' : 'Is this a project you created or one you trust?'
    assert.equal(screenOf(agent, `${trust}\nesc to interrupt\n${idle}`), 'waits')
    assert.equal(screenOf(agent, `esc to interrupt\n${idle}`), 'working')
    for (const unknown of ['', '$ ', '❯ a draft', '› a draft', ' ❯ 1. Yes', '› 1. Yes, proceed (y)']) {
      assert.equal(screenOf(agent, unknown), 'unknown', unknown)
    }
  })
}

test('screen matching uses the last 15 nonempty lines, preserves indentation, and accepts CRLF', () => {
  const filler = Array.from({ length: 14 }, (_, i) => `line ${i}`).join('\n')
  assert.equal(screenOf(AGENTS.codex, `Trust this folder?\n${filler}\n› Ask Codex to do anything`), 'ready')
  assert.equal(screenOf(AGENTS.codex, `Trust this folder?\n› Ask Codex to do anything${'\n'.repeat(50)}`), 'waits')
  assert.equal(screenOf(AGENTS.claude, `❯\n${filler}\none more`), 'unknown')
  assert.equal(screenOf(AGENTS.claude, '\r\n❯\u00a0\r\n'), 'ready')
  assert.equal(screenOf(AGENTS.claude, ' ❯\u00a0'), 'unknown')
})

test('a long Codex approval reads as waits from its footer, and the dialog line is its header', async () => {
  const { waitsOnOf } = await import('../dist/role-commands.js')
  const command = Array.from({ length: 20 }, (_, i) => `  cat >> notes.txt <<'EOF' # line ${i}`).join('\n')
  const dialog = `Would you like to run the following command?\n\n${command}\n\n› 1. Yes, proceed (y)\n  2. No, and tell Codex what to do differently (esc)\n\n  Press enter to confirm or esc to cancel`
  assert.equal(screenOf(AGENTS.codex, dialog), 'waits')
  assert.equal(waitsOnOf(AGENTS.codex, dialog), 'Would you like to run the following command?')
  // Header scrolled off the visible screen: the footer is the summary.
  assert.equal(waitsOnOf(AGENTS.codex, dialog.split('\n').slice(3).join('\n')), 'Press enter to confirm or esc to cancel')
  // An old dialog in the output above a current prompt does not make it wait.
  const filler = Array.from({ length: 15 }, (_, i) => `output ${i}`).join('\n')
  assert.equal(screenOf(AGENTS.codex, `${dialog}\n${filler}\n› Ask Codex to do anything`), 'ready')
})

test('argvOf pins the requested model, effort and raw role flags for each harness', () => {
  const prompt = 'Read the brief in /a path/brief.md and follow it.'
  const claude = { model: 'haiku', effort: 'low', flags: ['--permission-mode', 'manual'] }
  const codex = { model: 'gpt-6.1-sol', effort: 'high', flags: ['-a', 'on-request', '-s', 'workspace-write'] }
  assert.deepEqual(argvOf(AGENTS.claude, claude, prompt), ['claude', '--model', 'haiku', '--effort', 'low', ...claude.flags, prompt])
  assert.deepEqual(argvOf(AGENTS.codex, codex, prompt), ['codex', '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort="high"', ...codex.flags, prompt])
  for (const agent of Object.values(AGENTS)) {
    assert.deepEqual(argvOf(agent, { model: '', effort: '', flags: ['--policy=ask'] }, ''), [agent.command, '--policy=ask', ''])
    assert.deepEqual(argvOf(agent, { model: '', effort: 'low', flags: [] }, prompt), [agent.command, ...agent.effort.map(arg => arg.replace('{effort}', 'low')), prompt])
  }
})

test('argv templates preserve literal caller text and do not mutate the role', () => {
  const role = { model: 'literal $& ; $(no-command)', effort: '', flags: ['--policy', 'ask'] }
  const before = structuredClone(role)
  const agent = { ...AGENTS.claude, command: '/a path/harness', model: ['--model={model}:{model}'] }
  const prompt = 'A prompt\nwith "quotes" and $(literal text)'
  assert.deepEqual(argvOf(agent, role, prompt), [agent.command, `--model=${role.model}:${role.model}`, '--policy', 'ask', prompt])
  assert.deepEqual(role, before)
  assert.deepEqual(unsetPermission(AGENTS.codex, ['--ask-for-approval=never']), ['-s or --sandbox or --dangerously-bypass-approvals-and-sandbox'])
  assert.deepEqual(unsetPermission(AGENTS.codex, ['--dangerously-bypass-approvals-and-sandbox']), [])
})

const adapter = command => `command: ${command}
model: [--model, '{model}']
effort: [--effort, '{effort}']
permission:
  - [--policy]
prompt: last-arg
screen:
  waits: ['^WAIT$']
  working: ['^BUSY$']
  ready: ['^READY$']
paste: bracketed
`

const temporary = t => {
  const base = mkdtempSync(join(tmpdir(), 'troupe-agents-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = join(base, 'repo')
  const home = join(base, 'home')
  mkdirSync(root)
  mkdirSync(home)
  const write = (path, source) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }

  return { root, home, write, user: name => join(home, '.config/troupe/agents', `${name}.yaml`), repo: name => join(root, '.troupe/agents', `${name}.yaml`) }
}

test('adapter files replace built-ins: home first, repository last; new names are available', t => {
  const { root, home, write, user, repo } = temporary(t)
  assert.deepEqual(loadAgents(root, home).problems, [])
  assert.equal(loadAgents(root, home).agents.claude.command, 'claude')
  write(user('claude'), adapter('user-claude'))
  write(user('custom'), adapter('/path with spaces/custom'))
  assert.equal(loadAgents(root, home).agents.claude.command, 'user-claude')
  write(repo('claude'), adapter('repo-claude'))
  const { agents, problems } = loadAgents(root, home)
  assert.deepEqual(problems, [])
  assert.equal(agents.claude.command, 'repo-claude')
  assert.equal(agents.custom.command, '/path with spaces/custom')
  assert.equal(AGENTS.claude.command, 'claude')
  assert.equal(agents.toString, undefined)
  assert.deepEqual(unsetPermission(agents.claude, []), ['--policy'])
  assert.equal(screenOf(agents.claude, 'WAIT\nBUSY\nREADY'), 'waits')
  assert.equal(screenOf(agents.claude, 'BUSY\nREADY'), 'working')
  assert.equal(screenOf(agents.claude, 'READY'), 'ready')
})

test('broken adapter syntax, schema and regex report their file and line without crashing', t => {
  const { root, home, write, user, repo } = temporary(t)
  write(user('claude'), adapter('user-claude'))
  write(repo('claude'), adapter('bad').replace("ready: ['^READY$']", "ready: ['[']"))
  write(repo('syntax'), 'command: { bad: mapping }\n')
  write(repo('schema'), adapter('custom').replace('prompt: last-arg', 'prompt: stdin'))
  write(repo('permission'), adapter('custom').replace('  - [--policy]', '  - []'))
  write(repo('lists'), adapter('custom').replace("model: [--model, '{model}']", 'model: [null]'))
  const { agents, problems } = loadAgents(root, home)
  assert.equal(agents.claude.command, 'user-claude')
  assert.equal(agents.syntax, undefined)
  assert.equal(problems.length, 5)
  assert.ok(problems.includes(`${repo('claude')}: line 10: screen.ready has an invalid regex: [`))
  assert.ok(problems.some(one => one.startsWith(`${repo('syntax')}: line 1:`)))
  assert.ok(problems.includes(`${repo('schema')}: line 6: prompt must be last-arg`))
  assert.ok(problems.includes(`${repo('permission')}: line 4: permission groups must contain flag names`))
  assert.ok(problems.includes(`${repo('lists')}: line 2: model must be a list of strings`))
})

test('adapter directories that cannot be read are reported', t => {
  const { root, home, write } = temporary(t)
  const path = join(root, '.troupe/agents')
  write(path, 'a file, not a directory')
  const { problems } = loadAgents(root, home)
  assert.equal(problems.length, 1)
  assert.ok(problems[0].startsWith(`${path}: line 1:`))
})

test('troupe check uses loaded adapters and prints broken-file diagnostics', t => {
  const { root, home, write, user, repo } = temporary(t)
  write(user('custom'), adapter('custom'))
  const source = '# mission\n\n```yaml\nroles:\n  a:\n    agent: custom\n    flags: [--policy, ask]\n    touches: []\n```\n\n## Role: a\n\nReply OK.\n'
  write(join(root, 'plan.md'), source)
  assert.equal(check(root, 'plan.md', home).code, 0)
  write(repo('custom'), adapter('repo-custom').replace('--policy', '--approval'))
  const missing = check(root, 'plan.md', home)
  assert.equal(missing.code, 1)
  assert.match(missing.out, /flags must pin custom's permission \(--approval\)/)
  write(repo('custom'), adapter('repo-custom'))
  write(repo('broken'), 'command: { unsupported: flow-map }\n')
  const bad = check(root, 'plan.md', home)
  assert.equal(bad.code, 1)
  assert.ok(bad.out.includes(`${repo('broken')}: line 1:`))
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
  const run = spawnSync(process.execPath, [cli, 'check', 'plan.md'], { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, 1)
  assert.ok(run.stdout.includes(`${repo('broken')}: line 1:`))
})


test('agent badges have distinct one-cell glyphs, optional adapter overrides and first-letter fallbacks', t => {
  assert.deepEqual(badgeOf('claude'), { glyph: '✻', tone: 'coral' })
  assert.deepEqual(badgeOf('codex'), { glyph: '⬢', tone: 'cyan' })
  assert.deepEqual(badgeOf('custom'), { glyph: 'c', tone: 'dim' })
  for (const glyph of ['✻', '⬢', 'A', 'λ']) assert.equal(validBadgeGlyph(glyph), true, glyph)
  for (const glyph of ['', 'AB', ' ', '\n', '\x1b', '界', '🙂', 'e\u0301', '\u0301', '️', '𝄞𝄞']) assert.equal(validBadgeGlyph(glyph), false, glyph)
  const { root, home, write, repo } = temporary(t)
  write(repo('custom'), `${adapter('custom')}badge:\n  glyph: λ\n  tone: cyan\n`)
  const loaded = loadAgents(root, home)
  assert.deepEqual(loaded.problems, [])
  assert.deepEqual(loaded.agents.custom.badge, { glyph: 'λ', tone: 'cyan' })
  assert.deepEqual(badgeOf('custom', loaded.agents.custom), { glyph: 'λ', tone: 'cyan' })
  assert.equal(loaded.agents.codex.badge.glyph, '⬢')
  write(repo('codex'), adapter('custom-codex'))
  assert.deepEqual(badgeOf('codex', loadAgents(root, home).agents.codex), { glyph: 'c', tone: 'dim' }, 'overrides without badges use the adapter fallback')
})

test('invalid badge glyphs, tones and extra fields report precise adapter diagnostics', t => {
  const { root, home, write, repo } = temporary(t)
  for (const [name, badge, field] of [
    ['wide', 'glyph: 界\n  tone: cyan', 'glyph'],
    ['emoji', 'glyph: 🙂\n  tone: cyan', 'glyph'],
    ['multiple', 'glyph: AB\n  tone: cyan', 'glyph'],
    ['tone', 'glyph: C\n  tone: imaginary', 'tone'],
    ['extra', 'glyph: C\n  tone: cyan\n  bad: yes', 'bad'],
  ]) {
    write(repo(name), `${adapter('custom')}badge:\n  ${badge}\n`)
    const problem = loadAgents(root, home).problems.find(problem => problem.startsWith(repo(name)))
    assert.ok(problem.includes(`badge.${field}`), problem)
    assert.match(problem, /: line (13|14|15):/)
  }
  write(repo('mapping'), `${adapter('custom')}badge: [C, cyan]\n`)
  assert.ok(loadAgents(root, home).problems.some(problem => problem.includes('badge must be a mapping')))
})
