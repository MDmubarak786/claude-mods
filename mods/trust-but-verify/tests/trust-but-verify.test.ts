import { expect, test } from 'claude-code/testing'

function stubs(on, failing: string[] = []) {
  const saved = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', ($, e) => (failing.includes(e.command) ? { result: 'boom', isError: true, text: 'boom' } : { result: { stdout: 'ok', stderr: '', interrupted: false } }))
}

const bash = (command: string, agentId?: string) => ({ tool: 'Bash', command, ...(agentId ? { agentId } : {}) })
const done = (answer: string, extra = {}) => ({ turnId: 't', answer, durationMs: 1, isAborted: false, usage: null, ...extra })

test('a tests-pass claim backed by a passing test command gets a check', async ($, on) => {
  stubs(on)
  await $.turn.start({ turnId: 't' })
  await $.tool.call(bash('npm test -- --run'))
  const out = await $.turn.complete(done('Done. All tests pass now.'))
  expect(out.text).toBe('trust-but-verify: ✔ tests pass, backed by `npm test -- --run`')
})

test('a tests-pass claim with no test command is flagged', async ($, on) => {
  stubs(on)
  await $.turn.start({ turnId: 't' })
  await $.tool.call(bash('ls'))
  const out = await $.turn.complete(done('I fixed the bug and the tests are passing.'))
  expect(out.text).toBe('trust-but-verify: ✘ claims tests pass, but no matching command ran this turn')
})

test('a claim backed only by a failed command is flagged with the command', async ($, on) => {
  stubs(on, ['pytest'])
  await $.turn.start({ turnId: 't' })
  await $.tool.call(bash('pytest'))
  const out = await $.turn.complete(done('The test suite passes.'))
  expect(out.text).toBe('trust-but-verify: ✘ claims tests pass, but `pytest` failed')
})

test('build, lint, committed, and pushed claims are each checked', async ($, on) => {
  stubs(on)
  await $.turn.start({ turnId: 't' })
  await $.tool.call(bash('npm run build'))
  await $.tool.call(bash('git commit -m "fix"'))
  const out = await $.turn.complete(done('The build succeeds, lint is clean, and I committed and pushed the changes.'))
  expect(out.text).toContain('✔ build succeeds, backed by `npm run build`')
  expect(out.text).toContain('✘ claims lint is clean, but no matching command ran this turn')
  expect(out.text).toContain('✔ committed, backed by `git commit -m "fix"`')
  expect(out.text).toContain('✘ claims pushed, but no matching command ran this turn')
})

test('"verified" with nothing run is flagged; with reads it is noted', async ($, on) => {
  stubs(on)
  await $.turn.start({ turnId: 't' })
  expect((await $.turn.complete(done('I verified the fix works.'))).text).toBe('trust-but-verify: ✘ says "verified", but no command or read ran this turn')
  await $.turn.start({ turnId: 't2' })
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  expect((await $.turn.complete(done('I confirmed the handler is wired up.'))).text).toContain('says "verified"; 1 tool call(s) ran this turn')
})

test('an answer with no claims adds no line, and the turn resets the record', async ($, on) => {
  stubs(on)
  await $.turn.start({ turnId: 't' })
  await $.tool.call(bash('npm test'))
  expect((await $.turn.complete(done('Here is the plan.'))).text).toBe('')
  await $.turn.start({ turnId: 't2' })
  expect((await $.turn.complete(done('All tests pass.'))).text).toContain('✘ claims tests pass, but no matching command ran this turn')
})

test('subagent turns and calls are ignored, and /claims off silences the line', async ($, on) => {
  stubs(on)
  await $.turn.start({ turnId: 't' })
  await $.tool.call(bash('npm test', 'agent-1'))
  expect((await $.turn.complete(done('All tests pass.', { agentId: 'agent-1' }))).text).toBe('')
  expect((await $.turn.complete(done('All tests pass.'))).text).toContain('✘')
  await $.command.run({ command: 'claims', args: 'off' })
  await $.turn.start({ turnId: 't3' })
  expect((await $.turn.complete(done('All tests pass.'))).text).toBe('')
  expect((await $.command.run({ command: 'claims', args: '' })).text).toContain('✘ claims tests pass')
})
