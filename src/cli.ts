#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const COMMANDS: [string, string][] = [
  ['setup', 'install the workflow skill for each harness found'],
  ['up', 'open the orchestrator and the panel in tmux'],
  ['check', 'check the plan'],
  ['approve', 'approve the plan (from a terminal only)'],
  ['dispatch', 'open a role in its own window, worktree and branch'],
  ['status', 'show each role\'s state'],
  ['send', 'type a message into a role\'s window when it is ready'],
  ['wait', 'wait for a role\'s result or a gate\'s answer'],
  ['stage', 'set the mission\'s current stage'],
  ['gate', 'ask the person a question in the panel'],
  ['close', 'close a role\'s window, or the mission'],
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
