import { PLAN_GATE } from './log.ts'
import { parseYaml } from './yaml.ts'
import type { Yaml } from './yaml.ts'

// A workflow's stages.yaml: the list the panel draws as STAGES. A stage
// with `gate:` waits for the person at that gate; the plan gate comes first.

export type Stage = { id: string; label: string; gate?: string }

/** The stages of the default workflow, when its stages.yaml cannot be found. */
export const DEFAULT_STAGES: Stage[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'plan-ok', label: 'Plan OK?', gate: PLAN_GATE },
  { id: 'build', label: 'Build' },
  { id: 'review', label: 'Review' },
  { id: 'mr-ok', label: 'MR OK?', gate: 'mr-ok' },
  { id: 'mr', label: 'Open MR' },
  { id: 'done', label: 'Done' },
]

const isMap = (value: Yaml | undefined): value is { [key: string]: Yaml } => typeof value === 'object' && value !== null && !Array.isArray(value)

export const readStages = (source: string): { stages: Stage[]; problems: string[] } => {
  let data: Yaml
  try {
    data = parseYaml(source)
  } catch (error) {
    return { stages: [], problems: [`stages.yaml cannot be read: ${(error as Error).message}`] }
  }
  if (!isMap(data) || !Array.isArray(data.stages)) return { stages: [], problems: ['stages.yaml has no list under `stages:`'] }
  const problems: string[] = []
  const stages = data.stages.flatMap((raw, index): Stage[] => {
    const id = isMap(raw) && typeof raw.id === 'string' ? raw.id : ''
    if (id === '') {
      problems.push(`stage ${index + 1} has no id`)

      return []
    }
    const one = raw as { [key: string]: Yaml }
    const label = typeof one.label === 'string' ? one.label : id

    return [typeof one.gate === 'string' ? { id, label, gate: one.gate } : { id, label }]
  })
  const ids = stages.map(stage => stage.id)
  ids.forEach((id, index) => {
    if (ids.indexOf(id) !== index) problems.push(`duplicate stage id: ${id}`)
  })
  if (stages.find(stage => stage.gate !== undefined)?.gate !== PLAN_GATE) problems.push('the first gate must be `gate: plan`: dispatch waits for it')

  return { stages, problems }
}
