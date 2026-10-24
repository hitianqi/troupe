#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const COMMANDS: [string, string][] = [
  ['setup', 'set up troupe in this repository'],
  ['up', 'call up the troupe from an approved plan'],
  ['check', 'check the plan and the environment'],
  ['approve', 'approve the plan'],
  ['dispatch', 'send an order to a role'],
  ['status', 'show the mission'],
  ['send', 'send a message to a role'],
  ['wait', 'wait for a role to report'],
  ['stage', 'stage a role\'s work'],
  ['gate', 'open or pass a checkpoint'],
  ['close', 'close the mission'],
]

const usage = () =>
  [
    'Usage: troupe <command>',
    '',
    'Commands (not yet built):',
    ...COMMANDS.map(([name, text]) => `  ${name.padEnd(9)}${text}`),
    '',
    'Options:',
    '  -v, --version  print the version',
    '  -h, --help     print this help',
    '',
  ].join('\n')

const version = () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  return pkg.version as string
}

const [arg] = process.argv.slice(2)
if (arg === '--version' || arg === '-v') {
  console.log(version())
} else if (arg === undefined || arg === '--help' || arg === '-h') {
  process.stdout.write(usage())
} else {
  process.stderr.write(`troupe: unknown command '${arg}'\n\n${usage()}`)
  process.exitCode = 2
}
