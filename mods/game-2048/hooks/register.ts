// 2048: slide tiles, merge equal numbers, reach 2048, in a pane.
//
//   /2048            open the game
//   /2048 new        start a new game
//   /2048 stats      games, best score, highest tile
//
// In the pane: w, a, s and d slide the tiles up, left, down and right; u takes
// the last move back, n starts a new game, h shows the how-to. Nothing here
// calls a model, reads what Claude is doing, or leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Game, Stats } from '../types'
import { GOAL, SIZE, at, isGame, move, newGame, undo, type Dir } from './game'

const PANE = '2048'
const EMPTY_STATS: Stats = { games: 0, best: 0, highest: 0 }
const EMPTY: Game = { seed: 0, cells: [], score: 0, moves: 0, won: false, over: false, prev: null, stats: EMPTY_STATS }
const game = atom({ plugin: 'game-2048', key: 'game' } as const, EMPTY)

// The how-to block: shown on a fresh board until h hides it, for the session.
let help: boolean | null = null
// False after the store could not be read: then nothing is written over the
// saved record until a later load reads it.
let storeOk = true

async function save($, g: Game) {
  if (!storeOk) return
  try {
    await $.store.set('game', g)
  } catch {
    // The drawing still updates; the store catches up on the next change.
  }
}

async function change($, fn: (cur: Game) => Game): Promise<Game> {
  let out: Game | null = null
  await update($, game, (cur) => {
    out = fn(cur)
    return out
  })
  if (out) await save($, out)
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
    await update($, game, () => saved as Game)
    return
  }
  if (!readable) {
    const cur = await read($, game)
    if (!cur.seed) await update($, game, () => newGame(Date.now(), { ...EMPTY_STATS, games: 1 }))
    $.ui.log('2048 could not read its saved game; playing without saving')
    return
  }
  const fresh = newGame(await $.clock.now(), { ...EMPTY_STATS, games: 1 })
  await update($, game, () => fresh)
  await save($, fresh)
}

async function startNew($) {
  const now = await $.clock.now()
  return change($, (cur) => newGame(now, { ...cur.stats, games: cur.stats.games + 1 }))
}

function summary(g: Game): string {
  if (!g.seed) return 'No game yet.'
  const row = (r: number) => Array.from({ length: SIZE }, (_, c) => g.cells[at(r, c)] || '.').join(' ')
  const state = g.over ? 'No moves left.' : g.won ? 'You reached ' + GOAL + '; keep going.' : 'In play.'
  return '2048: ' + Array.from({ length: SIZE }, (_, r) => row(r)).join(' / ') + '. Score ' + g.score + ', best ' + g.stats.best + '. ' + state + ' /2048 opens the pane.'
}

