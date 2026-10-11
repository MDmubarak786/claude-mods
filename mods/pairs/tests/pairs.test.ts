import { expect, mock, test } from 'claude-code/testing'
import { CARDS, FACES, KEYS, hideMiss, isGame, newGame, pairsFound, shuffle, turn } from '../hooks/game'
import type { Game } from '../types'

const T0 = 1_700_000_000_000
const STATS = { games: 0, finished: 0, bestTurns: 0 }

// Positions of both cards of each face.
function pairsOf(g: Game): number[][] {
  return FACES.map((_, f) => g.faces.map((x, i) => (x === f ? i : -1)).filter((i) => i >= 0))
}

// --- Rules

test('a deal has every face twice, shuffled, and repeatable from the seed', async () => {
  const faces = shuffle(5)
  expect(faces.length).toBe(CARDS)
  for (let f = 0; f < FACES.length; f++) expect(faces.filter((x) => x === f).length).toBe(2)
  expect(shuffle(5)).toEqual(faces)
  expect(shuffle(6)).not.toEqual(faces)
  expect(faces).not.toEqual(Array.from({ length: CARDS }, (_, i) => i % FACES.length))
  expect(KEYS.length).toBe(CARDS)
  expect(new Set(KEYS).size).toBe(CARDS)
})

test('turning two cards is a turn: a pair stays found, a miss stays up until the next turn or hideMiss', async () => {
  let g = newGame(5, STATS)
  const [a, b] = pairsOf(g)[0]
  const other = g.faces.findIndex((f) => f !== g.faces[a])
  expect(turn(g, a).outcome).toBe('first')
  g = turn(g, a).game
  expect(g.up).toEqual([a])
  expect(turn(g, a).error).toBe('That card is already up.')
  let miss = turn(g, other)
  expect(miss.outcome).toBe('miss')
  expect(miss.game.up).toEqual([a, other])
  expect(miss.game.turns).toBe(1)
  expect(hideMiss(miss.game).up).toEqual([])
  // The next turn hides the miss by itself.
  const next = turn(miss.game, b)
  expect(next.outcome).toBe('first')
  expect(next.game.up).toEqual([b])
  const match = turn(next.game, a)
  expect(match.outcome).toBe('match')
  expect(match.game.matched[a] && match.game.matched[b]).toBe(true)
  expect(match.game.up).toEqual([])
  expect(match.game.turns).toBe(2)
  expect(pairsFound(match.game)).toBe(1)
  expect(turn(match.game, a).error).toBe('That pair is already found.')
  expect(turn(match.game, 16).error).toBe('No such card.')
})

test('finding every pair finishes the game and keeps the fewest turns', async () => {
  let g = newGame(5, { games: 3, finished: 1, bestTurns: 20 })
  for (const [a, b] of pairsOf(g)) {
    g = turn(g, a).game
    g = turn(g, b).game
  }
  expect(g.done).toBe(true)
  expect(g.turns).toBe(8)
  expect(g.stats).toEqual({ games: 3, finished: 2, bestTurns: 8 })
  expect(turn(g, 0).error).toContain('All pairs found')
  // A sloppier game: before each pair, a miss against an unmatched card of another face.
  let worse = newGame(6, g.stats)
  for (const [a, b] of pairsOf(worse)) {
    const wrong = worse.faces.findIndex((f, i) => f !== worse.faces[a] && !worse.matched[i])
    if (wrong >= 0) {
      worse = turn(worse, a).game
      worse = turn(worse, wrong).game
    }
    worse = turn(worse, a).game
    worse = turn(worse, b).game
  }
  expect(worse.done).toBe(true)
  expect(worse.turns > 8).toBe(true)
  expect(worse.stats.bestTurns).toBe(8)
  expect(worse.stats.finished).toBe(3)
})

test('the guard rejects a malformed game', async () => {
  const g = newGame(1, STATS)
  expect(isGame(g)).toBe(true)
  expect(isGame({ ...g, faces: g.faces.slice(1) })).toBe(false)
  expect(isGame({ ...g, up: [0, 1, 2] })).toBe(false)
  expect(isGame({ ...g, matched: g.matched.map(() => 'yes') })).toBe(false)
  expect(isGame(null)).toBe(false)
})

// --- The pane and the commands

function stubs(on, options: { saved?: Map<string, unknown>; toasts?: string[]; placed?: boolean; surfaces?: string[]; unreadable?: boolean } = {}) {
  const saved = options.saved ?? new Map<string, unknown>()
  const clock = mock.clock(on, { now: T0 })
  on('store.get', ($, e) => {
    if (options.unreadable) throw new Error('store offline')
    return { value: saved.get(e.key) }
  })
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
  on('session.surfaces', () => ({ value: options.surfaces ?? ['terminal'] }))
  on('ui.open', () => ({ value: { isPlaced: options.placed ?? true } }))
  on('ui.close', () => ({}))
  return { saved, clock }
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const PANE = { plugin: 'pairs', component: 'Pane', requestId: 'pairs', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'Pairs', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 22 }, view: {} } } as const
const current = (saved: Map<string, unknown>) => saved.get('game') as Game

