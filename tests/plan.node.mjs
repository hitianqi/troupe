// The plan format (dist/plan.js, built by npm test) and `troupe check`.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { layersOf, readPlan, sectionsOf } from '../dist/plan.js'

const TEMPLATE = fileURLToPath(new URL('../skills/troupe-mission/templates/plan.md', import.meta.url))
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))

/** A plan around `yaml`, with a section for each name in `sections`. */
const plan = (yaml, sections = []) =>
  ['# m: a mission', '', '## Done when', '', '- one', '- two', '', '```yaml', yaml.trim(), '```', '', ...sections.flatMap(name => [`## Role: ${name}`, '', `Do ${name}.`, ''])].join('\n')

const CLAUDE = 'agent: claude\n    flags: [--permission-mode, acceptEdits]'
const CODEX = 'agent: codex\n    flags: [-a, on-request, -s, workspace-write]'

test('the template is a clean plan', () => {
  const read = readPlan(readFileSync(TEMPLATE, 'utf8'))
  assert.deepEqual(read.problems, [])
  assert.deepEqual(read.roles.map(role => role.name), ['api', 'web', 'review'])
  assert.equal(read.workflow, 'troupe-mission')
  assert.equal(read.base, 'main')
  assert.deepEqual(read.doneWhen.length, 2)
})

test('a role starts from its profile and its own fields win', () => {
  const read = readPlan(
    plan(
      `
profiles:
  build:
    agent: claude
    model: opus
    effort: high
    flags: [--permission-mode, acceptEdits]
roles:
  web:
    use: build
    model: sonnet
    touches: [web/]
`,
      ['web'],
    ),
  )
  assert.deepEqual(read.problems, [])
  const [web] = read.roles
  assert.equal(web.agent, 'claude')
  assert.equal(web.model, 'sonnet')
  assert.equal(web.effort, 'high')
  assert.deepEqual(web.flags, ['--permission-mode', 'acceptEdits'])
  assert.equal(web.section, 'Do web.')
  assert.equal(web.group, 'build')
})

test('flags must pin the permission; the account default is never inherited', () => {
  const read = readPlan(
    plan(
      `
roles:
  a:
    agent: claude
    touches: [a/]
  b:
    agent: codex
    flags: [-a, never]
    touches: [b/]
  c:
    agent: claude
    flags: [--permission-mode=auto]
    touches: [c/]
  d:
    agent: codex
    flags: [--dangerously-bypass-approvals-and-sandbox]
    touches: [d/]
`,
      ['a', 'b', 'c', 'd'],
    ),
  )
  assert.deepEqual(read.problems, [
    "role a: flags must pin claude's permission (--permission-mode or --dangerously-skip-permissions)",
    "role b: flags must pin codex's permission (-s or --sandbox or --dangerously-bypass-approvals-and-sandbox)",
  ])
})

test('names, agents, text, touches and sections are checked', () => {
  const read = readPlan(
    plan(
      `
roles:
  Web:
    ${CLAUDE}
    touches: [web/]
  x:
    agent: gemini
    touches: []
  y:
    ${CODEX}
  z:
    ${CLAUDE}
    use: nope
    touches: []
    colour: red
`,
      ['Web', 'x', 'y', 'ghost'],
    ),
  )
  assert.deepEqual(read.problems, [
    'role y: no touches (write touches: [] for a role that changes no files)',
    'role z: unknown key "colour"',
    'role z: use names no profile "nope"',
    '## Role: ghost names no role in the yaml block',
    'role Web: a name is lower case letters, digits and -, starting with a letter',
    'role x: unknown agent "gemini" (claude, codex)',
    'role z: no text (a ## Role: z section, or text:)',
  ])
})

test('overlapping touches need depends_on; cycles and unknown roles are refused', () => {
  const read = readPlan(
    plan(
      `
roles:
  a:
    ${CLAUDE}
    touches: [src/]
  b:
    ${CLAUDE}
    touches: [src/x.ts]
  c:
    ${CLAUDE}
    touches: []
    depends_on: [d, ghost]
    reviews: [nobody]
  d:
    ${CLAUDE}
    touches: []
    depends_on: [c]
`,
      ['a', 'b', 'c', 'd'],
    ),
  )
  assert.deepEqual(read.problems, [
    'role c: depends_on unknown role "ghost"',
    'role c: reviews unknown role "nobody"',
    'role c: dependency cycle',
    'role d: dependency cycle',
    'a and b overlap (src/ ~ src/x.ts) but neither depends on the other',
  ])
})

test('a reviewer that changes nothing is grouped under review', () => {
  const read = readPlan(plan(`roles:\n  a:\n    ${CLAUDE}\n    touches: [a/]\n  r:\n    ${CLAUDE}\n    touches: []\n    reviews: [a]`, ['a', 'r']))
  assert.deepEqual(read.roles.map(role => role.group), ['build', 'review'])
  assert.deepEqual(layersOf([{ name: 'b', dependsOn: ['a'] }, { name: 'a', dependsOn: [] }]).layers.map(layer => layer.map(r => r.name)), [['a'], ['b']])
})

test("the mod's orders plans and plans without a roles block say so", () => {
  assert.match(readPlan('# p\n\n```yaml\norders:\n  - id: o1\n```\n').problems[0], /plan of the troupe mod/)
  assert.match(readPlan('# p\n\n```yaml\nroles:\n  reviewer: []\norders:\n  - id: o1\n```\n').problems[0], /plan of the troupe mod/)
  assert.match(readPlan('# p\n').problems[0], /no ```yaml block with a `roles:` key/)
  assert.match(readPlan('```yaml\nroles:\n  a: [x\n```\n').problems[0], /cannot be read: line 3/)
})

test('headings inside fenced code do not cut a section', () => {
  const sections = sectionsOf('## Role: a\n\n```md\n## not a heading\n```\nmore\n\n# Top\n\nloose\n\n## Next\nbody')
  assert.deepEqual(sections, [
    { heading: 'Role: a', body: '```md\n## not a heading\n```\nmore' },
    { heading: 'Next', body: 'body' },
  ])
})

test('troupe check: clean, problems, and no plan', () => {
  const repo = mkdtempSync(join(tmpdir(), 'troupe-check-'))
  const run = (...args) => spawnSync(process.execPath, [cli, 'check', ...args], { cwd: repo, encoding: 'utf8' })
  assert.equal(run().status, 2)
  mkdirSync(join(repo, 'docs/missions/m1'), { recursive: true })
  writeFileSync(join(repo, 'docs/missions/m1/plan.md'), readFileSync(TEMPLATE, 'utf8'))
  const clean = run()
  assert.equal(clean.status, 0, clean.stdout)
  assert.match(clean.stdout, /clean \(3 roles: api, web, review\)/)
  writeFileSync(join(repo, 'bad.md'), plan(`roles:\n  a:\n    agent: claude\n    touches: []\n    text: docs/a.md`))
  const bad = run('bad.md')
  assert.equal(bad.status, 1)
  assert.match(bad.stdout, /bad\.md: 2 problems/)
  assert.match(bad.stdout, /text docs\/a\.md is not in the repository/)
  assert.equal(run('m1').status, 0)
  assert.equal(run('nowhere').status, 2)
})
