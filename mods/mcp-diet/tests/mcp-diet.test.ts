import { expect, test } from 'claude-code/testing'

const TOOLS = [
  { name: 'mcp__jira__search_issues', description: 'x'.repeat(400), mcp: true },
  { name: 'mcp__jira__create_issue', description: 'y'.repeat(800), mcp: true },
  { name: 'mcp__github__get_pr', description: 'z'.repeat(200), mcp: true },
  { name: 'Read', description: 'built in', mcp: false },
]

function stubs(on, saved = new Map<string, unknown>()) {
  on('session.root', () => ({ value: '/work' }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.list', () => ({ value: TOOLS }))
  on('tool.describe', ($, e) => ({ description: e.description }))
  on('agent.offer', () => ({ isOffered: true }))
  on('ui.open', () => ({ value: { isPlaced: false } }))
  return saved
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const diet = ($, args: string) => $.command.run({ command: 'mcp-diet', args })

test('a hidden tool gets a stub description and is deferred', async ($, on) => {
  stubs(on, new Map([['mcp-diet:/work', { mcp__jira__create_issue: 'hide' }]]))
  await start($)
  const hidden = await $.tool.describe({ tool: 'mcp__jira__create_issue', description: 'long' })
  expect(hidden).toEqual({ description: 'Not available in this project.', isDeferred: true })
  const normal = await $.tool.describe({ tool: 'mcp__jira__search_issues', description: 'long' })
  expect(normal).toEqual({ description: 'long' })
})

test('a deferred tool keeps its description and a server choice covers its tools', async ($, on) => {
  stubs(on, new Map([['mcp-diet:/work', { mcp__jira: 'defer' }]]))
  await start($)
  expect(await $.tool.describe({ tool: 'mcp__jira__search_issues', description: 'd' })).toEqual({ description: 'd', isDeferred: true })
  expect(await $.tool.describe({ tool: 'mcp__github__get_pr', description: 'd' })).toEqual({ description: 'd' })
})

test('a hidden subagent type is withheld', async ($, on) => {
  stubs(on, new Map([['mcp-diet:/work', { 'pr-review-toolkit:code-reviewer': 'hide' }]]))
  await start($)
  expect(await $.agent.offer({ agent: 'pr-review-toolkit:code-reviewer', description: 'reviews' })).toEqual({ isOffered: false })
  expect(await $.agent.offer({ agent: 'Explore', description: 'explores' })).toEqual({ isOffered: true })
})

test('/mcp-diet defer, hide, and show save choices and say when they apply', async ($, on) => {
  const saved = stubs(on)
  await start($)
  expect((await diet($, 'hide mcp__jira')).text).toBe('Hiding mcp__jira in this project from the next session on.')
  expect((await diet($, 'defer mcp__github__get_pr')).text).toMatch(/^Deferring/)
  expect(saved.get('mcp-diet:/work')).toEqual({ mcp__jira: 'hide', mcp__github__get_pr: 'defer' })
  expect((await diet($, 'show mcp__jira')).text).toMatch(/^Showing/)
  expect(saved.get('mcp-diet:/work')).toEqual({ mcp__github__get_pr: 'defer' })
})

test('/mcp-diet list groups tools by server with token estimates', async ($, on) => {
  stubs(on, new Map([['mcp-diet:/work', { mcp__jira__create_issue: 'hide' }]]))
  await start($)
  await $.agent.offer({ agent: 'Explore', description: 'e'.repeat(40) })
  const text = (await diet($, 'list')).text
  expect(text).toContain('mcp__jira: 2 tool(s), ~300 tokens of descriptions')
  expect(text).toContain('  create_issue [hide] ~200')
  expect(text).toContain('mcp__github: 1 tool(s), ~50 tokens')
  expect(text).toContain('agent Explore ~10')
  expect(text).toContain('About 150 tokens of MCP tool descriptions are sent in full.')
  expect(text).not.toContain('Read')
})

test('where no pane can be placed, /mcp-diet prints the list', async ($, on) => {
  stubs(on)
  await start($)
  expect((await diet($, '')).text).toContain('mcp__jira: 2 tool(s)')
})

test('the pane draws a button per server and tool, and pressing cycles the choice', async ($, on) => {
  const saved = stubs(on)
  await start($)
  const ui = await $.ui.mount({ plugin: 'mcp-diet', component: 'Pane', requestId: 'mcp-diet', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'MCP diet', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} } })
  expect(await ui.find({ key: 'tool-mcp__jira__create_issue' })).toBeDefined()
  await ui.press({ key: 'tool-mcp__jira__create_issue' })
  expect(saved.get('mcp-diet:/work')).toEqual({ mcp__jira__create_issue: 'defer' })
  await ui.press({ key: 'tool-mcp__jira__create_issue' })
  expect(saved.get('mcp-diet:/work')).toEqual({ mcp__jira__create_issue: 'hide' })
  await ui.press({ key: 'tool-mcp__jira__create_issue' })
  expect(saved.get('mcp-diet:/work')).toEqual({})
  await ui.unmount()
})
