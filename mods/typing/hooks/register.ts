// typing: a typing race on lines of code, in a pane.
//
//   /typing            open the race
//   /typing new        a new line
//   /typing stats      runs, best words per minute, the last ten runs
//
// In the pane: a line of code is shown over a field; type it. Each character
// colors right or wrong as you go, and Enter scores the run. n brings the next
// line, r retypes the same one, h shows the how-to. While the field has the
// focus every key goes to it; Esc hands the keys back to the pane. Nothing
// here calls a model, reads what Claude is doing, or leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Game, Run } from '../types'
import { SNIPPETS, finish, isGame, marks, newGame, target, type } from './game'

const PANE = 'typing'
const EMPTY: Game = { seed: 0, snippet: 0, typed: '', startedAt: null, result: null, history: [], stats: { runs: 0, bestWpm: 0 } }
const game = atom({ plugin: 'typing', key: 'game' } as const, EMPTY)

// The how-to block: shown until the first key, or until h has set it either way.
let help: boolean | null = null
// False after the store could not be read: then nothing is written over the
// saved record until a later load reads it.
let storeOk = true

async function save($, g: Game) {
  if (!storeOk || !g.seed) return
  try {
    await $.store.set('game', g)
  } catch {
    // The drawing still updates; the store catches up on the next change.
  }
}

// Apply a change through update's read-modify-write and mirror it to the
// store. Keystrokes pass `persist: false`: the run is saved when it is scored.
async function change($, fn: (cur: Game) => Game, persist = true): Promise<Game> {
  let out: Game | null = null
  await update($, game, (cur) => {
    out = fn(cur)
    return out
  })
  if (out && persist) await save($, out)
  return out ?? (await read($, game))
}

async function load($) {
  let saved: unknown = undefined
  let readable = true
  try {
    saved = await $.store.get('game')
  } catch {
    readable = false
  }
  storeOk = readable
  if (isGame(saved)) {
    // A half-typed line from before a restart starts over; the record stays.
    const s = saved as Game
    await update($, game, () => (s.result ? s : { ...s, typed: '', startedAt: null }))
    return
  }
  if (!readable) {
    const cur = await read($, game)
    if (!cur.seed) await update($, game, () => newGame(Date.now(), null))
    $.ui.log('typing could not read its saved runs; playing without saving')
    return
  }
  const fresh = newGame(await $.clock.now(), null)
  await update($, game, () => fresh)
  await save($, fresh)
}

async function startNew($, same = false) {
  const now = await $.clock.now()
  return change($, (cur) => (same ? { ...newGame(cur.seed, cur), snippet: cur.snippet } : newGame(now, cur)))
}

// A new line, with the keys handed to the field so typing can start at once.
async function restart($, same: boolean) {
  await startNew($, same)
  try {
    await $.ui.focus({ requestId: PANE, key: 'typed' })
  } catch {
    // The field is drawn with autoFocus anyway; a refused focus is harmless.
  }
}

function runLine(r: Run): string {
  return r.wpm + ' wpm · ' + r.accuracy + '% · ' + (r.ms / 1000).toFixed(1) + ' s'
}

