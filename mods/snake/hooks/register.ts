// snake: steer a snake around a board, eat, grow, don't crash, in a pane.
//
//   /snake              open the game
//   /snake new          start a new game
//   /snake speed 100    milliseconds between moves, 60 to 500 (default 150)
//   /snake stats        games, best score
//
// In the pane: w, a, s and d steer (the first press starts the game), p pauses
// and resumes, n starts a new game, h shows the how-to. The snake moves on a
// clock while the pane is open; closing the pane pauses it. Nothing here calls
// a model, reads what Claude is doing, or leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Dir, Game, Stats } from '../types'
import { COLS, DEFAULT_SPEED, MAX_SPEED, MIN_SPEED, ROWS, at, clampSpeed, isGame, newGame, steer, tick } from './game'

const PANE = 'snake'
const EMPTY_STATS: Stats = { games: 0, best: 0 }
const EMPTY: Game = { seed: 0, snake: [0], dir: 'right', nextDir: 'right', food: -1, score: 0, ticks: 0, paused: true, over: false, record: false, speed: DEFAULT_SPEED, stats: EMPTY_STATS }
const game = atom({ plugin: 'snake', key: 'game' } as const, EMPTY)

// The clock that moves the snake, while the pane is open and the game runs.
let timer: { cancel: () => void } | null = null
// The how-to block: shown on a fresh game until the first key, or until h has
// set it either way for the session.
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
// store. Ticks pass `persist: false`: a move every 150 ms is drawn, not saved,
// until something worth keeping happens.
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
    // A game is never running at load: it waits for a key. A stored speed is
    // kept within the clock's range.
    await update($, game, () => ({ ...(saved as Game), paused: true, speed: clampSpeed((saved as Game).speed) }))
    return
  }
  if (!readable) {
    const cur = await read($, game)
    if (!cur.seed) await update($, game, () => newGame(Date.now(), { ...EMPTY_STATS, games: 1 }, DEFAULT_SPEED))
    $.ui.log('snake could not read its saved game; playing without saving')
    return
  }
  const fresh = newGame(await $.clock.now(), { ...EMPTY_STATS, games: 1 }, DEFAULT_SPEED)
  await update($, game, () => fresh)
  await save($, fresh)
}

function stopTimer() {
  if (timer) timer.cancel()
  timer = null
}

// Move the snake every `speed` ms until it pauses or crashes. Eating and
// crashing are saved; plain moves are only drawn.
function startTimer($, g: Game) {
  stopTimer()
  if (g.paused || g.over) return
  timer = $.clock.every(g.speed, async () => {
    try {
      let ate = false
      let ended = false
      const after = await change($, (cur) => {
        const n = tick(cur)
        ate = n.score > cur.score
        ended = n.over && !cur.over
        return n
      }, false)
      if (after.over || after.paused) stopTimer()
      if (ate || ended || after.paused) await save($, after)
      if (ended) $.ui.toast('Game over: ' + after.score + (after.record ? ', a new best! ' : '. ') + 'New game: n', { timeoutMs: 5000 })
    } catch {
      // A failed tick is skipped; the next one tries again.
    }
  })
}

async function startNew($) {
  stopTimer()
  const now = await $.clock.now()
  return change($, (cur) => newGame(now, { ...cur.stats, games: cur.stats.games + 1 }, cur.speed))
}

async function pause($, on: boolean) {
  const g = await change($, (cur) => (cur.over || cur.paused === on ? cur : { ...cur, paused: on }))
  if (on) stopTimer()
  else startTimer($, g)
  return g
}

