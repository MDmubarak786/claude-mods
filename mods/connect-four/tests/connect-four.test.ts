import { expect, mock, test } from 'claude-code/testing'
import { COLS, LINES, ROWS, at, claudeMark, claudeMove, drop, isGame, landing, newGame, nextStarter, openColumns, other, undo, winnerOf } from '../hooks/game'
import type { Game, Level, Mark } from '../types'

const T0 = 1_700_000_000_000
const STATS = { games: 0, wins: 0, losses: 0, draws: 0 }

// Play columns in turn from a fresh game.
function playOut(g: Game, cols: number[]): Game {
  for (const c of cols) {
    const r = drop(g, c, g.turn)
    if (r.error) throw new Error(r.error)
    g = r.game
  }
  return g
}

// --- Rules

test('discs stack from the bottom, a full column is refused, and four in a row wins in every direction', async () => {
  let g = newGame(1, STATS, 'normal', 'X', 'you')
  g = playOut(g, [0, 0])
  expect(g.cells[at(ROWS - 1, 0)]).toBe('X')
  expect(g.cells[at(ROWS - 2, 0)]).toBe('O')
  expect(landing(g.cells, 0)).toBe(ROWS - 3)
  g = playOut(g, [0, 0, 0, 0])
  expect(drop(g, 0, g.turn).error).toBe('Column 1 is full.')
  expect(openColumns(g.cells)).toEqual([1, 2, 3, 4, 5, 6])

  // Horizontal: X at 0..3 on the bottom row.
  let h = playOut(newGame(1, STATS, 'normal', 'X', 'you'), [0, 0, 1, 1, 2, 2, 3])
  expect(h.winner).toBe('you')
  expect(h.winningLine).toEqual([at(5, 0), at(5, 1), at(5, 2), at(5, 3)])
  expect(h.stats).toEqual({ games: 1, wins: 1, losses: 0, draws: 0 })
  // Vertical: O stacks four in column 6 while X wanders.
  const v = playOut(newGame(1, STATS, 'normal', 'X', 'you'), [0, 6, 1, 6, 2, 6, 4, 6])
  expect(v.winner).toBe('claude')
  expect(v.stats.losses).toBe(1)
  // Diagonals through hand-placed cells.
  for (const [dr, dc] of [[1, 1], [1, -1]]) {
    const cells: (Mark | null)[] = new Array(COLS * ROWS).fill(null)
    for (let i = 0; i < 4; i++) cells[at(1 + i * dr, 3 + i * dc)] = 'O'
    expect(winnerOf(cells)?.mark).toBe('O')
  }
  expect(LINES.length).toBe(69)
})

test('a full board with no line is a draw', async () => {
  // Rows alternate marks, and the middle two rows are flipped, so no run of four forms.
  const rows = ['XOXOXOX', 'XOXOXOX', 'OXOXOXO', 'OXOXOXO', 'XOXOXOX', 'XOXOXOX']
  const cells: (Mark | null)[] = new Array(COLS * ROWS).fill(null)
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells[at(r, c)] = rows[r][c] as Mark
  expect(winnerOf(cells)).toBeNull()
  let g = newGame(1, STATS, 'normal', 'X', 'you')
  // Leave one cell open then fill it: the game must end in a draw without the rules fighting.
  const last = at(0, 6)
  g = { ...g, cells: cells.map((m, i) => (i === last ? null : m)), turn: cells[last] as Mark, moves: new Array(41).fill(0) }
  const end = drop(g, 6, g.turn).game
  expect(end.winner).toBe('draw')
  expect(end.stats.draws).toBe(1)
})

test('a move is refused out of turn, out of range, and after the game ends', async () => {
  let g = newGame(1, STATS, 'normal', 'X', 'you')
  expect(drop(g, 0, 'O').error).toBe("It's your move.")
  expect(drop(g, 7, 'X').error).toBe('Columns are 1 to 7.')
  g = playOut(g, [0, 0, 1, 1, 2, 2, 3])
  expect(drop(g, 4, g.turn).error).toContain('over')
})

test('undo takes back your last move and what came after it', async () => {
  let g = newGame(1, STATS, 'normal', 'O', 'claude')
  expect(undo(g).error).toContain('Nothing of yours')
  g = playOut(g, [3, 3, 2])
  const back = undo(g).game
  expect(back.moves).toEqual([3])
  expect(back.cells.filter(Boolean).length).toBe(1)
  expect(back.cells[at(5, 3)]).toBe('X')
  expect(back.turn).toBe('O')
  expect(nextStarter({ ...g, winner: 'draw' })).toBe('you')
  expect(nextStarter({ ...g, winner: 'claude' })).toBe('you')
  expect(nextStarter({ ...g, winner: 'you' })).toBe('claude')
})

// --- Opponents

