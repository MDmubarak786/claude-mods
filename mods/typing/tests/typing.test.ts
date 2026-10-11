import { expect, mock, test } from 'claude-code/testing'
import { HISTORY, SNIPPETS, finish, isGame, marks, newGame, pickSnippet, score, target, type } from '../hooks/game'
import type { Game } from '../types'

const T0 = 1_700_000_000_000

// --- Rules

test('snippets are plain ASCII, one line, at most 72 columns, and a seed picks one but never the last', async () => {
  for (const s of SNIPPETS) {
    expect(s.length <= 72).toBe(true)
    expect(/^[\x20-\x7e]+$/.test(s)).toBe(true)
  }
  const first = pickSnippet(1, -1)
  expect(pickSnippet(1, -1)).toBe(first)
  expect(pickSnippet(1, first)).not.toBe(first)
  const seen = new Set<number>()
  for (let seed = 0; seed < 60; seed++) seen.add(pickSnippet(seed, -1))
  expect(seen.size > 5).toBe(true)
  const g = newGame(1, null)
  const again = newGame(2, g)
  expect(again.snippet).not.toBe(g.snippet)
})

test('typing marks each character, starts the clock at the first key, and scores on finish', async () => {
  let g = newGame(1, null)
  const t = target(g)
  expect(marks(g).every((m) => m === 'todo')).toBe(true)
  g = type(g, '', T0)
  expect(g.startedAt).toBeNull()
  g = type(g, t.slice(0, 3), T0)
  expect(g.startedAt).toBe(T0)
  expect(marks(g).slice(0, 3)).toEqual(['right', 'right', 'right'])
  g = type(g, t.slice(0, 2) + 'Z', T0 + 100)
  expect(g.startedAt).toBe(T0)
  expect(marks(g)[2]).toBe('wrong')
  expect(finish(newGame(1, null), T0).error).toBe('Type the line first.')
  // The whole line, right, in 30 seconds: (chars / 5) words in half a minute.
  g = type(newGame(1, null), t, T0)
  const done = finish(g, T0 + 30_000)
  expect(done.error).toBeUndefined()
  expect(done.game.result?.wpm).toBe(Math.round((t.length / 5) / 0.5))
  expect(done.game.result?.accuracy).toBe(100)
  expect(done.game.result?.ms).toBe(30_000)
  expect(done.game.stats).toEqual({ runs: 1, bestWpm: done.game.result?.wpm })
  expect(done.game.history.length).toBe(1)
  expect(finish(done.game, T0 + 31_000).error).toContain('scored')
  expect(type(done.game, 'x', T0 + 31_000)).toBe(done.game)
  // A fragment is not scored, however fast.
  const half = finish(type(newGame(1, null), t.slice(0, Math.floor(t.length / 2)), T0), T0 + 500)
  expect(half.error).toBe('Finish the line first: ' + (t.length - Math.floor(t.length / 2)) + ' to go.')
  expect(half.game.result).toBeNull()
  // A full line with mistakes: accuracy follows the right characters, wpm too.
  const flawed = t.slice(0, 10) + 'XXXXX' + t.slice(15)
  const bad = finish(type(newGame(1, null), flawed, T0), T0 + 60_000)
  expect(bad.game.result?.accuracy).toBe(Math.round(((t.length - 5) / t.length) * 100))
  expect(bad.game.result?.wpm).toBe(Math.round((t.length - 5) / 5))
  // Extra characters past the end count against accuracy.
  const over = finish(type(newGame(1, null), t + 'zz', T0), T0 + 60_000)
  expect(over.game.result?.accuracy).toBe(Math.round((t.length / (t.length + 2)) * 100))
  expect(score(newGame(1, null), T0)).toBeNull()
})

test('the history keeps the last ten runs, newest first, and the best survives a new line', async () => {
  let g = newGame(1, null)
  for (let i = 0; i < HISTORY + 2; i++) {
    g = finish(type(g, target(g), T0), T0 + 10_000 + i * 1000).game
    g = newGame(100 + i, g)
  }
  expect(g.history.length).toBe(HISTORY)
  expect(g.history[0].ms).toBe(10_000 + (HISTORY + 1) * 1000)
  expect(g.stats.runs).toBe(HISTORY + 2)
  expect(g.stats.bestWpm > 0).toBe(true)
  expect(g.typed).toBe('')
  expect(g.result).toBeNull()
})

test('the guard rejects a malformed game', async () => {
  const g = newGame(1, null)
  expect(isGame(g)).toBe(true)
  expect(isGame({ ...g, snippet: 999 })).toBe(false)
  expect(isGame({ ...g, history: [{ wpm: 1 }] })).toBe(false)
  expect(isGame({ ...g, typed: 5 })).toBe(false)
  expect(isGame(null)).toBe(false)
})

// --- The pane and the commands

function stubs(on, options: { saved?: Map<string, unknown>; toasts?: string[]; placed?: boolean; surfaces?: string[]; unreadable?: boolean } = {}) {
  const saved = options.saved ?? new Map<string, unknown>()
  const clock = mock.clock(on, { now: T0 })
  on('store.get', ($, e) => {
    if (options.unreadable) throw new Error('store offline')
    return { value: saved.get(e.key) }
  })
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    options.toasts?.push(e.text)
    return { value: undefined }
  })
  on('session.surfaces', () => ({ value: options.surfaces ?? ['terminal'] }))
  on('ui.open', () => ({ value: { isPlaced: options.placed ?? true } }))
  on('ui.focus', () => ({}))
  return { saved, clock }
}

