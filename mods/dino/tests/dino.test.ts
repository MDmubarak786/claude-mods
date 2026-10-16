import { expect, mock, test } from 'claude-code/testing'
import { ARC, COLS, DINO_COL, MAX_GAP, MIN_GAP, START_SPEED, gapAfter, isGame, jump, newGame, nextObstacle, speedFor, tick } from '../hooks/game'
import type { Game } from '../types'

const T0 = 1_700_000_000_000
const STATS = { games: 0, best: 0 }

// --- Rules

test('a new game waits on the ground, with the first cactus due within the spacing range', async () => {
  const g = newGame(1, STATS)
  expect(g.paused).toBe(true)
  expect(g.height).toBe(0)
  expect(g.jump).toBe(-1)
  expect(g.obstacles).toEqual([])
  expect(g.nextIn >= MIN_GAP && g.nextIn <= MAX_GAP).toBe(true)
  expect(g.nextIn).toBe(gapAfter(1, 0))
  expect(gapAfter(1, 0) !== gapAfter(2, 0) || gapAfter(1, 0) !== gapAfter(3, 0)).toBe(true)
  expect(tick(g)).toBe(g)
})

test('a jump starts the game and follows the arc back to the ground; a press in the air is ignored', async () => {
  let g = jump(newGame(1, STATS))
  expect(g.paused).toBe(false)
  expect(g.jump).toBe(0)
  expect(g.height).toBe(ARC[0])
  const mid = jump(g)
  expect(mid).toBe(g)
  for (let i = 1; i < ARC.length; i++) {
    g = tick(g)
    expect(g.height).toBe(ARC[i])
  }
  g = tick(g)
  expect(g.jump).toBe(-1)
  expect(g.height).toBe(0)
  expect(g.score).toBe(ARC.length)
  // A press while paused in the air only resumes.
  const paused = { ...jump(newGame(1, STATS)), paused: true }
  expect(jump(paused).paused).toBe(false)
  expect(jump(paused).jump).toBe(0)
})

test('cacti walk left, spawn on schedule, and leave the lane; the score and speed climb', async () => {
  let g = { ...newGame(1, STATS), paused: false, nextIn: 1 }
  g = tick(g)
  expect(g.obstacles).toEqual([{ col: COLS - 1, tall: g.obstacles[0].tall }])
  expect(g.spawned).toBe(1)
  expect(g.nextIn).toBe(gapAfter(1, 1))
  g = tick(g)
  expect(g.obstacles[0].col).toBe(COLS - 2)
  expect(g.score).toBe(2)
  // A cactus at the left edge is gone next tick.
  let edge = { ...newGame(1, STATS), paused: false, nextIn: 99, obstacles: [{ col: 0, tall: false }] }
  expect(tick(edge).obstacles).toEqual([])
  expect(speedFor(0)).toBe(START_SPEED)
  expect(speedFor(99)).toBe(START_SPEED)
  expect(speedFor(100)).toBe(START_SPEED - 10)
  expect(speedFor(5000)).toBe(60)
  let fast = { ...newGame(1, STATS), paused: false, nextIn: 99, score: 99 }
  expect(tick(fast).speed).toBe(START_SPEED - 10)
})

test('a tall cactus clears only at the top of the arc, a small one almost anywhere, and landing on one ends the run', async () => {
  const run = (ahead: number, tall: boolean) => {
    let g = { ...jump(newGame(7, STATS)), obstacles: [{ col: DINO_COL + ahead, tall }], nextIn: 99 }
    for (let i = 0; i < ahead; i++) g = tick(g)
    return g
  }
  // Jumping with the cactus 1 to 3 columns ahead clears a tall one; 4 ahead lands at height 1 on it.
  for (const ahead of [1, 2, 3]) expect(run(ahead, true).over).toBe(false)
  expect(run(4, true).over).toBe(true)
  expect(run(4, true).height).toBe(1)
  // A small one is cleared from 1 to 4 ahead; 5 ahead means landing on it.
  for (const ahead of [1, 2, 3, 4]) expect(run(ahead, false).over).toBe(false)
  expect(run(5, false).over).toBe(true)
  // Standing still, the first cactus ends the run when it arrives.
  let still = { ...newGame(3, STATS), paused: false }
  const arrival = still.nextIn + (COLS - 1 - DINO_COL)
  for (let i = 0; i < arrival - 1; i++) still = tick(still)
  expect(still.over).toBe(false)
  still = tick(still)
  expect(still.over).toBe(true)
  expect(still.paused).toBe(true)
  expect(still.score).toBe(arrival - 1)
  expect(tick(still)).toBe(still)
  expect(jump(still)).toBe(still)
})

test('every cactus can be cleared: a player who jumps at the last moment never dies', async () => {
  for (let seed = 1; seed <= 20; seed++) {
    let g = jump(newGame(seed, STATS))
    for (let i = 0; i < 3000; i++) {
      const o = nextObstacle(g)
      if (g.jump < 0 && o && o.col === DINO_COL + 1) g = jump(g)
      g = tick(g)
      expect(g.over).toBe(false)
    }
    expect(g.spawned > 200).toBe(true)
    expect(g.stats.best).toBe(3000 + ARC.length - ARC.length)
  }
})

