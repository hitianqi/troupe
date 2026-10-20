import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { TroupeMission } from '../types'
import { graph } from './graph'
import { readMission } from './read-state'
import { detail, headerLine, ordersTable, rolesTable, TONES } from './view'
import type { Line } from './view'

// Draws pane `troupe` as the approved mock (docs/missions/p1/mock-p1.txt):
// docked, the header, the GRAPH, the TABLES and the DETAIL sections; inline,
// the header and DETAIL first, then the TABLES, and the GRAPH only when the
// rows for all of it are given.

/** The pane top to bottom, as lines of styled runs. */
export function paneLines(m: TroupeMission, width: number, placement: 'dock' | 'inline', rows: number): Line[] {
  const docked = [headerLine(m, width), [], ...graph(m, width), [], ...rolesTable(m, width), [], ...ordersTable(m, width), ...detail(m, width)]
  if (placement === 'dock' || rows >= docked.length) return docked

  return [headerLine(m, width), ...detail(m, width).slice(1), [], ...rolesTable(m, width), [], ...ordersTable(m, width)]
}

/** The rows the whole pane takes at `width`: what the pane asks for inline. */
export async function paneRows($: EngineInterface, width: number): Promise<number | undefined> {
  const m = await readMission($)

  return m === null || 'missing' in m ? undefined : paneLines(m, width, 'dock', 0).length
}

export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const { Box, Text } = $.ui.resolve(e)
  const current = await readMission($)

  if (current === null || 'missing' in current) {
    return (
      <Box flexDirection="column">
        <Text bold color={TONES.bright}>
          TROUPE
        </Text>
        <Text wrap="wrap">{current === null ? 'Reading the mission…' : current.missing}</Text>
        <Text color={TONES.dim} wrap="wrap">
          /troupe &lt;mission&gt; names one under docs/missions/, or a mission folder by its path.
        </Text>
      </Box>
    )
  }
  const lines = paneLines(current, Math.max(40, e.props.bodyColumns), e.props.placement, e.props.scroll.bodyRows)

  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Text wrap="truncate-end">
          {line.length === 0
            ? ' '
            : line.map(run => (
                <Text color={run.tone && TONES[run.tone]} bold={run.bold} strikethrough={run.strike}>
                  {run.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  )
}
