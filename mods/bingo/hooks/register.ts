// bingo: classic 75-ball bingo, you against Claude.
//
//   /bingo            open the game in a pane
//   /bingo new        start a new game
//   /bingo speed 5    call a number every 5 seconds when Auto is on (default 8)
//   /bingo stats      games, wins, losses
//
// In the pane: c calls the next number, a toggles Auto, b shouts Bingo, n starts
// a new game, h shows or hides the how-to. Tab or click to a cell on your card
// and press Enter to mark it; only a called number can be marked, and a called
// number you haven't marked yet is lit so you can find it. Claude marks its own card as numbers are
// called, and when it completes a line it claims at the NEXT call, so you have
// until then to shout first. Nothing here calls a model, reads what Claude is
// doing, or leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Game, Stats } from '../types'
import { DEFAULT_SPEED, FREE, LETTERS, callLabel, callNumber, claim, claudeMarked, isGame, lineCells, newGame, toggleMark, yourLines } from './game'

const PANE = 'bingo'
const EMPTY_STATS: Stats = { games: 0, wins: 0, losses: 0 }
const EMPTY: Game = { seed: 0, you: [], claude: [], called: [], yourMarks: [FREE], claudeLine: null, winner: null, winningLine: null, auto: false, speed: DEFAULT_SPEED, stats: EMPTY_STATS }
const game = atom({ plugin: 'bingo', key: 'game' } as const, EMPTY)

// The Auto caller, while the pane is open. Dies with the module on reload.
let timer: { cancel: () => void } | null = null

// The how-to block: shown until the first call unless h has set it either way.
let help: boolean | null = null

async function save($, g: Game) {
  try {
    await $.store.set('game', g)
  } catch {
    // The drawing still updates; the store catches up on the next change.
  }
}

// Apply a change through update's read-modify-write, so a timer tick and a
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
  if (isGame(saved)) {
    await update($, game, () => saved as Game)
    return
  }
  if (!readable) {
    // The store can't be read: keep whatever is in memory, or start a game in
    // memory only, and never write over the saved record.
    const cur = await read($, game)
    if (!cur.you.length) await update($, game, () => newGame(Date.now(), EMPTY_STATS, DEFAULT_SPEED, false))
    $.ui.log('bingo could not read its saved game; playing without saving')
    return
  }
  const fresh = newGame(await $.clock.now(), { ...EMPTY_STATS, games: 1 }, DEFAULT_SPEED, false)
  await update($, game, () => fresh)
  await save($, fresh)
}

async function startNew($) {
  stopAuto()
  help = null
  const now = await $.clock.now()
  return change($, (g) => newGame(now, { ...g.stats, games: g.stats.games + 1 }, g.speed, false))
}

function stopAuto() {
  if (timer) timer.cancel()
  timer = null
}

async function call($) {
  let before: Game | null = null
  const next = await change($, (g) => {
    before = g
    if (g.winner || !g.you.length) return g
    const n = callNumber(g)
    return n.winner ? { ...n, auto: false } : n
  })
  const was = before as Game | null
  if (!was || !was.you.length) return
  if (was.winner) {
    stopAuto()
    $.ui.toast('The game is over. Press n for a new game.')
    return
  }
  if (next === was) {
    // Nothing left to call: don't tick forever.
    stopAuto()
    return
  }
  if (next.winner === 'claude') {
    stopAuto()
    $.ui.toast('Claude: BINGO! ' + next.winningLine + '. New game: n', { timeoutMs: 6000 })
  } else if (next.claudeLine && !was.claudeLine) {
    $.ui.toast('Claude has ' + next.claudeLine + '. Shout before the next call!', { timeoutMs: 5000 })
  }
}

async function startAuto($) {
  const g = await read($, game)
  if (g.winner) return
  stopAuto()
  timer = $.clock.every(Math.max(1, g.speed) * 1000, async () => {
    try {
      const cur = await read($, game)
      if (!cur.auto || cur.winner) {
        stopAuto()
        return
      }
      await call($)
    } catch {
      // A failed tick is skipped; the next one tries again.
    }
  })
}

