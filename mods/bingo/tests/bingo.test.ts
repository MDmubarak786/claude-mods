import { expect, mock, test } from 'claude-code/testing'
import { SQUARES, completedLines, drawCard, idAt, squaresForTool, squaresForTurn, emptyTurn, noteToolInTurn } from '../hooks/squares'

// A fixed day, by the local clock, so the card is the same in every run.
const NOON = new Date(2026, 9, 10, 12, 0, 0).getTime()
const DAY = '2026-10-10'

function stubs(on, options: { now?: number; saved?: Map<string, unknown>; toasts?: string[]; placed?: boolean } = {}) {
  const saved = options.saved ?? new Map<string, unknown>()
  const clock = mock.clock(on, { now: options.now ?? NOON })
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
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    options.toasts?.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: options.placed ?? true } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ agentId: 'a1' }))
  on('session.compact', () => ({}))
  on('command.run', () => ({ text: 'other' }))
  // Stands in for the tools: `false` fails, a path of /w/zz is refused by a guard mod, the rest succeed.
  on('tool.call', ($, e) => {
    if (e.tool === 'Bash' && e.command === 'false') return { result: 'boom', isError: true, text: 'boom' }
    if (e.file_path === '/w/zz') return { deny: 'fence: outside the fence' }
    return { result: 'ok' }
  })
  return { saved, clock }
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const PANE = { plugin: 'bingo', component: 'Pane', requestId: 'bingo', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'Bingo', isFocused: true, bodyColumns: 70, placement: 'inline', scroll: { offset: 0, bodyRows: 24 }, view: {} } } as const

// --- Pure logic

test('every square can be hit by some event, and the labels fit a cell', async () => {
  const bash = (command: string, isError = false) => squaresForTool('Bash', { command }, { isError })
  const byEvent: Record<string, string[]> = {
    tests: bash('npm test'), commit: bash('git commit -m x'), push: bash('git push'), 'git-look': bash('git status'),
    install: bash('pip install requests'), build: bash('npm run build'), lint: bash('eslint .'), curl: bash('curl https://x'),
    docker: bash('docker ps'), rm: bash('rm -rf build'), chain: bash('a && b'), pipe: bash('ls | wc -l'), 'bash-fail': bash('false', true),
    readme: squaresForTool('Read', { file_path: '/w/README.md' }, {}), 'read-md': squaresForTool('Read', { file_path: '/w/notes.md' }, {}),
    'read-config': squaresForTool('Read', { file_path: '/w/a.yaml' }, {}), 'edit-test': squaresForTool('Edit', { file_path: '/w/a.test.ts' }, {}),
    'edit-md': squaresForTool('Edit', { file_path: '/w/a.md' }, {}), 'wrote-file': squaresForTool('Write', { file_path: '/w/a.ts' }, {}),
    notebook: squaresForTool('NotebookEdit', { notebook_path: '/w/a.ipynb' }, {}), grep: squaresForTool('Grep', { pattern: 'x' }, {}),
    glob: squaresForTool('Glob', { pattern: '*' }, {}), web: squaresForTool('WebFetch', { url: 'https://x' }, {}), todo: squaresForTool('TodoWrite', {}, {}),
    ask: squaresForTool('AskUserQuestion', {}, {}), mcp: squaresForTool('mcp__github__get_pr', {}, {}), refused: squaresForTool('Edit', { file_path: '/w/a' }, { deny: 'no' }),
  }
  for (const [id, hits] of Object.entries(byEvent)) expect(hits).toContain(id)
  const t = emptyTurn()
  for (let i = 0; i < 10; i++) noteToolInTurn(t, 'Read', { file_path: '/w/f' + i + '.ts' })
  for (const f of ['a.ts', 'b.py', 'c.go', 'd.md', 'e.rs']) noteToolInTurn(t, 'Edit', { file_path: '/w/' + f })
  for (let i = 0; i < 3; i++) noteToolInTurn(t, 'Edit', { file_path: '/w/a.ts' })
  noteToolInTurn(t, 'Bash', { command: 'ls' })
  noteToolInTurn(t, 'Bash', { command: 'ls' })
  const turnHits = squaresForTurn(t, 'x'.repeat(2000), false, 120_000, 23)
  for (const id of ['ten-tools', 'five-files', 'same-file-3', 'three-langs', 'read-10', 'long-turn', 'long-answer', 'retry', 'night-owl']) expect(turnHits).toContain(id)
  expect(squaresForTurn(emptyTurn(), 'Done.', false, 1000, 12)).toEqual(['no-tools', 'one-liner'])
  expect(squaresForTurn(emptyTurn(), '', true, 1000, 12)).toEqual(['interrupted'])
  // Every id is reachable from one of the above.
  const reachable = new Set([...Object.keys(byEvent), ...turnHits, 'no-tools', 'one-liner', 'interrupted', 'subagent', 'compact', 'slash'])
  for (const s of SQUARES) {
    expect(reachable.has(s.id)).toBe(true)
    expect(s.label.length <= 12).toBe(true)
  }
})

