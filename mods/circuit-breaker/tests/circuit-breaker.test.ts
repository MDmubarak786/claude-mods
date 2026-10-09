import { expect, test } from 'claude-code/testing'

// A Bash stub that fails for every command, plus an answer for the hold question.
function stubs(on, saved: Map<string, unknown>, answer = 'Stop') {
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', ($, e) => {
    if (e.tool === 'AskUserQuestion') {
      return { result: { answers: { [e.questions[0].question]: answer } } }
    }
    if (e.command === 'true') return { result: 'ok' }
    return { result: 'command not found: frob', isError: true, text: 'command not found: frob' }
  })
}

const bash = (command: string, agentId?: string) => ({ tool: 'Bash', command, ...(agentId ? { agentId } : {}) })

test('the fourth identical failure is held and refused when the user says Stop', async ($, on) => {
  stubs(on, new Map())
  for (let i = 0; i < 3; i++) {
    const out = await $.tool.call(bash('frob'))
    expect(out.isError).toBe(true)
  }
  const held = await $.tool.call(bash('frob'))
  expect(held.deny).toMatch(/failed 3 times in a row/)
  expect(held.deny).toContain('command not found: frob')
})

test('Try once more lets the command run again', async ($, on) => {
  stubs(on, new Map(), 'Try once more')
  for (let i = 0; i < 3; i++) await $.tool.call(bash('frob'))
  const out = await $.tool.call(bash('frob'))
  expect(out.isError).toBe(true)
  expect(out.deny).toBeUndefined()
})

test('a different command or a success resets the streak', async ($, on) => {
  stubs(on, new Map())
  await $.tool.call(bash('frob'))
  await $.tool.call(bash('frob'))
  await $.tool.call(bash('other'))
  await $.tool.call(bash('frob'))
  await $.tool.call(bash('frob'))
  await $.tool.call(bash('true'))
  await $.tool.call(bash('frob'))
  await $.tool.call(bash('frob'))
  await $.tool.call(bash('frob'))
  const out = await $.tool.call(bash('frob'))
  expect(out.deny).toBeDefined()
})

test('the end of a turn clears the streak', async ($, on) => {
  stubs(on, new Map())
  on('turn.complete', () => ({ text: '' }))
  for (let i = 0; i < 3; i++) await $.tool.call(bash('frob'))
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: false, usage: null })
  const out = await $.tool.call(bash('frob'))
  expect(out.deny).toBeUndefined()
})

test('subagents have their own streak', async ($, on) => {
  stubs(on, new Map())
  for (let i = 0; i < 3; i++) await $.tool.call(bash('frob', 'agent-1'))
  expect((await $.tool.call(bash('frob'))).deny).toBeUndefined()
  expect((await $.tool.call(bash('frob', 'agent-1'))).deny).toBeDefined()
})

test('/breaker sets, shows, and turns off the threshold', async ($, on) => {
  const saved = new Map<string, unknown>()
  stubs(on, saved)
  expect((await $.command.run({ command: 'breaker', args: '' })).text).toMatch(/hold after 3/)
  expect((await $.command.run({ command: 'breaker', args: '1' })).text).toMatch(/after 1 identical/)
  expect(saved.get('threshold')).toBe(1)
  await $.tool.call(bash('frob'))
  expect((await $.tool.call(bash('frob'))).deny).toBeDefined()
  expect((await $.command.run({ command: 'breaker', args: 'off' })).text).toMatch(/Breaker off/)
  expect((await $.tool.call(bash('frob'))).deny).toBeUndefined()
  expect((await $.command.run({ command: 'breaker', args: 'zero' })).text).toMatch(/^Usage/)
})

test('when nobody can answer, the held command is refused', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', ($, e) => {
    if (e.tool === 'AskUserQuestion') return { deny: 'nobody to ask' }
    return { result: 'boom', isError: true, text: 'boom' }
  })
  for (let i = 0; i < 3; i++) await $.tool.call(bash('frob'))
  expect((await $.tool.call(bash('frob'))).deny).toMatch(/chose to stop/)
})
