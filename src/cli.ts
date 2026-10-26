#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

import { execute } from './commands.ts'
import { recordActivity } from './activity.ts'
import { statusLine } from './statusline.ts'

const COMMANDS: [string, string][] = [
  ['setup', 'install the workflow skill for each harness found'],
  ['mission', 'new <name>: start a mission in its own worktree, bound to this pane'],
  ['open', 'show the panel beside your current agent'],
  ['up', 'start a mission with its orchestrator and panel in tmux'],
  ['check', 'check the plan: [mission, folder or plan file]'],
  ['approve', 'approve the plan (from a terminal only)'],
  ['dispatch', 'open a role in its own window, worktree and branch'],
  ['status', 'show each role\'s state, or the open missions'],
  ['panel', 'open the live interactive mission panel'],
  ['send', 'type a message into a role\'s window when it is ready'],
  ['wait', 'wait for a role result, readiness or a gate answer'],
  ['stage', 'set the mission\'s current stage'],
  ['gate', 'ask the person a question in the panel'],
  ['teardown', 'remove mission panes, role worktrees and branches'],
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
    '  -m, --mission <name>  mission under docs/missions (default: this pane\'s mission,',
    '                        else the mission branch checked out here)',
    '  setup [--remove] · mission new <name> [--base <ref>] · open [--planning]',
    '  up -m <mission> [--orch claude|codex]',
    '  gate <id> ["question"] [--no-wait] · stage <id>',
    '  dispatch <role> · send <role> <text…> (or stdin)',
    '  status [--json] [--watch] · close <role> | --all',
    '  panel [--once] [--plain] [--width N --height N]',
    '  wait (--role <r> [--ready] | --gate <id>) [--timeout <seconds>]',
    '  teardown [--force] (finished missions require -m)',
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
} else if (arg === 'activity' && rest[0] !== undefined) {
  // Internal: the lifecycle hooks troupe gives a Claude role (see roleSettings in role-commands.ts).
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  recordActivity(input, rest[0])
} else if (arg === 'statusline' && rest[0] !== undefined) {
  // Internal: the status line troupe gives a Claude role (see roleSettings in role-commands.ts).
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  process.stdout.write(statusLine(input, rest[0], rest[1]))
} else {
  const stop = new AbortController()
  const cancel = () => stop.abort()
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  process.once('SIGHUP', cancel)
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
  process.off('SIGHUP', cancel)
  if (code === 2) process.stderr.write(`troupe: ${out}\n${usage()}`)
  else process.stdout.write(out)
  process.exitCode = code
}
