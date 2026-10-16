export type Obstacle = {
  /** Column on the lane, 0 at the left; the cactus walks left one column a tick. */
  col: number
  /** Two cells high: only the top of a jump clears it. */
  tall: boolean
}
export type Stats = { games: number; best: number }
export type Game = {
  /** Seed of this game's cactus spacing; 0 until a game exists. */
  seed: number
  /** The dinosaur's height above the ground, 0 to 2. */
  height: number
  /** Which tick of the jump arc the dinosaur is on; -1 on the ground. */
  jump: number
  obstacles: Obstacle[]
  /** Ticks until the next cactus appears at the right edge. */
  nextIn: number
  /** Cacti spawned so far; also the spacing counter. */
  spawned: number
  /** Ticks survived. */
  score: number
  /** Not moving: a fresh game, or paused with p or by closing the pane. */
  paused: boolean
  over: boolean
  /** This game has beaten the best score it started with. */
  record: boolean
  /** Milliseconds between ticks; shrinks as the score grows. */
  speed: number
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    dino: { game: Game }
  }
}