// A tile's color climbs with its value, by theme key so it follows the theme.
function tileColor(v: number): string | undefined {
  if (v >= GOAL) return 'claude'
  if (v >= 512) return 'suggestion'
  if (v >= 128) return 'success'
  if (v >= 32) return 'error'
  if (v >= 8) return 'warning'
  return undefined
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    help = null
    try {
      await load($)
    } catch (error) {
      $.ui.log('2048 could not load its game: ' + error)
    }
    try {
      await $.command.register({ name: '2048', description: 'Play 2048 in a pane', argumentHint: '[new | stats]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /2048: ' + error)
    }
    return next(e)
  })

  // /clear and /resume reset $.state; the game lives on in the store.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await load($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: '2048' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (args === 'new') return { text: 'New game. ' + summary(await startNew($)) }
    if (args === 'stats') {
      const s = (await read($, game)).stats
      return { text: 'Games ' + s.games + ' · best score ' + s.best + ' · highest tile ' + s.highest }
    }
    if (args) return { text: 'Usage: /2048, /2048 new, or /2048 stats' }
    // Under claude -p nothing draws, and ui.open still reports the pane as placed:
    // the surfaces list is the reliable sign.
    let surfaces = []
    try {
      surfaces = await $.session.surfaces()
    } catch {
      surfaces = []
    }
    if (!surfaces.length) return { text: summary(await read($, game)) }
    const placed = await $.ui.open({ id: PANE, title: '2048', focus: true, closeOnEscape: true, rows: 26 })
    if (!placed.isPlaced) return { text: summary(await read($, game)) }
    return {}
  }).catch(async () => ({ text: '2048: the command failed.' }))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const g = await read($, game)
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!g.seed) return Text({ children: ['No game loaded. /2048 new starts one.'] })
    const columns = e.props.bodyColumns || 60
    const wide = columns >= 50
    const showHelp = help ?? (wide && g.moves === 0)

    const status = g.over ? { text: 'No moves left. Score ' + g.score + '. Press n for a new game.', color: 'error', bold: true }
      : g.won ? { text: 'You made ' + GOAL + '! Keep going for a higher tile, or n for a new game.', color: 'success', bold: true }
      : g.moves === 0 ? { text: 'Slide with w, a, s, d. Equal tiles that touch merge.', color: 'suggestion' }
      : { text: 'Score ' + g.score + (g.score > 0 && g.stats.best <= g.score ? ' · a new best' : ' · best ' + g.stats.best), color: 'suggestion' }

    const header = Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
        Text({ bold: true, children: ['2048'] }),
        Text({ children: ['score ', Text({ bold: true, children: [String(g.score)] })] }),
        Text({ dimColor: true, children: ['best ' + g.stats.best + ' · highest ' + g.stats.highest + ' · move ' + g.moves] }),
      ] }),
      Text({ color: status.color, bold: status.bold, wrap: 'wrap', children: [status.text] }),
    ] })

    // Every tile is a fixed-width Box with the number at its right edge, so the
    // grid lines up on any surface; the background climbs with the value.
    const tile = (r: number, c: number) => {
      const v = g.cells[at(r, c)]
      const backgroundColor = tileColor(v)
      return Box({ width: 6, justifyContent: 'flex-end', backgroundColor, children: [Text({ bold: v >= 128, color: backgroundColor ? 'inverseText' : undefined, dimColor: !v, children: [v ? String(v) : '.'] })] })
    }
    const grid = Box({ flexDirection: 'column', children: Array.from({ length: SIZE }, (_, r) => Box({ flexDirection: 'row', columnGap: 1, children: Array.from({ length: SIZE }, (_, c) => tile(r, c)) })) })

    const slideButton = (key: string, dir: Dir, label: string) =>
      Button({ key, label, hotkey: key, plain: true, onPress: async () => {
        let error: string | undefined
        await change($, (cur) => {
          const r = move(cur, dir)
          error = r.error
          return r.game
        })
        if (error) $.ui.toast(error)
      } })
    const controls = Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
      slideButton('w', 'up', 'Up'),
      slideButton('a', 'left', 'Left'),
      slideButton('s', 'down', 'Down'),
      slideButton('d', 'right', 'Right'),
    ] })

    const howTo = Box({ flexDirection: 'column', borderStyle: 'round', borderColor: 'suggestion', paddingX: 1, children: [
      Text({ bold: true, children: ['How to play'] }),
      Text({ wrap: 'wrap', children: ['1. Press w, a, s or d: every tile slides that way as far as it can.'] }),
      Text({ wrap: 'wrap', children: ['2. Two equal tiles that meet merge into one, and its value is added to your score. A new 2 (or 4) appears after each move.'] }),
      Text({ wrap: 'wrap', children: ['3. Make a 2048 tile. The game ends when no slide changes the board. u takes one move back.'] }),
      Text({ dimColor: true, wrap: 'wrap', children: ['Keys need the pane focused: click it if nothing happens. h hides this.'] }),
    ] })

    const footer = Box({ flexDirection: 'row', columnGap: 3, flexWrap: 'wrap', children: [
      Button({ key: 'new', label: 'New game', hotkey: 'n', plain: true, onPress: () => startNew($) }),
      Button({ key: 'undo', label: 'Undo', hotkey: 'u', plain: true, onPress: async () => {
        let error: string | undefined
        await change($, (cur) => {
          const r = undo(cur)
          error = r.error
          return r.game
        })
        if (error) $.ui.toast(error)
      } }),
      Button({ key: 'help', label: showHelp ? 'Hide help' : 'Help', hotkey: 'h', plain: true, dimColor: true, onPress: () => {
        help = !showHelp
        $.ui.invalidate('ui.render')
      } }),
      Text({ dimColor: true, children: ['Esc closes'] }),
    ] })

    return Box({ flexDirection: 'column', rowGap: 1, children: showHelp ? [header, grid, controls, howTo, footer] : [header, grid, controls, footer] })
  })
}
