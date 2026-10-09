import { expect, test } from 'claude-code/testing'

// A fake file system: a Map of path -> content, plus the processes the mod ran.
function stubs(on, files: Map<string, string>, ran: string[][] = []) {
  on('process.run', ($, e) => {
    ran.push(e.argv)
    if (e.argv[0] === 'mktemp') return { value: { exitCode: 0, stdout: '/scratch\n', stderr: '' } }
    if (e.argv[0] === 'rm') files.delete(e.argv[e.argv.length - 1])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('fs.stat', ($, e) => (files.has(e.path) ? { value: { kind: 'file', size: files.get(e.path)!.length } } : { deny: 'no such file' }))
  on('fs.read', ($, e) => (files.has(e.path) ? { value: files.get(e.path) } : { deny: 'no such file' }))
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.log', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  // The edit itself: apply it to the fake file system.
  on('tool.call', ($, e) => {
    if (e.tool === 'Write') files.set(e.file_path, e.content)
    if (e.tool === 'Edit') files.set(e.file_path, (files.get(e.file_path) ?? '').replace(e.old_string, e.new_string))
    return { result: 'edited' }
  })
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const edit = (file_path: string, old_string: string, new_string: string, agentId?: string) => ({ tool: 'Edit', file_path, old_string, new_string, ...(agentId ? { agentId } : {}) })
const write = (file_path: string, content: string, agentId?: string) => ({ tool: 'Write', file_path, content, ...(agentId ? { agentId } : {}) })
const done = (agentId: string) => ({ turnId: 't', answer: '', durationMs: 1, isAborted: false, usage: null, agentId })

test('a subagent edit is snapshotted and /undo-agent last restores it', async ($, on) => {
  const files = new Map([['/work/a.ts', 'const a = 1']])
  stubs(on, files)
  await start($)
  await $.tool.call(edit('/work/a.ts', '1', '2', 'agent-1'))
  await $.tool.call(edit('/work/a.ts', '2', '3', 'agent-1'))
  expect(files.get('/work/a.ts')).toBe('const a = 3')
  await $.turn.complete(done('agent-1'))
  const out = await $.command.run({ command: 'undo-agent', args: 'last' })
  expect(out.text).toContain('restored /work/a.ts')
  expect(files.get('/work/a.ts')).toBe('const a = 1')
})

test('a file the agent created is removed on undo', async ($, on) => {
  const files = new Map<string, string>()
  const ran: string[][] = []
  stubs(on, files, ran)
  await start($)
  await $.tool.call(write('/work/new.ts', 'x', 'agent-2'))
  expect(files.has('/work/new.ts')).toBe(true)
  const out = await $.command.run({ command: 'undo-agent', args: 'agent-2' })
  expect(out.text).toContain('removed /work/new.ts')
  expect(files.has('/work/new.ts')).toBe(false)
  expect(ran.some((argv) => argv[0] === 'rm' && argv.includes('/work/new.ts'))).toBe(true)
})

test('the main conversation is left alone', async ($, on) => {
  const files = new Map([['/work/a.ts', 'old']])
  stubs(on, files)
  await start($)
  await $.tool.call(write('/work/a.ts', 'new'))
  expect(files.get('/work/a.ts')).toBe('new')
  expect((await $.command.run({ command: 'undo-agent', args: '' })).text).toBe('No subagent has changed files this session.')
  expect([...files.keys()].some((k) => k.startsWith('/scratch'))).toBe(false)
})

test('/undo-agent lists agents newest first with their files', async ($, on) => {
  const files = new Map([['/work/a.ts', 'a'], ['/work/b.ts', 'b']])
  stubs(on, files)
  await start($)
  await $.tool.call(write('/work/a.ts', 'A', 'agent-1'))
  await $.turn.complete(done('agent-1'))
  await $.tool.call(write('/work/b.ts', 'B', 'agent-2'))
  const out = await $.command.run({ command: 'undo-agent', args: '' })
  expect(out.text.startsWith('agent-2')).toBe(true)
  expect(out.text).toContain('agent-2: 1 file(s) (still running)')
  expect(out.text).toContain('/work/b.ts')
})

test('an unknown agent is reported', async ($, on) => {
  stubs(on, new Map())
  await start($)
  expect((await $.command.run({ command: 'undo-agent', args: 'nope' })).text).toMatch(/^No snapshots for nope/)
})
