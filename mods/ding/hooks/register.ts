// ding: a sound and a desktop notification when Claude finishes a turn or needs you.
//
//   /ding          show whether it's on
//   /ding off      quiet for this machine until /ding on
//   /ding on       turn it back on
//   /ding test     play both sounds now
//
// "Done" fires at the end of a main-conversation turn. "Needs you" fires when
// Claude asks a question (AskUserQuestion) or a tool call is about to show you a
// permission prompt. Subagent turns and calls are ignored. Sounds and
// notifications use the system's own tools, so there are no audio files here.

type Kind = 'done' | 'needs-you'

let os = ''          // 'Darwin', 'Linux', or '' when unknown
let enabled = true

async function loadSettings($) {
  try {
    const saved = await $.store.get('enabled')
    enabled = saved !== false
  } catch {
    enabled = true
  }
  try {
    const uname = await $.process.run(['uname'])
    os = uname.stdout.trim()
  } catch {
    os = ''
  }
}

// Fire and forget: nothing here is awaited, so a slow player never delays Claude.
function notify($, kind: Kind, title: string, body: string) {
  if (!enabled) return
  if (os === 'Darwin') {
    const sound = kind === 'done' ? '/System/Library/Sounds/Glass.aiff' : '/System/Library/Sounds/Ping.aiff'
    $.process.run(['afplay', sound]).catch(() => {})
    // Title and body go in as arguments, never spliced into the script.
    $.process.run([
      'osascript',
      '-e', 'on run argv',
      '-e', 'display notification (item 2 of argv) with title (item 1 of argv)',
      '-e', 'end run',
      title, body,
    ]).catch(() => {})
  } else if (os === 'Linux') {
    const sound = kind === 'done' ? '/usr/share/sounds/freedesktop/stereo/complete.oga' : '/usr/share/sounds/freedesktop/stereo/dialog-information.oga'
    $.process.run(['paplay', sound]).catch(() => {})
    $.process.run(['notify-send', '--app-name=Claude Code', title, body]).catch(() => {})
  } else {
    $.ui.toast(title + ': ' + body)
  }
}

function excerpt(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 100 ? line.slice(0, 99) + '…' : line || 'Turn finished'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await loadSettings($)
    try {
      await $.command.register({
        name: 'ding',
        description: 'Sound and notification when Claude finishes or needs you',
        argumentHint: '[on | off | test]',
        immediate: true,
      })
    } catch (error) {
      $.ui.log('could not register /ding: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'ding' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'off' || args === 'on') {
      enabled = args === 'on'
      await $.store.set('enabled', enabled)
      return { text: enabled ? 'ding on.' : 'ding off. Run /ding on to turn it back on.' }
    }
    if (args === 'test') {
      notify($, 'done', 'Claude finished', 'This is the done sound.')
      notify($, 'needs-you', 'Claude needs you', 'This is the needs-you sound.')
      return { text: enabled ? 'Played both.' : 'ding is off, so nothing played. Run /ding on first.' }
    }
    return { text: (enabled ? 'ding on' : 'ding off') + (os ? ' (' + os + ')' : ' (unknown OS: toasts only)') + '. /ding off, /ding on, /ding test' }
  }).catch(async () => ({ text: 'ding: the command failed, so nothing changed.' }))

  // Done: the main conversation's turn ended. Subagent turns carry agentId.
  on('turn.complete', async ($, e, next) => {
    if (typeof e.agentId !== 'string') {
      notify($, 'done', e.isAborted ? 'Claude stopped' : 'Claude finished', excerpt(e.answer))
    }
    return next(e)
  })

  // Needs you: Claude is asking a question.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (typeof e.agentId !== 'string') {
      const first = Array.isArray(e.questions) && e.questions[0] ? String(e.questions[0].question) : 'Claude has a question'
      notify($, 'needs-you', 'Claude has a question', excerpt(first))
    }
    return next(e)
  }).catch(async ($, e, next) => next(e))

  // Needs you: a tool call is about to show a permission prompt. Observe only:
  // the decision is returned exactly as it came.
  on('tool.check', async ($, e, next) => {
    const decided = await next(e)
    if (decided.decision === 'ask' && typeof e.agentId !== 'string') {
      notify($, 'needs-you', 'Claude needs permission', e.tool)
    }
    return decided
  }).catch(async ($, e, next) => next(e))
}
