import { expect, mock, test } from 'claude-code/testing'
import { CARDS, FACES, KEYS, elapsed, formatMs, hideMiss, isGame, newGame, pairsFound, pause, shuffle, turn } from '../hooks/game'
import type { Game } from '../types'

const T0 = 1_700_000_000_000
const STATS = { games: 0, finished: 0, bestTurns: 0, bestMs: 0 }

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
  expect(turn(g, a, T0).outcome).toBe('first')
  g = turn(g, a, T0).game
  expect(g.up).toEqual([a])
  expect(turn(g, a, T0).error).toBe('That card is already up.')
  let miss = turn(g, other, T0)
  expect(miss.outcome).toBe('miss')
  expect(miss.game.up).toEqual([a, other])
  expect(miss.game.turns).toBe(1)
  expect(hideMiss(miss.game).up).toEqual([])
  // The next turn hides the miss by itself.
  const next = turn(miss.game, b, T0)
  expect(next.outcome).toBe('first')
  expect(next.game.up).toEqual([b])
  const match = turn(next.game, a, T0)
  expect(match.outcome).toBe('match')
  expect(match.game.matched[a] && match.game.matched[b]).toBe(true)
  expect(match.game.up).toEqual([])
  expect(match.game.turns).toBe(2)
  expect(pairsFound(match.game)).toBe(1)
  expect(turn(match.game, a, T0).error).toBe('That pair is already found.')
  expect(turn(match.game, 16, T0).error).toBe('No such card.')
})

test('finding every pair finishes the game and keeps the fewest turns', async () => {
  let g = newGame(5, { games: 3, finished: 1, bestTurns: 20, bestMs: 90_000 })
  for (const [a, b] of pairsOf(g)) {
    g = turn(g, a, T0).game
    g = turn(g, b, T0).game
  }
  expect(g.done).toBe(true)
  expect(g.turns).toBe(8)
  // Eight instant turns: a millisecond on the clock, still a record against 90 s.
  expect(g.stats).toEqual({ games: 3, finished: 2, bestTurns: 8, bestMs: 1 })
  expect(g.elapsedMs).toBe(1)
  expect(turn(g, 0, T0).error).toContain('All pairs found')
  // A sloppier game: before each pair, a miss against an unmatched card of another face.
  let worse = newGame(6, g.stats)
  for (const [a, b] of pairsOf(worse)) {
    const wrong = worse.faces.findIndex((f, i) => f !== worse.faces[a] && !worse.matched[i])
    if (wrong >= 0) {
      worse = turn(worse, a, T0).game
      worse = turn(worse, wrong, T0).game
    }
    worse = turn(worse, a, T0).game
    worse = turn(worse, b, T0).game
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
  expect(isGame({ ...g, startedAt: 'now' })).toBe(false)
  expect(isGame({ ...g, stats: { games: 0, finished: 0, bestTurns: 0 } })).toBe(false)
  expect(isGame(null)).toBe(false)
})

test('the clock starts at the first card, pauses with the pane, and stops at the last pair', async () => {
  let g = newGame(5, STATS)
  const pairs = pairsOf(g)
  expect(elapsed(g, T0 + 5000)).toBe(0)
  g = turn(g, pairs[0][0], T0).game
  expect(g.startedAt).toBe(T0)
  expect(elapsed(g, T0 + 5000)).toBe(5000)
  g = pause(g, T0 + 8000)
  expect(g.startedAt).toBeNull()
  expect(g.elapsedMs).toBe(8000)
  expect(elapsed(g, T0 + 60_000)).toBe(8000)
  expect(pause(g, T0 + 70_000)).toBe(g)
  // Play resumes; the stretch away is not counted.
  g = turn(g, pairs[0][1], T0 + 100_000).game
  expect(g.startedAt).toBe(T0 + 100_000)
  let t = T0 + 100_000
  for (const [a, b] of pairs.slice(1)) {
    t += 1000
    g = turn(g, a, t).game
    g = turn(g, b, t).game
  }
  expect(g.done).toBe(true)
  expect(g.elapsedMs).toBe(8000 + 7000)
  expect(g.startedAt).toBeNull()
  expect(g.stats.bestMs).toBe(15_000)
  expect(elapsed(g, t + 999_999)).toBe(15_000)
  expect(formatMs(15_000)).toBe('0:15')
  expect(formatMs(754_000)).toBe('12:34')
  // A slower finish keeps the record.
  let slow = newGame(6, g.stats)
  for (const [a, b] of pairsOf(slow)) {
    slow = turn(slow, a, T0).game
    slow = turn(slow, b, T0 + 30_000).game
  }
  expect(slow.stats.bestMs).toBe(15_000)
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
  saved.set('game', { ...g, up: [0, 1], turns: 1, startedAt: T0 - 5000, elapsedMs: 3000 })
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'card-0', label: 'a' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1' })).toBeDefined()
  // The clock waits for the next card after a load: only the saved 3 s shows.
  expect(await ui.find({ type: 'Text', text: 'time 0:03' })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: 'time 0:00' })).toBeDefined()
  await ui.press({ key: 'card-' + a })
  expect(await ui.find({ key: 'card-' + a, label: FACES[g.faces[a]] })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Now find its twin.' })).toBeDefined()
  // The clock runs and the header redraws once a second.
  await clock.advance(2500)
  expect(await ui.find({ type: 'Text', text: 'time 0:02' })).toBeDefined()
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
  const ms = current(saved).elapsedMs
  expect(ms).toBe(2500 + 900)
  expect(toasts.pop()).toBe('All pairs found in 9 turns and ' + formatMs(ms) + '!')
  expect(await ui.find({ type: 'Text', text: 'All eight pairs in 9 turns and ' + formatMs(ms) + ', your best on both. Press r for a new deal.' })).toBeDefined()
  expect(current(saved).stats.bestMs).toBe(ms)
  // Done: the clock stands still.
  await clock.advance(10_000)
  expect(await ui.find({ type: 'Text', text: 'time ' + formatMs(ms) })).toBeDefined()
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
  expect((await $.command.run({ command: 'pairs', args: '' })).text).toBe('Pairs: 0 of 8 pairs found, 0 turns, 0:00. /pairs opens the pane.')
  expect((await $.command.run({ command: 'pairs', args: 'new' })).text).toMatch(/^New deal\. Pairs:/)
  expect(current(saved).stats.games).toBe(2)
  expect((await $.command.run({ command: 'pairs', args: 'stats' })).text).toBe('Games 2 · finished 0 · fewest turns — · fastest —')
  expect((await $.command.run({ command: 'pairs', args: 'what' })).text).toMatch(/^Usage/)
})

