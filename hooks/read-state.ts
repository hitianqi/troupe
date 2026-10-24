import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { collectResults } from './dispatch.ts'

// Finds the mission `/troupe` shows: the one it named, else the newest under
// docs/missions/; and on each poll brings the role windows' results into its
// folder. troupe-panel reads and draws the mission itself (src/).

const target = atom({ plugin: 'troupe', key: 'target' } as const, '')

const MISSIONS = 'docs/missions'

/** The mission whose plan.md changed last; equal times go to the higher name (p1 over p0). */
async function newestMission($: EngineInterface): Promise<string | undefined> {
  const dirs = (await $.fs.list(MISSIONS).catch(() => [])).filter(entry => entry.kind === 'dir')
  const plans = await Promise.all(
    dirs.map(dir => $.fs.stat(`${MISSIONS}/${dir.name}/plan.md`).then(stat => ({ name: dir.name, at: stat.mtimeMs }), () => undefined)),
  )
  const newest = plans
    .filter(plan => plan !== undefined)
    .sort((a, b) => b.at - a.at || b.name.localeCompare(a.name, 'en', { numeric: true }))[0]

  return newest && `${MISSIONS}/${newest.name}`
}

/** `/troupe <mission>`: a mission name, a mission folder's path, or '' for the newest. */
export async function setTarget($: EngineInterface, want: string): Promise<void> {
  await update($, target, () => want)
}

/** The mission's folder, with its role windows' results collected; or why there is none. */
export async function refresh($: EngineInterface): Promise<{ dir: string } | { missing: string }> {
  const want = await read($, target)
  const dir = want.includes('/') ? want.replace(/\/+$/, '') : want !== '' ? `${MISSIONS}/${want}` : await newestMission($)
  if (dir === undefined) return { missing: `no mission under ${MISSIONS}/` }
  if ((await $.fs.stat(`${dir}/plan.md`).catch(() => undefined)) === undefined) return { missing: `no plan.md in ${dir}` }
  // What the role windows wrote in their worktrees (done markers, reviews) comes into the folder.
  await collectResults($, dir).catch(error => $.ui.log(`could not collect the role windows' results: ${String(error)}`))

  return { dir }
}
