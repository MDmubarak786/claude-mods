import { expect, mock, test } from 'claude-code/testing'
import { FREE, callNumber, claim, claudeLines, makeCard, newGame, toggleMark, yourLines } from '../hooks/game'

const T0 = 1_700_000_000_000
const STATS = { games: 0, wins: 0, losses: 0 }

function stubs(on, options: { saved?: Map<string, unknown>; toasts?: string[]; placed?: boolean; now?: number } = {}) {
  const saved = options.saved ?? new Map<string, unknown>()
  const clock = mock.clock(on, { now: options.now ?? T0 })
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    options.toasts?.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: options.placed ?? true } }))
  on('ui.close', () => ({}))
  return { saved, clock }
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const PANE = { plugin: 'bingo', component: 'Pane', requestId: 'bingo', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'Bingo', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 26 }, view: {} } } as const

// Play a game forward until the given predicate holds, by calling numbers.
function callUntil(g, pred: (g) => boolean, max = 80) {
  for (let i = 0; i < max && !pred(g); i++) g = callNumber(g)
  return g
}

// --- Rules

test('a card has five numbers per column in the right range, all distinct, FREE in the center', async () => {
  for (const salt of ['you', 'claude']) {
    const card = makeCard(42, salt)
    expect(card.length).toBe(25)
    expect(card[FREE]).toBe(0)
    const numbers = card.filter((n) => n !== 0)
    expect(new Set(numbers).size).toBe(24)
    for (let pos = 0; pos < 25; pos++) {
      if (pos === FREE) continue
      const col = pos % 5
      expect(card[pos] >= col * 15 + 1 && card[pos] <= col * 15 + 15).toBe(true)
    }
  }
  expect(makeCard(42, 'you')).toEqual(makeCard(42, 'you'))
  expect(makeCard(42, 'you')).not.toEqual(makeCard(42, 'claude'))
  expect(makeCard(43, 'you')).not.toEqual(makeCard(42, 'you'))
})

test('calls never repeat and the pool runs out at 75', async () => {
  let g = newGame(7, STATS, 8, false)
  // Keep Claude from winning so we can exhaust the pool: give it no card.
  g = { ...g, claude: new Array(25).fill(99) }
  for (let i = 0; i < 80; i++) g = callNumber(g)
  expect(g.called.length).toBe(75)
  expect(new Set(g.called).size).toBe(75)
  expect(Math.min(...g.called)).toBe(1)
  expect(Math.max(...g.called)).toBe(75)
})

test('you can mark only a called number, and press again to unmark', async () => {
  let g = newGame(7, STATS, 8, false)
  const pos = 0
  expect(toggleMark(g, pos).error).toContain("hasn't been called")
  expect(toggleMark(g, FREE).error).toBe('FREE is always marked.')
  g = { ...g, called: [g.you[pos]] }
  const marked = toggleMark(g, pos)
  expect(marked.error).toBeUndefined()
  expect(marked.game.yourMarks).toContain(pos)
  expect(toggleMark(marked.game, pos).game.yourMarks).not.toContain(pos)
})

test('a claim needs a full line; a valid claim wins and counts', async () => {
  let g = newGame(7, STATS, 8, false)
  expect(claim(g).error).toContain('Not a bingo')
  const row = [0, 1, 2, 3, 4]
  g = { ...g, called: row.map((p) => g.you[p]), yourMarks: [FREE, ...row] }
  expect(yourLines(g)).toEqual(['row 1'])
  const won = claim(g)
  expect(won.game.winner).toBe('you')
  expect(won.game.winningLine).toBe('row 1')
  expect(won.game.stats.wins).toBe(1)
  expect(claim(won.game).error).toBe('The game is over.')
  expect(callNumber(won.game)).toEqual(won.game)
})

test('Claude claims at the call after it completes a line, unless you claimed first', async () => {
  let g = newGame(7, STATS, 8, false)
  g = callUntil(g, (x) => x.claudeLine !== null)
  expect(claudeLines(g).length > 0).toBe(true)
  expect(g.winner).toBe(null)
  const stolen = callNumber(g)
  expect(stolen.winner).toBe('claude')
  expect(stolen.winningLine).toBe(g.claudeLine)
  expect(stolen.stats.losses).toBe(1)
  expect(stolen.called.length).toBe(g.called.length)
  // Your claim in the window wins instead.
  const line = yourLines({ ...g, yourMarks: [0, 1, 2, 3, 4, FREE] })
  const mine = claim({ ...g, called: [...g.called, ...[0, 1, 2, 3, 4].map((p) => g.you[p])], yourMarks: [FREE, 0, 1, 2, 3, 4] })
  expect(mine.game.winner).toBe('you')
  expect(line).toEqual(['row 1'])
})

