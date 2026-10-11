export type Stats = { games: number; finished: number; bestTurns: number }
export type Game = {
  /** Seed of this game's shuffle; 0 until a game exists. */
  seed: number
  /** The face under each of the 16 cards, 0 to 7, each twice. */
  faces: number[]
  /** Cards whose pair has been found. */
  matched: boolean[]
  /** Cards face up and not yet matched: none, one, or a mismatched two. */
  up: number[]
  /** Pairs of cards turned so far. */
  turns: number
  done: boolean
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    pairs: { game: Game }
  }
}