test('quiet Bash commands and non-matching paths hit nothing; our own tool is not an MCP square', async () => {
  expect(squaresForTool('Bash', { command: 'ls -la' }, {})).toEqual([])
  expect(squaresForTool('Bash', { command: 'echo a || b' }, {})).toEqual(['chain'])
  expect(squaresForTool('Read', { file_path: '/w/a.ts' }, {})).toEqual([])
  expect(squaresForTool('mcp__big-output__slice', { id: '1' }, {})).toEqual([])
  expect(squaresForTool('Edit', {}, {})).toEqual([])
})

test('a card is 24 distinct ids, the same for the same day and salt, different for another', async () => {
  const a = drawCard(DAY, 0)
  expect(a.length).toBe(24)
  expect(new Set(a).size).toBe(24)
  expect(drawCard(DAY, 0)).toEqual(a)
  expect(drawCard(DAY, 1)).not.toEqual(a)
  expect(drawCard('2026-10-11', 0)).not.toEqual(a)
  expect(idAt(a, 12)).toBe(null)
  expect(idAt(a, 11)).toBe(a[11])
  expect(idAt(a, 13)).toBe(a[12])
})

test('all twelve lines are found, with FREE counting as marked', async () => {
  const ids = drawCard(DAY, 0)
  const mark = (positions: number[]) => Object.fromEntries(positions.map((p) => idAt(ids, p)).filter((id): id is string => id !== null).map((id) => [id, 1]))
  expect(completedLines(ids, {})).toEqual([])
  expect(completedLines(ids, mark([0, 1, 2, 3, 4]))).toEqual(['row 1'])
  expect(completedLines(ids, mark([10, 11, 13, 14]))).toEqual(['row 3'])
  expect(completedLines(ids, mark([2, 7, 17, 22]))).toEqual(['column 3'])
  expect(completedLines(ids, mark([0, 6, 18, 24]))).toEqual(['diagonal ↘'])
  expect(completedLines(ids, mark([4, 8, 16, 20]))).toEqual(['diagonal ↗'])
  expect(completedLines(ids, Object.fromEntries(ids.map((id) => [id, 1]))).length).toBe(12)
})

// --- The mod

