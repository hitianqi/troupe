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
  skills: string[]
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

/** The human's yes to one plan.md: APPROVAL.json in the mission folder. */
export type TroupeApproval = {
  /** `sha256:<hex>` of plan.md as it was approved. */
  planHash: string
  /** ISO time of the approval. */
  approvedAt: string
}

/** One role window: a Claude instance troupe_dispatch opened for an order (or, later, its review). */
export type TroupeRoleWindow = {
  order: string
  role: 'builder' | 'reviewer'
  /** tmux's ids for the window and its one pane, `@N` and `%N`. */
  window: string
  pane: string
  /** The window's worktree, absolute, and the branch checked out there. */
  worktree: string
  branch: string
  /** False until the prompt naming the brief has left claude's input box (no box in time, or still unsent). */
  isBriefSent: boolean
}

/** The role session troupe opened for a mission, `troupe-<mission>`, a tmux session of its own on the orchestrator's server. */
export type TroupeRoleSession = {
  /** The tmux server's socket; absent for the default one. */
  socket?: string
  /** The session's name and tmux's id for it, `$N`: troupe acts only on the session with both. */
  name: string
  id: string
  /** Keyed by the window's name: the order id for a builder. */
  windows: Record<string, TroupeRoleWindow>
}

declare module 'claude-code' {
  interface PluginState {
    troupe: {
      /** What `/troupe <mission>` named: a mission name, or a mission folder's path; '' for the newest. */
      target: string
      /** The panel split beside the session, while it is open. */
      panel: TroupePanel | null
      /** The role sessions troupe opened, keyed by mission name. */
      roles: Record<string, TroupeRoleSession>
    }
  }
}
