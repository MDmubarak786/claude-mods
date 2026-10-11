import { expect, mock, test } from 'claude-code/testing'
import { LINES, claudeMark, claudeMove, empties, isGame, newGame, nextStarter, other, play, undo, winnerOf } from '../hooks/game'
import type { Game, Level, Mark } from '../types'

const T0 = 1_700_000_000_000
const STATS = { games: 0, wins: 0, losses: 0, draws: 0 }

// --- Rules

test('a line of three wins, a full board draws, and the record counts both', async () => {
  let g = newGame(1, STATS, 'normal', 'X', 'you')
  for (const pos of [0, 3, 1, 4]) g = play(g, pos, g.turn).game
  expect(g.winner).toBeNull()
  g = play(g, 2, 'X').game
  expect(g.winner).toBe('you')
  expect(g.winningLine).toEqual([0, 1, 2])
  expect(g.stats).toEqual({ games: 1, wins: 1, losses: 0, draws: 0 })

  let d = newGame(1, STATS, 'normal', 'X', 'you')
  for (const pos of [0, 1, 2, 4, 3, 5, 7, 6, 8]) d = play(d, pos, d.turn).game
  expect(d.winner).toBe('draw')
  expect(d.stats.draws).toBe(1)
  expect(winnerOf(d.board)).toBeNull()
})

test('a move is refused when the square is taken, out of turn, out of range, or the game is over', async () => {
  let g = newGame(1, STATS, 'normal', 'X', 'you')
  expect(play(g, 0, 'O').error).toBe("It's your move.")
  g = play(g, 0, 'X').game
  expect(play(g, 0, 'O').error).toBe('Square 1 is taken.')
  expect(play(g, 4, 'X').error).toBe("It's Claude's move.")
  expect(play(g, 9, 'O').error).toBe('Squares are 1 to 9.')
  for (const pos of [3, 1, 4, 2]) g = play(g, pos, g.turn).game
  expect(g.winner).toBe('you')
  expect(play(g, 5, 'O').error).toContain('over')
})

test('undo takes back your last move and what came after it, and refuses when there is nothing of yours', async () => {
  let g = newGame(1, STATS, 'normal', 'O', 'claude')
  expect(undo(g).error).toContain('Nothing of yours')
  g = play(g, 4, 'X').game
  expect(undo(g).error).toContain('Nothing of yours')
  g = play(g, 0, 'O').game
  g = play(g, 8, 'X').game
  const back = undo(g).game
  expect(back.moves).toEqual([4])
  expect(back.board[0]).toBeNull()
  expect(back.board[8]).toBeNull()
  expect(back.board[4]).toBe('X')
  expect(back.turn).toBe('O')
})

test('the loser starts the next game; after a draw the other side does', async () => {
  const g = newGame(1, STATS, 'normal', 'X', 'you')
  expect(nextStarter({ ...g, winner: 'you' })).toBe('claude')
  expect(nextStarter({ ...g, winner: 'claude' })).toBe('you')
  expect(nextStarter({ ...g, winner: 'draw' })).toBe('claude')
  expect(nextStarter({ ...g, winner: 'draw', starter: 'claude' })).toBe('you')
})

// Every way a human can play against the level, as X and as O, starting either side.
function everyGame(level: Level, check: (g: Game) => void) {
  for (const you of ['X', 'O'] as Mark[]) {
    for (const starter of ['you', 'claude'] as const) {
      const walk = (g: Game) => {
        if (g.winner) return check(g)
        if (g.turn === claudeMark(g)) return walk(play(g, claudeMove(g), g.turn).game)
        for (const pos of empties(g.board)) walk(play(g, pos, g.turn).game)
      }
      walk(newGame(3, STATS, level, you, starter))
    }
  }
}

test('hard never loses, whoever starts', async () => {
  let games = 0
  everyGame('hard', (g) => {
    games++
    expect(g.winner).not.toBe('you')
  })
  expect(games > 100).toBe(true)
})

test('normal takes a win and blocks a threat, and can still be beaten', async () => {
  let g = newGame(5, STATS, 'normal', 'X', 'you')
  // X: 0, O: center, X: 1 -> O must block 2.
  g = play(g, 0, 'X').game
  expect(claudeMove(g)).toBe(4)
  g = play(g, 4, 'O').game
  g = play(g, 1, 'X').game
  expect(claudeMove(g)).toBe(2)
  // O has 4 and 2 with 6 open: O takes the win over blocking.
  let w = newGame(5, STATS, 'normal', 'X', 'you')
  w = { ...w, board: ['X', 'X', 'O', null, 'O', null, null, null, null], moves: [0, 2, 1, 4], turn: 'O' }
  expect(claudeMove(w)).toBe(6)
  let beaten = false
  everyGame('normal', (g) => {
    if (g.winner === 'you') beaten = true
  })
  expect(beaten).toBe(true)
})

