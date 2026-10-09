// red-green: run the tests after any turn that edited files.
//
//   /red-green npm test       set the test command for this project
//   /red-green detect         pick one from package.json, pyproject.toml, Makefile, Cargo.toml, or go.mod
//   /red-green                show the command and the last result
//   /red-green off | on       pause or resume
//   /fix                      send the last failure to Claude and ask it to fix it
//
// After a turn in which Claude edited a file, the command runs and a line under
// the answer says pass or fail. Nothing runs when nothing was edited.

const TIMEOUT_MS = 180_000
const TAIL_LINES = 30

type Settings = { command: string; enabled: boolean }
type Result = { command: string; exitCode: number; ms: number; tail: string; at: number }

let root = ''
let settings: Settings = { command: '', enabled: true }
let dirty = false
let running = false
let last: Result | null = null

async function load($) {
  try {
    root = await $.session.root()
    const saved = await $.store.get('red-green:' + root)
    if (saved && typeof saved === 'object') settings = { command: String(saved.command ?? ''), enabled: saved.enabled !== false }
  } catch {
    settings = { command: '', enabled: true }
  }
}

async function save($) {
  await $.store.set('red-green:' + root, settings)
}

async function detect($): Promise<string | null> {
  const has = async (file: string) => {
    try {
      return await $.fs.exists(root + '/' + file)
    } catch {
      return false
    }
  }
  if (await has('package.json')) {
    try {
      const pkg = JSON.parse(await $.fs.read(root + '/package.json'))
      if (pkg.scripts && pkg.scripts.test) return (await has('pnpm-lock.yaml')) ? 'pnpm test' : (await has('yarn.lock')) ? 'yarn test' : 'npm test'
    } catch {
      // Unreadable package.json: keep looking.
    }
  }
  if (await has('pyproject.toml')) return 'pytest'
  if (await has('Cargo.toml')) return 'cargo test'
  if (await has('go.mod')) return 'go test ./...'
  if (await has('Makefile')) {
    try {
      if (/^test:/m.test(await $.fs.read(root + '/Makefile'))) return 'make test'
    } catch {
      // Unreadable Makefile.
    }
  }
  return null
}

function tail(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim())
  return lines.slice(-TAIL_LINES).join('\n')
}

async function run($): Promise<Result> {
  const started = Date.now()
  try {
    const r = await $.process.run(['sh', '-c', settings.command], { cwd: root, timeoutMs: TIMEOUT_MS })
    return { command: settings.command, exitCode: r.exitCode, ms: Date.now() - started, tail: tail(r.stdout + '\n' + r.stderr), at: started }
  } catch (error) {
    return { command: settings.command, exitCode: -1, ms: Date.now() - started, tail: String(error), at: started }
  }
}

function verdict(r: Result): string {
  const secs = (r.ms / 1000).toFixed(1) + 's'
  if (r.exitCode === 0) return 'red-green: tests passed (' + r.command + ', ' + secs + ')'
  if (r.exitCode === -1) return 'red-green: could not run ' + r.command + ' (' + r.tail.slice(0, 120) + ')'
  return 'red-green: tests FAILED, exit ' + r.exitCode + ' (' + r.command + ', ' + secs + '). /fix sends the failure to Claude.'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await load($)
    for (const c of [
      { name: 'red-green', description: 'Set or show the test command that runs after edits', argumentHint: '[<command> | detect | on | off]' },
      { name: 'fix', description: 'Ask Claude to fix the last failing test run' },
    ]) {
      try {
        await $.command.register(c)
      } catch (error) {
        $.ui.log('could not register /' + c.name + ': ' + error)
      }
    }
    return next(e)
  })

  on('command.run', { command: 'red-green' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'on' || args === 'off') {
      settings.enabled = args === 'on'
      await save($)
      return { text: settings.enabled ? 'red-green on.' : 'red-green off. Tests are not run after edits.' }
    }
    if (args === 'detect') {
      const found = await detect($)
      if (!found) return { text: 'Nothing recognized. Set one with /red-green <command>.' }
      settings.command = found
      await save($)
      return { text: 'Test command for this project: ' + found }
    }
    if (args) {
      settings.command = args
      await save($)
      return { text: 'Test command for this project: ' + args }
    }
    return {
      text: (settings.command ? 'Test command: ' + settings.command : 'No test command. /red-green detect or /red-green <command>.') +
        (settings.enabled ? '' : ' (off)') + (last ? '\nLast run: ' + verdict(last) : ''),
    }
  }).catch(async () => ({ text: 'red-green: the command failed, so nothing changed.' }))

  on('command.run', { command: 'fix' }, async ($) => {
    if (!last || last.exitCode === 0) return { text: 'No failing test run to fix.' }
    const failure = last
    // A prompt can't be submitted from inside a command, which holds the turn it
    // would wait on. A zero-delay timer runs outside the command and submits it.
    $.clock.after(0, async () => {
      try {
        await $.prompt.submit({
          text: 'The test command `' + failure.command + '` failed with exit code ' + failure.exitCode + ' after your last changes. The end of its output:\n\n```\n' + failure.tail + '\n```\n\nFix the failures, then run the tests again.',
        })
      } catch (error) {
        $.ui.log('red-green could not send the failure to Claude: ' + error)
      }
    })
    return { text: 'Sending the failure to Claude.' }
  }).catch(async () => ({ text: 'red-green: could not send the failure to Claude.' }))

  on('tool.call', { tool: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] }, async ($, e, next) => {
    const result = await next(e)
    if (typeof e.agentId !== 'string' && !result.deny && !result.isError) dirty = true
    return result
  }).catch(async ($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (typeof e.agentId === 'string' || e.isAborted || !dirty || !settings.enabled || !settings.command || running) return next(e)
    dirty = false
    running = true
    try {
      last = await run($)
    } finally {
      running = false
    }
    return { text: verdict(last) }
  }).catch(async ($, e, next) => next(e))
}
