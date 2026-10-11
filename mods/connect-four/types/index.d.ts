export type Mark = 'X' | 'O'
export type Level = 'easy' | 'normal' | 'hard'
export type Stats = { games: number; wins: number; losses: number; draws: number }
export type Game = {
  /** Seed of this game's opponent choices; 0 until a game exists. */
  seed: number
  /** 42 cells, 7 across by 6 down, row 0 at the top; null is empty. */
  cells: (Mark | null)[]
  /** Which disc you play. Kept across games. */
  you: Mark
  /** Whose disc drops next. */
  turn: Mark
  /** The columns played so far, in order. */
  moves: number[]
  winner: 'you' | 'claude' | 'draw' | null
  /** The four cells of the winning line. */
  winningLine: number[] | null
  level: Level
  /** Who moved first this game. The loser starts the next one. */
  starter: 'you' | 'claude'
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    'connect-four': { game: Game }
  }
}
