export type Stats = { games: number; best: number; highest: number }
export type Game = {
  /** Seed of this game's tile spawns; 0 until a game exists. */
  seed: number
  /** 16 tiles in reading order; 0 is empty. */
  cells: number[]
  score: number
  /** Moves that changed the board; also the spawn counter. */
  moves: number
  /** A 2048 tile has appeared; play goes on. */
  won: boolean
  /** No move changes the board. */
  over: boolean
  /** The game before the last move, for one undo. */
  prev: { cells: number[]; score: number; moves: number; won: boolean } | null
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    'game-2048': { game: Game }
  }
}
