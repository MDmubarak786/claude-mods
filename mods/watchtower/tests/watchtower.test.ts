import { expect, mock, test } from 'claude-code/testing'

const STORE = '/home/me/.claude/plugins/store'
const BAND = {
  plugin: 'watchtower',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'terminal',
  viewport: { columns: 120, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

type Files = Record<string, unknown>
const ALL = [
  { name: 'fence', plugin: 'fence' },
  { name: 'pin', plugin: 'pins' },
  { name: 'breaker', plugin: 'circuit-breaker' },
  { name: 'red-green', plugin: 'red-green@modhub' },
  { name: 'right-tool', plugin: 'right-tool' },
  { name: 'claims', plugin: 'trust-but-verify' },
]

function stubs(on, files: Files = {}, commands = ALL) {
  const saved = new Map<string, unknown>()
  const clock = mock.clock(on)
  on('session.root', () => ({ value: '/work' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/home/me\n', stderr: '' } }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.list', () => ({ value: commands.map((c) => ({ ...c, description: '', source: 'plugin', isFullscreen: false })) }))
  on('fs.list', () => ({ value: Object.keys(files).map((name, i) => ({ name, kind: 'file', size: 10, mtimeMs: i, isLink: false })) }))
  on('fs.read', ($, e) => ({ value: JSON.stringify(files[e.path.slice(STORE.length + 1)] ?? {}) }))
  on('command.register', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['other band content'] }))
  return { saved, clock }
}

async function start($, clock) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)
}

const refused = (text: string, n = 1) => ({
  message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't' + n, is_error: true, content: '<tool_use_error>' + text + '</tool_use_error>' }] },
  door: 'tool-result',
  origin: { kind: 'tool', tool: 'Bash' },
  uuid: 'u' + n,
})
const note = (text: string) => ({ message: { type: 'system', content: [{ type: 'text', text }] }, door: 'notice', origin: { kind: 'engine' }, uuid: 'n' })

test('settings from the other mods are shown in the band', async ($, on) => {
  const { clock } = stubs(on, {
    'fence_modhub-8704f3c5a153.json': { 'fence:/work': ['/work/src', '/work/README.md'] },
    'pins_modhub-aaaaaaaaaaaa.json': { 'pins:/work': ['a', 'b'] },
    'red-green_modhub-bbbbbbbbbbbb.json': { 'red-green:/work': { command: 'npm test', enabled: true } },
  })
  await start($, clock)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'watchtower' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'fence src +1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'pins 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'breaker 3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'tests: npm test' })).toBeDefined()
  // What other mods draw in the band stays, below this line.
  expect(await ui.find({ type: 'Text', text: 'other band content' })).toBeDefined()
  await ui.unmount()
})

test('with no guard mod loaded, the band is left alone', async ($, on) => {
  const { clock } = stubs(on, {}, [])
  await start($, clock)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'watchtower' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'other band content' })).toBeDefined()
  await ui.unmount()
})

test('refused calls are counted by the mod that refused them', async ($, on) => {
  const { clock } = stubs(on, {}, [{ name: 'right-tool', plugin: 'right-tool' }, { name: 'fence', plugin: 'fence' }])
  await start($, clock)
  await $.session.append(refused('right-tool: do not use Bash for this.', 1))
  await $.session.append(refused('right-tool: do not use Bash for this.', 2))
  await $.session.append(refused('fence: /work/x is outside the paths the user allowed', 3))
  await $.session.append(refused('Exit code 127\ncommand not found: foo', 4))
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'blocked 3: right-tool 2, fence 1' })).toBeDefined()
  await ui.unmount()
})

test('red-green verdicts and unverified claims show up', async ($, on) => {
  const { clock } = stubs(on, { 'red-green_modhub-bbbbbbbbbbbb.json': { 'red-green:/work': { command: 'npm test', enabled: true } } })
  await start($, clock)
  await $.session.append(note('red-green: tests FAILED, exit 1 (npm test, 6.8s). /fix sends the failure to Claude.'))
  await $.session.append(note('trust-but-verify: ✘ claims tests pass, but no matching command ran this turn'))
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'tests ✘' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 unverified claim' })).toBeDefined()
  await ui.unmount()
})

test('/watchtower off hides the band and is remembered; on shows it', async ($, on) => {
  const { clock, saved } = stubs(on, { 'pins_modhub-aaaaaaaaaaaa.json': { 'pins:/work': ['a'] } })
  await start($, clock)
  expect((await $.command.run({ command: 'watchtower', args: 'off' })).text).toBe('Band hidden. /watchtower on shows it again.')
  expect(saved.get('hidden')).toBe(true)
  let ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'watchtower' })).toBeUndefined()
  await ui.unmount()
  await $.command.run({ command: 'watchtower', args: 'on' })
  ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'pins 1' })).toBeDefined()
  await ui.unmount()
})

test('/watchtower prints the full status', async ($, on) => {
  const { clock } = stubs(on, { 'fence_modhub-8704f3c5a153.json': { 'fence:/work': ['/work/README.md'] } })
  await start($, clock)
  const text = (await $.command.run({ command: 'watchtower', args: '' })).text
  expect(text).toContain('fence            README.md')
  expect(text).toContain('circuit-breaker  hold after 3 identical failures')
  expect(text).toContain('red-green        no test command')
  expect(text).toContain('blocked          nothing this session')
})

test('segments that do not fit a narrow band are dropped from the end', async ($, on) => {
  const { clock } = stubs(on, { 'fence_modhub-8704f3c5a153.json': { 'fence:/work': ['/work/README.md'] }, 'pins_modhub-aaaaaaaaaaaa.json': { 'pins:/work': ['a', 'b'] } })
  await start($, clock)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 30 } })
  expect(await ui.find({ type: 'Text', text: 'fence README.md' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'pins 2' })).toBeUndefined()
  await ui.unmount()
})
