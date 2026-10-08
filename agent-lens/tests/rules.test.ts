import { describe, expect, test } from 'claude-code/testing'

import { fmtEta, learn, remaining } from '../hooks/eta'
import { chooseModel, shortModel } from '../hooks/rules'
import type { SpawnFacts } from '../hooks/rules'

const base: SpawnFacts = {
  subagentType: 'general-purpose',
  description: 'Implement parser',
  prompt: 'Write the CSV parser in src/parse.py',
  parentModel: 'claude-opus-5-5',
  isBuiltIn: true,
  isFork: false,
}

describe('chooseModel', () => {
  test('Explore goes to haiku', async () => {
    expect(chooseModel({ ...base, subagentType: 'Explore' })).toEqual({ model: 'haiku', source: 'rule', why: 'typ Explore' })
  })
  test('search task goes to haiku', async () => {
    expect(chooseModel({ ...base, description: 'Find config usages' }).model).toBe('haiku')
  })
  test('implementation goes to sonnet', async () => {
    expect(chooseModel(base).model).toBe('sonnet')
  })
  test('architecture goes to opus', async () => {
    expect(chooseModel({ ...base, description: 'Design the cache architecture' }).model).toBe('opus')
  })
  test('never above the parent model', async () => {
    const c = chooseModel({ ...base, subagentType: 'Plan', parentModel: 'claude-sonnet-5-5' })
    expect(c.model).toBe('sonnet')
    expect(c.why).toContain('limit')
  })
  test('explicit model wins', async () => {
    expect(chooseModel({ ...base, subagentType: 'Explore', model: 'opus' })).toEqual({
      model: 'opus',
      source: 'explicit',
      why: 'model podany w wywolaniu',
    })
  })
  test('custom agent keeps its definition', async () => {
    expect(chooseModel({ ...base, isBuiltIn: false }).model).toBe(undefined)
  })
  test('fork inherits', async () => {
    expect(chooseModel({ ...base, isFork: true }).source).toBe('fork')
  })
})

describe('helpers', () => {
  test('shortModel', async () => {
    expect(shortModel('claude-opus-5-5')).toBe('opus-5.5')
    expect(shortModel('haiku')).toBe('haiku')
  })
  test('eta learns and counts down', async () => {
    const s = learn(learn({}, 'k', 10_000), 'k', 20_000)
    expect(s.k?.n).toBe(2)
    expect(remaining(s, 'k', 3_000)).toBe(10_000)
    expect(fmtEta(remaining(s, 'x', 0))).toBe('?')
    expect(fmtEta(-5_000)).toBe('+5s')
  })
})
