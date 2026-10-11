// The rules of Connect Four and the three opponents, pure: no `$` here, so the
// tests and the hooks module share one implementation.

import type { Game, Level, Mark, Stats } from '../types'

export const COLS = 7
export const ROWS = 6
export const LEVELS: Level[] = ['easy', 'normal', 'hard']
export const DEFAULT_LEVEL: Level = 'normal'
const HARD_DEPTH = 7

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

export const at = (row: number, col: number) => row * COLS + col

// Every run of four cells on the board, computed once.
export const LINES: number[][] = (() => {
  const out: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 3 < COLS) out.push([0, 1, 2, 3].map((i) => at(r, c + i)))
      if (r + 3 < ROWS) out.push([0, 1, 2, 3].map((i) => at(r + i, c)))
      if (c + 3 < COLS && r + 3 < ROWS) out.push([0, 1, 2, 3].map((i) => at(r + i, c + i)))
      if (c - 3 >= 0 && r + 3 < ROWS) out.push([0, 1, 2, 3].map((i) => at(r + i, c - i)))
    }
  }
  return out
})()

export function winnerOf(cells: (Mark | null)[]): { mark: Mark; line: number[] } | null {
  for (const line of LINES) {
    const m = cells[line[0]]
    if (m && line.every((i) => cells[i] === m)) return { mark: m, line }
  }
  return null
}

// The row a disc dropped in `col` lands on, or -1 when the column is full.
export function landing(cells: (Mark | null)[], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (!cells[at(r, col)]) return r
  return -1
}

export function openColumns(cells: (Mark | null)[]): number[] {
  return Array.from({ length: COLS }, (_, c) => c).filter((c) => landing(cells, c) >= 0)
}

export function newGame(seed: number, stats: Stats, level: Level, you: Mark, starter: 'you' | 'claude'): Game {
  return { seed, cells: new Array(COLS * ROWS).fill(null), you, turn: starter === 'you' ? you : other(you), moves: [], winner: null, winningLine: null, level, starter, stats }
}

export type MoveResult = { game: Game; error?: string }

export function drop(g: Game, col: number, mark: Mark): MoveResult {
  if (g.winner) return { game: g, error: 'The game is over. Press n for a new one.' }
  if (mark !== g.turn) return { game: g, error: mark === g.you ? "It's Claude's move." : "It's your move." }
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return { game: g, error: 'Columns are 1 to ' + COLS + '.' }
  const row = landing(g.cells, col)
  if (row < 0) return { game: g, error: 'Column ' + (col + 1) + ' is full.' }
  const cells = g.cells.slice()
  cells[at(row, col)] = mark
  const moves = [...g.moves, col]
  const won = winnerOf(cells)
  if (won) {
    const winner = won.mark === g.you ? 'you' : 'claude'
    const stats = { ...g.stats, games: g.stats.games + 1, wins: g.stats.wins + (winner === 'you' ? 1 : 0), losses: g.stats.losses + (winner === 'claude' ? 1 : 0) }
    return { game: { ...g, cells, moves, turn: other(mark), winner, winningLine: won.line, stats } }
  }
  if (!openColumns(cells).length) {
    return { game: { ...g, cells, moves, turn: other(mark), winner: 'draw', winningLine: null, stats: { ...g.stats, games: g.stats.games + 1, draws: g.stats.draws + 1 } } }
  }
  return { game: { ...g, cells, moves, turn: other(mark) } }
}

// Take back your last move and everything after it. Only while the game is on.
export function undo(g: Game): MoveResult {
  if (g.winner) return { game: g, error: 'The game is over. Press n for a new one.' }
  const first: Mark = g.starter === 'you' ? g.you : other(g.you)
  const yours = g.moves.map((_, i) => ((i % 2 === 0 ? first : other(first)) === g.you ? i : -1)).filter((i) => i >= 0)
  if (!yours.length) return { game: g, error: 'Nothing of yours to take back yet.' }
  const moves = g.moves.slice(0, yours[yours.length - 1])
  const cells: (Mark | null)[] = new Array(COLS * ROWS).fill(null)
  let mark = first
  for (const col of moves) {
    cells[at(landing(cells, col), col)] = mark
    mark = other(mark)
  }
  return { game: { ...g, cells, moves, turn: g.you } }
}

export function nextStarter(g: Game): 'you' | 'claude' {
  if (g.winner === 'you') return 'claude'
  if (g.winner === 'claude') return 'you'
  return g.starter === 'you' ? 'claude' : 'you'
}

