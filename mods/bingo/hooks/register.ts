// bingo: classic 75-ball bingo, you against Claude.
//
//   /bingo            open the game in a pane
//   /bingo new        start a new game
//   /bingo speed 5    call a number every 5 seconds when Auto is on (default 8)
//   /bingo stats      games, wins, losses
//
// In the pane: c calls the next number, a toggles Auto, b shouts Bingo, n starts
// a new game. Tab or click to a cell on your card and press Enter to mark it;
// only a called number can be marked. Claude marks its own card as numbers are
// called, and when it completes a line it claims at the NEXT call, so you have
// until then to shout first. Nothing here calls a model, reads what Claude is
// doing, or leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Game, Stats } from '../types'
import { DEFAULT_SPEED, FREE, LETTERS, callLabel, callNumber, claim, claudeLines, claudeMarked, isGame, newGame, toggleMark, yourLines } from './game'

const PANE = 'bingo'
const EMPTY_STATS: Stats = { games: 0, wins: 0, losses: 0 }
const EMPTY: Game = { seed: 0, you: [], claude: [], called: [], yourMarks: [FREE], claudeLine: null, winner: null, winningLine: null, auto: false, speed: DEFAULT_SPEED, stats: EMPTY_STATS }
const game = atom({ plugin: 'bingo', key: 'game' } as const, EMPTY)

// The Auto caller, while the pane is open. Dies with the module on reload.
let timer: { cancel: () => void } | null = null

async function save($, g: Game) {
  try {
    await $.store.set('game', g)
  } catch {
    // The drawing still updates; the store catches up on the next change.
  }
}

async function set($, g: Game) {
  await update($, game, () => g)
  await save($, g)
}

async function load($) {
  let g: Game | null = null
  try {
    const saved = await $.store.get('game')
    if (isGame(saved)) g = saved
  } catch {
    g = null
  }
  if (!g) {
    g = newGame(await $.clock.now(), EMPTY_STATS, DEFAULT_SPEED, false)
    g = { ...g, stats: { ...g.stats, games: 1 } }
    await save($, g)
  }
  await update($, game, () => g!)
}

async function startNew($) {
  const g = await read($, game)
  const fresh = newGame(await $.clock.now(), { ...g.stats, games: g.stats.games + 1 }, g.speed, g.auto)
  await set($, fresh)
  return fresh
}

function stopAuto() {
  if (timer) timer.cancel()
  timer = null
}

async function call($) {
  const g = await read($, game)
  if (g.winner || !g.you.length) return
  const next = callNumber(g)
  await set($, next)
  if (next.winner === 'claude') {
    stopAuto()
    $.ui.toast('Claude: BINGO! ' + next.winningLine + '. New game: n', { timeoutMs: 6000 })
  } else if (next.claudeLine && !g.claudeLine) {
    $.ui.toast('Claude has ' + next.claudeLine + '. Shout before the next call!', { timeoutMs: 5000 })
  }
}

async function startAuto($) {
  stopAuto()
  const g = await read($, game)
  if (g.winner) return
  timer = $.clock.every(Math.max(1, g.speed) * 1000, () => call($))
}

