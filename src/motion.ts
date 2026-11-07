import type { Drawn } from './draw.ts'
import type { PanelModel } from './model.ts'
import type { RoleState } from './state.ts'
import type { Screen } from './screen.ts'

// The live panel's motion: what it remembers between reads (each role's
// tokens/s and when its state changed) and the effects drawn over a frame as
// a function of time. Only the live panel moves; --once and --plain never do.

/** A role's output count at its last read, and its tokens/s between reads, oldest first. */
export type Rates = { at: number; output: number; rates: number[] }
const KEEP = 64

/** The next rates after reading `output` at `at` (ms); a count that drops (a new session) starts again from it. */
export const sample = (prev: Rates | undefined, output: number, at: number): Rates => {
  if (prev === undefined || output < prev.output) return { at, output, rates: prev?.rates ?? [] }
  const seconds = (at - prev.at) / 1000
  if (seconds < 1) return prev

  return { at, output, rates: [...prev.rates, (output - prev.output) / seconds].slice(-KEEP) }
}

export class Motion {
  private readonly rates = new Map<string, Rates>()
  private readonly states = new Map<string, { state: RoleState; at: number }>()
  private model: PanelModel | undefined
  /** Remembers each role's tokens/s and when its state last changed. */
  observe(model: PanelModel, now: number) {
    for (const role of model.roles) {
      if (role.tokens !== undefined) this.rates.set(role.name, sample(this.rates.get(role.name), role.tokens.output, now))
      if (this.states.get(role.name)?.state !== role.state) this.states.set(role.name, { state: role.state, at: this.model === undefined ? -Infinity : now })
    }
    this.model = model
  }
  /** The frame with its effects at `now`. */
  decorate(base: Screen, _drawn: Drawn, _selected: string, _now: number): Screen {
    return base
  }
  /** Whether anything still moves at `now`; when not, the panel stops its frames until the next read. */
  moving(_now: number): boolean {
    return false
  }
}
