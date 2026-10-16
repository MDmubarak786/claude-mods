// dino: the dinosaur runner, in a pane. Jump the cacti, go as far as you can.
//
//   /dino              open the game
//   /dino new          start a new game
//   /dino stats        games, best score
//
// In the pane: w jumps (the first press starts the game), p pauses and
// resumes, n starts a new game, h shows the how-to. The lane scrolls on a
// clock while the pane is open and speeds up as the score grows; closing the
// pane pauses it. Nothing here calls a model, reads what Claude is doing, or
// leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Game, Stats } from '../types'
import { COLS, DINO_COL, START_SPEED, heightOf, isGame, jump, newGame, nextObstacle, speedFor, tick } from './game'

const PANE = 'dino'
const EMPTY_STATS: Stats = { games: 0, best: 0 }
const EMPTY: Game = { seed: 0, height: 0, jump: -1, obstacles: [], nextIn: 1, spawned: 0, score: 0, paused: true, over: false, record: false, speed: START_SPEED, stats: EMPTY_STATS }
const game = atom({ plugin: 'dino', key: 'game' } as const, EMPTY)

// The clock that scrolls the lane, while the pane is open and the game runs,
// and the interval it was armed with: a faster score re-arms it.
let timer: { cancel: () => void } | null = null
let timerSpeed = 0
// The how-to block: shown on a fresh game until the first jump, or until h has
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
// store. Ticks pass `persist: false`: a step every 120 ms is drawn, not saved,
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
    // A game is never running at load: it waits for a key. The speed always
    // follows the score.
    const s = saved as Game
    await update($, game, () => ({ ...s, paused: true, speed: speedFor(s.score) }))
    return
  }
  if (!readable) {
    const cur = await read($, game)
    if (!cur.seed) await update($, game, () => newGame(Date.now(), { ...EMPTY_STATS, games: 1 }))
    $.ui.log('dino could not read its saved game; playing without saving')
    return
  }
  const fresh = newGame(await $.clock.now(), { ...EMPTY_STATS, games: 1 })
  await update($, game, () => fresh)
  await save($, fresh)
}

function stopTimer() {
  if (timer) timer.cancel()
  timer = null
  timerSpeed = 0
}

// Scroll the lane every `speed` ms until it pauses or the dinosaur crashes.
// A crash is saved; plain steps are only drawn. When the score crosses a speed
// step the clock is re-armed at the new interval.
function startTimer($, g: Game) {
  stopTimer()
  if (g.paused || g.over) return
  timerSpeed = g.speed
  timer = $.clock.every(g.speed, async () => {
    try {
      let ended = false
      const after = await change($, (cur) => {
        const n = tick(cur)
        ended = n.over && !cur.over
        return n
      }, false)
      if (after.over || after.paused) stopTimer()
      else if (after.speed !== timerSpeed) startTimer($, after)
      if (ended || after.paused) await save($, after)
      if (ended) $.ui.toast('Game over: ' + after.score + (after.record ? ', a new best! ' : '. ') + 'New game: n', { timeoutMs: 5000 })
    } catch {
      // A failed tick is skipped; the next one tries again.
    }
  })
}

async function startNew($) {
  stopTimer()
  const now = await $.clock.now()
  return change($, (cur) => newGame(now, { ...cur.stats, games: cur.stats.games + 1 }))
}

async function pause($, on: boolean) {
  const g = await change($, (cur) => (cur.over || cur.paused === on ? cur : { ...cur, paused: on }))
  if (on) stopTimer()
  else startTimer($, g)
  return g
}

const pad = (n: number) => String(n).padStart(5, '0')

