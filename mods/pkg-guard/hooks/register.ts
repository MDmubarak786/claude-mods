// pkg-guard: hold installs of packages Claude guessed.
//
//   /pkg-guard         show whether it's on and what it checked this session
//   /pkg-guard off     let every install through
//   /pkg-guard on      turn it back on
//
// When Claude runs npm/pnpm/yarn/pip/uv/cargo install for a package that isn't
// already in the project's lockfile, the mod looks the package up on its
// registry. A package that doesn't exist, is under 30 days old, or has very few
// downloads is held with the facts in the question, and refused by default.

const MIN_AGE_DAYS = 30
const MIN_WEEKLY_DOWNLOADS = 100
const CACHE_MS = 24 * 60 * 60 * 1000

type Eco = 'npm' | 'pypi' | 'crates'
type Facts = { exists: boolean; ageDays: number | null; weekly: number | null; repo: string | null }
type Check = { eco: Eco; name: string; facts: Facts; reason: string | null }

let enabled = true
const checked: string[] = []

const LOCKFILES: Record<Eco, string[]> = {
  npm: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'],
  pypi: ['uv.lock', 'poetry.lock', 'requirements.txt', 'Pipfile.lock'],
  crates: ['Cargo.lock'],
}

function tokens(command: string): string[] {
  const out: string[] = []
  for (const m of command.trim().matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

// Returns the ecosystem and bare package names an install command adds, or null.
function parseInstall(command: string): { eco: Eco; names: string[] } | null {
  // Only the first simple command of a line is checked; chains are split and each part checked.
  const t = tokens(command)
  if (t.length < 2) return null
  const [cmd, sub, ...rest] = t
  let eco: Eco | null = null
  let args = rest
  if ((cmd === 'npm' && ['install', 'i', 'add'].includes(sub)) || (cmd === 'pnpm' && ['add', 'install', 'i'].includes(sub)) || (cmd === 'yarn' && sub === 'add') || (cmd === 'bun' && ['add', 'install', 'i'].includes(sub))) eco = 'npm'
  else if ((cmd === 'pip' || cmd === 'pip3') && sub === 'install') eco = 'pypi'
  else if (cmd === 'uv' && sub === 'add') eco = 'pypi'
  else if (cmd === 'uv' && sub === 'pip' && rest[0] === 'install') { eco = 'pypi'; args = rest.slice(1) }
  else if (cmd === 'cargo' && sub === 'add') eco = 'crates'
  if (!eco) return null

  const names: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-r' || a === '--requirement' || a === '-e' || a === '--editable') { i++; continue }
    if (a.startsWith('-')) continue
    if (/^(\.|\/|~|file:|git\+|https?:|git@|github:)/.test(a) || a.endsWith('.whl') || a.endsWith('.tar.gz')) continue
    names.push(bareName(eco, a))
  }
  return names.length ? { eco, names } : null
}

function bareName(eco: Eco, spec: string): string {
  if (eco === 'npm') {
    // @scope/name@1.2.3 or name@^1
    const at = spec.lastIndexOf('@')
    return at > 0 ? spec.slice(0, at) : spec
  }
  if (eco === 'pypi') return spec.split(/[\[<>=!~;@ ]/)[0].toLowerCase().replace(/_/g, '-')
  return spec.split('@')[0]
}

async function inLockfile($, eco: Eco, name: string): Promise<boolean> {
  for (const file of LOCKFILES[eco]) {
    try {
      if (!(await $.fs.exists(file))) continue
      const text = await $.fs.read(file)
      const needle = eco === 'npm' ? 'node_modules/' + name + '"' : eco === 'crates' ? 'name = "' + name + '"' : name
      if (text.toLowerCase().includes(needle.toLowerCase())) return true
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

async function guard($, e, next) {
  if (!enabled) return next(e)
  // Check each simple command in a chain.
  const parts = e.command.split(/&&|;|\|\|/)
  const suspects: Check[] = []
  for (const part of parts) {
    const install = parseInstall(part)
    if (!install) continue
    for (const name of install.names) {
      if (await inLockfile($, install.eco, name)) continue
      const c = await check($, install.eco, name)
      checked.push(describe(c))
      if (c.reason) suspects.push(c)
    }
  }
  if (!suspects.length) return next(e)

  let answer = 'Refuse'
  try {
    answer = await $.ui.ask('pkg-guard: ' + suspects.map(describe).join('; ') + '. Install anyway?', ['Refuse', 'Install'])
  } catch {
    // Nobody to ask: refuse.
  }
  if (answer !== 'Install') {
    return {
      deny:
        'pkg-guard: this install was refused. ' + suspects.map(describe).join('. ') + '. ' +
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
    if (!parseInstall(e.command) && !e.command.split(/&&|;|\|\|/).some((p) => parseInstall(p))) return next(e)
    return { deny: 'pkg-guard: could not check this install (' + next.error.kind + '), so it was not run. Try again, or ask the user to run /pkg-guard off.' }
  })
}
