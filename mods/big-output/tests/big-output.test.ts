import { expect, test } from 'claude-code/testing'

const BIG = Array.from({ length: 1000 }, (_, i) => 'line ' + (i + 1) + (i === 499 ? ' ERROR boom' : '') + ' ' + 'x'.repeat(30)).join('\n')

function stubs(on, files: Map<string, string> = new Map(), out = BIG) {
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/scratch\n', stderr: '' } }))
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => ({ value: files.get(e.path) ?? '' }))
  on('tool.register', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', ($, e) => ({ result: { stdout: e.command === 'small' ? 'ok' : out, stderr: '', interrupted: false } }))
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

test('a large result is trimmed to head and tail with a note', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  await start($)
  const r = await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(r.result.stdout.length < BIG.length).toBe(true)
  expect(r.result.stdout).toContain('line 1 x')
  expect(r.result.stdout).toContain('line 40 x')
  expect(r.result.stdout).toContain('line 961')
  expect(r.result.stdout).toContain('line 1000')
  expect(r.result.stdout).not.toContain('line 500 ERROR')
  expect(r.result.stdout).toContain('[big-output: this output is 1000 lines')
  expect(r.result.stdout).toContain('call the slice tool with id "1"')
  expect(files.get('/scratch/1.out')).toBe(BIG)
  expect(r.result.stderr).toBe('')
})

test('a small result is untouched', async ($, on) => {
  stubs(on)
  await start($)
  expect(await $.tool.call({ tool: 'Bash', command: 'small' })).toEqual({ result: { stdout: 'ok', stderr: '', interrupted: false } })
})

test('the slice tool greps the saved output with line numbers', async ($, on) => {
  stubs(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const r = await $.tool.call({ tool: 'mcp__big-output__slice', id: '1', grep: 'error b', context: 1 })
  expect(r.result).toContain('1 matching line(s)')
  expect(r.result).toContain('   499  line 499')
  expect(r.result).toContain('   500  line 500 ERROR boom')
  expect(r.result).toContain('   501  line 501')
})

test('the slice tool pages a line range, capped at 400 lines', async ($, on) => {
  stubs(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const r = await $.tool.call({ tool: 'mcp__big-output__slice', id: '1', from: 100, to: 102 })
  expect(r.result).toContain('Lines 100 to 102 of 1000:')
  expect(r.result).toContain('   101  line 101 ')
  expect(r.result).not.toContain('line 103')
  const big = await $.tool.call({ tool: 'mcp__big-output__slice', id: '1', from: 1, to: 1000 })
  expect(big.result).toContain('Lines 1 to 400 of 1000')
})

test('an unknown id and a bad regex are handled', async ($, on) => {
  stubs(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect((await $.tool.call({ tool: 'mcp__big-output__slice', id: '9' })).result).toContain('no saved output with id "9"')
  expect((await $.tool.call({ tool: 'mcp__big-output__slice', id: '1', grep: 'line 1(' })).result).toContain('No line matches')
})

test('/big-output sets the threshold and lists saved outputs', async ($, on) => {
  stubs(on)
  await start($)
  expect((await $.command.run({ command: 'big-output', args: '500' })).text).toMatch(/^Usage/)
  expect((await $.command.run({ command: 'big-output', args: '1000000' })).text).toBe('Output longer than 1000000 characters is trimmed.')
  const r = await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(r.result.stdout).toBe(BIG)
  await $.command.run({ command: 'big-output', args: '5000' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect((await $.command.run({ command: 'big-output', args: '' })).text).toContain('id 1: 1000 lines')
})
