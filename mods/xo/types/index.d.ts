export type Mark = 'X' | 'O'
export type Level = 'easy' | 'normal' | 'hard'
export type Stats = { games: number; wins: number; losses: number; draws: number }
export type Game = {
  /** Seed of this game's opponent choices; 0 until a game exists. */
  seed: number
  /** The nine squares in reading order; null is empty. */
  board: (Mark | null)[]
  /** Which mark you play. Kept across games. */
  you: Mark
  /** Whose mark moves next. */
  turn: Mark
  /** The squares played so far, in order. */
  moves: number[]
  winner: 'you' | 'claude' | 'draw' | null
  /** The three squares of the winning line. */
  winningLine: number[] | null
  level: Level
  /** Who moved first this game. The loser starts the next one. */
  starter: 'you' | 'claude'
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    xo: { game: Game }
  }
}
