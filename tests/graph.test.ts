import { expect, test } from 'claude-code/testing'

import { graph } from '../hooks/graph'
import { textOf } from '../hooks/view'
import { GRAPH_106, GRAPH_107, GRAPH_50 } from './graph-goldens'
import { P1 } from './p1'

const drawn = (width: number) => graph(P1, width).map(line => textOf(line).trimEnd())

test('the dock Tianqi gets, about 50 columns: the stacked graph, as golden', async () => {
  expect(drawn(50)).toEqual(GRAPH_50)
})

test('the boundary: 106 columns still stacks, 107 sets the four groups side by side', async () => {
  expect(drawn(106)).toEqual(GRAPH_106)
  expect(drawn(107)).toEqual(GRAPH_107)
  expect(GRAPH_106.some(line => line.includes('▼'))).toBe(true)
  expect(GRAPH_107.some(line => line.includes('≡ plan') && line.includes('≡ land'))).toBe(true)
})
