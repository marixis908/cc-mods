export type ModelSource = 'explicit' | 'rule' | 'agent-def' | 'inherit' | 'fork'

export type AgentRow = {
  id: string
  description: string
  type: string
  model: string
  source: ModelSource
  why: string
  status: 'running' | 'done' | 'failed' | 'aborted'
  startedAt: number
  durationMs?: number
  steps: number
  inTokens: number
  outTokens: number
  etaKey: string
}

export type MainInfo = {
  model: string
  contextPct?: number
  contextTokens?: number
  window?: number
  costUsd?: number
  turnStartedAt?: number
}

export type Mode = 'auto' | 'suggest' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'agent-lens': {
      agents: AgentRow[]
      main: MainInfo
      isExpanded: boolean
      mode: Mode
      now: number
      etaAvg: Record<string, { avgMs: number; n: number }>
    }
  }
}