// How good the board looks for `me`: each run of four with only my discs
// counts for me, only theirs against me, by how full it is. Center columns
// count a little extra, since most lines pass through them.
function heuristic(cells: (Mark | null)[], me: Mark): number {
  let s = 0
  for (const line of LINES) {
    let mine = 0
    let theirs = 0
    for (const i of line) {
      if (cells[i] === me) mine++
      else if (cells[i]) theirs++
    }
    if (mine && !theirs) s += mine === 3 ? 8 : mine === 2 ? 2 : 0
    else if (theirs && !mine) s -= theirs === 3 ? 9 : theirs === 2 ? 2 : 0
  }
  for (let r = 0; r < ROWS; r++) if (cells[at(r, 3)] === me) s += 1
  return s
}

function search(cells: (Mark | null)[], me: Mark, toMove: Mark, depth: number, alpha: number, beta: number): number {
  const won = winnerOf(cells)
  if (won) return won.mark === me ? 1000 + depth : -1000 - depth
  const open = openColumns(cells)
  if (!open.length) return 0
  if (depth === 0) return heuristic(cells, me)
  const order = [3, 2, 4, 1, 5, 0, 6].filter((c) => open.includes(c))
  let best = toMove === me ? -Infinity : Infinity
  for (const col of order) {
    const i = at(landing(cells, col), col)
    cells[i] = toMove
    const s = search(cells, me, other(toMove), depth - 1, alpha, beta)
    cells[i] = null
    if (toMove === me) {
      best = Math.max(best, s)
      alpha = Math.max(alpha, best)
    } else {
      best = Math.min(best, s)
      beta = Math.min(beta, best)
    }
    if (beta <= alpha) break
  }
  return best
}

function winningColumn(cells: (Mark | null)[], mark: Mark): number | null {
  for (const col of openColumns(cells)) {
    const i = at(landing(cells, col), col)
    cells[i] = mark
    const won = !!winnerOf(cells)
    cells[i] = null
    if (won) return col
  }
  return null
}

function pick<T>(list: T[], r: () => number): T {
  return list[Math.floor(r() * list.length)]
}

// Claude's column for the position, by level. Deterministic from the game's
// seed and the move number, so a game replays the same way.
export function claudeMove(g: Game): number {
  const me = claudeMark(g)
  const cells = g.cells.slice()
  const open = openColumns(cells)
  if (!open.length) return -1
  const r = rng(hash(g.seed + ':move:' + g.moves.length))
  if (g.level === 'easy') return pick(open, r)
  const win = winningColumn(cells, me)
  if (win !== null) return win
  const block = winningColumn(cells, g.you)
  if (block !== null) return block
  if (g.level === 'normal') {
    // Don't hand the opponent a win on top of the disc; prefer the middle.
    const safe = open.filter((col) => {
      const row = landing(cells, col)
      if (row === 0) return true
      cells[at(row, col)] = me
      cells[at(row - 1, col)] = g.you
      const gives = !!winnerOf(cells)
      cells[at(row, col)] = null
      cells[at(row - 1, col)] = null
      return !gives
    })
    const from = safe.length ? safe : open
    const middle = from.filter((c) => c >= 2 && c <= 4)
    return pick(middle.length ? middle : from, r)
  }
  let best = -Infinity
  let bestCols: number[] = []
  for (const col of [3, 2, 4, 1, 5, 0, 6].filter((c) => open.includes(c))) {
    const i = at(landing(cells, col), col)
    cells[i] = me
    const s = search(cells, me, g.you, HARD_DEPTH - 1, -Infinity, Infinity)
    cells[i] = null
    if (s > best) {
      best = s
      bestCols = [col]
    } else if (s === best) bestCols.push(col)
  }
  return pick(bestCols, r)
}

export function isLevel(x: unknown): x is Level {
  return x === 'easy' || x === 'normal' || x === 'hard'
}

export function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  const mark = (m: unknown) => m === 'X' || m === 'O'
  const stats = g.stats as Record<string, unknown> | undefined
  return typeof g.seed === 'number' && Array.isArray(g.cells) && g.cells.length === COLS * ROWS && g.cells.every((m) => m === null || mark(m)) &&
    mark(g.you) && mark(g.turn) && Array.isArray(g.moves) && g.moves.every((c) => Number.isInteger(c) && c >= 0 && c < COLS) &&
    (g.winner === null || g.winner === 'you' || g.winner === 'claude' || g.winner === 'draw') && isLevel(g.level) &&
    (g.starter === 'you' || g.starter === 'claude') && !!stats && typeof stats === 'object' &&
    ['games', 'wins', 'losses', 'draws'].every((k) => Number.isInteger(stats[k]))
}
