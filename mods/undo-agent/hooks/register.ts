// undo-agent: undo the file edits a subagent made.
//
//   /undo-agent          list the agents that changed files this session
//   /undo-agent last     put back the files the most recent agent changed
//   /undo-agent <id>     the same for one agent by id
//
// /rewind restores your own turns' edits, but a subagent's edits aren't
// captured in checkpoints. This mod snapshots each file before a subagent's
// Edit, Write, or NotebookEdit, and restores them on request.

const MAX_FILE = 4 * 1024 * 1024 // $.fs.read's limit

type Entry = { file: string; snapshot: string | null; created: boolean }
type Group = { agentId: string; entries: Entry[]; skipped: string[]; finished: boolean; order: number }

let scratch = ''
let counter = 0
const groups = new Map<string, Group>()

function fileOf(e): string | null {
  const p = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
  return typeof p === 'string' ? p : null
}

function group(agentId: string): Group {
  let g = groups.get(agentId)
  if (!g) {
    g = { agentId, entries: [], skipped: [], finished: false, order: ++counter }
    groups.set(agentId, g)
  }
  return g
}

// Save the file's current content before the agent changes it, once per file per agent.
async function snapshot($, e, next) {
  const file = fileOf(e)
  const agentId = typeof e.agentId === 'string' ? e.agentId : null
  if (!file || !agentId || !scratch) return next(e)
  const g = group(agentId)
  if (!g.entries.some((x) => x.file === file) && !g.skipped.includes(file)) {
    let exists = false
    try {
      exists = await $.fs.exists(file)
    } catch {
      // Can't tell whether it exists: don't snapshot, and never treat it as created.
      g.skipped.push(file)
      return next(e)
    }
    if (exists) {
      let stat
      try {
        stat = await $.fs.stat(file, { resolve: false })
      } catch {
        g.skipped.push(file)
        return next(e)
      }
      // A symlink or directory is not snapshotted: restoring through a link would write to its target.
      if (stat.kind !== 'file' || stat.size > MAX_FILE) {
        g.skipped.push(file)
        return next(e)
      }
      let content: string
      try {
        content = await $.fs.read(file)
      } catch {
        g.skipped.push(file)
        return next(e)
      }
      const target = scratch + '/' + (++counter) + '.pre'
      await $.fs.write(target, content)
      g.entries.push({ file, snapshot: target, created: false })
    } else {
      g.entries.push({ file, snapshot: null, created: true })
    }
  }
  return next(e)
}

async function restore($, g: Group): Promise<string> {
  const lines: string[] = []
  for (const entry of g.entries) {
    try {
      let kind = 'missing'
      try {
        if (await $.fs.exists(entry.file)) kind = (await $.fs.stat(entry.file, { resolve: false })).kind
      } catch {
        kind = 'unknown'
      }
      if (kind !== 'file' && kind !== 'missing') {
        lines.push('skipped ' + entry.file + ' (it is now a link, a directory, or unreadable)')
        continue
      }
      if (entry.created) {
        if (kind === 'file') await $.process.run(['rm', '-f', '--', entry.file])
        lines.push('removed ' + entry.file)
      } else if (entry.snapshot) {
        await $.fs.write(entry.file, await $.fs.read(entry.snapshot))
        lines.push('restored ' + entry.file)
      }
    } catch (error) {
      lines.push('could not restore ' + entry.file + ': ' + error)
    }
  }
  for (const file of g.skipped) lines.push('skipped ' + file + ' (not snapshotted: a link, a directory, unreadable, or over 4 MiB)')
  groups.delete(g.agentId)
  return lines.join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      const made = await $.process.run(['mktemp', '-d'])
      scratch = made.stdout.trim()
    } catch (error) {
      scratch = ''
      $.ui.log('undo-agent: could not make a scratch directory, so nothing will be snapshotted: ' + error)
    }
    try {
      await $.command.register({
        name: 'undo-agent',
        description: 'Put back the files a subagent changed',
        argumentHint: '[last | <agent id>]',
      })
    } catch (error) {
      $.ui.log('could not register /undo-agent: ' + error)
    }
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, snapshot).catch(async ($, e, next) => {
    // Snapshotting failed: the edit still runs, and the user is told it can't be undone.
    if (next.called) return next(e)
    $.ui.log('undo-agent could not snapshot ' + (fileOf(e) ?? 'a file') + ' (' + next.error.kind + ')')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (typeof e.agentId === 'string') {
      const g = groups.get(e.agentId)
      if (g && g.entries.length) {
        g.finished = true
        $.ui.log('agent ' + e.agentId + ' changed ' + g.entries.length + ' file(s). /undo-agent last puts them back.')
      }
    }
    return next(e)
  })

  on('command.run', { command: 'undo-agent' }, async ($, e) => {
    const args = e.args.trim()
    const all = [...groups.values()].filter((g) => g.entries.length).sort((a, b) => b.order - a.order)
    if (!args) {
      if (!all.length) return { text: 'No subagent has changed files this session.' }
      return {
        text: all
          .map((g) => g.agentId + ': ' + g.entries.length + ' file(s)' + (g.finished ? '' : ' (still running)') + '\n  ' + g.entries.map((x) => x.file).join('\n  '))
          .join('\n'),
      }
    }
    const g = args === 'last' ? all[0] : groups.get(args)
    if (!g || !g.entries.length) return { text: 'No snapshots for ' + (args === 'last' ? 'any agent' : args) + '. /undo-agent lists them.' }
    let answer = 'Cancel'
    try {
      answer = await $.ui.ask('Put back ' + g.entries.length + ' file(s) changed by agent ' + g.agentId + '? This overwrites their current content.', ['Cancel', 'Restore'])
    } catch {
      // Dismissed, or nobody to ask.
    }
    if (answer !== 'Restore') return { text: 'Nothing restored.' }
    return { text: 'Undid agent ' + g.agentId + ':\n' + (await restore($, g)) }
  }).catch(async () => ({ text: 'undo-agent: the command failed. Nothing was restored.' }))
}