// --- The mod

test('a game is created and saved at start, and survives /clear', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const g = saved.get('game') as any
  expect(g.you.length).toBe(25)
  expect(g.stats.games).toBe(1)
  expect((await $.command.run({ command: 'bingo', args: 'stats' })).text).toBe('Games 1 · you 0 · Claude 0')
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'cell-0' })).toBeDefined()
  await ui.unmount()
})

test('the pane draws both cards and the controls; Call, marking, and Bingo! work', async ($, on) => {
  const toasts: string[] = []
  const { saved } = stubs(on, { toasts })
  await start($)
  const ui = await $.ui.mount(PANE)
  for (const key of ['cell-0', 'cell-24', 'call', 'auto', 'claim', 'new']) expect(await ui.find({ key })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "Claude's card" })).toBeDefined()
  await ui.press({ key: 'cell-0' })
  expect(toasts[0]).toContain("hasn't been called")
  await ui.press({ key: 'call' })
  let g = saved.get('game') as any
  expect(g.called.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: /^called 1\/75$/ })).toBeDefined()
  await ui.press({ key: 'claim' })
  expect(toasts.some((t) => t.startsWith('Not a bingo'))).toBe(true)
  // Mark a called number by finding its cell.
  const pos = g.you.indexOf(g.called[0])
  if (pos >= 0) {
    await ui.press({ key: 'cell-' + pos })
    g = saved.get('game') as any
    expect(g.yourMarks).toContain(pos)
  }
  await ui.unmount()
})

test('Auto calls a number every speed seconds, and stops when turned off', async ($, on) => {
  const { saved, clock } = stubs(on)
  await start($)
  await $.command.run({ command: 'bingo', args: 'speed 5' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  expect((saved.get('game') as any).auto).toBe(true)
  await clock.advance(5000)
  await clock.advance(5000)
  expect((saved.get('game') as any).called.length).toBe(2)
  // Off again: the caller stops. (The kit can't fire ui.close, which stops it the same way.)
  await ui.press({ key: 'auto' })
  expect((saved.get('game') as any).auto).toBe(false)
  await clock.advance(20000)
  expect((saved.get('game') as any).called.length).toBe(2)
  await ui.unmount()
})

test('Auto stops when Claude wins, and the toasts say so', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await clock.advance(8000 * 80)
  const g = saved.get('game') as any
  expect(g.winner).toBe('claude')
  expect(toasts.some((t) => t.startsWith('Claude has '))).toBe(true)
  expect(toasts.some((t) => t.startsWith('Claude: BINGO!'))).toBe(true)
  const calls = g.called.length
  await clock.advance(8000 * 5)
  expect((saved.get('game') as any).called.length).toBe(calls)
  expect((await $.command.run({ command: 'bingo', args: 'stats' })).text).toBe('Games 1 · you 0 · Claude 1')
  await ui.unmount()
})

test('/bingo new starts over and keeps the record; /bingo prints a summary where no pane fits', async ($, on) => {
  const { saved, clock } = stubs(on, { placed: false })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'call' })
  await ui.unmount()
  await clock.advance(1)
  const text = (await $.command.run({ command: 'bingo', args: 'new' })).text
  expect(text).toMatch(/^New game\. Bingo: 0\/75 called, last none\. In play\./)
  expect((saved.get('game') as any).stats.games).toBe(2)
  expect((await $.command.run({ command: 'bingo', args: '' })).text).toContain('/bingo opens the pane')
  expect((await $.command.run({ command: 'bingo', args: 'what' })).text).toMatch(/^Usage/)
})

test('a narrow pane stacks the cards', async ($, on) => {
  stubs(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  expect(await ui.find({ key: 'cell-12' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Your card' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "Claude's card" })).toBeDefined()
  await ui.unmount()
})
