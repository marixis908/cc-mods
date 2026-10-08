import { describe, expect, test } from 'claude-code/testing'

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

describe('band', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`collapses and expands on ${surface}`, async $ => {
      const ui = await $.ui.mount({ plugin: 'agent-lens', surface, component: 'AbovePrompt', props })
      expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('[wiecej]')
      expect(await ui.find({ text: 'Brak subagentow w tej sesji.' })).toBe(undefined)
      await ui.press({ key: 'toggle' })
      expect((await ui.find({ key: 'toggle' }))?.props.label).toBe('[zwin]')
      expect(await ui.find({ text: 'Brak subagentow w tej sesji.' })).not.toBe(undefined)
    })
  }
})
