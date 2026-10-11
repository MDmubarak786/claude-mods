// The rules of memory pairs, pure: no `$` here, so the tests and the hooks
// module share one implementation.

import type { Game, Stats } from '../types'

export const SIZE = 4
export const CARDS = SIZE * SIZE
// Eight faces, plain ASCII so they draw one cell wide everywhere.
export const FACES = ['@', '#', '$', '%', '&', '*', '+', '=']
// The key that turns each card, in reading order.
export const KEYS = 'abcdefghijklmnop'.split('')

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

export function shuffle(seed: number): number[] {
  const faces = Array.from({ length: CARDS }, (_, i) => i % FACES.length)
  const r = rng(hash(seed + ':deal'))
  for (let i = faces.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[faces[i], faces[j]] = [faces[j], faces[i]]
  }
  return faces
}

export function newGame(seed: number, stats: Stats): Game {
  return { seed, faces: shuffle(seed), matched: new Array(CARDS).fill(false), up: [], turns: 0, done: false, stats }
}

export type TurnResult = { game: Game; error?: string; outcome?: 'first' | 'match' | 'miss' }

// Turn a card. Two mismatched cards left up are turned back by this call first.
export function turn(g: Game, card: number): TurnResult {
  if (g.done) return { game: g, error: 'All pairs found. Press r for a new game.' }
  if (!Number.isInteger(card) || card < 0 || card >= CARDS) return { game: g, error: 'No such card.' }
  if (g.matched[card]) return { game: g, error: 'That pair is already found.' }
  let up = g.up.length === 2 ? [] : g.up
  if (up.includes(card)) return { game: g, error: 'That card is already up.' }
  if (!up.length) return { game: { ...g, up: [card] }, outcome: 'first' }
  const first = up[0]
  const turns = g.turns + 1
  if (g.faces[first] === g.faces[card]) {
    const matched = g.matched.slice()
    matched[first] = true
    matched[card] = true
    const done = matched.every(Boolean)
    const stats: Stats = done
      ? { ...g.stats, finished: g.stats.finished + 1, bestTurns: g.stats.bestTurns ? Math.min(g.stats.bestTurns, turns) : turns }
      : g.stats
    return { game: { ...g, matched, up: [], turns, done, stats }, outcome: 'match' }
  }
  return { game: { ...g, up: [first, card], turns }, outcome: 'miss' }
}

// Turn a mismatched pair back down.
export function hideMiss(g: Game): Game {
  return g.up.length === 2 ? { ...g, up: [] } : g
}

export function pairsFound(g: Game): number {
  return g.matched.filter(Boolean).length / 2
}

export function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  const stats = g.stats as Record<string, unknown> | undefined
  return typeof g.seed === 'number' && Array.isArray(g.faces) && g.faces.length === CARDS && g.faces.every((f) => Number.isInteger(f) && f >= 0 && f < FACES.length) &&
    Array.isArray(g.matched) && g.matched.length === CARDS && g.matched.every((m) => typeof m === 'boolean') &&
    Array.isArray(g.up) && g.up.length <= 2 && g.up.every((c) => Number.isInteger(c) && c >= 0 && c < CARDS) &&
    Number.isInteger(g.turns) && typeof g.done === 'boolean' &&
    !!stats && typeof stats === 'object' && ['games', 'finished', 'bestTurns'].every((k) => Number.isInteger(stats[k]))
}
