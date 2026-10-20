import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { viewLines } from './lines.ts'
import { readMission } from './read-state.ts'
import { TONES } from './view.ts'

// Draws pane `troupe`: the whole view from lines.ts, which bin/troupe-panel
// draws from too. A view taller than the pane's rows scrolls in the engine's
// own window (the arrows while the pane is focused); the header scrolls with it.

/** The rows the whole pane takes at `width`: what the pane asks for inline. */
export async function paneRows($: EngineInterface, width: number): Promise<number | undefined> {
  const m = await readMission($)

  return m === null || 'missing' in m ? undefined : viewLines(m, width).length
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
  const lines = viewLines(current, Math.max(40, e.props.bodyColumns))

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