test('/pairs prints a summary when a surface exists but the pane cannot be placed', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: 'pairs', args: '' })).text).toContain('/pairs opens the pane')
})

test('a deal saved by 0.1.0, without the clock fields, loads with its record intact', async ($, on) => {
  const saved = new Map<string, unknown>()
  const old = newGame(3, { games: 4, finished: 2, bestTurns: 10 } as any) as any
  delete old.elapsedMs
  delete old.startedAt
  delete old.stats.bestMs
  saved.set('game', old)
  stubs(on, { saved })
  await start($)
  const g = current(saved)
  expect(isGame(g)).toBe(true)
  expect(g.stats).toEqual({ games: 4, finished: 2, bestTurns: 10, bestMs: 0 })
  expect(g.elapsedMs).toBe(0)
  expect(g.startedAt).toBeNull()
  expect(g.faces).toEqual(old.faces)
})

test('/clear mid-game stops the clock redraw and the next card restarts it', async ($, on) => {
  const { saved, clock } = stubs(on)
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'card-0' })
  await clock.advance(1500)
  expect(await ui.find({ type: 'Text', text: 'time 0:01' })).toBeDefined()
  await $.classic.SessionStart({ source: 'clear' })
  await clock.advance(5000)
  // A restart drops the stretch that was running: the clock waits at 0:00 for the next card.
  expect(await ui.find({ type: 'Text', text: 'time 0:00' })).toBeDefined()
  await ui.press({ key: 'card-1' })
  expect(current(saved).startedAt).toBe(T0 + 6500)
  await clock.advance(2000)
  expect(await ui.find({ type: 'Text', text: 'time 0:02' })).toBeDefined()
  await ui.unmount()
})

test('a store that cannot be read never wipes the record', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', newGame(2, { games: 9, finished: 4, bestTurns: 11, bestMs: 50_000 }))
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
