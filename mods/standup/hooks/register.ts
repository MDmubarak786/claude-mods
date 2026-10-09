// standup: your day, written for you.
//
//   /standup                 today's work across every session on this machine, as three bullets
//   /standup 3               the last three days
//   /standup raw             the log itself, no model call
//   /standup --md notes.md   also write the update to a file
//
// Every finished turn in the main conversation is logged: project, files
// touched, and the first line of Claude's answer. /standup asks a small model
// to turn the log into an update. Logs older than 14 days are pruned.

const KEEP_DAYS = 14
const MAX_ENTRIES_PER_KEY = 200
const ANSWER_CHARS = 240

type Entry = { at: number; root: string; files: string[]; answer: string }

let root = ''
let sessionId = ''
let turnFiles = new Set<string>()

function dayOf(ms: number): string {
  const d = new Date(ms)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function firstLine(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#') && !l.startsWith('```')) ?? ''
  return line.length > ANSWER_CHARS ? line.slice(0, ANSWER_CHARS - 1) + '…' : line
}

function relative(file: string, base: string): string {
  return base && file.startsWith(base + '/') ? file.slice(base.length + 1) : file
}

async function prune($) {
  const cutoff = dayOf(Date.now() - KEEP_DAYS * 86400000)
  try {
    for (const key of await $.store.keys()) {
      const m = /^standup:(\d{4}-\d{2}-\d{2}):/.exec(key)
      if (m && m[1] < cutoff) await $.store.delete(key)
    }
  } catch {
    // Pruning is best effort.
  }
}

async function record($, answer: string) {
  const now = Date.now()
  const key = 'standup:' + dayOf(now) + ':' + sessionId
  const entry: Entry = { at: now, root, files: [...turnFiles].map((f) => relative(f, root)).sort(), answer: firstLine(answer) }
  turnFiles = new Set()
  if (!entry.files.length && !entry.answer) return
  try {
    const saved = await $.store.get(key)
    const entries = Array.isArray(saved) ? saved : []
    entries.push(entry)
    await $.store.set(key, entries.slice(-MAX_ENTRIES_PER_KEY))
  } catch (error) {
    $.ui.log('standup could not log this turn: ' + error)
  }
}

async function gather($, days: number): Promise<Entry[]> {
  const since = Date.now() - days * 86400000
  const sinceDay = dayOf(since)
  const out: Entry[] = []
  for (const key of await $.store.keys()) {
    const m = /^standup:(\d{4}-\d{2}-\d{2}):/.exec(key)
    if (!m || m[1] < sinceDay) continue
    const saved = await $.store.get(key)
    if (Array.isArray(saved)) for (const e of saved) if (e && typeof e === 'object' && e.at >= since) out.push(e as Entry)
  }
  return out.sort((a, b) => a.at - b.at)
}

function digest(entries: Entry[]): string {
  const byProject = new Map<string, Entry[]>()
  for (const e of entries) {
    const name = e.root.split('/').pop() || e.root
    if (!byProject.has(name)) byProject.set(name, [])
    byProject.get(name)!.push(e)
  }
  const lines: string[] = []
  for (const [project, list] of byProject) {
    const files = new Set<string>()
    for (const e of list) for (const f of e.files) files.add(f)
    lines.push('## ' + project + ' (' + list.length + ' turn' + (list.length === 1 ? '' : 's') + ', ' + files.size + ' file' + (files.size === 1 ? '' : 's') + ')')
    for (const e of list) {
      const t = new Date(e.at)
      lines.push('- ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + ' ' + (e.answer || '(no summary)') + (e.files.length ? ' [' + e.files.slice(0, 6).join(', ') + (e.files.length > 6 ? ', +' + (e.files.length - 6) : '') + ']' : ''))
    }
  }
  return lines.join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      root = await $.session.root()
      sessionId = await $.session.id()
    } catch {
      root = root || ''
      sessionId = sessionId || 'session'
    }
    try {
      await $.command.register({ name: 'standup', description: 'Summarize what you and Claude did today, across sessions', argumentHint: '[days] [raw] [--md <file>]' })
    } catch (error) {
      $.ui.log('could not register /standup: ' + error)
    }
    await prune($)
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] }, async ($, e, next) => {
    const result = await next(e)
    const file = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
    if (typeof e.agentId !== 'string' && typeof file === 'string' && !result.deny && !result.isError) turnFiles.add(file)
    return result
  }).catch(async ($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (typeof e.agentId !== 'string' && !e.isAborted) await record($, typeof e.answer === 'string' ? e.answer : '')
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'standup' }, async ($, e) => {
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    const md = args.indexOf('--md') >= 0 ? args[args.indexOf('--md') + 1] : null
    const raw = args.includes('raw')
    const days = Math.max(1, Math.min(30, Number(args.find((a) => /^\d+$/.test(a)) ?? 1)))
    const entries = await gather($, days)
    if (!entries.length) return { text: 'Nothing logged in the last ' + days + ' day(s).' }
    const log = digest(entries)
    let text = log
    if (!raw) {
      const r = await $.model.complete({
        model: 'haiku',
        system: 'You write a short standup update from a log of a developer\'s coding sessions with an AI assistant. Three to five bullets, past tense, first person, concrete: name the projects and what changed. No preamble, no headings.',
        prompt: log,
        maxTokens: 400,
        timeoutMs: 20000,
      })
      text = r.isAnswered ? r.text.trim() : 'The model did not answer (' + (r.reason ?? 'unknown') + '), so here is the log:\n' + log
    }
    if (md) {
      const path = md.startsWith('/') ? md : root + '/' + md
      await $.fs.write(path, '# Standup ' + dayOf(Date.now()) + '\n\n' + text + '\n')
      text += '\n\nWritten to ' + path
    }
    return { text }
  }).catch(async () => ({ text: 'standup: the command failed.' }))
}
