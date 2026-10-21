export type Stats = { games: number; best: number; highest: number }
/** The board as it stood before a move, so undo can put it back. */
export type Snapshot = { cells: number[]; score: number; moves: number; won: boolean }
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
  /** The game before each of the last moves, oldest first, for undo; at most MAX_UNDO. */
  prev: Snapshot[]
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    'game-2048': { game: Game }
  }
}
