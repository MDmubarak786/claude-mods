// The rules of 2048, pure: no `$` here, so the tests and the hooks module
// share one implementation.

import type { Game, Stats } from '../types'

export const SIZE = 4
export const GOAL = 2048
export type Dir = 'up' | 'down' | 'left' | 'right'
export const DIRS: Dir[] = ['up', 'down', 'left', 'right']

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

export const at = (row: number, col: number) => row * SIZE + col

// Drop a 2 (or, one time in ten, a 4) on an empty cell. Deterministic from the
// seed and the spawn number, so a game replays the same way.
export function spawn(cells: number[], seed: number, n: number): number[] {
  const empty = cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
  if (!empty.length) return cells
  const r = rng(hash(seed + ':spawn:' + n))
  const i = empty[Math.floor(r() * empty.length)]
  const out = cells.slice()
  out[i] = r() < 0.1 ? 4 : 2
  return out
}

// Slide one line toward index 0, merging each pair once; the points gained ride along.
export function slideLine(line: number[]): { line: number[]; gained: number } {
  const packed = line.filter(Boolean)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < packed.length; i++) {
    if (i + 1 < packed.length && packed[i] === packed[i + 1]) {
      out.push(packed[i] * 2)
      gained += packed[i] * 2
      i++
    } else out.push(packed[i])
  }
  while (out.length < SIZE) out.push(0)
  return { line: out, gained }
}

// The cells of each line in the order they slide for `dir`: the leading cell first.
function lines(dir: Dir): number[][] {
  const out: number[][] = []
  for (let k = 0; k < SIZE; k++) {
    const idx = [0, 1, 2, 3]
    if (dir === 'left') out.push(idx.map((i) => at(k, i)))
    if (dir === 'right') out.push(idx.map((i) => at(k, SIZE - 1 - i)))
    if (dir === 'up') out.push(idx.map((i) => at(i, k)))
    if (dir === 'down') out.push(idx.map((i) => at(SIZE - 1 - i, k)))
  }
  return out
}

export function slide(cells: number[], dir: Dir): { cells: number[]; gained: number; moved: boolean } {
  const out = cells.slice()
  let gained = 0
  let moved = false
  for (const line of lines(dir)) {
    const before = line.map((i) => cells[i])
    const r = slideLine(before)
    gained += r.gained
    line.forEach((i, k) => {
      if (out[i] !== r.line[k]) moved = true
      out[i] = r.line[k]
    })
  }
  return { cells: out, gained, moved }
}

export function canMove(cells: number[]): boolean {
  return DIRS.some((d) => slide(cells, d).moved)
}

export function highestTile(cells: number[]): number {
  return Math.max(0, ...cells)
}

export function newGame(seed: number, stats: Stats): Game {
  let cells = new Array(SIZE * SIZE).fill(0)
  cells = spawn(cells, seed, 0)
  cells = spawn(cells, seed, 1)
  return { seed, cells, score: 0, moves: 0, won: false, over: false, prev: null, stats }
}

export type MoveResult = { game: Game; error?: string }

export function move(g: Game, dir: Dir): MoveResult {
  if (!g.cells.length) return { game: g, error: 'No game yet.' }
  if (g.over) return { game: g, error: 'No moves left. Press n for a new game.' }
  const r = slide(g.cells, dir)
  if (!r.moved) return { game: g, error: 'Nothing slides that way.' }
  const moves = g.moves + 1
  const cells = spawn(r.cells, g.seed, moves + 1)
  const score = g.score + r.gained
  const highest = highestTile(cells)
  const over = !canMove(cells)
  const stats: Stats = { ...g.stats, best: Math.max(g.stats.best, score), highest: Math.max(g.stats.highest, highest) }
  return { game: { ...g, cells, score, moves, won: g.won || highest >= GOAL, over, prev: { cells: g.cells, score: g.score, moves: g.moves, won: g.won }, stats } }
}

export function undo(g: Game): MoveResult {
  if (!g.prev) return { game: g, error: 'Nothing to take back.' }
  return { game: { ...g, cells: g.prev.cells, score: g.prev.score, moves: g.prev.moves, won: g.prev.won, over: false, prev: null } }
}

export function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  const board = (c: unknown) => Array.isArray(c) && c.length === SIZE * SIZE && c.every((v) => Number.isInteger(v) && v >= 0)
  const stats = g.stats as Record<string, unknown> | undefined
  const prev = g.prev as Record<string, unknown> | null | undefined
  return typeof g.seed === 'number' && board(g.cells) && Number.isInteger(g.score) && Number.isInteger(g.moves) &&
    typeof g.won === 'boolean' && typeof g.over === 'boolean' &&
    (prev === null || (!!prev && typeof prev === 'object' && board(prev.cells) && Number.isInteger(prev.score) && Number.isInteger(prev.moves) && typeof prev.won === 'boolean')) &&
    !!stats && typeof stats === 'object' && ['games', 'best', 'highest'].every((k) => Number.isInteger(stats[k]))
}
