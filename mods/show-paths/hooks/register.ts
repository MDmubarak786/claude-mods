// show-paths: put the file path on every Read, Edit, Write, Glob, and Grep row.
//
//   /show-paths        show whether it's on
//   /show-paths off    draw rows the way Claude Code does
//   /show-paths on     turn it back on
//
// Claude Code draws a tool row like "Read 1 file (ctrl+o to expand)". This mod
// keeps that row and adds the path, relative to the project root, beside it.
// It changes nothing Claude reads; it only changes what you see.

let root = ''
let enabled = true

// The input field that names what each tool touched.
function pathOf(tool: string, input): string | null {
  if (!input || typeof input !== 'object') return null
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      return typeof input.file_path === 'string' ? input.file_path : null
    case 'NotebookEdit':
      return typeof input.notebook_path === 'string' ? input.notebook_path : null
    case 'Glob':
    case 'Grep': {
      const pattern = typeof input.pattern === 'string' ? input.pattern : null
      if (!pattern) return null
      const where = typeof input.path === 'string' ? input.path : ''
      return where ? pattern + ' in ' + where : pattern
    }
    default:
      return null
  }
}

function relative(path: string): string {
  if (root && path.startsWith(root + '/')) return path.slice(root.length + 1)
  return path
}

async function loadSettings($) {
  try {
    root = await $.session.root()
  } catch {
    root = ''
  }
  try {
    enabled = (await $.store.get('enabled')) !== false
  } catch {
    enabled = true
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await loadSettings($)
    try {
      await $.command.register({
        name: 'show-paths',
        description: 'Show file paths on tool rows',
        argumentHint: '[on | off]',
        immediate: true,
      })
    } catch (error) {
      $.ui.log('could not register /show-paths: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'show-paths' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'on' || args === 'off') {
      enabled = args === 'on'
      await $.store.set('enabled', enabled)
      $.ui.invalidate('ui.render')
      return { text: enabled ? 'show-paths on.' : 'show-paths off. Rows are drawn the way Claude Code draws them.' }
    }
    return { text: (enabled ? 'show-paths on' : 'show-paths off') + '. /show-paths off or /show-paths on' }
  }).catch(async () => ({ text: 'show-paths: the command failed, so nothing changed.' }))

  // Keep Claude Code's row and add the path beside it.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!enabled) return next(e)
    const path = pathOf(e.props.tool, e.props.input)
    if (!path) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    return Box({
      flexDirection: 'row',
      columnGap: 1,
      children: [theirs, Text({ dimColor: true, wrap: 'truncate-start', children: [relative(path)] })],
    })
  })
}
