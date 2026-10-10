export type Stats = { games: number; wins: number; losses: number }
export type Game = {
  /** Seed of this game's cards and call order; 0 until a game exists. */
  seed: number
  /** Your card, 25 cells in row order; 0 is the FREE center. */
  you: number[]
  /** Claude's card, the same shape. */
  claude: number[]
  /** Numbers called so far, in order. */
  called: number[]
  /** Positions on your card you marked. FREE (12) is always in it. */
  yourMarks: number[]
  /** A line Claude completed; Claude claims it at the next call. */
  claudeLine: string | null
  winner: 'you' | 'claude' | null
  winningLine: string | null
  /** Call a number every `speed` seconds while the pane is open. */
  auto: boolean
  speed: number
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    bingo: { game: Game }
  }
}