function summary(g: Game): string {
  if (!g.you.length) return 'No game yet.'
  const last = g.called.length ? callLabel(g.called[g.called.length - 1]) : 'none'
  const state = g.winner === 'you' ? 'You won with ' + g.winningLine + '.' : g.winner === 'claude' ? 'Claude won with ' + g.winningLine + '.' : g.claudeLine ? 'Claude has ' + g.claudeLine + '; shout first!' : 'In play.'
  return 'Bingo: ' + g.called.length + '/75 called, last ' + last + '. ' + state + ' /bingo opens the pane.'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
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
      stopAuto()
      const g = await startNew($)
      return { text: 'New game. ' + summary(g) }
    }
    const speed = /^speed\s+(\d+)$/.exec(args)
    if (speed) {
      const s = Math.max(1, Math.min(120, Number(speed[1])))
      const g = await read($, game)
      await set($, { ...g, speed: s })
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
    const placed = await $.ui.open({ id: PANE, title: 'Bingo', focus: true, closeOnEscape: true, rows: 26 })
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
    const last = g.called.length ? callLabel(g.called[g.called.length - 1]) : '—'
    const recent = g.called.slice(-8).map(callLabel).join('  ')

    const status = g.winner === 'you' ? { text: 'BINGO! You won with ' + g.winningLine + '.', color: 'green' }
      : g.winner === 'claude' ? { text: 'Claude won with ' + g.winningLine + '. Press n for a new game.', color: 'red' }
      : g.claudeLine ? { text: 'Claude has ' + g.claudeLine + ' and claims at the next call. Shout first: b', color: 'yellow' }
      : { text: 'Mark called numbers on your card, then press b when you have a line.', dim: true }

    const header = Box({
      flexDirection: 'column',
      children: [
        Box({ flexDirection: 'row', columnGap: 2, children: [Text({ bold: true, children: ['BINGO'] }), Text({ dimColor: true, children: ['you vs Claude'] }), Text({ children: ['called ' + g.called.length + '/75'] }), Text({ bold: true, color: 'cyan', children: ['last ' + last] })] }),
        Text({ dimColor: true, children: [recent ? 'recent: ' + recent : 'no numbers called yet'] }),
        Text({ color: status.color, dimColor: status.dim, children: [status.text] }),
      ],
    })

    const letters = Box({ flexDirection: 'row', columnGap: 1, children: LETTERS.map((l) => Text({ bold: true, children: [' ' + l + ' '] })) })
    const yourRows = [0, 1, 2, 3, 4].map((r) =>
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [0, 1, 2, 3, 4].map((c) => {
          const pos = r * 5 + c
          const n = g.you[pos]
          const marked = g.yourMarks.includes(pos)
          const calledNum = pos === FREE || g.called.includes(n)
          const label = pos === FREE ? '★' : String(n).padStart(2)
          return Button({ key: 'cell-' + pos, label: (marked ? '✔' : ' ') + label, plain: true, dimColor: !calledNum, variant: marked ? 'primary' : 'secondary', onPress: async () => {
            const r = toggleMark(await read($, game), pos)
            if (r.error) $.ui.toast(r.error)
            else await set($, r.game)
          } })
        }),
      }),
    )
    const yourCard = Box({ flexDirection: 'column', children: [Text({ bold: true, children: ['Your card'] }), letters, ...yourRows] })

    const claudeRows = [0, 1, 2, 3, 4].map((r) =>
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [0, 1, 2, 3, 4].map((c) => {
          const pos = r * 5 + c
          const done = claudeMarked(g, pos)
          return Text({ inverse: done, dimColor: !done, children: [pos === FREE ? ' ★ ' : ' ' + String(g.claude[pos]).padStart(2) + ' '] })
        }),
      }),
    )
    const claudeCard = Box({ flexDirection: 'column', children: [Text({ bold: true, children: ['Claude\'s card'] }), letters, ...claudeRows] })

    const cards = wide ? Box({ flexDirection: 'row', columnGap: 4, children: [yourCard, claudeCard] }) : Box({ flexDirection: 'column', rowGap: 1, children: [yourCard, claudeCard] })

    const footer = Box({
      flexDirection: 'row',
      columnGap: 3,
      children: [
        Button({ key: 'call', label: 'Call', hotkey: 'c', plain: true, onPress: () => call($) }),
        Button({ key: 'auto', label: g.auto ? 'Auto on' : 'Auto off', hotkey: 'a', plain: true, onPress: async () => {
          const cur = await read($, game)
          await set($, { ...cur, auto: !cur.auto })
          if (!cur.auto) await startAuto($)
          else stopAuto()
        } }),
        Button({ key: 'claim', label: 'Bingo!', hotkey: 'b', plain: true, variant: 'primary', onPress: async () => {
          const r = claim(await read($, game))
          if (r.error) $.ui.toast(r.error)
          else {
            stopAuto()
            await set($, r.game)
            $.ui.toast('BINGO! You won with ' + r.game.winningLine + '.', { timeoutMs: 6000 })
          }
        } }),
        Button({ key: 'new', label: 'New game', hotkey: 'n', plain: true, onPress: async () => {
          stopAuto()
          const fresh = await startNew($)
          if (fresh.auto) await startAuto($)
        } }),
        Text({ dimColor: true, children: ['Esc closes · ' + g.stats.wins + '-' + g.stats.losses] }),
      ],
    })

    return Box({ flexDirection: 'column', rowGap: 1, children: [header, cards, footer] })
  })
}
