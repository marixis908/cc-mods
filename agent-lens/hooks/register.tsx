import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, MainInfo, Mode } from '../types'
import { fmtEta, fmtMs, fmtTokens, learn, remaining } from './eta'
import type { EtaStats } from './eta'
import { chooseModel, shortModel } from './rules'

const agents = atom({ plugin: 'agent-lens', key: 'agents' } as const, [] as AgentRow[])
const main = atom({ plugin: 'agent-lens', key: 'main' } as const, { model: '' } as MainInfo)
const isExpanded = atom({ plugin: 'agent-lens', key: 'isExpanded' } as const, false)
const mode = atom({ plugin: 'agent-lens', key: 'mode' } as const, 'auto' as Mode)
const now = atom({ plugin: 'agent-lens', key: 'now' } as const, 0)
const etaAvg = atom({ plugin: 'agent-lens', key: 'etaAvg' } as const, {} as EtaStats)

const STORE_ETA = 'agent-lens.eta'
const STORE_MODE = 'agent-lens.mode'
const MODES: readonly Mode[] = ['auto', 'suggest', 'off']
const MAX_ROWS = 50

const etaKey = (type: string, model: string) => `${type}|${shortModel(model)}`

async function refreshMain($: EngineInterface, patch: Partial<MainInfo> = {}) {
  const usage = await $.session.usage()
  await update($, main, m => ({
    ...m,
    ...patch,
    contextPct: usage.context.percent,
    contextTokens: usage.context.tokens,
    window: usage.context.window,
    costUsd: usage.cost?.usd,
  }))
}

async function finishAgent($: EngineInterface, id: string, status: AgentRow['status'], durationMs: number) {
  let learned: { key: string; ms: number } | undefined
  await update($, agents, list =>
    list.map(a => {
      if (a.id !== id) return a
      if (status === 'done') learned = { key: a.etaKey, ms: durationMs }
      return { ...a, status, durationMs }
    }),
  )
  if (learned) {
    const { key, ms } = learned
    const stats = await update($, etaAvg, s => learn(s ?? {}, key, ms))
    await $.store.set(STORE_ETA, stats)
  }
}