test('the record is kept and the guard rejects a malformed game', async () => {
  let g = { ...newGame(1, { games: 2, best: 3 }), paused: false, nextIn: 99 }
  for (let i = 0; i < 3; i++) g = tick(g)
  expect(g.record).toBe(false)
  g = tick(g)
  expect(g.record).toBe(true)
  expect(g.stats.best).toBe(4)
  const fresh = newGame(1, STATS)
  expect(isGame(fresh)).toBe(true)
  expect(isGame({ ...fresh, height: 3 })).toBe(false)
  expect(isGame({ ...fresh, jump: ARC.length })).toBe(false)
  expect(isGame({ ...fresh, obstacles: [{ col: COLS, tall: false }] })).toBe(false)
  expect(isGame({ ...fresh, obstacles: [{ col: 3 }] })).toBe(false)
  expect(isGame({ ...fresh, stats: { games: 1 } })).toBe(false)
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
const PANE = { plugin: 'dino', component: 'Pane', requestId: 'dino', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'Dino', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 18 }, view: {} } } as const
const current = (saved: Map<string, unknown>) => saved.get('game') as Game

test('a game is created and saved at start, and loads paused with its speed set by its score after /clear', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const g = current(saved)
  expect(isGame(g)).toBe(true)
  expect(g.stats.games).toBe(1)
  saved.set('game', { ...g, paused: false, score: 250, jump: 1, height: 2, speed: 500 })
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '00250' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Paused. Press p, or w, to go on.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /· 100 ms$/ })).toBeDefined()
  await ui.unmount()
})

test('w jumps and starts the clock, the lane scrolls every speed ms, and p pauses', async ($, on) => {
  const { saved, clock } = stubs(on)
  await start($)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  for (const key of ['w', 'pause', 'new', 'help']) expect(await ui.find({ key })).toBeDefined()
  await ui.press({ key: 'w' })
  const jumped = current(saved)
  expect(jumped.paused).toBe(false)
  expect(jumped.jump).toBe(0)
  expect(jumped.height).toBe(ARC[0])
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await clock.advance(START_SPEED - 1)
  expect(await ui.find({ type: 'Text', text: '00000' })).toBeDefined()
  await clock.advance(1)
  // A plain step is drawn but not saved.
  expect(current(saved).score).toBe(0)
  expect(await ui.find({ type: 'Text', text: '00001' })).toBeDefined()
  await clock.advance(START_SPEED * 2)
  expect(await ui.find({ type: 'Text', text: '00003' })).toBeDefined()
  await ui.press({ key: 'pause' })
  expect(current(saved).paused).toBe(true)
  expect(current(saved).score).toBe(3)
  await clock.advance(1000)
  expect(await ui.find({ type: 'Text', text: '00003' })).toBeDefined()
  expect(await ui.find({ key: 'pause', label: 'Resume' })).toBeDefined()
  await ui.press({ key: 'w' })
  expect(current(saved).paused).toBe(false)
  await ui.unmount()
})

test('crossing 100 points re-arms the clock at the faster interval', async ($, on) => {
  const { saved, clock } = stubs(on)
  await start($)
  saved.set('game', { ...current(saved), score: 99, nextIn: 99, obstacles: [] })
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'pause' })
  await clock.advance(START_SPEED)
  expect(await ui.find({ type: 'Text', text: '00100' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /· 110 ms$/ })).toBeDefined()
  await clock.advance(109)
  expect(await ui.find({ type: 'Text', text: '00100' })).toBeDefined()
  await clock.advance(1)
  expect(await ui.find({ type: 'Text', text: '00101' })).toBeDefined()
  await ui.unmount()
})

test('a crash ends the game with a toast and stops the clock; n starts over and counts a game', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  saved.set('game', { ...current(saved), obstacles: [{ col: DINO_COL + 1, tall: false }], nextIn: 99 })
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'pause' })
  await clock.advance(START_SPEED)
  const g = current(saved)
  expect(g.over).toBe(true)
  expect(toasts.pop()).toBe('Game over: 0. New game: n')
  expect(await ui.find({ type: 'Text', text: 'Game over at 0. Press n for a new game.' })).toBeDefined()
  await ui.press({ key: 'w' })
  expect(toasts.pop()).toContain('over')
  await clock.advance(1000)
  expect(current(saved).score).toBe(0)
  await ui.press({ key: 'new' })
  const fresh = current(saved)
  expect(fresh.over).toBe(false)
  expect(fresh.obstacles).toEqual([])
  expect(fresh.stats.games).toBe(2)
  await ui.unmount()
})

test('/dino new and stats, and a summary where nothing draws', async ($, on) => {
  const { saved } = stubs(on, { surfaces: [] })
  await start($)
  expect((await $.command.run({ command: 'dino', args: '' })).text).toBe('Dino: score 0, best 0, 120 ms a step. Paused. /dino opens the pane.')
  expect((await $.command.run({ command: 'dino', args: 'new' })).text).toMatch(/^New game\. Dino: score 0, best 0, 120 ms a step\./)
  expect(current(saved).stats.games).toBe(2)
  expect((await $.command.run({ command: 'dino', args: 'stats' })).text).toBe('Games 2 · best 0')
  expect((await $.command.run({ command: 'dino', args: 'what' })).text).toMatch(/^Usage/)
})

test('/dino prints a summary when a surface exists but the pane cannot be placed', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: 'dino', args: '' })).text).toContain('/dino opens the pane')
})

test('a store that cannot be read never wipes the record', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', newGame(2, { games: 9, best: 400 }))
  const { clock } = stubs(on, { saved, unreadable: true })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'w' })
  await clock.advance(START_SPEED * 3)
  expect(current(saved).stats.games).toBe(9)
  expect(current(saved).score).toBe(0)
  await ui.unmount()
})

test('a corrupt saved game is replaced, and a narrow pane keeps every control', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', { obstacles: 'nope' })
  stubs(on, { saved })
  await start($)
  expect(isGame(saved.get('game'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 44 } })
  for (const key of ['w', 'pause', 'new', 'help']) expect(await ui.find({ key })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await ui.unmount()
})
