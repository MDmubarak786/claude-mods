// sudoku: a puzzle with one solution, in a pane.
//
//   /sudoku                 open the game
//   /sudoku new             deal a new puzzle at the current level
//   /sudoku level hard      deal a new puzzle at easy, normal (default), or hard
//   /sudoku stats           games, solved, fastest time per level
//
// In the pane: w, a, s and d move the cursor, 1 to 9 write a digit, 0 clears,
// u takes the last entry back, g fills the cursor's cell from the solution,
// l deals at the next level (only while the board is untouched), n deals
// again, h shows the how-to. The clock runs from the first entry to the last
// cell and stops while the pane is closed. Nothing here calls a model, reads
// what Claude is doing, or leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Game, Level, Stats } from '../types'
import { CELLS, DEFAULT_LEVEL, LEVELS, SIZE, at, conflicts, elapsed, filled, formatMs, hint, isGame, isLevel, moveCursor, newGame, pause, setCell, undo, type Dir } from './game'

const PANE = 'sudoku'
const EMPTY_STATS: Stats = { games: 0, solved: 0, bestMs: { easy: 0, normal: 0, hard: 0 } }
const EMPTY: Game = { seed: 0, level: DEFAULT_LEVEL, givens: [], cells: [], solution: [], cursor: 0, moves: [], hints: 0, done: false, elapsedMs: 0, startedAt: null, stats: EMPTY_STATS }
const game = atom({ plugin: 'sudoku', key: 'game' } as const, EMPTY)

// Redraws the running clock once a second while the pane is open and a puzzle is on.
let ticking: { cancel: () => void } | null = null
// The how-to block: shown on an untouched board until h has set it either way for the session.
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
  // The empty default is never written over a saved puzzle.
  if (out && (out as Game).seed) await save($, out)
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
    // The clock waits for the next entry: a stretch cut off by a restart isn't counted.
    await update($, game, () => ({ ...(saved as Game), startedAt: null }))
    return
  }
  if (!readable) {
    const cur = await read($, game)
    if (!cur.seed) await update($, game, () => newGame(Date.now(), { ...EMPTY_STATS, games: 1 }, DEFAULT_LEVEL))
    $.ui.log('sudoku could not read its saved game; playing without saving')
    return
  }
  const fresh = newGame(await $.clock.now(), { ...EMPTY_STATS, games: 1 }, DEFAULT_LEVEL)
  await update($, game, () => fresh)
  await save($, fresh)
}

function stopTicking() {
  if (ticking) ticking.cancel()
  ticking = null
}

// The clock in the header only changes once a second, so a tick asks for a
// redraw rather than changing the game; it stops itself when nothing is running.
function startTicking($) {
  if (ticking) return
  ticking = $.clock.every(1000, async () => {
    try {
      const cur = await read($, game)
      if (cur.done || cur.startedAt === null) {
        stopTicking()
        return
      }
      $.ui.invalidate('ui.render')
    } catch {
      // A missed tick just leaves the clock a second behind.
    }
  })
}

async function startNew($, level?: Level) {
  stopTicking()
  help = null
  const now = await $.clock.now()
  return change($, (cur) => newGame(now, { ...cur.stats, games: cur.stats.games + 1 }, level ?? cur.level))
}

const untouched = (g: Game) => g.moves.length === 0 && g.hints === 0 && !g.done

