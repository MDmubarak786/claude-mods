export type Run = { wpm: number; accuracy: number; ms: number; chars: number; at: number }
export type Stats = { runs: number; bestWpm: number }
export type Game = {
  /** Seed that picked the snippet; 0 until a game exists. */
  seed: number
  /** Index into the built-in snippet list. */
  snippet: number
  /** What has been typed so far. */
  typed: string
  /** When the first character was typed, in ms; null before that. */
  startedAt: number | null
  /** The score of the finished run; null while typing. */
  result: Run | null
  /** The last ten runs, newest first. */
  history: Run[]
  stats: Stats
}

declare module 'claude-code' {
  interface PluginState {
    typing: { game: Game }
  }
}
