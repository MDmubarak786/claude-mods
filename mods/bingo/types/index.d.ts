// The game as drawn and saved. Positions 0..11 are the first twelve ids, 12 is
// FREE, and 13..24 are the last twelve, so a card has 24 ids.
export type Stats = { cards: number; lines: number; blackouts: number }
export type Game = {
  /** The local date the card belongs to, YYYY-MM-DD; '' until loaded. */
  date: string
  /** The 24 square ids on today's card, in grid order. */
  ids: string[]
  /** Reshuffle count for the day; part of the seed. */
  salt: number
  /** Square id -> when it was marked, as milliseconds. */
  marks: Record<string, number>
  /** Toast each square as it fills, not only completed lines. */
  loud: boolean
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    bingo: { game: Game }
  }
}
