// The rules of the dinosaur runner, pure: no `$` here, so the tests and the
// hooks module share one implementation.

import type { Game, Obstacle, Stats } from '../types'

export const COLS = 30
export const DINO_COL = 4
/** The dinosaur's height on each tick of a jump. */
export const ARC = [1, 2, 2, 2, 1]
export const START_SPEED = 120
export const MIN_SPEED = 60
/** Every RAMP points the ticks get SPEED_STEP ms faster, down to MIN_SPEED. */
export const RAMP = 100
export const SPEED_STEP = 10
/** Ticks between cacti: never fewer than a jump plus a breath, so every one can be cleared. */
export const MIN_GAP = ARC.length + 3
export const MAX_GAP = 14

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

// The spacing and shape of cactus n, deterministic from the seed.
export function gapAfter(seed: number, n: number): number {
  const r = rng(hash(seed + ':gap:' + n))
  return MIN_GAP + Math.floor(r() * (MAX_GAP - MIN_GAP + 1))
}

export function isTall(seed: number, n: number): boolean {
  return rng(hash(seed + ':tall:' + n))() < 0.4
}

export const heightOf = (o: Obstacle) => (o.tall ? 2 : 1)

export function speedFor(score: number): number {
  return Math.max(MIN_SPEED, START_SPEED - Math.floor(score / RAMP) * SPEED_STEP)
}

export function newGame(seed: number, stats: Stats): Game {
  return { seed, height: 0, jump: -1, obstacles: [], nextIn: gapAfter(seed, 0), spawned: 0, score: 0, paused: true, over: false, record: false, speed: START_SPEED, stats }
}

// Jump. The dinosaur leaves the ground at once and lands after the arc; a
// press in the air does nothing but resume a paused game. The first jump
// starts the game.
export function jump(g: Game): Game {
  if (g.over) return g
  if (g.jump >= 0) return g.paused ? { ...g, paused: false } : g
  return { ...g, jump: 0, height: ARC[0], paused: false }
}

// One tick: the dinosaur moves along its arc, every cactus walks one column
// left, a new one appears when its turn comes, and a cactus taller than the
// dinosaur is high at the dinosaur's column ends the game. Surviving scores a
// point and may speed the clock up.
export function tick(g: Game): Game {
  if (g.over || g.paused) return g
  const jumpNext = g.jump >= 0 ? g.jump + 1 : -1
  const jumpIdx = jumpNext >= ARC.length ? -1 : jumpNext
  const height = jumpIdx >= 0 ? ARC[jumpIdx] : 0
  let obstacles = g.obstacles.map((o) => ({ ...o, col: o.col - 1 })).filter((o) => o.col >= 0)
  let nextIn = g.nextIn - 1
  let spawned = g.spawned
  if (nextIn <= 0) {
    obstacles = [...obstacles, { col: COLS - 1, tall: isTall(g.seed, spawned) }]
    spawned++
    nextIn = gapAfter(g.seed, spawned)
  }
  const hit = obstacles.some((o) => o.col === DINO_COL && heightOf(o) > height)
  if (hit) return { ...g, jump: jumpIdx, height, obstacles, nextIn, spawned, over: true, paused: true }
  const score = g.score + 1
  const record = g.record || score > g.stats.best
  const stats: Stats = { ...g.stats, best: Math.max(g.stats.best, score) }
  return { ...g, jump: jumpIdx, height, obstacles, nextIn, spawned, score, record, stats, speed: speedFor(score) }
}

// The nearest cactus still ahead of the dinosaur, for the status line.
export function nextObstacle(g: Game): Obstacle | undefined {
  return g.obstacles.filter((o) => o.col >= DINO_COL).sort((a, b) => a.col - b.col)[0]
}

export function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  const stats = g.stats as Record<string, unknown> | undefined
  const obstacle = (o: unknown) => !!o && typeof o === 'object' && Number.isInteger((o as Obstacle).col) && (o as Obstacle).col >= 0 && (o as Obstacle).col < COLS && typeof (o as Obstacle).tall === 'boolean'
  return typeof g.seed === 'number' && Number.isInteger(g.height) && (g.height as number) >= 0 && (g.height as number) <= 2 && Number.isInteger(g.jump) && (g.jump as number) >= -1 && (g.jump as number) < ARC.length &&
    Array.isArray(g.obstacles) && g.obstacles.every(obstacle) && Number.isInteger(g.nextIn) && Number.isInteger(g.spawned) && Number.isInteger(g.score) &&
    typeof g.paused === 'boolean' && typeof g.over === 'boolean' && typeof g.record === 'boolean' && Number.isInteger(g.speed) &&
    !!stats && typeof stats === 'object' && ['games', 'best'].every((k) => Number.isInteger(stats[k]))
}
