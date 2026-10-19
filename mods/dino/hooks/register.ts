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
import { ARC, COLS, DINO_COL, MIN_SPEED, RAMP, START_SPEED, heightOf, isGame, jump, newGame, nextObstacle, speedFor, tick } from './game'

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
// The jump index drawn last time, so a landing can kick up dust once.
let lastJump = -1

// The pane is a 1998 fan page devoted to the dinosaur: a star-tiled ground,
// a block-letter banner, the game in a centred table, marching dividers, and
// a hit counter. The inks are the web-safe ones such a page used. Every cell
// is a fixed-width Box with a background and at most two ASCII characters,
// so the terminal and the Desktop app draw the same picture.
const INK = {
  ground: '#000033', star: '#8800ff', starBright: '#ffea00', banner: '#ff66cc', bannerDark: '#cc33aa',
  text: '#ffff66', link: '#66ffff', border: '#66ffff', box: '#000066', white: '#ffffff', muted: '#cc99ff', cell: '#000000',
  dino: '#00ff99', dead: '#ff3366', cactus: '#ff9933', dirt: '#333366', dirtLit: '#9999cc', divA: '#ff66cc', divB: '#66ffff',
}
// DINO in block letters: an X is a lit cell.
const BANNER = [
  'XX. XXX X..X .XX.',
  'X.X .X. XX.X X..X',
  'X.X .X. X.XX X..X',
  'X.X .X. X..X X..X',
  'XX. XXX X..X .XX.',
]
// The seamless tiles: the stars behind the page and the grain of the ground.
const STAR_TILE = ['.', '', '', '*', '', '', '+', '', '.', '', '', '', '*', '']
const GROUND_TILE = ['-', '', '.', '', '-', '', '', '.']

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
    const placed = await $.ui.open({ id: PANE, title: 'Dino', focus: true, closeOnEscape: true, rows: 32 })
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
    // A landing kicks up dust for one drawing: the last drawing was the end
    // of the arc, and this one is on the ground.
    const landed = lastJump === ARC.length - 1 && g.jump < 0 && !g.over
    lastJump = g.jump
    // Every cell is two columns wide where the pane has room, one otherwise;
    // the table and the banner stay centred either way.
    const cw = columns >= 62 ? 2 : 1
    const running = !g.paused && !g.over
    const blink = g.score % 2 === 0
    // The star tiles drift a cell every four steps.
    const phase = Math.floor(g.score / 4)

    const status = g.over ? { text: 'Game over at ' + g.score + (g.record ? ', a new best. ' : '. ') + 'Press n for a new game.', color: INK.dead, bold: true }
      : g.score === 0 && g.jump < 0 ? { text: 'Press w to jump. The first jump starts the run.', color: INK.link }
      : g.paused ? { text: 'Paused. Press p, or w, to go on.', color: INK.text }
      : ahead && ahead.tall ? { text: 'A tall cactus ahead: jump at the last moment to clear it.', color: INK.text }
      : { text: 'Jump the cacti. The ground gets faster as you go.', color: INK.link }

    // One cell of the picture: a fixed-width Box with a background and at
    // most two ASCII characters, never a leading space, so the Desktop and a
    // terminal draw it the same.
    const cell = (glyph: string, backgroundColor: string, color: string, bold = false) =>
      Box({ width: cw, flexShrink: 0, backgroundColor, children: [Text({ color, bold, children: [glyph.slice(0, cw) || ' '] })] })
    const row = (children, backgroundColor?: string) => Box({ flexDirection: 'row', flexShrink: 0, backgroundColor, children })

    // The star tile behind everything, shifting a cell every few steps.
    const stars = (phase: number) => row(Array.from({ length: COLS }, (_, c) => {
      const s = STAR_TILE[(c + phase) % STAR_TILE.length]
      return cell(s || ' ', INK.ground, s === '*' ? INK.starBright : INK.star)
    }), INK.ground)
    // A divider that marches with the clock.
    const divider = (phase: number) => row(Array.from({ length: COLS }, (_, c) => cell(cw === 2 ? '~-' : '~', INK.ground, (c + phase) % 2 ? INK.divA : INK.divB)), INK.ground)

    // The banner: DINO in block letters, drawn from the tile rows.
    const banner = Box({ flexDirection: 'column', alignItems: 'center', children: BANNER.map((line, i) => row([...line].map((ch, c) =>
      cell(' ', ch === 'X' ? (i === BANNER.length - 1 ? INK.bannerDark : INK.banner) : INK.ground, INK.ground)), INK.ground)) })
    const tagline = Text({ color: INK.text, children: ['*~* the dinosaur runner shrine *~*'] })

    // The table the game sits in: a header cell with the score and the speed
    // meter, six lane rows (two per height), and the ground.
    const toRamp = g.speed > MIN_SPEED ? Math.floor((g.score % RAMP) / (RAMP / 10)) : 10
    const meter = row(Array.from({ length: 10 }, (_, i) => Box({ width: 1, flexShrink: 0, backgroundColor: i < toRamp ? INK.link : INK.dirt, children: [Text({ children: [' '] })] })))
    const header = Box({ flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, alignItems: 'center', paddingX: 1, backgroundColor: INK.box, children: [
      Text({ color: INK.text, bold: true, children: ['SCORE'] }),
      Text({ color: INK.white, bold: true, children: [pad(g.score)] }),
      Text({ color: INK.text, children: ['HI ' + pad(g.stats.best) + ' · ' + g.speed + ' ms'] }),
      meter,
    ] })

    const cacti = new Map<number, number>()
    for (const o of g.obstacles) cacti.set(o.col, Math.max(cacti.get(o.col) ?? 0, heightOf(o)))
    const dinoBg = g.over ? INK.dead : INK.dino
    const legs = g.jump >= 0 ? (cw === 2 ? '\\/' : 'v') : running && g.score % 2 ? (cw === 2 ? '/\\' : '^') : (cw === 2 ? '|\\' : '|')
    const laneCell = (y: number, c: number) => {
      const h = 2 - Math.floor(y / 2)
      const top = y % 2 === 0
      if (c === DINO_COL && h === g.height) return cell(top ? (cw === 2 ? 'o>' : 'o') : legs, dinoBg, INK.cell, true)
      const cactus = cacti.get(c) ?? 0
      if (cactus > h) return cell(top && cactus === h + 1 ? (cw === 2 ? '/\\' : '^') : (cw === 2 ? '||' : '|'), INK.cactus, INK.cell)
      // The tail trails one column behind, on the lower row of the dinosaur's band.
      if (c === DINO_COL - 1 && h === g.height && !top) return cell(cw === 2 ? '<=' : '<', dinoBg, INK.cell, true)
      if (landed && c === DINO_COL - 1 && y === 5) return cell(cw === 2 ? '.:' : '.', INK.cell, INK.dirtLit)
      // Far stars along the top row, which nothing but the top of a jump reaches.
      if (y === 0) {
        const s = STAR_TILE[(c + phase) % STAR_TILE.length]
        if (s && s !== '*') return cell(s, INK.cell, INK.star)
      }
      return cell(' ', INK.cell, INK.cell)
    }
    const lane = Array.from({ length: 6 }, (_, y) => row(Array.from({ length: COLS }, (_, c) => laneCell(y, c)), INK.cell))
    const ground = row(Array.from({ length: COLS }, (_, c) => {
      const s = GROUND_TILE[(c + g.score) % GROUND_TILE.length]
      return cell(s || ' ', INK.dirt, INK.dirtLit)
    }), INK.dirt)
    const table = Box({ flexDirection: 'column', alignSelf: 'center', borderStyle: 'double', borderColor: g.over ? INK.dead : INK.border, backgroundColor: INK.cell, children: [header, ...lane, ground] })

    // The update notice under the table: the status, and a blinking record.
    const notice = Box({ flexDirection: 'row', flexWrap: 'wrap', columnGap: 1, justifyContent: 'center', width: COLS * cw + 2, paddingX: 1, children: [
      ...(g.record && (g.over || blink) ? [Text({ color: INK.banner, bold: true, children: ['*NEW HIGH SCORE*'] })] : []),
      Text({ color: status.color, bold: status.bold, wrap: 'wrap', children: [status.text] }),
    ] })

    // The controls, as the shrine's section links. The Desktop draws each
    // hotkey as a badge of its own, so the brackets stay in the terminal.
    const bracket = (s: string) => (e.surface === 'desktop' ? Text({ color: INK.link, children: ['|'] }) : Text({ color: INK.link, children: [s] }))
    const controls = Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', justifyContent: 'center', children: [
      bracket('['),
      Button({ key: 'w', label: 'Jump', hotkey: 'w', plain: true, onPress: async () => {
        const updated = await change($, jump)
        if (updated.over) {
          $.ui.toast('The game is over. Press n for a new one.')
          return
        }
        if (!timer) startTimer($, updated)
      } }),
      bracket('] ['),
      Button({ key: 'pause', label: g.paused ? 'Resume' : 'Pause', hotkey: 'p', plain: true, dimColor: true, onPress: async () => {
        const cur = await read($, game)
        if (cur.over) {
          $.ui.toast('The game is over. Press n for a new one.')
          return
        }
        await pause($, !cur.paused)
      } }),
      bracket(']'),
    ] })

    // The hit counter, every digit in its own box, and the best run.
    const digits = (s: string) => Box({ flexDirection: 'row', flexShrink: 0, columnGap: cw === 2 ? 0 : 1, children: [...s].map((d) => Box({ width: cw === 2 ? 3 : 1, flexShrink: 0, justifyContent: 'center', backgroundColor: INK.box, children: [Text({ color: INK.text, bold: true, children: [d] })] })) })
    const counter = Box({ flexDirection: 'column', alignItems: 'center', children: [
      Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [Text({ color: INK.white, children: ['You are visitor No.'] }), digits(String(g.stats.games).padStart(6, '0'))] }),
      Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [Text({ color: INK.white, children: ['Best run'] }), digits(pad(g.stats.best)), Text({ color: INK.muted, children: ['steps'] })] }),
    ] })

    const howTo = Box({ flexDirection: 'column', paddingX: 1, children: [
      Text({ bold: true, color: INK.banner, children: ['How to play'] }),
      Text({ color: INK.white, wrap: 'wrap', children: ['1. Press w to jump. The lane starts scrolling, and cacti come at you from the right.'] }),
      Text({ color: INK.white, wrap: 'wrap', children: ['2. A small cactus is one cell high and a tall one is two: the tall ones only clear at the top of a jump, so jump late.'] }),
      Text({ color: INK.white, wrap: 'wrap', children: ['3. Every 100 points the ground gets faster. Hitting a cactus ends the run. p pauses.'] }),
      Text({ color: INK.muted, wrap: 'wrap', children: ['Keys need the pane focused: click it if nothing happens. h hides this.'] }),
    ] })

    const footer = Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', justifyContent: 'center', children: [
      bracket('['),
      Button({ key: 'new', label: 'New game', hotkey: 'n', plain: true, dimColor: true, onPress: () => startNew($) }),
      bracket('] ['),
      Button({ key: 'help', label: showHelp ? 'Hide help' : 'Help', hotkey: 'h', plain: true, dimColor: true, onPress: () => {
        help = !showHelp
        $.ui.invalidate('ui.render')
      } }),
      bracket(']'),
      Text({ color: INK.muted, children: ['Esc closes and pauses'] }),
    ] })

    const sections = [stars(phase), banner, tagline, divider(g.score), table, notice, divider(g.score + 1), controls, divider(g.score), counter, stars(phase + 5), footer]
    if (showHelp) sections.push(divider(g.score + 1), howTo)
    sections.push(stars(phase + 3))
    return Box({ flexDirection: 'column', alignItems: 'center', backgroundColor: INK.ground, children: sections })
  })
}
