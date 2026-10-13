// connect-four: Connect Four against Claude, in a pane.
//
//   /connect-four                open the game
//   /connect-four new            start a new game
//   /connect-four level hard     easy, normal (default), or hard (seven-move lookahead)
//   /connect-four as o           play O instead of X (starts a new game)
//   /connect-four stats          games, wins, losses, draws
//
// In the pane: press a column's digit, or Tab or click to it and press Enter,
// and your disc drops to the lowest free cell. Claude answers half a second
// later. n starts a new game, u takes your last move back, s swaps your side,
// l cycles the level, h shows the how-to. Claude's moves come from the rules
// in game.ts: nothing here calls a model, reads what Claude is doing, or
// leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Game, Level, Mark, Stats } from '../types'
import { COLS, DEFAULT_LEVEL, LEVELS, ROWS, at, claudeMark, claudeMove, drop, isGame, isLevel, newGame, nextStarter, undo } from './game'

const PANE = 'connect-four'
const THINK_MS = 500
const EMPTY_STATS: Stats = { games: 0, wins: 0, losses: 0, draws: 0 }
const EMPTY: Game = { seed: 0, cells: new Array(COLS * ROWS).fill(null), you: 'X', turn: 'X', moves: [], winner: null, winningLine: null, level: DEFAULT_LEVEL, starter: 'you', stats: EMPTY_STATS }
const game = atom({ plugin: 'connect-four', key: 'game' } as const, EMPTY)

// Claude's pending reply, while the pane is open. Dies with the module on reload.
let thinking: { cancel: () => void } | null = null
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

// Apply a change through update's read-modify-write, so Claude's reply and a
// press landing together never overwrite each other, then mirror it to the store.
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
    if (!cur.seed) await update($, game, () => newGame(Date.now(), EMPTY_STATS, DEFAULT_LEVEL, 'X', 'you'))
    $.ui.log('connect-four could not read its saved game; playing without saving')
    return
  }
  const fresh = newGame(await $.clock.now(), EMPTY_STATS, DEFAULT_LEVEL, 'X', 'you')
  await update($, game, () => fresh)
  await save($, fresh)
}

function stopThinking() {
  if (thinking) thinking.cancel()
  thinking = null
}

function isClaudesTurn(g: Game): boolean {
  return !g.winner && g.seed !== 0 && g.turn === claudeMark(g)
}

function endToast($, g: Game) {
  if (g.winner === 'you') $.ui.toast('You win! New game: n', { timeoutMs: 5000 })
  else if (g.winner === 'claude') $.ui.toast('Claude wins. New game: n', { timeoutMs: 5000 })
  else if (g.winner === 'draw') $.ui.toast("A draw. New game: n", { timeoutMs: 5000 })
}

// Claude replies after a short pause, if it is still Claude's move by then.
function scheduleClaude($, g: Game) {
  stopThinking()
  if (!isClaudesTurn(g)) return
  thinking = $.clock.after(THINK_MS, async () => {
    thinking = null
    try {
      const after = await change($, (cur) => {
        if (!isClaudesTurn(cur)) return cur
        return drop(cur, claudeMove(cur), cur.turn).game
      })
      if (after.winner) endToast($, after)
    } catch {
      // A failed reply is skipped; the next press or open tries again.
    }
  })
}

async function startNew($, patch: Partial<Pick<Game, 'you' | 'level'>> = {}) {
  stopThinking()
  const now = await $.clock.now()
  const g = await change($, (cur) => {
    const you = patch.you ?? cur.you
    const level = patch.level ?? cur.level
    const starter = cur.seed ? nextStarter(cur) : 'you'
    return newGame(now, cur.stats, level, you, starter)
  })
  return g
}

