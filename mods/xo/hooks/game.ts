// The rules of tic-tac-toe and the three opponents, pure: no `$` here, so the
// tests and the hooks module share one implementation.

import type { Game, Level, Mark, Stats } from '../types'

export const LEVELS: Level[] = ['easy', 'normal', 'hard']
export const DEFAULT_LEVEL: Level = 'normal'

export const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function other(m: Mark): Mark {
  return m === 'X' ? 'O' : 'X'
}

export function claudeMark(g: Game): Mark {
  return other(g.you)
}

export function winnerOf(board: (Mark | null)[]): { mark: Mark; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a] as Mark, line }
  }
  return null
}

export function isFull(board: (Mark | null)[]): boolean {
  return board.every(Boolean)
}

export function empties(board: (Mark | null)[]): number[] {
  return board.map((m, i) => (m ? -1 : i)).filter((i) => i >= 0)
}

export function newGame(seed: number, stats: Stats, level: Level, you: Mark, starter: 'you' | 'claude'): Game {
  return { seed, board: new Array(9).fill(null), you, turn: starter === 'you' ? you : other(you), moves: [], winner: null, winningLine: null, level, starter, stats }
}

export type MoveResult = { game: Game; error?: string }

// Play `mark` at `pos`. The caller says whose move it is; the rules check it.
export function play(g: Game, pos: number, mark: Mark): MoveResult {
  if (g.winner) return { game: g, error: 'The game is over. Press n for a new one.' }
  if (mark !== g.turn) return { game: g, error: mark === g.you ? "It's Claude's move." : "It's your move." }
  if (!Number.isInteger(pos) || pos < 0 || pos > 8) return { game: g, error: 'Squares are 1 to 9.' }
  if (g.board[pos]) return { game: g, error: 'Square ' + (pos + 1) + ' is taken.' }
  const board = g.board.slice()
  board[pos] = mark
  const moves = [...g.moves, pos]
  const won = winnerOf(board)
  if (won) {
    const winner = won.mark === g.you ? 'you' : 'claude'
    const stats = { ...g.stats, games: g.stats.games + 1, wins: g.stats.wins + (winner === 'you' ? 1 : 0), losses: g.stats.losses + (winner === 'claude' ? 1 : 0) }
    return { game: { ...g, board, moves, turn: other(mark), winner, winningLine: won.line, stats } }
  }
  if (isFull(board)) {
    return { game: { ...g, board, moves, turn: other(mark), winner: 'draw', winningLine: null, stats: { ...g.stats, games: g.stats.games + 1, draws: g.stats.draws + 1 } } }
  }
  return { game: { ...g, board, moves, turn: other(mark) } }
}

// Take back your last move and everything after it. Only while the game is on.
export function undo(g: Game): MoveResult {
  if (g.winner) return { game: g, error: 'The game is over. Press n for a new one.' }
  const yours = g.moves.map((pos, i) => (g.board[pos] === g.you ? i : -1)).filter((i) => i >= 0)
  if (!yours.length) return { game: g, error: 'Nothing of yours to take back yet.' }
  const moves = g.moves.slice(0, yours[yours.length - 1])
  const board: (Mark | null)[] = new Array(9).fill(null)
  // Replay to find each square's mark: the starter's mark goes first and they alternate.
  let mark: Mark = g.starter === 'you' ? g.you : other(g.you)
  for (const pos of moves) {
    board[pos] = mark
    mark = other(mark)
  }
  return { game: { ...g, board, moves, turn: g.you } }
}

// Who starts next: the loser; after a draw, whoever didn't start this one.
export function nextStarter(g: Game): 'you' | 'claude' {
  if (g.winner === 'you') return 'claude'
  if (g.winner === 'claude') return 'you'
  return g.starter === 'you' ? 'claude' : 'you'
}

// Minimax from `mark`'s point of view, in moves: a quicker win and a slower loss
// score higher, so a perfect opponent finishes and never gives a line away.
function score(board: (Mark | null)[], me: Mark, toMove: Mark): number {
  const won = winnerOf(board)
  if (won) return won.mark === me ? empties(board).length + 1 : -(empties(board).length + 1)
  const free = empties(board)
  if (!free.length) return 0
  let best = toMove === me ? -Infinity : Infinity
  for (const pos of free) {
    board[pos] = toMove
    const s = score(board, me, other(toMove))
    board[pos] = null
    best = toMove === me ? Math.max(best, s) : Math.min(best, s)
  }
  return best
}

function winningMove(board: (Mark | null)[], mark: Mark): number | null {
  for (const pos of empties(board)) {
    board[pos] = mark
    const won = !!winnerOf(board)
    board[pos] = null
    if (won) return pos
  }
  return null
}

function pick<T>(list: T[], r: () => number): T {
  return list[Math.floor(r() * list.length)]
}

// Claude's square for the position, by level. Deterministic from the game's
// seed and the move number, so a game replays the same way.
export function claudeMove(g: Game): number {
  const me = claudeMark(g)
  const board = g.board.slice()
  const free = empties(board)
  if (!free.length) return -1
  const r = rng(hash(g.seed + ':move:' + g.moves.length))
  if (g.level === 'easy') return pick(free, r)
  const win = winningMove(board, me)
  if (win !== null) return win
  const block = winningMove(board, g.you)
  if (block !== null) return block
  if (g.level === 'normal') {
    if (!board[4]) return 4
    const corners = [0, 2, 6, 8].filter((p) => !board[p])
    return corners.length ? pick(corners, r) : pick(free, r)
  }
  let best = -Infinity
  let bestMoves: number[] = []
  for (const pos of free) {
    board[pos] = me
    const s = score(board, me, g.you)
    board[pos] = null
    if (s > best) {
      best = s
      bestMoves = [pos]
    } else if (s === best) bestMoves.push(pos)
  }
  return pick(bestMoves, r)
}

export function isLevel(x: unknown): x is Level {
  return x === 'easy' || x === 'normal' || x === 'hard'
}

export function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  const mark = (m: unknown) => m === 'X' || m === 'O'
  const stats = g.stats as Record<string, unknown> | undefined
  return typeof g.seed === 'number' && Array.isArray(g.board) && g.board.length === 9 && g.board.every((m) => m === null || mark(m)) &&
    mark(g.you) && mark(g.turn) && Array.isArray(g.moves) && g.moves.every((p) => Number.isInteger(p) && p >= 0 && p <= 8) &&
    (g.winner === null || g.winner === 'you' || g.winner === 'claude' || g.winner === 'draw') && isLevel(g.level) &&
    (g.starter === 'you' || g.starter === 'claude') && !!stats && typeof stats === 'object' &&
    ['games', 'wins', 'losses', 'draws'].every((k) => Number.isInteger(stats[k]))
}
