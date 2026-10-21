import { expect, mock, test } from 'claude-code/testing'
import { DIRS, GOAL, MAX_UNDO, SIZE, at, canMove, isGame, migrate, move, newGame, slide, slideLine, spawn, undo } from '../hooks/game'
import type { Game } from '../types'

const T0 = 1_700_000_000_000
const STATS = { games: 0, best: 0, highest: 0 }

// --- Rules

test('a line slides toward the edge and merges each pair once', async () => {
  expect(slideLine([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], gained: 8 })
  expect(slideLine([2, 2, 4, 0])).toEqual({ line: [4, 4, 0, 0], gained: 4 })
  expect(slideLine([4, 4, 2, 2])).toEqual({ line: [8, 4, 0, 0], gained: 12 })
  expect(slideLine([2, 0, 0, 2])).toEqual({ line: [4, 0, 0, 0], gained: 4 })
  expect(slideLine([2, 4, 2, 4])).toEqual({ line: [2, 4, 2, 4], gained: 0 })
  expect(slideLine([0, 0, 0, 0])).toEqual({ line: [0, 0, 0, 0], gained: 0 })
})

test('each direction slides its own way, and a slide that changes nothing says so', async () => {
  const cells = new Array(SIZE * SIZE).fill(0)
  cells[at(1, 1)] = 2
  cells[at(1, 2)] = 2
  const left = slide(cells, 'left')
  expect(left.cells[at(1, 0)]).toBe(4)
  expect(left.gained).toBe(4)
  expect(left.moved).toBe(true)
  expect(slide(cells, 'right').cells[at(1, 3)]).toBe(4)
  const up = slide(cells, 'up')
  expect(up.cells[at(0, 1)]).toBe(2)
  expect(up.cells[at(0, 2)]).toBe(2)
  expect(up.gained).toBe(0)
  const down = slide(cells, 'down')
  expect(down.cells[at(3, 1)]).toBe(2)
  expect(slide(up.cells, 'up').moved).toBe(false)
})

test('a spawn is a 2 or a 4 on an empty cell, repeatable from the seed, and skipped on a full board', async () => {
  const empty = new Array(SIZE * SIZE).fill(0)
  const a = spawn(empty, 7, 0)
  expect(a.filter(Boolean).length).toBe(1)
  expect([2, 4]).toContain(a.find(Boolean))
  expect(spawn(empty, 7, 0)).toEqual(a)
  expect(spawn(empty, 7, 1)).not.toEqual(a)
  const fours = Array.from({ length: 200 }, (_, n) => spawn(empty, 11, n).find(Boolean)).filter((v) => v === 4).length
  expect(fours > 5 && fours < 60).toBe(true)
  const full = new Array(SIZE * SIZE).fill(2)
  expect(spawn(full, 7, 0)).toEqual(full)
})

