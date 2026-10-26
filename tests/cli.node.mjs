// dist/cli.js under plain Node (npm test builds first): version, help, and
// an unknown command.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })

test('--version and -v print the package.json version', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  for (const flag of ['--version', '-v']) {
    const r = run(flag)
    assert.equal(r.status, 0)
    assert.equal(r.stdout.trim(), version)
  }
})

test('--help, -h and no arguments print the usage and exit 0', () => {
  for (const args of [['--help'], ['-h'], []]) {
    const r = run(...args)
    assert.equal(r.status, 0)
    assert.match(r.stdout, /dispatch/)
  }
})

test('an unknown command prints the usage on stderr and exits 2', () => {
  const r = run('bogus')
  assert.equal(r.status, 2)
  assert.equal(r.stdout, '')
  assert.match(r.stderr, /unknown command 'bogus'/)
  assert.match(r.stderr, /dispatch/)
})

test('help documents readiness, teardown and per-pane mission defaults', () => {
  const r = run('--help')
  for (const text of ['show the panel beside', '--ready', 'teardown [--force]', "this pane's mission", 'mission new <name>', 'finished missions require -m']) assert.ok(r.stdout.includes(text), text)
})
