// pkg-guard: hold installs of packages Claude guessed.
//
//   /pkg-guard         show whether it's on and what it checked this session
//   /pkg-guard off     let every install through
//   /pkg-guard on      turn it back on
//
// When Claude runs npm/pnpm/yarn/bun/pip/uv/cargo install for a package that isn't
// already in the project's lockfile, the mod looks the package up on its
// registry. A package that doesn't exist, is under 30 days old, or has very few
// downloads is held with the facts in the question, and refused by default.
// A package installed from a URL, a git repository, or a tarball can't be
// checked against a registry, so it's held too.

const MIN_AGE_DAYS = 30
const MIN_WEEKLY_DOWNLOADS = 100
const CACHE_MS = 24 * 60 * 60 * 1000

type Eco = 'npm' | 'pypi' | 'crates'
type Facts = { exists: boolean; ageDays: number | null; weekly: number | null; repo: string | null }
type Check = { eco: Eco; name: string; facts: Facts; reason: string | null }
type Install = { eco: Eco; names: string[]; unverifiable: string[] }

let enabled = true
const checked: string[] = []

const LOCKFILES: Record<Eco, string[]> = {
  npm: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock'],
  pypi: ['uv.lock', 'poetry.lock', 'requirements.txt', 'Pipfile.lock'],
  crates: ['Cargo.lock'],
}

// Separators between simple commands: chains, pipes, background, newlines, and
// command substitution, so an install hidden in `$(...)` or after `|` is seen.
const SEPARATORS = /&&|\|\||;|\||&|\n|\$\(|`/
// Prefixes that don't change what runs: sudo, env assignments, and wrappers.
const PREFIX = /^(?:sudo|doas|env|command|exec|nohup|time|nice|xvfb-run)$|^[A-Za-z_][A-Za-z0-9_]*=\S*$/
const REMOTE = /^(?:https?:|git\+|git@|github:|gitlab:|bitbucket:|ssh:|git:)/
const LOCAL = /^(?:\.|\/|~|file:)/

function tokens(command: string): string[] {
  const out: string[] = []
  for (const m of command.trim().matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)) out.push((m[1] ?? m[2] ?? m[3]).replace(/[)`]+$/, ''))
  return out.filter(Boolean)
}

// Returns the ecosystem and package names one simple command installs, or null.
function parseInstall(part: string): Install | null {
  let t = tokens(part)
  while (t.length && PREFIX.test(t[0])) t = t.slice(1)
  if (t.length < 2) return null
  // python -m pip install ...  and  py -m pip install ...
  if (/^python[23]?(?:\.\d+)?$|^py$/.test(t[0]) && t[1] === '-m' && t[2] === 'pip') t = t.slice(2)
  const [cmd, sub, ...rest] = t
  let eco: Eco | null = null
  let args = rest
  if ((cmd === 'npm' && ['install', 'i', 'add', 'in', 'ins', 'inst', 'isntall'].includes(sub)) || (cmd === 'pnpm' && ['add', 'install', 'i'].includes(sub)) || (cmd === 'yarn' && sub === 'add') || (cmd === 'bun' && ['add', 'install', 'i'].includes(sub)) || (cmd === 'npx' && sub === 'npm' && rest[0] === 'install')) {
    eco = 'npm'
    if (cmd === 'npx') args = rest.slice(1)
  } else if ((cmd === 'pip' || cmd === 'pip3' || /^pip3?\.\d+$/.test(cmd)) && sub === 'install') eco = 'pypi'
  else if (cmd === 'uv' && sub === 'add') eco = 'pypi'
  else if (cmd === 'uv' && sub === 'pip' && rest[0] === 'install') { eco = 'pypi'; args = rest.slice(1) }
  else if (cmd === 'pipx' && sub === 'install') eco = 'pypi'
  else if (cmd === 'poetry' && sub === 'add') eco = 'pypi'
  else if (cmd === 'cargo' && (sub === 'add' || sub === 'install')) eco = 'crates'
  if (!eco) return null

  const names: string[] = []
  const unverifiable: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') continue
    if (['-r', '--requirement', '-e', '--editable', '-c', '--constraint', '--index-url', '-i', '--extra-index-url', '--find-links', '-f', '--registry', '--git', '--path', '--index'].includes(a)) {
      // A flag with a value: a git/URL source for cargo or pip is unverifiable.
      const v = args[i + 1] ?? ''
      if (['--git', '--index-url', '-i', '--extra-index-url', '--find-links', '-f', '--registry', '--index'].includes(a) && v) unverifiable.push(a + ' ' + v)
      i++
      continue
    }
    if (a.startsWith('-')) continue
    if (LOCAL.test(a)) continue
    if (REMOTE.test(a) || /\.(?:tgz|tar\.gz|zip|whl)$/.test(a) || a.includes('://')) {
      unverifiable.push(a)
      continue
    }
    const bare = bareName(eco, a)
    if (bare === null) unverifiable.push(a)
    else names.push(bare)
  }
  return names.length || unverifiable.length ? { eco, names, unverifiable } : null
}