function summary(g: Game): string {
  if (!g.seed) return 'No game yet.'
  const state = g.over ? 'Game over.' : g.paused ? 'Paused.' : 'Moving.'
  return 'Snake: score ' + g.score + ', length ' + g.snake.length + ', best ' + g.stats.best + ', ' + g.speed + ' ms a move. ' + state + ' /snake opens the pane.'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    help = null
    try {
      await load($)
    } catch (error) {
      $.ui.log('snake could not load its game: ' + error)
    }
    try {
      await $.command.register({ name: 'snake', description: 'Play snake in a pane', argumentHint: '[new | speed N | stats]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /snake: ' + error)
    }
    return next(e)
  })

  // /clear and /resume reset $.state; the game lives on in the store.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    stopTimer()
    await load($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'snake' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (args === 'new') return { text: 'New game. ' + summary(await startNew($)) }
    const speed = /^speed\s+(\d+)$/.exec(args)
    if (speed) {
      const ms = clampSpeed(Number(speed[1]))
      const g = await change($, (cur) => ({ ...cur, speed: ms }))
      if (timer) startTimer($, g)
      return { text: 'A move every ' + ms + ' ms' + (ms !== Number(speed[1]) ? ' (' + MIN_SPEED + ' to ' + MAX_SPEED + ')' : '') + '.' }
    }
    if (args === 'stats') {
      const s = (await read($, game)).stats
      return { text: 'Games ' + s.games + ' · best ' + s.best }
    }
    if (args) return { text: 'Usage: /snake, /snake new, /snake speed N, or /snake stats' }
    // Under claude -p nothing draws, and ui.open still reports the pane as placed:
    // the surfaces list is the reliable sign.
    let surfaces = []
    try {
      surfaces = await $.session.surfaces()
    } catch {
      surfaces = []
    }
    if (!surfaces.length) return { text: summary(await read($, game)) }
    const placed = await $.ui.open({ id: PANE, title: 'Snake', focus: true, closeOnEscape: true, rows: 26 })
    if (!placed.isPlaced) return { text: summary(await read($, game)) }
    return {}
  }).catch(async () => ({ text: 'snake: the command failed.' }))

  // Closing the pane pauses the game.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopTimer()
    await change($, (cur) => (cur.seed && !cur.paused ? { ...cur, paused: true } : cur))
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const g = await read($, game)
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!g.seed) return Text({ children: ['No game loaded. /snake new starts one.'] })
    const columns = e.props.bodyColumns || 60
    const wide = columns >= 50
    const showHelp = help ?? (wide && g.ticks === 0)

    const status = g.over ? { text: 'Game over at ' + g.score + (g.record ? ', a new best. ' : '. ') + 'Press n for a new game.', color: 'error', bold: true }
      : g.ticks === 0 ? { text: 'Press w, a, s or d to start. The snake keeps moving until you steer it.', color: 'suggestion' }
      : g.paused ? { text: 'Paused. Press p, or a direction, to go on.', color: 'warning' }
      : { text: 'Eat the * and don\'t hit the walls or yourself.', color: 'suggestion' }

    const header = Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
        Text({ bold: true, children: ['SNAKE'] }),
        Text({ children: ['score ', Text({ bold: true, children: [String(g.score)] })] }),
        Text({ dimColor: true, children: ['best ' + g.stats.best + ' · length ' + g.snake.length + ' · ' + g.speed + ' ms'] }),
      ] }),
      Text({ color: status.color, bold: status.bold, wrap: 'wrap', children: [status.text] }),
    ] })

    // Every cell is a two-column Box, so the board lines up on any surface; the
    // background carries what is in it, and the glyphs are plain ASCII.
    const head = g.snake[0]
    const body = new Set(g.snake.slice(1))
    const cell = (r: number, c: number) => {
      const i = at(r, c)
      const kind = i === head ? 'head' : body.has(i) ? 'body' : i === g.food ? 'food' : 'empty'
      const backgroundColor = kind === 'head' ? (g.over ? 'error' : 'suggestion') : kind === 'body' ? 'success' : kind === 'food' ? 'warning' : undefined
      const glyph = kind === 'head' ? (g.dir === 'up' ? '^' : g.dir === 'down' ? 'v' : g.dir === 'left' ? '<' : '>') : kind === 'food' ? '*' : kind === 'body' ? ' ' : '.'
      return Box({ width: 2, backgroundColor, children: [Text({ bold: kind !== 'empty', color: backgroundColor ? 'inverseText' : undefined, dimColor: kind === 'empty', children: [glyph] })] })
    }
    const board = Box({ flexDirection: 'column', borderStyle: 'single', borderColor: g.over ? 'error' : 'inactive', children: Array.from({ length: ROWS }, (_, r) => Box({ flexDirection: 'row', children: Array.from({ length: COLS }, (_, c) => cell(r, c)) })) })

    const steerButton = (key: string, dir: Dir, label: string) =>
      Button({ key, label, hotkey: key, plain: true, onPress: async () => {
        const updated = await change($, (cur) => steer(cur, dir))
        if (updated.over) {
          $.ui.toast('The game is over. Press n for a new one.')
          return
        }
        if (!timer) startTimer($, updated)
      } })

    const controls = Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
      steerButton('w', 'up', 'Up'),
      steerButton('a', 'left', 'Left'),
      steerButton('s', 'down', 'Down'),
      steerButton('d', 'right', 'Right'),
      Button({ key: 'pause', label: g.paused ? 'Resume' : 'Pause', hotkey: 'p', plain: true, onPress: async () => {
        const cur = await read($, game)
        if (cur.over) {
          $.ui.toast('The game is over. Press n for a new one.')
          return
        }
        await pause($, !cur.paused)
      } }),
    ] })

    const howTo = Box({ flexDirection: 'column', borderStyle: 'round', borderColor: 'suggestion', paddingX: 1, children: [
      Text({ bold: true, children: ['How to play'] }),
      Text({ wrap: 'wrap', children: ['1. Press w, a, s or d. The snake sets off and keeps moving; each press turns it.'] }),
      Text({ wrap: 'wrap', children: ['2. Run over the * to eat it: the snake grows by one and you score a point.'] }),
      Text({ wrap: 'wrap', children: ['3. Hitting a wall or your own body ends the game. p pauses. /snake speed 100 makes it faster.'] }),
      Text({ dimColor: true, wrap: 'wrap', children: ['Keys need the pane focused: click it if nothing happens. h hides this.'] }),
    ] })

    const footer = Box({ flexDirection: 'row', columnGap: 3, flexWrap: 'wrap', children: [
      Button({ key: 'new', label: 'New game', hotkey: 'n', plain: true, onPress: () => startNew($) }),
      Button({ key: 'help', label: showHelp ? 'Hide help' : 'Help', hotkey: 'h', plain: true, dimColor: true, onPress: () => {
        help = !showHelp
        $.ui.invalidate('ui.render')
      } }),
      Text({ dimColor: true, children: ['Esc closes and pauses'] }),
    ] })

    return Box({ flexDirection: 'column', rowGap: 1, children: showHelp ? [header, board, controls, howTo, footer] : [header, board, controls, footer] })
  })
}
