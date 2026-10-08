import type { ModelSource } from '../types'

export type Alias = 'haiku' | 'sonnet' | 'opus'

export type SpawnFacts = {
  subagentType: string
  description: string
  prompt: string
  model?: string
  parentModel: string
  isBuiltIn: boolean
  isFork: boolean
}

export type Choice = { model?: string; source: ModelSource; why: string }

const TIER: Record<Alias, number> = { haiku: 1, sonnet: 2, opus: 3 }

// Agent types shipped with Claude Code and the model that fits their job.
const BY_TYPE: Record<string, Alias> = {
  Explore: 'haiku',
  'claude-code-guide': 'haiku',
  'statusline-setup': 'haiku',
  Plan: 'opus',
}

const HEAVY =
  /architect|architekt|design|zaprojektuj|security|bezpiecze|audit|audyt|root cause|przyczyn|race condition|deadlock|migrat|refactor|refaktor|trade-?off|threat/i
const LIGHT =
  /\b(search|find|grep|locate|list|lookup|look up|count|summari[sz]e|szukaj|znajd\w*|wyszukaj|przeszukaj|wylistuj|policz|podsumuj|przeczytaj)\b/i

export function tierOf(model: string): number {
  const m = model.toLowerCase()
  if (m.includes('haiku')) return 1
  if (m.includes('sonnet')) return 2
  return 3
}

function capAt(want: Alias, parentModel: string): { model: Alias; isCapped: boolean } {
  const ceiling = tierOf(parentModel)
  if (TIER[want] <= ceiling) return { model: want, isCapped: false }
  const fallback = (Object.keys(TIER) as Alias[]).filter(a => TIER[a] <= ceiling).pop() ?? 'haiku'
  return { model: fallback, isCapped: true }
}

/** Picks the subagent's model; `model` undefined leaves the engine's default. */
export function chooseModel(f: SpawnFacts): Choice {
  if (f.isFork) return { source: 'fork', why: 'fork dziedziczy model' }
  if (f.model) return { model: f.model, source: 'explicit', why: 'model podany w wywolaniu' }
  if (!f.isBuiltIn) return { source: 'agent-def', why: 'definicja agenta' }

  let want: Alias
  let why: string
  const text = `${f.description}\n${f.prompt.slice(0, 2000)}`
  const byType = BY_TYPE[f.subagentType]
  if (byType) {
    want = byType
    why = `typ ${f.subagentType}`
  } else if (HEAVY.test(text)) {
    want = 'opus'
    why = 'zadanie analityczne/projektowe'
  } else if (LIGHT.test(f.description)) {
    want = 'haiku'
    why = 'wyszukiwanie/odczyt'
  } else {
    want = 'sonnet'
    why = 'implementacja/ogolne'
  }

  const { model, isCapped } = capAt(want, f.parentModel)
  return { model, source: 'rule', why: isCapped ? `${why} (limit: model glowny)` : why }
}

/** Short display name: claude-opus-5-5 -> opus-5.5 */
export function shortModel(model: string): string {
  const m = model.replace(/^claude-/, '').replace(/\[.*\]$/, '')
  return m.replace(/-(\d+)-(\d+)(-\d{8})?$/, '-$1.$2')
}
