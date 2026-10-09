import { expect, test } from 'claude-code/testing'

const RULES = 'banned: load-bearing, delve\nmax-comment-ratio: 0.25\nno-comments-in: *.json, migrations/**\nrule: Prefer early returns.\n'

function stubs(on, options: { rules?: string | null; bans?: string[] } = {}) {
  const saved = new Map<string, unknown>(options.bans ? [['bans', options.bans]] : [])
  on('session.root', () => ({ value: '/work' }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('fs.exists', () => ({ value: options.rules !== null && options.rules !== undefined }))
  on('fs.read', () => ({ value: options.rules ?? '' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', () => ({ result: 'edited' }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  return saved
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const edit = (file_path: string, new_string: string) => ({ tool: 'Edit', file_path, old_string: 'x', new_string })
const write = (file_path: string, content: string) => ({ tool: 'Write', file_path, content })

test('a banned phrase in added code is refused with the line', async ($, on) => {
  stubs(on, { rules: RULES })
  await start($)
  const out = await $.tool.call(edit('/work/src/a.ts', 'const x = 1 // this is load-bearing\n'))
  expect(out.deny).toContain('the banned phrase "load-bearing"')
  expect(out.deny).toContain('this is load-bearing')
  expect(await $.tool.call(edit('/work/src/a.ts', 'const loadBearingWall = 1'))).toEqual({ result: 'edited' })
})

test('too many comment lines are refused with the counts', async ($, on) => {
  stubs(on, { rules: RULES })
  await start($)
  const chatty = '// add one\nconst a = 1\n// add two\nconst b = 2\n// add three\nconst c = 3\n// done\n'
  const out = await $.tool.call(edit('/work/src/a.ts', chatty))
  expect(out.deny).toContain('4 comment lines out of 7 added (57%, the limit is 25%)')
  const terse = 'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\n// sum\nconst e = a + b + c + d\n'
  expect(await $.tool.call(edit('/work/src/a.ts', terse))).toEqual({ result: 'edited' })
})

test('short edits are not measured for comment density', async ($, on) => {
  stubs(on, { rules: RULES })
  await start($)
  expect(await $.tool.call(edit('/work/src/a.ts', '// explain\nconst a = 1\n'))).toEqual({ result: 'edited' })
})

test('files that must not gain comments refuse any comment', async ($, on) => {
  stubs(on, { rules: RULES })
  await start($)
  expect((await $.tool.call(write('/work/db/migrations/001.sql', 'CREATE TABLE a (id int);\n-- added by Claude\n'))).deny).toContain('must not gain comments')
  expect(await $.tool.call(write('/work/db/migrations/001.sql', 'CREATE TABLE a (id int);\n'))).toEqual({ result: 'edited' })
})

test('every prompt carries the rules as context Claude reads', async ($, on) => {
  stubs(on, { rules: RULES })
  await start($)
  const out = await $.prompt.submit({ text: 'fix the bug' })
  expect(out.text).toBe('fix the bug')
  const ctx = (out.context ?? []).join('\n')
  expect(ctx).toContain('Never use these words or phrases')
  expect(ctx).toContain('load-bearing, delve')
  expect(ctx).toContain('at most 25%')
  expect(ctx).toContain('Prefer early returns.')
})

test('with no rules file nothing is enforced or injected', async ($, on) => {
  stubs(on, { rules: null })
  await start($)
  expect(await $.tool.call(edit('/work/a.ts', '// a\n// b\n// c\n// d\n// e\nx\n'))).toEqual({ result: 'edited' })
  expect((await $.prompt.submit({ text: 'hi' })).context ?? []).toEqual([])
  expect((await $.command.run({ command: 'style-cop', args: '' })).text).toMatch(/^No \.claude\/style-cop\.md/)
})

test('/style-cop ban adds a global ban that applies at once and is saved', async ($, on) => {
  const saved = stubs(on, { rules: null })
  await start($)
  expect((await $.command.run({ command: 'style-cop', args: 'ban "as an AI"' })).text).toBe('Banned "as an AI" everywhere.')
  expect(saved.get('bans')).toEqual(['as an AI'])
  expect((await $.tool.call(write('/work/README.md', 'As an AI, I think\n'))).deny).toContain('"as an AI"')
  await $.command.run({ command: 'style-cop', args: 'unban as an AI' })
  expect(await $.tool.call(write('/work/README.md', 'As an AI, I think\n'))).toEqual({ result: 'edited' })
})

test('a clean one-line edit passes', async ($, on) => {
  stubs(on, { rules: RULES })
  await start($)
  expect(await $.tool.call({ tool: 'Edit', file_path: '/work/a.ts', old_string: 'x', new_string: 'y' })).toEqual({ result: 'edited' })
})

test('a glob matches at any depth unless anchored', async ($, on) => {
  stubs(on, { rules: 'no-comments-in: /top.ts, *.json\n' })
  await start($)
  expect((await $.tool.call(write('/work/deep/cfg.json', '// c\n{}'))).deny).toBeDefined()
  expect(await $.tool.call(write('/work/deep/top.ts', '// c\n'))).toEqual({ result: 'edited' })
  expect((await $.tool.call(write('/work/top.ts', '// c\n'))).deny).toBeDefined()
})