test('the day\'s card is drawn, saved, and marked as Claude works; a line toasts', async ($, on) => {
  const toasts: string[] = []
  const { saved } = stubs(on, { toasts })
  await start($)
  const card = saved.get('card:' + DAY) as { ids: string[]; marks: Record<string, number> }
  expect(card.ids).toEqual(drawCard(DAY, 0))
  expect((saved.get('stats') as any).cards).toBe(1)

  // Fill row 1 by firing an event for each of its four ids (position 2 is not FREE; FREE is 12).
  const events: Record<string, () => Promise<unknown>> = {
    tests: () => $.tool.call({ tool: 'Bash', command: 'npm test' }), commit: () => $.tool.call({ tool: 'Bash', command: 'git commit -m x' }),
    push: () => $.tool.call({ tool: 'Bash', command: 'git push' }), 'git-look': () => $.tool.call({ tool: 'Bash', command: 'git status' }),
    install: () => $.tool.call({ tool: 'Bash', command: 'npm install x' }), build: () => $.tool.call({ tool: 'Bash', command: 'npm run build' }),
    lint: () => $.tool.call({ tool: 'Bash', command: 'eslint .' }), curl: () => $.tool.call({ tool: 'Bash', command: 'curl x' }),
    docker: () => $.tool.call({ tool: 'Bash', command: 'docker ps' }), rm: () => $.tool.call({ tool: 'Bash', command: 'rm -rf x' }),
    chain: () => $.tool.call({ tool: 'Bash', command: 'a && b' }), pipe: () => $.tool.call({ tool: 'Bash', command: 'a | b' }),
    'bash-fail': () => $.tool.call({ tool: 'Bash', command: 'false' }), readme: () => $.tool.call({ tool: 'Read', file_path: '/w/README.md' }),
    'read-md': () => $.tool.call({ tool: 'Read', file_path: '/w/n.md' }), 'read-config': () => $.tool.call({ tool: 'Read', file_path: '/w/a.json' }),
    'edit-test': () => $.tool.call({ tool: 'Edit', file_path: '/w/a.test.ts', old_string: 'a', new_string: 'b' }), 'edit-md': () => $.tool.call({ tool: 'Edit', file_path: '/w/a.md', old_string: 'a', new_string: 'b' }),
    'wrote-file': () => $.tool.call({ tool: 'Write', file_path: '/w/a.txt', content: '' }), notebook: () => $.tool.call({ tool: 'NotebookEdit', notebook_path: '/w/a.ipynb', new_source: '' }),
    grep: () => $.tool.call({ tool: 'Grep', pattern: 'x' }), glob: () => $.tool.call({ tool: 'Glob', pattern: '*' }), web: () => $.tool.call({ tool: 'WebSearch', query: 'x' }),
    todo: () => $.tool.call({ tool: 'TodoWrite', todos: [] }), ask: () => $.tool.call({ tool: 'AskUserQuestion', questions: [] }), mcp: () => $.tool.call({ tool: 'mcp__github__x' }),
    refused: () => $.tool.call({ tool: 'Edit', file_path: '/w/zz', old_string: 'a', new_string: 'b' }),
    subagent: () => $.agent.spawn({ prompt: 'x', description: 'd', subagentType: 'Explore', provider: { kind: 'model', model: 'm' }, parentModel: 'm' }),
    compact: () => $.session.compact({ trigger: 'auto', messages: [] }),
    slash: () => $.command.run({ command: 'help', args: '', origin: { kind: 'composer' } }),
    'ten-tools': async () => { for (let i = 0; i < 10; i++) await $.tool.call({ tool: 'Read', file_path: '/w/f' + i + '.ts' }); await $.turn.complete({ turnId: 't', answer: 'ok done here', durationMs: 1, isAborted: false, usage: null }) },
    'read-10': async () => { for (let i = 0; i < 10; i++) await $.tool.call({ tool: 'Read', file_path: '/w/f' + i + '.ts' }); await $.turn.complete({ turnId: 't', answer: 'ok done here', durationMs: 1, isAborted: false, usage: null }) },
    'five-files': async () => { for (const f of ['a.ts', 'b.py', 'c.go', 'd.rb', 'e.rs']) await $.tool.call({ tool: 'Edit', file_path: '/w/' + f, old_string: 'a', new_string: 'b' }); await $.turn.complete({ turnId: 't', answer: 'ok done here', durationMs: 1, isAborted: false, usage: null }) },
    'three-langs': async () => { for (const f of ['a.ts', 'b.py', 'c.go']) await $.tool.call({ tool: 'Edit', file_path: '/w/' + f, old_string: 'a', new_string: 'b' }); await $.turn.complete({ turnId: 't', answer: 'ok done here', durationMs: 1, isAborted: false, usage: null }) },
    'same-file-3': async () => { for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Edit', file_path: '/w/same.ts', old_string: 'a', new_string: 'b' }); await $.turn.complete({ turnId: 't', answer: 'ok done here', durationMs: 1, isAborted: false, usage: null }) },
    'long-turn': () => $.turn.complete({ turnId: 't', answer: 'ok done here', durationMs: 200_000, isAborted: false, usage: null }),
    'no-tools': () => $.turn.complete({ turnId: 't', answer: 'A plain answer with enough words to pass sixty characters of length easily.', durationMs: 1, isAborted: false, usage: null }),
    interrupted: () => $.turn.complete({ turnId: 't', answer: '', durationMs: 1, isAborted: true, usage: null }),
    'long-answer': () => $.turn.complete({ turnId: 't', answer: 'x'.repeat(2000), durationMs: 1, isAborted: false, usage: null }),
    'one-liner': () => $.turn.complete({ turnId: 't', answer: 'Done.', durationMs: 1, isAborted: false, usage: null }),
    retry: async () => { await $.tool.call({ tool: 'Bash', command: 'ls' }); await $.tool.call({ tool: 'Bash', command: 'ls' }); await $.turn.complete({ turnId: 't', answer: 'ok done here', durationMs: 1, isAborted: false, usage: null }) },
    'night-owl': () => $.turn.complete({ turnId: 't', answer: 'ok done here', durationMs: 1, isAborted: false, usage: null }), // not at noon; handled below
  }
  const row1 = [0, 1, 2, 3, 4].map((p) => idAt(card.ids, p) as string)
  for (const id of row1) {
    if (id === 'night-owl') continue
    await $.turn.start({ turnId: 't' })
    await events[id]()
  }
  const after = saved.get('card:' + DAY) as { marks: Record<string, number> }
  for (const id of row1) if (id !== 'night-owl') expect(id in after.marks).toBe(true)
  if (!row1.includes('night-owl')) {
    expect(toasts).toContain('BINGO! row 1 is complete.')
    expect((saved.get('stats') as any).lines).toBe(1)
  }
})

test('a refused call is a square, but a subagent\'s calls are not counted', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/w/zz', old_string: 'a', new_string: 'b', agentId: 'sub-1' })
  let marks = (saved.get('card:' + DAY) as any).marks
  expect(Object.keys(marks)).toEqual([])
  await $.tool.call({ tool: 'Edit', file_path: '/w/zz', old_string: 'a', new_string: 'b' })
  marks = (saved.get('card:' + DAY) as any).marks
  const ids = drawCard(DAY, 0)
  expect('refused' in marks).toBe(ids.includes('refused'))
})

