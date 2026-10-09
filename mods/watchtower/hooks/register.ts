// watchtower: one line above the prompt showing what your guard mods are doing.
//
//   /watchtower        the full status, one mod per line
//   /watchtower off    hide the band (remembered across sessions)
//   /watchtower on     show it again
//
// The line shows only what's active: the fence, how many pins, the breaker
// threshold, the test command and its last result, the calls the guard mods
// refused this session, and claims trust-but-verify couldn't back. With
// nothing active, the band is left to Claude Code and other mods.
//
// Settings come from the other mods' own store files under
// ~/.claude/plugins/store, read only and never written. Activity comes from
// the conversation's rows as they're saved (session.append), which every
// refusal passes through, whatever order the mods load in.

import { atom, read, update } from 'claude-code'
import type { View } from '../types'

// Mods whose refusals start with "<name>: " and are counted as blocked calls.
const GUARDS = ['fence', 'right-tool', 'pkg-guard', 'tripwire', 'circuit-breaker', 'style-cop', 'undo-agent']
const KNOWN = [...GUARDS, 'pins', 'red-green', 'trust-but-verify']
const DEFAULT_THRESHOLD = 3
const FIRST_REFRESH_MS = 800
const REFRESH_EVERY_MS = 15_000
const SEPARATOR = ' │ '

const EMPTY: View = { hidden: false, loaded: [], fence: null, pins: 0, breaker: null, tests: null, lastRun: null, blocked: {}, unverified: 0 }
const view = atom({ plugin: 'watchtower', key: 'view' } as const, EMPTY)

let home = ''
let root = ''
let pending = false

type Segment = { text: string; color?: string }

function relative(path: string): string {
  return root && path.startsWith(root + '/') ? path.slice(root.length + 1) : path
}