function summary(g: Game): string {
  if (!g.seed) return 'No line yet.'
  const state = g.result ? 'Last run ' + runLine(g.result) + '.' : g.typed ? g.typed.length + ' of ' + target(g).length + ' typed.' : 'Not started.'
  return 'Typing: "' + target(g) + '". ' + state + ' Best ' + g.stats.bestWpm + ' wpm over ' + g.stats.runs + ' runs. /typing opens the pane.'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    help = null
    try {
      await load($)
    } catch (error) {
      $.ui.log('typing could not load its runs: ' + error)
    }
    try {
      await $.command.register({ name: 'typing', description: 'A typing race on lines of code, in a pane', argumentHint: '[new | stats]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /typing: ' + error)
    }
    return next(e)
  })

  // /clear and /resume reset $.state; the record lives on in the store.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await load($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'typing' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (args === 'new') return { text: 'New line. ' + summary(await startNew($)) }
    if (args === 'stats') {
      const g = await read($, game)
      const last = g.history.length ? ' Last: ' + g.history.map(runLine).join(' / ') : ''
      return { text: 'Runs ' + g.stats.runs + ' · best ' + g.stats.bestWpm + ' wpm.' + last }
    }
    if (args) return { text: 'Usage: /typing, /typing new, or /typing stats' }
    // Under claude -p nothing draws, and ui.open still reports the pane as placed:
    // the surfaces list is the reliable sign.
    let surfaces = []
    try {
      surfaces = await $.session.surfaces()
    } catch {
      surfaces = []
    }
    if (!surfaces.length) return { text: summary(await read($, game)) }
    const placed = await $.ui.open({ id: PANE, title: 'Typing', focus: true, closeOnEscape: true, rows: 26 })
    if (!placed.isPlaced) return { text: summary(await read($, game)) }
    return {}
  }).catch(async () => ({ text: 'typing: the command failed.' }))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const g = await read($, game)
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    if (!g.seed) return Text({ children: ['No line loaded. /typing new starts one.'] })
    const columns = e.props.bodyColumns || 60
    const wide = columns >= 50
    const showHelp = help ?? (wide && !g.typed && !g.result && g.stats.runs === 0)
    const t = target(g)
    const m = marks(g)
    const wrong = m.filter((x) => x === 'wrong').length

    const status = g.result ? { text: g.result.wpm + ' words per minute, ' + g.result.accuracy + '% accurate, in ' + (g.result.ms / 1000).toFixed(1) + ' s' + (g.result.wpm >= g.stats.bestWpm && g.result.wpm > 0 ? '. Your best!' : '.'), color: 'success', bold: true }
      : !g.typed ? { text: 'Type the line below, then press Enter. The clock starts at your first key.', color: 'suggestion' }
      : g.typed.length > t.length ? { text: (g.typed.length - t.length) + ' past the end. Backspace, then Enter.', color: 'warning' }
      : wrong ? { text: wrong + ' wrong so far. Backspace fixes it.', color: 'warning' }
      : { text: g.typed.length + ' of ' + t.length + ', all right so far.', color: 'suggestion' }

    const header = Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
        Text({ bold: true, children: ['TYPING'] }),
        Text({ dimColor: true, children: ['line ' + (g.snippet + 1) + '/' + SNIPPETS.length + ' · best ' + g.stats.bestWpm + ' wpm · ' + g.stats.runs + ' runs'] }),
      ] }),
      Text({ color: status.color, bold: status.bold, wrap: 'wrap', children: [status.text] }),
    ] })

    // The target line, each character colored by how it was typed: consecutive
    // characters in the same state share one Text to keep the tree small. The
    // next character to type is underlined.
    const segments: { mark: string; text: string; cursor: boolean }[] = []
    for (let i = 0; i < t.length; i++) {
      const mark = m[i]
      const cursor = !g.result && i === g.typed.length
      const last = segments[segments.length - 1]
      if (last && last.mark === mark && !cursor && !last.cursor) last.text += t[i]
      else segments.push({ mark, text: t[i], cursor })
    }
    const line = Text({ wrap: 'wrap', children: segments.map((s) =>
      Text({
        color: s.mark === 'right' ? 'success' : s.mark === 'wrong' ? 'inverseText' : undefined,
        backgroundColor: s.mark === 'wrong' ? 'error' : undefined,
        dimColor: s.mark === 'todo' && !s.cursor,
        underline: s.cursor,
        bold: s.cursor,
        children: [s.text],
      }),
    ) })
    const extra = g.typed.length > t.length ? Text({ color: 'error', children: [(g.typed.length - t.length) + ' extra character' + (g.typed.length - t.length === 1 ? '' : 's') + ' past the end'] }) : null

    // The field is only told its text when the line is reset: redrawing the
    // person's own text under them would fight the caret.
    const field = g.result ? null : Input({
      key: 'typed',
      value: g.typed ? undefined : '',
      placeholder: 'type here',
      submitLabel: 'score',
      autoFocus: true,
      onInput: async (value) => {
        const now = await $.clock.now()
        await change($, (cur) => type(cur, value, now), false)
      },
      onSubmit: async (value) => {
        const now = await $.clock.now()
        let error: string | undefined
        await change($, (cur) => {
          const r = finish(type(cur, value, now), now)
          error = r.error
          return r.game
        })
        if (error) $.ui.toast(error)
      },
    })

    const history = g.history.length
      ? Box({ flexDirection: 'column', children: [
          Text({ dimColor: true, children: ['Last runs'] }),
          ...g.history.slice(0, wide ? 5 : 3).map((r, i) => Text({ dimColor: i > 0, children: [runLine(r)] })),
        ] })
      : null

    const howTo = Box({ flexDirection: 'column', borderStyle: 'round', borderColor: 'suggestion', paddingX: 1, children: [
      Text({ bold: true, children: ['How to play'] }),
      Text({ wrap: 'wrap', children: ['1. Click the field, or Tab to it, and type the line above exactly, spaces and all.'] }),
      Text({ wrap: 'wrap', children: ['2. Right characters turn green, wrong ones red; Backspace fixes them. The clock runs from your first key.'] }),
      Text({ wrap: 'wrap', children: ['3. Press Enter to score: words per minute on what you got right, and accuracy. n brings the next line, r the same one again.'] }),
      Text({ dimColor: true, wrap: 'wrap', children: ['While the field has the focus every key goes to it: press Esc to use n, r or h. h hides this.'] }),
    ] })

    const footer = Box({ flexDirection: 'row', columnGap: 3, flexWrap: 'wrap', children: [
      Button({ key: 'next', label: 'Next line', hotkey: 'n', plain: true, autoFocus: g.result ? true : undefined, onPress: () => restart($, false) }),
      Button({ key: 'again', label: 'Same line again', hotkey: 'r', plain: true, onPress: () => restart($, true) }),
      Button({ key: 'help', label: showHelp ? 'Hide help' : 'Help', hotkey: 'h', plain: true, dimColor: true, onPress: () => {
        help = !showHelp
        $.ui.invalidate('ui.render')
      } }),
      Text({ dimColor: true, children: ['Esc closes'] }),
    ] })

    const parts = [header, line, extra, field, history, showHelp ? howTo : null, footer].filter(Boolean)
    return Box({ flexDirection: 'column', rowGap: 1, children: parts })
  })
}