function selfPlay(g: Game, yourLevel: Level): Game {
  let guard = 0
  while (!g.winner && guard++ < 50) {
    const col = g.turn === claudeMark(g) ? claudeMove(g) : claudeMove({ ...g, you: other(g.you), level: yourLevel })
    g = drop(g, col, g.turn).game
  }
  return g
}

test('normal takes a win, blocks a threat, and avoids giving a win away on top of its disc', async () => {
  let g = newGame(2, STATS, 'normal', 'X', 'you')
  g = playOut(g, [0, 6, 1, 6, 2])
  expect(claudeMove(g)).toBe(3)
  let w = newGame(2, STATS, 'normal', 'X', 'you')
  w = playOut(w, [0, 6, 1, 6, 5, 6, 0])
  expect(claudeMove(w)).toBe(6)
  // X holds row 3 at columns 1 to 3 with column 0 blocked; column 4's next free cell
  // is row 4, so an O there lets X drop onto row 3 and complete the line.
  const rows = ['.......', '.......', '.......', 'OXXX...', 'XOXO.O.', 'OXOXOX.']
  const cells: (Mark | null)[] = new Array(COLS * ROWS).fill(null)
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells[at(r, c)] = rows[r][c] === '.' ? null : (rows[r][c] as Mark)
  const trap = { ...newGame(2, STATS, 'normal', 'X', 'you'), cells, turn: 'O' as Mark, moves: new Array(15).fill(0) }
  for (let seed = 0; seed < 10; seed++) expect(claudeMove({ ...trap, seed })).not.toBe(4)
  // Hard sees it too.
  for (let seed = 0; seed < 3; seed++) expect(claudeMove({ ...trap, seed, level: 'hard' })).not.toBe(4)
})

test('hard beats easy across seeds and starters', async () => {
  for (let seed = 1; seed <= 4; seed++) {
    for (const starter of ['you', 'claude'] as const) {
      expect(selfPlay(newGame(seed, STATS, 'hard', 'X', starter), 'easy').winner).toBe('claude')
    }
  }
})

// Kept to four games: each is a few hundred milliseconds of search on a slow CI runner.
test('hard never loses to normal, and wins most of the time', async () => {
  let hardWins = 0
  for (let seed = 1; seed <= 2; seed++) {
    for (const starter of ['you', 'claude'] as const) {
      const vsNormal = selfPlay(newGame(seed, STATS, 'hard', 'X', starter), 'normal')
      expect(vsNormal.winner).not.toBe('you')
      if (vsNormal.winner === 'claude') hardWins++
    }
  }
  expect(hardWins >= 2).toBe(true)
})

test('easy is repeatable from the seed and varied across seeds', async () => {
  const g = newGame(8, STATS, 'easy', 'X', 'claude')
  expect(claudeMove(g)).toBe(claudeMove(g))
  const cols = new Set<number>()
  for (let seed = 0; seed < 40; seed++) cols.add(claudeMove({ ...g, seed }))
  expect(cols.size > 3).toBe(true)
})

test('the guard rejects a malformed game', async () => {
  const g = newGame(1, STATS, 'hard', 'X', 'you')
  expect(isGame(g)).toBe(true)
  expect(isGame({ ...g, cells: g.cells.slice(1) })).toBe(false)
  expect(isGame({ ...g, moves: [7] })).toBe(false)
  expect(isGame({ ...g, level: 'brutal' })).toBe(false)
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
const PANE = { plugin: 'connect-four', component: 'Pane', requestId: 'connect-four', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'Connect Four', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 26 }, view: {} } } as const
const current = (saved: Map<string, unknown>) => saved.get('game') as Game

test('a game is created and saved at start, and survives /clear', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const g = current(saved)
  expect(isGame(g)).toBe(true)
  expect(g.you).toBe('X')
  expect(g.level).toBe('normal')
  saved.set('game', playOut(g, [3]))
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'Claude is thinking…' })).toBeDefined()
  await ui.unmount()
})

test('a press drops your disc, Claude answers after the pause, and the how-to hides after the first move', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "Your move: press a column's digit, or click it." })).toBeDefined()
  for (let c = 0; c < COLS; c++) expect(await ui.find({ key: 'col-' + c, label: String(c + 1) })).toBeDefined()
  await ui.press({ key: 'col-3' })
  let g = current(saved)
  expect(g.cells[at(ROWS - 1, 3)]).toBe('X')
  expect(g.turn).toBe('O')
  expect(await ui.find({ type: 'Text', text: 'Claude is thinking…' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'col-3' })
  expect(toasts.pop()).toBe("It's Claude's move.")
  await clock.advance(499)
  expect(current(saved).moves.length).toBe(1)
  await clock.advance(1)
  g = current(saved)
  expect(g.moves.length).toBe(2)
  expect(g.turn).toBe('X')
  expect(await ui.find({ type: 'Text', text: 'Claude dropped in column ' + (g.moves[1] + 1) + '. Your move.' })).toBeDefined()
  await ui.unmount()
})

