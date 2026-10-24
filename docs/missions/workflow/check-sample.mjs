// The walkthrough check: the sample mission's plan and review files, read by
// the panel's own reader (src/plan.ts and src/mission.ts, unchanged).
//
// Run it from the repo root (Node 22; src/yaml.ts has a parameter property,
// so strip-types is not enough):
//
//   node --import ./docs/missions/workflow/register.mjs --experimental-transform-types --no-warnings docs/missions/workflow/check-sample.mjs [folder]
//
// `folder` is a mission folder holding plan.md and REVIEW files; the default
// is sample/ next to this file. Paths are resolved from this file, not from
// the cwd.
// Exit 0 when every check holds, 1 otherwise.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', '..', 'src')
const folder = resolvePath(process.argv[2] ?? join(here, 'sample'))

let plan
let state
try {
  plan = await import(pathToFileURL(join(src, 'old-plan.ts')).href)
  state = await import(pathToFileURL(join(src, 'mission.ts')).href)
} catch (error) {
  console.error(`cannot load src/: ${error.message}`)
  console.error('run it with the command at the top of this file (--import register.mjs, --experimental-transform-types)')
  process.exit(2)
}

let failures = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail === '' ? '' : `: ${detail}`}`)
  if (!ok) failures += 1
}

console.log(`folder: ${folder}`)
const files = readdirSync(folder)
const read = plan.readPlan(readFileSync(join(folder, 'plan.md'), 'utf8'))

check('readPlan gives no problems', read.problems.length === 0, read.problems.join(' | ') || 'none')
check('two orders', read.orders.length === 2, `${read.orders.length}: ${read.orders.map(order => order.id).join(', ')}`)

const { layers, stuck } = plan.layersOf(read.orders)
const shape = layers.map(layer => layer.map(order => order.id).join('+')).join(' > ')
check('layersOf: o1 first, o2 after it, nothing stuck', shape === 'o1 > o2' && stuck.length === 0, `${shape || 'none'}${stuck.length > 0 ? `; stuck: ${stuck.map(order => order.id).join(', ')}` : ''}`)

check('isLight', plan.isLight(read.orders) === true, `${read.orders.length} orders`)

const orders = read.orders.map(order => ({ id: order.id, state: state.stateOf(order.id, files) }))
for (const order of orders) check(`stateOf ${order.id} is reviewed`, order.state === 'reviewed', `${order.state}; REVIEW files: ${files.filter(file => file.startsWith(`REVIEW-${order.id}`)).join(', ') || 'none'}`)

const step = plan.STEPS[plan.stepOf({ problems: read.problems, orders }, files)]?.label
check('stepOf gives "MR OK?"', step === 'MR OK?', step ?? 'no step')

if (failures > 0) {
  console.error(`${failures} check${failures === 1 ? '' : 's'} failed`)
  process.exit(1)
}
console.log('all checks hold')
