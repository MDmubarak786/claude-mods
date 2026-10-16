// The rules of sudoku, pure: no `$` here, so the tests and the hooks module
// share one implementation. The generator deals a full grid from the seed,
// then blanks cells while the puzzle keeps exactly one solution.

import type { Game, Level, Move, Stats } from '../types'

export const SIZE = 9
export const CELLS = SIZE * SIZE
export const LEVELS: Level[] = ['easy', 'normal', 'hard']
export const DEFAULT_LEVEL: Level = 'normal'
/** Cells left filled per level. */
export const GIVENS: Record<Level, number> = { easy: 40, normal: 32, hard: 26 }
/** Entries kept for undo; the oldest are dropped past this. */
export const MAX_UNDO = 300
/** Deals tried before settling for the one with the fewest givens. */
const ATTEMPTS = 12

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

function shuffled<T>(xs: T[], r: () => number): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const at = (row: number, col: number) => row * SIZE + col
export const rowOf = (i: number) => Math.floor(i / SIZE)
export const colOf = (i: number) => i % SIZE
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3)

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const ALL = 0x3fe // bits 1 to 9

function popcount(x: number): number {
  let n = 0
  while (x) {
    x &= x - 1
    n++
  }
  return n
}

// Backtracking over the cell with the fewest candidates. Counts solutions up
// to `limit`; the first one found is copied into `first` when given. A grid
// that already breaks a rule has no solutions.
function search(cells: number[], limit: number, first?: number[], order: number[] = DIGITS): number {
  const rows = new Array<number>(SIZE).fill(0)
  const cols = new Array<number>(SIZE).fill(0)
  const boxes = new Array<number>(SIZE).fill(0)
  const grid = cells.slice()
  for (let i = 0; i < CELLS; i++) {
    const v = grid[i]
    if (!v) continue
    const bit = 1 << v
    const r = rowOf(i)
    const c = colOf(i)
    const b = boxOf(i)
    if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) return 0
    rows[r] |= bit
    cols[c] |= bit
    boxes[b] |= bit
  }
  let count = 0
  const step = (): boolean => {
    let best = -1
    let bestMask = 0
    let bestN = 10
    for (let i = 0; i < CELLS; i++) {
      if (grid[i]) continue
      const mask = ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & ALL
      const n = popcount(mask)
      if (n === 0) return false
      if (n < bestN) {
        best = i
        bestMask = mask
        bestN = n
        if (n === 1) break
      }
    }
    if (best < 0) {
      count++
      if (first && count === 1) first.push(...grid)
      return count >= limit
    }
    const r = rowOf(best)
    const c = colOf(best)
    const b = boxOf(best)
    for (const d of order) {
      const bit = 1 << d
      if (!(bestMask & bit)) continue
      grid[best] = d
      rows[r] |= bit
      cols[c] |= bit
      boxes[b] |= bit
      const stop = step()
      grid[best] = 0
      rows[r] &= ~bit
      cols[c] &= ~bit
      boxes[b] &= ~bit
      if (stop) return true
    }
    return false
  }
  step()
  return count
}

/** How many solutions the grid has, counted up to `limit` (default 2: one, or more than one). */
export function countSolutions(cells: number[], limit = 2): number {
  return search(cells, limit)
}

/** The first solution, or null when there is none. */
export function solve(cells: number[]): number[] | null {
  const first: number[] = []
  return search(cells, 1, first) ? first : null
}

// A full valid grid, dealt from the seed: a search over an empty grid that
// tries the digits in a shuffled order.
export function fullGrid(seed: number): number[] {
  const first: number[] = []
  search(new Array<number>(CELLS).fill(0), 1, first, shuffled(DIGITS, rng(hash(seed + ':fill'))))
  return first
}

// Blank cells of the full grid in a shuffled order, keeping each blank only
// while the puzzle still has one solution, until the level's count of givens
// is reached. A deal that can't get there is retried with a fresh order; the
// best of a dozen is kept.
export function makePuzzle(seed: number, level: Level): { givens: number[]; solution: number[] } {
  const solution = fullGrid(seed)
  const target = GIVENS[level]
  let best: number[] | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const order = shuffled(Array.from({ length: CELLS }, (_, i) => i), rng(hash(seed + ':remove:' + attempt)))
    const puzzle = solution.slice()
    let left = CELLS
    for (const i of order) {
      if (left <= target) break
      const v = puzzle[i]
      puzzle[i] = 0
      if (countSolutions(puzzle, 2) === 1) left--
      else puzzle[i] = v
    }
    if (!best || left < best.filter(Boolean).length) best = puzzle
    if (left <= target) break
  }
  return { givens: best as number[], solution }
}

export function newGame(seed: number, stats: Stats, level: Level): Game {
  const { givens, solution } = makePuzzle(seed, level)
  const cursor = givens.findIndex((v) => !v)
  return { seed, level, givens, cells: givens.slice(), solution, cursor: cursor < 0 ? 0 : cursor, moves: [], hints: 0, done: false, elapsedMs: 0, startedAt: null, stats }
}

/** Cells whose value also appears in their row, column or box. */
export function conflicts(cells: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) {
    const v = cells[i]
    if (!v) continue
    const r = rowOf(i)
    const c = colOf(i)
    const b = boxOf(i)
    let clash = false
    for (let j = 0; j < CELLS && !clash; j++) {
      if (j === i || cells[j] !== v) continue
      clash = rowOf(j) === r || colOf(j) === c || boxOf(j) === b
    }
    if (clash) out.push(i)
  }
  return out
}

