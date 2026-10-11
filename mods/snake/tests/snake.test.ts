import { expect, mock, test } from 'claude-code/testing'
import { COLS, ROWS, at, clampSpeed, isGame, newGame, opposite, placeFood, steer, tick } from '../hooks/game'
import type { Game } from '../types'

const T0 = 1_700_000_000_000
const STATS = { games: 0, best: 0 }

// --- Rules

test('a new game is a three-long snake in the middle, paused, heading right, with food on a free cell', async () => {
  const g = newGame(1, STATS, 150)
  expect(g.snake).toEqual([at(5, 5), at(5, 4), at(5, 3)])
  expect(g.paused).toBe(true)
  expect(g.dir).toBe('right')
  expect(g.snake.includes(g.food)).toBe(false)
  expect(placeFood(g.snake, 1, 0)).toBe(g.food)
  expect(placeFood(g.snake, 2, 0) !== g.food || placeFood(g.snake, 3, 0) !== g.food).toBe(true)
  expect(placeFood(Array.from({ length: COLS * ROWS }, (_, i) => i), 1, 0)).toBe(-1)
})

test('steering starts the game and a turn applies at the next tick; a reverse is ignored', async () => {
  let g = newGame(1, STATS, 150)
  expect(tick(g)).toBe(g)
  g = steer(g, 'left')
  expect(g.paused).toBe(true)
  g = steer(g, 'up')
  expect(g.paused).toBe(false)
  expect(g.nextDir).toBe('up')
  expect(g.dir).toBe('right')
  g = tick(g)
  expect(g.dir).toBe('up')
  expect(g.snake[0]).toBe(at(4, 5))
  expect(g.snake.length).toBe(3)
  expect(g.ticks).toBe(1)
  expect(opposite('up')).toBe('down')
})

test('eating grows the snake, scores, moves the food, and keeps the best', async () => {
  let g = newGame(1, STATS, 150)
  g = { ...steer(g, 'right'), food: at(5, 6) }
  g = tick(g)
  expect(g.score).toBe(1)
  expect(g.snake.length).toBe(4)
  expect(g.snake[0]).toBe(at(5, 6))
  expect(g.food).not.toBe(at(5, 6))
  expect(g.snake.includes(g.food)).toBe(false)
  expect(g.stats.best).toBe(1)
  expect(g.record).toBe(true)
  // Equalling an old best is not a record.
  let tie = newGame(1, { games: 2, best: 1 }, 150)
  tie = tick({ ...steer(tie, 'right'), food: at(5, 6) })
  expect(tie.score).toBe(1)
  expect(tie.record).toBe(false)
})

test('a wall or the body ends the game', async () => {
  let g = newGame(1, STATS, 150)
  g = { ...steer(g, 'right'), snake: [at(5, COLS - 1), at(5, COLS - 2), at(5, COLS - 3)], food: 0 }
  g = tick(g)
  expect(g.over).toBe(true)
  expect(g.paused).toBe(true)
  expect(tick(g)).toBe(g)
  expect(steer(g, 'up')).toBe(g)
  // A loop: head at (5,5) going up, body wraps around so that (4,5) is the body.
  let loop = newGame(1, STATS, 150)
  loop = { ...loop, snake: [at(5, 5), at(5, 4), at(4, 4), at(4, 5), at(4, 6)], dir: 'left', nextDir: 'up', paused: false, food: 0 }
  expect(tick(loop).over).toBe(true)
  // The tail cell is free this tick: following your own tail is allowed.
  let tail = newGame(1, STATS, 150)
  tail = { ...tail, snake: [at(5, 5), at(5, 4), at(4, 4), at(4, 5)], dir: 'left', nextDir: 'up', paused: false, food: 0 }
  expect(tick(tail).over).toBe(false)
})

test('speed is clamped and the guard rejects a malformed game', async () => {
  expect(clampSpeed(10)).toBe(60)
  expect(clampSpeed(5000)).toBe(500)
  expect(clampSpeed(149.6)).toBe(150)
  const g = newGame(1, STATS, 150)
  expect(isGame(g)).toBe(true)
  expect(isGame({ ...g, snake: [] })).toBe(false)
  expect(isGame({ ...g, dir: 'sideways' })).toBe(false)
  expect(isGame({ ...g, food: 999 })).toBe(false)
  expect(isGame({ ...g, food: -1 })).toBe(true)
  expect(isGame({ ...g, snake: [-1, 0] })).toBe(false)
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
const PANE = { plugin: 'snake', component: 'Pane', requestId: 'snake', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'Snake', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 26 }, view: {} } } as const
const current = (saved: Map<string, unknown>) => saved.get('game') as Game

