export type Level = 'easy' | 'normal' | 'hard'
/** One entry you made, for undo: the cell and what it held before. */
export type Move = { i: number; from: number }
export type Stats = {
  games: number
  solved: number
  /** Fastest solve per level in ms; 0 until one is solved. */
  bestMs: Record<Level, number>
}
export type Game = {
  /** Seed of this puzzle; 0 until a game exists. */
  seed: number
  level: Level
  /** The puzzle as dealt, 81 cells in row order, 0 for a blank. */
  givens: number[]
  /** The grid as it stands now: the givens plus your entries. */
  cells: number[]
  /** The one solution, for hints. */
  solution: number[]
  /** The cell the keys act on, 0 to 80. */
  cursor: number
  /** Your entries, oldest first, for undo. */
  moves: Move[]
  /** Hints taken this puzzle. */
  hints: number
  done: boolean
  /** Time played before the current stretch, in ms. */
  elapsedMs: number
  /** When the current stretch of play began; null while the pane is closed or before the first entry. */
  startedAt: number | null
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    sudoku: { game: Game }
  }
}
