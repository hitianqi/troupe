import { mux } from './command-context.ts'
import type { Runtime } from './command-context.ts'
import { tmux } from './run.ts'

const planningPane = (r: Runtime, root: string): string | undefined => {
  const pane = r.env.TMUX_PANE
  if (!pane) return undefined
  const found = tmux(['display', '-p', '-t', pane, '#{@troupe-panel}\t#{@troupe-planning}'], r.run, r.env)
  const [marked, planning] = found.out.trimEnd().split('\t')

  return found.code === 0 && marked === root && planning === '1' ? pane : undefined
}

export const planningOf = (r: Runtime, root: string): boolean => planningPane(r, root) !== undefined
export const finishPlanning = (r: Runtime, root: string): void => {
  const pane = planningPane(r, root)
  if (pane !== undefined) mux(r, ['set-option', '-p', '-u', '-t', pane, '@troupe-planning'])
}
