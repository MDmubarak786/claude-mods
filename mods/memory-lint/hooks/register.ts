// memory-lint: know whether your auto-memory index loaded whole.
//
//   /memory-lint              report the index: size, entries, and what's past the limit
//   /memory-lint limit 300    set the line limit you believe applies (default 200)
//   /memory-lint path <file>  point at a different index file
//
// Claude Code reads the project's MEMORY.md index at session start, up to a
// limit that isn't documented, and a session can't tell whether it got the
// whole file. This mod measures the file at every start, after compaction,
// and after each edit to it, and names the entries past the limit you set.

const DEFAULT_LIMIT = 200

let home = ''
let root = ''
let indexPath = ''
let limit = DEFAULT_LIMIT

type Report = { exists: boolean; lines: number; bytes: number; entries: number; past: string[] }

function slug(path: string): string {
  return path.replace(/[^A-Za-z0-9]/g, '-')
}

async function locate($) {
  try {
    root = await $.session.root()
  } catch {
    root = ''
  }
  try {
    const saved = await $.store.get('limit')
    if (typeof saved === 'number' && saved > 0) limit = saved
  } catch {
    limit = DEFAULT_LIMIT
  }
  try {
    const override = await $.store.get('path:' + root)
    if (typeof override === 'string' && override) {
      indexPath = override
      return
    }
  } catch {
    // Fall through to the default path.
  }
  try {
    home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
  } catch {
    home = ''
  }
  indexPath = home && root ? home + '/.claude/projects/' + slug(root) + '/memory/MEMORY.md' : ''
}

async function measure($): Promise<Report> {
  const none: Report = { exists: false, lines: 0, bytes: 0, entries: 0, past: [] }
  if (!indexPath) return none
  try {
    if (!(await $.fs.exists(indexPath))) return none
    const text = await $.fs.read(indexPath)
    const lines = text.split('\n')
    const entries = lines.filter((l) => /^\s*[-*]\s/.test(l))
    const past = lines.slice(limit).filter((l) => /^\s*[-*]\s/.test(l)).map((l) => l.trim().replace(/^[-*]\s+/, ''))
    return { exists: true, lines: lines.length, bytes: text.length, entries: entries.length, past }
  } catch {
    return none
  }
}

function summary(r: Report): string {
  if (!r.exists) return 'No memory index at ' + (indexPath || '(unknown path)') + '.'
  return 'MEMORY.md: ' + r.lines + ' lines, ' + r.entries + ' entries, ' + Math.round(r.bytes / 1024) + ' KB. Limit ' + limit + ' lines.' +
    (r.past.length ? ' ' + r.past.length + ' entr' + (r.past.length === 1 ? 'y is' : 'ies are') + ' past the limit and may not have loaded.' : ' Under the limit.')
}

async function lint($, why: string) {
  const r = await measure($)
  if (!r.exists) return
  if (r.past.length) {
    $.ui.status('memory-lint: ' + r.lines + ' lines, ' + r.past.length + ' entries past line ' + limit + ' may not load. /memory-lint lists them.')
  } else {
    $.ui.status(undefined)
    $.ui.log('memory index ' + why + ': ' + r.lines + ' lines, ' + r.entries + ' entries, under the ' + limit + '-line limit')
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await locate($)
    try {
      await $.command.register({ name: 'memory-lint', description: 'Check whether the memory index fits the load limit', argumentHint: '[limit N | path <file>]' })
    } catch (error) {
      $.ui.log('could not register /memory-lint: ' + error)
    }
    await lint($, 'at start')
    return next(e)
  })

  on('classic.SessionStart', { source: ['compact', 'clear', 'resume'] }, async ($, e, next) => {
    await lint($, 'after ' + e.source)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  // The index changed during the session: measure it again.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const result = await next(e)
    if (indexPath && e.file_path === indexPath && !result.deny && !result.isError) await lint($, 'after an edit')
    return result
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'memory-lint' }, async ($, e) => {
    const args = e.args.trim()
    const lim = /^limit\s+(\d+)$/.exec(args)
    if (lim) {
      limit = Number(lim[1])
      await $.store.set('limit', limit)
      await lint($, 'with the new limit')
      return { text: 'Limit set to ' + limit + ' lines. ' + summary(await measure($)) }
    }
    const path = /^path\s+(.+)$/.exec(args)
    if (path) {
      indexPath = path[1].trim()
      await $.store.set('path:' + root, indexPath)
      return { text: 'Index path for this project: ' + indexPath + '. ' + summary(await measure($)) }
    }
    if (args) return { text: 'Usage: /memory-lint, /memory-lint limit N, or /memory-lint path <file>' }
    const r = await measure($)
    const lines = [summary(r)]
    if (r.exists) lines.push('Path: ' + indexPath)
    if (r.past.length) lines.push('Past the limit:', ...r.past.map((p) => '  - ' + p))
    return { text: lines.join('\n') }
  }).catch(async () => ({ text: 'memory-lint: the command failed.' }))
}
