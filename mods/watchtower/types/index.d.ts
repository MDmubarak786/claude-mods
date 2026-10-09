// What the band draws from. Settings are read from the other mods' store files;
// the session fields are counted from the conversation's rows as they're saved.
export type View = {
  /** The person turned the band off with /watchtower off. */
  hidden: boolean
  /** The modhub mods loaded in this session, by plugin name. */
  loaded: string[]
  /** Paths fence allows, relative to the project root; null when no fence is set. */
  fence: string[] | null
  /** How many instructions pins holds for this project. */
  pins: number
  /** circuit-breaker's threshold; 0 when it's off, null when it isn't loaded. */
  breaker: number | null
  /** red-green's test command for this project, and whether it's on. */
  tests: { command: string; enabled: boolean } | null
  /** The last red-green verdict seen this session. */
  lastRun: { ok: boolean; text: string } | null
  /** Calls refused this session, by the mod that refused them. */
  blocked: Record<string, number>
  /** Claims trust-but-verify couldn't back this session. */
  unverified: number
}

declare module 'claude-code' {
  interface PluginState {
    watchtower: { view: View }
  }
}
