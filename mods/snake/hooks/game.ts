// The rules of snake, pure: no `$` here, so the tests and the hooks module
// share one implementation.

import type { Dir, Game, Stats } from '../types'

export const COLS = 20
export const ROWS = 10
export const DEFAULT_SPEED = 150
export const MIN_SPEED = 60
export const MAX_SPEED = 500
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

export const at = (row: number, col: number) => row * COLS + col
export const rowOf = (cell: number) => Math.floor(cell / COLS)
export const colOf = (cell: number) => cell % COLS

export function opposite(d: Dir): Dir {
  return d === 'up' ? 'down' : d === 'down' ? 'up' : d === 'left' ? 'right' : 'left'
}

// Food lands on a free cell. Deterministic from the seed and the food number.
export function placeFood(snake: number[], seed: number, n: number): number {
  const taken = new Set(snake)
  const free = Array.from({ length: COLS * ROWS }, (_, i) => i).filter((i) => !taken.has(i))
  if (!free.length) return -1
  const r = rng(hash(seed + ':food:' + n))
  return free[Math.floor(r() * free.length)]
}

export function newGame(seed: number, stats: Stats, speed: number): Game {
  const row = Math.floor(ROWS / 2)
  const snake = [at(row, 5), at(row, 4), at(row, 3)]
  return { seed, snake, dir: 'right', nextDir: 'right', food: placeFood(snake, seed, 0), score: 0, ticks: 0, paused: true, over: false, record: false, speed, stats }
}

// Steer. A turn straight back into the body is ignored; the turn applies at the next tick.
export function steer(g: Game, d: Dir): Game {
  if (g.over) return g
  if (d === opposite(g.dir) && g.snake.length > 1) return g
  return { ...g, nextDir: d, paused: false }
}

// One step forward. Eating grows the snake by one and scores; a wall or the
// body ends the game.
export function tick(g: Game): Game {
  if (g.over || g.paused) return g
  const dir = g.nextDir
  const head = g.snake[0]
  let row = rowOf(head)
  let col = colOf(head)
  if (dir === 'up') row--
  if (dir === 'down') row++
  if (dir === 'left') col--
  if (dir === 'right') col++
  const ticks = g.ticks + 1
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return end({ ...g, dir, ticks })
  const next = at(row, col)
  const eats = next === g.food
  // The tail cell frees up this tick unless the snake grows into it.
  const body = eats ? g.snake : g.snake.slice(0, -1)
  if (body.includes(next)) return end({ ...g, dir, ticks })
  const snake = [next, ...body]
  if (!eats) return { ...g, dir, snake, ticks }
  const score = g.score + 1
  const food = placeFood(snake, g.seed, score)
  const record = g.record || score > g.stats.best
  const stats: Stats = { ...g.stats, best: Math.max(g.stats.best, score) }
  // Filling the whole board is a win of sorts: nothing left to eat.
  return food < 0 ? { ...g, dir, snake, ticks, score, food, stats, record, over: true, paused: true } : { ...g, dir, snake, ticks, score, food, stats, record }
}

function end(g: Game): Game {
  return { ...g, over: true, paused: true }
}

export function clampSpeed(ms: number): number {
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.round(ms)))
}

export function isDir(x: unknown): x is Dir {
  return x === 'up' || x === 'down' || x === 'left' || x === 'right'
}

export function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  const cell = (c: unknown) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < COLS * ROWS
  const stats = g.stats as Record<string, unknown> | undefined
  return typeof g.seed === 'number' && Array.isArray(g.snake) && g.snake.length > 0 && g.snake.every(cell) && isDir(g.dir) && isDir(g.nextDir) &&
    (g.food === -1 || cell(g.food)) && Number.isInteger(g.score) && Number.isInteger(g.ticks) && typeof g.paused === 'boolean' && typeof g.over === 'boolean' &&
    typeof g.record === 'boolean' && Number.isInteger(g.speed) && !!stats && typeof stats === 'object' && ['games', 'best'].every((k) => Number.isInteger(stats[k]))
}
