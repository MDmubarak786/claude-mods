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
