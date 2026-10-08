export type EtaStats = Record<string, { avgMs: number; n: number }>

/** Exponential moving average of durations per key (agent type + model). */
export function learn(stats: EtaStats, key: string, durationMs: number): EtaStats {
  const prev = stats[key]
  const avgMs = prev ? prev.avgMs * 0.7 + durationMs * 0.3 : durationMs
  return { ...stats, [key]: { avgMs, n: (prev?.n ?? 0) + 1 } }
}

/** Remaining ms, or undefined when nothing is known yet; negative = over the usual time. */
export function remaining(stats: EtaStats, key: string, elapsedMs: number): number | undefined {
  const s = stats[key]
  return s ? s.avgMs - elapsedMs : undefined
}

export function fmtMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h${m % 60}m`
}

export function fmtEta(rem: number | undefined): string {
  if (rem === undefined) return '?'
  return rem >= 0 ? `~${fmtMs(rem)}` : `+${fmtMs(-rem)}`
}

export function fmtTokens(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)
}