test('a new game has two tiles; a move slides, scores, spawns, and remembers two undos', async () => {
  const g = newGame(3, STATS)
  expect(g.cells.filter(Boolean).length).toBe(2)
  expect(g.score).toBe(0)
  let moved: Game | null = null
  for (const d of DIRS) {
    const r = move(g, d)
    if (!r.error) {
      moved = r.game
      break
    }
  }
  expect(moved).not.toBeNull()
  const m = moved as Game
  expect(m.moves).toBe(1)
  // Two tiles, maybe merged into one, plus the spawn.
  const count = m.cells.filter(Boolean).length
  expect(count === 2 || count === 3).toBe(true)
  expect(m.prev.length).toBe(1)
  expect(m.prev[0].cells).toEqual(g.cells)
  const back = undo(m).game
  expect(back.cells).toEqual(g.cells)
  expect(back.moves).toBe(0)
  expect(back.prev).toEqual([])
  // Undoing the move that made 2048 takes the win back too.
  const won = move({ ...g, cells: [1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 'left').game
  expect(won.won).toBe(true)
  expect(undo(won).game.won).toBe(false)
  expect(undo(back).error).toBe('Nothing to take back.')
  // Three moves keep only the last two to take back, in order; the third undo is refused.
  expect(MAX_UNDO).toBe(2)
  const a = move({ ...g, cells: [2, 2, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 'left').game
  const b = move(a, 'down').game
  const c = move(b, 'right').game
  expect(c.prev.length).toBe(2)
  expect(c.prev.map((p) => p.moves)).toEqual([1, 2])
  const c1 = undo(c).game
  expect(c1.cells).toEqual(b.cells)
  expect(c1.score).toBe(b.score)
  expect(c1.moves).toBe(2)
  const c2 = undo(c1).game
  expect(c2.cells).toEqual(a.cells)
  expect(c2.moves).toBe(1)
  expect(c2.prev).toEqual([])
  expect(undo(c2).error).toBe('Nothing to take back.')
})

test('a game saved by 0.1.x, with one undo or none, is brought up to the list shape', async () => {
  const g = newGame(5, { games: 4, best: 900, highest: 128 })
  const snap = { cells: g.cells, score: 0, moves: 0, won: false }
  const legacyNone = { ...g, prev: null }
  const legacyOne = { ...g, prev: snap }
  expect(isGame(legacyNone)).toBe(false)
  expect(isGame(legacyOne)).toBe(false)
  expect(migrate(legacyNone)).toEqual({ ...g, prev: [] })
  expect(migrate(legacyOne)).toEqual({ ...g, prev: [snap] })
  expect(isGame(migrate(legacyNone))).toBe(true)
  expect(isGame(migrate(legacyOne))).toBe(true)
  // The current shape, junk, and nothing all pass through untouched.
  expect(migrate(g)).toBe(g)
  expect(migrate({ cells: 'nope' })).toEqual({ cells: 'nope' })
  expect(migrate(undefined)).toBeUndefined()
  expect(migrate(null)).toBeNull()
})

test('a move that changes nothing is refused and spawns nothing', async () => {
  let g = newGame(3, STATS)
  g = { ...g, cells: [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
  expect(move(g, 'up').error).toBe('Nothing slides that way.')
  expect(move(g, 'left').error).toBe('Nothing slides that way.')
  expect(move(g, 'down').error).toBeUndefined()
})

test('the game is over when no slide changes the board, and reaching 2048 marks a win without stopping play', async () => {
  const stuck = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]
  expect(canMove(stuck)).toBe(false)
  // A checkerboard of 8s and 16s over a bottom row whose two 32s merge when slid
  // right, leaving one gap in the corner between an 8 and a 64: whatever spawns
  // there, nothing can merge.
  const g = { ...newGame(3, STATS), cells: [8, 16, 8, 16, 16, 8, 16, 8, 8, 16, 8, 16, 32, 32, 16, 8] }
  const end = move(g, 'right')
  expect(end.error).toBeUndefined()
  expect(move(end.game, 'left').error).toContain('No moves left')
  expect(end.game.over).toBe(true)
  const near = { ...newGame(3, STATS), cells: [1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
  const won = move(near, 'left').game
  expect(won.won).toBe(true)
  expect(won.score).toBe(GOAL)
  expect(won.over).toBe(false)
  expect(won.stats.highest).toBe(GOAL)
  expect(won.stats.best).toBe(GOAL)
})

test('the guard rejects a malformed game', async () => {
  const g = newGame(1, STATS)
  expect(isGame(g)).toBe(true)
  expect(isGame({ ...g, cells: g.cells.slice(1) })).toBe(false)
  expect(isGame({ ...g, prev: [{ cells: 'x', score: 0, moves: 0, won: false }] })).toBe(false)
  expect(isGame({ ...g, prev: [{ cells: g.cells, score: 0 }] })).toBe(false)
  expect(isGame({ ...g, prev: { cells: g.cells, score: 0, moves: 0, won: false } })).toBe(false)
  expect(isGame({ ...g, stats: { games: 1 } })).toBe(false)
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
const PANE = { plugin: 'game-2048', component: 'Pane', requestId: '2048', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: '2048', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 22 }, view: {} } } as const
const current = (saved: Map<string, unknown>) => saved.get('game') as Game

test('a game is created and saved at start, and survives /clear', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const g = current(saved)
  expect(isGame(g)).toBe(true)
  expect(g.stats.games).toBe(1)
  saved.set('game', { ...g, cells: [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 0, 0, 0, 0, 0], score: 99 })
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '2048' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1024' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '99' })).toBeDefined()
  await ui.unmount()
})

test('the keys slide the board, a slide that changes nothing toasts, undo takes two back, and the how-to hides after the first move', async ($, on) => {
  const toasts: string[] = []
  const { saved } = stubs(on, { toasts })
  await start($)
  saved.set('game', { ...current(saved), cells: [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], moves: 0 })
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  for (const key of ['w', 'a', 's', 'd', 'new', 'undo', 'help']) expect(await ui.find({ key })).toBeDefined()
  await ui.press({ key: 'w' })
  expect(toasts.pop()).toBe('Nothing slides that way.')
  await ui.press({ key: 'a' })
  let g = current(saved)
  expect(g.cells[0]).toBe(4)
  expect(g.score).toBe(4)
  expect(g.moves).toBe(1)
  expect(g.cells.filter(Boolean).length).toBe(2)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Score 4 · a new best' })).toBeDefined()
  expect((await ui.find({ key: 'undo' }))?.text).toBe('Undo (1)')
  await ui.press({ key: 'd' })
  g = current(saved)
  expect(g.moves).toBe(2)
  expect(g.cells[3]).toBe(4)
  expect((await ui.find({ key: 'undo' }))?.text).toBe('Undo (2)')
  await ui.press({ key: 'undo' })
  g = current(saved)
  expect(g.moves).toBe(1)
  expect(g.cells[0]).toBe(4)
  expect(g.score).toBe(4)
  expect((await ui.find({ key: 'undo' }))?.text).toBe('Undo (1)')
  await ui.press({ key: 'undo' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  g = current(saved)
  expect(g.cells.slice(0, 2)).toEqual([2, 2])
  expect(g.score).toBe(0)
  expect(g.moves).toBe(0)
  expect((await ui.find({ key: 'undo' }))?.text).toBe('Undo')
  await ui.press({ key: 'undo' })
  expect(toasts.pop()).toBe('Nothing to take back.')
  await ui.unmount()
})

test('a game saved by 0.1.x loads with its record and its one undo intact', async ($, on) => {
  const saved = new Map<string, unknown>()
  const g = newGame(2, { games: 9, best: 5000, highest: 512 })
  saved.set('game', { ...g, cells: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 4, moves: 1, prev: { cells: [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 0, moves: 0, won: false } })
  stubs(on, { saved })
  await start($)
  let now = current(saved)
  expect(isGame(now)).toBe(true)
  expect(now.stats).toEqual({ games: 9, best: 5000, highest: 512 })
  expect(now.prev.length).toBe(1)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'undo' })
  now = current(saved)
  expect(now.cells.slice(0, 2)).toEqual([2, 2])
  expect(now.score).toBe(0)
  expect(now.prev).toEqual([])
  await ui.unmount()
})

test('game over and the win are announced; n starts over and counts a game', async ($, on) => {
  const toasts: string[] = []
  const { saved } = stubs(on, { toasts })
  await start($)
  saved.set('game', { ...current(saved), cells: [8, 16, 8, 16, 16, 8, 16, 8, 8, 16, 8, 16, 32, 32, 16, 8], moves: 5 })
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'd' })
  expect(current(saved).over).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^No moves left\. Score \d+\. Press n for a new game\.$/ })).toBeDefined()
  await ui.press({ key: 'a' })
  expect(toasts.pop()).toContain('No moves left')
  await ui.press({ key: 'new' })
  const g = current(saved)
  expect(g.over).toBe(false)
  expect(g.moves).toBe(0)
  expect(g.stats.games).toBe(2)
  saved.set('game', { ...g, cells: [1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
  await $.classic.SessionStart({ source: 'resume' })
  await ui.press({ key: 'a' })
  expect(current(saved).won).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'You made 2048! Keep going for a higher tile, or n for a new game.' })).toBeDefined()
  await ui.unmount()
})

test('/2048 new and stats, and a summary where nothing draws', async ($, on) => {
  const { saved } = stubs(on, { surfaces: [] })
  await start($)
  expect((await $.command.run({ command: '2048', args: '' })).text).toMatch(/^2048: .*\. Score 0, best 0\. In play\. \/2048 opens the pane\.$/)
  expect((await $.command.run({ command: '2048', args: 'new' })).text).toMatch(/^New game\. 2048:/)
  expect(current(saved).stats.games).toBe(2)
  expect((await $.command.run({ command: '2048', args: 'stats' })).text).toBe('Games 2 · best score 0 · highest tile 0')
  expect((await $.command.run({ command: '2048', args: 'what' })).text).toMatch(/^Usage/)
})

test('/2048 prints a summary when a surface exists but the pane cannot be placed', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: '2048', args: '' })).text).toContain('/2048 opens the pane')
})

test('a store that cannot be read never wipes the record', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', newGame(2, { games: 9, best: 5000, highest: 512 }))
  stubs(on, { saved, unreadable: true })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'a' })
  expect(current(saved).stats.games).toBe(9)
  expect(current(saved).moves).toBe(0)
  await ui.unmount()
})

test('a corrupt saved game is replaced, and a narrow pane keeps every control', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', { cells: 'nope' })
  stubs(on, { saved })
  await start($)
  expect(isGame(saved.get('game'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 36 } })
  for (const key of ['w', 'a', 's', 'd', 'new', 'undo', 'help']) expect(await ui.find({ key })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await ui.unmount()
})
