import { expect, test } from 'claude-code/testing'

const ROOT = '/work'

// Stubs for everything the mod calls on $, backed by a Map the test can inspect.
function stubs(on, saved: Map<string, unknown>) {
  on('session.root', () => ({ value: ROOT }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    saved.delete(e.key)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  // Stands in for Claude Code running the tool when the guard calls next(e).
  on('tool.call', () => ({ result: 'edited' }))
}

const edit = (file_path: string) => ({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' })

test('/fence saves absolute paths under the project root', async ($, on) => {
  const saved = new Map<string, unknown>()
  stubs(on, saved)
  const answer = await $.command.run({ command: 'fence', args: 'src/ ./docs/README.md /etc/hosts' })
  expect(answer.text).toBe('Fence set. Claude may edit only: /work/src, /work/docs/README.md, /etc/hosts')
  expect(saved.get('fence:/work')).toEqual(['/work/src', '/work/docs/README.md', '/etc/hosts'])
})

test('/fence with no arguments shows the fence or the usage', async ($, on) => {
  const saved = new Map<string, unknown>()
  stubs(on, saved)
  expect((await $.command.run({ command: 'fence', args: '' })).text).toMatch(/^No fence set/)
  await $.command.run({ command: 'fence', args: 'src' })
  expect((await $.command.run({ command: 'fence', args: '' })).text).toBe('Fence: /work/src')
})

test('/fence off removes the fence', async ($, on) => {
  const saved = new Map<string, unknown>([['fence:/work', ['/work/src']]])
  stubs(on, saved)
  const answer = await $.command.run({ command: 'fence', args: 'off' })
  expect(answer.text).toBe('Fence removed. Claude may edit any file.')
  expect(saved.has('fence:/work')).toBe(false)
})

test('with no fence set, every edit goes through', async ($, on) => {
  stubs(on, new Map())
  expect(await $.tool.call(edit('/work/anything.ts'))).toEqual({ result: 'edited' })
})

test('an edit inside the fence goes through', async ($, on) => {
  stubs(on, new Map([['fence:/work', ['/work/src']]]))
  expect(await $.tool.call(edit('/work/src/deep/file.ts'))).toEqual({ result: 'edited' })
  expect(await $.tool.call({ tool: 'Write', file_path: '/work/src/new.ts', content: 'x' })).toEqual({ result: 'edited' })
})

test('an edit outside the fence is refused with an actionable reason', async ($, on) => {
  stubs(on, new Map([['fence:/work', ['/work/src']]]))
  const out = await $.tool.call(edit('/work/package.json'))
  expect(out.deny).toMatch(/outside the paths the user allowed/)
  expect(out.deny).toContain('/work/src')
  expect(out.deny).toContain('/fence')
})

test('a sibling directory with the same prefix is outside the fence', async ($, on) => {
  stubs(on, new Map([['fence:/work', ['/work/src']]]))
  const out = await $.tool.call(edit('/work/src-old/file.ts'))
  expect(out.deny).toBeDefined()
})

test('NotebookEdit is checked by notebook_path', async ($, on) => {
  stubs(on, new Map([['fence:/work', ['/work/notebooks']]]))
  const inside = await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/work/notebooks/a.ipynb', new_source: 'x' })
  expect(inside).toEqual({ result: 'edited' })
  const outside = await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/work/a.ipynb', new_source: 'x' })
  expect(outside.deny).toBeDefined()
})

test('the guard fails closed when the store cannot be read', async ($, on) => {
  on('session.root', () => ({ value: ROOT }))
  on('store.get', () => ({ deny: 'store unavailable' }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', () => ({ result: 'edited' }))
  const out = await $.tool.call(edit('/work/src/file.ts'))
  expect(out.deny).toMatch(/could not check this path/)
})
