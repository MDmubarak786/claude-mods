import { expect, test } from 'claude-code/testing'

// Collects every process the mod starts, and starts it on macOS.
function stubs(on, calls: string[][], options: { os?: string; enabled?: boolean } = {}) {
  on('store.get', () => ({ value: options.enabled }))
  on('store.set', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    calls.push(e.argv)
    if (e.argv[0] === 'uname') return { value: { exitCode: 0, stdout: (options.os ?? 'Darwin') + '\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ok' }))
}

const turn = (agentId?: string) => ({ turnId: 't', answer: 'All tests pass now.', durationMs: 1, isAborted: false, usage: null, ...(agentId ? { agentId } : {}) })

test('a finished turn plays the done sound and posts a notification', async ($, on) => {
  const calls: string[][] = []
  stubs(on, calls)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.complete(turn())
  const started = calls.map((argv) => argv[0])
  expect(started).toContain('afplay')
  expect(started).toContain('osascript')
  const osa = calls.find((argv) => argv[0] === 'osascript')!
  expect(osa[osa.length - 2]).toBe('Claude finished')
  expect(osa[osa.length - 1]).toBe('All tests pass now.')
  expect(calls.find((argv) => argv[0] === 'afplay')![1]).toMatch(/Glass/)
})

test('a subagent turn is silent', async ($, on) => {
  const calls: string[][] = []
  stubs(on, calls)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.complete(turn('agent-1'))
  expect(calls.filter((argv) => argv[0] !== 'uname')).toEqual([])
})

test('/ding off silences everything and is remembered', async ($, on) => {
  const calls: string[][] = []
  stubs(on, calls)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.command.run({ command: 'ding', args: 'off' })).text).toMatch(/^ding off/)
  await $.turn.complete(turn())
  expect(calls.filter((argv) => argv[0] !== 'uname')).toEqual([])
  expect((await $.command.run({ command: 'ding', args: 'on' })).text).toBe('ding on.')
})

test('a saved off setting is honored at session start', async ($, on) => {
  const calls: string[][] = []
  stubs(on, calls, { enabled: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.complete(turn())
  expect(calls.filter((argv) => argv[0] !== 'uname')).toEqual([])
  expect((await $.command.run({ command: 'ding', args: '' })).text).toMatch(/^ding off/)
})

test('a question from Claude plays the needs-you sound', async ($, on) => {
  const calls: string[][] = []
  stubs(on, calls)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Which database?', header: 'DB', options: [], multiSelect: false }] })
  expect(calls.find((argv) => argv[0] === 'afplay')![1]).toMatch(/Ping/)
  const osa = calls.find((argv) => argv[0] === 'osascript')!
  expect(osa[osa.length - 1]).toBe('Which database?')
})

test('a permission prompt plays the needs-you sound and the decision is unchanged', async ($, on) => {
  const calls: string[][] = []
  stubs(on, calls)
  on('tool.check', ($, e) => ({ decision: e.input.command === 'rm -rf x' ? 'ask' : 'allow', reason: 'rule' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const allowed = await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })
  expect(allowed.decision).toBe('allow')
  expect(calls.filter((argv) => argv[0] !== 'uname')).toEqual([])
  const asked = await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf x' } })
  expect(asked).toEqual({ decision: 'ask', reason: 'rule' })
  expect(calls.find((argv) => argv[0] === 'osascript')![calls.find((argv) => argv[0] === 'osascript')!.length - 2]).toBe('Claude needs permission')
})

test('on Linux it uses paplay and notify-send', async ($, on) => {
  const calls: string[][] = []
  stubs(on, calls, { os: 'Linux' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.complete(turn())
  expect(calls.map((argv) => argv[0])).toContain('paplay')
  expect(calls.map((argv) => argv[0])).toContain('notify-send')
})
