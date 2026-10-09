// style-cop: enforce the style rules Claude keeps ignoring.
//
//   /style-cop               show the active rules and how many edits were refused
//   /style-cop reload        re-read .claude/style-cop.md
//   /style-cop ban <phrase>  ban a word or phrase everywhere, saved across projects
//   /style-cop unban <phrase>
//
// Rules live in <project>/.claude/style-cop.md, one per line:
//   banned: load-bearing, delve, "as an AI"
//   max-comment-ratio: 0.25
//   no-comments-in: *.json, migrations/**
//   rule: Prefer early returns over nested conditionals.
// Every prompt carries the rules as context for Claude. The measurable ones
// (banned phrases, comment density, no-comment files) are enforced on Edit,
// Write, and MultiEdit: a violating edit is refused with the exact line.

const MIN_LINES_FOR_RATIO = 5

type Rules = { banned: string[]; maxCommentRatio: number | null; noCommentsIn: string[]; free: string[] }

let root = ''
let rules: Rules = { banned: [], maxCommentRatio: null, noCommentsIn: [], free: [] }
let globalBans: string[] = []
let refusals = 0
let loadedFrom = ''

function parseRules(text: string): Rules {
  const r: Rules = { banned: [], maxCommentRatio: null, noCommentsIn: [], free: [] }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const m = /^([a-z-]+):\s*(.*)$/i.exec(line)
    if (!m) continue
    const [, key, value] = m
    const list = () => value.split(',').map((s) => s.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean)
    if (key === 'banned') r.banned.push(...list())
    else if (key === 'max-comment-ratio') r.maxCommentRatio = Number(value) || null
    else if (key === 'no-comments-in') r.noCommentsIn.push(...list())
    else if (key === 'rule') r.free.push(value)
  }
  return r
}

async function loadRules($) {
  try {
    root = await $.session.root()
  } catch {
    root = ''
  }
  try {
    const saved = await $.store.get('bans')
    globalBans = Array.isArray(saved) ? saved.filter((b) => typeof b === 'string') : []
  } catch {
    globalBans = []
  }
  const file = root + '/.claude/style-cop.md'
  try {
    if (await $.fs.exists(file)) {
      rules = parseRules(await $.fs.read(file))
      loadedFrom = file
    } else {
      rules = { banned: [], maxCommentRatio: null, noCommentsIn: [], free: [] }
      loadedFrom = ''
    }
  } catch (error) {
    $.ui.log('style-cop could not read ' + file + ': ' + error)
  }
}

function allBans(): string[] {
  return [...new Set([...rules.banned, ...globalBans])]
}

function contextText(): string | null {
  const parts: string[] = []
  const bans = allBans()
  if (bans.length) parts.push('Never use these words or phrases, in code, comments, or prose: ' + bans.join(', ') + '.')
  if (rules.maxCommentRatio !== null) parts.push('Keep comments to at most ' + Math.round(rules.maxCommentRatio * 100) + '% of the lines you add. Do not explain what the code plainly says.')
  if (rules.noCommentsIn.length) parts.push('Add no comments to files matching: ' + rules.noCommentsIn.join(', ') + '.')
  parts.push(...rules.free)
  return parts.length ? 'Style rules for this project (edits that break the measurable ones are refused):\n- ' + parts.join('\n- ') : null
}

