// big-output: keep huge shell output out of the context window.
//
//   /big-output            show the threshold and the outputs saved this session
//   /big-output 50000      hold output longer than 50,000 characters (default 20,000)
//
// When a Bash result is longer than the threshold, the full output is saved to
// a scratch file and Claude gets the first and last 40 lines plus a note that
// names a `slice` tool it can call to grep or page the rest. Nothing is lost;
// it just isn't all in context at once.

const DEFAULT_THRESHOLD = 20_000
const EDGE_LINES = 40
const MAX_SAVED = 4 * 1024 * 1024 // $.fs.write's limit
const MAX_SLICE_LINES = 400
const MAX_GREP_LINES = 200

type Saved = { id: string; path: string; lines: number; chars: number; command: string }

let scratch = ''
let threshold = DEFAULT_THRESHOLD
let nextId = 1
const saved = new Map<string, Saved>()

function trimmed(stdout: string, s: Saved, cut: boolean): string {
  const lines = stdout.split('\n')
  if (lines.length <= EDGE_LINES * 2 + 1) {
    // Few lines but very long ones: keep a character budget instead.
    return stdout.slice(0, threshold / 2) + '\n\n' + marker(s, cut) + '\n'
  }
  const head = lines.slice(0, EDGE_LINES).join('\n')
  const tail = lines.slice(-EDGE_LINES).join('\n')
  return head + '\n\n' + marker(s, cut) + '\n\n' + tail
}

function marker(s: Saved, cut: boolean): string {
  return (
    '[big-output: this output is ' + s.lines + ' lines and ' + Math.round(s.chars / 1024) + ' KB, so only its head and tail are shown' +
    (cut ? ', and only the first 4 MB was saved' : '') + '. To read more, call the slice tool with id "' + s.id +
    '" and either grep="<regex>" or from=<line> and to=<line>. Lines are numbered from 1.]'
  )
}

function numbered(lines: string[], from: number): string {
  return lines.map((l, i) => String(from + i).padStart(6) + '  ' + l).join('\n')
}

async function save($, command: string, stdout: string): Promise<Saved | null> {
  if (!scratch) return null
  const id = String(nextId++)
  const path = scratch + '/' + id + '.out'
  const text = stdout.length > MAX_SAVED ? stdout.slice(0, MAX_SAVED) : stdout
  await $.fs.write(path, text)
  const s: Saved = { id, path, lines: stdout.split('\n').length, chars: stdout.length, command }
  saved.set(id, s)
  return s
}

async function trimLargeOutput($, e, next) {
  const r = await next(e)
  if (r.deny || !r.result || typeof r.result.stdout !== 'string' || r.result.stdout.length <= threshold) return r
  const s = await save($, e.command, r.result.stdout)
  if (!s) return r
  const cut = r.result.stdout.length > MAX_SAVED
  $.ui.log('saved ' + s.lines + ' lines of output as id ' + s.id + '; Claude sees the head and tail')
  // A fresh { result } without ref or text, so the trimmed stdout is what Claude reads.
  return { result: { ...r.result, stdout: trimmed(r.result.stdout, s, cut) } }
}

async function slice($, e) {
  const s = saved.get(String(e.id))
  if (!s) return { result: 'big-output: no saved output with id "' + e.id + '". Saved ids: ' + ([...saved.keys()].join(', ') || 'none') }
  let text: string
  try {
    text = await $.fs.read(s.path)
  } catch (error) {
    return { result: 'big-output: could not read the saved output: ' + error }
  }
  const lines = text.split('\n')
  if (typeof e.grep === 'string' && e.grep) {
    let re: RegExp
    try {
      re = new RegExp(e.grep, 'i')
    } catch {
      re = new RegExp(e.grep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }
    const context = Number.isInteger(e.context) && e.context > 0 ? Math.min(e.context, 5) : 0
    const hits: number[] = []
    lines.forEach((l, i) => {
      if (re.test(l)) hits.push(i)
    })
    const shown = new Set<number>()
    for (const h of hits) for (let i = Math.max(0, h - context); i <= Math.min(lines.length - 1, h + context); i++) shown.add(i)
    const rows = [...shown].sort((a, b) => a - b).slice(0, MAX_GREP_LINES)
    if (!rows.length) return { result: 'No line matches /' + e.grep + '/i in ' + s.lines + ' lines.' }
    const out = rows.map((i) => String(i + 1).padStart(6) + '  ' + lines[i]).join('\n')
    return { result: hits.length + ' matching line(s)' + (shown.size > rows.length ? ', first ' + rows.length + ' shown' : '') + ':\n' + out }
  }
  const from = Number.isInteger(e.from) && e.from >= 1 ? e.from : 1
  const to = Number.isInteger(e.to) && e.to >= from ? Math.min(e.to, from + MAX_SLICE_LINES - 1) : Math.min(lines.length, from + MAX_SLICE_LINES - 1)
  const part = lines.slice(from - 1, to)
  return { result: 'Lines ' + from + ' to ' + Math.min(to, lines.length) + ' of ' + lines.length + ':\n' + numbered(part, from) }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      const t = await $.store.get('threshold')
      if (typeof t === 'number' && t >= 1000) threshold = t
    } catch {
      threshold = DEFAULT_THRESHOLD
    }
    try {
      scratch = (await $.process.run(['mktemp', '-d'])).stdout.trim()
    } catch (error) {
      scratch = ''
      $.ui.log('big-output: no scratch directory, so outputs will not be trimmed: ' + error)
    }
    try {
      await $.tool.register({
        name: 'slice',
        description: 'Read part of a large shell output that big-output saved. Give the id from the [big-output: ...] note, then either grep (a regex, case-insensitive, with optional context lines) or a from/to line range.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The id from the big-output note' },
            grep: { type: 'string', description: 'Regex to search for; returns matching lines with numbers' },
            context: { type: 'number', description: 'Lines of context around each grep match, up to 5' },
            from: { type: 'number', description: 'First line to return, from 1' },
            to: { type: 'number', description: 'Last line to return; at most 400 lines per call' },
          },
          required: ['id'],
        },
        isDeferred: false,
      })
    } catch (error) {
      $.ui.log('could not register the slice tool: ' + error)
    }
    try {
      await $.command.register({ name: 'big-output', description: 'Threshold for trimming shell output, and what was saved', argumentHint: '[chars]' })
    } catch (error) {
      $.ui.log('could not register /big-output: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'big-output' }, async ($, e) => {
    const args = e.args.trim()
    if (args) {
      const n = Number(args)
      if (!Number.isInteger(n) || n < 1000) return { text: 'Usage: /big-output <characters>, at least 1000.' }
      threshold = n
      await $.store.set('threshold', n)
      return { text: 'Output longer than ' + n + ' characters is trimmed.' }
    }
    const list = [...saved.values()].map((s) => '  id ' + s.id + ': ' + s.lines + ' lines, ' + Math.round(s.chars / 1024) + ' KB, from: ' + s.command.slice(0, 60))
    return { text: 'Trimming output longer than ' + threshold + ' characters. Saved this session:\n' + (list.join('\n') || '  nothing yet') }
  }).catch(async () => ({ text: 'big-output: the command failed, so nothing changed.' }))

  // Not a safety guard: if trimming fails, Claude gets the untrimmed result.
  on('tool.call', { tool: 'Bash' }, trimLargeOutput).catch(async ($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__big-output__slice' }, slice).catch(async () => ({ result: 'big-output: the slice tool failed. Try a narrower range.' }))
}
