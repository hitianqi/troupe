import { expect, test } from 'claude-code/testing'

test('a troupe-probe: Agent call is refused, any other Agent call runs', async ($, on) => {
  // These hooks stand for the engine: the Agent tool counts what reached it,
  // the transcript keeps the lines the mod logs.
  let ran = 0
  const logged: string[] = []
  on('tool.call', () => {
    ran += 1

    return { result: {} }
  })
  on('ui.log', (_, e) => {
    logged.push(e.text)

    return { value: undefined }
  })

  const denied = await $.tool.call({
    tool: 'Agent',
    description: 'troupe-probe: refuse me',
    prompt: 'Say hi.',
    model: 'haiku',
  })
  expect(ran).toBe(0)
  expect(JSON.stringify(denied)).toContain('is a probe call')

  await $.tool.call({ tool: 'Agent', description: 'o1: hello', prompt: 'Say hi.' })
  expect(ran).toBe(1)

  expect(logged).toEqual([
    'Agent call description="troupe-probe: refuse me" model=haiku isolation=(none) -> denied',
    'Agent call description="o1: hello" model=(none) isolation=(none) -> passed',
  ])
})
