// right-tool: stop Bash doing the job of Read, Grep, and Glob.
//
//   /right-tool        show whether it's on and how many calls were redirected
//   /right-tool off    let every Bash command through
//   /right-tool on     turn it back on
//
// When Claude runs a plain `cat file`, `head`, `tail`, `sed -n`, `grep`, or
// `find -name` in Bash, the call is refused with the exact Read, Grep, or Glob
// call to make instead. Those tools need no permission prompt and keep raw
// shell output out of context. Anything with a pipe, redirection, chain,
// substitution, glob, or an unknown flag passes through untouched.

let enabled = true
let redirected = 0
let redirectedThisTurn = 0

// Shell syntax that means "this is more than a simple read": leave it alone.
const COMPLEX = /[|;&><`$(){}\\]|\n/
// A shell glob in a path means more than one file: not a Read.
const GLOB = /[*?]/

function tokens(command: string): string[] | null {
  const out: string[] = []
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g
  for (const m of command.trim().matchAll(re)) out.push(m[1] ?? m[2] ?? m[3])
  return out.length ? out : null
}

type Redirect = { tool: string; args: Record<string, string | number> }

// Returns the replacement call, or null to let the command run.
function redirect(command: string): Redirect | null {
  if (COMPLEX.test(command)) return null
  const t = tokens(command)
  if (!t) return null
  const [cmd, ...rest] = t

  if (cmd === 'cat') {
    const files = rest.filter((a) => !a.startsWith('-'))
    const flags = rest.filter((a) => a.startsWith('-'))
    if (files.length !== 1 || GLOB.test(files[0]) || flags.some((f) => !/^-[nb]*$/.test(f))) return null
    return { tool: 'Read', args: { file_path: files[0] } }
  }

  if (cmd === 'head' || cmd === 'tail') {
    let n: number | null = null
    const files: string[] = []
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i]
      if (a === '-n' && /^\d+$/.test(rest[i + 1] ?? '')) n = Number(rest[++i])
      else if (/^-n\d+$/.test(a)) n = Number(a.slice(2))
      else if (/^-\d+$/.test(a)) n = Number(a.slice(1))
      else if (a.startsWith('-')) return null
      else files.push(a)
    }
    if (files.length !== 1 || GLOB.test(files[0])) return null
    if (cmd === 'head') return { tool: 'Read', args: { file_path: files[0], limit: n ?? 10 } }
    // tail needs the file length to compute an offset; Read with no offset is still the right tool.
    return { tool: 'Read', args: { file_path: files[0] } }
  }

  if (cmd === 'sed') {
    // sed -n 'A,Bp' file   or   sed -n 'Ap' file
    if (rest.length !== 3 || rest[0] !== '-n') return null
    const range = /^(\d+)(?:,(\d+))?p$/.exec(rest[1])
    if (!range) return null
    const from = Number(range[1])
    const to = range[2] ? Number(range[2]) : from
    if (to < from || GLOB.test(rest[2])) return null
    return { tool: 'Read', args: { file_path: rest[2], offset: from, limit: to - from + 1 } }
  }

  if (cmd === 'grep' || cmd === 'rg') {
    const args: Record<string, string | number> = {}
    const positional: string[] = []
    for (const a of rest) {
      if (a.startsWith('--include=')) args.glob = a.slice('--include='.length)
      else if (a.startsWith('--glob=') || a.startsWith('-g=')) args.glob = a.split('=')[1]
      else if (/^-[rRniwlEFh]+$/.test(a)) {
        if (a.includes('i')) args['-i'] = 'true'
        if (a.includes('n')) args['-n'] = 'true'
        if (a.includes('l')) args.output_mode = 'files_with_matches'
      } else if (a.startsWith('-')) return null
      else positional.push(a)
    }
    if (positional.length < 1 || positional.length > 2) return null
    args.pattern = positional[0]
    if (positional[1]) args.path = positional[1]
    if (args['-n'] && !args.output_mode) args.output_mode = 'content'
    delete args['-n']
    return { tool: 'Grep', args }
  }

  if (cmd === 'find') {
    // find <path> -name <pattern> [-type f]
    const i = rest.indexOf('-name') >= 0 ? rest.indexOf('-name') : rest.indexOf('-iname')
    if (i < 1 || !rest[i + 1]) return null
    const path = rest.slice(0, i)
    const after = rest.slice(i + 2)
    if (path.length !== 1 || !after.every((a, j) => (a === '-type' && after[j + 1] === 'f') || after[j - 1] === '-type')) return null
    const base = path[0] === '.' ? '' : path[0].replace(/\/$/, '') + '/'
    return { tool: 'Glob', args: { pattern: base + '**/' + rest[i + 1] } }
  }

  return null
}

function describe(r: Redirect): string {
  const parts = Object.entries(r.args).map(([k, v]) => k + '=' + (typeof v === 'string' ? JSON.stringify(v) : v))
  return r.tool + ' with ' + parts.join(', ')
}

async function guard($, e, next) {
  if (!enabled) return next(e)
  const r = redirect(e.command)
  if (!r) return next(e)
  redirected += 1
  redirectedThisTurn += 1
  return {
    deny:
      'right-tool: do not use Bash for this. Call the ' + describe(r) + ' tool instead. ' +
      'It needs no permission prompt and its output is formatted for you. Use Bash only for commands that run something.',
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      enabled = (await $.store.get('enabled')) !== false
    } catch {
      enabled = true
    }
    try {
      await $.command.register({
        name: 'right-tool',
        description: 'Redirect cat, grep, find, and sed in Bash to Read, Grep, and Glob',
        argumentHint: '[on | off]',
        immediate: true,
      })
    } catch (error) {
      $.ui.log('could not register /right-tool: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'right-tool' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'on' || args === 'off') {
      enabled = args === 'on'
      await $.store.set('enabled', enabled)
      return { text: enabled ? 'right-tool on.' : 'right-tool off. Every Bash command goes through.' }
    }
    return { text: (enabled ? 'right-tool on' : 'right-tool off') + '. Redirected ' + redirected + ' call(s) since load. /right-tool off or /right-tool on' }
  }).catch(async () => ({ text: 'right-tool: the command failed, so nothing changed.' }))

  // Not a safety guard, so a failure lets the command run rather than blocking it.
  on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => {
    $.ui.log('right-tool skipped a command it could not parse: ' + next.error.kind)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const n = redirectedThisTurn
    redirectedThisTurn = 0
    if (n === 0 || typeof e.agentId === 'string') return next(e)
    return { text: 'right-tool redirected ' + n + ' Bash call(s) to Read, Grep, or Glob this turn.' }
  })
}
