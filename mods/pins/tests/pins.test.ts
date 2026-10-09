import { expect, test } from 'claude-code/testing'

function stubs(on, saved = new Map<string, unknown>(), root = '/work') {
  on('session.root', () => ({ value: root }))
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
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  return saved
}

const pin = ($, args: string) => $.command.run({ command: 'pin', args })

test('/pin saves, lists, removes, and clears', async ($, on) => {
  const saved = stubs(on)
  expect((await pin($, '')).text).toBe('No pins. /pin <text> adds one.')
  expect((await pin($, "don't touch the migrations")).text).toBe("Pinned (1): don't touch the migrations")
  expect((await pin($, 'run the tests before saying done')).text).toMatch(/^Pinned \(2\)/)
  expect(saved.get('pins:/work')).toEqual(["don't touch the migrations", 'run the tests before saying done'])
  expect((await pin($, '')).text).toBe("Pinned for this project:\n1. don't touch the migrations\n2. run the tests before saying done")
  expect((await pin($, 'rm 1')).text).toBe("Removed pin 1: don't touch the migrations")
  expect((await pin($, 'rm 5')).text).toMatch(/^No pin 5/)
  expect((await pin($, 'clear')).text).toBe('Removed 1 pin(s).')
  expect(saved.has('pins:/work')).toBe(false)
})

test('every prompt carries the pins as context, in order', async ($, on) => {
  stubs(on, new Map([['pins:/work', ['no new dependencies', 'keep commits small']]]))
  const out = await $.prompt.submit({ text: 'add a cache' })
  expect(out.text).toBe('add a cache')
  expect(out.context).toEqual(['Pinned instructions from the user for this project. They apply to every turn, including after compaction:\n1. no new dependencies\n2. keep commits small'])
})

test('context from earlier hooks is kept', async ($, on) => {
  stubs(on, new Map([['pins:/work', ['x']]]))
  const out = await $.prompt.submit({ text: 'hi', context: ['from another mod'] })
  expect(out.context[0]).toBe('from another mod')
  expect(out.context[1]).toContain('1. x')
})

test('with no pins the prompt passes through untouched', async ($, on) => {
  stubs(on)
  const out = await $.prompt.submit({ text: 'hi' })
  expect(out.context ?? []).toEqual([])
})

test('pins are per project root', async ($, on) => {
  stubs(on, new Map([['pins:/other', ['elsewhere']]]), '/work')
  expect((await pin($, '')).text).toBe('No pins. /pin <text> adds one.')
})