function summary(g: Game): string {
  if (!g.seed) return 'No game yet.'
  const state = g.winner === 'you' ? 'You won.' : g.winner === 'claude' ? 'Claude won.' : g.winner === 'draw' ? 'A draw.' : g.turn === g.you ? 'Your move.' : "Claude's move."
  const row = (r: number) => Array.from({ length: COLS }, (_, c) => g.cells[at(r, c)] ?? '.').join('')
  return 'Connect Four: ' + Array.from({ length: ROWS }, (_, r) => row(r)).join(' / ') + '. You are ' + g.you + ', level ' + g.level + ', ' + g.moves.length + ' moves. ' + state + ' /connect-four opens the pane.'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    help = null
    try {
      await load($)
    } catch (error) {
      $.ui.log('connect-four could not load its game: ' + error)
    }
    try {
      await $.command.register({ name: 'connect-four', description: 'Play Connect Four against Claude', argumentHint: '[new | level easy|normal|hard | as x|o | stats]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /connect-four: ' + error)
    }
    return next(e)
  })

  // /clear and /resume reset $.state; the game lives on in the store.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await load($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'connect-four' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (args === 'new') {
      const g = await startNew($)
      scheduleClaude($, g)
      return { text: 'New game. ' + summary(g) }
    }
    const level = /^level\s+(\w+)$/.exec(args)
    if (level) {
      if (!isLevel(level[1])) return { text: 'Levels: easy, normal, hard.' }
      const g = await change($, (cur) => ({ ...cur, level: level[1] as Level }))
      return { text: 'Level ' + g.level + (g.level === 'hard' ? ': Claude looks seven moves ahead.' : '.') }
    }
    const side = /^as\s+([xo])$/.exec(args)
    if (side) {
      const you = side[1].toUpperCase() as Mark
      const g = await startNew($, { you })
      scheduleClaude($, g)
      return { text: 'You are ' + you + '. New game. ' + summary(g) }
    }
    if (args === 'stats') {
      const s = (await read($, game)).stats
      return { text: 'Games ' + s.games + ' · you ' + s.wins + ' · Claude ' + s.losses + ' · draws ' + s.draws }
    }
    if (args) return { text: 'Usage: /connect-four, /connect-four new, /connect-four level easy|normal|hard, /connect-four as x|o, or /connect-four stats' }
    // Under claude -p nothing draws, and ui.open still reports the pane as placed:
    // the surfaces list is the reliable sign.
    let surfaces = []
    try {
      surfaces = await $.session.surfaces()
    } catch {
      surfaces = []
    }
    if (!surfaces.length) return { text: summary(await read($, game)) }
    const placed = await $.ui.open({ id: PANE, title: 'Connect Four', focus: true, closeOnEscape: true, rows: 26 })
    if (!placed.isPlaced) return { text: summary(await read($, game)) }
    scheduleClaude($, await read($, game))
    return {}
  }).catch(async () => ({ text: 'connect-four: the command failed.' }))

  // Closing the pane stops a pending reply; opening it again schedules one.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopThinking()
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const g = await read($, game)
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!g.seed) return Text({ children: ['No game loaded. /connect-four new starts one.'] })
    const columns = e.props.bodyColumns || 60
    const wide = columns >= 50
    const me = claudeMark(g)
    const yourTurn = !g.winner && g.turn === g.you
    const last = g.moves.length ? g.moves[g.moves.length - 1] : -1
    const showHelp = help ?? (wide && g.moves.length === 0)

    const status = g.winner === 'you' ? { text: 'You win! Press n for a new game.', color: 'success', bold: true }
      : g.winner === 'claude' ? { text: 'Claude wins. Press n for a new game.', color: 'error', bold: true }
      : g.winner === 'draw' ? { text: 'A draw. Press n for a new game.', color: 'warning', bold: true }
      : !yourTurn ? { text: 'Claude is thinking…', color: 'claude' }
      : g.moves.length === 0 ? { text: 'Your move: press a column\'s digit, or click it.', color: 'suggestion' }
      : last >= 0 && g.moves.length % 2 === (g.starter === 'claude' ? 1 : 0) ? { text: 'Claude dropped in column ' + (last + 1) + '. Your move.', color: 'suggestion' }
      : { text: 'Your move.', color: 'suggestion' }

    const header = Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
        Text({ bold: true, children: ['CONNECT FOUR'] }),
        Text({ children: ['you ', Text({ bold: true, color: 'success', children: [g.you] }), ' · Claude ', Text({ bold: true, color: 'claude', children: [me] })] }),
        Text({ children: ['level ' + g.level] }),
        Text({ dimColor: true, children: ['you ' + g.stats.wins + ' · Claude ' + g.stats.losses + ' · draws ' + g.stats.draws] }),
      ] }),
      Text({ color: status.color, bold: status.bold, wrap: 'wrap', children: [status.text] }),
      ...(g.level === 'hard' && !g.winner ? [Text({ dimColor: true, children: ['Claude looks seven moves ahead on hard.'] })] : []),
    ] })

    // A row of drop buttons, one per column, over the discs. Every cell is a
    // fixed-width Box so the grid lines up on any surface; color says whose disc
    // it is. A column's digit is its hotkey; the desktop draws a hotkey as a key
    // badge beside the label, so there the label is left blank.
    const desktop = e.surface === 'desktop'
    // A terminal draws a Button as `[ 1 ]`, five columns, so its cells are five
    // wide with no gap; the desktop draws a compact key badge in four plus a gap.
    const cellWidth = desktop ? 4 : 5
    const gap = desktop ? 1 : 0
    const landed = last >= 0 ? (() => {
      // The cell the last disc landed in: the highest filled cell of its column.
      for (let r = 0; r < ROWS; r++) if (g.cells[at(r, last)]) return at(r, last)
      return -1
    })() : -1
    const dropButton = (c: number) => {
      const full = g.cells[at(0, c)] !== null
      return Box({ width: cellWidth, justifyContent: 'center', children: [
        Button({ key: 'col-' + c, label: desktop ? ' ' : String(c + 1), hotkey: full ? undefined : String(c + 1), dimColor: full, onPress: async () => {
          let error: string | undefined
          const after = await change($, (cur) => {
            const r = drop(cur, c, cur.you)
            error = r.error
            return r.game
          })
          if (error) {
            $.ui.toast(error)
            return
          }
          if (after.winner) endToast($, after)
          else scheduleClaude($, after)
        } }),
      ] })
    }
    const cell = (r: number, c: number) => {
      const i = at(r, c)
      const m = g.cells[i]
      const lit = g.winningLine?.includes(i)
      const backgroundColor = lit ? 'suggestion' : m === g.you ? 'success' : m ? 'claude' : undefined
      return Box({ width: cellWidth, justifyContent: 'center', backgroundColor, children: [Text({ bold: i === landed || !!lit, color: m ? 'inverseText' : undefined, dimColor: !m, children: [m ?? '.'] })] })
    }
    const grid = Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: gap, children: Array.from({ length: COLS }, (_, c) => dropButton(c)) }),
      ...Array.from({ length: ROWS }, (_, r) => Box({ flexDirection: 'row', columnGap: gap, children: Array.from({ length: COLS }, (_, c) => cell(r, c)) })),
    ] })

    const howTo = Box({ flexDirection: 'column', borderStyle: 'round', borderColor: 'suggestion', paddingX: 1, children: [
      Text({ bold: true, children: ['How to play'] }),
      Text({ wrap: 'wrap', children: ['1. Press a column\'s digit, 1 to 7, or click it: your disc drops to the lowest free cell. You are ' + g.you + '.'] }),
      Text({ wrap: 'wrap', children: ['2. Claude answers after a moment. Four in a row, column, or diagonal wins.'] }),
      Text({ wrap: 'wrap', children: ['3. u takes your last move back, s swaps sides, l changes the level (easy, normal, hard).'] }),
      Text({ dimColor: true, wrap: 'wrap', children: ['Keys need the pane focused: click it if nothing happens. h hides this.'] }),
    ] })

    const footer = Box({ flexDirection: 'row', columnGap: 3, flexWrap: 'wrap', children: [
      Button({ key: 'new', label: 'New game', hotkey: 'n', plain: true, onPress: async () => scheduleClaude($, await startNew($)) }),
      Button({ key: 'undo', label: 'Undo', hotkey: 'u', plain: true, onPress: async () => {
        stopThinking()
        let error: string | undefined
        const after = await change($, (cur) => {
          const r = undo(cur)
          error = r.error
          return r.game
        })
        if (error) {
          $.ui.toast(error)
          // Nothing was taken back: if Claude was about to move, it still is.
          scheduleClaude($, after)
        }
      } }),
      Button({ key: 'swap', label: 'Play ' + me, hotkey: 's', plain: true, onPress: async () => scheduleClaude($, await startNew($, { you: me })) }),
      Button({ key: 'level', label: 'Level: ' + g.level, hotkey: 'l', plain: true, onPress: async () => {
        await change($, (cur) => ({ ...cur, level: LEVELS[(LEVELS.indexOf(cur.level) + 1) % LEVELS.length] }))
      } }),
      Button({ key: 'help', label: showHelp ? 'Hide help' : 'Help', hotkey: 'h', plain: true, dimColor: true, onPress: () => {
        help = !showHelp
        $.ui.invalidate('ui.render')
      } }),
      Text({ dimColor: true, children: ['Esc closes'] }),
    ] })

    return Box({ flexDirection: 'column', rowGap: 1, children: showHelp ? [header, grid, howTo, footer] : [header, grid, footer] })
  })
}