const COMMENT_BY_EXT: Record<string, RegExp> = {
  js: /^\s*(\/\/|\/\*|\*)/, jsx: /^\s*(\/\/|\/\*|\*)/, ts: /^\s*(\/\/|\/\*|\*)/, tsx: /^\s*(\/\/|\/\*|\*)/, mjs: /^\s*(\/\/|\/\*|\*)/, cjs: /^\s*(\/\/|\/\*|\*)/,
  java: /^\s*(\/\/|\/\*|\*)/, kt: /^\s*(\/\/|\/\*|\*)/, swift: /^\s*(\/\/|\/\*|\*)/, go: /^\s*(\/\/|\/\*|\*)/, rs: /^\s*(\/\/|\/\*|\*)/, c: /^\s*(\/\/|\/\*|\*)/, h: /^\s*(\/\/|\/\*|\*)/, cpp: /^\s*(\/\/|\/\*|\*)/, cs: /^\s*(\/\/|\/\*|\*)/, scala: /^\s*(\/\/|\/\*|\*)/, dart: /^\s*(\/\/|\/\*|\*)/, php: /^\s*(\/\/|\/\*|\*|#)/,
  py: /^\s*#/, rb: /^\s*#/, sh: /^\s*#/, bash: /^\s*#/, zsh: /^\s*#/, yaml: /^\s*#/, yml: /^\s*#/, toml: /^\s*#/, r: /^\s*#/, pl: /^\s*#/, ex: /^\s*#/, exs: /^\s*#/,
  json: /^\s*(\/\/|\/\*|\*)/, jsonc: /^\s*(\/\/|\/\*|\*)/, json5: /^\s*(\/\/|\/\*|\*)/,
  sql: /^\s*--/, lua: /^\s*--/, hs: /^\s*--/, html: /^\s*<!--/, xml: /^\s*<!--/, vue: /^\s*(<!--|\/\/)/, svelte: /^\s*(<!--|\/\/)/, css: /^\s*(\/\*|\*)/, scss: /^\s*(\/\/|\/\*|\*)/,
}

function commentPattern(file: string): RegExp | null {
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  return COMMENT_BY_EXT[ext] ?? null
}

// A minimal glob, gitignore-style: ** matches any path, * matches within a segment,
// and a glob with no leading / or ** matches at any depth.
function matchesGlob(file: string, glob: string): boolean {
  const rel = root && file.startsWith(root + '/') ? file.slice(root.length + 1) : file
  const anchored = glob.startsWith('/') || glob.startsWith('**')
  const body = glob
    .replace(/^\//, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
  const re = new RegExp('^' + (anchored ? '' : '(?:.*/)?') + body + '$')
  return re.test(rel) || re.test(file)
}

// What the edit adds: new_string for Edit, content for Write, every new_string for MultiEdit.
function addedText(e): string {
  if (e.tool === 'Write') return typeof e.content === 'string' ? e.content : ''
  if (e.tool === 'MultiEdit') return Array.isArray(e.edits) ? e.edits.map((x) => x.new_string ?? '').join('\n') : ''
  return typeof e.new_string === 'string' ? e.new_string : ''
}

function violation(file: string, text: string): string | null {
  const lines = text.split('\n')
  for (const phrase of allBans()) {
    const re = new RegExp('(^|[^\\w-])' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\w-])', 'i')
    const at = lines.findIndex((l) => re.test(l))
    if (at >= 0) return 'the banned phrase "' + phrase + '" on the line: ' + lines[at].trim()
  }
  const pattern = commentPattern(file)
  if (!pattern) return null
  const nonBlank = lines.filter((l) => l.trim())
  const comments = nonBlank.filter((l) => pattern.test(l))
  if (rules.noCommentsIn.some((g) => matchesGlob(file, g)) && comments.length) {
    return 'a comment in a file that must not gain comments: ' + comments[0].trim()
  }
  if (rules.maxCommentRatio !== null && nonBlank.length >= MIN_LINES_FOR_RATIO) {
    const ratio = comments.length / nonBlank.length
    if (ratio > rules.maxCommentRatio) return comments.length + ' comment lines out of ' + nonBlank.length + ' added (' + Math.round(ratio * 100) + '%, the limit is ' + Math.round(rules.maxCommentRatio * 100) + '%)'
  }
  return null
}

async function guard($, e, next) {
  const file = typeof e.file_path === 'string' ? e.file_path : ''
  const text = addedText(e)
  if (!file || !text) return next(e)
  const why = violation(file, text)
  if (!why) return next(e)
  refusals += 1
  $.ui.log('refused an edit to ' + file + ': ' + why)
  return { deny: 'style-cop: this edit was refused because of ' + why + '. Rewrite it without the violation and try again. The project style rules are in your context.' }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await loadRules($)
    try {
      await $.command.register({ name: 'style-cop', description: 'Show, reload, or extend the enforced style rules', argumentHint: '[reload | ban <phrase> | unban <phrase>]' })
    } catch (error) {
      $.ui.log('could not register /style-cop: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'style-cop' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'reload') {
      await loadRules($)
      return { text: loadedFrom ? 'Reloaded ' + loadedFrom : 'No .claude/style-cop.md in this project; only global bans apply.' }
    }
    const ban = /^(ban|unban)\s+(.+)$/.exec(args)
    if (ban) {
      const phrase = ban[2].trim().replace(/^"(.*)"$/, '$1')
      globalBans = ban[1] === 'ban' ? [...new Set([...globalBans, phrase])] : globalBans.filter((b) => b.toLowerCase() !== phrase.toLowerCase())
      await $.store.set('bans', globalBans)
      return { text: (ban[1] === 'ban' ? 'Banned "' : 'Unbanned "') + phrase + '" everywhere.' }
    }
    const ctx = contextText()
    return {
      text: (loadedFrom ? 'Rules from ' + loadedFrom : 'No .claude/style-cop.md in this project') + '. Global bans: ' + (globalBans.length ? globalBans.join(', ') : 'none') + '. Refused ' + refusals + ' edit(s) since load.' + (ctx ? '\n\n' + ctx : ''),
    }
  }).catch(async () => ({ text: 'style-cop: the command failed, so nothing changed.' }))

  on('prompt.submit', async ($, e, next) => {
    const ctx = contextText()
    if (!ctx) return next(e)
    return next({ ...e, context: [...(e.context ?? []), ctx] })
  }).catch(async ($, e, next) => next(e))

  on('tool.call', { tool: ['Edit', 'Write', 'MultiEdit'] }, guard).catch(async ($, e, next) => {
    if (next.called) return next(e)
    return { deny: 'style-cop: could not check this edit (' + next.error.kind + '), so it was not made. Try again.' }
  })
}