test('a win ends the game with a toast, counts, and the loser starts the next game', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  saved.set('game', playOut(current(saved), [0, 6, 1, 6, 2, 6]))
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'col-3' })
  let g = current(saved)
  expect(g.winner).toBe('you')
  expect(g.stats).toEqual({ games: 1, wins: 1, losses: 0, draws: 0 })
  expect(toasts.pop()).toBe('You win! New game: n')
  expect(await ui.find({ type: 'Text', text: 'You win! Press n for a new game.' })).toBeDefined()
  await ui.press({ key: 'col-4' })
  expect(toasts.pop()).toContain('over')
  await ui.press({ key: 'new' })
  g = current(saved)
  expect(g.moves.length).toBe(0)
  expect(g.starter).toBe('claude')
  await clock.advance(500)
  g = current(saved)
  expect(g.moves.length).toBe(1)
  await ui.unmount()
})

test('a full column loses its hotkey and refuses a drop', async ($, on) => {
  const toasts: string[] = []
  const { saved } = stubs(on, { toasts })
  await start($)
  saved.set('game', playOut(current(saved), [0, 0, 0, 0, 0, 0]))
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'col-0' })
  expect(toasts.pop()).toBe('Column 1 is full.')
  await ui.unmount()
})

test('undo takes back your move and reschedules a reply it could not cancel; swap, level and help work', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'undo' })
  expect(toasts.pop()).toContain('Nothing of yours')
  await ui.press({ key: 'col-2' })
  await ui.press({ key: 'undo' })
  await clock.advance(1000)
  let g = current(saved)
  expect(g.moves).toEqual([])
  expect(g.turn).toBe('X')
  await ui.press({ key: 'swap' })
  expect(current(saved).turn).toBe('X')
  await ui.press({ key: 'undo' })
  expect(toasts.pop()).toContain('Nothing of yours')
  await clock.advance(500)
  expect(current(saved).moves.length).toBe(1)
  await ui.press({ key: 'level' })
  expect(current(saved).level).toBe('hard')
  expect(await ui.find({ type: 'Text', text: 'Claude looks five moves ahead on hard.' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Claude looks seven moves ahead on hard.' })).toBeDefined()
  // A fresh board shows the how-to; h hides it and it stays hidden on the next fresh board.
  await ui.press({ key: 'new' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'new' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  g = current(saved)
  expect(g.you).toBe('O')
  expect(g.level).toBe('hard')
  await ui.unmount()
})

test('/connect-four new, level, as, stats, and a summary where nothing draws', async ($, on) => {
  const { saved, clock } = stubs(on, { surfaces: [] })
  await start($)
  expect((await $.command.run({ command: 'connect-four', args: '' })).text).toMatch(/^Connect Four: \.{7}( \/ \.{7}){5}\. You are X, level normal, 0 moves\. Your move\. \/connect-four opens the pane\.$/)
  expect((await $.command.run({ command: 'connect-four', args: 'level hard' })).text).toContain('ahead')
  expect((await $.command.run({ command: 'connect-four', args: 'level brutal' })).text).toBe('Levels: easy, normal, hard.')
  expect((await $.command.run({ command: 'connect-four', args: 'as o' })).text).toContain('You are O.')
  expect(current(saved).starter).toBe('claude')
  await clock.advance(500)
  expect(current(saved).moves.length).toBe(1)
  expect((await $.command.run({ command: 'connect-four', args: 'stats' })).text).toBe('Games 0 · you 0 · Claude 0 · draws 0')
  expect((await $.command.run({ command: 'connect-four', args: 'what' })).text).toMatch(/^Usage/)
  expect((await $.command.run({ command: 'connect-four', args: 'new' })).text).toMatch(/^New game\. Connect Four:/)
})

test('/connect-four prints a summary when a surface exists but the pane cannot be placed', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: 'connect-four', args: '' })).text).toContain('/connect-four opens the pane')
})

test('a store that cannot be read never wipes the record, and a corrupt one is replaced', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', newGame(2, { games: 5, wins: 3, losses: 1, draws: 1 }, 'hard', 'O', 'you'))
  stubs(on, { saved, unreadable: true })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'col-0' })
  expect(current(saved).stats.games).toBe(5)
  expect(current(saved).moves).toEqual([])
  await ui.unmount()
})

test('a corrupt saved game is replaced, and a narrow pane keeps every control', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', { cells: 'nope' })
  stubs(on, { saved })
  await start($)
  expect(isGame(saved.get('game'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  for (const key of ['col-0', 'col-6', 'new', 'undo', 'swap', 'level', 'help']) expect(await ui.find({ key })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.unmount()
})