test('/bingo itself is not a slash-command square, and only your own commands count', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  await $.command.run({ command: 'bingo', args: 'card' })
  await $.command.run({ command: 'help', args: '', origin: { kind: 'plugin', name: 'x' } })
  expect(Object.keys((saved.get('card:' + DAY) as any).marks)).toEqual([])
  await $.command.run({ command: 'help', args: '', origin: { kind: 'composer' } })
  const ids = drawCard(DAY, 0)
  expect('slash' in (saved.get('card:' + DAY) as any).marks).toBe(ids.includes('slash'))
})

test('marks from another session are merged, not overwritten', async ($, on) => {
  const ids = drawCard(DAY, 0)
  const other = ids.find((id) => id !== 'grep')!
  const { saved } = stubs(on, { saved: new Map<string, unknown>([['card:' + DAY, { ids, salt: 0, marks: {} }]]) })
  await start($)
  // Another session marks a square behind our back.
  const card = saved.get('card:' + DAY) as any
  saved.set('card:' + DAY, { ...card, marks: { ...card.marks, [other]: 5 } })
  await $.tool.call({ tool: 'Grep', pattern: 'x' })
  const marks = (saved.get('card:' + DAY) as any).marks
  expect(other in marks).toBe(true)
  if (ids.includes('grep')) expect('grep' in marks).toBe(true)
})