test('a game is dealt and saved at start, survives /clear, and a pair left up turns down on load', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const g = current(saved)
  expect(isGame(g)).toBe(true)
  expect(g.stats.games).toBe(1)
  saved.set('game', { ...g, up: [0, 1], turns: 1 })
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'card-0', label: 'a' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1' })).toBeDefined()
  await ui.unmount()
})

test('turning cards: a miss shows both then hides after the pause, a pair stays, finishing toasts', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const g = current(saved)
  const pairs = pairsOf(g)
  const [a, b] = pairs[0]
  const other = pairs[1][0]
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  for (let i = 0; i < CARDS; i++) expect(await ui.find({ key: 'card-' + i, label: KEYS[i] })).toBeDefined()
  await ui.press({ key: 'card-' + a })
  expect(await ui.find({ key: 'card-' + a, label: FACES[g.faces[a]] })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Now find its twin.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'card-' + other })
  expect(await ui.find({ type: 'Text', text: 'Not a pair. They turn back in a moment.' })).toBeDefined()
  expect(await ui.find({ key: 'card-' + other, label: FACES[g.faces[other]] })).toBeDefined()
  await clock.advance(899)
  expect(current(saved).up.length).toBe(2)
  await clock.advance(1)
  expect(current(saved).up).toEqual([])
  expect(await ui.find({ key: 'card-' + other, label: KEYS[other] })).toBeDefined()
  await ui.press({ key: 'card-' + a })
  await ui.press({ key: 'card-' + b })
  expect(current(saved).matched[a]).toBe(true)
  expect(await ui.find({ type: 'Text', text: '1 of 8 pairs found. Turn a card.' })).toBeDefined()
  await ui.press({ key: 'card-' + a })
  expect(toasts.pop()).toBe('That pair is already found.')
  for (const [x, y] of pairs.slice(1)) {
    await ui.press({ key: 'card-' + x })
    await ui.press({ key: 'card-' + y })
  }
  expect(current(saved).done).toBe(true)
  expect(toasts.pop()).toBe('All pairs found in 9 turns!')
  expect(await ui.find({ type: 'Text', text: 'All eight pairs in 9 turns, your best. Press r for a new deal.' })).toBeDefined()
  await ui.press({ key: 'card-' + a })
  expect(toasts.pop()).toContain('All pairs found')
  await ui.press({ key: 'new' })
  expect(current(saved).turns).toBe(0)
  expect(current(saved).stats.games).toBe(2)
  await ui.unmount()
})

test('a new turn before the pause hides the miss and cancels the timer', async ($, on) => {
  const { saved, clock } = stubs(on)
  await start($)
  const g = current(saved)
  const pairs = pairsOf(g)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'card-' + pairs[0][0] })
  await ui.press({ key: 'card-' + pairs[1][0] })
  await ui.press({ key: 'card-' + pairs[2][0] })
  expect(current(saved).up).toEqual([pairs[2][0]])
  await clock.advance(2000)
  expect(current(saved).up).toEqual([pairs[2][0]])
  await ui.unmount()
})

test('/pairs new and stats, and a summary where nothing draws', async ($, on) => {
  const { saved } = stubs(on, { surfaces: [] })
  await start($)
  expect((await $.command.run({ command: 'pairs', args: '' })).text).toBe('Pairs: 0 of 8 pairs found, 0 turns. /pairs opens the pane.')
  expect((await $.command.run({ command: 'pairs', args: 'new' })).text).toMatch(/^New deal\. Pairs:/)
  expect(current(saved).stats.games).toBe(2)
  expect((await $.command.run({ command: 'pairs', args: 'stats' })).text).toBe('Games 2 · finished 0 · fewest turns —')
  expect((await $.command.run({ command: 'pairs', args: 'what' })).text).toMatch(/^Usage/)
})

test('/pairs prints a summary when a surface exists but the pane cannot be placed', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: 'pairs', args: '' })).text).toContain('/pairs opens the pane')
})

test('a store that cannot be read never wipes the record', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', newGame(2, { games: 9, finished: 4, bestTurns: 11 }))
  stubs(on, { saved, unreadable: true })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'card-0' })
  expect(current(saved).stats.games).toBe(9)
  expect(current(saved).up).toEqual([])
  await ui.unmount()
})

test('a corrupt saved game is replaced, and a narrow pane keeps every control', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', { faces: 'nope' })
  stubs(on, { saved })
  await start($)
  expect(isGame(saved.get('game'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 36 } })
  for (const key of ['card-0', 'card-15', 'new', 'help']) expect(await ui.find({ key })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await ui.unmount()
})