function summary(g: Game): string {
  if (!g.you.length) return 'No game yet.'
  const last = g.called.length ? callLabel(g.called[g.called.length - 1]) : 'none'
  const state = g.winner === 'you' ? 'You won with ' + g.winningLine + '.' : g.winner === 'claude' ? 'Claude won with ' + g.winningLine + '.' : g.claudeLine ? 'Claude has ' + g.claudeLine + '; shout first!' : 'In play.'
  return 'Bingo: ' + g.called.length + '/75 called, last ' + last + '. ' + state + ' /bingo opens the pane.'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    help = null
    try {
      await load($)
    } catch (error) {
      $.ui.log('bingo could not load its game: ' + error)
    }
    try {
      await $.command.register({ name: 'bingo', description: 'Play bingo against Claude', argumentHint: '[new | speed N | stats]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /bingo: ' + error)
    }
    return next(e)
  })

  // /clear and /resume reset $.state; the game lives on in the store.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await load($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'bingo' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'new') {
      const g = await startNew($)
      return { text: 'New game. ' + summary(g) }
    }
    const speed = /^speed\s+(\d+)$/.exec(args)
    if (speed) {
      const s = Math.max(1, Math.min(120, Number(speed[1])))
      await change($, (g) => ({ ...g, speed: s }))
      if (timer) await startAuto($)
      return { text: 'Auto calls a number every ' + s + ' second' + (s === 1 ? '' : 's') + '.' }
    }
    if (args === 'stats') {
      const s = (await read($, game)).stats
      return { text: 'Games ' + s.games + ' · you ' + s.wins + ' · Claude ' + s.losses }
    }
    if (args) return { text: 'Usage: /bingo, /bingo new, /bingo speed N, or /bingo stats' }
    // Under claude -p nothing draws, and ui.open still reports the pane as placed:
    // the surfaces list is the reliable sign.
    let surfaces = []
    try {
      surfaces = await $.session.surfaces()
    } catch {
      surfaces = []
    }
    if (!surfaces.length) return { text: summary(await read($, game)) }
    const placed = await $.ui.open({ id: PANE, title: 'Bingo', focus: true, closeOnEscape: true, rows: 30 })
    if (!placed.isPlaced) return { text: summary(await read($, game)) }
    const g = await read($, game)
    if (g.auto && !g.winner) await startAuto($)
    return {}
  }).catch(async () => ({ text: 'bingo: the command failed.' }))

  // Closing the pane stops the caller.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopAuto()
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const g = await read($, game)
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!g.you.length) return Text({ children: ['No game loaded. /bingo new starts one.'] })
    const columns = e.props.bodyColumns || 60
    const wide = columns >= 60
    const lastNum = g.called.length ? g.called[g.called.length - 1] : 0
    const recent = g.called.slice(-8).map(callLabel).join('  ')
    // The how-to opens with a fresh game where there is room for it.
    const showHelp = help ?? (wide && g.called.length === 0)

    // Called numbers on your card you haven't marked: the thing to do next.
    const toMark = g.you.map((n, pos) => (pos !== FREE && g.called.includes(n) && !g.yourMarks.includes(pos) ? n : 0)).filter(Boolean)
    const yourLine = g.winner ? null : yourLines(g)[0] ?? null
    const litYours = new Set(lineCells(g.winner === 'you' ? g.winningLine : yourLine))
    const litClaude = new Set(lineCells(g.winner === 'claude' ? g.winningLine : g.claudeLine))

    const status = g.winner === 'you' ? { text: 'BINGO! You won with ' + g.winningLine + '. Press n for a new game.', color: 'success', bold: true }
      : g.winner === 'claude' ? { text: 'Claude won with ' + g.winningLine + '. Press n for a new game.', color: 'error', bold: true }
      : yourLine ? { text: 'You have ' + yourLine + '! Press b to shout Bingo' + (g.claudeLine ? ' before the next call.' : '.'), color: 'success', bold: true }
      : g.claudeLine ? { text: 'Claude has ' + g.claudeLine + ' and claims at the next call. Shout first: b', color: 'warning', bold: true }
      : toMark.length ? { text: 'On your card: ' + toMark.map(callLabel).join(', ') + '. Tab or click the lit cell, then Enter to mark it.', color: 'warning' }
      : g.called.length ? { text: 'Nothing new on your card. Press c for the next number.', dim: true }
      : { text: 'Press c to call the first number.', color: 'suggestion' }

    const header = Box({
      flexDirection: 'column',
      children: [
        Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
          Text({ bold: true, children: ['BINGO'] }),
          Text({ dimColor: true, children: ['you vs Claude'] }),
          Text({ children: ['called ' + g.called.length + '/75'] }),
          Text({ bold: true, color: 'inverseText', backgroundColor: 'claude', children: [lastNum ? ' last ' + callLabel(lastNum) + ' ' : ' no call yet '] }),
        ] }),
        Text({ dimColor: true, wrap: 'truncate', children: [recent ? 'recent: ' + recent : 'recent: none'] }),
        Text({ color: status.color, dimColor: status.dim, bold: status.bold, wrap: 'wrap', children: [status.text] }),
      ],
    })

    // Every cell is a fixed-width Box with its content at the right edge, so the
    // columns line up on a surface that collapses spaces or draws a proportional
    // font; nothing is aligned by padding. The center cell reads FREE, four wide.
    const CELL = 4
    const cell = (children, backgroundColor?: string) => Box({ width: CELL, justifyContent: 'flex-end', backgroundColor, children })
    const letters = Box({ flexDirection: 'row', columnGap: 1, children: LETTERS.map((l) => cell([Text({ bold: true, children: [l] })])) })
    const yourRows = [0, 1, 2, 3, 4].map((r) =>
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [0, 1, 2, 3, 4].map((c) => {
          const pos = r * 5 + c
          const n = g.you[pos]
          const marked = g.yourMarks.includes(pos)
          const calledNum = pos === FREE || g.called.includes(n)
          const label = pos === FREE ? 'FREE' : String(n)
          // A completed line: the accent. Marked: green. Called and not yet marked:
          // yellow, the cell to press. Not called: dim. The Button itself takes no
          // color, so the Box behind it carries the state.
          const backgroundColor = litYours.has(pos) ? 'suggestion' : marked ? 'success' : calledNum ? 'warning' : undefined
          const button = Button({ key: 'cell-' + pos, label, plain: true, dimColor: !calledNum, onPress: async () => {
            let error: string | undefined
            await change($, (cur) => {
              const r = toggleMark(cur, pos)
              error = r.error
              return r.game
            })
            if (error) $.ui.toast(error)
          } })
          return cell([button], backgroundColor)
        }),
      }),
    )
    const yourCard = Box({ flexDirection: 'column', children: [Text({ bold: true, color: 'success', children: ['Your card'] }), letters, ...yourRows] })

    const claudeRows = [0, 1, 2, 3, 4].map((r) =>
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [0, 1, 2, 3, 4].map((c) => {
          const pos = r * 5 + c
          const done = claudeMarked(g, pos)
          const lit = litClaude.has(pos)
          return cell([Text({ color: done ? 'inverseText' : undefined, dimColor: !done, bold: lit, children: [pos === FREE ? 'FREE' : String(g.claude[pos])] })], lit ? 'error' : done ? 'claude' : undefined)
        }),
      }),
    )
    const claudeCard = Box({ flexDirection: 'column', children: [Text({ bold: true, color: 'claude', children: ['Claude\'s card'] }), letters, ...claudeRows] })

    const cards = wide ? Box({ flexDirection: 'row', columnGap: 4, children: [yourCard, claudeCard] }) : Box({ flexDirection: 'column', rowGap: 1, children: [yourCard, claudeCard] })

    const legend = Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
      Text({ backgroundColor: 'warning', children: [' 12 '] }),
      Text({ dimColor: true, children: [wide ? 'called, mark it' : 'mark it'] }),
      Text({ backgroundColor: 'success', children: [' 12 '] }),
      Text({ dimColor: true, children: ['marked'] }),
      Text({ backgroundColor: 'suggestion', children: [' 12 '] }),
      Text({ dimColor: true, children: [wide ? 'a full line' : 'line'] }),
      Text({ dimColor: true, children: ['12'] }),
      Text({ dimColor: true, children: ['not called'] }),
    ] })

    const howTo = Box({ flexDirection: 'column', borderStyle: 'round', borderColor: 'suggestion', paddingX: 1, children: [
      Text({ bold: true, children: ['How to play'] }),
      Text({ wrap: 'wrap', children: ['1. Press c to call a number, or a to call one every ' + g.speed + ' seconds.'] }),
      Text({ wrap: 'wrap', children: ['2. A called number on your card lights up yellow: Tab or click it, then Enter to mark it.'] }),
      Text({ wrap: 'wrap', children: ['3. Five in a row, column, or diagonal (FREE counts): press b. Claude claims one call late, so shout first.'] }),
      Text({ dimColor: true, wrap: 'wrap', children: ['Keys need the pane focused: click it if nothing happens. h hides this.'] }),
    ] })

    const footer = Box({
      flexDirection: 'row',
      columnGap: 3,
      flexWrap: 'wrap',
      children: [
        Button({ key: 'call', label: 'Call', hotkey: 'c', plain: true, onPress: () => call($) }),
        Button({ key: 'auto', label: g.auto ? 'Auto on' : 'Auto off', hotkey: 'a', plain: true, onPress: async () => {
          const updated = await change($, (cur) => (cur.winner ? cur : { ...cur, auto: !cur.auto }))
          if (updated.auto) await startAuto($)
          else stopAuto()
        } }),
        Button({ key: 'claim', label: 'Bingo!', hotkey: 'b', plain: true, onPress: async () => {
          let error: string | undefined
          const updated = await change($, (cur) => {
            const r = claim(cur)
            error = r.error
            return r.error ? cur : { ...r.game, auto: false }
          })
          if (error) $.ui.toast(error)
          else {
            stopAuto()
            $.ui.toast('BINGO! You won with ' + updated.winningLine + '.', { timeoutMs: 6000 })
          }
        } }),
        Button({ key: 'new', label: 'New game', hotkey: 'n', plain: true, onPress: () => startNew($) }),
        Button({ key: 'help', label: showHelp ? 'Hide help' : 'Help', hotkey: 'h', plain: true, dimColor: true, onPress: () => {
          help = !showHelp
          $.ui.invalidate('ui.render')
        } }),
        Text({ dimColor: true, children: ['Esc closes · you ' + g.stats.wins + ' · Claude ' + g.stats.losses] }),
      ],
    })

    return Box({ flexDirection: 'column', rowGap: 1, children: showHelp ? [header, cards, legend, howTo, footer] : [header, cards, legend, footer] })
  })
}
