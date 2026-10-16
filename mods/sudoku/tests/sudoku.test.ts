import { expect, mock, test } from 'claude-code/testing'
import { CELLS, GIVENS, LEVELS, MAX_UNDO, at, conflicts, countSolutions, elapsed, filled, formatMs, hint, isGame, isLevel, isSolved, moveCursor, newGame, pause, setCell, solve, undo } from '../hooks/game'
import type { Game } from '../types'

const T0 = 1_700_000_000_000
const STATS = { games: 0, solved: 0, bestMs: { easy: 0, normal: 0, hard: 0 } }

// --- The generator and the solver

test('every level deals the right number of givens, taken from a valid grid, with exactly one solution', async () => {
  for (const level of LEVELS) {
    const g = newGame(1, STATS, level)
    expect(filled(g.givens)).toBe(GIVENS[level])
    expect(countSolutions(g.givens, 2)).toBe(1)
    expect(isSolved(g.solution)).toBe(true)
    expect(g.givens.every((v, i) => !v || v === g.solution[i])).toBe(true)
    expect(g.cells).toEqual(g.givens)
    expect(g.givens[g.cursor]).toBe(0)
    expect(g.level).toBe(level)
    expect(g.startedAt).toBeNull()
  }
  // The same seed deals the same puzzle; another seed deals another.
  expect(newGame(5, STATS, 'normal').givens).toEqual(newGame(5, STATS, 'normal').givens)
  expect(newGame(5, STATS, 'normal').givens).not.toEqual(newGame(6, STATS, 'normal').givens)
})

test('the solver counts up to the limit, finds the one solution, and rejects a broken grid', async () => {
  expect(countSolutions(new Array(CELLS).fill(0), 2)).toBe(2)
  const broken = new Array(CELLS).fill(0)
  broken[0] = 1
  broken[1] = 1
  expect(countSolutions(broken, 2)).toBe(0)
  expect(solve(broken)).toBeNull()
  const g = newGame(3, STATS, 'hard')
  expect(solve(g.givens)).toEqual(g.solution)
})

// --- Entries, clashes, undo, hints, solving

test('an entry fills a cell and starts the clock; a given is refused; a repeat clashes; 0 clears; undo takes it back', async () => {
  const g = newGame(1, STATS, 'easy')
  const givenAt = g.givens.findIndex((v) => v > 0)
  expect(setCell(g, givenAt, 5, T0).error).toBe('That number is part of the puzzle.')
  expect(setCell(g, 99, 5, T0).error).toBe('Not a cell or a digit.')
  expect(setCell(g, g.cursor, 12, T0).error).toBe('Not a cell or a digit.')
  const i = g.cursor
  // A digit already in the row clashes with the cell that holds it.
  const rowMate = g.givens.findIndex((v, j) => v > 0 && Math.floor(j / 9) === Math.floor(i / 9))
  const clashValue = g.givens[rowMate]
  let a = setCell(g, i, clashValue, T0).game
  expect(a.cells[i]).toBe(clashValue)
  expect(a.moves).toEqual([{ i, from: 0 }])
  expect(a.startedAt).toBe(T0)
  expect(a.cursor).toBe(i)
  // The new cell and its row mate clash, and so does any other given of that
  // digit in the cell's column or box; nothing else does.
  const clashing = conflicts(a.cells)
  expect(clashing).toContain(i)
  expect(clashing).toContain(rowMate)
  expect(clashing.every((j) => a.cells[j] === clashValue)).toBe(true)
  expect(clashing.every((j) => j === i || Math.floor(j / 9) === Math.floor(i / 9) || j % 9 === i % 9 || (Math.floor(j / 27) === Math.floor(i / 27) && Math.floor((j % 9) / 3) === Math.floor((i % 9) / 3)))).toBe(true)
  expect(conflicts(g.givens)).toEqual([])
  // Writing the same value again changes nothing and records no move.
  expect(setCell(a, i, clashValue, T0 + 1).game).toBe(a)
  // 0 clears, and the clock keeps its start.
  a = setCell(a, i, 0, T0 + 500).game
  expect(a.cells[i]).toBe(0)
  expect(a.moves.length).toBe(2)
  expect(a.startedAt).toBe(T0)
  expect(elapsed(a, T0 + 2500)).toBe(2500)
  // Undo restores the clash, then the blank, then has nothing left.
  let u = undo(a).game
  expect(u.cells[i]).toBe(clashValue)
  expect(u.cursor).toBe(i)
  u = undo(u).game
  expect(u.cells[i]).toBe(0)
  expect(u.moves).toEqual([])
  expect(undo(u).error).toBe('Nothing to undo.')
  // The undo list is capped.
  const long = { ...g, moves: Array.from({ length: MAX_UNDO }, () => ({ i, from: 0 })) }
  expect(setCell(long, i, 1, T0).game.moves.length).toBe(MAX_UNDO)
})

