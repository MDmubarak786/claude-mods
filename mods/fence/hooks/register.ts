// fence: limit which paths Claude may edit in this project.
//
//   /fence src/ docs/README.md   allow edits only under those paths
//   /fence                       show the current fence
//   /fence off                   remove it
//
// The fence is saved per project root in $.store, so it survives restarts.
// Edit, Write, and NotebookEdit calls outside the fence are refused with a
// reason Claude reads as the tool's result. The guard fails closed: if it
// can't check a path, the edit doesn't happen.

const USAGE = 'No fence set. Usage: /fence src/ docs/README.md    (or /fence off)'

function trimSlashes(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

// Turn what the user typed into an absolute path under the project root.
function resolveAllowed(root: string, typed: string): string | null {
  const path = typed.trim()
  if (!path) return null
  const absolute = path.startsWith('/') ? path : root + '/' + path.replace(/^\.\//, '')
  return trimSlashes(absolute)
}

function isInside(file: string, allowed: string[]): boolean {
  const path = trimSlashes(file)
  return allowed.some((dir) => path === dir || path.startsWith(dir + '/'))
}

function describe(allowed: unknown): string[] {
  return Array.isArray(allowed) ? allowed.filter((p) => typeof p === 'string') : []
}

// The guard. Declared at the top level so static analysis can see its $ calls.
async function guard($, e, next) {
  const root = await $.session.root()
  const allowed = describe(await $.store.get('fence:' + root))
  if (allowed.length === 0) return next(e)

  const file = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
  if (typeof file !== 'string' || isInside(file, allowed)) return next(e)

  $.ui.log('refused an edit outside the fence: ' + file)
  return {
    deny:
      'fence: ' + file + ' is outside the paths the user allowed for this project (' +
      allowed.join(', ') + '). Do not edit it. If the change is required, explain why ' +
      'and ask the user to run /fence to widen the fence.',
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'fence',
        description: 'Limit which paths Claude may edit in this project',
        argumentHint: '[paths... | off]',
        immediate: true,
      })
    } catch (error) {
      $.ui.log('could not register /fence: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'fence' }, async ($, e) => {
    const root = await $.session.root()
    const key = 'fence:' + root
    const args = e.args.trim()

    if (args === 'off') {
      await $.store.delete(key)
      return { text: 'Fence removed. Claude may edit any file.' }
    }
    if (!args) {
      const current = describe(await $.store.get(key))
      return { text: current.length ? 'Fence: ' + current.join(', ') : USAGE }
    }
    const allowed = args
      .split(/\s+/)
      .map((typed) => resolveAllowed(root, typed))
      .filter((path): path is string => path !== null)
    await $.store.set(key, allowed)
    return { text: 'Fence set. Claude may edit only: ' + allowed.join(', ') }
  }).catch(async () => ({ text: 'fence: the command failed, so nothing changed.' }))

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, guard).catch(async ($, e, next) => {
    // The guard had already let the call through: return what came back.
    if (next.called) return next(e)
    // The guard failed before deciding: fail closed.
    return {
      deny:
        'fence: could not check this path (' + next.error.kind + '), so the edit was not made. ' +
        'Ask the user to run /fence off or try again.',
    }
  })
}