// Both sides play hard: Claude's side through claudeMove, yours through the same rules with the marks swapped.
function selfPlay(g: Game): Game {
  while (!g.winner) {
    const pos = g.turn === claudeMark(g) ? claudeMove(g) : claudeMove({ ...g, you: other(g.you) })
    g = play(g, pos, g.turn).game
  }
  return g
}

test('hard finishes a forced win as fast as it can', async () => {
  // O (Claude) to move with X at 0 and 4, O at 2 and 6: 8 forks two lines and wins in two more O moves.
  let g = newGame(4, STATS, 'hard', 'X', 'you')
  g = { ...g, board: ['X', null, 'O', null, 'X', null, 'O', null, null], moves: [0, 2, 4, 6], turn: 'O' }
  expect(claudeMove(g)).toBe(8)
  const end = selfPlay(g)
  expect(end.winner).toBe('claude')
  expect(end.moves.length - 4).toBe(3)
})

test('easy is random but repeatable from the seed', async () => {
  const g = newGame(8, STATS, 'easy', 'X', 'claude')
  const first = claudeMove(g)
  expect(claudeMove(g)).toBe(first)
  const moves = new Set<number>()
  for (let seed = 0; seed < 40; seed++) moves.add(claudeMove({ ...g, seed }))
  expect(moves.size > 3).toBe(true)
})

test('every winning line is checked and the guard rejects a malformed game', async () => {
  expect(LINES.length).toBe(8)
  for (const line of LINES) {
    const board: (Mark | null)[] = new Array(9).fill(null)
    for (const p of line) board[p] = 'O'
    expect(winnerOf(board)?.line).toEqual(line)
  }
  const g = newGame(1, STATS, 'hard', 'X', 'you')
  expect(isGame(g)).toBe(true)
  expect(isGame({ ...g, board: g.board.slice(0, 8) })).toBe(false)
  expect(isGame({ ...g, level: 'brutal' })).toBe(false)
  expect(isGame({ ...g, stats: { games: 1 } })).toBe(false)
  expect(isGame(null)).toBe(false)
  expect(other('X')).toBe('O')
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
const PANE = { plugin: 'xo', component: 'Pane', requestId: 'xo', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'XO', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 24 }, view: {} } } as const
const current = (saved: Map<string, unknown>) => saved.get('game') as Game

test('a game is created and saved at start, and survives /clear', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const g = current(saved)
  expect(isGame(g)).toBe(true)
  expect(g.you).toBe('X')
  expect(g.level).toBe('normal')
  saved.set('game', { ...g, moves: [4], board: g.board.map((m, i) => (i === 4 ? 'X' : m)), turn: 'O' })
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'sq-4', label: 'X' })).toBeDefined()
  await ui.unmount()
})