const start = ($) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const PANE = { plugin: 'typing', component: 'Pane', requestId: 'typing', surface: 'terminal', viewport: { columns: 120, rows: 40 }, props: { title: 'Typing', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 22 }, view: {} } } as const
const current = (saved: Map<string, unknown>) => saved.get('game') as Game

test('a line is picked and saved at start, and a half-typed line starts over after /clear with the record kept', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  const g = current(saved)
  expect(isGame(g)).toBe(true)
  saved.set('game', { ...g, typed: 'abc', startedAt: T0, stats: { runs: 4, bestWpm: 61 } })
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'Type the line below, then press Enter. The clock starts at your first key.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /best 61 wpm · 4 runs/ })).toBeDefined()
  expect(await ui.find({ key: 'typed' })).toBeDefined()
  await ui.unmount()
})

test('typing colors the line, Enter scores and saves, and n brings a new line', async ($, on) => {
  const toasts: string[] = []
  const { saved, clock } = stubs(on, { toasts })
  await start($)
  const g = current(saved)
  const t = target(g)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await ui.input({ key: 'typed', text: '', kind: 'submit' })
  expect(toasts.pop()).toBe('Type the line first.')
  await ui.input({ key: 'typed', text: t.slice(0, 4), kind: 'change' })
  expect(await ui.find({ type: 'Text', text: '4 of ' + t.length + ', all right so far.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  // Keystrokes are drawn, not saved.
  expect(current(saved).typed).toBe('')
  await ui.input({ key: 'typed', text: t.slice(0, 3) + 'Q', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: '1 wrong so far. Backspace fixes it.' })).toBeDefined()
  await ui.input({ key: 'typed', text: t.slice(0, 5), kind: 'submit' })
  expect(toasts.pop()).toBe('Finish the line first: ' + (t.length - 5) + ' to go.')
  await ui.input({ key: 'typed', text: t + '!', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: '1 past the end. Backspace, then Enter.' })).toBeDefined()
  await clock.advance(20_000)
  await ui.input({ key: 'typed', text: t, kind: 'submit' })
  const done = current(saved)
  expect(done.result?.accuracy).toBe(100)
  expect(done.result?.ms).toBe(20_000)
  expect(done.result?.wpm).toBe(Math.round((t.length / 5) / (20_000 / 60000)))
  expect(await ui.find({ type: 'Text', text: new RegExp('^' + done.result!.wpm + ' words per minute, 100% accurate, in 20\\.0 s\\. Your best!$') })).toBeDefined()
  expect(await ui.find({ key: 'typed' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Last runs' })).toBeDefined()
  await ui.press({ key: 'next' })
  const fresh = current(saved)
  expect(fresh.snippet).not.toBe(g.snippet)
  expect(fresh.typed).toBe('')
  expect(fresh.result).toBeNull()
  expect(fresh.stats.runs).toBe(1)
  expect(fresh.history.length).toBe(1)
  await ui.press({ key: 'again' })
  expect(current(saved).snippet).toBe(fresh.snippet)
  await ui.unmount()
})

test('/typing new and stats, and a summary where nothing draws', async ($, on) => {
  const { saved } = stubs(on, { surfaces: [] })
  await start($)
  const g = current(saved)
  expect((await $.command.run({ command: 'typing', args: '' })).text).toBe('Typing: "' + target(g) + '". Not started. Best 0 wpm over 0 runs. /typing opens the pane.')
  expect((await $.command.run({ command: 'typing', args: 'new' })).text).toMatch(/^New line\. Typing: "/)
  expect(current(saved).snippet).not.toBe(g.snippet)
  expect((await $.command.run({ command: 'typing', args: 'stats' })).text).toBe('Runs 0 · best 0 wpm.')
  expect((await $.command.run({ command: 'typing', args: 'what' })).text).toMatch(/^Usage/)
})

test('/typing prints a summary when a surface exists but the pane cannot be placed', async ($, on) => {
  stubs(on, { placed: false })
  await start($)
  expect((await $.command.run({ command: 'typing', args: '' })).text).toContain('/typing opens the pane')
})

test('a store that cannot be read never wipes the record', async ($, on) => {
  const saved = new Map<string, unknown>()
  const kept = { ...newGame(2, null), stats: { runs: 9, bestWpm: 80 } }
  saved.set('game', kept)
  const { clock } = stubs(on, { saved, unreadable: true })
  await start($)
  const ui = await $.ui.mount(PANE)
  await ui.input({ key: 'typed', text: target(kept), kind: 'change' })
  await clock.advance(5000)
  await ui.input({ key: 'typed', text: target(kept), kind: 'submit' })
  expect(current(saved).stats.runs).toBe(9)
  await ui.unmount()
})

test('a corrupt saved game is replaced, and a narrow pane keeps the field and the controls', async ($, on) => {
  const saved = new Map<string, unknown>()
  saved.set('game', { snippet: 'nope' })
  stubs(on, { saved })
  await start($)
  expect(isGame(saved.get('game'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  for (const key of ['typed', 'next', 'again', 'help']) expect(await ui.find({ key })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeUndefined()
  await ui.press({ key: 'help' })
  expect(await ui.find({ type: 'Text', text: 'How to play' })).toBeDefined()
  await ui.unmount()
})
