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

test('the colours: the current step orange and bold, done green, light-skipped grey and struck, gates waiting grey', async () => {
  const runs = paneLines(P1, 110, 'dock', 0).flat()
  const run = (text: string) => runs.find(one => one.text.includes(text))
  expect(run('● ◆ Plan OK?')).toMatchObject({ tone: 'warn', bold: true })
  expect(run('✓ Intent')).toMatchObject({ tone: 'ok' })
  expect(run('Slim')).toMatchObject({ tone: 'dim', strike: true })
  expect(run('Order review')?.strike).toBeUndefined()
  expect(run('◆ MR OK?')).toMatchObject({ tone: 'dim' })
  expect(run('needs you')).toMatchObject({ tone: 'warn' })
  expect(run('━━▶')).toMatchObject({ tone: 'accent' })
  expect(run('▦ MISSION p1')).toMatchObject({ tone: 'accentBright' })
  expect(run('ROLE')).toMatchObject({ tone: 'accentBright', bold: true })
})