test('a game is created and saved at start, and loads paused after /clear', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const g = current(saved)
  expect(isGame(g)).toBe(true)
  expect(g.stats.games).toBe(1)
  saved.set('game', { ...g, paused: false, score: 7, ticks: 3, speed: 5 })
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '7' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Paused. Press p, or a direction, to go on.' })).toBeDefined()
  // A stored speed below the range is clamped on load.
  expect(await ui.find({ type: 'Text', text: /· 60 ms$/ })).toBeDefined()
  await ui.unmount()
})

test('a direction key starts the clock, the snake moves every speed ms, eating is saved, and p pauses', async ($, on) => {
  const { saved, clock } = stubs(on)
  await start($)
  const g0 = current(saved)
  // Put the food two cells to the right of the head so the second tick eats it.
  saved.set('game', { ...g0, food: at(5, 7) })
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  for (const key of ['w', 'a', 's', 'd', 'pause', 'new', 'help']) expect(await ui.find({ key })).toBeDefined()
  await ui.press({ key: 'd' })
  expect(current(saved).paused).toBe(false)
  await clock.advance(149)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await clock.advance(1)
  // A plain move is drawn but not saved.
  expect(current(saved).ticks).toBe(0)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await clock.advance(150)
  const ate = current(saved)
  expect(ate.score).toBe(1)
  expect(ate.ticks).toBe(2)
  expect(ate.snake.length).toBe(4)
  expect(await ui.find({ type: 'Text', text: '1' })).toBeDefined()
  await ui.press({ key: 'pause' })
  expect(current(saved).paused).toBe(true)
  const before = current(saved).ticks
  await clock.advance(1000)
  expect(current(saved).ticks).toBe(before)
  expect(await ui.find({ key: 'pause', label: 'Resume' })).toBeDefined()
  await ui.press({ key: 'w' })
  expect(current(saved).paused).toBe(false)
  await clock.advance(150)
  await ui.unmount()
})

test('a crash ends the game with a toast and stops the clock; n starts over and counts a game', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const g0 = current(saved)
  saved.set('game', { ...g0, snake: [at(5, COLS - 2), at(5, COLS - 3), at(5, COLS - 4)], food: 0 })
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'd' })
  await clock.advance(300)
  const g = current(saved)
  expect(g.over).toBe(true)
  expect(toasts.pop()).toMatch(/^Game over: 0\. New game: n$/)
  expect(await ui.find({ type: 'Text', text: 'Game over at 0. Press n for a new game.' })).toBeDefined()
  await ui.press({ key: 'd' })
  expect(toasts.pop()).toContain('over')
  await clock.advance(1000)
  expect(current(saved).ticks).toBe(g.ticks)
  await ui.press({ key: 'new' })
  const fresh = current(saved)
  expect(fresh.over).toBe(false)
  expect(fresh.ticks).toBe(0)
  expect(fresh.stats.games).toBe(2)
  await ui.unmount()
})

test('/snake new, speed and stats, and a summary where nothing draws', async ($, on) => {
  const { saved } = stubs(on, { surfaces: [] })
  await start($)
  expect((await $.command.run({ command: 'snake', args: '' })).text).toBe('Snake: score 0, length 3, best 0, 150 ms a move. Paused. /snake opens the pane.')
  expect((await $.command.run({ command: 'snake', args: 'speed 100' })).text).toBe('A move every 100 ms.')
  expect((await $.command.run({ command: 'snake', args: 'speed 5' })).text).toBe('A move every 60 ms (60 to 500).')
  expect(current(saved).speed).toBe(60)
  expect((await $.command.run({ command: 'snake', args: 'new' })).text).toMatch(/^New game\. Snake: score 0, length 3, best 0, 60 ms a move\./)
  expect(current(saved).stats.games).toBe(2)
  expect((await $.command.run({ command: 'snake', args: 'stats' })).text).toBe('Games 2 · best 0')
  expect((await $.command.run({ command: 'snake', args: 'what' })).text).toMatch(/^Usage/)
})

test('/snake prints a summary when a surface exists but the pane cannot be placed', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: 'snake', args: '' })).text).toContain('/snake opens the pane')
})

test('a store that cannot be read never wipes the record', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', newGame(2, { games: 9, best: 40 }, 150))
  const { clock } = stubs(on, { saved, unreadable: true })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'd' })
  await clock.advance(300)
  expect(current(saved).stats.games).toBe(9)
  expect(current(saved).ticks).toBe(0)
  await ui.unmount()
})

test('a corrupt saved game is replaced, and a narrow pane keeps every control', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', { snake: 'nope' })
  stubs(on, { saved })
  await start($)
  expect(isGame(saved.get('game'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 44 } })
  for (const key of ['w', 'a', 's', 'd', 'pause', 'new', 'help']) expect(await ui.find({ key })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await ui.unmount()
})
