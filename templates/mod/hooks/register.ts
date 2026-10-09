// __NAME__: __DESCRIPTION__
//
// This starter counts the tool calls Claude makes, shows the count beside the
// spinner, and adds a /__NAME__ command that prints it. Replace it with your mod.
// Every hook gets ($, e, next): the mods API, the event, and the next handler.
// Return next(e) to observe, next({ ...e, changed }) to rewrite, or an object to answer.

// Shared by the hooks below. Resets when the module reloads; use $.state or $.store to keep it.
let calls = 0

export function register(on) {
  // Runs once before the first prompt, and again after each reload.
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: '__NAME__',
        description: 'Show how many tool calls Claude has made',
      })
    } catch (error) {
      // A taken name throws. Catch it so the rest of the hook still runs.
      $.ui.log('could not register /__NAME__: ' + error)
    }
    return next(e)
  })

  // Observe: runs before each tool call and lets it continue unchanged.
  on('tool.call', async ($, e, next) => {
    calls += 1
    $.ui.invalidate('ui.render')
    return next(e)
  }).catch(async ($, e, next) => next(e))

  // Answer: the command's reply prints in the transcript. No next(), so nothing else runs.
  on('command.run', { command: '__NAME__' }, async () => {
    return { text: 'Claude has made ' + calls + ' tool calls since this mod loaded' }
  }).catch(async () => ({ text: '__NAME__: the command failed' }))

  // Rewrite: keep Claude Code's spinner and add text after its word.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (calls === 0) return next(e)
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