export const register: Register = on => {
  // Turns that ended before their spawn hook saw the agent id (module-local; a reload drops it).
  const endedEarly = new Map<string, { status: AgentRow['status']; durationMs: number }>()

  on('session.start', async ($, e, next) => {
    const storedEta = (await $.store.get(STORE_ETA)) as EtaStats | undefined
    if (storedEta) await update($, etaAvg, () => storedEta)
    const storedMode = (await $.store.get(STORE_MODE)) as Mode | undefined
    if (storedMode && MODES.includes(storedMode)) await update($, mode, () => storedMode)

    await $.command.register({
      name: 'agent-lens',
      description: 'Agent Lens: auto | suggest | off (dobor modeli), expand | collapse, reset',
    })
    await refreshMain($, { model: await $.session.model() })

    // Ticks the clock for elapsed/ETA only while something runs.
    $.clock.every(1000, () => {
      void (async () => {
        const [list, m] = await Promise.all([read($, agents), read($, main)])
        if (m.turnStartedAt !== undefined || list.some(a => a.status === 'running')) {
          const t = await $.clock.now()
          await update($, now, () => t)
        }
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'agent-lens' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if ((MODES as readonly string[]).includes(arg)) {
      await update($, mode, () => arg as Mode)
      await $.store.set(STORE_MODE, arg)
      return { text: `Agent Lens: tryb doboru modeli = ${arg}.` }
    }
    if (arg === 'expand' || arg === 'collapse') {
      await update($, isExpanded, () => arg === 'expand')
      return { text: `Agent Lens: panel ${arg === 'expand' ? 'rozwiniety' : 'zwiniety'}.` }
    }
    if (arg === 'reset') {
      await update($, etaAvg, () => ({}))
      await $.store.set(STORE_ETA, {})
      await update($, agents, () => [])
      return { text: 'Agent Lens: wyczyszczono liste agentow i historie czasow (ETA).' }
    }
    const m = await read($, mode)
    const stats = await read($, etaAvg)
    const lines = Object.entries(stats).map(([k, s]) => `  ${k}: sr. ${fmtMs(s.avgMs)} (n=${s.n})`)
    return {
      text: [
        `Agent Lens - tryb: ${m}. Uzycie: /agent-lens auto|suggest|off|expand|collapse|reset`,
        'Sredni czas pracy (podstawa ETA):',
        ...(lines.length ? lines : ['  brak danych']),
      ].join('\n'),
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const m = await read($, mode)
    const choice = chooseModel({
      subagentType: e.subagentType,
      description: e.description,
      prompt: e.prompt,
      model: e.model,
      parentModel: e.parentModel,
      isBuiltIn: e.provider.plugin === 'engine',
      isFork: e.fork === true,
    })
    const isApplied = m === 'auto' && choice.source === 'rule' && choice.model !== undefined
    if (m === 'suggest' && choice.source === 'rule' && choice.model) {
      $.ui.toast(`Agent Lens: "${e.description}" pasuje do ${choice.model} (${choice.why})`)
    }

    const res = await next(isApplied ? { ...e, model: choice.model } : e)
    if (res.deny !== undefined || !res.agentId) return res

    const startedAt = await $.clock.now()
    const source = isApplied ? 'rule' : choice.source === 'rule' ? 'inherit' : choice.source
    const why = isApplied ? choice.why : source === 'inherit' ? `tryb ${m}` : choice.why
    const early = endedEarly.get(res.agentId)
    endedEarly.delete(res.agentId)
    const row: AgentRow = {
      id: res.agentId,
      description: e.description,
      type: e.subagentType,
      model: res.model,
      source,
      why,
      status: early?.status ?? 'running',
      durationMs: early?.durationMs,
      startedAt,
      steps: 0,
      inTokens: 0,
      outTokens: 0,
      etaKey: etaKey(e.subagentType, res.model),
    }
    await update($, agents, list => [...list.filter(a => a.id !== row.id), row].slice(-MAX_ROWS))
    await update($, now, () => startedAt)

    return res
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const t = await $.clock.now()
    await update($, main, mi => ({ ...mi, turnStartedAt: t }))
    await update($, now, () => t)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    const u = res.usage
    if (e.agentId === undefined) {
      await refreshMain($, { model: u?.model ?? e.model })
    } else if (u) {
      const id = e.agentId
      const inTok = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await update($, agents, list =>
        list.map(a =>
          a.id === id
            ? {
                ...a,
                model: u.model || a.model,
                steps: a.steps + 1,
                inTokens: a.inTokens + inTok,
                outTokens: a.outTokens + u.output_tokens,
              }
            : a,
        ),
      )
    }
    return res
  })

  on('turn.complete', async ($, e, next) => {
    const status: AgentRow['status'] =
      e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'aborted' : 'failed'
    if (e.agentId !== undefined) {
      const id = e.agentId
      const list = await read($, agents)
      if (list.some(a => a.id === id)) await finishAgent($, id, status, e.durationMs)
      else endedEarly.set(id, { status, durationMs: e.durationMs })
    } else {
      const mi = await read($, main)
      if (status === 'done' && mi.model) {
        const stats = await update($, etaAvg, s => learn(s ?? {}, etaKey('main', mi.model), e.durationMs))
        await $.store.set(STORE_ETA, stats)
      }
      await refreshMain($, { turnStartedAt: undefined })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [list, mi, expanded, m, t, stats] = await Promise.all([
      read($, agents),
      read($, main),
      read($, isExpanded),
      read($, mode),
      read($, now),
      read($, etaAvg),
    ])
    const { Box, Button, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns

    const running = list.filter(a => a.status === 'running')
    const elapsedOf = (a: AgentRow) => a.durationMs ?? Math.max(0, t - a.startedAt)
    const remOf = (a: AgentRow) => remaining(stats, a.etaKey, elapsedOf(a))

    // Task ETA: the main turn's usual length or the slowest running agent, whichever ends later.
    let taskRem: number | undefined
    if (mi.turnStartedAt !== undefined) {
      const mainRem = mi.model ? remaining(stats, etaKey('main', mi.model), t - mi.turnStartedAt) : undefined
      const agentRems = running.map(remOf).filter((r): r is number => r !== undefined)
      const all = [mainRem, ...agentRems].filter((r): r is number => r !== undefined)
      taskRem = all.length ? Math.max(...all) : undefined
    }

    const pct = mi.contextPct
    const ctxColor = pct === undefined ? 'subtle' : pct >= 80 ? 'error' : pct >= 60 ? 'warning' : 'success'
    const ctxText =
      pct === undefined
        ? 'ctx ?'
        : `ctx ${pct}%${mi.contextTokens !== undefined && mi.window ? ` (${fmtTokens(mi.contextTokens)}/${fmtTokens(mi.window)})` : ''}`
    const byModel = new Map<string, number>()
    for (const a of running) byModel.set(shortModel(a.model), (byModel.get(shortModel(a.model)) ?? 0) + 1)
    const mix = [...byModel].map(([k, n]) => `${k}x${n}`).join(' ')
    const done = list.filter(a => a.status !== 'running').length

    const summary = (
      <Box flexDirection="row">
        <Text bold color="claude">
          main {mi.model ? shortModel(mi.model) : '?'}
        </Text>
        <Text> · </Text>
        <Text color={ctxColor}>{ctxText}</Text>
        {mi.costUsd !== undefined && <Text dimColor> · ${mi.costUsd.toFixed(2)}</Text>}
        <Text>
          {' '}
          · agenci {running.length}▶{mix ? ` (${mix})` : ''} {done}✓
        </Text>
        {mi.turnStartedAt !== undefined && <Text color="suggestion"> · ETA {fmtEta(taskRem)}</Text>}
        <Text dimColor> · {m} </Text>
        <Button
          key="toggle"
          plain
          label={expanded ? '[zwin]' : '[wiecej]'}
          onPress={() => update($, isExpanded, v => !v)}
        />
      </Box>
    )

    if (!expanded) return summary

    const room = Math.max(1, e.props.maxRows - 2)
    const shown = list.slice(-room)
    const descWidth = Math.max(8, cols - 72)
    const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n))
    const icon = (a: AgentRow) =>
      a.status === 'running' ? '▶' : a.status === 'done' ? '✓' : a.status === 'aborted' ? '■' : '✗'

    return (
      <Box flexDirection="column">
        {summary}
        {shown.length === 0 && <Text dimColor>Brak subagentow w tej sesji.</Text>}
        {shown.map(a => (
          <Box key={a.id} flexDirection="row">
            <Text color={a.status === 'running' ? 'suggestion' : a.status === 'done' ? 'success' : 'error'}>
              {icon(a)}{' '}
            </Text>
            <Text bold>{pad(shortModel(a.model), 11)}</Text>
            <Text dimColor>{pad(a.type, 16)}</Text>
            <Text wrap="truncate-end">{pad(a.description, descWidth)} </Text>
            <Text>
              {pad(`${fmtTokens(a.inTokens)}/${fmtTokens(a.outTokens)}`, 10)}
              {pad(fmtMs(elapsedOf(a)), 7)}
            </Text>
            <Text color="suggestion">{pad(a.status === 'running' ? fmtEta(remOf(a)) : '', 8)}</Text>
            <Text dimColor wrap="truncate-end">
              {a.source}: {a.why}
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