export const filled = (cells: number[]) => cells.filter(Boolean).length

/** Every cell filled and no rule broken. */
export function isSolved(cells: number[]): boolean {
  return filled(cells) === CELLS && conflicts(cells).length === 0
}

export function elapsed(g: Game, now: number): number {
  return g.elapsedMs + (g.startedAt !== null && !g.done ? Math.max(0, now - g.startedAt) : 0)
}

/** Stop the clock, keeping the time so far. */
export function pause(g: Game, now: number): Game {
  if (g.startedAt === null || g.done) return g
  return { ...g, elapsedMs: elapsed(g, now), startedAt: null }
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return m + ':' + String(s % 60).padStart(2, '0')
}

export type MoveResult = { game: Game; error?: string }

// Write a digit, or 0 to clear, into a cell. A given can't be changed. The
// clock starts at the first entry. Filling the last cell with no rule broken
// solves the puzzle, stops the clock, and records the time.
export function setCell(g: Game, i: number, v: number, now: number): MoveResult {
  if (g.done) return { game: g, error: 'The puzzle is solved. Press n for a new one.' }
  if (i < 0 || i >= CELLS || !Number.isInteger(v) || v < 0 || v > 9) return { game: g, error: 'Not a cell or a digit.' }
  if (g.givens[i]) return { game: g, error: 'That number is part of the puzzle.' }
  if (g.cells[i] === v) return { game: g }
  const cells = g.cells.slice()
  cells[i] = v
  const moves = [...g.moves, { i, from: g.cells[i] }].slice(-MAX_UNDO)
  const startedAt = g.startedAt ?? now
  if (!isSolved(cells)) return { game: { ...g, cells, moves, cursor: i, startedAt } }
  const ms = Math.max(1, elapsed({ ...g, startedAt }, now))
  const prev = g.stats.bestMs[g.level]
  const stats: Stats = { ...g.stats, solved: g.stats.solved + 1, bestMs: { ...g.stats.bestMs, [g.level]: prev ? Math.min(prev, ms) : ms } }
  return { game: { ...g, cells, moves, cursor: i, done: true, elapsedMs: ms, startedAt: null, stats } }
}

/** Take back the last entry and move the cursor there. */
export function undo(g: Game): MoveResult {
  if (g.done) return { game: g, error: 'The puzzle is solved. Press n for a new one.' }
  if (!g.moves.length) return { game: g, error: 'Nothing to undo.' }
  const last = g.moves[g.moves.length - 1]
  const cells = g.cells.slice()
  cells[last.i] = last.from
  return { game: { ...g, cells, moves: g.moves.slice(0, -1), cursor: last.i } }
}

/** Fill the cursor's cell from the solution, counting a hint. */
export function hint(g: Game, now: number): MoveResult {
  if (g.done) return { game: g, error: 'The puzzle is solved. Press n for a new one.' }
  const i = g.cursor
  if (g.givens[i]) return { game: g, error: 'That number is part of the puzzle.' }
  if (g.cells[i] === g.solution[i]) return { game: g, error: 'That cell is already right.' }
  const r = setCell(g, i, g.solution[i], now)
  return r.error ? r : { game: { ...r.game, hints: g.hints + 1 } }
}

export type Dir = 'up' | 'down' | 'left' | 'right'

/** Move the cursor one cell, wrapping at the edges. */
export function moveCursor(g: Game, d: Dir): Game {
  let r = rowOf(g.cursor)
  let c = colOf(g.cursor)
  if (d === 'up') r = (r + SIZE - 1) % SIZE
  if (d === 'down') r = (r + 1) % SIZE
  if (d === 'left') c = (c + SIZE - 1) % SIZE
  if (d === 'right') c = (c + 1) % SIZE
  return { ...g, cursor: at(r, c) }
}

export function isLevel(x: unknown): x is Level {
  return x === 'easy' || x === 'normal' || x === 'hard'
}

export function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  const grid = (a: unknown) => Array.isArray(a) && a.length === CELLS && a.every((v) => Number.isInteger(v) && v >= 0 && v <= 9)
  const move = (m: unknown) => !!m && typeof m === 'object' && Number.isInteger((m as Move).i) && Number.isInteger((m as Move).from)
  const stats = g.stats as Record<string, unknown> | undefined
  const best = stats?.bestMs as Record<string, unknown> | undefined
  return typeof g.seed === 'number' && isLevel(g.level) && grid(g.givens) && grid(g.cells) && grid(g.solution) &&
    Number.isInteger(g.cursor) && (g.cursor as number) >= 0 && (g.cursor as number) < CELLS && Array.isArray(g.moves) && g.moves.every(move) &&
    Number.isInteger(g.hints) && typeof g.done === 'boolean' && Number.isInteger(g.elapsedMs) && (g.startedAt === null || typeof g.startedAt === 'number') &&
    !!stats && typeof stats === 'object' && Number.isInteger(stats.games) && Number.isInteger(stats.solved) &&
    !!best && typeof best === 'object' && LEVELS.every((l) => Number.isInteger(best[l]))
}
