import { expect, test } from 'claude-code/testing'

import { actionsOf, scrolled } from '../src/ansi.ts'
import { viewLines, viewport } from '../src/lines.ts'
import { missionOf } from '../src/mission.ts'
import { readPlan } from '../src/plan.ts'
import { textOf } from '../src/view.ts'
import { VALID } from './fixtures.ts'
import { DOCKED, VIEW_30 } from './mock-p1.ts'
import { P1 } from './p1.ts'

const text = (lines: ReturnType<typeof viewLines>) => lines.map(line => textOf(line).trimEnd())

test('at 110 columns the whole view is the golden, cell for cell', async () => {
  expect(text(viewLines(P1, 110))).toEqual(DOCKED)
  expect(text(viewport(viewLines(P1, 110), DOCKED.length, 0).lines)).toEqual(DOCKED)
})

test('the view puts the GRAPH first: header, GRAPH, ROLES, ORDERS, then DETAIL', async () => {
  const lines = text(viewLines(P1, 110))
  const at = (start: string) => lines.findIndex(line => line.startsWith(start))
  const order = [at('TROUPE ·'), at('╔═ ▦ MISSION'), at('  ── ROLES ·'), at('  ── ORDERS ·'), at('  ── GOAL')]
  expect(order.every(index => index >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
  // Compact ROLES and ORDERS: one line each, the goal texts only in DETAIL.
  expect(lines).toContain('  ◐ orchestrator  opus    needs you  ◆ Plan OK?')
  expect(lines.filter(line => line.includes('Turn the troupe pane into')).length).toBe(1)
  expect(lines.findIndex(line => line.includes('Turn the troupe pane into'))).toBeGreaterThan(at('  ── GOAL'))
})

test('the viewport: the header pinned, hints top and bottom, never more rows, the end reaching the last line', async () => {
  expect(text(viewport(viewLines(P1, 110), 30, 0).lines)).toEqual(VIEW_30)
  const three = missionOf('docs/missions/demo', readPlan(VALID), ['plan.md'])
  for (const m of [P1, three]) {
    for (const [width, rows] of [[30, 27], [63, 57], [79, 57]] as const) {
      const all = viewLines(m, width)
      const top = viewport(all, rows, 0)
      expect(text(top.lines).at(-1)).toMatch(/^↓ \d+ more rows · ↑↓ PgUp PgDn$/)
      for (let offset = 0; offset <= top.maxOffset; offset += 1) {
        const view = text(viewport(all, rows, offset).lines)
        expect(view.length).toBeLessThanOrEqual(rows)
        expect(view[0]).toBe(text(all)[0])
      }
      const end = viewport(all, rows, Number.MAX_SAFE_INTEGER)
      expect(end.offset).toBe(top.maxOffset)
      expect(text(end.lines).at(-1)).toBe(text(all).at(-1))
      expect(text(end.lines)[1]).toBe(`↑ ${end.offset} more`)
      expect(end.lines).toHaveLength(rows)
    }
  }
  expect(viewport(viewLines(P1, 110), 0, 0).lines).toEqual([])
})

test('the keys and the wheel: arrows, j/k, PgUp/PgDn, Home/End, SGR wheel reports, ctrl+c', async () => {
  expect(actionsOf('\x1b[A\x1b[Bkj\x1b[5~\x1b[6~\x1b[H\x1b[F\x1b[1~\x1b[4~\x1bOA\x03')).toEqual([
    'up', 'down', 'up', 'down', 'pageUp', 'pageDown', 'home', 'end', 'home', 'end', 'up', 'quit',
  ])
  // A burst of wheel reports, a click (skipped), and a stray key (skipped).
  expect(actionsOf('\x1b[<65;10;4M\x1b[<65;10;4M\x1b[<0;3;3Mx\x1b[<64;1;1M')).toEqual(['wheelDown', 'wheelDown', 'wheelUp'])
  expect([scrolled(5, 'up', 40, 30), scrolled(5, 'pageDown', 40, 30), scrolled(5, 'end', 40, 30), scrolled(5, 'home', 40, 30), scrolled(29, 'wheelDown', 40, 30)]).toEqual([4, 30, 30, 0, 30])
})

test("the colours: the current checkpoint orange and bold, done green, waiting grey, OpenRig's accents", async () => {
  const runs = viewLines(P1, 110).flat()
  const run = (text: string) => runs.find(one => one.text.includes(text))
  expect(run('◆ Plan OK?')).toMatchObject({ tone: 'warn', bold: true })
  expect(run('✓ plan')).toMatchObject({ tone: 'ok' })
  expect(run('◆ MR OK?')).toMatchObject({ tone: 'dim' })
  expect(run('needs you')).toMatchObject({ tone: 'warn' })
  expect(run('━━▶')).toMatchObject({ tone: 'accent' })
  expect(run('▦ MISSION p1')).toMatchObject({ tone: 'accentBright' })
  expect(run('≡ reviewer')).toMatchObject({ tone: 'accentBright' })
  expect(run('ROLES · ')).toMatchObject({ tone: 'bright', bold: true })
})

test("the graph shows the roles and the human checkpoints only, not the system's own steps", async () => {
  const graphText = text(viewLines(P1, 110)).slice(2, 15).join('\n')
  for (const shown of ['≡ orchestrator', '≡ builder', '≡ reviewer', '◆ Plan OK?', '◆ MR OK?', '◆ Merged?', 'fix ≤ 2']) expect(graphText).toContain(shown)
  for (const hidden of ['Intent', 'Slim', 'Cut', 'Final review', 'Teardown', 'main']) expect(graphText).not.toContain(hidden)
})

test('at 57 rows the GRAPH, ROLES and ORDERS all fit, at 63 and at 79 columns, for three orders', async () => {
  const m = missionOf('docs/missions/demo', readPlan(VALID), ['plan.md'])
  for (const width of [63, 79]) {
    const lines = text(viewport(viewLines(m, width), 57, 0).lines)
    const orders = lines.findIndex(line => line.startsWith('  ── ORDERS ·'))
    expect(orders).toBeGreaterThan(0)
    expect(lines.slice(orders + 1, orders + 4).map(line => line.trim().split(/ +/)[1])).toEqual(['o1', 'o2', 'o3'])
  }
})