test('filling the last cell solves the puzzle, stops the clock, and keeps the fastest time per level', async () => {
  const g = newGame(2, STATS, 'normal')
  const i = g.cursor
  const cells = g.solution.slice()
  cells[i] = 0
  const nearly: Game = { ...g, cells, startedAt: T0, elapsedMs: 60_000 }
  expect(isSolved(cells)).toBe(false)
  const wrong = setCell(nearly, i, g.solution[i] === 9 ? 1 : 9, T0 + 1000).game
  expect(wrong.done).toBe(false)
  expect(conflicts(wrong.cells).length > 0).toBe(true)
  const done = setCell(nearly, i, g.solution[i], T0 + 30_000).game
  expect(done.done).toBe(true)
  expect(done.startedAt).toBeNull()
  expect(done.elapsedMs).toBe(90_000)
  expect(done.stats.solved).toBe(1)
  expect(done.stats.bestMs.normal).toBe(90_000)
  expect(done.stats.bestMs.easy).toBe(0)
  expect(elapsed(done, T0 + 999_999)).toBe(90_000)
  expect(setCell(done, i, 0, T0).error).toContain('solved')
  expect(undo(done).error).toContain('solved')
  expect(hint(done, T0).error).toContain('solved')
  // A slower solve later keeps the record; a faster one replaces it.
  const again = { ...nearly, stats: done.stats, elapsedMs: 120_000 }
  expect(setCell(again, i, g.solution[i], T0).game.stats.bestMs.normal).toBe(90_000)
  const quick = { ...nearly, stats: done.stats, elapsedMs: 5_000 }
  expect(setCell(quick, i, g.solution[i], T0).game.stats.bestMs.normal).toBe(5_000)
})

test('a hint fills the cursor cell from the solution and is counted; a given or a right cell gets none', async () => {
  const g = newGame(4, STATS, 'hard')
  const i = g.cursor
  const h = hint(g, T0).game
  expect(h.cells[i]).toBe(g.solution[i])
  expect(h.hints).toBe(1)
  expect(h.moves).toEqual([{ i, from: 0 }])
  expect(h.startedAt).toBe(T0)
  expect(hint(h, T0).error).toBe('That cell is already right.')
  const onGiven = { ...g, cursor: g.givens.findIndex((v) => v > 0) }
  expect(hint(onGiven, T0).error).toBe('That number is part of the puzzle.')
  // Undo takes a hint back too, though the count stays.
  const back = undo(h).game
  expect(back.cells[i]).toBe(0)
  expect(back.hints).toBe(1)
})

