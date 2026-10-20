export type TroupeOrderState = 'planned' | 'running' | 'done' | 'reviewed'

export type TroupeOrder = {
  id: string
  kind: string
  goal: string
  model: string
  dependsOn: string[]
  state: TroupeOrderState
}

export type TroupeRole = {
  name: string
  model: string
  effort: string
  duty: string[]
  skills: { name: string; isFound: boolean }[]
}

/** One mission as the pane draws it: what plan.md says, checked, with each order's state. */
export type TroupeMission = {
  /** The mission's folder, as the pane found or was told it. */
  dir: string
  name: string
  title: string
  /** The block's `goal:`, else the first sentence of the plan's Intent. */
  goal: string
  /** Where the mission stands, as an index into the workflow's STEPS. */
  step: number
  /** False when the block had no `roles`: the three default roles are drawn. */
  hasRoles: boolean
  roles: TroupeRole[]
  orders: TroupeOrder[]
  problems: string[]
}

/** troupe-panel's tmux pane, split beside the session's own: where it is and what it shows. */
export type TroupePanel = {
  /** The tmux server's socket, from the session's `TMUX`; absent for the default one. */
  socket?: string
  /** The panel's pane id, `%N`. */
  pane: string
  /** The mission folder it draws, as the session names it (relative to the session's directory, or absolute). */
  dir: string
}

declare module 'claude-code' {
  interface PluginState {
    troupe: {
      /** What `/troupe <mission>` named: a mission name, or a mission folder's path; '' for the newest. */
      target: string
      /** The mission drawn, or why there is none. */
      mission: TroupeMission | { missing: string } | null
      /** The panel split beside the session, while it is open. */
      panel: TroupePanel | null
    }
  }
}
