import { expect, test } from 'claude-code/testing'

test('an Agent hook that throws still refuses the call', async ($, on) => {
  // These hooks stand for the engine: the Agent tool counts what reached it.
  let ran = 0
  on('tool.call', () => {
    ran += 1

    return { result: {} }
  })
  on('ui.log', () => ({ value: undefined }))

  // No description: e.description.startsWith throws inside the hook, and
  // only its .catch guard keeps the call from going through.
  const out = await $.tool.call({ tool: 'Agent', prompt: 'Say hi.' } as never)
  expect(ran).toBe(0)
  expect(JSON.stringify(out)).toContain('guard failed')
})
