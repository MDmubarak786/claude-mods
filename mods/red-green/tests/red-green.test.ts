import { expect, mock, test } from 'claude-code/testing'

function stubs(on, options: { exitCode?: number; stdout?: string; files?: Record<string, string>; saved?: Map<string, unknown>; ran?: unknown[]; submitted?: string[] } = {}) {
  const saved = options.saved ?? new Map<string, unknown>()
  const files = options.files ?? {}
  on('session.root', () => ({ value: '/work' }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: e.path in files }))
  on('fs.read', ($, e) => ({ value: files[e.path] ?? '' }))
  on('process.run', ($, e) => {
    options.ran?.push(e)
    return { value: { exitCode: options.exitCode ?? 0, stdout: options.stdout ?? '3 passed', stderr: '' } }
  })
  on('prompt.submit', ($, e) => {
    options.submitted?.push(e.text)
    return { text: e.text }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', () => ({ result: 'edited' }))
  on('turn.complete', () => ({ text: '' }))
  return saved
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const edit = (agentId?: string) => ({ tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b', ...(agentId ? { agentId } : {}) })
const turn = (extra = {}) => ({ turnId: 't', answer: 'done', durationMs: 1, isAborted: false, usage: null, ...extra })

test('after an edit, the turn runs the tests and reports a pass', async ($, on) => {
  const ran: any[] = []
  stubs(on, { ran, saved: new Map([['red-green:/work', { command: 'npm test', enabled: true }]]) })
  await start($)
  await $.tool.call(edit())
  const out = await $.turn.complete(turn())
  expect(out.text).toMatch(/^red-green: tests passed \(npm test, [\d.]+s\)$/)
  expect(ran[0].argv).toEqual(['sh', '-c', 'npm test'])
  expect(ran[0].init.cwd).toBe('/work')
})

test('a failure is reported and /fix sends the tail to Claude', async ($, on) => {
  const submitted: string[] = []
  const clock = mock.clock(on)
  stubs(on, { exitCode: 1, stdout: 'line\n'.repeat(50) + 'FAIL src/a.test.ts\n  expected 2, got 3', submitted, saved: new Map([['red-green:/work', { command: 'npm test', enabled: true }]]) })
  await start($)
  await $.tool.call(edit())
  const out = await $.turn.complete(turn())
  expect(out.text).toContain('red-green: tests FAILED, exit 1 (npm test')
  expect(out.text).toContain('/fix sends the failure to Claude')
  expect((await $.command.run({ command: 'fix', args: '' })).text).toBe('Sending the failure to Claude.')
  await clock.settle()
  expect(submitted[0]).toContain('The test command `npm test` failed with exit code 1')
  expect(submitted[0]).toContain('expected 2, got 3')
  expect(submitted[0].split('\n').filter((l) => l === 'line').length).toBe(28)
})

test('nothing runs without an edit, after an aborted turn, for a subagent, or when off', async ($, on) => {
  const ran: any[] = []
  stubs(on, { ran, saved: new Map([['red-green:/work', { command: 'npm test', enabled: true }]]) })
  await start($)
  expect((await $.turn.complete(turn())).text).toBe('')
  await $.tool.call(edit('agent-1'))
  expect((await $.turn.complete(turn({ agentId: 'agent-1' }))).text).toBe('')
  expect((await $.turn.complete(turn())).text).toBe('')
  await $.tool.call(edit())
  expect((await $.turn.complete(turn({ isAborted: true }))).text).toBe('')
  await $.command.run({ command: 'red-green', args: 'off' })
  expect((await $.turn.complete(turn())).text).toBe('')
  expect(ran).toEqual([])
})

test('/red-green sets, shows, and detects the command', async ($, on) => {
  const saved = stubs(on, { files: { '/work/package.json': '{"scripts":{"test":"vitest"}}', '/work/pnpm-lock.yaml': '' } })
  await start($)
  expect((await $.command.run({ command: 'red-green', args: '' })).text).toMatch(/^No test command/)
  expect((await $.command.run({ command: 'red-green', args: 'detect' })).text).toBe('Test command for this project: pnpm test')
  expect((await $.command.run({ command: 'red-green', args: 'make check' })).text).toBe('Test command for this project: make check')
  expect(saved.get('red-green:/work')).toEqual({ command: 'make check', enabled: true })
})

test('detect falls through pyproject, Cargo, go.mod, and Makefile', async ($, on) => {
  stubs(on, { files: { '/work/Makefile': 'build:\n\tgo build\ntest:\n\tgo test\n' } })
  await start($)
  expect((await $.command.run({ command: 'red-green', args: 'detect' })).text).toContain('make test')
})

test('/fix with no failure says so', async ($, on) => {
  stubs(on)
  await start($)
  expect((await $.command.run({ command: 'fix', args: '' })).text).toBe('No failing test run to fix.')
})