function summary(g: Game, now: number): string {
  if (!g.seed) return 'No game yet.'
  const time = formatMs(elapsed(g, now))
  const state = g.done ? 'Solved on ' + g.level + ' in ' + time + '.' : filled(g.cells) + '/' + CELLS + ' filled, level ' + g.level + ', ' + time + '.'
  return 'Sudoku: ' + state + ' /sudoku opens the pane.'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    help = null
    try {
      await load($)
    } catch (error) {
      $.ui.log('sudoku could not load its game: ' + error)
    }
    try {
      await $.command.register({ name: 'sudoku', description: 'Play sudoku in a pane', argumentHint: '[new | level easy|normal|hard | stats]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /sudoku: ' + error)
    }
    return next(e)
  })

  // /clear and /resume reset $.state; the game lives on in the store.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    stopTicking()
    await load($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'sudoku' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (args === 'new') return { text: 'New puzzle. ' + summary(await startNew($), await $.clock.now()) }
    const level = /^level\s+(\w+)$/.exec(args)
    if (level) {
      if (!isLevel(level[1])) return { text: 'Levels: easy, normal, hard.' }
      return { text: 'New puzzle. ' + summary(await startNew($, level[1]), await $.clock.now()) }
    }
    if (args === 'stats') {
      const s = (await read($, game)).stats
      const best = LEVELS.map((l) => l + ' ' + (s.bestMs[l] ? formatMs(s.bestMs[l]) : '—')).join(', ')
      return { text: 'Games ' + s.games + ' · solved ' + s.solved + ' · fastest: ' + best }
    }
    if (args) return { text: 'Usage: /sudoku, /sudoku new, /sudoku level easy|normal|hard, or /sudoku stats' }
    // Under claude -p nothing draws, and ui.open still reports the pane as placed:
    // the surfaces list is the reliable sign.
    let surfaces = []
    try {
      surfaces = await $.session.surfaces()
    } catch {
      surfaces = []
    }
    if (!surfaces.length) return { text: summary(await read($, game), await $.clock.now()) }
    const placed = await $.ui.open({ id: PANE, title: 'Sudoku', focus: true, closeOnEscape: true, rows: 30 })
    if (!placed.isPlaced) return { text: summary(await read($, game), await $.clock.now()) }
    // A puzzle paused by closing the pane picks its clock up at the next entry.
    return {}
  }).catch(async () => ({ text: 'sudoku: the command failed.' }))

  // Closing the pane stops the clock.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopTicking()
    const now = await $.clock.now()
    await change($, (cur) => pause(cur, now))
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const g = await read($, game)
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!g.seed) return Text({ children: ['No game loaded. /sudoku new starts one.'] })
    const columns = e.props.bodyColumns || 60
    const wide = columns >= 50
    const desktop = e.surface === 'desktop'
    const showHelp = help ?? (wide && untouched(g))
    const now = await $.clock.now()
    const time = formatMs(elapsed(g, now))
    const clashes = new Set(conflicts(g.cells))
    const count = filled(g.cells)
    const best = g.stats.bestMs[g.level]
    if (!g.done && g.startedAt !== null) startTicking($)

    const status = g.done ? { text: 'Solved in ' + time + (best === g.elapsedMs ? ', your fastest on ' + g.level + '. ' : '. ') + (g.hints ? g.hints + ' hint' + (g.hints === 1 ? '' : 's') + '. ' : '') + 'Press n for a new puzzle.', color: 'success', bold: true }
      : clashes.size ? { text: clashes.size + ' cell' + (clashes.size === 1 ? ' clashes' : 's clash') + ' with another, in red.', color: 'error', bold: true }
      : untouched(g) ? { text: 'Move with w, a, s, d and type a digit. 0 clears a cell.', color: 'suggestion' }
      : { text: count + ' of ' + CELLS + ' filled. u takes an entry back, g fills the cell you are on.', color: 'suggestion' }

    const header = Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
        Text({ bold: true, children: ['SUDOKU'] }),
        Text({ children: ['level ' + g.level] }),
        Text({ children: ['filled ', Text({ bold: true, children: [count + '/' + CELLS] })] }),
        Text({ bold: true, color: g.done ? 'success' : g.startedAt !== null ? 'warning' : undefined, dimColor: g.startedAt === null && !g.done, children: ['time ' + time] }),
        Text({ dimColor: true, children: ['best ' + (best ? formatMs(best) : '—') + (g.hints ? ' · hints ' + g.hints : '') + ' · game ' + g.stats.games] }),
      ] }),
      Text({ color: status.color, bold: status.bold, wrap: 'wrap', children: [status.text] }),
    ] })

    // Every cell is a three-column Box so the grid lines up on any surface;
    // the box lines are a single character wide and the rules between boxes
    // are one string with no spaces. A given is bold, your entry takes the
    // accent color, the cursor sits on yellow, a clash on red, and every cell
    // holding the cursor's digit is marked so the same number is easy to find.
    const same = g.cells[g.cursor]
    const cell = (i: number) => {
      const v = g.cells[i]
      const given = g.givens[i] > 0
      const isCursor = i === g.cursor
      const backgroundColor = g.done ? 'success' : clashes.has(i) ? 'error' : isCursor ? 'warning' : same && v === same ? 'inactive' : undefined
      return Box({ width: 3, justifyContent: 'center', backgroundColor, children: [
        Text({ bold: given || isCursor, color: backgroundColor ? 'inverseText' : given ? undefined : 'suggestion', dimColor: !v && !backgroundColor, children: [v ? String(v) : '.'] }),
      ] })
    }
    const rule = Box({ width: 1, children: [Text({ dimColor: true, children: ['|'] })] })
    const gridRow = (r: number) => {
      const children = []
      for (let c = 0; c < SIZE; c++) {
        children.push(cell(at(r, c)))
        if (c === 2 || c === 5) children.push(rule)
      }
      return Box({ flexDirection: 'row', children })
    }
    const bar = Text({ dimColor: true, children: ['---------+---------+---------'] })
    const rows = []
    for (let r = 0; r < SIZE; r++) {
      rows.push(gridRow(r))
      if (r === 2 || r === 5) rows.push(bar)
    }
    const grid = Box({ flexDirection: 'column', children: rows })

    const enter = async (i: number, v: number) => {
      let error: string | undefined
      const pressedAt = await $.clock.now()
      const after = await change($, (cur) => {
        const r = setCell(cur, i, v, pressedAt)
        error = r.error
        return r.game
      })
      if (error) {
        $.ui.toast(error)
        return
      }
      if (after.done) {
        stopTicking()
        $.ui.toast('Solved in ' + formatMs(after.elapsedMs) + (after.stats.bestMs[after.level] === after.elapsedMs ? ', your fastest on ' + after.level : '') + '!', { timeoutMs: 5000 })
      }
    }
    const moveButton = (key: string, dir: Dir, label: string) =>
      Button({ key, label, hotkey: key, plain: true, onPress: () => change($, (cur) => moveCursor(cur, dir)) })
    // A digit is its own hotkey; the desktop draws a hotkey as a key badge, so
    // the label is blank there and the digit in a terminal.
    const digitButton = (d: number) =>
      Button({ key: 'd' + d, label: desktop ? ' ' : String(d), hotkey: String(d), plain: true, onPress: () => enter(g.cursor, d) })
    const controls = Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
        moveButton('w', 'up', 'Up'),
        moveButton('a', 'left', 'Left'),
        moveButton('s', 'down', 'Down'),
        moveButton('d', 'right', 'Right'),
      ] }),
      Box({ flexDirection: 'row', columnGap: desktop ? 1 : 2, flexWrap: 'wrap', children: [
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digitButton),
        Button({ key: 'd0', label: 'Clear', hotkey: '0', plain: true, onPress: () => enter(g.cursor, 0) }),
      ] }),
    ] })

    const howTo = Box({ flexDirection: 'column', borderStyle: 'round', borderColor: 'suggestion', paddingX: 1, children: [
      Text({ bold: true, children: ['How to play'] }),
      Text({ wrap: 'wrap', children: ['1. Every row, column and 3x3 box must hold 1 to 9 once. The bold digits are given; fill the rest.'] }),
      Text({ wrap: 'wrap', children: ['2. Move the yellow cursor with w, a, s and d, then type a digit. 0 clears a cell. A digit that repeats in its row, column or box turns red.'] }),
      Text({ wrap: 'wrap', children: ['3. u takes the last entry back. g fills the cell you are on when you are stuck. The clock runs from your first entry and pauses while the pane is closed; your fastest time per level is kept.'] }),
      Text({ dimColor: true, wrap: 'wrap', children: ['Keys need the pane focused: click it if nothing happens. h hides this.'] }),
    ] })

    const footer = Box({ flexDirection: 'row', columnGap: 3, flexWrap: 'wrap', children: [
      Button({ key: 'new', label: 'New puzzle', hotkey: 'n', plain: true, onPress: () => startNew($) }),
      Button({ key: 'undo', label: 'Undo', hotkey: 'u', plain: true, onPress: async () => {
        let error: string | undefined
        await change($, (cur) => {
          const r = undo(cur)
          error = r.error
          return r.game
        })
        if (error) $.ui.toast(error)
      } }),
      Button({ key: 'hint', label: 'Hint', hotkey: 'g', plain: true, onPress: async () => {
        let error: string | undefined
        const pressedAt = await $.clock.now()
        const after = await change($, (cur) => {
          const r = hint(cur, pressedAt)
          error = r.error
          return r.game
        })
        if (error) $.ui.toast(error)
        else if (after.done) {
          stopTicking()
          $.ui.toast('Solved in ' + formatMs(after.elapsedMs) + ' with ' + after.hints + ' hint' + (after.hints === 1 ? '' : 's') + '.', { timeoutMs: 5000 })
        }
      } }),
      Button({ key: 'level', label: 'Level: ' + g.level, hotkey: 'l', plain: true, onPress: async () => {
        const cur = await read($, game)
        const nextLevel = LEVELS[(LEVELS.indexOf(cur.level) + 1) % LEVELS.length]
        // A board with entries is never thrown away by one key press.
        if (!untouched(cur)) {
          $.ui.toast('This puzzle has entries. Press n for a fresh one first, or /sudoku level ' + nextLevel + '.')
          return
        }
        await startNew($, nextLevel)
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