test('the cursor wraps at the edges, the clock pauses and formats, and the guard rejects a malformed game', async () => {
  const g = { ...newGame(1, STATS, 'easy'), cursor: at(0, 0) }
  expect(moveCursor(g, 'up').cursor).toBe(at(8, 0))
  expect(moveCursor(g, 'left').cursor).toBe(at(0, 8))
  expect(moveCursor(g, 'down').cursor).toBe(at(1, 0))
  expect(moveCursor(g, 'right').cursor).toBe(at(0, 1))
  expect(moveCursor({ ...g, cursor: at(8, 8) }, 'down').cursor).toBe(at(0, 8))
  const running = { ...g, startedAt: T0, elapsedMs: 1000 }
  expect(elapsed(running, T0 + 4000)).toBe(5000)
  const paused = pause(running, T0 + 4000)
  expect(paused.startedAt).toBeNull()
  expect(paused.elapsedMs).toBe(5000)
  expect(pause(paused, T0 + 9000)).toBe(paused)
  expect(formatMs(0)).toBe('0:00')
  expect(formatMs(61_000)).toBe('1:01')
  expect(formatMs(754_321)).toBe('12:34')
  expect(isLevel('hard')).toBe(true)
  expect(isLevel('expert')).toBe(false)
  expect(isGame(g)).toBe(true)
  expect(isGame({ ...g, cells: g.cells.slice(1) })).toBe(false)
  expect(isGame({ ...g, cursor: CELLS })).toBe(false)
  expect(isGame({ ...g, level: 'expert' })).toBe(false)
  expect(isGame({ ...g, moves: [{ i: 1 }] })).toBe(false)
  expect(isGame({ ...g, stats: { games: 1, solved: 0 } })).toBe(false)
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
const PANE = { plugin: 'sudoku', component: 'Pane', requestId: 'sudoku', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'Sudoku', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} } } as const
const current = (saved: Map<string, unknown>) => saved.get('game') as Game
const KEYS = ['w', 'a', 's', 'd', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd0', 'new', 'undo', 'hint', 'level', 'help']

test('a puzzle is dealt and saved at start, and loads with its clock waiting after /clear', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const g = current(saved)
  expect(isGame(g)).toBe(true)
  expect(g.stats.games).toBe(1)
  expect(g.level).toBe('normal')
  saved.set('game', { ...g, startedAt: T0 - 5000, elapsedMs: 42_000 })
  await $.classic.SessionStart({ source: 'clear' })
  expect(current(saved).startedAt).toBe(T0 - 5000)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'level normal' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: GIVENS.normal + '/' + CELLS })).toBeDefined()
  // The cut-off stretch is not counted; the kept time shows.
  expect(await ui.find({ type: 'Text', text: 'time 0:42' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  for (const key of KEYS) expect(await ui.find({ key })).toBeDefined()
  await ui.unmount()
})

test('the keys move the cursor, write and clear digits, run the clock, undo, and give a hint', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const g0 = current(saved)
  // Park the cursor on a blank cell in the first row whose right-hand neighbour is also blank.
  const blankPair = g0.givens.findIndex((v, i) => !v && i % 9 < 8 && !g0.givens[i + 1])
  saved.set('game', { ...g0, cursor: blankPair })
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'd' })
  const i = blankPair + 1
  expect(current(saved).cursor).toBe(i)
  await ui.press({ key: 'd5' })
  let g = current(saved)
  expect(g.cells[i]).toBe(5)
  expect(g.startedAt).toBe(T0)
  expect(g.moves.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await clock.advance(1000)
  expect(await ui.find({ type: 'Text', text: 'time 0:01' })).toBeDefined()
  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: 'time 1:01' })).toBeDefined()
  await ui.press({ key: 'd0' })
  expect(current(saved).cells[i]).toBe(0)
  await ui.press({ key: 'undo' })
  expect(current(saved).cells[i]).toBe(5)
  await ui.press({ key: 'undo' })
  expect(current(saved).cells[i]).toBe(0)
  await ui.press({ key: 'undo' })
  expect(toasts.pop()).toBe('Nothing to undo.')
  // A hint fills the cell from the solution; a second on the same cell is refused.
  await ui.press({ key: 'hint' })
  g = current(saved)
  expect(g.cells[i]).toBe(g.solution[i])
  expect(g.hints).toBe(1)
  await ui.press({ key: 'hint' })
  expect(toasts.pop()).toBe('That cell is already right.')
  expect(await ui.find({ type: 'Text', text: /· hints 1 ·/ })).toBeDefined()
  // A digit on a given is refused.
  saved.set('game', { ...current(saved), cursor: g.givens.findIndex((v) => v > 0) })
  await $.classic.SessionStart({ source: 'resume' })
  await ui.press({ key: 'd7' })
  expect(toasts.pop()).toBe('That number is part of the puzzle.')
  await ui.unmount()
})

