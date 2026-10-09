import { expect, test } from 'claude-code/testing'

const REPLY = 'Here is the fix:\n\n```ts\nconst a = 1\n  const b = 2\n```\n\nAnd a shell line:\n\n```bash\nnpm test\n```\n'

function stubs(on, messages, copied: { text?: string } = {}) {
  on('session.messages', () => ({ value: messages }))
  on('ui.copy', ($, e) => {
    copied.text = e.text
    return { value: { isCopied: true } }
  })
}

const assistant = (text: string) => ({ role: 'assistant', text, toolUses: [] })
const user = (text: string) => ({ role: 'user', text, toolUses: [] })

test('/copy copies the whole last reply as source', async ($, on) => {
  const copied: { text?: string } = {}
  stubs(on, [user('fix it'), assistant('old'), user('again'), assistant(REPLY)], copied)
  const out = await $.command.run({ command: 'copy', args: '' })
  expect(out.text).toMatch(/^Copied reply: /)
  expect(copied.text).toBe(REPLY)
})

test('/copy code copies the last fenced block without the fence', async ($, on) => {
  const copied: { text?: string } = {}
  stubs(on, [assistant(REPLY)], copied)
  const out = await $.command.run({ command: 'copy', args: 'code' })
  expect(out.text).toMatch(/^Copied code block: /)
  expect(copied.text).toBe('npm test')
})

test('/copy code 2 copies the block before it, indentation intact', async ($, on) => {
  const copied: { text?: string } = {}
  stubs(on, [assistant(REPLY)], copied)
  await $.command.run({ command: 'copy', args: 'code 2' })
  expect(copied.text).toBe('const a = 1\n  const b = 2')
})

test('a block in the previous reply is still reachable', async ($, on) => {
  const copied: { text?: string } = {}
  stubs(on, [assistant(REPLY), user('thanks'), assistant('You are welcome.')], copied)
  const out = await $.command.run({ command: 'copy', args: 'code' })
  expect(out.text).toMatch(/^Copied code block/)
  expect(copied.text).toBe('npm test')
})

test('nothing to copy is reported, not crashed', async ($, on) => {
  stubs(on, [user('hi')])
  expect((await $.command.run({ command: 'copy', args: '' })).text).toBe('Nothing to copy yet.')
})

test('no code block and out-of-range N are reported', async ($, on) => {
  stubs(on, [assistant('Plain answer.'), assistant(REPLY)])
  expect((await $.command.run({ command: 'copy', args: 'code 9' })).text).toBe('Only 2 code block(s) found.')
  expect((await $.command.run({ command: 'copy', args: 'code zero' })).text).toMatch(/^Usage/)
})

test('a clipboard failure is reported', async ($, on) => {
  on('session.messages', () => ({ value: [assistant('x')] }))
  on('ui.copy', () => ({ value: { isCopied: false } }))
  expect((await $.command.run({ command: 'copy', args: '' })).text).toBe('Could not copy to the clipboard.')
})
