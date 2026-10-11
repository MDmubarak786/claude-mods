export type Dir = 'up' | 'down' | 'left' | 'right'
export type Stats = { games: number; best: number }
export type Game = {
  /** Seed of this game's food placement; 0 until a game exists. */
  seed: number
  /** The snake's cells, head first, as row * 20 + column. */
  snake: number[]
  dir: Dir
  /** The direction the next tick turns to, set by a key between ticks. */
  nextDir: Dir
  food: number
  score: number
  /** Ticks so far; also the food counter. */
  ticks: number
  /** Not moving: a fresh game, or paused with p or by closing the pane. */
  paused: boolean
  over: boolean
  /** This game has beaten the best score it started with. */
  record: boolean
  /** Milliseconds between ticks. */
  speed: number
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    snake: { game: Game }
  }
}