test('filling the last cell solves the puzzle with a toast, the clock stops, and n deals again', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const g0 = current(saved)
  const i = g0.cursor
  const cells = g0.solution.slice()
  cells[i] = 0
  saved.set('game', { ...g0, cells, elapsedMs: 90_000, moves: [{ i: 5, from: 0 }] })
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'd' + g0.solution[i] })
  const g = current(saved)
  expect(g.done).toBe(true)
  expect(g.elapsedMs).toBe(90_000)
  expect(g.stats.solved).toBe(1)
  expect(g.stats.bestMs.normal).toBe(90_000)
  expect(toasts.pop()).toBe('Solved in 1:30, your fastest on normal!')
  expect(await ui.find({ type: 'Text', text: 'Solved in 1:30, your fastest on normal. Press n for a new puzzle.' })).toBeDefined()
  await clock.advance(5000)
  expect(await ui.find({ type: 'Text', text: 'time 1:30' })).toBeDefined()
  await ui.press({ key: 'd1' })
  expect(toasts.pop()).toContain('solved')
  await ui.press({ key: 'new' })
  const fresh = current(saved)
  expect(fresh.done).toBe(false)
  expect(fresh.cells).toEqual(fresh.givens)
  expect(fresh.stats.games).toBe(2)
  expect(fresh.stats.bestMs.normal).toBe(90_000)
  expect(await ui.find({ type: 'Text', text: /best 1:30/ })).toBeDefined()
  await ui.unmount()
})

test('l deals at the next level only while the board is untouched', async ($, on) => {
  const toasts: string[] = []
  const { saved } = stubs(on, { toasts })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'level' })
  let g = current(saved)
  expect(g.level).toBe('hard')
  expect(filled(g.givens)).toBe(GIVENS.hard)
  expect(g.stats.games).toBe(2)
  expect(await ui.find({ key: 'level', label: 'Level: hard' })).toBeDefined()
  await ui.press({ key: 'd3' })
  await ui.press({ key: 'level' })
  expect(toasts.pop()).toBe('This puzzle has entries. Press n for a fresh one first, or /sudoku level easy.')
  g = current(saved)
  expect(g.level).toBe('hard')
  expect(g.stats.games).toBe(2)
  await ui.unmount()
})

test('/sudoku new, level and stats, and a summary where nothing draws', async ($, on) => {
  const { saved } = stubs(on, { surfaces: [] })
  await start($)
  expect((await $.command.run({ command: 'sudoku', args: '' })).text).toBe('Sudoku: ' + GIVENS.normal + '/81 filled, level normal, 0:00. /sudoku opens the pane.')
  expect((await $.command.run({ command: 'sudoku', args: 'level easy' })).text).toBe('New puzzle. Sudoku: ' + GIVENS.easy + '/81 filled, level easy, 0:00. /sudoku opens the pane.')
  expect(current(saved).level).toBe('easy')
  expect((await $.command.run({ command: 'sudoku', args: 'level silly' })).text).toBe('Levels: easy, normal, hard.')
  expect((await $.command.run({ command: 'sudoku', args: 'new' })).text).toMatch(/^New puzzle\. Sudoku: 40\/81 filled, level easy/)
  expect(current(saved).stats.games).toBe(3)
  expect((await $.command.run({ command: 'sudoku', args: 'stats' })).text).toBe('Games 3 · solved 0 · fastest: easy —, normal —, hard —')
  expect((await $.command.run({ command: 'sudoku', args: 'what' })).text).toMatch(/^Usage/)
})

test('/sudoku prints a summary when a surface exists but the pane cannot be placed', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: 'sudoku', args: '' })).text).toContain('/sudoku opens the pane')
})

test('a store that cannot be read never wipes the record', async ($, on) => {
  const saved = new Map<string, unknown>()
  const kept = newGame(2, { games: 9, solved: 4, bestMs: { easy: 0, normal: 300_000, hard: 0 } }, 'hard')
  saved.set('game', kept)
  stubs(on, { saved, unreadable: true })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'd4' })
  expect(current(saved)).toEqual(kept)
  await ui.unmount()
})

test('a corrupt saved game is replaced, and a narrow pane keeps every control', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', { cells: 'nope' })
  stubs(on, { saved })
  await start($)
  expect(isGame(saved.get('game'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 44 } })
  for (const key of KEYS) expect(await ui.find({ key })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await ui.unmount()
})
