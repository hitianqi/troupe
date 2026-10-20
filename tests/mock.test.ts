import { expect, test } from 'claude-code/testing'

import { paneLines } from '../hooks/draw-pane'
import { textOf } from '../hooks/view'
import { DOCKED, INLINE } from './mock-p1'
import { P1 } from './p1'

const text = (lines: ReturnType<typeof paneLines>) => lines.map(line => textOf(line).trimEnd())

test('docked at 110 columns, the pane is the approved mock, cell for cell', async () => {
  expect(text(paneLines(P1, 110, 'dock', 0))).toEqual(DOCKED)
})

test('inline at 110 columns with fewer rows than the whole: header, DETAIL, then TABLES, as the mock', async () => {
  expect(text(paneLines(P1, 110, 'inline', 30))).toEqual(INLINE)
})

test('inline given the rows for everything: the docked pane, GRAPH included', async () => {
  expect(text(paneLines(P1, 110, 'inline', DOCKED.length))).toEqual(DOCKED)
})

test("the colours: the current checkpoint orange and bold, done green, waiting grey, OpenRig's accents", async () => {
  const runs = paneLines(P1, 110, 'dock', 0).flat()
  const run = (text: string) => runs.find(one => one.text.includes(text))
  expect(run('◆ Plan OK?')).toMatchObject({ tone: 'warn', bold: true })
  expect(run('✓ plan')).toMatchObject({ tone: 'ok' })
  expect(run('◆ MR OK?')).toMatchObject({ tone: 'dim' })
  expect(run('needs you')).toMatchObject({ tone: 'warn' })
  expect(run('━━▶')).toMatchObject({ tone: 'accent' })
  expect(run('▦ MISSION p1')).toMatchObject({ tone: 'accentBright' })
  expect(run('≡ reviewer')).toMatchObject({ tone: 'accentBright' })
  expect(run('ROLE')).toMatchObject({ tone: 'accentBright', bold: true })
})

test("the graph shows the roles and the human checkpoints only, not the system's own steps", async () => {
  const graphText = text(paneLines(P1, 110, 'dock', 0)).slice(2, 15).join('\n')
  for (const shown of ['≡ orchestrator', '≡ builder', '≡ reviewer', '◆ Plan OK?', '◆ MR OK?', '◆ Merged?', 'fix ≤ 2']) expect(graphText).toContain(shown)
  for (const hidden of ['Intent', 'Slim', 'Cut', 'Final review', 'Teardown', 'main']) expect(graphText).not.toContain(hidden)
})
