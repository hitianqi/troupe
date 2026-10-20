#!/usr/bin/env node
// Check 3 evidence (o1 of p2), not the product: draws the troupe pane's text
// (header, GRAPH, TABLES, DETAIL) outside the engine, from the same hooks/
// plan.ts, view.ts and graph.ts, with no engine import, and redraws on a poll.
//
//   node --experimental-transform-types docs/missions/p2/panel-probe.mjs <mission dir> [--width N] [--once] [--plain]
//   ... panel-probe.mjs --golden     the tests/p1.ts fixture at 110 columns, against tests/mock-p1.ts
//
// --experimental-transform-types: graph.ts and yaml.ts use parameter
// properties, which Node's default type stripping refuses. ts-resolve.mjs
// adds the .ts the hooks' relative imports leave out.

import { register } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

register('./ts-resolve.mjs', import.meta.url)

const hooks = new URL('../../../hooks/', import.meta.url)
const { readPlan, stepOf } = await import(new URL('plan.ts', hooks).href)
const { detail, headerLine, ordersTable, rolesTable, textOf, TONES } = await import(new URL('view.ts', hooks).href)
const { graph } = await import(new URL('graph.ts', hooks).href)

const args = process.argv.slice(2)
const flag = name => args.includes(name)
const widthArg = args.indexOf('--width')
const fixedWidth = widthArg >= 0 ? Number(args[widthArg + 1]) : undefined
const dir = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--width')
const POLL_MS = 2000 // hooks/register.tsx POLL_MS

// paneLines' docked order, copied from hooks/draw-pane.tsx, which Node cannot
// load (JSX, and read-state.ts imports the engine).
const docked = (m, width) => [headerLine(m, width), [], ...graph(m, width), [], ...rolesTable(m, width), [], ...ordersTable(m, width), ...detail(m, width)]

// read-state.ts's refresh() without the engine: order state from the review
// files only (no $.agent.list), skills unchecked (no $.session.usage).
function readMission(missionDir) {
  const plan = readPlan(readFileSync(join(missionDir, 'plan.md'), 'utf8'))
  const files = readdirSync(missionDir)
  const reviewed = id => files.some(file => file === `REVIEW-${id}.md` || new RegExp(`^REVIEW-${id}-\\d+\\.md$`).test(file))
  const orders = plan.orders.map(({ id, kind, goal, model, dependsOn }) => ({ id, kind, goal, model, dependsOn, state: reviewed(id) ? 'reviewed' : 'planned' }))

  return {
    dir: missionDir,
    name: basename(missionDir),
    title: plan.title,
    goal: plan.goal,
    step: stepOf({ problems: plan.problems, orders }, files),
    hasRoles: plan.hasRoles,
    roles: plan.roles.map(role => ({ ...role, skills: role.skills.map(name => ({ name, isFound: true })) })),
    orders,
    problems: plan.problems,
  }
}

const sgr = hex => `\x1b[38;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`
const paint = line =>
  line.map(run => `${run.tone ? sgr(TONES[run.tone]) : ''}${run.bold ? '\x1b[1m' : ''}${run.strike ? '\x1b[9m' : ''}${run.text}\x1b[0m`).join('')

function frame(width, rows) {
  const lines = docked(readMission(dir), width)
  const shown = rows === undefined ? lines : lines.slice(0, rows)

  return shown.map(line => (flag('--plain') ? textOf(line).trimEnd() : paint(line))).join('\n')
}

if (flag('--golden')) {
  const { P1 } = await import(new URL('../../../tests/p1.ts', import.meta.url).href)
  const { DOCKED } = await import(new URL('../../../tests/mock-p1.ts', import.meta.url).href)
  const drawn = docked(P1, 110).map(line => textOf(line).trimEnd())
  const same = JSON.stringify(drawn) === JSON.stringify(DOCKED)
  console.log(`golden: ${drawn.length} lines drawn, ${DOCKED.length} in tests/mock-p1.ts DOCKED, identical: ${same}`)
  process.exit(same ? 0 : 1)
}
if (!dir) {
  console.error('usage: panel-probe.mjs <mission dir> [--width N] [--once] [--plain] | --golden')
  process.exit(2)
}
if (flag('--once') || !process.stdout.isTTY) {
  console.log(frame(fixedWidth ?? 80))
  process.exit(0)
}

// The panel: clear and redraw when plan.md or the folder changes, or the pane
// is resized; clip to the pane's rows so it never scrolls; leave on SIGTERM.
let last = ''
const draw = force => {
  let key
  try {
    key = `${statSync(join(dir, 'plan.md')).mtimeMs}:${statSync(dir).mtimeMs}:${process.stdout.columns}x${process.stdout.rows}`
  } catch (error) {
    key = `missing:${error.code}`
  }
  if (!force && key === last) return
  last = key
  let text
  try {
    text = frame(fixedWidth ?? process.stdout.columns, process.stdout.rows - 1)
  } catch (error) {
    text = `troupe: cannot read ${dir}/plan.md (${error.code ?? error.message})`
  }
  process.stdout.write(`\x1b[?25l\x1b[H\x1b[2J${text}\n\x1b[2mpoll ${POLL_MS} ms · drawn ${new Date().toISOString().slice(11, 19)}\x1b[0m`)
}
const quit = () => {
  process.stdout.write('\x1b[0m\x1b[?25h\n')
  process.exit(0)
}
process.on('SIGTERM', quit)
process.on('SIGINT', quit)
process.stdout.on('resize', () => draw(true))
setInterval(() => draw(false), POLL_MS)
draw(true)
