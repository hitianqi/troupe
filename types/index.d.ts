export type TroupePlaced = { isPlaced: boolean; reason?: string }

export type TroupeAgent = {
  id: string
  description: string
  type: string
  status: string
}

export type TroupeAgentCall = {
  description: string
  model: string
  isolation: string
  verdict: 'denied' | 'passed'
}

export type TroupeAsk = {
  round: number
  kind: 'approve' | 'change' | 'other' | 'dismissed'
  answer: string
}

export type TroupeSkills = {
  total: number
  included: number
  names: string[]
}

declare module 'claude-code' {
  interface PluginState {
    troupe: {
      version: string
      placed: TroupePlaced | null
      agents: TroupeAgent[]
      calls: TroupeAgentCall[]
      asks: TroupeAsk[]
      skills: TroupeSkills | null
    }
  }
}
