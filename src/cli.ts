#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

import { execute } from './commands.ts'

const COMMANDS: [string, string][] = [
  ['setup', 'install the workflow skill for each harness found'],
  ['up', 'open the orchestrator and the panel in tmux'],
  ['check', 'check the plan: [mission, folder or plan file]'],
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
    'Commands:',
    ...COMMANDS.map(([name, text]) => `  ${name.padEnd(9)}${text}`),
    '',
    'Options:',
    '  -m, --mission <name>  mission under docs/missions (default: newest)',
    '  setup [--remove] · up [--orch claude|codex]',
    '  gate <id> ["question"] [--no-wait] · stage <id>',
    '  dispatch <role> · send <role> <text…> (or stdin)',
    '  status [--json] [--watch] · close <role> | --all',
    '  wait (--role <r> | --gate <id>) [--timeout <seconds>]',
    '  -v, --version  print the version',
    '  -h, --help     print this help',
    '',
  ].join('\n')

const version = () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  return pkg.version as string
}

const [arg, ...rest] = process.argv.slice(2)
if (arg === '--version' || arg === '-v') {
  console.log(version())
} else if (arg === undefined || arg === '--help' || arg === '-h') {
  process.stdout.write(usage())
} else {
  const stop = new AbortController()
  const cancel = () => stop.abort()
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  const { out, code } = await execute(arg, rest, {
    signal: stop.signal,
    ask: async question => {
      const reader = createInterface({ input: process.stdin, output: process.stdout })
      try {
        return await reader.question(question, { signal: stop.signal })
      } finally {
        reader.close()
      }
    },
  })
  process.off('SIGINT', cancel)
  process.off('SIGTERM', cancel)
  if (code === 2) process.stderr.write(`troupe: ${out}\n${usage()}`)
  else process.stdout.write(out)
  process.exitCode = code
}