// The JSON store file a mod keeps, by its plugin name, newest if there are several
// (an installed copy and a --plugin-dir copy keep separate files).
async function storeOf($, entries, name: string): Promise<Record<string, unknown>> {
  const re = new RegExp('^' + name + '_[A-Za-z0-9.]+-[0-9a-f]+\\.json$')
  const match = entries.filter((x) => x.kind === 'file' && re.test(x.name)).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  if (!match) return {}
  try {
    const data = JSON.parse(await $.fs.read(home + '/.claude/plugins/store/' + match.name))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

// Re-read which mods are loaded and what they're set to. Session counts are kept.
async function refresh($) {
  let loaded: string[] = []
  try {
    const plugins = new Set((await $.command.list()).map((c) => String(c.plugin ?? '').split('@')[0]))
    loaded = KNOWN.filter((m) => plugins.has(m))
  } catch {
    loaded = []
  }
  let entries = []
  try {
    if (home) entries = await $.fs.list(home + '/.claude/plugins/store')
  } catch {
    entries = []
  }

  let fence: string[] | null = null
  if (loaded.includes('fence')) {
    const paths = (await storeOf($, entries, 'fence'))['fence:' + root]
    if (Array.isArray(paths) && paths.length) fence = paths.map((p) => relative(String(p)))
  }
  let pins = 0
  if (loaded.includes('pins')) {
    const list = (await storeOf($, entries, 'pins'))['pins:' + root]
    if (Array.isArray(list)) pins = list.length
  }
  let breaker: number | null = null
  if (loaded.includes('circuit-breaker')) {
    const t = (await storeOf($, entries, 'circuit-breaker')).threshold
    breaker = typeof t === 'number' ? t : DEFAULT_THRESHOLD
  }
  let tests: View['tests'] = null
  if (loaded.includes('red-green')) {
    const s = (await storeOf($, entries, 'red-green'))['red-green:' + root] as { command?: unknown; enabled?: unknown } | undefined
    if (s && typeof s.command === 'string' && s.command) tests = { command: s.command, enabled: s.enabled !== false }
  }

  await update($, view, (v) => {
    const next = { ...v, loaded, fence, pins, breaker, tests }
    return JSON.stringify(next) === JSON.stringify(v) ? v : next
  })
}

// Coalesce bursts (several command rows at once) into one refresh.
function schedule($) {
  if (pending) return
  pending = true
  $.clock.after(300, async () => {
    pending = false
    await refresh($)
  })
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n')
  return ''
}

// Count what a saved row says the guard mods did.
async function observe($, e) {
  if (e.door === 'command') schedule($)
  let blockedBy: string | null = null
  let run: View['lastRun'] = null
  let unverified = 0
  for (const b of e.message.content ?? []) {
    if (b.type === 'tool_result' && b.is_error) {
      const m = /^\s*(?:<tool_use_error>)?\s*([a-z][a-z-]*): /.exec(textOf(b.content))
      if (m && GUARDS.includes(m[1])) blockedBy = m[1]
    }
    // Verdict lines arrive as text: a red-green or trust-but-verify line under an
    // answer, or a /red-green status reply.
    const text = b.type === 'text' ? String(b.text ?? '') : ''
    if (!text) continue
    const rg = /red-green: (tests passed|tests FAILED|skipped|could not run)[^\n]*/.exec(text)
    if (rg) run = { ok: rg[1] === 'tests passed', text: rg[0] }
    if (text.includes('trust-but-verify:')) unverified += (text.match(/✘/g) ?? []).length
  }
  if (!blockedBy && !run && !unverified) return
  await update($, view, (v) => ({
    ...v,
    blocked: blockedBy ? { ...v.blocked, [blockedBy]: (v.blocked[blockedBy] ?? 0) + 1 } : v.blocked,
    lastRun: run ?? v.lastRun,
    unverified: v.unverified + unverified,
  }))
}

function segments(v: View): Segment[] {
  const out: Segment[] = []
  if (v.fence) out.push({ text: 'fence ' + v.fence[0] + (v.fence.length > 1 ? ' +' + (v.fence.length - 1) : ''), color: 'yellow' })
  if (v.pins > 0) out.push({ text: 'pins ' + v.pins })
  if (v.breaker !== null) out.push({ text: v.breaker > 0 ? 'breaker ' + v.breaker : 'breaker off' })
  if (v.tests && v.tests.enabled) {
    if (v.lastRun) out.push(v.lastRun.ok ? { text: 'tests ✔', color: 'green' } : { text: 'tests ✘', color: 'red' })
    else out.push({ text: 'tests: ' + v.tests.command })
  }
  const blocked = Object.entries(v.blocked).sort((a, b) => b[1] - a[1])
  const total = blocked.reduce((n, [, c]) => n + c, 0)
  if (total > 0) out.push({ text: 'blocked ' + total + ': ' + blocked.map(([m, c]) => m + ' ' + c).join(', '), color: 'yellow' })
  if (v.unverified > 0) out.push({ text: v.unverified + ' unverified claim' + (v.unverified === 1 ? '' : 's'), color: 'red' })
  return out
}

// Keep whole segments that fit the band's width, in order.
function fit(all: Segment[], columns: number): Segment[] {
  let used = 'watchtower'.length
  const kept: Segment[] = []
  for (const s of all) {
    const need = SEPARATOR.length + s.text.length
    if (used + need > columns) break
    used += need
    kept.push(s)
  }
  return kept
}

function statusText(v: View): string {
  const has = (m: string) => v.loaded.includes(m)
  const line = (m: string, text: string) => '  ' + m.padEnd(17) + (has(m) ? text : 'not loaded')
  const blocked = Object.entries(v.blocked).map(([m, c]) => m + ' ' + c).join(', ')
  return [
    'watchtower' + (v.hidden ? ' (band hidden: /watchtower on)' : ''),
    line('fence', v.fence ? v.fence.join(', ') : 'no fence'),
    line('pins', v.pins + ' pinned'),
    line('circuit-breaker', v.breaker ? 'hold after ' + v.breaker + ' identical failures' : 'off'),
    line('red-green', v.tests ? v.tests.command + (v.tests.enabled ? '' : ' (off)') + (v.lastRun ? '; last: ' + v.lastRun.text : '') : 'no test command'),
    '  blocked          ' + (blocked || 'nothing this session'),
    '  unverified       ' + v.unverified + ' this session',
  ].join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      root = await $.session.root()
    } catch {
      root = ''
    }
    try {
      home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
    } catch {
      home = ''
    }
    try {
      if ((await $.store.get('hidden')) === true) await update($, view, (v) => ({ ...v, hidden: true }))
    } catch {
      // Shown by default.
    }
    try {
      await $.command.register({ name: 'watchtower', description: 'What your guard mods are doing, shown above the prompt', argumentHint: '[on | off]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /watchtower: ' + error)
    }
    // After the other mods have registered their commands.
    $.clock.after(FIRST_REFRESH_MS, () => refresh($))
    // Settings change in other sessions too: re-read them now and then.
    $.clock.every(REFRESH_EVERY_MS, () => refresh($))
    return next(e)
  })

  on('command.run', { command: 'watchtower' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'on' || args === 'off') {
      const hidden = args === 'off'
      await $.store.set('hidden', hidden)
      await update($, view, (v) => ({ ...v, hidden }))
      return { text: hidden ? 'Band hidden. /watchtower on shows it again.' : 'Band shown.' }
    }
    if (args) return { text: 'Usage: /watchtower, /watchtower on, or /watchtower off' }
    await refresh($)
    return { text: statusText(await read($, view)) }
  }).catch(async () => ({ text: 'watchtower: the command failed.' }))

  // Observe every saved row; never change one.
  on('session.append', async ($, e, next) => {
    const result = await next(e)
    try {
      await observe($, e)
    } catch {
      // Counting is best effort.
    }
    return result
  }).catch(async ($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    schedule($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    const all = v.hidden ? [] : segments(v)
    if (!all.length) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const kept = fit(all, e.props.bodyColumns || 80)
    const line = Box({
      flexDirection: 'row',
      children: [
        Text({ bold: true, children: ['watchtower'] }),
        ...kept.flatMap((s) => [Text({ dimColor: true, children: [SEPARATOR] }), Text(s.color ? { color: s.color, children: [s.text] } : { children: [s.text] })]),
      ],
    })
    // Keep whatever mods after this one draw in the band, below this line.
    const theirs = await next(e)
    return theirs ? Box({ flexDirection: 'column', children: [line, theirs] }) : line
  })
}
