import { expect, test } from 'claude-code/testing'

function stubs(on, options: { saved?: Map<string, unknown>; answered?: boolean; written?: Record<string, string>; prompts?: string[] } = {}) {
  const saved = options.saved ?? new Map<string, unknown>()
  on('session.root', () => ({ value: '/work/app' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    saved.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...saved.keys()] }))
  on('model.complete', ($, e) => {
    options.prompts?.push(e.prompt)
    return options.answered === false
      ? { value: { isAnswered: false, reason: 'timeout' } }
      : { value: { isAnswered: true, text: '- Fixed the login bug in app\n- Added tests', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })
  on('fs.write', ($, e) => {
    if (options.written) options.written[e.path] = e.text
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work/app' }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', () => ({ result: 'edited' }))
  on('turn.complete', () => ({ text: '' }))
  return saved
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })
const today = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const turn = (answer: string, extra = {}) => ({ turnId: 't', answer, durationMs: 1, isAborted: false, usage: null, ...extra })

test('a finished turn is logged with its files and first answer line', async ($, on) => {
  const saved = stubs(on)
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/work/app/src/login.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: '/work/app/src/login.test.ts', content: '' })
  await $.turn.complete(turn('# Done\n\nFixed the login redirect and added a test.\n\nDetails...'))
  const entries = saved.get('standup:' + today() + ':sess-1') as any[]
  expect(entries.length).toBe(1)
  expect(entries[0].files).toEqual(['src/login.test.ts', 'src/login.ts'])
  expect(entries[0].answer).toBe('Fixed the login redirect and added a test.')
  expect(entries[0].root).toBe('/work/app')
})

test('subagent turns, aborted turns, and empty turns are not logged', async ($, on) => {
  const saved = stubs(on)
  await start($)
  await $.turn.complete(turn('x', { agentId: 'a1' }))
  await $.turn.complete(turn('x', { isAborted: true }))
  await $.turn.complete(turn(''))
  expect([...saved.keys()].filter((k) => k.startsWith('standup:'))).toEqual([])
})

test('/standup asks the model with a digest grouped by project', async ($, on) => {
  const prompts: string[] = []
  const saved = new Map<string, unknown>([
    ['standup:' + today() + ':sess-1', [{ at: Date.now() - 3600000, root: '/work/app', files: ['src/a.ts'], answer: 'Refactored auth.' }]],
    ['standup:' + today() + ':sess-2', [{ at: Date.now() - 1800000, root: '/work/site', files: [], answer: 'Explained the deploy flow.' }]],
  ])
  stubs(on, { saved, prompts })
  await start($)
  const out = await $.command.run({ command: 'standup', args: '' })
  expect(out.text).toBe('- Fixed the login bug in app\n- Added tests')
  expect(prompts[0]).toContain('## app (1 turn, 1 file)')
  expect(prompts[0]).toContain('Refactored auth. [src/a.ts]')
  expect(prompts[0]).toContain('## site (1 turn, 0 files)')
})

test('/standup raw prints the log without a model call, and --md writes a file', async ($, on) => {
  const prompts: string[] = []
  const written: Record<string, string> = {}
  stubs(on, { prompts, written, saved: new Map([['standup:' + today() + ':sess-1', [{ at: Date.now(), root: '/work/app', files: [], answer: 'Did a thing.' }]]]) })
  await start($)
  const out = await $.command.run({ command: 'standup', args: 'raw --md notes/standup.md' })
  expect(out.text).toContain('Did a thing.')
  expect(out.text).toContain('Written to /work/app/notes/standup.md')
  expect(prompts).toEqual([])
  expect(written['/work/app/notes/standup.md']).toContain('# Standup ' + today())
})

test('when the model does not answer, the log is returned instead', async ($, on) => {
  stubs(on, { answered: false, saved: new Map([['standup:' + today() + ':sess-1', [{ at: Date.now(), root: '/work/app', files: [], answer: 'Did a thing.' }]]]) })
  await start($)
  const out = await $.command.run({ command: 'standup', args: '' })
  expect(out.text).toContain('The model did not answer (timeout)')
  expect(out.text).toContain('Did a thing.')
})

test('nothing logged is reported, and old logs are pruned at start', async ($, on) => {
  const saved = new Map<string, unknown>([['standup:2020-01-01:old', [{ at: 0, root: '/x', files: [], answer: 'ancient' }]]])
  stubs(on, { saved })
  await start($)
  expect(saved.has('standup:2020-01-01:old')).toBe(false)
  expect((await $.command.run({ command: 'standup', args: '' })).text).toBe('Nothing logged in the last 1 day(s).')
})