test('a press plays your mark, Claude answers after the pause, and the how-to hides after the first move', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Your move: press a digit, or click a square.' })).toBeDefined()
  for (let i = 0; i < 9; i++) expect(await ui.find({ key: 'sq-' + i, label: String(i + 1) })).toBeDefined()
  await ui.press({ key: 'sq-4' })
  let g = current(saved)
  expect(g.board[4]).toBe('X')
  expect(g.turn).toBe('O')
  expect(await ui.find({ type: 'Text', text: 'Claude is thinking…' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'sq-4' })
  expect(toasts.pop()).toBe("It's Claude's move.")
  await clock.advance(499)
  expect(current(saved).moves.length).toBe(1)
  await clock.advance(1)
  g = current(saved)
  expect(g.moves.length).toBe(2)
  expect(g.turn).toBe('X')
  const claudeAt = g.moves[1]
  expect(await ui.find({ key: 'sq-' + claudeAt, label: 'O' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Claude played ' + (claudeAt + 1) + '. Your move.' })).toBeDefined()
  await ui.press({ key: 'sq-' + claudeAt })
  expect(toasts.pop()).toBe('Square ' + (claudeAt + 1) + ' is taken.')
  await ui.unmount()
})

test('a win ends the game with a toast, counts, and the next game is started by the loser', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const g0 = current(saved)
  // Hand-made position: X to play and win at 2.
  saved.set('game', { ...g0, board: ['X', 'X', null, 'O', 'O', null, null, null, null], moves: [0, 3, 1, 4], turn: 'X' })
  await $.classic.SessionStart({ source: 'resume' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'sq-2' })
  let g = current(saved)
  expect(g.winner).toBe('you')
  expect(g.winningLine).toEqual([0, 1, 2])
  expect(g.stats).toEqual({ games: 1, wins: 1, losses: 0, draws: 0 })
  expect(toasts.pop()).toBe('You win! New game: n')
  expect(await ui.find({ type: 'Text', text: 'You win! Press n for a new game.' })).toBeDefined()
  await ui.press({ key: 'sq-5' })
  expect(toasts.pop()).toContain('over')
  await ui.press({ key: 'new' })
  g = current(saved)
  expect(g.moves.length).toBe(0)
  expect(g.starter).toBe('claude')
  expect(g.stats.games).toBe(1)
  expect(await ui.find({ type: 'Text', text: 'Claude is thinking…' })).toBeDefined()
  await clock.advance(500)
  g = current(saved)
  expect(g.moves.length).toBe(1)
  expect(g.board[g.moves[0]]).toBe('O')
  await ui.unmount()
})

test('undo takes back your move and cancels a pending reply; swap and level work from the footer', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'undo' })
  expect(toasts.pop()).toContain('Nothing of yours')
  // Claude starts; an undo with nothing to take back must not swallow Claude's reply.
  await ui.press({ key: 'swap' })
  expect(current(saved).turn).toBe('X')
  await ui.press({ key: 'undo' })
  expect(toasts.pop()).toContain('Nothing of yours')
  await clock.advance(500)
  expect(current(saved).moves.length).toBe(1)
  await ui.press({ key: 'swap' })
  expect(current(saved).you).toBe('X')
  expect(current(saved).moves.length).toBe(0)
  await ui.press({ key: 'sq-0' })
  await ui.press({ key: 'undo' })
  await clock.advance(1000)
  let g = current(saved)
  expect(g.moves).toEqual([])
  expect(g.board.every((m) => m === null)).toBe(true)
  expect(g.turn).toBe('X')
  await ui.press({ key: 'level' })
  expect(current(saved).level).toBe('hard')
  expect(await ui.find({ type: 'Text', text: 'Claude plays perfectly on hard: a draw is the best you can get.' })).toBeDefined()
  await ui.press({ key: 'level' })
  expect(current(saved).level).toBe('easy')
  await ui.press({ key: 'swap' })
  g = current(saved)
  expect(g.you).toBe('O')
  expect(g.level).toBe('easy')
  expect(await ui.find({ key: 'swap', label: 'Play X' })).toBeDefined()
  // h hides the how-to and it stays hidden on the next fresh board.
  await ui.press({ key: 'help' })
  await ui.press({ key: 'new' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.unmount()
})

test('/xo new, level, as, stats, and a summary where nothing draws', async ($, on) => {
  const { saved, clock } = stubs(on, { surfaces: [] })
  await start($)
  expect((await $.command.run({ command: 'xo', args: '' })).text).toMatch(/^XO: 1 2 3 \/ 4 5 6 \/ 7 8 9\. You are X, level normal\. Your move\. \/xo opens the pane\.$/)
  expect((await $.command.run({ command: 'xo', args: 'level hard' })).text).toContain('perfectly')
  expect((await $.command.run({ command: 'xo', args: 'level brutal' })).text).toBe('Levels: easy, normal, hard.')
  expect(current(saved).level).toBe('hard')
  const asO = (await $.command.run({ command: 'xo', args: 'as o' })).text
  expect(asO).toContain('You are O.')
  // The fresh game had no result, so the other side starts, and Claude's opening comes after the pause.
  expect(current(saved).starter).toBe('claude')
  expect(current(saved).moves.length).toBe(0)
  await clock.advance(500)
  expect(current(saved).moves.length).toBe(1)
  expect((await $.command.run({ command: 'xo', args: '' })).text).toContain('Your move.')
  expect((await $.command.run({ command: 'xo', args: 'stats' })).text).toBe('Games 0 · you 0 · Claude 0 · draws 0')
  expect((await $.command.run({ command: 'xo', args: 'what' })).text).toMatch(/^Usage/)
  expect((await $.command.run({ command: 'xo', args: 'new' })).text).toMatch(/^New game\. XO:/)
})

test('/xo prints a summary when a surface exists but the pane cannot be placed', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: 'xo', args: '' })).text).toContain('/xo opens the pane')
})

test('a store that cannot be read never wipes the record', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', { ...newGame(2, { games: 5, wins: 3, losses: 1, draws: 1 }, 'hard', 'O', 'you') })
  stubs(on, { saved, unreadable: true })
  await start($)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'sq-0' })).toBeDefined()
  await ui.press({ key: 'sq-0' })
  expect(await ui.find({ key: 'sq-0', label: 'X' })).toBeDefined()
  expect((saved.get('game') as Game).stats.games).toBe(5)
  expect((saved.get('game') as Game).moves).toEqual([])
  await ui.unmount()
})

test('a corrupt saved game is replaced, and a narrow pane keeps every control', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', { board: 'nope' })
  stubs(on, { saved })
  await start($)
  expect(isGame(saved.get('game'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 36 } })
  for (const key of ['sq-0', 'sq-8', 'new', 'undo', 'swap', 'level', 'help']) expect(await ui.find({ key })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await ui.unmount()
})
