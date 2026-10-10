// The rules of 75-ball bingo, pure: no `$` here, so the tests and the hooks
// module share one implementation.

import type { Game, Stats } from '../types'

export const FREE = 12
export const LETTERS = ['B', 'I', 'N', 'G', 'O']
export const DEFAULT_SPEED = 8

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

// A card: each column draws five of its fifteen numbers; the center is FREE (0).
export function makeCard(seed: number, salt: string): number[] {
  const r = rng(hash(seed + ':' + salt))
  const card = new Array<number>(25).fill(0)
  for (let col = 0; col < 5; col++) {
    const pool = Array.from({ length: 15 }, (_, i) => col * 15 + i + 1)
    for (let row = 0; row < 5; row++) {
      if (row === 2 && col === 2) continue
      const i = Math.floor(r() * pool.length)
      card[row * 5 + col] = pool.splice(i, 1)[0]
    }
  }
  return card
}

export function newGame(seed: number, stats: Stats, speed: number, auto: boolean): Game {
  return { seed, you: makeCard(seed, 'you'), claude: makeCard(seed, 'claude'), called: [], yourMarks: [FREE], claudeLine: null, winner: null, winningLine: null, auto, speed, stats }
}

export function letterOf(n: number): string {
  return LETTERS[Math.floor((n - 1) / 15)] ?? '?'
}

export function callLabel(n: number): string {
  return letterOf(n) + '-' + n
}

const LINES: [string, number[]][] = [
  ...[0, 1, 2, 3, 4].map((r): [string, number[]] => ['row ' + (r + 1), [0, 1, 2, 3, 4].map((c) => r * 5 + c)]),
  ...[0, 1, 2, 3, 4].map((c): [string, number[]] => ['column ' + LETTERS[c], [0, 1, 2, 3, 4].map((r) => r * 5 + c)]),
  ['diagonal ↘', [0, 6, 12, 18, 24]],
  ['diagonal ↗', [4, 8, 12, 16, 20]],
]

export function linesOf(marked: (pos: number) => boolean): string[] {
  return LINES.filter(([, cells]) => cells.every(marked)).map(([name]) => name)
}

// Claude's marks are every called number on its card, and FREE.
export function claudeMarked(g: Game, pos: number): boolean {
  return pos === FREE || g.called.includes(g.claude[pos])
}

export function yourLines(g: Game): string[] {
  return linesOf((pos) => g.yourMarks.includes(pos))
}

export function claudeLines(g: Game): string[] {
  return linesOf((pos) => claudeMarked(g, pos))
}

// The next call. If Claude already has a line, Claude claims it instead:
// the window to shout first was the time since the previous call.
export function callNumber(g: Game): Game {
  if (g.winner) return g
  if (g.claudeLine) {
    return { ...g, winner: 'claude', winningLine: g.claudeLine, stats: { ...g.stats, losses: g.stats.losses + 1 } }
  }
  const left = Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !g.called.includes(n))
  if (!left.length) return g
  const r = rng(hash(g.seed + ':call:' + g.called.length))
  const n = left[Math.floor(r() * left.length)]
  const next = { ...g, called: [...g.called, n] }
  const lines = claudeLines(next)
  return { ...next, claudeLine: lines.length ? lines[0] : null }
}

export type MarkResult = { game: Game; error?: string }

export function toggleMark(g: Game, pos: number): MarkResult {
  if (g.winner) return { game: g, error: 'The game is over. Press n for a new one.' }
  if (pos === FREE) return { game: g, error: 'FREE is always marked.' }
  const n = g.you[pos]
  if (!g.called.includes(n)) return { game: g, error: callLabel(n) + " hasn't been called." }
  const yourMarks = g.yourMarks.includes(pos) ? g.yourMarks.filter((p) => p !== pos) : [...g.yourMarks, pos]
  return { game: { ...g, yourMarks } }
}

export function claim(g: Game): MarkResult {
  if (g.winner) return { game: g, error: 'The game is over.' }
  const lines = yourLines(g)
  if (!lines.length) return { game: g, error: 'Not a bingo: no full row, column, or diagonal yet.' }
  return { game: { ...g, winner: 'you', winningLine: lines[0], stats: { ...g.stats, wins: g.stats.wins + 1 } } }
}

export function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  const card = (c: unknown) => Array.isArray(c) && c.length === 25 && c.every((n) => Number.isInteger(n))
  return typeof g.seed === 'number' && card(g.you) && card(g.claude) && Array.isArray(g.called) && Array.isArray(g.yourMarks) && typeof g.speed === 'number' && !!g.stats && typeof g.stats === 'object'
}