function summary(g: Game): string {
  if (!g.seed) return 'No game yet.'
  const state = g.over ? 'Game over.' : g.paused ? 'Paused.' : 'Running.'
  return 'Dino: score ' + g.score + ', best ' + g.stats.best + ', ' + g.speed + ' ms a step. ' + state + ' /dino opens the pane.'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    help = null
    try {
      await load($)
    } catch (error) {
      $.ui.log('dino could not load its game: ' + error)
    }
    try {
      await $.command.register({ name: 'dino', description: 'Play the dinosaur runner in a pane', argumentHint: '[new | stats]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /dino: ' + error)
    }
    return next(e)
  })

  // /clear and /resume reset $.state; the game lives on in the store.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    stopTimer()
    await load($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'dino' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (args === 'new') return { text: 'New game. ' + summary(await startNew($)) }
    if (args === 'stats') {
      const s = (await read($, game)).stats
      return { text: 'Games ' + s.games + ' · best ' + s.best }
    }
    if (args) return { text: 'Usage: /dino, /dino new, or /dino stats' }
    // Under claude -p nothing draws, and ui.open still reports the pane as placed:
    // the surfaces list is the reliable sign.
    let surfaces = []
    try {
      surfaces = await $.session.surfaces()
    } catch {
      surfaces = []
    }
    if (!surfaces.length) return { text: summary(await read($, game)) }
    const placed = await $.ui.open({ id: PANE, title: 'Dino', focus: true, closeOnEscape: true, rows: 18 })
    if (!placed.isPlaced) return { text: summary(await read($, game)) }
    return {}
  }).catch(async () => ({ text: 'dino: the command failed.' }))

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
    if (!g.seed) return Text({ children: ['No game loaded. /dino new starts one.'] })
    const columns = e.props.bodyColumns || 60
    const wide = columns >= 50
    const showHelp = help ?? (wide && g.score === 0 && g.jump < 0)
    const ahead = nextObstacle(g)

    const status = g.over ? { text: 'Game over at ' + g.score + (g.record ? ', a new best. ' : '. ') + 'Press n for a new game.', color: 'error', bold: true }
      : g.score === 0 && g.jump < 0 ? { text: 'Press w to jump. The first jump starts the run.', color: 'suggestion' }
      : g.paused ? { text: 'Paused. Press p, or w, to go on.', color: 'warning' }
      : ahead && ahead.tall ? { text: 'A tall cactus ahead: jump at the last moment to clear it.', color: 'warning' }
      : { text: 'Jump the cacti. The ground gets faster as you go.', color: 'suggestion' }

    const header = Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
        Text({ bold: true, children: ['DINO'] }),
        Text({ children: ['score ', Text({ bold: true, children: [pad(g.score)] })] }),
        Text({ dimColor: true, children: ['HI ' + pad(g.stats.best) + ' · ' + g.speed + ' ms'] }),
      ] }),
      Text({ color: status.color, bold: status.bold, wrap: 'wrap', children: [status.text] }),
    ] })

    // The lane is three rows of two-column Boxes, the ground row at the bottom.
    // The dinosaur sits at its height in column DINO_COL; a cactus fills its
    // column from the ground up to its height. Colors carry what is where, and
    // the glyphs are plain ASCII so every surface lines them up.
    const cacti = new Map<number, number>()
    for (const o of g.obstacles) cacti.set(o.col, Math.max(cacti.get(o.col) ?? 0, heightOf(o)))
    const cell = (y: number, c: number) => {
      const dino = c === DINO_COL && y === g.height
      const cactus = (cacti.get(c) ?? 0) > y
      const kind = dino ? 'dino' : cactus ? 'cactus' : y === 0 ? 'ground' : 'sky'
      const backgroundColor = kind === 'dino' ? (g.over ? 'error' : 'success') : kind === 'cactus' ? 'warning' : undefined
      const glyph = kind === 'dino' ? 'D' : kind === 'cactus' ? '#' : kind === 'ground' ? '.' : ' '
      return Box({ width: 2, backgroundColor, children: [Text({ bold: kind === 'dino', color: backgroundColor ? 'inverseText' : undefined, dimColor: kind === 'ground', children: [glyph] })] })
    }
    const lane = Box({ flexDirection: 'column', borderStyle: 'single', borderColor: g.over ? 'error' : 'inactive', children: [2, 1, 0].map((y) => Box({ flexDirection: 'row', children: Array.from({ length: COLS }, (_, c) => cell(y, c)) })) })

    const controls = Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
      Button({ key: 'w', label: 'Jump', hotkey: 'w', plain: true, onPress: async () => {
        const updated = await change($, jump)
        if (updated.over) {
          $.ui.toast('The game is over. Press n for a new one.')
          return
        }
        if (!timer) startTimer($, updated)
      } }),
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
      Text({ wrap: 'wrap', children: ['1. Press w to jump. The lane starts scrolling, and cacti come at you from the right.'] }),
      Text({ wrap: 'wrap', children: ['2. A small cactus is one cell high and a tall one is two: the tall ones only clear at the top of a jump, so jump late.'] }),
      Text({ wrap: 'wrap', children: ['3. Every 100 points the ground gets faster. Hitting a cactus ends the run. p pauses.'] }),
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

    return Box({ flexDirection: 'column', rowGap: 1, children: showHelp ? [header, lane, controls, howTo, footer] : [header, lane, controls, footer] })
  })
}
