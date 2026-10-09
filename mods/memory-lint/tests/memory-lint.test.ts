import { expect, test } from 'claude-code/testing'

const PATH = '/home/me/.claude/projects/-work-app/memory/MEMORY.md'

function index(n: number): string {
  return '# Memory\n\n' + Array.from({ length: n }, (_, i) => '- [Fact ' + (i + 1) + '](f' + (i + 1) + '.md) — hook').join('\n') + '\n'
}

function stubs(on, options: { text?: string | null; saved?: Map<string, unknown>; status?: (string | undefined)[]; logs?: string[] } = {}) {
  const saved = options.saved ?? new Map<string, unknown>()
  on('session.root', () => ({ value: '/work/app' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/home/me\n', stderr: '' } }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: e.path === PATH && options.text !== null && options.text !== undefined }))
  on('fs.read', ($, e) => ({ value: e.path === PATH ? options.text ?? '' : '' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work/app' }))
  on('classic.SessionStart', () => ({}))
  on('ui.status', ($, e) => {
    options.status?.push(e.text)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    options.logs?.push(e.text)
    return { value: undefined }
  })
  on('tool.call', () => ({ result: 'edited' }))
  return saved
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })

test('an index under the limit is logged, not flagged', async ($, on) => {
  const status: (string | undefined)[] = []
  const logs: string[] = []
  stubs(on, { text: index(50), status, logs })
  await start($)
  expect(logs.some((l) => l.includes('memory index at start: 53 lines, 50 entries, under the 200-line limit'))).toBe(true)
  expect(status.filter(Boolean)).toEqual([])
  expect((await $.command.run({ command: 'memory-lint', args: '' })).text).toContain('Under the limit')
})

test('an index over the limit is flagged with the entries past the cut', async ($, on) => {
  const status: (string | undefined)[] = []
  stubs(on, { text: index(205) })
  await start($)
  const out = (await $.command.run({ command: 'memory-lint', args: '' })).text
  expect(out).toContain('208 lines, 205 entries')
  expect(out).toContain('7 entries are past the limit and may not have loaded')
  expect(out).toContain('  - [Fact 199](f199.md) — hook')
  expect(out).toContain('  - [Fact 205](f205.md) — hook')
  expect(out).not.toContain('[Fact 198]')
})

test('the status line warns at start when over the limit', async ($, on) => {
  const status: (string | undefined)[] = []
  stubs(on, { text: index(205), status })
  await start($)
  expect(status[0]).toContain('memory-lint: 208 lines, 7 entries past line 200 may not load')
})

test('/memory-lint limit changes the cut and is saved', async ($, on) => {
  const saved = stubs(on, { text: index(205) })
  await start($)
  const out = (await $.command.run({ command: 'memory-lint', args: 'limit 300' })).text
  expect(out).toContain('Limit set to 300 lines.')
  expect(out).toContain('Under the limit')
  expect(saved.get('limit')).toBe(300)
})

test('no index file is reported with its expected path', async ($, on) => {
  stubs(on, { text: null })
  await start($)
  expect((await $.command.run({ command: 'memory-lint', args: '' })).text).toBe('No memory index at ' + PATH + '.')
})

test('an edit to the index re-measures it', async ($, on) => {
  const status: (string | undefined)[] = []
  const state = { text: index(50) as string | null, status }
  stubs(on, state)
  await start($)
  state.text = index(300)
  await $.tool.call({ tool: 'Write', file_path: PATH, content: state.text })
  expect(status.some((s) => s && s.includes('entries past line 200'))).toBe(true)
})

test('/memory-lint path points at another file for this project', async ($, on) => {
  const saved = stubs(on, { text: null })
  await start($)
  const out = (await $.command.run({ command: 'memory-lint', args: 'path /elsewhere/MEMORY.md' })).text
  expect(out).toContain('Index path for this project: /elsewhere/MEMORY.md')
  expect(saved.get('path:/work/app')).toBe('/elsewhere/MEMORY.md')
})