test('/bingo card prints the grid; /bingo new reshuffles; loud and stats work', async ($, on) => {
  const toasts: string[] = []
  const { saved } = stubs(on, { toasts })
  await start($)
  const text = (await $.command.run({ command: 'bingo', args: 'card' })).text
  expect(text).toContain('Bingo for ' + DAY + ' · 0/24 marked · 0 lines')
  expect(text).toContain('[x] FREE')
  expect(text.split('\n').length).toBe(6)
  const fresh = (await $.command.run({ command: 'bingo', args: 'new' })).text
  expect(fresh).toContain('New card for today.')
  expect((saved.get('card:' + DAY) as any).salt).toBe(1)
  expect((saved.get('card:' + DAY) as any).ids).toEqual(drawCard(DAY, 1))
  expect((saved.get('stats') as any).cards).toBe(2)
  expect((await $.command.run({ command: 'bingo', args: 'loud' })).text).toMatch(/^Loud/)
  expect(saved.get('loud')).toBe(true)
  await $.tool.call({ tool: 'Grep', pattern: 'x' })
  if (drawCard(DAY, 1).includes('grep')) expect(toasts).toContain('bingo: used Grep')
  expect((await $.command.run({ command: 'bingo', args: 'stats' })).text).toBe('Cards played 2 · lines completed 0 · blackouts 0')
  expect((await $.command.run({ command: 'bingo', args: 'what' })).text).toMatch(/^Usage/)
})

test('where no pane can be placed, /bingo prints the card', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: 'bingo', args: '' })).text).toContain('Bingo for ' + DAY)
})

test('the pane draws 25 cells, marks them, and its buttons work', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const ids = drawCard(DAY, 0)
  await $.tool.call({ tool: 'Grep', pattern: 'x' })
  const ui = await $.ui.mount(PANE)
  for (let p = 0; p < 25; p++) expect(await ui.find({ key: 'cell-' + p })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'FREE' })).toBeDefined()
  if (ids.includes('grep')) expect(await ui.find({ type: 'Text', text: '✔ used Grep' })).toBeDefined()
  await ui.press({ key: 'loud' })
  expect(saved.get('loud')).toBe(true)
  await ui.press({ key: 'new' })
  expect((saved.get('card:' + DAY) as any).salt).toBe(1)
  await ui.unmount()
})

test('a narrow pane falls back to compact text cells', async ($, on) => {
  stubs(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  // A compact cell is a keyed Box with no border around one line of text.
  const free = await ui.find({ key: 'cell-12' })
  expect(free?.type).toBe('Box')
  expect(free?.props?.borderStyle).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^FREE\s*$/ })).toBeDefined()
  expect(await ui.find({ key: 'cell-24' })).toBeDefined()
  await ui.unmount()
})

test('old cards are pruned and the card survives /clear', async ($, on) => {
  const { saved } = stubs(on, { saved: new Map<string, unknown>([['card:2026-01-01', { ids: drawCard('2026-01-01', 0), salt: 0, marks: {} }]]) })
  await start($)
  expect(saved.has('card:2026-01-01')).toBe(false)
  await $.tool.call({ tool: 'Grep', pattern: 'x' })
  await $.classic.SessionStart({ source: 'clear' })
  const text = (await $.command.run({ command: 'bingo', args: 'card' })).text
  const ids = drawCard(DAY, 0)
  if (ids.includes('grep')) expect(text).toContain('[x] used Grep')
})
