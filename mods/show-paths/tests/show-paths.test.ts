import { expect, test } from 'claude-code/testing'

const ROW = {
  plugin: 'show-paths',
  component: 'ToolUse',
  requestId: 'call-1',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
} as const

function row(tool: string, input: unknown) {
  return { ...ROW, props: { tool, input, isRunning: false, isErrored: false, isInterrupted: false } }
}

function stubs(on, saved: Map<string, unknown> = new Map()) {
  on('session.root', () => ({ value: '/work' }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.log', () => ({ value: undefined }))
  // Stands for the row Claude Code draws.
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Read 1 file'] }))
}

test('a Read row shows the path relative to the project root', async ($, on) => {
  stubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount(row('Read', { file_path: '/work/src/app.ts' }))
  expect(await ui.find({ type: 'Text', text: 'Read 1 file' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'src/app.ts' })).toBeDefined()
  await ui.unmount()
})

test('Edit, Write, NotebookEdit, Glob, and Grep rows are labeled', async ($, on) => {
  stubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const cases: [string, unknown, string][] = [
    ['Edit', { file_path: '/work/a.ts', old_string: 'a', new_string: 'b' }, 'a.ts'],
    ['Write', { file_path: '/other/b.ts', content: '' }, '/other/b.ts'],
    ['NotebookEdit', { notebook_path: '/work/n.ipynb', new_source: '' }, 'n.ipynb'],
    ['Glob', { pattern: '**/*.ts' }, '**/*.ts'],
    ['Grep', { pattern: 'TODO', path: 'src' }, 'TODO in src'],
  ]
  for (const [tool, input, label] of cases) {
    const ui = await $.ui.mount(row(tool, input))
    expect(await ui.find({ type: 'Text', text: label })).toBeDefined()
    await ui.unmount()
  }
})

test('a Bash row is left alone', async ($, on) => {
  stubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount(row('Bash', { command: 'ls' }))
  expect(await ui.find({ type: 'Text', text: 'Read 1 file' })).toBeDefined()
  expect(await ui.find({ type: 'Box' })).toBeUndefined()
  await ui.unmount()
})

test('/show-paths off draws the row unchanged and is remembered', async ($, on) => {
  const saved = new Map<string, unknown>()
  stubs(on, saved)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.command.run({ command: 'show-paths', args: 'off' })).text).toMatch(/^show-paths off/)
  expect(saved.get('enabled')).toBe(false)
  const ui = await $.ui.mount(row('Read', { file_path: '/work/src/app.ts' }))
  expect(await ui.find({ type: 'Text', text: 'src/app.ts' })).toBeUndefined()
  await ui.unmount()
  expect((await $.command.run({ command: 'show-paths', args: 'on' })).text).toBe('show-paths on.')
})

test('a saved off setting is honored at session start', async ($, on) => {
  stubs(on, new Map([['enabled', false]]))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.command.run({ command: 'show-paths', args: '' })).text).toMatch(/^show-paths off/)
})
