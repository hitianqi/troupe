#!/usr/bin/env node
// Drives a take: types and clicks into tmux panes as a person would, and logs
// every action with its time and cell so the edit can add a pointer.
//
//   drive.mjs type  <pane> <text>        type it, character by character, no Enter
//   drive.mjs enter <pane>               press Enter
//   drive.mjs key   <pane> <key>...      tmux key names (C-b, z, Escape, a)
//   drive.mjs click <pane> <row> <col>   a left click at a pane-relative cell (0-based)
//
// Env: TROUPE_TAKE=<path>.actions.jsonl (the log), TMUX_SOCKET (-L name, optional).
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const [verb, pane, ...rest] = process.argv.slice(2)
const socket = process.env.TMUX_SOCKET ? ['-L', process.env.TMUX_SOCKET] : []
const tmux = (...args) => execFileSync('tmux', [...socket, ...args], { encoding: 'utf8' })
const sleep = ms => new Promise(done => setTimeout(done, ms))

/** The pane's top-left cell in its window, so a logged cell is a window cell. */
const offset = () => tmux('display', '-p', '-t', pane, '#{pane_top} #{pane_left}').trim().split(' ').map(Number)

const log = (action) => {
  if (!process.env.TROUPE_TAKE) return
  const [top, left] = offset()
  appendFileSync(process.env.TROUPE_TAKE, `${JSON.stringify({ t: Date.now() / 1000, pane, top, left, ...action })}\n`)
}

/** A person's rhythm: 40–110 ms a key, longer after a space or punctuation. */
const gap = (ch) => 40 + Math.random() * 70 + (ch === ' ' ? 60 : 0) + (/[.,:;?!]/.test(ch) ? 180 : 0)

if (verb === 'type') {
  const text = rest.join(' ')
  log({ verb, text })
  for (const ch of text) {
    tmux('send-keys', '-t', pane, '-l', ch)
    await sleep(gap(ch))
  }
} else if (verb === 'enter') {
  log({ verb })
  tmux('send-keys', '-t', pane, 'Enter')
} else if (verb === 'key') {
  log({ verb, keys: rest })
  tmux('send-keys', '-t', pane, ...rest)
} else if (verb === 'click') {
  const [row, col] = rest.map(Number)
  log({ verb, row, col })
  // SGR mouse, 1-based: press then release. The panel reads it as a real click.
  tmux('send-keys', '-t', pane, '-l', `\x1b[<0;${col + 1};${row + 1}M\x1b[<0;${col + 1};${row + 1}m`)
} else if (verb === 'wheel') {
  // drive.mjs wheel <pane> <row> <col> <up|down> [n]
  const [row, col] = rest.slice(0, 2).map(Number)
  const button = rest[2] === 'up' ? 64 : 65
  const n = Number(rest[3] ?? 1)
  log({ verb, row, col, dir: rest[2], n })
  for (let i = 0; i < n; i++) {
    tmux('send-keys', '-t', pane, '-l', `\x1b[<${button};${col + 1};${row + 1}M`)
    await sleep(90)
  }
} else {
  process.stderr.write('usage: drive.mjs type|enter|key|click|wheel <pane> ...\n')
  process.exit(2)
}
