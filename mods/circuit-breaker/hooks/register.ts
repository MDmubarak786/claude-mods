// circuit-breaker: stop Claude from retrying the same failing shell command.
//
//   /breaker        show the threshold
//   /breaker 5      hold a command after 5 identical failures in a row
//   /breaker off    turn the breaker off
//
// A streak is kept per agent (main conversation or subagent) and cleared when
// that agent's turn ends. Once a command has failed `threshold` times in a row,
// the next identical call is held and the user picks: Stop, or Try once more.
// Under `claude -p` nobody can answer, so the call is refused.

const DEFAULT_THRESHOLD = 3
const MAX_ERROR_CHARS = 300

type Streak = { command: string; failures: number; lastError: string }

// Per agent id ('main' for the main conversation). Lost on reload, which is fine.
const streaks = new Map<string, Streak>()

function agentKey(e): string {
  return typeof e.agentId === 'string' ? e.agentId : 'main'
}

function shorten(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

function errorTail(result): string {
  const text = typeof result.text === 'string' ? result.text : typeof result.result === 'string' ? result.result : ''
  return shorten(text.slice(-MAX_ERROR_CHARS * 2), MAX_ERROR_CHARS)
}

// The guard. Top level so static analysis can see its $ calls.
async function guard($, e, next) {
  const key = agentKey(e)
  const streak = streaks.get(key)

  let threshold = DEFAULT_THRESHOLD
  try {
    const saved = await $.store.get('threshold')
    if (typeof saved === 'number') threshold = saved
  } catch {
    // A store that can't be read leaves the default in place.
  }

  if (threshold > 0 && streak && streak.command === e.command && streak.failures >= threshold) {
    let answer = 'Stop'
    try {
      // The wait is inside a mods API call, so it doesn't count against the hook budget.
      answer = await $.ui.ask(
        shorten(e.command, 80) + ' has failed ' + streak.failures + ' times in a row. Let Claude try it again?',
        ['Stop', 'Try once more'],
      )
    } catch {
      // Dismissed, "Chat about this", or a claude -p run with nobody to ask.
    }
    if (answer !== 'Try once more') {
      return {
        deny:
          'circuit-breaker: this command has failed ' + streak.failures + ' times in a row with the same result, ' +
          'and the user chose to stop. Do not run it again. Explain what you think is wrong, propose a different ' +
          'approach, or ask the user. Last error: ' + (streak.lastError || '(none captured)'),
      }
    }
  }

  const result = await next(e)
  if (result.deny) return result

  if (result.isError) {
    if (streak && streak.command === e.command) {
      streak.failures += 1
      streak.lastError = errorTail(result)
    } else {
      streaks.set(key, { command: e.command, failures: 1, lastError: errorTail(result) })
    }
    $.ui.invalidate('ui.render')
  } else {
    streaks.delete(key)
  }
  return result
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'breaker',
        description: 'Hold a shell command after it fails N times in a row',
        argumentHint: '[N | off]',
        immediate: true,
      })
    } catch (error) {
      $.ui.log('could not register /breaker: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'breaker' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'off') {
      await $.store.set('threshold', 0)
      return { text: 'Breaker off. Commands are never held.' }
    }
    if (args) {
      const n = Number(args)
      if (!Number.isInteger(n) || n < 1) return { text: 'Usage: /breaker <N> (a whole number, 1 or more) or /breaker off' }
      await $.store.set('threshold', n)
      return { text: 'Breaker set. A command is held after ' + n + ' identical failures in a row.' }
    }
    const saved = await $.store.get('threshold')
    const threshold = typeof saved === 'number' ? saved : DEFAULT_THRESHOLD
    return { text: threshold > 0 ? 'Breaker: hold after ' + threshold + ' identical failures. /breaker <N> or /breaker off' : 'Breaker off. /breaker <N> to turn it on.' }
  }).catch(async () => ({ text: 'circuit-breaker: the command failed, so nothing changed.' }))

  on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => {
    if (next.called) return next(e)
    return { deny: 'circuit-breaker: could not evaluate this command (' + next.error.kind + '), so it was not run. Try again.' }
  })

  // Clear the streak when the agent's turn ends. A subagent's turn carries its agentId.
  on('turn.complete', async ($, e, next) => {
    streaks.delete(agentKey(e))
    return next(e)
  })

  // Show a building streak beside the spinner for the main conversation.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const streak = streaks.get('main')
    if (!streak || streak.failures < 2) return next(e)
    return next({ ...e, props: { ...e.props, suffix: ' · same command failed ' + streak.failures + '×' } })
  })
}
