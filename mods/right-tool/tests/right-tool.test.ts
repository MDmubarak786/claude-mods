import { expect, test } from 'claude-code/testing'

function stubs(on, saved: Map<string, unknown> = new Map()) {
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }))
  on('turn.complete', () => ({ text: '' }))
}

const bash = (command: string) => ({ tool: 'Bash', command })

test('cat on one file is redirected to Read', async ($, on) => {
  stubs(on)
  const out = await $.tool.call(bash('cat src/app.ts'))
  expect(out.deny).toContain('Read with file_path="src/app.ts"')
})

test('head, tail, and sed -n ranges become Read with offset and limit', async ($, on) => {
  stubs(on)
  expect((await $.tool.call(bash('head -n 20 README.md'))).deny).toContain('Read with file_path="README.md", limit=20')
  expect((await $.tool.call(bash('head -5 README.md'))).deny).toContain('limit=5')
  expect((await $.tool.call(bash('tail -n 30 log.txt'))).deny).toContain('Read with file_path="log.txt"')
  expect((await $.tool.call(bash("sed -n '10,20p' src/a.ts"))).deny).toContain('file_path="src/a.ts", offset=10, limit=11')
})

test('grep becomes Grep with its flags mapped', async ($, on) => {
  stubs(on)
  const out = await $.tool.call(bash('grep -rn TODO src'))
  expect(out.deny).toContain('Grep with')
  expect(out.deny).toContain('pattern="TODO"')
  expect(out.deny).toContain('path="src"')
  expect(out.deny).toContain('output_mode="content"')
  const files = await $.tool.call(bash('grep -rl "useEffect" . --include=*.tsx'))
  expect(files.deny).toContain('output_mode="files_with_matches"')
  expect(files.deny).toContain('glob="*.tsx"')
})

test('find -name becomes Glob', async ($, on) => {
  stubs(on)
  expect((await $.tool.call(bash("find . -name '*.test.ts'"))).deny).toContain('Glob with pattern="**/*.test.ts"')
  expect((await $.tool.call(bash('find src -name "*.go" -type f'))).deny).toContain('pattern="src/**/*.go"')
})

test('pipes, chains, redirections, globs, and unknown flags pass through', async ($, on) => {
  stubs(on)
  for (const c of ['cat a.ts | wc -l', 'grep -c TODO src && echo ok', 'cat *.md', 'cat a.ts > b.ts', 'grep -P "x" src', 'find . -newer x', 'cat -A a.ts', 'ls src', 'npm test']) {
    expect(await $.tool.call(bash(c))).toEqual({ result: { stdout: 'ran', stderr: '', interrupted: false } })
  }
})

test('/right-tool off lets everything through and is remembered', async ($, on) => {
  const saved = new Map<string, unknown>()
  stubs(on, saved)
  expect((await $.command.run({ command: 'right-tool', args: 'off' })).text).toMatch(/^right-tool off/)
  expect(saved.get('enabled')).toBe(false)
  expect((await $.tool.call(bash('cat a.ts'))).deny).toBeUndefined()
  await $.command.run({ command: 'right-tool', args: 'on' })
  expect((await $.tool.call(bash('cat a.ts'))).deny).toBeDefined()
})

test('the turn footer counts redirects for the main conversation only', async ($, on) => {
  stubs(on)
  await $.tool.call(bash('cat a.ts'))
  await $.tool.call(bash('cat b.ts'))
  const t = { turnId: 't', answer: '', durationMs: 1, isAborted: false, usage: null }
  expect((await $.turn.complete(t)).text).toBe('right-tool redirected 2 Bash call(s) to Read, Grep, or Glob this turn.')
  expect((await $.turn.complete(t)).text).toBe('')
  expect((await $.command.run({ command: 'right-tool', args: '' })).text).toContain('Redirected 2 call(s)')
})