// The registry name behind a spec, or null when the spec can't be reduced to one.
function bareName(eco: Eco, spec: string): string | null {
  if (eco === 'npm') {
    // alias@npm:target@range  or  npm:target@range
    let s = spec
    const alias = /^[^@]+@npm:(.+)$/.exec(s) ?? /^npm:(.+)$/.exec(s)
    if (alias) s = alias[1]
    if (/@(?:git|https?|file|github|npm):/.test(s) || s.includes('://')) return null
    const at = s.lastIndexOf('@')
    const name = at > 0 ? s.slice(0, at) : s
    return /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name) ? name : null
  }
  if (eco === 'pypi') {
    if (spec.includes('@') || spec.includes('://')) return null
    const name = spec.split(/[\[<>=!~; ]/)[0]
    return /^[A-Za-z0-9][\w.-]*$/.test(name) ? name.toLowerCase().replace(/[_.]/g, '-') : null
  }
  const name = spec.split('@')[0]
  return /^[A-Za-z0-9][\w-]*$/.test(name) ? name : null
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Whether a lockfile lists exactly this package, as a whole token in the format's
// own syntax: "requests-oauthlib" in a lockfile never vouches for "requests".
function lockfileHas(eco: Eco, file: string, text: string, name: string): boolean {
  const n = escapeRe(name)
  if (eco === 'npm') {
    if (file === 'package-lock.json') return new RegExp('"node_modules/' + n + '"\\s*:').test(text)
    if (file === 'pnpm-lock.yaml') return new RegExp('^\\s*[\'"]?/?' + n + '@[^\\n]*:\\s*$', 'm').test(text)
    if (file === 'yarn.lock') return new RegExp('^"?' + n + '@', 'm').test(text)
    if (file === 'bun.lock') return new RegExp('^\\s*"' + n + '"\\s*:', 'm').test(text)
    return false
  }
  if (eco === 'pypi') {
    // PyPI names compare with -, _, and . as the same character.
    const loose = n.replace(/\\\.|[-_]/g, '[-_.]')
    if (file === 'requirements.txt') return new RegExp('^\\s*' + loose + '\\s*(?:[=<>!~\\[;@ ]|$)', 'mi').test(text)
    if (file === 'Pipfile.lock') return new RegExp('^\\s*"' + loose + '"\\s*:', 'mi').test(text)
    return new RegExp('^name = "' + loose + '"\\s*$', 'mi').test(text)
  }
  return new RegExp('^name = "' + n + '"\\s*$', 'm').test(text)
}

async function inLockfile($, eco: Eco, name: string): Promise<boolean> {
  for (const file of LOCKFILES[eco]) {
    try {
      if (!(await $.fs.exists(file))) continue
      if (lockfileHas(eco, file, await $.fs.read(file), name)) return true
    } catch {
      // A lockfile too large to read counts as unknown: the registry decides.
    }
  }
  return false
}

function daysSince(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null
}

async function lookup($, eco: Eco, name: string): Promise<Facts> {
  const none: Facts = { exists: false, ageDays: null, weekly: null, repo: null }
  if (eco === 'npm') {
    const r = await $.http.fetch('https://registry.npmjs.org/' + encodeURIComponent(name).replace('%40', '@'))
    if (r.status === 404) return none
    if (!r.ok) throw new Error('npm registry answered ' + r.status)
    const meta = JSON.parse(r.text)
    let weekly: number | null = null
    try {
      const d = await $.http.fetch('https://api.npmjs.org/downloads/point/last-week/' + name)
      if (d.ok) weekly = Number(JSON.parse(d.text).downloads) || 0
    } catch {
      weekly = null
    }
    return { exists: true, ageDays: daysSince(meta.time && meta.time.created), weekly, repo: meta.repository && meta.repository.url ? String(meta.repository.url) : null }
  }
  if (eco === 'pypi') {
    const r = await $.http.fetch('https://pypi.org/pypi/' + encodeURIComponent(name) + '/json')
    if (r.status === 404) return none
    if (!r.ok) throw new Error('PyPI answered ' + r.status)
    const meta = JSON.parse(r.text)
    let first: string | undefined
    for (const files of Object.values(meta.releases ?? {}) as any[]) for (const f of files) if (f.upload_time_iso_8601 && (!first || f.upload_time_iso_8601 < first)) first = f.upload_time_iso_8601
    let weekly: number | null = null
    try {
      const d = await $.http.fetch('https://pypistats.org/api/packages/' + encodeURIComponent(name) + '/recent')
      if (d.ok) weekly = Number(JSON.parse(d.text).data.last_week) || 0
    } catch {
      weekly = null
    }
    const urls = (meta.info && meta.info.project_urls) || {}
    return { exists: true, ageDays: daysSince(first), weekly, repo: urls.Source || urls.Repository || urls.Homepage || null }
  }
  const r = await $.http.fetch('https://crates.io/api/v1/crates/' + encodeURIComponent(name), { headers: { 'User-Agent': 'pkg-guard (claude code mod)' } })
  if (r.status === 404) return none
  if (!r.ok) throw new Error('crates.io answered ' + r.status)
  const c = JSON.parse(r.text).crate
  return { exists: true, ageDays: daysSince(c.created_at), weekly: Number(c.recent_downloads) / 13 || 0, repo: c.repository || null }
}

function judge(f: Facts): string | null {
  if (!f.exists) return 'does not exist on the registry'
  if (f.ageDays !== null && f.ageDays < MIN_AGE_DAYS) return 'was first published ' + f.ageDays + ' day(s) ago'
  if (f.weekly !== null && f.weekly < MIN_WEEKLY_DOWNLOADS) return 'has about ' + Math.round(f.weekly) + ' downloads a week'
  return null
}

function describe(c: Check): string {
  const f = c.facts
  return c.eco + ' package "' + c.name + '" ' + (c.reason ?? 'looks established') +
    (f.exists ? ' (age ' + (f.ageDays ?? '?') + ' days, ~' + (f.weekly === null ? '?' : Math.round(f.weekly)) + ' downloads/week' + (f.repo ? ', ' + f.repo : '') + ')' : '')
}

async function check($, eco: Eco, name: string): Promise<Check> {
  const key = 'pkg:' + eco + ':' + name
  try {
    const cached = await $.store.get(key)
    if (cached && typeof cached === 'object' && Date.now() - Number(cached.at) < CACHE_MS) return { eco, name, facts: cached.facts, reason: judge(cached.facts) }
  } catch {
    // No cache: look it up.
  }
  const facts = await lookup($, eco, name)
  try {
    await $.store.set(key, { at: Date.now(), facts })
  } catch {
    // Cache write failure is harmless.
  }
  return { eco, name, facts, reason: judge(facts) }
}

function installsIn(command: string): Install[] {
  return command.split(SEPARATORS).map(parseInstall).filter((x): x is Install => x !== null)
}

async function guard($, e, next) {
  if (!enabled) return next(e)
  const reasons: string[] = []
  for (const install of installsIn(String(e.command ?? ''))) {
    for (const spec of install.unverifiable) reasons.push(install.eco + ' install of "' + spec + '" comes from a URL, git, or an index that can\'t be checked against the registry')
    for (const name of install.names) {
      if (await inLockfile($, install.eco, name)) continue
      const c = await check($, install.eco, name)
      checked.push(describe(c))
      if (c.reason) reasons.push(describe(c))
    }
  }
  if (!reasons.length) return next(e)

  let answer = 'Refuse'
  try {
    answer = await $.ui.ask('pkg-guard: ' + reasons.join('; ') + '. Install anyway?', ['Refuse', 'Install'])
  } catch {
    // Nobody to ask: refuse.
  }
  if (answer !== 'Install') {
    return {
      deny:
        'pkg-guard: this install was refused. ' + reasons.join('. ') + '. ' +
        'Check the exact package name on the registry before trying again, prefer a well-known package, or ask the user.',
    }
  }
  return next(e)
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      enabled = (await $.store.get('enabled')) !== false
    } catch {
      enabled = true
    }
    try {
      await $.command.register({ name: 'pkg-guard', description: 'Hold installs of unknown or brand-new packages', argumentHint: '[on | off]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /pkg-guard: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'pkg-guard' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'on' || args === 'off') {
      enabled = args === 'on'
      await $.store.set('enabled', enabled)
      return { text: enabled ? 'pkg-guard on.' : 'pkg-guard off. Every install goes through.' }
    }
    return { text: (enabled ? 'pkg-guard on' : 'pkg-guard off') + '. Checked this session:\n' + (checked.length ? checked.map((c) => '  ' + c).join('\n') : '  nothing yet') }
  }).catch(async () => ({ text: 'pkg-guard: the command failed, so nothing changed.' }))

  on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => {
    if (next.called) return next(e)
    if (!installsIn(String(e.command ?? '')).length) return next(e)
    return { deny: 'pkg-guard: could not check this install (' + next.error.kind + '), so it was not run. Try again, or ask the user to run /pkg-guard off.' }
  })
}
